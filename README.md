# PitchRoom

Pitch to an AI investor panel. A founder joins a Teams-style video call with up to four Gemini Live avatar
investors, pitches uninterrupted while screen-sharing, answers the panel's questions, hears each investor say
"I'm in" or "I'm out", and gets an analysis report — including how confident they sounded.

Next.js 16 · React 19 · Tailwind 4 + neobrutalism.dev · Supabase · Vertex AI (Gemini 3.8 Live avatars) · Vercel

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in (see below); for local dev, GCP can use ADC:
gcloud auth application-default login
pnpm dev                     # http://localhost:3000 — desktop Chrome, headphones recommended
```

Without Supabase env vars, sessions are stored in `.data/sessions/` (local dev only).

## Environment

| Var | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64/raw service-account key with `roles/aiplatform.user` (unset locally → ADC) |
| `LIVE_PROJECTS` | GCP projects for avatar seats, round-robin (3 concurrent avatars per project) |
| `TEXT_PROJECT` | GCP project for text models and transcription |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase |

Database: run `supabase/migrations/0001_pitch_sessions.sql` in the Supabase SQL editor.

## Scripts

```bash
pnpm typecheck && pnpm lint && pnpm test   # 16 unit tests
pnpm smoke                                  # real Vertex AI: token, floor manager, voice confidence, fact-check, report
pnpm e2e                                    # full meeting in Chrome (app on :3917, see docs/reference-code-map.md)
```

## Docs

- `docs/superpowers/specs/2026-10-02-pitchroom-design.md` — product spec (every page, flow and measured number)
- `docs/superpowers/plans/2026-10-02-pitchroom.md` — build plan
- `docs/reference-code-map.md` — file map + hard-won platform facts
- `docs/screenshots/` — every screen
