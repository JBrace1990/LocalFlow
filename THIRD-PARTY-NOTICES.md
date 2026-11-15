Third-party components distributed in Local Flow Setup:

- FFmpeg binary provided by ffmpeg-static 5.3.0 (FFmpeg 6.1.1): GPL-3.0-or-later. The FFmpeg source code and licensing information are available from https://ffmpeg.org/download.html and https://ffmpeg.org/legal.html. The binary package release source and build scripts are at https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1.
- The ffmpeg-static Node.js wrapper is distributed under the license stated by its upstream npm package.

The FFmpeg executable is a separate subprocess and can be replaced by an existing system FFmpeg using Settings or FFMPEG_PATH.

- Kokoro.js 1.2.1: Apache-2.0. Copyright and license text are included with the package in `node_modules/kokoro-js/LICENSE`.
- Transformers.js 3.8.1: Apache-2.0. Copyright and license text are included with the package in `node_modules/@huggingface/transformers/LICENSE`.
- Phonemizer 1.2.1: Apache-2.0. Copyright and license text are included with the package in `node_modules/phonemizer/LICENSE`.
- ONNX Runtime Node.js 1.21.0: MIT. The package metadata identifies the MIT license; see the [upstream ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE). The npm package does not include a separate `LICENSE` file.

Kokoro model weights are downloaded separately by the app into the user's Local Flow data directory and are not included in the installer. The default English model is published by ONNX Community under the Apache-2.0 license.
