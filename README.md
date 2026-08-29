# owkla-imagegen

Standalone recipe-image generator for the Owkla Supabase `recipes` table. Runs FLUX2 (dev or klein) against a compatible HTTP endpoint, uploads PNGs to the `recipe-images` Storage bucket, and updates `recipes.image_url`.

Extracted from the main app so it can run on rented GPUs (Vast AI, etc.) without shipping the whole mobile codebase.

Ships with a drop-in FLUX inference server (`server/flux_server.py`) so the whole pipeline works end-to-end from a single `git clone` on a GPU box.

## Setup — GPU box (Vast AI etc.)

Start the FLUX server first (once per box), then run the generator against it.

```bash
# 1. System deps (Node isn't in the Vast PyTorch image)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git tmux nano

# 2. Get the repo
git clone https://github.com/KaineLabs/owkla-imagegen.git
cd owkla-imagegen

# 3. FLUX server — Python side
pip install -r server/requirements.txt
huggingface-cli login                      # paste HF token (accept FLUX2 dev license on HF web first)
tmux new -s flux                           # so the server survives your terminal
export MODEL_ID=black-forest-labs/FLUX.2-dev    # or FLUX.2-klein / FLUX.1-dev
python server/flux_server.py               # loads ~30-50GB weights on first boot
# Ctrl-B D to detach the tmux session

# 4. Generator — Node side
cp .env.example .env
nano .env                                  # paste Supabase URL + service-role key
npm install
npm run generate
```

## Setup — local Mac (existing FLUX server)

If you already have a FLUX server running elsewhere, skip the Python side:

```bash
npm install
cp .env.example .env
export FLUX_URL=http://<host>:7860         # optional; defaults to 127.0.0.1:7860
npm run generate
```

## Common run modes

```bash
# Default: 512×512, 40 steps, quality mode
npm run generate

# Faster/lower-quality iteration
npx tsx scripts/generate_recipe_images.ts --fast --steps=8

# Test one recipe before a full run
npx tsx scripts/generate_recipe_images.ts --slug=<some-slug>

# Dry-run (no Supabase writes, just prints prompts)
npx tsx scripts/generate_recipe_images.ts --limit=3 --dry-run

# Full-res 1024×1024 for a hero shot
npx tsx scripts/generate_recipe_images.ts --slug=<some-slug> --size=1024x1024
```

## FLUX server environment

`server/flux_server.py` reads these env vars:

- `MODEL_ID` — HuggingFace model id (default `black-forest-labs/FLUX.2-dev`).
- `HOST` — bind address (default `127.0.0.1`; set `0.0.0.0` to expose beyond the container).
- `PORT` — default `7860`.
- `TORCH_DTYPE` — `bfloat16` (default, requires Ampere+) or `float16` (older GPUs).

Endpoints (match the JS client contract):

- `GET /health` — returns `{status, active_model, dtype, cuda_available}`.
- `POST /generate` body `{prompt, width, height, num_inference_steps, fast}` — returns raw PNG bytes.

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
