# Wan 2.2 Keyframe-Anchored Video Plan

> **For agentic workers:** Execute inline using `superpowers:executing-plans`. Steps use checkbox syntax for tracking.

**Goal:** Offer a local ComfyUI Wan 2.2 image-to-video workflow that animates the approved storyboard keyframe without treating reference sheets as scene content.

**Architecture:** Detect the complete installed Wan 2.2 I2V model set and required ComfyUI nodes before exposing the model. Submit one `LoadImage` containing the approved keyframe to a native Wan 2.2 I2V latent node; do not connect asset/reference-sheet images. Keep MiniMax H3 available as a separate provider/model.

**Tech Stack:** Node.js ComfyUI API, ComfyUI Wan 2.2 native nodes, React model picker, Node test runner.

**Spec:** `bugs_todo_list.md` — MiniMax H3 storyboard-keyframe fidelity item.

## Global Constraints

- Preserve existing project data and assets; use temporary media for workflow verification.
- Do not claim fidelity from graph structure alone; inspect an actual generated clip.
- Show Wan as ready only when all weights and required node schemas are present.
- Storyboard video generation must use the selected scene keyframe as the actual first frame and exclude character/design sheets from image inputs.

## Review Focus

- A missing VAE, encoder, either diffusion model, or required node must prevent model readiness.
- A text-to-video job must not be routed through the storyboard-keyframe path.
- Unsupported frame dimensions or durations must be normalized to Wan-compatible latent sizes and frame lengths.
- An image-to-video prompt must not replace the approved image or introduce unwanted captions/sheets.
- Existing H3 or custom workflow routing must remain unchanged.

---

### Task 1: Build a Wan 2.2 I2V graph

**Files:** `server.js`, `test/wan22-i2v-workflow.test.js`

- [x] Write the failing workflow test and confirm it fails because the builder is absent.
- [x] Implement the graph with the installed high/low-noise UNETs, official two-stage sampling, actual first-frame input, text conditioning, latent dimensions, decode, and video save nodes.
- [x] Verify the focused workflow test passes.

### Task 2: Detect and route the ready model

**Files:** `server.js`, `test/wan22-i2v-workflow.test.js`

- [x] Add `/api/comfy/models` readiness checks for every required weight and node.
- [x] Allow the `comfy-wan22-i2v` ID in `/api/generate`, and route storyboard input to the new graph with only the approved keyframe.
- [x] Add regression checks for model detection/routing and run them; Studio hides this storyboard-only model during text-to-video.

### Task 3: Live ComfyUI verification

**Files:** `bugs_todo_list.md`

- [x] Confirm Wan appears as ready from the live LocalFlow API.
- [ ] Generate one short test clip from an approved keyframe; verify ComfyUI completion, saved clip, and actual frame contents.
- [ ] Update the bug tracker only if the clip preserves the approved keyframe identity/composition throughout the motion.
