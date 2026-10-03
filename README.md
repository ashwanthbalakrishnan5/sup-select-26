# Sandbox Hill

**Sand Hill, before Sand Hill.** AI investor panels that run live, first-round video interviews.

**Live: https://sandbox-hill.vercel.app** · Code: https://github.com/ashwanthbalakrishnan5/sup-select-26

Sign in with any username and password (demo login, one shared workspace), then pick a side:

- **Investors** describe their fund in plain English and Claude builds the panel: up to four Gemini Live avatar
  investors, each with custom instructions, must-ask questions and scoring criteria. One invite link goes to every
  startup; each interview produces a report (criteria scores, fact-checked claims, voice confidence and emotion
  signals, "I'm in / I'm out" verdicts, recording). Verdicts reach only the VC, never the founder. A Claude shortlist
  agent ranks the whole batch and re-ranks it after every interview through a Supabase Queue drained by a Supabase
  Compute worker.
- **Founders** practice the same Teams-style call: screen-share the deck, pitch uninterrupted, get grilled by
  investors with different personalities, hear the verdicts and get a report on what to fix.

In the call, Jay hosts a default panel of photoreal avatars (Jay, Vera, Sam, Kira; Paul is also available). A flow
model decides when the pitch starts, lets the addressed investor answer a mid-pitch question (the pitch clock pauses),
and ends the pitch when the founder says "that's my pitch". The call is recorded in the browser without a
screen-share prompt.

Next.js 16 · React 19 · Tailwind 4 + neobrutalism.dev · Supabase (Postgres, Storage, Queues, Compute) · Vertex AI
(Gemini 3.8 Live avatars) · Claude Sonnet 5.5 · Vercel

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in (see below); for local dev, GCP can use ADC:
gcloud auth application-default login
pnpm dev                     # http://localhost:3000 (desktop Chrome, headphones recommended)
```

Without Supabase env vars, sessions are stored in `.data/sessions/` (local dev only).

## Environment

| Var | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64/raw service-account key with `roles/aiplatform.user` (unset locally → ADC) |
| `LIVE_PROJECTS` | GCP projects for avatar seats, round-robin (3 concurrent avatars per project) |
| `TEXT_PROJECT` | GCP project for text models and transcription |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `ANTHROPIC_API_KEY`, `REPORT_MODEL` | Claude for the panel builder, reports and shortlist (`claude-sonnet-5-5`; reports fall back to Gemini when unset) |
| `SHORTLIST_CONSUMER` | Unset: the Next server drains the shortlist queue after each report. `compute`: only the Supabase Compute worker does |

## Supabase

Run the migrations in order (SQL editor, or `supabase db query --linked -f <file>`):

1. `supabase/migrations/0001_pitch_sessions.sql`: sessions + recordings
2. `supabase/migrations/0002_panels.sql`: investor panels
3. `supabase/migrations/0003_shortlist_queue.sql`: pgmq `shortlist` queue, enqueued when a panel interview is ready

Shortlist worker on Supabase Compute (needs `ANTHROPIC_API_KEY` and `REPORT_MODEL` set with `supabase secrets set`):

```bash
pnpm worker:build && supabase compute push shortlist-worker --project-ref <ref>
```

## Scripts

```bash
pnpm typecheck && pnpm lint && pnpm test   # 16 unit tests
pnpm smoke                                  # real Vertex AI: token, floor manager, voice confidence, fact-check, report
pnpm e2e                                    # full meeting in Chrome, FLOW=founder|investor (app on :3917, see docs/reference-code-map.md)
vercel deploy --prod --yes                  # deploy
```

## Docs

- `docs/superpowers/specs/2026-10-02-sandbox-hill-design.md`: product spec (every page, flow and measured number)
- `docs/superpowers/plans/2026-10-02-sandbox-hill.md`: build plan
- `docs/reference-code-map.md`: file map + hard-won platform facts
- `docs/screenshots/`: every screen
