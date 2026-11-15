# MiniMax H3 Multi-reference Video Plan

> **For agentic workers:** Implement inline; keep this scope limited to local ComfyUI MiniMax H3 video submission and its prompt mapping.

**Goal:** Make local MiniMax H3 video jobs use selected visual references while preserving exact storyboard start/end anchors.

**Architecture:** Keep the existing H3 image-to-video graph when no reference images are selected. When references are present, use `MiniMaxH3ReferenceToVideo`, pass each image as an ordered `ref_image_N` input, and chain `MiniMaxH3AddGuide` for the storyboard opening and ending frames. Prompt references with the node’s required `<Picture N>` syntax.

**Tech Stack:** Node.js, React, ComfyUI API prompt graphs, `node:test`.

**Spec:** User requirement to generate storyboard video with consistent character/asset references.

## Global Constraints

- Keep references separate from start/end keyframe anchoring.
- Do not change hosted MiniMax request behavior beyond its reference tag prompt.
- Keep the no-reference local workflow unchanged.
- Cap MiniMax H3 image references at nine, matching the installed node.

## Review Focus

- Correct `Picture N` order matches uploaded image order.
- Start and end frame guides survive the reference workflow and chain correctly.
- No-reference workflow retains its existing graph.
- Unusable reference URLs are not uploaded as graph inputs.
- Graph remains valid for ComfyUI’s installed dynamic `ref_image_N` ports.

### Task 1: Prompt and graph tests

**Files:**
- Modify: `test/video-prompt-language.test.js`
- Create: `test/minimax-h3-reference-video.test.js`

- [x] Assert `<Picture N>` role mapping for separate references.
- [x] Assert reference graph ordered image slots and optional start/end guides.
- [x] Run focused tests and confirm expected red failures.

### Task 2: Local reference-video graph

**Files:**
- Modify: `server.js`
- Modify: `src/main.jsx`

- [x] Add H3 reference-to-video workflow builder and select it only when references are uploaded.
- [x] Pass approved project visual references and metadata into local video jobs.
- [x] Use `<Picture N>` prompt references for MiniMax.

### Task 3: Verification

- [x] Run focused tests, full test suite, and production build.
- [x] Check the installed ComfyUI node schema and validate node/input names.
