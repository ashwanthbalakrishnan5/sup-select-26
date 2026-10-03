# Gemini Live Avatar

Verified working on 2026-10-02. Full design: `docs/superpowers/specs/2026-10-02-pitchroom-design.md`; working code: `reference/lib/live/`.

## Setup

- GCP project: `ashwanth-459106` (billing + `aiplatform.googleapis.com` enabled)
- Region: `us-central1`
- Model: `gemini-3.8-live`
- Auth: `gcloud auth print-access-token` (or ADC) as `Authorization: Bearer <token>`
- Endpoint: `wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`

## Setup message

```json
{
  "setup": {
    "model": "projects/ashwanth-459106/locations/us-central1/publishers/google/models/gemini-3.8-live",
    "generation_config": {
      "response_modalities": ["VIDEO"],
      "speech_config": { "voice_config": { "prebuilt_voice_config": { "voice_name": "Puck" } } }
    },
    "avatar_config": { "avatar_name": "Ben" },
    "system_instruction": { "parts": [{ "text": "<investor persona>" }] },
    "input_audio_transcription": {},
    "output_audio_transcription": {}
  }
}
```

Python SDK equivalent: `types.LiveConnectConfig(response_modalities=["VIDEO"], speech_config=..., avatar_config=types.AvatarConfig(avatar_name="Ben"))` with `client.aio.live.connect(model="gemini-3.8-live", config=config)`.

## Output

- `serverContent.modelTurn.parts[].inlineData` with `mimeType: "video/mp4"`: fragmented MP4 chunks (~1,400 for an 18s reply). Concatenate in order, or feed to MediaSource in the browser.
  - Video: H.264, 704x1280 (portrait), 24 fps
  - Audio: AAC, 24 kHz mono (muxed in; no separate PCM)
- `serverContent.outputTranscription.text`: transcript of the avatar's speech
- `serverContent.turnComplete`: end of turn
- Size: ~19 MB per 18s (~8.5 Mbps while speaking) at the default bitrate
- **The stream is continuous**: idle video (blinking, silent AAC) starts ~2.5 s after `setupComplete` and never stops; one init segment per session; chunks are 16 KB slices, not box-aligned; timestamps continue across turns. Speaking state must come from `outputTranscription`/`turnComplete`.
- Latency: first speech ~1.4 s after a text turn, ~1.75 s after the user stops talking (cold first turn ~3.3 s).

## Input

- Camera / screenshare: discrete JPEG frames at max **1 FPS**
- Mic: PCM audio stream

## Constraints

- Custom avatars (`avatar_config.customized_avatar` with a base64 PNG face) are allowlist-only via the Google Cloud account team. Use prebuilt avatars.
- **Prebuilt avatars: only `Ben`, `Kai`, `Leo`, `Vera`, `Paul` exist** (probed 160 names; unknown names → close 1007 "Unsupported avatar name"). Stills: `reference/public/avatars/`.
- Voices: 30 prebuilt (see spec §14).
- `avatar_config.video_bitrate_bps` works (verified): default ~10 Mbps → 1_000_000 ≈ 1.5 Mbps → 500_000 ≈ 0.76 Mbps.
- **Region: us-central1 only** (404 on global and 17 other regions).
- **Quota: 3 concurrent avatar sessions per project** (`BidiGenContentConcurrentReqsWithAvatarPerProjectPerBaseModel`); enforcement is lagged — 4 can work, 5+ / bursts lock the project out for ~10–13 min (close 1011 `RESOURCE_EXHAUSTED: Maximum concurrent sessions exceeded for Live Avatar use case`). Increase to 10 requested 2026-10-02. Workaround: second project `gen-lang-client-0326702225` (Vertex enabled).
- Clean or abrupt client close both release the slot immediately.
- Pricing: avatar video output $1 / 1M tokens at 6,192 tokens per speaking second (~$0.37/min); idle not billed.
- Default VAD ends a user turn on 0.44 s pauses → use `realtime_input_config.automatic_activity_detection: { silence_duration_ms: 1200, end_of_speech_sensitivity: 'END_SENSITIVITY_LOW' }`.
- Proactive audio is permanently on (the model may choose not to answer); affective dialogue is internal — **no API reports the user's emotion or confidence**. PitchRoom measures vocal confidence separately (`reference/lib/server/delivery.ts`).
- A `turn_complete: true` client turn interrupts an active generation; after `interrupted` the server sends a bare `turnComplete`.
- Browser: `?access_token=` on the WSS URL works; MSE codec `video/mp4; codecs="avc1.42C020, mp4a.40.2"`.

## References

- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-live-avatars
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api
- https://github.com/BerriAI/litellm/issues/43166
