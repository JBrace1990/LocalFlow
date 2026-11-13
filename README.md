# Local Flow

A local-first storyboard and AI studio for planning scenes, attaching keyframes, generating image-to-video clips, and keeping media in a chosen folder.


## Portable Windows build

Use `Local-Flow-Portable-<version>.exe` for a no-install copy. The portable EXE stores settings, projects, local API data, and generated media in a `Local Flow Data` folder next to the EXE so the app can be moved as a folder. Keep that data folder with the EXE when moving or backing up the portable copy. Model weights remain separate and are selected in the app.

## Install on Windows

1. Download `Local-Flow-Setup-<version>.exe` from the latest GitHub Release.
2. Run the installer. It installs Local Flow per-user and creates Start Menu and Desktop shortcuts.
3. Open Local Flow. The native Electron app starts its local API automatically.

The Windows installer includes Electron/Node, FFmpeg, and the Kokoro JavaScript speech engine. Local Flow detects and starts installed ComfyUI and Ollama quietly in the background by default, reusing them if already running; either startup can be disabled in Settings. If Ollama is missing, use its in-app Install action. ComfyUI and Python/CUDA runtimes must be installed once because they depend on the PC's GPU and driver. Studio generation can start the detected ComfyUI backend itself; it does not require a successful connection check first. Auto-detected ComfyUI Desktop installs reuse Desktop's model paths, while Local Flow keeps ComfyUI input and output files in its own writable data folder. The managed backend launches with `--disable-pinned-memory` to avoid a Windows model-staging issue. If detection misses an install, enter its executable and arguments in Settings. Text-to-speech uses Kokoro inside Local Flow by default; its weights download and prepare in the background on app startup, then stay in Local Flow's user data folder. Disable background preparation to download on first use instead. An OpenAI-compatible local TTS service can be selected instead. Sound generation supports configurable local service endpoints.

AI model weights are never bundled with the installer. Use the Models UI to discover local weights, select model folders, or search/download model files from Hugging Face. Ollama manages its own language model downloads. The installer does not download models; Local Flow downloads the optional Kokoro voice model in the app after first launch.

For fast local iteration, install Node.js 20 or newer once, then from the project folder run `nvm use 24.21.0`, `npm ci` once, and `npm run dev:local`. This starts the local API with Node watch mode and the Vite interface with hot reload. Open `http://127.0.0.1:5173`; changes to React/CSS refresh in the browser, and server changes restart the API. Press Ctrl+C to stop both.

The development API uses `http://127.0.0.1:4180` and keeps settings/media under the ignored `data/` folder in the source checkout, separate from the installed app. If port 4180 is already in use, set `$env:LOCAL_FLOW_PORT=4181` in PowerShell before `npm run dev:local`. The Vite proxy uses the same value. Use `npm run desktop` when you want the Electron shell; use the Vite workflow above for hot-reload iteration.

## Publish a Windows release

Push a version tag such as `v0.4.4`. The Windows GitHub Actions workflow uses the lockfile, builds the app, packages a per-user NSIS installer, verifies the EXE artifact, and attaches `Local-Flow-Setup-<version>.exe` to the GitHub Release. The installer is unsigned unless repository secrets `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` are configured. After adding or changing dependencies, run `npm install` and commit the updated `package-lock.json` before publishing a release.

## Workflow

Local Flow supports four generation paths: text-to-image, text-to-video, image-to-video, and storyboard-to-video. A project can contain many scenes, each with editable prompts, a duration, a reference/keyframe, and one or more generated image/video variants.

1. Create or edit a storyboard, or generate one locally with Ollama. Select the scene count and style in the storyboard dialog.
2. Generate images from prompts or import a visual reference. The built-in Z-Image-Turbo workflow runs through local ComfyUI.
3. Generate video from text or animate a scene keyframe. Use Generate all clips from the storyboard to queue scenes in order. Generation jobs are persisted and reconciled into the UI after reload; jobs missing from the ComfyUI queue/history are surfaced as failed, while existing saved outputs can be recovered.
4. Choose 1–4 outputs per run. Regenerated images and clips are retained as selectable variants on their scene.
5. Assemble two or more scene clips manually from Export, or enable automatic assembly in Settings to join clips when every scene has a video. Assembly follows storyboard order and saves an MP4 to the selected media folder.

Settings include dependency status, ComfyUI/Ollama launch controls, image/video workflow overrides, model folders, output folder, local Kokoro or compatible TTS settings, SFX service settings, default batch count, automatic assembly, frame rate, and an optional FFmpeg executable path. ComfyUI and Ollama can be detected and launched as hidden local services, then reused by generation workflows. Kokoro speech supports English voices, CPU inference, and selectable model precision; its model weights are not bundled in the installer and can be downloaded on first speech generation or prepared ahead of time from the dependency manager. The timeline editor has audio waveforms, preview scrubbing, snapping, zoom, undo/redo, clip positioning, trim-in, split-at-playhead, volume, fades, per-clip burned-in title/caption overlays, and MP4 export presets from 340p through 1080p. Project archives include the storyboard, timeline, and referenced local media, and can be reopened from Export.

The bundled FFmpeg executable is distributed by the `ffmpeg-static` package and is licensed under GPL-3.0-or-later. See [FFmpeg source and licensing](https://ffmpeg.org/legal.html) and the `ffmpeg-static` release sources. Users who redistribute the installer should provide the corresponding FFmpeg source and license notices with their release.
## Story development

The Story chat workspace uses a local Ollama model to develop the premise with you, then creates a titled storyboard with a shared visual continuity guide. Add reference images to the chat workspace to use them across each scene keyframe. The automatic keyframe option queues image generation for every scene.

## Models and providers

- Local Ollama models are used for storyboard text generation. Ollama model files are managed by Ollama and appear in the storyboard model selector.
- The model-folder scanner discovers weight files at startup, every minute, and on demand. Add model folders in Settings. ComfyUI models are also detected automatically from its model paths. Local Flow lists ready-to-run Z-Image-Turbo and MiniMax H3 presets when all required files are present.
- The Hugging Face browser searches repositories and downloads selected weight files into the chosen model folder. It does not install model dependencies or inference runtimes.
- MiniMax Image-01 and H3 are hosted APIs; they are not downloadable local model weights. Enter a MiniMax API key in the app to use them. The key remains in browser memory and is passed to the local API only for requests. Hosted generation can incur charges.
- ComfyUI is the local image/video runtime. Local Flow detects the local server and provides built-in Z-Image-Turbo keyframe and MiniMax H3 image-to-video presets. Optional API-format workflows exported from ComfyUI can override those presets in Settings.

## Media

Media destination, imported references, and generated clips use the selected folder. The media library supports reversible trash, restore, manual empty-trash, and automatic removal after 30 days. Local Flow settings and trash metadata are under `data/`.

