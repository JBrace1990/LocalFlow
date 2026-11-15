# Local Flow

**A local-first studio for developing stories, designing visual assets, building storyboards, and producing short videos.**

Local Flow brings story planning, image and video generation, audio, and timeline editing into one Windows desktop app. It connects to local creative runtimes such as ComfyUI and Ollama, while keeping model weights separate from the installer.

> **Project status:** Pre-release. Local generation depends on the selected workflow, installed models, ComfyUI nodes, and available hardware. Some provider integrations require their own setup or API credentials.

[![Windows](https://img.shields.io/badge/platform-Windows-2563eb?logo=windows)](https://github.com/JBrace1990/LocalFlow)
[![Electron](https://img.shields.io/badge/desktop-Electron-47848f?logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs)](https://nodejs.org/)
[![Build](https://github.com/JBrace1990/LocalFlow/actions/workflows/windows-installer.yml/badge.svg)](https://github.com/JBrace1990/LocalFlow/actions/workflows/windows-installer.yml)

## Contents

- [What you can do](#what-you-can-do)
- [How the workflow fits together](#how-the-workflow-fits-together)
- [Install the Windows app](#install-the-windows-app)
- [Run from source](#run-from-source)
- [Local services and models](#local-services-and-models)
- [Where files are stored](#where-files-are-stored)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## What you can do

- **Develop a story with Story Chat.** Shape a premise and direction through a guided conversation before moving into visual production.
- **Create reusable visual assets.** Build characters, locations, uniforms, props, and art direction, with reference images and continuity notes.
- **Plan scenes in Studio.** Edit scene names, prompts, duration, aspect ratio, and resolution. Keep reference frames separate from generated variants.
- **Generate and review images.** Queue multiple outputs, keep or reject variants, and select a keyframe for each scene.
- **Create video clips.** Generate clips from text or storyboard keyframes, then review them in the context of their scenes.
- **Build the soundtrack.** Generate speech locally with Kokoro, manage project audio, and arrange sound and clips on a multitrack timeline.
- **Edit and export.** Scrub, trim, split, position, and mix media, then export a video with FFmpeg.
- **Keep project media organized.** Browse generated and imported media, and recover deleted projects and assets from trash.

Available generation paths and model support depend on the selected backend and workflow. A model appearing in a list does not mean every ComfyUI graph supports it.

## How the workflow fits together

1. **Start a project** and set its name and target length.
2. **Develop the concept** with Story Chat. Revise the premise and creative direction together.
3. **Prepare visual continuity** in the Asset Editor using character, setting, prop, uniform, and style references.
4. **Create the storyboard** and review scene actions, prompts, and timing.
5. **Generate keyframes and clips** in Studio. Select among variants and regenerate individual scenes as needed.
6. **Add speech and sound**, then assemble and edit the sequence in the Timeline editor.
7. **Export the finished video** or a storyboard document.

Story, image, video, and audio generation are local when the chosen model and runtime run locally. Hosted providers remain optional and may incur charges.

## Install the Windows app

1. Open [Releases](https://github.com/JBrace1990/LocalFlow/releases).
2. Download the latest `Local-Flow-Setup-<version>.exe`.
3. Run the installer. It installs per-user and adds Start Menu and Desktop shortcuts.
4. Launch **Local Flow**. The app starts its desktop shell and local API.

The installer bundles the Local Flow desktop runtime and FFmpeg. It does **not** bundle AI model weights. ComfyUI, its Python/CUDA environment, and model files are managed separately because they depend on your system and GPU.

Portable builds, when published, use `Local-Flow-Portable-<version>.exe`. App data is kept in the Windows user profile; keep a backup of that data when moving between machines.

## Run from source

### Requirements

- Windows 10 or 11, 64-bit
- Node.js 22 or newer for development
- Git
- ComfyUI for local image/video workflows
- Ollama for local Story Chat and storyboard planning (optional but recommended)

Install ComfyUI and Ollama separately if you want to use them. Local Flow can detect and start configured local installations from Settings. Models and model-specific ComfyUI nodes remain external to the installer.

### Start the development app

In PowerShell, from the repository folder:

```powershell
nvm install 24.21.0
nvm use 24.21.0
npm ci
npm run dev:local
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite refreshes the interface as you edit it, while Node watch mode restarts the local API after server changes. Press **Ctrl+C** in that terminal to stop both processes.

The development API uses port `4180` and stores development data in the ignored `data/` folder in this checkout. If the port is already in use, choose another port before starting:

```powershell
$env:LOCAL_FLOW_PORT = "4181"
npm run dev:local
```

For the Electron shell instead of the browser development workflow:

```powershell
npm run desktop
```

### Build and test

```powershell
npm run build
node --test
```

To package a Windows installer locally:

```powershell
npm run release:windows
```

A release build may require Windows build tools and internet access for dependency downloads.

## Local services and models

| Service | Used for | Notes |
| --- | --- | --- |
| **ComfyUI** | Image and video workflows | Run locally and select compatible workflows and model files. Local Flow can start a configured installation in the background. |
| **Ollama** | Story Chat and storyboard planning | Install Ollama and download a language model separately. |
| **Kokoro** | Text-to-speech | Runs inside Local Flow. The selected voice model is downloaded separately and can be prepared from Settings. |
| **ComfyUI + Stable Audio Open** | Sound effects | ComfyUI's native audio workflow; download the model files from Settings → Audio & Sound. |
| **MiniMax APIs** | Hosted image/video models | Require API credentials. Hosted requests may incur charges. |

Model weights are not bundled. Use **Settings → Models** to discover model folders and manage supported downloads. ComfyUI workflow compatibility determines whether a model can be used for a particular task; custom API-format workflows can be configured in Settings.

## Where files are stored

The packaged app stores its settings and project data under the current Windows user's application data directory, in a `Local Flow\data` folder. The development server stores its data in the repository's ignored `data/` directory. Generated media is saved in the configured media folder.

Back up project data and media separately from model weights. If you change the media destination, make sure the new folder is included in your backup plan.

## Troubleshooting

### ComfyUI is not connected

- Open **Settings → ComfyUI** and confirm the local server address.
- Check that ComfyUI is running and that the address uses the correct port.
- Use the dependency manager's refresh or background-start action.
- Confirm the selected model files and required custom nodes are installed in the ComfyUI environment Local Flow detects.

### Story Chat cannot find a language model

- Open **Settings → LLM** and check the Ollama server address.
- Confirm Ollama is running, then download a model with Ollama.
- Refresh the model list in Story Chat.

### A model is unavailable or generation fails

- Confirm the selected model is downloaded and belongs to the configured model folders.
- Check that the chosen workflow supports that model and task.
- Review ComfyUI's queue and error output; custom nodes and model requirements are managed by ComfyUI.

### Audio generation is unavailable

- Kokoro speech and sound effects use separate paths. Sound effects run through ComfyUI with Stable Audio Open; Settings → Audio & Sound shows node readiness and downloads the external model files.
- Stable Audio Open weights use the Stability AI Community License. Review the model terms before commercial use.

## Contributing

Issues and pull requests are welcome. Please include:

- Windows version and Local Flow version
- The selected model and ComfyUI workflow, if relevant
- The exact steps to reproduce
- Relevant error text, with API keys and personal data removed

For UI changes, check both Light and Dark appearance modes and confirm that controls remain readable with different accent themes.

## License

This repository does not yet include a project-wide license. Until one is added, no blanket permission is granted to redistribute or modify the project. Third-party components retain their own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

