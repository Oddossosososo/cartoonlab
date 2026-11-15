#!/usr/bin/env python3
"""Local Piper HTTP bridge for CartoonLab.

Runs on loopback only. Place a trained Piper voice model at PIPER_MODEL.
The model and matching .onnx.json config must both be present.
"""
from __future__ import annotations

import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import wave

from piper import PiperVoice, SynthesisConfig

MODEL_PATH = Path(os.environ.get("PIPER_MODEL", "voices/michael.onnx")).expanduser()
HOST = "127.0.0.1"
PORT = int(os.environ.get("PIPER_PORT", "5000"))
MAX_TEXT_LENGTH = 5000

if not MODEL_PATH.is_file():
    raise SystemExit(
        f"Piper model not found: {MODEL_PATH}\n"
        "Set PIPER_MODEL to your trained Michael .onnx file."
    )
if not Path(str(MODEL_PATH) + ".json").is_file():
    raise SystemExit(
        f"Missing config: {MODEL_PATH}.json\n"
        "Piper requires the matching .onnx.json file beside the model."
    )

print(f"Loading Piper voice model: {MODEL_PATH}", flush=True)
VOICE = PiperVoice.load(str(MODEL_PATH))
print(f"Ready at http://{HOST}:{PORT}/synthesize", flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "CartoonLabPiper/1.0"

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def do_GET(self) -> None:
        if self.path.rstrip('/') == '/health':
            body = json.dumps({'status': 'ok'}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404, 'Use GET /health or POST /synthesize')

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/synthesize":
            self.send_error(404, "Use POST /synthesize")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 100_000:
                raise ValueError("Request body must be between 1 byte and 100 KB")
            payload = json.loads(self.rfile.read(size).decode("utf-8"))
            text = str(payload.get("text", "")).strip()
            if not text:
                raise ValueError("Text is required")
            if len(text) > MAX_TEXT_LENGTH:
                raise ValueError(f"Text is limited to {MAX_TEXT_LENGTH} characters")
            length_scale = float(payload.get("length_scale", 1.0))
            length_scale = max(0.5, min(2.0, length_scale))
            config = SynthesisConfig(length_scale=length_scale)
            output = io.BytesIO()
            with wave.open(output, "wb") as wav_file:
                VOICE.synthesize_wav(text, wav_file, syn_config=config)
            audio = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self._cors()
            self.end_headers()
            self.wfile.write(audio)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"error": "Piper synthesis failed", "detail": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print("[Piper]", fmt % args, flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
