# owkla-imagegen

Standalone recipe-image generator for the Owkla Supabase `recipes` table. Runs FLUX2 klein 9B (local or remote), uploads PNGs to the `recipe-images` Storage bucket, and updates `recipes.image_url`.

Extracted from the main app so it can run on rented GPUs (Vast AI, etc.) without shipping the whole mobile codebase.

## Setup

```bash
npm install
cp .env.example .env   # then fill in EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

## Run

```bash
# Pointing at FLUX on the same box (default 127.0.0.1:7860):
npm run generate

# Pointing at a remote FLUX:
export FLUX_URL=http://<host>:7860
npm run generate

# Faster/lower-quality iteration:
npx tsx scripts/generate_recipe_images.ts --fast --steps=8

# Test one recipe before committing to a full run:
npx tsx scripts/generate_recipe_images.ts --slug=<some-slug>

# Dry-run (no Supabase writes, just prints prompts):
npx tsx scripts/generate_recipe_images.ts --limit=3 --dry-run
```

## Idempotent

The script queries `recipes` where `image_url IS NULL`. Ctrl-C is always safe; re-running picks up wherever it left off. Failed generations cache locally in `.image-cache/` so you can inspect them without re-hitting FLUX.

## Full flag list

Documented in the header comment at the top of `scripts/generate_recipe_images.ts`. Main knobs:

- `--flux-url=URL` (or `FLUX_URL` env) — FLUX server address.
- `--size=NxN` — output resolution (default 512×512; use `--size=1024x1024` for max quality).
- `--steps=N` — inference steps (default 40).
- `--fast` — distilled path, lower quality, ~4-8× faster.
- `--limit=N` — cap the batch to N recipes.
- `--slug=xxx` — target one recipe.
- `--overwrite` — regenerate even when `image_url` is set.
- `--dry-run` — no Supabase writes.
