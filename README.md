# CartoonLab

A free, browser-based cartoon animation playground for creating short original animated stories.

## Run it
Open `index.html` in a modern browser, or enable GitHub Pages for this repository.

## Included
- Animated 16:9 scene preview
- Editable cartoon character colour, size, position and expressions
- Speech bubbles, scene titles and subtitles
- Multiple scenes, scene duplication and duration controls
- Background themes and simple motion styles
- Timeline playback and scrubbing
- Basic sound-effect previews and audio-file import
- WebM video recording/export using the browser's MediaRecorder API

## Notes
CartoonLab runs locally in your browser and has no subscriptions, paid credits, accounts or external AI-generation service. Projects are currently kept in the current browser session; audio mixing and MP4 export are not included yet.

## Optional Rust Kokoro TTS

The editor now accepts a Rust TTS service URL in **Character → Rust TTS server URL**. The Rust service keeps a quantized Kokoro ONNX model warm between requests and returns WAV audio to the browser. See [server/README.md](server/README.md) for model setup and deployment. GitHub Pages does not run Rust itself, so the server must be hosted separately. Without a server URL, the existing in-browser Kokoro engine remains available.
