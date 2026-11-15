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

## Cinema Studio
- Film looks: brightness, contrast, saturation, softness, warmth and vignette controls.
- Camera keyframes with eased zoom and pan interpolation.
- Extra visual layers for text, uploaded images and session-only video clips.
- AI video prompt builder and generated-clip import workflow.
- Cinema overlays and camera/effect processing are included in canvas video capture when the browser supports `captureStream`.

### AI video generation note
The AI panel currently builds prompts and imports clips generated elsewhere. It does not call a video-generation service directly. The GitHub Pages app is static, so a provider API key must not be placed in browser code; direct generation needs a secure server-side integration.
