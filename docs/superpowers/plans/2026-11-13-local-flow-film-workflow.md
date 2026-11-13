# Implementation and acceptance plan: Local Flow film workflow

This plan follows `docs/superpowers/specs/2026-11-13-local-flow-film-workflow-design.md`. Keep `docs/testing/2026-11-13-local-flow-fox-film-tracker.md` current as work proceeds.

## File map

- `src/main.jsx`: project creation, Story Chat state/rendering, queue popover, Studio wiring, project assets, export actions.
- `src/story-chat.css`, `src/style.css`, `src/dashboard.css`, `src/queue-popover.css`: shared presentation and responsive layout.
- `src/audio-editor.jsx`, `src/audio-editor.css`: timeline tracks, clip previews, seeking, export affordance.
- `server.js`: job state, project media associations, model eligibility, ComfyUI/TTS routes, media and export responses.
- `test/*.test.js`: small regression tests at workflow boundaries; add focused tests rather than one broad implementation-shaped assertion.
- `docs/testing/2026-11-13-local-flow-fox-film-tracker.md`: numbered status/evidence record.

## Phase 0 — Establish baseline and safe test isolation

1. Reconfirm source/runtime build mismatch and active services; record current project/media counts.
2. Reproduce the reported behaviors in the live app without saving changes to existing projects.
3. Create the numbered tracker and record baseline: 49 existing tests pass; API/UI generation build is stale.
4. Use a new “The Fox’s Wish — E2E Test” project for the final run. Do not delete outputs when complete.

## Phase 1 — Project setup and Story Chat behavior (issues 1–3, 6–7, 11–13)

1. Add focused failing tests for name-before-create, duration collection/persistence, question-aware choice options, and approval advancing exactly once.
2. Implement required project naming, film-length input and persistence.
3. Rework chat message alignment/colors and remove decorative message icons.
4. Make the story/asset header compact; add clear explanatory copy to art direction/palette fields.
5. Ensure discussion changes update the right-side plan without regenerating or overwriting creator canon.
6. Verify choices reflect the pending question and that selecting storyboard approval moves to the next phase once.

## Phase 2 — Asset generation, selection, references, and editing (issues 4–5, 8–10, 19–22)

1. Trace Story Chat asset generation from click → local job record → Comfy submission → output association → canonical selection.
2. Write red tests proving visible queue state, compatible model filtering, selected-variant thumbnail, and project-scoped references.
3. Make new/revision character flows conversational, make location prompts environment-led, and block cross-project assets.
4. Make project asset cards visual-first and open the AI-assisted asset editor for refine/reference/regenerate.
5. Verify with one generated character and one location; verify the actual selected output is shown and saved.

## Phase 3 — Studio, job queue, storyboard layout, and continuity (issues 14–18, 28)

1. Add a default-checked setting for queueing keyframes in scene order after storyboard approval.
2. Trace queue status from Local Flow jobs and Comfy `/queue`; add tests for reconciliation, terminal states, and provider/backend status.
3. Add outside-click/Escape dismissal for the Studio queue popover.
4. Fix equal storyboard-card widths, full reference-card content, and consistent backend connection state during generation.
5. Add a clear Studio next-step state toward clips, timeline, and final film.

## Phase 4 — Video settings, clip preview, timeline, and export (issues 23–32)

1. Add decimal duration regression tests and implement 1-second step controls within model limits.
2. Trace video preview URLs, source playback, time slider, and loaded media; fix the cause instead of masking errors.
3. Make Video Settings navigate/open its actual controls.
4. Test and fix project MP4 and PDF exports, ensuring user-visible download/save behavior and real output files.
5. Add source-frame thumbnails and original duration when inserting a storyboard scene on the timeline.
6. Implement composed playback and play/pause/scrub across the ordered timeline, and make timeline export choose a destination.

## Phase 5 — Media Library action (issue 33)

1. Add a failing test for the media context menu action.
2. Use a safe local OS reveal operation for “See in Explorer,” including missing-file handling.
3. Verify against the new project’s generated media.

## Phase 6 — Full end-to-end fox short-film acceptance

1. In the running browser app, create a fresh named project and enter the full fox-rescue/longing premise.
2. Use modern Japanese anime direction, English dialogue/narration, and 90-second target duration.
3. Build and approve the story assets; generate and select canonical character/location art.
4. Generate/approve the storyboard and check ordered keyframe queue behavior.
5. Generate all clips at a fast supported resolution, add English TTS/audio, and inspect scene-to-scene continuity.
6. Place clips/audio on the timeline; verify thumbnails, durations, full-film seeking/playback, and final export save path.
7. Open and inspect the MP4 and PDF. Record any quality limitations separately from functional bugs.
8. Run the full Node test suite and production build; mark an item “verified” only when its actual acceptance criterion has evidence.
