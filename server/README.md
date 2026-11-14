# CartoonLab Rust Kokoro TTS service

This is an optional Rust inference server for the browser editor. The GitHub Pages editor remains static; deploy this folder as a separate Rust web service and paste its public HTTPS URL into **Character → Rust TTS server URL**.

## Model files

The service loads one quantized Kokoro ONNX model and the voice pack files at startup. Keep model weights out of Git.

Expected layout:

```
models/
  model_quantized.onnx
  voices/
    af_heart.bin
    af_bella.bin
    af_nicole.bin
    am_adam.bin
    am_michael.bin
    bf_emma.bin
    bm_george.bin
```

Get the matching model and voice files from the official ONNX-community Kokoro model release. Set `KOKORO_MODEL` and `KOKORO_VOICES` if your paths differ.

## Run

```sh
cd server
cargo run --release
```

Environment variables:
- `PORT` — defaults to `8080`
- `KOKORO_MODEL` — defaults to `models/model_quantized.onnx`
- `KOKORO_VOICES` — defaults to `models/voices`
- `CORS_ORIGIN` — allowed browser origin; defaults to `*` for initial setup
- `TTS_API_KEY` — optional bearer token required on synthesis requests

Endpoints:
- `GET /health`
- `POST /v1/audio/speech` with JSON `{"input":"Hello","voice":"af_heart","speed":1.0}`; responds with WAV audio.

The ONNX session is loaded once and reused, avoiding repeated model startup for every narration. Requests share the warmed engine. For a public deployment, set a private `TTS_API_KEY`, restrict `CORS_ORIGIN` to your editor origin, and configure appropriate hosting limits. A browser-side API token is visible to that browser user, so do not reuse a secret that protects other services.
