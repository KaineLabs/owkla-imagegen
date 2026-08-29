/**
 * Bulk recipe-image generator + uploader.
 *
 * Flow per recipe (only those where `image_url IS NULL`):
 *   1. Build a food-photography prompt from name + cuisine + meal_type.
 *   2. POST prompt to the LOCAL FLUX.2 klein 9B server at
 *      http://127.0.0.1:7860/generate — returns raw PNG bytes.
 *   3. Upload the PNG to Supabase Storage bucket `recipe-images`.
 *   4. UPDATE recipes.image_url = <public URL>.
 *
 * Idempotent — re-running skips recipes that already have image_url set,
 * so you can Ctrl+C and resume anytime. Failed generations cache locally
 * in .image-cache/ so you can debug without re-running Flux.
 *
 * Speed / quality:
 *   Default: 512×512, 40 steps, fast=false — good quality at ~4× the
 *     speed of 1024². Pass `--size=1024x1024` when you need full-res.
 *   With --fast: uses the distilled path, ~4-8× faster, mediocre quality.
 *     Good for iterating on prompts.
 * Cost: $0 — everything runs locally.
 *
 * Usage:
 *   1. Start the FLUX server first:
 *        cd ~/flux/flux-api && python3 app.py
 *      (Confirm http://127.0.0.1:7860/health returns 200.)
 *   2. Set env vars in .env:
 *        EXPO_PUBLIC_SUPABASE_URL=…      (already set)
 *        SUPABASE_SERVICE_ROLE_KEY=…     (create in Supabase Studio → Settings → API)
 *   3. Create the `recipe-images` bucket in Supabase Storage (public, 5MB max).
 *   4. Run: npx tsx scripts/generate_recipe_images.ts
 *
 * Flags:
 *   --limit=N        Only process the first N recipes needing images.
 *   --slug=xxx       Only process one specific recipe (for testing).
 *   --dry-run        Skip the actual Flux call + upload; print prompts only.
 *   --overwrite      Regenerate even if image_url is already set.
 *   --flux-url=URL   Override the default http://127.0.0.1:7860.
 *                    Also honours the FLUX_URL env var (flag wins).
 *   --size=NxN       Override image dimensions (default 512x512).
 *   --steps=N        Override inference steps (default 40).
 *   --fast           Opt into the distilled fast path (lower quality).
 */

/* eslint-disable no-console */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Load .env FIRST so the env-var checks below see the values.
function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2];
      if (key && value !== undefined && !process.env[key]) {
        process.env[key] = value.trim();
      }
    }
  } catch {
    // .env missing is fine — env can come from shell.
  }
}
loadEnvFile();

// ─── Config ───────────────────────────────────────────────────────
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('❌ EXPO_PUBLIC_SUPABASE_URL not set.');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set.');
  console.error('   Create one in Supabase Studio → Settings → API → New secret key');
  console.error('   Add to .env as SUPABASE_SERVICE_ROLE_KEY=sb_secret_…');
  process.exit(1);
}

const args = process.argv.slice(2);
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
const singleSlug = args.find((a) => a.startsWith('--slug='))?.split('=')[1] ?? null;
const dryRun = args.includes('--dry-run');
const overwrite = args.includes('--overwrite');
const FLUX_URL =
  args.find((a) => a.startsWith('--flux-url='))?.split('=')[1] ??
  process.env.FLUX_URL ??
  'http://127.0.0.1:7860';
const sizeArg = args.find((a) => a.startsWith('--size='))?.split('=')[1];
const [WIDTH, HEIGHT] = sizeArg
  ? sizeArg.split('x').map((n) => Number(n))
  : [512, 512];
const STEPS = Number(args.find((a) => a.startsWith('--steps='))?.split('=')[1] ?? 40);
// Quality knob. `fast: true` uses the distilled/step-reduced FLUX path
// (great for iteration, mediocre for final photos). Default = OFF for
// best output; opt in with `--fast` when you're prompt-tuning.
const FAST = args.includes('--fast');

const BUCKET = 'recipe-images';
const CACHE_DIR = join(process.cwd(), '.image-cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Prompt builder ───────────────────────────────────────────────
// One consistent style block across all recipes so the app looks
// cohesive. Modern-kitchen close-up, natural window light, food is
// the hero. Tuned via earlier iteration with the user.
function buildPrompt(recipe: {
  name: string;
  cuisine: string | null;
  meal_type: string;
  ingredients: readonly { name: string }[];
}): string {
  const topIngredients = recipe.ingredients
    .slice(0, 4)
    .map((i) => i.name)
    .join(', ');
  const cuisineHint = recipe.cuisine ? ` in a ${recipe.cuisine} style` : '';
  return [
    `Overhead flat-lay food photography of ${recipe.name}${cuisineHint},`,
    `featuring ${topIngredients},`,
    `shot from directly above at a 90-degree top-down angle,`,
    `dish perfectly centered and filling 75% of the frame,`,
    `served on a matte white ceramic bowl or plate,`,
    `placed on a matte white quartz surface,`,
    `soft natural window light from the top-left, subtle soft shadows,`,
    `glistening highlights, visible texture, vibrant natural colors,`,
    `sharp focus across the entire dish, everything in focus,`,
    `symmetrical composition, no plate rim distortion,`,
    `appetizing, warm inviting palette,`,
    `magazine-quality food photography,`,
    `no text, no watermark, no hands, no utensils in frame`,
  ].join(' ');
}

// ─── Local FLUX.2 call ────────────────────────────────────────────
async function fluxHealthCheck(): Promise<void> {
  try {
    const res = await fetch(`${FLUX_URL}/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`❌ FLUX server not reachable at ${FLUX_URL}/health`);
    console.error(`   Start it first: cd ~/flux/flux-api && python3 app.py`);
    console.error(`   Underlying error: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function generateImage(prompt: string): Promise<Buffer> {
  // Full-quality inference (fast=false, high step count, 1024²) can take
  // 3-5 min per image on Apple Silicon; 512² default is ~4× faster but
  // still not instant. Node's undici defaults to a relatively short
  // header timeout and can bail before the server finishes. Give it a
  // very long ceiling via AbortController.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15 * 60 * 1000); // 15 min

  try {
    const res = await fetch(`${FLUX_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        width: WIDTH,
        height: HEIGHT,
        num_inference_steps: STEPS,
        fast: FAST,
      }),
      signal: ac.signal,
    });
    // NOTE: the ok / arrayBuffer path continues below unchanged — kept
    // inside the try so the timeout is cleared in `finally`.
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`FLUX API error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Supabase Storage upload ──────────────────────────────────────
// Supabase Storage rejects keys with non-ASCII chars (e.g. "brás", "canapé").
// Strip diacritics via NFKD, then keep only [a-z0-9._-].
function toStorageKey(slug: string): string {
  return slug
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uploadToStorage(slug: string, imageBytes: Buffer): Promise<string> {
  const path = `${toStorageKey(slug)}.png`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, imageBytes, {
      contentType: 'image/png',
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Main loop ────────────────────────────────────────────────────
async function main() {
  if (!dryRun) await fluxHealthCheck();

  let query = sb
    .from('recipes')
    .select('id, slug, name, cuisine, meal_type, ingredients, image_url')
    .order('meal_type');
  if (singleSlug) query = query.eq('slug', singleSlug);
  else if (!overwrite) query = query.is('image_url', null);
  if (limit > 0) query = query.limit(limit);

  const { data: recipes, error } = await query;
  if (error) {
    console.error('DB read failed:', error.message);
    process.exit(1);
  }
  if (!recipes || recipes.length === 0) {
    console.log('✓ Nothing to do — every recipe already has an image_url.');
    return;
  }

  console.log(`→ Processing ${recipes.length} recipe(s).${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`  Flux: ${FLUX_URL} · ${WIDTH}×${HEIGHT} · ${STEPS} steps · fast=${FAST}`);
  console.log('');

  const startedAt = Date.now();
  let done = 0;
  let failed = 0;

  for (const r of recipes) {
    const prompt = buildPrompt(r);
    const stepStart = Date.now();
    process.stdout.write(`[${done + failed + 1}/${recipes.length}] ${r.slug}… `);

    if (dryRun) {
      console.log('(dry-run)');
      console.log(`  Prompt: ${prompt.slice(0, 140)}…`);
      done += 1;
      continue;
    }

    try {
      const bytes = await generateImage(prompt);
      const key = toStorageKey(r.slug);
      // Cache the raw image locally as a safety net — if the DB update
      // fails, you don't lose the generated pixels.
      writeFileSync(join(CACHE_DIR, `${key}.png`), bytes);
      const publicUrl = await uploadToStorage(r.slug, bytes);
      const { error: updErr } = await sb
        .from('recipes')
        .update({ image_url: publicUrl, image_source: 'flux' })
        .eq('id', r.id);
      if (updErr) throw new Error(`DB update failed: ${updErr.message}`);
      done += 1;
      const secs = ((Date.now() - stepStart) / 1000).toFixed(1);
      console.log(`✓ (${secs}s)`);
    } catch (e) {
      failed += 1;
      console.log(`✗ ${(e as Error).message}`);
    }
  }

  const totalSecs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log(`Done in ${totalSecs}s. ${done} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log(`Cached images for failed rows are in ${CACHE_DIR} — inspect + retry the script to re-upload.`);
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
