# PitchRoom Implementation Plan (hackathon day)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PitchRoom — a founder pitches (camera + screen share) to up to 4 Gemini Live avatar investors in a Teams-style call, then gets "I'm in / I'm out" verdicts and an analysis report — as a Next.js app on Vercel with Supabase.

**Architecture:** Next.js 16 App Router. The browser runs the meeting: a framework-agnostic `RoomController` state machine opens one Gemini Live avatar WebSocket per investor (us-central1, token from `/api/live-token`), a silent transcription WebSocket for the pitch (global), and routes the mic to whoever "has the floor". Text agents (fact-check, floor manager, report) run in Vercel route handlers. Supabase Postgres stores sessions; the Teams UI is the Azure Communication Services UI kit fed with our own `<video>` elements.

**Tech Stack:** Next.js 16.3 · React 19.2 · TypeScript 5.9 · Tailwind 4 · neobrutalism.dev (shadcn registry, Base UI) · `@azure/communication-react` 1.35 · `@google/genai` 2.26 · `google-auth-library` 11 · `@supabase/supabase-js` 2.117 / `@supabase/ssr` 0.12 · zod 4 · pnpm 11 · Vercel.

**Spec:** `docs/superpowers/specs/2026-10-02-pitchroom-design.md` (read it first — every number there was measured).

**Reference code:** `reference/` contains every file of the app, already verified in a scratch Next app (tsc, eslint, `next build`, 16 unit tests, real-Vertex smoke test, full e2e meetings with 1, 2 and 4 investors, leave-mid-pitch). This plan is mostly *copy, wire, verify*. Never re-derive what the reference already does; if something differs from the reference, the reference wins unless it fails a test.

**Time budget (spec §15): ≤ 1 hour.** Task 1 is one command (measured 34 s). Do Task 0 (credentials) the night before if possible.

## Global Constraints

- Desktop Chrome only. Avatar video codec `video/mp4; codecs="avc1.42C020, mp4a.40.2"`.
- Avatar model `gemini-3.8-live` **us-central1 only**. Text models (`gemini-3.8-flash`, `gemini-3.5-flash-lite`) and the scribe (`gemini-3.5-transcribe-live-preview`) **global only**.
- Max 4 investor seats; seats spread over `LIVE_PROJECTS` round-robin; open seats 400 ms apart; never >3 avatars per project.
- Meeting ≤ 10 min: `pitchMinutes + qaMinutes ≤ 8` (pitch 2–6, Q&A 2–4).
- `avatar_config.video_bitrate_bps = 500000`; investor VAD `silence_duration_ms = 1200`.
- The founder's camera never leaves the browser. Only screen-share frames (deduped slides) go to models.
- Theme: neobrutalism **yellow**; font Space Grotesk; IN `#00D696`, OUT `#FF4D50`, info `#7A83FF`. Meeting screen = Teams dark (`#1f1f1f`, top bar `#292929`).
- All route handlers `runtime = 'nodejs'`; report analysis runs in `after()` with `maxDuration = 300`.
- Copy: product name "PitchRoom", tagline "Pitch to an AI investor panel.", CTA "Start pitch →", lobby CTA "Join meeting".
- Investor VAD: `silence_duration_ms 1200` + `end_of_speech_sensitivity END_SENSITIVITY_LOW`. Avatar bitrate: 1 seat 1.5 Mbps, 2 seats 1 Mbps, 3–4 seats 500 kbps.
- Voice confidence (`voiceAnalysis`, default on): ~45 s WAV clips of voiced founder audio → `/api/delivery` (≤4 MB body).

## Review Focus

1. **Avatar quota lockout** — opening >3 avatars in one project (or bursts) locks the project ~10–13 min. Expect: seats spread across 2 projects, sequential connect, a refused seat is dropped with a toast and the meeting continues. Test: Task 7 Step 6 (2-seat e2e) + manual 4-seat run in Task 10.
2. **Founder never interrupted during the pitch** — the mic must go only to the scribe in `pitch`. Test: e2e transcript has no investor lines between `pitchStart` and `pitchEnd` (Task 7 Step 6 check).
3. **Slow model calls** — fact-check/report latency spikes to 30–60 s. Expect: meeting never blocks on them; report page polls. Test: Task 5 smoke + Task 8 Step 4 (report page shows "Analyzing…" then the report).
4. **Leaving mid-meeting / closing the tab** — sockets must close cleanly (quota) and a report must still be produced. Test: Task 7 Step 7 manual "Leave" check.
5. **No microphone permission / non-Chrome browser** — Join disabled with a clear message. Test: Task 7 Step 7 manual check.

---

## File Structure

Everything under `reference/` is copied 1:1 into the app root (`pitchroom/`). Responsibilities:

| Path | Responsibility |
|---|---|
| `lib/types.ts` | Shared domain types (config, transcript, claims, report, session record) |
| `lib/catalog.ts` | Avatars, archetypes, voices, stages, limits |
| `lib/config.ts` | zod `SessionConfigSchema`, defaults, seat add/remove |
| `lib/personas.ts` | Investor system instructions (room protocol) |
| `lib/verdict.ts` | "I'm in/out" parser |
| `lib/room/{prompts,transcript,controller}.ts` | Moderator lines, transcript helpers, meeting state machine |
| `lib/live/*` | Browser media: Live WebSocket, investor/scribe sessions, MSE avatar player, mic, slide dedup, recorder |
| `lib/client/{api,supabase}.ts` | Fetch wrappers; browser Supabase (P2) |
| `lib/server/*` | Vertex token + text client, fact-check, floor manager, report, metrics, store (Supabase / file fallback), auth (P2) |
| `app/**` | Pages + route handlers |
| `components/{config,room,report}/*` | UI |
| `public/{avatars,pcm-worklet.js}` | Avatar stills, mic worklet |
| `supabase/migrations/0001_pitch_sessions.sql` | Table, RLS, recordings bucket |
| `tests/*` | Unit, server smoke, e2e |

---

### Task 0: Accounts and credentials (do first; ~20 min)

**Files:** none (cloud setup) → produces `.env.local`

- [ ] **Step 1: Check the avatar quota request**

```bash
T=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $T" -H "x-goog-user-project: ashwanth-459106" \
  "https://cloudquotas.googleapis.com/v1/projects/ashwanth-459106/locations/global/quotaPreferences/avatar-concurrency-us-central1" | grep -E '"(preferredValue|grantedValue|reconciling)"'
```
Expected: `grantedValue` 3 (pending) or 10 (granted). If 10, a single project is enough — keep `LIVE_PROJECTS` anyway.

- [ ] **Step 2: Service account for the server (both projects)**

```bash
gcloud iam service-accounts create pitchroom-live --project=ashwanth-459106 --display-name="PitchRoom Live"
SA=pitchroom-live@ashwanth-459106.iam.gserviceaccount.com
for P in ashwanth-459106 gen-lang-client-0326702225; do
  gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/aiplatform.user --condition=None --quiet
done
gcloud iam service-accounts keys create ~/pitchroom-sa.json --iam-account=$SA
base64 -i ~/pitchroom-sa.json | tr -d '\n' > ~/pitchroom-sa.b64
```
Expected: key file created. (Vertex AI API is already enabled on both projects.)

- [ ] **Step 3: Supabase project**

Create a project at supabase.com (region near Vercel `iad1`/us-east). Then in the SQL editor run `reference/supabase/migrations/0001_pitch_sessions.sql`. Copy: Project URL, publishable/anon key, service-role key.

Expected: table `pitch_sessions` exists with RLS enabled; bucket `recordings` exists (Storage tab).

- [ ] **Step 4: `.env.local` (used in Task 1)**

```bash
GOOGLE_SERVICE_ACCOUNT_JSON=<contents of ~/pitchroom-sa.b64>   # leave unset locally to use ADC instead
LIVE_PROJECTS=ashwanth-459106,gen-lang-client-0326702225
TEXT_PROJECT=ashwanth-459106
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

---

### Task 1: Scaffold the Next app with the neobrutalism theme

**Files:**
- Create: `pitchroom/` (create-next-app), `components/ui/*` (shadcn CLI), `lib/utils.ts` (CLI)
- Modify: `package.json` (scripts), `pnpm-workspace.yaml` (allowBuilds)

**Interfaces:** Produces the app skeleton every later task copies into; `@/` alias → app root.

- [ ] **Fast path (do this; Steps 1–6 below are what it automates, for debugging only)**

```bash
sh ~/Projects/"Supabase Hackathon"/reference/scripts/bootstrap.sh ~/Projects/pitchroom
cp ~/path/to/.env.local ~/Projects/pitchroom/.env.local   # from Task 0 Step 4
cd ~/Projects/pitchroom && git init && git add -A && git commit -m "feat: scaffold PitchRoom from reference"
```
Expected output ends with `ℹ pass 16`, `ℹ fail 0`, `✓ next build`, `✓ … is ready` (~35 s). Then skip to Task 2.

- [ ] **Step 1: Create the app**

```bash
cd ~/Projects && CI=1 pnpm dlx create-next-app@latest pitchroom --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes
cd pitchroom
```
Expected: `pitchroom/` with `app/`, Next 16.x, React 19.x.

- [ ] **Step 2: Theme + UI components**

```bash
CI=1 pnpm dlx shadcn@latest init https://neobrutalism.dev/r/styling/yellow.json --yes
CI=1 pnpm dlx shadcn@latest add --yes --overwrite $(for c in card input textarea select switch label badge accordion progress dialog tooltip radio-group skeleton alert table toast; do printf "https://neobrutalism.dev/r/%s.json " $c; done)
ls components/ui
```
Expected: `accordion alert badge button card dialog input label progress radio-group select skeleton switch table textarea toast tooltip`.

- [ ] **Step 3: Dependencies**

```bash
printf "allowBuilds:\n  '@google/genai': true\n  esbuild: true\n  protobufjs: true\n  sharp: false\n  unrs-resolver: false\n" > pnpm-workspace.yaml
pnpm add @azure/communication-react @fluentui/react zod @google/genai google-auth-library @supabase/supabase-js @supabase/ssr server-only
pnpm add -D tsx playwright
```
Expected: installs with peer-dependency warnings for React 19 (ACS declares React <19 — this is fine, verified). pnpm 11 exits 1 if those build scripts aren't approved first — that's why `pnpm-workspace.yaml` is written before `pnpm add`.

- [ ] **Step 4: Copy the reference code and env**

```bash
REF=~/Projects/"Supabase Hackathon"/reference
cp -R "$REF"/{app,components,lib,public,supabase,tests} .
cp "$REF"/proxy.ts .
cp ~/path/to/.env.local .env.local   # from Task 0 Step 4
rm -f app/favicon.ico
echo ".data/" >> .gitignore; echo "tests/e2e/out/" >> .gitignore
```
Note: `cp -R` merges into the generated `app/` and `components/`; `app/layout.tsx`, `app/page.tsx`, `app/globals.css` are overwritten by the reference versions (intended). `components/ui/*` stays as generated.

- [ ] **Step 5: Scripts in `package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "node --import tsx --test tests/unit.test.ts",
  "smoke": "node --conditions=react-server --import tsx tests/smoke-server.ts",
  "e2e": "node tests/e2e/meeting.mjs http://localhost:3917"
}
```

- [ ] **Step 6: Verify the whole thing compiles**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors (lint: 1 warning in the generated `components/ui/badge.tsx`, harmless); route table lists `/`, `/room/[id]`, `/report/[id]`, 9 `/api/*` routes, `/login`, `/history`, `/auth/*`, and `ƒ Proxy (Middleware)`.

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "feat: scaffold PitchRoom from reference"
```

---

### Task 2: Shared logic + unit tests

**Files (already copied in Task 1):** `lib/types.ts`, `lib/catalog.ts`, `lib/config.ts`, `lib/personas.ts`, `lib/verdict.ts`, `lib/room/prompts.ts`, `lib/room/transcript.ts`, `lib/live/dhash.ts`, `lib/server/metrics.ts`, `tests/unit.test.ts`, `tests/fixtures/*`

**Interfaces:**
- Produces: `SessionConfigSchema`, `DEFAULT_CONFIG`, `addSeat(seats)`, `removeSeat(seats, id)`, `totalMinutes(c)`, `buildInvestorInstruction(config, seat, isHost)`, `moderator.*`, `pitchPacketText(c, pitch, claims, slideCount)`, `roomLine(line)`, `formatLine/formatTranscript/mmss/takeNewText`, `parseVerdict(text)`, `dhash(gray)`, `SlideDeduper.offer(hash)`, `computeMetrics(segs, founder, investors, pitchEndSec)`, `toSegments(lines)`.

- [ ] **Step 1: Run the unit tests**

Run: `pnpm test`
Expected: `tests 16 … pass 16 fail 0` — including "metrics match the Python spike exactly" (WPM 128.6, fillers 74, Q&A share 0.52), the WAV header and the VoiceSampler.

- [ ] **Step 2: If you change persona wording, re-run** `pnpm test` (the persona test pins the room protocol and host addendum).

- [ ] **Step 3: Commit** — `git commit -am "test: shared logic passes"` (only if anything changed).

---

### Task 3: Server — Vertex token, text agents, persistence, API routes

**Files (copied):** `lib/server/{vertex,floor,fact-check,delivery,report,metrics,store,auth}.ts`, `app/api/**/route.ts`, `tests/smoke-server.ts`, `tests/fixtures/{confident,hesitant}.wav`

**Interfaces:**
- `liveToken(): Promise<LiveToken>` · `textClient()` · `analyzeDelivery(wavBase64, {startSec, phase, founderName}): Promise<DeliveryChunk>` · `decideHands(recent, seats)` · `decideTurn({recent, seats, current, questionCounts, queuedHands})` · `factCheck(chunk): Promise<Claim[]>` · `generateReport({config, transcript, claims, verdicts, metrics})` · `createSession/getSession/updateSession/listSessions/recordingUploadUrl/recordingViewUrl`.
- HTTP contract: spec §9 table.

- [ ] **Step 1: Server smoke against real Vertex**

Run: `pnpm smoke`
Expected (latencies vary a lot; 1–60 s is normal):
```
✔ live token
✔ floor: hands        (hands from 1–3 investors, quoting "four trillion" / "Toast")
✔ floor: turn         (thread_finished true, next_speaker ≠ Ben)
✔ delivery: confident voice / hesitant voice   (e.g. "confident 9/10 vs hesitant 2/10")
✔ fact-check          ([contradicted/high] … Toast … → ≥1 urls)
✔ report              (score ~50–65, Ben:out Kai:in Vera:in, 3 fixes)
ALL SERVER SMOKE TESTS PASSED
```

- [ ] **Step 2: Persistence through the API (Supabase env set)**

```bash
pnpm dev --port 3917 &
curl -s -X POST localhost:3917/api/sessions -H 'content-type: application/json' \
  -d '{"founderName":"Priya","startupName":"Mise AI","oneLiner":"Inventory AI","stage":"seed","raising":"","pitchMinutes":4,"qaMinutes":3,"showTimer":true,"oneMinuteWarning":true,"captions":true,"factCheck":true,"record":false,"vocabulary":[],"seats":[{"id":"seat-1","avatar":"Vera","archetype":"chair","voice":"Kore","toughness":"balanced"}]}'
```
Expected: `{"id":"<uuid>"}` and a row in Supabase `pitch_sessions` with status `created`. Then:
```bash
curl -s localhost:3917/api/sessions/<uuid> | head -c 200      # → {"id":…,"status":"created",…}
curl -s localhost:3917/api/live-token | head -c 120             # → {"accessToken":"ya29…","projects":[…]}
curl -s -X POST localhost:3917/api/sessions -H 'content-type: application/json' -d '{"pitchMinutes":6,"qaMinutes":4}'
```
Expected last: HTTP 400 `{"error":…}`.

- [ ] **Step 3: Commit** — `git commit -am "feat: server routes verified"` (if changed).

---

### Task 4: Config page

**Files (copied):** `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `components/app-header.tsx`, `components/config/{config-form,seat-card,pill-group}.tsx`, `public/avatars/*.jpg`

**Layout contract (spec §6):** header (🦈 PitchRoom left; History/Sign in right only when Supabase public env set) → hero (H1 "Pitch to an AI investor panel.", sub "Get grilled. Get a verdict. Get better.", stacked 40px avatar circles right) → Card "Your startup" (2-col: Your name, Startup name; full-width One-liner with n/200 counter; Stage select; Raising) → Card "Session" (Pitch length pills 2–6, Q&A pills 2–4 with disabled pills + tooltip "Meetings are capped at 10 minutes", 3 switches, "Total meeting ≈ N min (max 10)") → Card "Your panel" (badge n/4, 2-col SeatCards, dashed "+ Add investor") → Accordion "Advanced" (fact-checking, record, words to listen for) → sticky footer (summary left, "Start pitch →" right).

- [ ] **Step 1: Visual check**

Run: `pnpm dev --port 3917`, open http://localhost:3917.
Expected: the layout above; avatars Vera (HOST), Kai, Ben, Leo; removing Kai leaves 3 seats renumbered; "+ Add investor" re-adds the first unused avatar.

- [ ] **Step 2: Validation behavior**

Click "Start pitch →" with empty fields → toast "Check the highlighted fields" and red messages "Enter your name", "Enter your startup name", "Describe your startup in one line". Choose pitch 6 → Q&A pills 3 and 4 disabled.

- [ ] **Step 3: Happy path** — fill fields → "Start pitch →" → spinner "Creating room…" → URL `/room/<uuid>`. Reload `/` → fields restored from `localStorage['pitchroom:config']`.

- [ ] **Step 4: Commit** — `git commit -am "feat: config page"` (if changed).

---

### Task 5: Browser media layer

**Files (copied):** `lib/live/{base64,live-socket,avatar-player,investor-session,scribe-session,mic,dhash,slides,wav,voice-sampler,recorder}.ts`, `public/pcm-worklet.js`

**Interfaces:**
- `new LiveSocket(url, setup)` → `.ready`, `.send(msg)`, `.sendAudio(b64)`, `.sendTurn(parts, turnComplete)`, `.close()`, `onMessage`, `onDrop`; `LiveSetupError.capacity`.
- `new InvestorSession({project, location, accessToken, avatar, voice, instruction})` → `.player.element`, `.ready`, `.sendAudio`, `.addContext(text, images?)`, `.prompt(text)`, `.close()`, callbacks `onSpeaking/onOutputText/onInputText/onFounderLine/onTurnComplete/onDrop`.
- `new ScribeSession(project, token, vocabulary)` → `.ready`, `.start()`, `.sendAudio`, `.end(timeoutMs) → Promise<string>`, `.text`, `onText`.
- `new MicCapture()` → `.start(deviceId?)`, `.setMuted(b)`, `.stop()`, `.level`, `.stream`, `onChunk(b64, rms)`, `onLevel(rms)`.
- `new VoiceSampler()` → `.push(b64, rms, nowMs): VoiceClip | null`, `.flush(): VoiceClip | null`; `pcm16ToWav(chunks)`.
- `new SlideCapture(video, clock)` → `.start()`, `.stop()`, `onSlide(slide)`; `startScreenShare()`.

- [ ] **Step 1:** `pnpm typecheck` → no errors.
- [ ] **Step 2:** These units are exercised end-to-end in Task 7 Step 6. No separate test.

---

### Task 6: Room controller

**Files (copied):** `lib/room/controller.ts`, `lib/client/api.ts`

**Interfaces:** `new RoomController(sessionId, config)` → `subscribe(fn)`, `getState(): RoomState`, `phase`, `mic: MicCapture`, `setHandlers({onNotice, onEnded})`, `start()`, `setMicMuted(b)`, `startSlides(video)`, `stopSlides()`, `skipIntro()`, `donePitching()`, `end(endedBy)`, `dispose()`. `RoomState = { phase, seats: SeatState[], hostId, floorId, phaseEndsAt, caption, micMuted, sharing, error }`.

Behavior contract = spec §7.3 routing table + intro/pitch/Q&A/verdict/ended steps. Turn-taking safeguards (all verified in e2e): nudge after 3.5 s of floor-holder silence, interrupted turns count only with a `?`, used hand-raises never re-sent, last-follow-up wrap-up instruction. Key constants: `NUDGE_MS 3500`, `DELIVERY_WAIT_MS 8000`, `SEAT_STAGGER_MS 400`, `CONNECT_TIMEOUT_MS 20000`, `CHUNK_MS 60000`, `INTRO_CAP_MS 60000`, `MAX_FOLLOW_UPS 2`, `VERDICT_TIMEOUT_MS 20000`, `MAX_PACKET_SLIDES 12`, Q&A → verdict when < 45 s left.

- [ ] **Step 1:** `pnpm typecheck` → no errors. Verified end-to-end in Task 7.

---

### Task 7: Room UI (lobby + Teams meeting)

**Files (copied):** `app/room/[id]/page.tsx`, `components/room/{room,lobby,meeting,top-bar,overlays}.tsx`

**Layout contract (spec §7.1–7.2):** Lobby — left card "Check your setup" (mirrored 16:9 camera preview, mic meter, Mic on/off + Camera on/off buttons, Camera/Microphone selects, mic-denied alert with "Try again"); right column "You're pitching to" (seats + HOST + toughness badges), startup summary card, 3-item checklist, full-width "Join meeting" (disabled until mic works), note "Desktop Chrome required. The call opens in full screen." Meeting — fullscreen dark; top bar (brand · phase pill · REC · mm:ss countdown amber ≤60 s, red ≤15 s); ACS VideoGallery `floatingLocalVideo` (screen share takes the stage); captions above the control bar; ControlBar: Mic, Camera, Share, "Skip intro" (intro only), "Done pitching" (pitch only), Leave → confirm dialog ("Stay" / "Leave and get report"); connecting overlay with per-seat status; ended overlay "That's a wrap. Generating your report…".

- [ ] **Step 1: Copy the e2e media fixtures (test only)**

```bash
mkdir -p public/e2e && cp tests/e2e/slide*.jpg public/e2e/
sh tests/e2e/make-founder-wav.sh public/e2e/founder.wav   # macOS `say` + ffmpeg → founder.wav + founder.json (segment offsets)
```
Note: `next start` only serves `public/` files that existed at build time — generate these BEFORE `pnpm build`.
The e2e never touches real devices: `tests/e2e/fake-media.js` replaces getUserMedia/getDisplayMedia in the page
(automated Chrome on macOS hangs on real/fake device capture because of the OS permission check).

- [ ] **Step 2:** `pnpm build && pnpm start -p 3917 &`

- [ ] **Step 3: Manual smoke in your Chrome (with headphones)** — `/` → 1 investor (remove 3), 2-min pitch, 2-min Q&A → Join. Expected: fullscreen; "Investors are joining…" → Vera Ready ✓ → INTRO pill; Vera welcomes you by name and asks you to introduce yourself; after you speak she hands you the floor → PITCH pill + countdown. Share a slides window → it fills the stage. Talk 30 s → "Done pitching" → Vera thanks you → Q&A pill; Vera asks a question; answer → follow-up or next; at the end VERDICT, she says "I'm in/out", tile name gets "— ✅ IN"/"— ❌ OUT" → wrap overlay → `/report/<id>`.

- [ ] **Step 4: Automated e2e (2 investors, fake media)**

Run: `pnpm e2e` (options: `SEATS=4 QA_MIN=3 pnpm e2e`, `SEATS=1 LEAVE=1 pnpm e2e`)
Expected log: phases `JOINING… → INTRO → PITCH → Q&A → VERDICT`; "founder: intro", "founder: pitch segment 1…6", "clicked Done pitching"; one or more "investor asked: …?" followed by "founder: answer N"; `report ready`; `verdicts [["Kai",…],["Vera",…]]`. Screenshots + `session.json` in `tests/e2e/out/`. Takes ~5 min.

- [ ] **Step 5: Check the founder was never interrupted** — in `tests/e2e/out/session.json`, every line with `"phase":"pitch"` has `"speaker":"founder"` except at most the host's single wrap-up line after time is up.

- [ ] **Step 6: Edge checks (manual)** — (a) "Leave" mid-pitch → dialog → "Leave and get report" → report generated from the partial transcript. (b) Open `/room/<new id>` in Safari → red "PitchRoom needs desktop Chrome." and Join disabled. (c) Block the mic for localhost in Chrome site settings → "PitchRoom needs your microphone." + Try again.

- [ ] **Step 7: Commit** — `git commit -am "feat: meeting room"`.

---

### Task 8: Report page

**Files (copied):** `app/report/[id]/page.tsx`, `components/report/{report-view,report-sections}.tsx`

**Layout contract (spec §8, incl. 6b Confidence & delivery):** header row (H1 "Pitch report", "{startup} · {date} · {n} min"; buttons "New setup" neutral + "Pitch again"); processing state (spinner card "Analyzing your pitch… this takes about 30 seconds." + skeletons, polls every 3 s); failed state (alert + "Retry analysis"); hero (yellow score card `NN/100` + label; verdict strip "k of n investors are in" with avatar, IN/OUT/UNCLEAR badge, reason, deciding moment); summary + "Your sharper one-liner" with copy button; Delivery stat grid (Pitch length, Speaking pace, Filler words + top-3 chips, Q&A talk share, Longest answer, Questions asked) + delivery feedback; Score breakdown (8 progress rows); Top 3 fixes (numbered yellow squares, "Say instead:"); Q&A review (Answered well green / Dodged red); Fact-check flags table (only if any); Strengths; Recording (P2); Full transcript accordion.

- [ ] **Step 1:** open the report from Task 7 → all sections render, including "Confidence & delivery" (average x/10, one bar per ~45 s clip, notes); "Copy" on the one-liner shows toast "Copied".
- [ ] **Step 2:** "Pitch again" → new `/room/<id>` with the same config.
- [ ] **Step 3:** Supabase row for the session: `status=ready`, `metrics`, `report`, `transcript`, `verdicts` populated.
- [ ] **Step 4: Commit** — `git commit -am "feat: report page"`.

---

### Task 9: Deploy to Vercel

**Files:** none new.

- [ ] **Step 1:** `vercel link` (new project `pitchroom`), then add env vars for Production + Preview:

```bash
for k in GOOGLE_SERVICE_ACCOUNT_JSON LIVE_PROJECTS TEXT_PROJECT NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  vercel env add $k production < <(grep "^$k=" .env.local | cut -d= -f2-)
done
vercel --prod
```
Note: `GOOGLE_SERVICE_ACCOUNT_JSON` must be the base64 (or raw JSON) key — ADC does not exist on Vercel. Fluid compute must be on (default) so `maxDuration = 300` applies to `/finish`.

- [ ] **Step 2: Prod smoke** — `curl -s https://<app>.vercel.app/api/live-token | head -c 80` → `{"accessToken":"ya29…`. Then run one 1-investor meeting on the prod URL (Task 7 Step 3 flow).

- [ ] **Step 3: Commit/tag** — `git tag demo-1`.

---

### Task 10: Full-panel rehearsal + demo checklist

- [ ] **Step 1:** 4 investors (Vera, Kai, Ben, Leo), 3-min pitch, 3-min Q&A, real deck shared. Expected: all 4 tiles Ready (2 per project); hand-raise ✋ badges appear during the pitch within ~60–70 s of a dubious claim; Q&A starts with the first raised hand; every investor gives a verdict.
- [ ] **Step 2: If a seat shows "Couldn't join (avatar capacity)"** — wait 10–13 min (lockout) or drop to 3 seats; check `LIVE_PROJECTS` has both projects.
- [ ] **Step 3: Demo script (≤ 8 min):** config page (10 s) → Join → intro → 2-min pitch with one deliberately false claim ("Toast went bankrupt") → watch ✋ → Q&A (investor challenges the claim) → verdicts → report (score, verdicts, fact-check flag on the Toast claim, top 3 fixes).
- [ ] **Step 4:** Use headphones on stage; close other tabs; Chrome only; keep a pre-generated report URL as backup.

---

### Task 11 (P2, only if time): Auth + history, recording

**Files (copied):** `proxy.ts`, `lib/server/auth.ts`, `lib/client/supabase.ts`, `app/login/page.tsx`, `app/history/page.tsx`, `app/auth/{callback,signout}/route.ts`, `lib/live/recorder.ts`, `app/api/sessions/[id]/recording/route.ts`

- [ ] **Step 1: Auth** — In Supabase → Authentication → URL configuration: Site URL = prod URL; add `http://localhost:3917/auth/callback` and `https://<app>.vercel.app/auth/callback` to redirect URLs. Visit `/login`, send magic link, click it → header shows "History" + "Sign out"; new sessions get `user_id`; `/history` lists them with scores.
- [ ] **Step 2: Recording** — enable "Record the meeting" in Advanced → on Join, Chrome asks to share **this tab** (choose it, tick "Share tab audio") → top bar shows ● REC → after the meeting, the report shows a "Recording" video. Note: the mic is mixed into the recording via WebAudio (tab audio alone excludes it).
- [ ] **Step 3: Commit** — `git commit -am "feat: auth, history, recording"`.

---

## Self-review notes

- Spec coverage: §6 → Task 4; §7.1–7.2 → Task 7; §7.3–7.5 → Tasks 5–7; §8 → Task 8; §9 → Task 3; §10 → Task 0/3; §11 → Task 11; §12 → Task 0/9; §13 → Tasks 2/3/7.
- Every code step points at verified reference files; the reference was compiled, linted, built, unit-tested, smoke-tested against Vertex and exercised end-to-end before this plan was written.
