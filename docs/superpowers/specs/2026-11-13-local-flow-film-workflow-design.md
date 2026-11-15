# Local Flow guided short-film workflow: bug-fix design

## Intent

Make the guided project workflow dependable from first project creation through character and location design, storyboard generation, clips, soundtrack, editing, and a user-visible final export. Keep the interface visually consistent and let users understand what is generating and where the result is saved.

## Scope and success

- Fix all 33 user-reported issues in the companion tracker and keep a per-item verification record.
- Use an isolated fox-romance project as the acceptance story: a wounded fox is rescued and cared for by a man; the fox falls in love with him and longs to become human. The intended visual direction is modern Japanese anime, with English language text and audio.
- Generate and inspect story assets, keyframes, video clips, English narration/dialogue, edit playback, and a final combined short-film export.
- Keep existing projects and their media unchanged.
- Use 90 seconds as the test film duration, based on the user's earlier short-film target; ask for the duration in the product flow so future projects can choose their own.

## Non-goals

- No change to the user's prior projects or their selected assets.
- No promise of character identity or image quality beyond what the installed models can demonstrate in this test.
- No external publishing, upload, installer build, or dependency installation unless a separate request requires it.

## Approaches considered

1. **Patch all 33 individually.** This localizes changes but duplicates shared UI fixes and risks repeated regressions in the same Story Chat and Studio components.
2. **Rewrite the app shell and media pipeline.** This would allow broad architectural changes but carries unnecessary data and behavior risk in a currently untracked workspace.
3. **Recommended: fix by workflow boundary, retaining the current architecture.** First project onboarding and Story Chat; then asset generation and provenance; then Studio/queue; then video/timeline/export; finally media-library actions. Each boundary gets targeted red/green tests before moving on, followed by one full acceptance run.

The third approach best matches the user's ordered journey, preserves existing project formats, and gives every fix local regression evidence plus a real end-to-end acceptance result.

## Behavior design

### Project and story setup

- New Project opens a required project-name step before creating a project and sends the named project to Story Chat.
- Story Chat presents a compact header and conventional left/right text-message layout with distinct user and assistant colors, without decorative speaker icons.
- Ask one contextual question at a time. Choice buttons must answer that exact question; when the model asks an open-ended question, provide a text entry instead of generic Yes/No buttons.
- Let the user set desired film length before drafting a storyboard and retain it through navigation and revisions.
- Discussion edits must update the right-hand plan, and explicit approval advances the workflow exactly once.
- Art direction and palette fields explain the expected content and keep the user's canon intact.

### Assets and generation

- Story Chat asset generation creates a visible queue record with progress, project/asset association, and a clear generating-image state.
- Asset design model controls only offer compatible models.
- Location assets focus on environment, geography, atmosphere, and background; character references do not replace scene actions.
- Generated variants remain tied to the asset. The selected canonical image, not the first returned variant, is used as its thumbnail/reference.
- New characters can be added or revised through the conversational design flow. Project asset details open that same editor. References are project-local and unrelated-project media never appears in a new asset editor.
- Artwork and references remain role-separated, and the final asset surface is visual-first.

### Studio and queue

- Approved storyboard creation optionally enqueues keyframe generation for every scene in storyboard order. The setting is checked by default.
- The top-right queue represents actual Local Flow jobs and reconciles with ComfyUI status. The popover closes on outside click/Escape.
- Backend status reflects the same source of truth as job execution.
- Storyboard cards use stable equal-width tracks; reference cards expose complete names and controls without clipping.
- Video Settings opens real controls; Studio explains the next step toward final assembly.

### Video, editing, and delivery

- Video duration accepts decimal seconds with one-second increments while retaining valid model limits.
- Preview scrubbing updates the selected clip and the timeline; composed playback supports play/pause and seeking across the edit.
- Clip cards show a usable poster/first frame or a deliberate empty state; they never show a broken-image placeholder.
- Export uses a visible save/download flow. PDF output contains the selected project and frames; video output saves a real assembled file. Timeline export asks where to save.
- Timeline scene items show visual thumbnails and inherit the source scene duration when added.
- Media Library exposes a context menu including “See in Explorer.”

## Constraints and implementation calls

- Keep the current React/Vite UI, Node API, ComfyUI, Ollama, FFmpeg, and existing JSON persistence shape.
- Create all acceptance data under a new project named for the test; preserve user projects and settings except settings explicitly needed to exercise the new behavior.
- Write regression tests before each code fix and prove each focused failure turns green.
- Use browser/UI acceptance after the focused tests; the 49 existing tests passing is only the initial baseline, not proof of end-to-end success.

## Acceptance evidence

1. Numbered tracker has status and evidence for every issue.
2. Full test suite and production build pass against the final source.
3. New-project flow asks for a name; Story Chat asks for and preserves the requested 90-second length.
4. Story Chat assets generate with queue visibility and use the selected image; no cross-project assets appear.
5. Approved storyboard creates 90 seconds of scene material and optionally queues keyframes in order.
6. Video settings, clip preview/scrubbing, timeline scene duration/thumbnails, composed playback, English audio, and export are exercised in the running app.
7. Final combined MP4 and storyboard PDF are opened/inspected; exact saved paths are recorded.
8. No existing project or media is mutated by the test.
