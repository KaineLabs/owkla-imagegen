"""
Minimal FLUX inference server that matches the contract expected by
`scripts/generate_recipe_images.ts`:

  GET  /health    → JSON { status, active_model, ... }
  POST /generate  → raw PNG bytes
      body: {
        "prompt": str,
        "width": int,
        "height": int,
        "num_inference_steps": int,
        "fast": bool,       # optional; reduces steps by ~4x if true
      }

Loads the model at boot (one-time HuggingFace download) and keeps it on
GPU for the lifetime of the process. Designed to run inside a Vast AI
container behind the recipe-image batch script.

Run:
    export MODEL_ID=black-forest-labs/FLUX.2-dev   # or FLUX.2-klein, FLUX.1-dev
    export HOST=127.0.0.1                          # override to 0.0.0.0 to expose
    export PORT=7860
    python flux_server.py

Requires: `pip install -r requirements.txt` and `huggingface-cli login`
with a token that has accepted the model's license (for gated models).
"""

from __future__ import annotations

import io
import logging
import os
import sys
from typing import Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

# FLUX.1 and FLUX.2 have different pipeline classes (FluxPipeline vs
# Flux2Pipeline — FLUX.2 uses one Mistral-based text encoder instead of
# T5+CLIP and drops the image encoder). `DiffusionPipeline.from_pretrained`
# reads the target model's `model_index.json` and instantiates the
# correct subclass automatically, so this loader works for either
# version without swapping imports.
from diffusers import DiffusionPipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("flux_server")

# ─── Config ────────────────────────────────────────────────────────
MODEL_ID = os.environ.get("MODEL_ID", "black-forest-labs/FLUX.2-dev")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "7860"))
# BF16 is the sweet spot on A100/H100 (native support). Override to
# "float16" if running on a card without BF16 (older Turing/Volta).
DTYPE_NAME = os.environ.get("TORCH_DTYPE", "bfloat16")
DTYPE = getattr(torch, DTYPE_NAME)

app = FastAPI()
# Populated once at boot in @app.on_event("startup"). Typed as the
# generic DiffusionPipeline since the concrete class depends on which
# FLUX version is loaded (FluxPipeline vs Flux2Pipeline).
pipe: Optional[DiffusionPipeline] = None


class GenerateBody(BaseModel):
    prompt: str = Field(..., min_length=1)
    width: int = Field(512, ge=128, le=2048)
    height: int = Field(512, ge=128, le=2048)
    num_inference_steps: int = Field(40, ge=1, le=100)
    # `fast=true` — matches the JS script's flag. We honour it by
    # collapsing steps to ~1/4 and skipping the guidance sweep, which
    # is close enough to a "distilled" path for iteration purposes.
    fast: bool = False


@app.on_event("startup")
def _load_model() -> None:
    global pipe
    log.info("Loading %s (dtype=%s) …", MODEL_ID, DTYPE_NAME)
    pipe = DiffusionPipeline.from_pretrained(MODEL_ID, torch_dtype=DTYPE)
    # Move to GPU. `enable_model_cpu_offload` would let smaller cards
    # run this at ~2-4x slower — worth toggling for <40GB VRAM. On the
    # 80GB A100 we're targeting, direct `.to("cuda")` is faster.
    pipe.to("cuda")
    log.info("Model loaded and resident on CUDA.")


@app.get("/health")
def health() -> JSONResponse:
    ready = pipe is not None
    return JSONResponse(
        {
            "status": "ok" if ready else "loading",
            "active_model": MODEL_ID,
            "dtype": DTYPE_NAME,
            "cuda_available": torch.cuda.is_available(),
        }
    )


@app.post("/generate")
def generate(body: GenerateBody) -> Response:
    if pipe is None:
        raise HTTPException(status_code=503, detail="model not loaded yet")

    steps = body.num_inference_steps
    guidance = 3.5  # FLUX.2-dev's recommended default
    if body.fast:
        # Rough parity with the JS `fast` flag — fewer steps, lower
        # guidance. Not a true distilled model, just a speed preset.
        steps = max(4, steps // 4)
        guidance = 0.0

    log.info(
        "generate: %dx%d steps=%d guidance=%.1f prompt=%r",
        body.width, body.height, steps, guidance, body.prompt[:80],
    )

    result = pipe(
        prompt=body.prompt,
        width=body.width,
        height=body.height,
        num_inference_steps=steps,
        guidance_scale=guidance,
    )
    image = result.images[0]

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
