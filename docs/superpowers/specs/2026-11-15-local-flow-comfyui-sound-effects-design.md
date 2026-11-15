# Local Flow ComfyUI sound effects design

## Intent
Let users generate project-linked sound effects from prompts using the existing ComfyUI runtime, without a separate audio service.

## Goals and constraints
- Reuse the configured ComfyUI backend and Local Flow's existing audio media/queue flow.
- Use native ComfyUI nodes; do not add custom-node dependency pins that can alter ComfyUI's core Python environment.
- Keep Stable Audio model weights separate from the installer and make download/readiness visible.
- Do not claim the engine is available until ComfyUI exposes the expected node types and a readiness probe succeeds.

## Approaches
- Keep the existing generic OpenAI-compatible sound service: low effort but requires a separate service and doesn't satisfy the ComfyUI preference.
- Integrate ComfyUI's built-in Stable Audio Open workflow: selected because it avoids dependency changes and reuses the backend the user already runs.
- Build a bespoke Python MOSS server: isolates dependencies but adds another backend, which user rejected in favor of ComfyUI.

## Design
Use ComfyUI's built-in `CheckpointLoaderSimple`, `CLIPLoader`, `ConditioningStableAudio`, `EmptyLatentAudio`, `KSampler`, `VAEDecodeAudio`, and `SaveAudio` nodes. Provide a readiness check and explicit model download in Audio & Sound settings. Download the Stable Audio Open checkpoint and T5 encoder into ComfyUI's model folders with visible file/byte progress. Submit jobs through `/prompt`, report queue state, retrieve completed output, and register project/prompt/model metadata in Local Flow's audio library. Do not install custom Python packages or change ComfyUI dependencies. Link the Stability AI Community License.

## Source findings
The configured ComfyUI runtime is Python 3.13.12 with NumPy 2.4.4 and Transformers 5.8.0. MOSS pins NumPy 1.26.4 and Transformers 4.57.1, so installing its extension could break existing ComfyUI nodes. Use ComfyUI's native Stable Audio Open workflow instead. Its official template lists a 4.52 GB checkpoint plus an 850 MB T5 encoder. Stable Audio Open uses the Stability AI Community License; check the terms before commercial use.
