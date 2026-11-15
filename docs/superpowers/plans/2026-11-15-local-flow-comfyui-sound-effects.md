# Local Flow ComfyUI sound effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local text-to-sound-effect generation through ComfyUI using Stable Audio Open.

**Architecture:** Local Flow checks ComfyUI's native audio nodes and model files, offers an explicit download into ComfyUI's model folders, submits a native API workflow, tracks its prompt ID, imports the saved audio into Local Flow media, and preserves project/audio metadata.

**Tech Stack:** Node.js server, React/Vite UI, ComfyUI API and native Stable Audio nodes.

**Spec:** `docs/superpowers/specs/2026-11-15-local-flow-comfyui-sound-effects-design.md`

## Global Constraints
- No model weights in the installer.
- No ComfyUI dependency changes or custom Python node installation.
- Reuse configured ComfyUI; preserve existing user workflows and settings.
- Report missing ComfyUI nodes and model files clearly.

## Review Focus
- Python < 3.12 or unsupported ComfyUI node API must fail before dependency installation.
- Repeated setup clicks must not duplicate installation jobs.
- A failed ComfyUI prompt must not be saved as a successful audio asset.
- Generated output must be copied into Local Flow-managed media and linked to the active project.
- Missing or renamed output nodes must produce an actionable error rather than a stuck queue item.

---

### Task 1: ComfyUI audio model setup and readiness

**Files:**
- Modify: `server.js`
- Modify: `src/main.jsx`
- Test: `test/comfyui-audio-workflow.test.js`

**Interfaces:**
- Consumes: existing ComfyUI configuration, dependency manager, settings and media APIs.
- Produces: status/download endpoints and Audio & Sound controls that download, refresh, and report Stable Audio readiness.

- [x] Add tests for model manifest, readiness checks, and workflow inputs.
- [ ] Run focused tests and verify the relevant cases fail.
- [x] Implement readiness and streamed model-download endpoints targeting ComfyUI's reported folders.
- [x] Implement Settings UI progress, ready/install/retry states, and model-weight download status.
- [ ] Run focused tests and verify they pass.

### Task 2: Prompt-to-audio workflow and project asset import

**Files:**
- Modify: `server.js`
- Modify: `src/main.jsx`
- Test: `test/comfyui-audio-workflow.test.js`

**Interfaces:**
- Consumes: Task 1 readiness/setup endpoints and the existing project audio library/media API.
- Produces: a ComfyUI-backed sound generation action that creates a project-linked audio asset with prompt and model metadata.

- [ ] Add tests for workflow input mapping, ComfyUI queue failure, output-file discovery, and project-linked asset metadata.
- [ ] Run focused tests and verify the new cases fail.
- [x] Build/submit the Stable Audio workflow using the ComfyUI prompt API and import only completed audio output into Local Flow media.
- [x] Update Audio UI to submit sound jobs and show ComfyUI state/errors while generating.
- [ ] Run focused tests, the production build, and an end-to-end generation when a compatible ComfyUI installation is available.
- [ ] Commit the sound integration separately from the themed-form UI commit.
