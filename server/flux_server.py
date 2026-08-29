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

# CPU offload — required for FLUX.2-dev on any single A100 (even 80GB
# isn't enough for the 32B transformer + 7B Mistral encoder + VAE +
# activations in native BF16). Set `CPU_OFFLOAD=1` to force it, or
# leave unset and let the OOM auto-fallback below trigger it.
CPU_OFFLOAD = os.environ.get("CPU_OFFLOAD", "").lower() in ("1", "true", "yes")

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


def _is_quantized_checkpoint(model_id: str) -> bool:
    """
    Quantized checkpoints (bitsandbytes NF4/INT8, custom FP8) must NOT be
    moved with `.to("cuda")` after loading — the quantized weights are
    already device-placed at load time and moving them corrupts state.
    Detect by naming convention: `nf4`, `int4`, `int8`, `fp8` in the
    model id all imply weights already carry a device_map.
    """
    lower = model_id.lower()
    return any(tag in lower for tag in ("nf4", "int4", "int8", "fp8"))


@app.on_event("startup")
def _load_model() -> None:
    global pipe
    quantized = _is_quantized_checkpoint(MODEL_ID)
    log.info(
        "Loading %s (dtype=%s, cpu_offload=%s, quantized=%s) …",
        MODEL_ID, DTYPE_NAME, CPU_OFFLOAD, quantized,
    )

    # Quantized checkpoints (Ideogram-4-nf4/fp8, bitsandbytes) place
    # weights on the device at load time via `device_map`. Skip the
    # manual `.to()` and the CPU-offload path — both would break the
    # quantized layout.
    #
    # `device_map="auto"` lets accelerate compute the placement plan
    # itself. Using literal `"cuda"` triggered
    #   `NotImplementedError: Cannot copy out of meta tensor; no data!`
    # on diffusers 0.33+ / accelerate 1.x because it tried to `.to()`
    # meta-tensor weights that bitsandbytes had already reserved
    # slots for. `"auto"` uses the balanced-single-GPU path which
    # dispatches meta tensors via `to_empty()` instead.
    if quantized:
        pipe = DiffusionPipeline.from_pretrained(
            MODEL_ID, torch_dtype=DTYPE, device_map="auto",
        )
        log.info("Model loaded on CUDA via device_map=auto (quantized checkpoint).")
        return

    pipe = DiffusionPipeline.from_pretrained(MODEL_ID, torch_dtype=DTYPE)

    # Two paths for full-precision checkpoints:
    #   - CPU offload: components live on CPU RAM, migrate to GPU on
    #     demand per submodule call. ~2x slower per image but the only
    #     way to fit FLUX.2-dev (32B) on a single 80GB card.
    #   - Full residence: everything on CUDA, faster inference. Works
    #     for FLUX.1-dev (~12B) or FLUX.2-klein but OOMs on FLUX.2-dev.
    if CPU_OFFLOAD:
        pipe.enable_model_cpu_offload()
        log.info("Model loaded with CPU offload (fits large models, ~2x slower).")
        return

    try:
        pipe.to("cuda")
        log.info("Model loaded and resident on CUDA.")
    except torch.OutOfMemoryError:
        # Whatever partially loaded — free it before retrying so the
        # offload path has clean VRAM to work with.
        log.warning("OOM on full CUDA residence — falling back to CPU offload.")
        del pipe
        torch.cuda.empty_cache()
        pipe = DiffusionPipeline.from_pretrained(MODEL_ID, torch_dtype=DTYPE)
        pipe.enable_model_cpu_offload()
        log.info("Model loaded with CPU offload (fallback path).")


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
