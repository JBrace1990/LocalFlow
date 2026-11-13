# Local Flow bug-fix tracker and fox-film acceptance

Started 2026-11-13. Statuses: **Unverified**, **Reproduced**, **Fixing**, **Fixed (test)**, **Verified (UI/E2E)**, **Blocked**. Keep this file current after each workflow group. “Fixed (test)” means a regression test passes; only real UI/service evidence earns “Verified (UI/E2E)”.

## Baseline

- Source: version 0.4.9; source SHA prefix `ea8e7a4aa4072056`.
- Running API `/api/health`: version 0.4.9, build `3cb1e3098f6d0d63` (does not match source; restart needed for final E2E).
- ComfyUI 0.44.0 responds on port 8188; RTX 4090 detected; queue empty at the time of check.
- Ollama 0.40.15 responds on port 11434.
- External TTS port 8880 is unavailable; app's bundled Kokoro path must be checked before audio acceptance.
- Existing suite baseline: **49 passed, 0 failed** (`node --test`, Node v24.22.1).
- Existing user data is present under `data/`; preserve it and use a new project for acceptance.

## User-reported issues

| # | Issue / acceptance check | Status | Evidence / notes |
|---:|---|---|---|
| 1 | New project asks for a name before creation | Reproduced | `createProject()` hard-codes “Untitled story”; replace with name-first flow. |
| 2 | Story Chat messages use right/left alignment and differentiated colors; remove icons | Unverified |  |
| 3 | Choice options answer the active AI question or leave it open-ended | Unverified | Existing tests cover structured choices; live behavior still needs reproduction. |
| 4 | Story Chat asset generation appears in the queue and reports active state | Unverified |  |
| 5 | Asset design model list excludes incompatible models | Unverified |  |
| 6 | Art direction/palette explains what the user should provide | Unverified |  |
| 7 | Story Chat title/step header is compact | Unverified |  |
| 8 | Character thumbnail matches the selected generated variant | Unverified |  |
| 9 | Story Chat image generation shows spinner and “Generating image” | Unverified |  |
| 10 | Location design focuses on environment, not incidental characters | Unverified |  |
| 11 | User can specify desired film length | Unverified |  |
| 12 | Storyboard discussion updates the right-hand plan | Unverified |  |
| 13 | Storyboard approval advances once instead of repeating the same request | Unverified |  |
| 14 | Default-checked setting queues keyframes for all approved scenes in order | Unverified |  |
| 15 | Studio queue is visible and closes on outside click | Unverified |  |
| 16 | Storyboard cards in a row have equal width | Unverified |  |
| 17 | Reference-frame cards show complete content, including the bottom row | Unverified |  |
| 18 | Backend status agrees with the runner executing generation | Unverified |  |
| 19 | AI can help create a new character after initial story setup | Unverified |  |
| 20 | New asset editor only shows assets/references for the active project | Unverified |  |
| 21 | New characters can be created/refined through the Story Chat design flow | Unverified |  |
| 22 | Project Assets lists images and opens the AI-assisted design/refinement editor | Unverified |  |
| 23 | Video duration accepts decimal seconds with step 1 and valid model limits | Unverified |  |
| 24 | Video preview slider scrubs the media | Unverified |  |
| 25 | Video Clips show a usable preview or intentional empty state, never broken media | Unverified |  |
| 26 | Video Settings opens working settings | Unverified |  |
| 27 | PDF and MP4 exports produce real files with visible save/download behavior | Unverified |  |
| 28 | Studio guides the user from keyframes/clips to final assembly | Unverified |  |
| 29 | Timeline scene picker shows image thumbnails in a clear layout | Unverified |  |
| 30 | Adding a scene to timeline uses the scene duration | Unverified |  |
| 31 | Timeline export asks where to save | Unverified |  |
| 32 | Timeline plays the ordered film as one preview with play/pause/scrubbing | Unverified |  |
| 33 | Media Library menu includes “See in Explorer” | Unverified |  |

## Acceptance film

- Project: **The Fox’s Wish — E2E Test** (new isolated project; never modify existing projects).
- Premise: an injured fox is rescued and cared for by a man; the fox falls in love with him and wishes to become human.
- Visual style: modern Japanese anime.
- Target duration: **90 seconds**, inherited from the user's previously stated short-film target; the product must still ask future users for duration.
- Language: English on-screen text only where appropriate; English narration/dialogue/audio.
- Final artifacts: combined MP4 and storyboard PDF; record exact path, existence, size, and playback/render result.

## Work log

| Date | Work / verification | Result |
|---|---|---|
| 2026-11-13 | Initial `node --test` baseline | 49 passed, 0 failed. |
| 2026-11-13 | Checked live services | ComfyUI and Ollama reachable; TTS service at 8880 unavailable. |
| 2026-11-13 | Compared API build with source | Mismatch; must restart API after code changes. |
