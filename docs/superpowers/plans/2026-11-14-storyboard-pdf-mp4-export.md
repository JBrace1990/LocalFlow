# Storyboard PDF and MP4 Export Plan

> **For agentic workers:** Execute inline using `superpowers:executing-plans`; this active goal already authorizes implementation and verification.

**Goal:** Make project exports produce valid storyboard PDFs and assembled MP4s with a clear saved-file result.

**Architecture:** Use the existing Node API and Windows save dialog for choosing the destination. Render storyboard PDFs server-side with PDFKit so browser and desktop modes share the same reliable file-writing path; keep MP4 assembly on the existing FFmpeg route and verify its saved/download behavior.

**Tech Stack:** Node.js, PDFKit, existing HTTP API, FFmpeg, React/Vite.

**Spec:** `bugs_todo_list.md` — “Make storyboard PDF and MP4 export create real outputs with clear save/download behavior.”

## Global Constraints

- Keep user projects and media intact; use temporary output paths and remove only test artifacts created for verification.
- Preserve the existing storyboard print HTML if it remains useful elsewhere.
- Report an export as successful only after the output file exists and has nonzero content.

## Review Focus

- Save-dialog cancellation must not claim success or start rendering.
- Scene text must be escaped/encoded by the PDF renderer, and unsupported/missing frame files must not break the full PDF.
- A selected save path must remain inside the chosen directory and use the correct `.pdf` or `.mp4` extension.
- MP4 export must use actual scene clips in storyboard order and return an accessible download.
- Large storyboard images must not create unusable pages or excessive memory use.

---

### Task 1: Produce and save storyboard PDF and MP4 exports

**Files:**
- Create: `src/storyboard-pdf.js`
- Modify: `src/main.jsx`, `server.js`, `src/timeline-export.js`, `test/storyboard-export.test.js`, `test/timeline-export.test.js`, `bugs_todo_list.md`
- Dependency: `pdfkit`

**Interfaces:**
- `renderStoryboardPdf(project, { imageForScene }) -> Promise<Buffer>` returns a complete PDF buffer.
- `POST /api/storyboard/export` accepts `{ project, filePath }`, writes the PDF, and returns `{ path, bytes }`.
- `POST /api/save-file-picker` accepts `{ title, defaultName, format }` where format is `pdf` or `mp4`.

- [x] Write a failing PDF-buffer test for document header, project title, scene text, and optional keyframe embedding.
- [x] Run it and confirm the missing renderer/export contract fails.
- [x] Implement the PDFKit renderer and API output validation.
- [x] Add save-picker format tests and update the Studio Export action to choose a `.pdf` path, call the API, and report the saved path; cancel is a no-op.
- [x] Run focused tests and confirm a valid nonempty PDF exists at a temporary path.
- [x] Verify MP4 output using a temporary timeline export and remove the test artifact. The native save dialog was not exposed by the browser harness.
- [x] Run the full suite (138 passing), production build, and `git diff --check`; visually inspect the live export UI.
- [x] Update the bug tracker with test and API output evidence.
