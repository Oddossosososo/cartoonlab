# CartoonLab · Piper Michael voice

CartoonLab now has an optional Piper engine. Kokoro remains the default and keeps the original **Michael** voice. Piper can use a custom-trained Michael model once you have the two matching files:

- `michael.onnx`
- `michael.onnx.json`

A normal Piper preset is not the same voice as Kokoro's Michael. This integration does not pretend to convert the Kokoro voice automatically; a matching Piper model must be trained separately from audio you have permission to use.

## 1. Prepare the model

Create a `server/voices/` folder and place the trained files there:

```
server/
  piper_server.py
  voices/
    michael.onnx
    michael.onnx.json
```

## 2. Install Piper

Use Python 3.10 or newer:

```bash
python3 -m pip install piper-tts
```

## 3. Start the local bridge

From the repository root:

**Linux / macOS**
```bash
PIPER_MODEL=server/voices/michael.onnx python3 server/piper_server.py
```

**Windows PowerShell**
```powershell
$env:PIPER_MODEL="server/voices/michael.onnx"
python server/piper_server.py
```

The bridge listens only on `127.0.0.1:5000`; it is not exposed to your network.

## 4. Connect CartoonLab

1. Open **Character → TTS engine**.
2. Select **Piper · Michael (custom model)**.
3. Set the Piper server base URL to `http://localhost:5000`.
4. Press **Generate Kokoro AI voice** (the button uses the selected engine).

Piper synthesis is sent to `POST /synthesize` with `text` and `length_scale`, and the bridge returns WAV audio. The speaking-speed control is applied to Piper too. The local bridge includes CORS support for the CartoonLab page.

To return to Kokoro, select **Kokoro · Michael (original)**. The Piper model is optional and does not replace or overwrite Kokoro.

## Important

The code integration is in place, but a trained Michael Piper model is not included. Until those two model files exist, Piper cannot speak in Michael's voice. The server will show a clear startup error if the model is missing.
