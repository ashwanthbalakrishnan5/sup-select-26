# Sandbox Hill

**Sand Hill, before Sand Hill.** AI investor panels that run live, first-round video interviews.

- **Investors** describe their fund in plain English and Claude builds the panel: up to four Gemini Live avatar
  investors, each with custom instructions, must-ask questions and scoring criteria. One invite link goes to every
  startup; each interview produces a report (criteria scores, fact-checked claims, voice confidence and emotion
  signals, "I'm in / I'm out" verdicts, recording), and a Claude shortlist agent ranks the whole batch — re-ranked
  automatically through a Supabase Queue after every interview.
- **Founders** practice the same Teams-style call: screen-share the deck, pitch uninterrupted, get grilled by
  investors with different personalities, hear the verdicts and get a report on what to fix.

Live: https://sup-select-26.vercel.app

Next.js 16 · React 19 · Tailwind 4 + neobrutalism.dev · Supabase (Postgres, Storage, Queues, Compute) · Vertex AI (Gemini 3.8 Live avatars) · Claude Sonnet 5.5 · Vercel

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

- `docs/superpowers/specs/2026-10-02-sandbox-hill-design.md` — product spec (every page, flow and measured number)
- `docs/superpowers/plans/2026-10-02-sandbox-hill.md` — build plan
- `docs/reference-code-map.md` — file map + hard-won platform facts
- `docs/screenshots/` — every screen
