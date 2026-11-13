# Local Flow bug and improvement tracker

Use **Fixed** only after the implementation has a passing regression check and the relevant UI/runtime behavior has been verified. A code change alone is not proof that an item is fixed.

## Project setup and Story Chat

- [ ] **Fixed** — Ask for a project name before creating the project.
- [ ] **Fixed** — Remove chat avatars/icons; align user messages right and AI messages left, with distinct colors.
- [ ] **Fixed** — Make suggested choices answer the active question; use a free-form response for open questions.
- [ ] **Fixed** — Add Story Chat asset generations to the visible queue and show their active state.
- [ ] **Fixed** — Do not offer image models for new asset designs when their workflows are incompatible.
- [ ] **Fixed** — Explain what an art-direction/palette design should contain and whether users should provide text or image references.
- [ ] **Fixed** — Reduce the oversized Story Chat title/step header.
- [ ] **Fixed** — Make the asset thumbnail reflect the currently selected generated design.
- [ ] **Fixed** — Show a loading indicator and “Generating image” during Story Chat image generation.
- [ ] **Fixed** — Keep Location design images focused on environment, setting, palette, and lighting; omit incidental people/props.
- [ ] **Fixed** — Ask for target film duration during project setup and use it in planning.
- [ ] **Fixed** — Update the right-side plan when the user discusses storyboard changes with the AI.
- [ ] **Fixed** — Make storyboard approval advance to scene creation instead of repeating the same plan/approval question.
- [ ] **Fixed** — Add a default-on setting to queue keyframes for every approved storyboard scene, in scene order.
- [ ] **Fixed** — Show the queue in Studio and close its popover on outside click.
- [ ] **Fixed** — Keep all storyboard cards in a row at equal widths.
- [ ] **Fixed** — Ensure reference-frame cards, including the last row, are fully visible and readable.
- [ ] **Fixed** — Keep backend connection status consistent with the runner that is actually generating.
- [ ] **Fixed** — Let Story Chat help create a new character after initial setup.
- [ ] **Fixed** — Scope Asset Editor assets and generated images to the selected project.
- [ ] **Fixed** — Make new characters go through the AI-assisted Story Chat design workflow.
- [ ] **Fixed** — Improve Project Assets: show useful image previews and open the AI-assisted edit/refine/regenerate workflow when selected.

## Video generation and finishing

- [ ] **Fixed** — Accept decimal video durations with one-second increments while respecting the selected model’s limits.
- [ ] **Fixed** — Make video preview scrubbing work.
- [ ] **Fixed** — Replace “Preview Unavailable” in Video Clips with a playable preview or a clear, accurate empty/error state.
- [ ] **Fixed** — Make Video Settings open and apply working settings.
- [ ] **Fixed** — Make storyboard PDF and MP4 export create real outputs with clear save/download behavior.
- [ ] **Fixed** — Guide users from Studio scenes/clips into final assembly and export.
- [ ] **Fixed** — Redesign Timeline scene selection to show thumbnails and scene context.
- [ ] **Fixed** — When adding a scene to the timeline, use that scene’s duration.
- [ ] **Fixed** — Ask where to save Timeline exports and report the resulting path.
- [ ] **Fixed** — Preview the ordered timeline as one continuous film with play/pause and scrubbing.
- [ ] **Fixed** — Add “See in Explorer” to each Media Library item’s actions.

## Validation notes

- Test baseline before this list: 49 passing Node tests.
- Build baseline before this list: Vite production build succeeded.
- End-to-end acceptance: create an isolated 90-second modern Japanese anime short about an injured fox rescued by a man, the fox falling in love with him and wishing to become human; use English text/audio; generate and review keyframes, video clips, and audio; assemble, scrub/play, and export the film and storyboard PDF.
- Existing user projects and media are out of scope for cleanup and must be preserved.
- Keep this file updated as items move from reproduced to fixed and verified. Only check **Fixed** after the validation evidence exists.
