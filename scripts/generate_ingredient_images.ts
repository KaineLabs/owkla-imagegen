/**
 * Bulk ingredient-image generator + uploader.
 *
 * Sibling of `generate_recipe_images.ts`, but for the ~500 canonical
 * ingredients in `src/lib/ingredient_price_catalog.ts`. Output is a small
 * PNG per ingredient uploaded to a public Supabase Storage bucket named
 * `ingredient-images`. The recipe-detail page (and anything else that
 * lists ingredients) can then render `<Image>` from the public URL.
 *
 * Flow per ingredient (only those whose PNG isn't already in the bucket):
 *   1. Build a "single ingredient on white" product-shot prompt.
 *   2. POST to the local FLUX server at http://127.0.0.1:7860/generate
 *      → raw PNG bytes at 256×256 (FLUX API minimum; retina-crisp at
 *      display sizes up to 128px).
 *   3. Upload the PNG to Supabase Storage bucket `ingredient-images`
 *      keyed by canonical-slug.
 *
 * Idempotent — checks the bucket for existing PNGs before generating and
 * skips anything already there. Ctrl+C safe: partial runs resume cleanly.
 * Failed generations cache locally in `.ingredient-image-cache/` so you
 * can inspect + retry without re-running Flux.
 *
 * No DB writes. Consumers derive the public URL directly:
 *   `${SUPABASE_URL}/storage/v1/object/public/ingredient-images/${slug}.png`
 *
 * Usage:
 *   1. Start the FLUX server:
 *        cd ~/flux/flux-api && python3 app.py
 *      (Confirm http://127.0.0.1:7860/health returns 200.)
 *   2. Set env vars in .env:
 *        EXPO_PUBLIC_SUPABASE_URL=…      (already set)
 *        SUPABASE_SERVICE_ROLE_KEY=…     (already set for recipe images)
 *   3. Create the `ingredient-images` bucket in Supabase Storage
 *      (public, 1 MB max — 256×256 PNGs are ~30-80 KB each).
 *   4. Run: npx tsx scripts/generate_ingredient_images.ts
 *
 * Flags:
 *   --limit=N        Only process the first N ingredients needing images.
 *   --key=xxx        Only process one specific ingredient key (for testing).
 *   --dry-run        Skip the Flux call + upload; print prompts only.
 *   --overwrite      Regenerate even if the PNG already exists in the bucket.
 *   --flux-url=URL   Override the default http://127.0.0.1:7860.
 *   --size=NxN       Override image dimensions (default 256x256, FLUX min).
 *   --steps=N        Override inference steps (default 20).
 *   --category=cat   Only process ingredients in this category (produce, meat, etc.).
 */

/* eslint-disable no-console */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { allPriceEntries, type UsBaselinePrice } from '../src/lib/ingredient_price_catalog';

// Load .env FIRST so the env-var checks below see the values.
function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
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
const singleKey = args.find((a) => a.startsWith('--key='))?.split('=')[1] ?? null;
const category = args.find((a) => a.startsWith('--category='))?.split('=')[1] ?? null;
const dryRun = args.includes('--dry-run');
const overwrite = args.includes('--overwrite');
const FLUX_URL =
  args.find((a) => a.startsWith('--flux-url='))?.split('=')[1] ??
  process.env.FLUX_URL ??
  'http://127.0.0.1:7860';
const sizeArg = args.find((a) => a.startsWith('--size='))?.split('=')[1];
const [WIDTH, HEIGHT] = sizeArg
  ? sizeArg.split('x').map((n) => Number(n))
  : [256, 256];
const STEPS = Number(args.find((a) => a.startsWith('--steps='))?.split('=')[1] ?? 20);

const BUCKET = 'ingredient-images';
const CACHE_DIR = join(process.cwd(), '.ingredient-image-cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Slug / path helpers ─────────────────────────────────────────
// Storage rejects non-ASCII paths. Strip diacritics then keep [a-z0-9._-].
function toStorageKey(key: string): string {
  return key
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function storagePath(key: string): string {
  return `${toStorageKey(key)}.png`;
}

// ─── Prompt builder ──────────────────────────────────────────────
// Product-shot style: single ingredient, isolated on white, centered, no
// props. Consistent across the catalog so ingredients read as a family
// when listed together on the recipe page.
function buildPrompt(entry: UsBaselinePrice): string {
  // Prefer the most human-readable alias when the canonical key is
  // clunky ("ground beef 85/15" → "ground beef"), otherwise use the key.
  const displayName = entry.aliases[0] || entry.key.replace(/\s+\d+\/\d+$/, '');
  return [
    `Product photograph of ${displayName},`,
    `single ingredient isolated on a pure white background,`,
    `perfectly centered, filling 70% of the frame,`,
    `soft natural top-left lighting, subtle soft shadow beneath,`,
    `sharp focus, vibrant natural colors, visible texture,`,
    `clean minimalist composition, no props, no plate, no utensils,`,
    `no text, no watermark, no hands, no background clutter,`,
    `catalog-style food photography, appetizing and fresh looking`,
  ].join(' ');
}

// ─── Local FLUX call ─────────────────────────────────────────────
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
  const res = await fetch(`${FLUX_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      width: WIDTH,
      height: HEIGHT,
      num_inference_steps: STEPS,
      fast: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`FLUX API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Supabase Storage ────────────────────────────────────────────
async function bucketExists(): Promise<boolean> {
  const { data, error } = await sb.storage.getBucket(BUCKET);
  if (error || !data) return false;
  return true;
}

// Fetch every existing key in the bucket so we can skip work idempotently
// without a per-file HEAD.
async function listExistingKeys(): Promise<Set<string>> {
  const set = new Set<string>();
  // list() paginates at 1000 entries; ingredients are ~500 so one call is enough,
  // but loop defensively in case the catalog grows.
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.storage.from(BUCKET).list('', {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const f of data) set.add(f.name);
    if (data.length < pageSize) break;
    offset += data.length;
  }
  return set;
}

async function uploadToStorage(key: string, imageBytes: Buffer): Promise<string> {
  const path = storagePath(key);
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

// ─── Main loop ───────────────────────────────────────────────────
async function main() {
  if (!dryRun) await fluxHealthCheck();

  if (!dryRun) {
    const exists = await bucketExists();
    if (!exists) {
      console.error(`❌ Bucket "${BUCKET}" does not exist in Supabase Storage.`);
      console.error('   Create it via Studio → Storage → New bucket');
      console.error('   Settings: Public bucket · 1 MB file size limit · no MIME restrictions.');
      process.exit(1);
    }
  }

  let entries = allPriceEntries();
  if (singleKey) entries = entries.filter((e) => e.key === singleKey);
  if (category) entries = entries.filter((e) => e.category === category);

  if (entries.length === 0) {
    console.log('No matching ingredients.');
    return;
  }

  // Idempotency filter: skip ingredients that already have a PNG in the bucket
  // unless --overwrite was passed.
  let existing = new Set<string>();
  if (!dryRun && !overwrite) {
    existing = await listExistingKeys();
    console.log(`  Bucket has ${existing.size} existing image(s) — will skip those.`);
  }
  const toProcess = overwrite
    ? entries
    : entries.filter((e) => !existing.has(storagePath(e.key)));

  if (toProcess.length === 0) {
    console.log('✓ Nothing to do — every ingredient already has an image in the bucket.');
    return;
  }

  const capped = limit > 0 ? toProcess.slice(0, limit) : toProcess;
  console.log(`→ Processing ${capped.length} ingredient(s).${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`  Flux: ${FLUX_URL} · ${WIDTH}×${HEIGHT} · ${STEPS} steps · fast=true`);
  console.log('');

  const startedAt = Date.now();
  let done = 0;
  let failed = 0;

  for (const entry of capped) {
    const prompt = buildPrompt(entry);
    const stepStart = Date.now();
    process.stdout.write(`[${done + failed + 1}/${capped.length}] ${entry.key}… `);

    if (dryRun) {
      console.log('(dry-run)');
      console.log(`  Prompt: ${prompt.slice(0, 140)}…`);
      done += 1;
      continue;
    }

    try {
      const bytes = await generateImage(prompt);
      const cacheKey = toStorageKey(entry.key);
      // Cache the raw image locally as a safety net — if the upload fails,
      // you don't lose the generated pixels.
      writeFileSync(join(CACHE_DIR, `${cacheKey}.png`), bytes);
      const publicUrl = await uploadToStorage(entry.key, bytes);
      done += 1;
      const secs = ((Date.now() - stepStart) / 1000).toFixed(1);
      console.log(`✓ (${secs}s) → ${publicUrl}`);
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
