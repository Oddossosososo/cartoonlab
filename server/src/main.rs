use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use kokoro_en::{KokoroTts, Voice};
use serde::Deserialize;
use std::{env, sync::Arc};
use tokio::{net::TcpListener, sync::Mutex};
use tower_http::{cors::{Any, CorsLayer}, trace::TraceLayer};

type Engine = Arc<Mutex<KokoroTts>>;

#[derive(Deserialize)]
struct SpeechRequest {
    input: String,
    #[serde(default = "default_voice")]
    voice: String,
    #[serde(default = "default_speed")]
    speed: f32,
}

fn default_voice() -> String { "af_heart".to_owned() }
fn default_speed() -> f32 { 1.0 }

async fn health() -> &'static str { "CartoonLab Rust Kokoro TTS is ready" }

async fn speech(
    State(engine): State<Engine>,
    headers: HeaderMap,
    Json(request): Json<SpeechRequest>,
) -> Result<Response, (StatusCode, String)> {
    if let Ok(expected) = env::var("TTS_API_KEY") {
        if !expected.is_empty() {
            let supplied = headers.get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default();
            if supplied != format!("Bearer {expected}") {
                return Err((StatusCode::UNAUTHORIZED, "Invalid TTS API key".into()));
            }
        }
    }

    let text = request.input.trim();
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Text is required".into()));
    }
    if text.chars().count() > 2000 {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "Text is limited to 2000 characters per request".into()));
    }
    if !request.speed.is_finite() || request.speed <= 0.0 {
        return Err((StatusCode::BAD_REQUEST, "Speed must be a positive number".into()));
    }
    let voice = request.voice.trim();
    if voice.is_empty() || voice.len() > 40 {
        return Err((StatusCode::BAD_REQUEST, "A valid voice name is required".into()));
    }

    // Keep one warmed-up ONNX session alive and serialize inference through it.
    let engine = engine.lock().await;
    let (samples, _elapsed) = engine.synth(text, Voice::new(voice).with_speed(request.speed))
        .await
        .map_err(|error| (StatusCode::UNPROCESSABLE_ENTITY, format!("Kokoro synthesis failed: {error}")))?;

    let wav = encode_wav_16(&samples, 24_000);
    Ok((
        [(header::CONTENT_TYPE, "audio/wav"), (header::CACHE_CONTROL, "no-store")],
        wav,
    ).into_response())
}

fn encode_wav_16(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        out.extend_from_slice(&pcm.to_le_bytes());
    }
    out
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let model_path = env::var("KOKORO_MODEL").unwrap_or_else(|_| "models/model_quantized.onnx".into());
    let voices_path = env::var("KOKORO_VOICES").unwrap_or_else(|_| "models/voices".into());
    println!("Loading Kokoro model from {model_path} …");
    let tts = KokoroTts::new(model_path, voices_path).await?;
    let engine: Engine = Arc::new(Mutex::new(tts));

    let cors = match env::var("CORS_ORIGIN") {
        Ok(origin) if origin != "*" => CorsLayer::new().allow_origin(origin.parse::<axum::http::HeaderValue>()?).allow_methods(Any).allow_headers(Any),
        _ => CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any),
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/audio/speech", post(speech))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(engine);

    let port = env::var("PORT").unwrap_or_else(|_| "8080".into());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    println!("CartoonLab Rust TTS listening on {port}");
    axum::serve(listener, app).await?;
    Ok(())
}
