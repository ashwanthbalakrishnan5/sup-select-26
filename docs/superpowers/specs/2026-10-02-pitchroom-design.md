# PitchRoom — Design Spec

**Date:** 2026-10-02 · **Status:** Approved for build (owner asked for autonomous overnight build) · **Owner:** Ashwanth

> "Pitch to an AI investor panel. Get grilled. Get a verdict."

PitchRoom is a web app where a founder joins a video call with up to four AI investors (Gemini Live avatars), pitches uninterrupted for a fixed time while screen-sharing their slides, answers the panel's questions, hears each investor say "I'm in" or "I'm out", and then reads an analysis report.

This spec is the single source of truth for the hackathon build. Every number in it was measured on 2026-10-02 against the real APIs (see §14, "Verified platform facts"). Working reference code for every unit lives in `reference/` and the build plan is `docs/superpowers/plans/2026-10-02-pitchroom.md`.

---

## 1. Goals, non-goals, priorities

### Goals
1. Feel like a real Teams/Meet call: one person talks at a time, others listen and remember.
2. The founder is never interrupted during the pitch.
3. Investors ask sharp, persona-specific questions grounded in what was said and shown (and, optionally, in web fact-checks).
4. Every investor ends with an explicit "I'm in" / "I'm out".
5. A useful report: deterministic delivery metrics + model judgement.
6. Demo-able end to end in under 10 minutes.

### Non-goals (explicitly cut)
- Deck PDF upload (investors only see what is screen-shared, 1 frame/s — realistic by design).
- Replay timeline with markers.
- Custom avatars (allow-list only) and custom voices.
- Mobile / Safari / Firefox support. **Desktop Chrome only.**
- Supabase Edge Functions (all backend runs as Next.js route handlers on Vercel).
- Sending the founder's camera to any model. The camera is local-only (shown in the founder's own tile).
- Investors cutting into a rambling answer.

### Priorities
| P | Features |
|---|---|
| **P0** | Config page, lobby, meeting (4 avatars, Teams UI, fullscreen, timer), intro → pitch → Q&A → verdict flow, floor manager, scribe, slide capture, context sharing, report (metrics + model analysis), Supabase persistence, Vercel deploy |
| **P1** | Live fact-checking (web search), silent hand-raise during pitch, live captions, **vocal confidence analysis** (§7.7) |
| **P2** | Meeting recording (tab capture → Supabase Storage), Supabase Auth + history page |

---

## 2. Architecture

```
Browser (Chrome, Next.js client)                         Vercel (Next.js route handlers)            Google Cloud
┌──────────────────────────────────────────────┐        ┌─────────────────────────────────┐        ┌──────────────────────────────┐
│ RoomController (state machine)               │──GET──▶│ /api/live-token  (SA → OAuth)   │        │ Vertex AI                    │
│  ├─ InvestorSession ×1-4 ──WebSocket(?access_token)────────────────────────────────────────────▶│  gemini-3.8-live (avatar)    │
│  │    └─ AvatarPlayer (MSE <video>)          │        │                                 │        │   us-central1, 2 projects    │
│  ├─ ScribeSession ─────────WebSocket────────────────────────────────────────────────────────────▶│  gemini-3.5-transcribe-live  │
│  ├─ MicCapture (AudioWorklet 16 kHz PCM)     │        │                                 │        │   global                     │
│  ├─ SlideCapture (getDisplayMedia, 1 FPS,    │──POST─▶│ /api/fact-check, /api/delivery  │───────▶│  gemini-3.8-flash (+search / │
│  │   dHash dedup), VoiceSampler (speech)     │──POST─▶│ /api/floor                      │───────▶│  audio) · 3.5-flash-lite     │
│  └─ Transcript                               │──POST─▶│ /api/sessions/[id]/finish       │───────▶│  gemini-3.8-flash (report)   │
│ ACS VideoGallery (Teams UI)                  │        │ /api/sessions (create/get)      │        └──────────────────────────────┘
└──────────────────────────────────────────────┘        │        │                        │        ┌──────────────────────────────┐
                                                        │        └───────────────────────────────▶│ Supabase Postgres + Storage  │
                                                        └─────────────────────────────────┘        └──────────────────────────────┘
```

- **Realtime media never touches Vercel.** The browser opens WebSockets directly to Vertex AI using a short-lived OAuth access token minted by `/api/live-token` (Vercel can't hold long-lived sockets).
- **All text-model calls go through Vercel route handlers** (service-account credentials stay server-side).
- **Supabase** stores sessions (config, transcript, verdicts, fact-checks, metrics, report) and optional recordings. The browser never talks to Supabase directly, except the optional auth flow (P2) and the signed recording upload (P2).

---

## 3. Pages & routes

| Route | Type | Purpose | Theme |
|---|---|---|---|
| `/` | Client page | Config ("Set up your pitch") | Neobrutalism |
| `/room/[id]` | Server page → client `Room` | Lobby → Meeting (fullscreen) → "Generating report" | Lobby: neobrutalism; Meeting: Teams (ACS Fluent) |
| `/report/[id]` | Server page → client `ReportView` | Report (polls while processing) | Neobrutalism |
| `/history` (P2) | Server page | List of the signed-in user's sessions | Neobrutalism |
| `/login` (P2) | Client page | Supabase magic-link sign-in | Neobrutalism |

Global layout (`app/layout.tsx`): `<html lang="en">`, font **Space Grotesk** (`next/font/google`, weights 400/500/700, CSS var `--font-sans`), `<body class="bg-background text-foreground antialiased">`, `<ToastProvider>` mounted once. Page title template: `%s · PitchRoom`. Favicon: 🦈 emoji SVG.

Theme: neobrutalism **yellow** palette (`pnpm dlx shadcn@latest init https://neobrutalism.dev/r/styling/yellow.json`): background `hsl(54 92% 88%)`, main `hsl(49 100% 49%)`, 2px black borders, `4px 4px 0 0 #000` shadows, radius 5px. Status colors used across the app: **IN/success** `#00D696` (chart-4), **OUT/danger** `#FF4D50` (chart-3), **info** `#7A83FF` (chart-2).

---

## 4. Domain model (shared types — `reference/lib/types.ts`)

```ts
type Stage = 'pre-seed' | 'seed' | 'series-a' | 'series-b+';
type Toughness = 'gentle' | 'balanced' | 'brutal';
type AvatarName = 'Vera' | 'Paul' | 'Kai' | 'Ben' | 'Leo';
type ArchetypeId = 'chair' | 'technical' | 'numbers' | 'angel' | 'shark';
type Phase = 'lobby' | 'connecting' | 'intro' | 'pitch' | 'qa' | 'verdict' | 'ended';

interface SeatConfig { id: string /* 'seat-1'..'seat-4' */; avatar: AvatarName; archetype: ArchetypeId; voice: VoiceName; toughness: Toughness; }
interface SessionConfig {
  founderName: string;          // 1–40 chars, used by investors to address the founder
  startupName: string;          // 1–60
  oneLiner: string;             // 1–200
  stage: Stage;
  raising: string;              // free text, 0–30, e.g. "$2M seed"
  pitchMinutes: 2 | 3 | 4 | 5 | 6;
  qaMinutes: 2 | 3 | 4;
  showTimer: boolean;           // default true
  oneMinuteWarning: boolean;    // default true
  captions: boolean;            // default true (P1)
  factCheck: boolean;           // default true (P1)
  voiceAnalysis: boolean;       // default true (P1) — vocal confidence analysis, §7.7
  record: boolean;              // default false (P2)
  vocabulary: string[];         // ≤ 20 terms, each ≤ 40 chars; product/company names for transcription
  seats: SeatConfig[];          // 1–4; seats[0] is the host ("Chair" role is forced on seat 1)
}
interface TranscriptLine { id: string; t: number /* ms since meeting start */; endT: number; speaker: 'founder' | string /* seat id */; name: string; text: string; phase: Phase; }
interface Slide { id: string; t: number; jpegBase64: string /* ≤ 768px long side, quality 0.7 */; }
interface HandRaise { seatId: string; question: string; t: number; }
interface Claim { claim: string; timestamp: string; verdict: 'supported' | 'contradicted' | 'unverifiable'; severity: 'low' | 'medium' | 'high'; evidence: string; sources: string[]; source_urls: string[]; investor_question: string; }
interface Verdict { seatId: string; name: string; decision: 'in' | 'out' | 'unclear'; text: string; }
interface DeliveryChunk { startSec: number; phase: 'pitch'|'qa'; confidence: number; energy: number; clarity: number; pace: 'slow'|'natural'|'fast'; hesitations: number; note: string; moments: { at_seconds: number; observation: string }[]; }
type SessionStatus = 'created' | 'live' | 'processing' | 'ready' | 'failed';
```

Validation: `zod` schema `SessionConfigSchema` in `reference/lib/config.ts`; the **total-time rule** is `pitchMinutes + qaMinutes ≤ 8` (intro ≈ 45 s + verdict ≈ 60 s keep the meeting ≤ 10 min, the Live API connection lifetime).

---

## 5. Investor panel

### 5.1 Avatars (only these five prebuilt names exist — verified by probing 160 names)
| Avatar | Look (verified stills in `reference/public/avatars/*.jpg`) | Default archetype | Default voice |
|---|---|---|---|
| **Vera** | Realistic, silver bob, black high-neck | Chair (host) | `Kore` (firm) |
| **Kai** | Stylized, young, sunglasses on head | Technical skeptic | `Puck` (upbeat) |
| **Ben** | Stylized, young, beard, olive jacket | Numbers hawk | `Charon` (informative) |
| **Leo** | Stylized, older, beret, scarf | Founder-friendly angel | `Algieba` (smooth) |
| **Paul** | Realistic, senior, suit and tie | The Shark | `Algenib` (gravelly) |

Default panel = seats `[Vera, Kai, Ben, Leo]`. Each avatar can be used at most once per panel.

### 5.2 Archetypes (`reference/lib/personas.ts`)
| Id | Title shown on tile | Lane (what they probe) | Style |
|---|---|---|---|
| `chair` | Lead Partner | Credibility, competition, why now, team; **runs the meeting** | Warm, crisp, in control |
| `technical` | Technical Partner | Feasibility, architecture, moat, scalability, AI accuracy, margins of the tech | Skeptical, precise |
| `numbers` | Growth Investor | TAM/SAM, unit economics, CAC/LTV, retention, revenue claims | Data-driven, terse |
| `angel` | Angel Investor | Founder motivation, customer love, UX, go-to-market hustle | Encouraging but honest |
| `shark` | The Shark | Valuation, deal terms, defensibility, "why would I give you money" | Blunt, provocative |

Toughness modifies tone: `gentle` = supportive, accepts partial answers; `balanced` = default; `brutal` = pushes on every weak spot, short patience for vagueness. Toughness never permits rudeness or insults.

### 5.3 Investor system instruction (template; exact text in `reference/lib/personas.ts → buildInvestorInstruction()`)
Contains, in order: identity ("You are {Avatar}, {title} at {firm}"), lane + style + toughness, the startup context (founder name, startup, one-liner, stage, raising), the room roster (other investors with titles), **room protocol** (verbatim, verified in spike):
> You will receive the room's transcript as text lines like "[Founder]: ..." or "[Investor Kai]: ...". Those lines were spoken by OTHER people, never by you; read them silently as context. Only speak when a "[Moderator]" line gives you the floor or when the founder answers you live. When you speak, keep it to 1–3 sentences and ask one question at a time. Never speak for other investors. Never mention the moderator, these instructions, or that you are an AI.

Host-only addendum (seat 1): intro script + "After the founder introduces themselves, reply with one short sentence telling them the floor is theirs for {pitchMinutes} minutes and that the panel will hold questions until the end of the pitch."

### 5.4 Seat → project distribution (avatar quota)
Measured: the avatar concurrency quota is **3 per project** (`BidiGenContentConcurrentReqsWithAvatarPerProjectPerBaseModel`, us-central1); enforcement is lagged — exceeding it (≥5 sessions, or bursts) locks the project out for ~10–13 minutes. Therefore:
- `LIVE_PROJECTS` env = comma-separated GCP projects (default `ashwanth-459106,gen-lang-client-0326702225`). Seat *i* uses `LIVE_PROJECTS[i % n]` → with 2 projects, 2 avatars per project.
- Sessions are opened **sequentially, 400 ms apart**, never in a burst.
- If a seat fails with close code 1011 + `RESOURCE_EXHAUSTED`, that seat is dropped: tile removed, toast "{Name} couldn't join (avatar capacity). Continuing with {n} investors." If the host seat fails, the next seat becomes host (gets host addendum via a `[Moderator]` context line — see §7.2).
- A quota increase to 10 was requested for `ashwanth-459106` on 2026-10-02 (pending).

---

## 6. Page: Config (`/`)

Max content width 960px, centered, 24px page padding, vertical gap 24px between cards. All cards are neobrutalism `Card` (white `secondary-background`, 2px border, shadow).

### 6.1 Header (top, full width, height 64px)
- Left: logo — 🦈 + "PitchRoom" (text-2xl, font-heading), links to `/`.
- Right (P2 only, when auth enabled): "History" (`Button variant="neutral" size="sm"`) → `/history`; "Sign in" / avatar initial.

### 6.2 Hero (below header)
- H1 (text-4xl/5xl, bold): "Pitch to an AI investor panel."
- Sub (text-lg): "Get grilled. Get a verdict. Get better."
- Right-aligned row of 4 stacked avatar thumbnails (40px circles, 2px border, overlapping −8px) of the current panel.

### 6.3 Card 1 — "Your startup"
Two-column grid on ≥768px (one column below):
| Field | Control | Placeholder | Validation |
|---|---|---|---|
| Your name | `Input` | "Priya" | required, ≤40 |
| Startup name | `Input` | "LedgerLoop" | required, ≤60 |
| One-liner (full width) | `Textarea` rows=2 + counter "n/200" bottom-right | "AI that closes the books for small businesses in a day" | required, ≤200 |
| Stage | `Select` (Pre-seed, Seed, Series A, Series B+) | — | default Seed |
| Raising | `Input` | "$2M seed" | optional, ≤30 |

Inline error text (red, text-sm) under the field after first blur / submit attempt.

### 6.4 Card 2 — "Session"
- **Pitch length**: label + `RadioGroup` rendered as 5 pill buttons in a row: `2 · 3 · 4 · 5 · 6 min` (default **4**).
- **Q&A length**: `RadioGroup` pills `2 · 3 · 4 min` (default **3**). Pills that would break `pitch + qa ≤ 8` are disabled with tooltip "Meetings are capped at 10 minutes".
- Toggles (each a row: label left, `Switch` right, helper text below):
  - "Show timer" — "Countdown in the top bar during the call." (default on)
  - "1-minute warning" — "A heads-up when one minute is left." (default on)
  - "Live captions" — "Show what's being said at the bottom of the call." (default on)
- Footer line (text-sm): "Total meeting ≈ {pitch + qa + 2} min (max 10)".

### 6.5 Card 3 — "Your panel"
- Header row: title "Your panel" left; right: badge "{n}/4 investors".
- Grid: 2 columns ≥768px, 1 below. Each **SeatCard**:
  - Top row: avatar image (64×64, square, 2px border) left; name (bold) + title (archetype title) right; "HOST" badge (main color) on seat 1; remove button (`Button size="icon" variant="neutral"`, `X` icon, aria-label "Remove {Name}") top-right on seats 2–4.
  - "Investor" `Select`: the 5 avatars (each avatar disabled if used in another seat).
  - "Role" `Select`: 5 archetypes (seat 1 fixed to "Lead Partner", disabled).
  - "Toughness" `RadioGroup` pills: Gentle · Balanced · Brutal (default Balanced).
  - "Voice" `Select`: the 30 voices shown as "Kore — Firm" (default per avatar from §5.1).
- If seats < 4: a dashed-border "+ Add investor" card (same size) that adds the first unused avatar with its default archetype/voice.

### 6.6 Card 4 — "Advanced" (`Accordion`, collapsed by default)
- "Live fact-checking" `Switch` — "Investors check your claims on the web while you pitch." (default on)
- "Voice confidence analysis" `Switch` — "The panel and your report take into account how confident you sound, not just what you say." (default on)
- "Record the meeting" `Switch` (P2) — "Saves a video of the call to your report. Chrome will ask to share this tab." (default off)
- "Words to listen for" `Input` — comma-separated, helper "Product, company and competitor names. Improves transcription." → `vocabulary[]`.

### 6.7 Sticky footer bar (bottom of viewport, full width, white, top border 2px)
- Left (text-sm): "{n} investors · {pitch} min pitch · {qa} min Q&A".
- Right: primary `Button size="lg"`: "Start pitch →". Disabled while invalid or submitting; shows spinner + "Creating room…" while submitting.
- On click: validate → `POST /api/sessions` → on 200 `router.push('/room/{id}')`; on error toast "Couldn't create the room. Try again."
- Last-used config is saved to `localStorage['pitchroom:config']` on submit and restored on load (wrapped in try/catch).

---

## 7. Page: Room (`/room/[id]`)

Server component loads the session (404 → `notFound()`; status `ready`/`processing` → redirect `/report/{id}`), then renders the client `Room` with the config. `Room` owns a single `RoomController` instance (created in `useRef`, disposed on unmount) and renders by phase.

### 7.1 Lobby (phase `lobby`)
Neobrutalism page, centered two-column layout (≥1024px), 32px gap.
- **Left column (60%)** — "Check your setup":
  - Camera preview: 16:9 box, 2px border, black background, `<video muted playsInline autoPlay>` mirrored (`scale-x-[-1]`). If camera denied: placeholder with `VideoOff` icon and "Camera is off".
  - Mic level meter directly under preview: 8px tall bar, fill width = RMS level, color main; label "Mic" left.
  - Row of two toggle buttons under the meter: "Mic on/off" (`Mic`/`MicOff` icon), "Camera on/off" (`Video`/`VideoOff`). `variant="neutral"`.
  - Two `Select`s side by side: "Camera" (videoinput devices), "Microphone" (audioinput devices). Changing re-acquires the stream.
- **Right column (40%)** — "You're pitching to":
  - List of seats: avatar 48px + name + title + toughness badge.
  - Summary card: startup name, one-liner, "{pitch} min pitch · {qa} min Q&A".
  - Checklist (icons ✓): "Use headphones so investors don't hear themselves", "Open your slides in another window or tab", "Speak clearly — the panel is listening".
  - Primary `Button size="lg" className="w-full"`: **"Join meeting"**. Disabled until microphone permission granted (mic is mandatory; camera optional).
  - Under it, text-xs: "Desktop Chrome required. The call opens in full screen."
- **Unsupported browser banner** (top, `Alert` variant destructive) when `!('MediaSource' in window)` or not Chromium: "PitchRoom needs desktop Chrome." Join disabled.
- On **Join** click (user gesture): `document.documentElement.requestFullscreen()` (ignore rejection) → phase `connecting` → controller.start().

### 7.2 Meeting (phases `connecting` → `intro` → `pitch` → `qa` → `verdict`)
Full-viewport, dark Teams look (`#1f1f1f` background), rendered **client-only** (`next/dynamic`, `ssr:false`) because ACS UI touches `window`.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🦈 PitchRoom · LedgerLoop          [ PITCH ]                  ● REC   03:41   │  TopBar 48px
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐ ┌─────────────┐                                            │
│   │ Vera        │ │ Kai     ✋1 │      (no screen share: 2×2 investor grid,   │
│   │ Lead Partner│ │ Technical   │       local camera floating bottom-right)  │
│   └─────────────┘ └─────────────┘                                            │
│   ┌─────────────┐ ┌─────────────┐      (screen share on: share fills stage,   │
│   │ Ben         │ │ Leo         │       investors in a strip, camera floats)  │
│   └─────────────┘ └─────────────┘                                  ┌──────┐  │
│                                                                    │ You  │  │
│                                                                    └──────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│            Kai: What's your CAC payback on the 62 customers?                 │  Captions row 64px
├──────────────────────────────────────────────────────────────────────────────┤
│                [🎤] [📷] [🖥 Share] [✓ Done pitching]  [📞 Leave]              │  ControlBar
└──────────────────────────────────────────────────────────────────────────────┘
```

- **TopBar** (48px, `#292929`, white text, 16px horizontal padding):
  - Left: "🦈 PitchRoom · {startupName}" (text-sm, 600).
  - Center: phase pill (uppercase, text-xs, 2px white border, rounded-full, px-3): `JOINING…` / `INTRO` / `PITCH` / `Q&A` / `VERDICT`. Pitch pill background `#7A83FF`, Q&A `#FACC00` with black text, Verdict `#00D696` with black text.
  - Right: red dot + "REC" (only when recording) then the **timer** `mm:ss` (tabular-nums, text-lg, 700) when `showTimer`: counts down the current phase's budget during `pitch` and `qa`; hidden in intro/verdict. Color white → amber `#FACC00` at ≤60 s → red `#FF4D50` at ≤15 s.
- **Gallery**: ACS `VideoGallery`, `layout="floatingLocalVideo"`, `localVideoTileSize="16:9"`. Remote participants = active seats in seat order:
  - `userId` = seat id; `displayName` = `"{Avatar} · {Title}"`, suffixed with `" — ✅ IN"` / `" — ❌ OUT"` after the verdict.
  - `isSpeaking` = seat is currently outputting speech (from `outputTranscription` until `turnComplete`/`interrupted`).
  - `raisedHand` = `{ raisedHandOrderPosition: k }` for seats with a queued question (k = queue order, 1-based) — **only shown during `pitch` and `qa`**.
  - `isMuted` = true unless the seat currently holds the floor (visual hint of who is "listening to your mic").
  - `videoStream.renderElement` = the seat's `AvatarPlayer` container `<div>` (wrapping its `<video>`).
  - Local participant = founder: `displayName` = founder name, `videoStream.renderElement` = camera `<div><video muted></div>` (camera never leaves the browser), `isMuted` = mic muted; while sharing: `isScreenSharingOn: true`, `screenShareStream.renderElement` = a **separate** `<div><video muted></div>` bound to the display stream.
  - `dominantSpeakers` = [speaking seat id] when someone speaks.
  - Theme: `FluentThemeProvider` with Teams dark palette (`themePrimary: '#7A83FF'`), `registerIcons(DEFAULT_COMPONENT_ICONS)` once at module load.
- **Captions** (P1, if `captions`): their own fixed 64px row between the gallery and the control bar (never covers tiles or the shared screen), centered, max-width 720px, background `rgba(0,0,0,.75)`, white text-base, 2 lines max (`line-clamp-2`), rounded 6px, `aria-live=polite`. Shows the latest partial line: "**{Name}:** {text}". Empty when no line in the last 6 s.
- **ControlBar** (ACS `ControlBar layout="floatingBottom"`), left→right:
  1. `MicrophoneButton` — toggles mic mute (when muted, no audio goes to any model). Tooltip "Mute (M)" / "Unmute (M)". Keyboard `M`.
  2. `CameraButton` — toggles local camera tile only.
  3. `ScreenShareButton` (labels "Share" / "Stop sharing") — start/stop `getDisplayMedia({video:{frameRate:5}, audio:false})`. Stopping via Chrome's "Stop sharing" bar also updates state.
  4. Custom `ControlBarButton` (only in `intro`): **"Skip intro"** (`Next` icon) → jumps to pitch.
  5. Custom `ControlBarButton` (only in `pitch`): **"Done pitching"** (`CheckMark` icon, primary style) → ends pitch early.
  6. `EndCallButton` — **Leave**. Opens a Teams-styled confirm dialog (dark card, matches the meeting): title "Leave the meeting?", body "The panel will stop here. You'll still get a report on everything so far.", buttons: "Stay" (outline) / "Leave and get report" (red `#C4314B`). Confirm → controller.end('left').
- **Connecting overlay** (phase `connecting`): centered card over the gallery: "Investors are joining…" + one row per seat with avatar 32px, name, and status (`Connecting…` spinner → `Ready ✓` → `Couldn't join ✗`). Dismissed automatically when all seats are ready/failed (≥1 ready) — then intro starts. If 0 seats ready after 20 s: error state "The panel couldn't join. Try again in a few minutes." + "Back to setup" button.
- **Toasts** (top-center over the meeting): "1 minute left" (if `oneMinuteWarning`, at pitch T−60 s and Q&A T−60 s); seat dropped; "Connection to {Name} lost" (unexpected close mid-meeting — seat is dropped and the meeting continues); "Your microphone is muted" when the founder speaks into a muted mic (RMS > threshold for 1 s).
- **Ended overlay** (phase `ended`): full-screen dark overlay: spinner + "That's a wrap. Generating your report…" → exit fullscreen → `router.replace('/report/{id}')` after `/finish` responds (or after 3 s if finish is still running; the report page polls).
- `beforeunload`/`pagehide`: controller closes every WebSocket cleanly (avatar slots must be released — see §5.4).
- The meeting root carries `data-phase` and `data-speaking` (space-separated speaking seat ids) — used by the e2e test and handy for styling.
- Avatar video bitrate by panel size (bigger tiles need more pixels): 1 seat 1.5 Mbps, 2 seats 1 Mbps, 3–4 seats 500 kbps.

### 7.3 Orchestration — `RoomController` (`reference/lib/room/controller.ts`)
Framework-agnostic class (no React). Emits a single `state` snapshot on every change (`subscribe(listener)`), consumed by React via `useSyncExternalStore`.

**Routing table**
| Phase | Founder mic → | Screen frames → | Investors receive |
|---|---|---|---|
| connecting | nobody | nobody | — |
| intro | host seat (live audio) | nobody | others: room lines as context |
| pitch | **scribe only** (+ VoiceSampler) | SlideCapture (dedup) | nothing live; hand-raise + fact-check run on scribe text; delivery analysis on voiced audio |
| qa | **floor holder only** (+ VoiceSampler) | new distinct slides → all seats as context | pitch packet once; room lines + delivery notes as context |
| verdict | nobody | nobody | moderator prompts, one seat at a time |

**Intro**
1. All seats settled → send host: `[Moderator]: {founderName} from {startupName} just joined. Welcome them in one sentence, introduce yourself and the panel ({Name – Title, …}) in under 20 seconds, then ask them to introduce themselves briefly.` (`turn_complete: true`).
2. Host `turnComplete` #1 → mic → host. Founder speaks; host's VAD (silence 1200 ms) ends the founder turn; host replies with the hand-off line (host addendum).
3. Host `turnComplete` #2 (after at least one founder line) → **pitch**. Safety: "Skip intro" button, or 60 s intro cap → send host `[Moderator]: Tell {founderName} in one sentence that the floor is theirs for {pitchMinutes} minutes.` → on its turnComplete → pitch.
All intro lines (host output transcription, founder input transcription from the host session) go to the transcript and are broadcast to the other seats as context.

**Nudge (intro + Q&A).** 3.8 Live's proactive audio can decide to stay silent. When the floor-holder's session reports `voiceActivity: ACTIVITY_END` and it hasn't started speaking 3.5 s later while founder speech is pending, the controller prompts it: intro → hand-off line; Q&A → `[Moderator]: {Name}, {founder} has finished answering. Respond now: if the answer was vague or dodged your question, ask one short follow-up question; otherwise thank them in one short sentence.` `ACTIVITY_START` or the seat starting to speak cancels the nudge. A founder line's start time is the `ACTIVITY_START` time (transcription only arrives at the end of speech).

**Pitch** (timer = `pitchMinutes × 60`)
1. Stop routing mic to host. Scribe: `activity_start`; mic → scribe.
2. SlideCapture runs if screen sharing (any time sharing starts during the pitch).
3. Every **60 s** of pitch (and at pitch end), take the scribe text added since the last chunk (`interimInputTranscription` is cumulative — diff by length) → in parallel (fire-and-forget, each ≤30 s, results applied when they arrive):
   - `POST /api/floor {mode:'hands'}` → for each returned `{investor, question}`: if that seat has no queued question yet, queue it (`HandRaise`), assign next order number → tile shows ✋k.
   - `POST /api/fact-check` (if `factCheck`; client timeout 45 s) → append claims.
4. T−60 s → toast "1 minute left".
5. End triggers: timer reaches 0 **or** "Done pitching". Then: send `activity_end` to scribe and wait ≤3 s for final `inputTranscription` (else use last interim). Send host: (timer) `[Moderator]: Time is up. Politely stop {founderName}, thank them in one sentence, and say the panel will now ask questions.` / (done) `[Moderator]: {founderName} has finished the pitch. Thank them in one sentence and say the panel will now ask questions.` → on host turnComplete → **qa**.

**Q&A** (timer = `qaMinutes × 60`)
1. Build the **pitch packet** once and send to every seat as one `client_content` user turn (`turn_complete:false`): text `"[Scribe] {founderName}'s full pitch transcript:\n[Founder]: …\n[Scribe] Fact-check notes from the panel's research:\n- {claim} → {verdict}: {evidence}\n[Scribe] Slides shown during the pitch, in order:"` followed by one `inline_data` (image/jpeg) part per distinct slide (max 12, most recent if more). Fact-check section omitted when disabled or empty. Before sending, Q&A start waits ≤8 s for in-flight delivery analyses; if any pitch clips were analyzed the packet adds `[Scribe] How {founder} sounded while pitching (you heard this tone of voice in the room):` + one line per clip (`confidence 7/10, energy 6/10, natural pace — {note}`).
2. Pick the first speaker: the seat with hand order 1; else the first non-host seat; else host.
3. **Give the floor** to seat S: route mic → S; send S `[Moderator]: {S.name}, you have the floor. {If S's hand is still raised: "You raised your hand to ask about: {question}. "}Ask {founderName} one question, under 25 words.` (`turn_complete:true`); lower S's hand. (A used hand-raise is never re-sent — otherwise the investor repeats the question verbatim.)
4. Track per-seat `questionsAsked` and per-thread `{asked, followUps, founderAnswered}`. S's first `turnComplete` after getting the floor is its question (`asked = true`); founder speech only counts as an answer after that. An interrupted turn (the founder barged in) counts only if its text contains `?`; the bare `turnComplete` the server sends after `interrupted` is ignored.
5. When S `turnComplete`s after the founder has answered at least once in this thread → floor decision:
   - Code rules first: (a) Q&A time left < 45 s → **verdict**; (b) `followUps ≥ 2` → thread finished; (c) S's last line has no `?` → thread finished.
   - Otherwise `POST /api/floor {mode:'turn', …}` (2 s client timeout → fallback: thread finished, next = least-asked seat ≠ S).
   - Not finished → S keeps the floor (founder answers the follow-up; S's VAD continues). `followUps += 1`; when it reaches 2, S silently gets `[Moderator]: After {founder}'s next answer, do not ask another question — thank them in one short sentence.` (so its last reply isn't an orphaned question).
   - Finished → next seat = decision.next_speaker (guarded: must be active and ≠ S unless only one seat) → give floor (step 3).
6. Room lines: every finalized line (founder answer = S's `inputTranscription` accumulated until S starts speaking; S's question = S's `outputTranscription` accumulated until `turnComplete`) is appended to the transcript and sent to every **other** seat as `[Founder]: …` / `[Investor {Name}]: …` (`turn_complete:false`).
7. New distinct slides during Q&A → sent to all seats as `[Scribe] New slide shown:` + image (`turn_complete:false`).
8. Timer reaches 0 → if a seat is speaking, wait for its turnComplete (max 8 s) → **verdict**.

**Verdict**
1. Mic → nobody. Hands cleared.
2. For each seat in order: non-host seats first (seat order), host last. Send `[Moderator]: Q&A is over. {Name}, give your decision now. Start with exactly "I'm in" or "I'm out", then give one or two sentences on why. Do not ask questions.` Host's prompt appends: ` Then thank {founderName} and close the meeting in one sentence.`
3. Wait for `turnComplete` (timeout 20 s → decision `unclear`). Parse `/\bI(?:'| a)?m\s+(in|out)\b/i` on the seat's output text → `in`/`out`/`unclear`. Update tile suffix immediately.
4. After the last seat → wait 1.5 s → **ended**.

**Ended**
1. Stop timer, mic, slide capture, recording (P2: upload). Close every WebSocket cleanly.
2. Flush the VoiceSampler, wait ≤8 s for in-flight delivery analyses, then `POST /api/sessions/{id}/finish` with `{ transcript, verdicts, factChecks, deliveries, handRaises, timings: {meetingStart, pitchStart, pitchEnd, qaStart, qaEnd, end}, endedBy: 'complete'|'left'|'error' }` (also saved to `sessionStorage['pitchroom:finish:{id}']` for retry). The route answers immediately (`processing`).
3. Exit fullscreen; navigate to `/report/{id}`.

**Leave mid-meeting** → skip to step "Ended" with `endedBy:'left'` (report still generated from what exists).

### 7.4 Live session configs (exact; verified)
**Investor** (`wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=…`):
```json
{ "setup": {
  "model": "projects/{project}/locations/us-central1/publishers/google/models/gemini-3.8-live",
  "generation_config": { "response_modalities": ["VIDEO"],
    "speech_config": { "voice_config": { "prebuilt_voice_config": { "voice_name": "{voice}" } } } },
  "avatar_config": { "avatar_name": "{avatar}", "video_bitrate_bps": 500000 },
  "system_instruction": { "parts": [{ "text": "{instruction}" }] },
  "input_audio_transcription": {},
  "output_audio_transcription": {},
  "realtime_input_config": { "automatic_activity_detection": { "silence_duration_ms": 1200, "end_of_speech_sensitivity": "END_SENSITIVITY_LOW" } }
} }
```
`video_bitrate_bps` depends on panel size (see §7.2). `END_SENSITIVITY_LOW` cut investor cut-ins at mid-sentence pauses from 2 to ≤1 per Q&A in the e2e test. Note: sending a `turn_complete:true` prompt to a seat that is speaking interrupts it — the controller only prompts idle seats.
No context-window compression on investors (it can drop the pitch packet; investors get no video input so the 2-minute audio+video limit doesn't apply).

**Scribe** (`wss://aiplatform.googleapis.com/ws/…BidiGenerateContent?access_token=…`, project = first of `LIVE_PROJECTS`):
```json
{ "setup": {
  "model": "projects/{project}/locations/global/publishers/google/models/gemini-3.5-transcribe-live-preview",
  "input_audio_transcription": { "language_codes": ["en-US"], "custom_vocabulary": ["{startupName}", "...vocabulary"] },
  "realtime_input_config": { "automatic_activity_detection": { "disabled": true } }
} }
```
Then `{"realtime_input":{"activity_start":{}}}` at pitch start, 100 ms audio chunks, `{"realtime_input":{"activity_end":{}}}` at pitch end. **One activity per pitch** (back-to-back end/start loses audio). `interimInputTranscription.text` is cumulative (replace, don't append); `inputTranscription.text` is final.

**Client messages** (shared):
- Audio: `{"realtime_input":{"audio":{"mime_type":"audio/pcm;rate=16000","data":"<b64 PCM16 mono 100 ms>"}}}`
- Context (no reply): `{"client_content":{"turns":[{"role":"user","parts":[{"text":"[Founder]: …"}]}],"turn_complete":false}}`
- Prompt (reply): same with `"turn_complete": true`.

**Server messages used**: `setupComplete`; `serverContent.modelTurn.parts[].inlineData` (`video/mp4` chunks → AvatarPlayer); `serverContent.outputTranscription.text` (append); `serverContent.inputTranscription.text` (append for investors; final for scribe); `serverContent.interimInputTranscription.text` (scribe, cumulative); `serverContent.turnComplete`; `serverContent.interrupted`; `voiceActivity.type` (`ACTIVITY_START`/`ACTIVITY_END`); `goAway`; `usageMetadata` (ignored). Server frames arrive as **binary** — always decode with `TextDecoder` when `typeof data !== 'string'`.

### 7.5 Browser media units
- **AvatarPlayer** (`reference/lib/live/avatar-player.ts`): one `MediaSource` + one `SourceBuffer` (`video/mp4; codecs="avc1.42C020, mp4a.40.2"`) per seat for the whole session; append chunks in order through a queue (never while `updating`); never reset between turns; every 5 s: if buffered lead > 0.8 s jump to `end − 0.3`, and `remove(0, currentTime − 10)`. `<video playsInline autoplay>` not muted (avatar audio plays through it). Video is continuous (idle blinking between turns, ~0.76 Mbps at 500 kbps).
- **MicCapture** (`reference/lib/live/mic.ts` + `public/pcm-worklet.js`): `getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,deviceId}})` → `AudioContext({sampleRate:16000})` → AudioWorklet converts Float32 → PCM16, posts 100 ms (1600-sample) chunks → base64 → `onChunk(b64, rms)`. Exposes `level` (RMS 0–1) for the meter and `muted`.
- **SlideCapture** (`reference/lib/live/slides.ts`): every 1000 ms draw the share `<video>` to a canvas (long side ≤768) → 256-bit dHash on a 17×16 grayscale downscale → keep frame when Hamming distance to every kept hash > **40** and the frame is stable (distance to previous frame ≤ 40). Keeps JPEG (quality 0.7) base64. Emits `onSlide(slide)`.
- **VoiceSampler** (`reference/lib/live/voice-sampler.ts` + `wav.ts`): keeps only 100 ms chunks with RMS ≥ 0.015 (+500 ms hangover) of audio that was actually routed to a model in `pitch`/`qa`; every 45 s of speech (or at a phase boundary, if ≥8 s) emits a 16 kHz mono WAV clip (~1.9 MB, ~2.6 MB base64 — inside Vercel's 4.5 MB body limit) with its meeting-clock start.
- **Recorder** (P2, `reference/lib/live/recorder.ts`): `getDisplayMedia({video:{frameRate:24},audio:true,preferCurrentTab:true,selfBrowserSurface:'include',systemAudio:'exclude'})` + mic mixed in via `AudioContext.createMediaStreamDestination()` → `MediaRecorder` (`video/mp4;codecs=avc3,mp4a.40.2` → fallback webm) → Blob → signed upload to Supabase Storage.

### 7.6 Error handling (room)
| Condition | Behavior |
|---|---|
| Mic permission denied | Lobby: Join disabled, inline alert "PitchRoom needs your microphone." + "Try again" button |
| Camera denied / none | Lobby & meeting work; local tile shows initials |
| Screen share cancelled | No-op; investors just don't see slides |
| `/api/live-token` fails | Connecting overlay error "Couldn't reach the panel." + "Back to setup" |
| Seat close 1011 RESOURCE_EXHAUSTED at connect | Drop seat (toast) |
| Seat closes unexpectedly mid-meeting | Drop seat, toast "Connection to {Name} lost"; if it held the floor → give floor to next |
| All seats lost mid-meeting | End meeting → report |
| Scribe fails | Pitch continues; founder pitch transcript falls back to empty with a report note "Pitch transcript unavailable" |
| `goAway` received | Ignore (meeting ≤10 min by config) but log |
| `/api/floor` slow (>2 s) / error | Rule fallback (least-asked seat) |
| `/api/fact-check` slow (>45 s) / error | Drop result silently |
| `/api/delivery` slow (>45 s) / error | Drop that clip silently (report section shows the clips that succeeded; hidden if none) |
| `/finish` fails | Report page shows "Report failed" + "Retry analysis" button (re-POSTs saved transcript from `sessionStorage`) |

### 7.7 Vocal confidence analysis (P1)
**Why:** a confident founder with a confident voice is far more likely to get investors in. Gemini 3.8 Live listens to prosody internally (affective dialogue is always on and no longer configurable) but exposes **no** user-emotion/confidence output, and the investors' sessions never hear the pitch audio (only the scribe does). So PitchRoom measures it explicitly.

**How:** VoiceSampler clips (~45 s of the founder's voiced audio) → `POST /api/delivery {wavBase64, startSec, phase, founderName}` → `gemini-3.8-flash` (global, thinking LOW) **listens to the audio** and returns `DeliveryChunk` JSON: `confidence`, `energy`, `clarity` (1–10), `pace`, `hesitations`, a one-sentence `note` an investor would notice, and ≤3 `moments` with in-clip offsets. Prompt: judge HOW they sound (steadiness, volume, pitch variation, upspeak, hesitations, fillers, long pauses, rushing, trailing off, hedging) not WHAT they say.

**Measured (2026-10-03):** confident TTS clip → 9/10 (energy 8, clarity 9, 0 hesitations); hesitant TTS clip → 2/10 (energy 2–3, clarity 4, 10 hesitations); stable across runs; 3.5–11.7 s per clip.

**Where it shows up:**
1. **Investors** — pitch clips go into the Q&A pitch packet; Q&A clips are broadcast as `[Scribe] How {founder} sounds in their answers: …` as they arrive. Verdicts are influenced by delivery, like real investors.
2. **Report** — "Confidence & delivery" section (§8 item 6b) and the model's `confidence_feedback`.
3. **Privacy** — the founder's voice is sent to Vertex only when `voiceAnalysis` is on (default on, toggle in Advanced).

**Not in scope (needs owner decision):** body-language / facial-expression analysis from the camera (eye contact, posture). The owner earlier decided the camera never goes to a model; reversing that is a one-line change in VoiceSampler's sibling (sample a webcam frame per clip and send it with the audio) but is deliberately not built.

---

## 8. Page: Report (`/report/[id]`)

Server component loads the session; renders `ReportView` (client). If status `processing`/`live`, `ReportView` polls `GET /api/sessions/{id}` every 3 s until `ready`/`failed`.

Layout: max width 1100px, 24px padding, sections separated by 32px.

1. **Header row**: left: H1 "Pitch report" + subline "{startupName} · {date, e.g. Oct 3, 2026 9:41 AM} · {duration} min". Right: `Button variant="neutral"` "New setup" (→ `/`) and `Button` "Pitch again" (POST /api/sessions with the same config → `/room/{newId}`).
2. **Processing state**: `Skeleton` blocks in the shape of sections 3–5 + centered text "Analyzing your pitch… this takes about 30 seconds." with spinner.
3. **Failed state**: `Alert` destructive "We couldn't generate the analysis." + "Retry analysis" button (POST `/api/sessions/{id}/finish` with `{retry:true}` → server re-runs report from stored transcript).
4. **Hero row** (grid 1fr 2fr ≥1024px):
   - **Score card**: big number `{overall_score}` (text-7xl, 700) "/100" + label: ≥80 "Term-sheet ready", 65–79 "Promising", 50–64 "Typical seed pitch", <50 "Needs work". Background main yellow.
   - **Verdict strip**: one card per investor: avatar 56px, name, title, badge **IN** (green `#00D696`) / **OUT** (red `#FF4D50`) / **UNCLEAR** (gray), reason (from model `investor_verdicts.reason`, fallback to spoken verdict text), deciding moment in text-xs italics. Tally above: "{k} of {n} investors are in".
5. **Summary** card: `summary` paragraph + "Your sharper one-liner" sub-card (main-colored border) with `one_liner` and a "Copy" icon button (toast "Copied").
6. **Delivery metrics** grid (3 cols ≥1024px, 2 cols ≥640px): stat cards (big value + label + hint):
   - "Pitch length" — `m:ss` vs target `{pitchMinutes}:00` (hint "On time" / "Over by m:ss" / "Under by m:ss").
   - "Speaking pace" — `{pitch_wpm} wpm` (hint: <120 "Slow", 120–165 "Natural", >165 "Fast").
   - "Filler words" — `{filler_total}` (`{filler_per_100_words}/100 words`; top-3 breakdown chips "um ×12").
   - "Q&A talk share" — `{qa_founder_share×100}%` you vs panel (hint: 40–65% "Balanced").
   - "Longest answer" — `{longest_answer_s} s` (hint >60 s "Too long — aim for 30 s").
   - "Questions asked" — total + per-investor chips.
   Then `delivery_feedback` paragraph below the grid.
6b. **Confidence & delivery** (only if `delivery` has clips): left card "Vocal confidence" = average confidence `x.x/10` (green ≥7, yellow ≥5, red <5) + chips "Energy x/10", "Clarity x/10", "{n} hesitations"; right card "Confidence over the meeting" = one bar per clip (height = confidence×10%, same colors, label `mm:ss pitch|Q&A`, tooltip = note); then `confidence_feedback`; then a list of `[mm:ss] note` per clip and `[mm:ss] observation` per moment.
7. **Score breakdown** card: 8 rows (Problem, Solution, Traction, Market, Team, Delivery, Q&A handling, Credibility): label left (w-40), `Progress` value = score×10, number right "7/10".
8. **Top 3 fixes**: three numbered cards (1, 2, 3 in a 40px main-colored square): **fix** (bold), why (text-sm), "Say instead:" + `example` in a quote block.
9. **Q&A review**: two columns ≥1024px: "Answered well" (green left border) and "Dodged" (red left border). Each item: investor name chip + question (bold) + `"{answer_quote}"` + `[{timestamp}]` + why.
10. **Fact-check flags** (only if any): `Table` columns Claim · Verdict (badge: contradicted red, unverifiable gray, supported green) · Impact · Sources (links "1", "2", … opening `source_urls` in new tab).
11. **Strengths**: bullet list with ✓ icons.
12. **Recording** (P2, if `recording_url`): `<video controls>` 16:9 with 2px border.
13. **Full transcript**: `Accordion` (collapsed) "Full transcript ({lines} lines)": rows `[mm:ss] Name: text`, founder lines bold name in main color.

---

## 9. Backend (Next.js route handlers, Node runtime)

All routes `export const runtime = 'nodejs'`. Errors return `{ error: string }` with proper status. Inputs validated with zod.

| Route | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/api/sessions` | POST | `SessionConfig` | `{ id }` | Inserts `pitch_sessions` row (status `created`, `user_id` if signed in) |
| `/api/sessions/[id]` | GET | — | `{ id, status, config, report?, metrics?, verdicts?, transcript?, fact_checks?, recording_url?, error? }` | Used by report polling |
| `/api/sessions/[id]/start` | POST | — | `{ ok }` | status → `live`, `started_at` |
| `/api/sessions/[id]/finish` | POST | `{ transcript, verdicts, factChecks, handRaises, timings, endedBy }` or `{ retry: true }` | `{ status: 'processing' }` | Saves data, sets status `processing`, responds immediately; then in `after()` (`maxDuration = 300`) computes metrics (code) + report (model, 25–60 s) → status `ready` (or `failed` + error). Measured report latency ranged 26–61 s, so it must not block the response. |
| `/api/live-token` | GET | — | `{ accessToken, expiresAt, projects: string[], liveLocation: 'us-central1', scribeLocation: 'global' }` | Service-account OAuth token (scope `cloud-platform`), cached in-memory until 5 min before expiry. `Cache-Control: no-store` |
| `/api/fact-check` | POST | `{ chunk: string /* "[mm:ss] Founder: …" lines */ }` | `{ claims: Claim[] }` | Two-step (search → structure), `maxDuration = 60` |
| `/api/delivery` | POST | `{ wavBase64 (≤4 MB), startSec, phase: 'pitch'\|'qa', founderName }` | `DeliveryChunk` | `gemini-3.8-flash` listens to the clip; `maxDuration = 60` |
| `/api/floor` | POST | `{ mode:'hands', recent, seats }` or `{ mode:'turn', recent, seats, current, questionCounts, queuedHands }` | hands: `{ hand_raises:[{investor, question}] }`; turn: `{ thread_finished, next_speaker, reason, hand_raises }` | `gemini-3.5-flash-lite`, thinking MINIMAL, server timeout 4 s |
| `/api/sessions/[id]/recording` (P2) | POST | — | `{ path, token, signedUrl }` | Supabase `createSignedUploadUrl('recordings', '{id}.mp4')` |

### 9.1 Text agents (`reference/lib/server/*.ts`, measured)
| Agent | Model / location | Config | Measured |
|---|---|---|---|
| Fact-check step 1 | `gemini-3.8-flash` @ global | `tools:[{googleSearch:{}}]`, thinking LOW, plain text | catches planted false claims 6/6 |
| Fact-check step 2 | `gemini-3.5-flash-lite` @ global | `responseJsonSchema: CLAIM_SCHEMA` | total 3.8–7 s median, spikes to 55 s |
| Floor (hands / turn) | `gemini-3.5-flash-lite` @ global | JSON schema, thinking MINIMAL | 33/36 correct, median 1.09 s |
| Delivery | `gemini-3.8-flash` @ global | inline `audio/wav` + JSON schema, thinking LOW | confident 9/10 vs hesitant 2/10; 3.5–12 s |
| Report | `gemini-3.8-flash` @ global | JSON schema (§9.2), thinking LOW | 26–61 s (spiky) → runs in `after()` |
Text models return 404 in `us-central1` — **always `global`**. Real source URLs come from `candidates[0].groundingMetadata.groundingChunks[].web.uri`, never from model-written JSON.

### 9.2 Report schema
Exactly as `REPORT_SCHEMA` in `reference/lib/server/report.ts`: `overall_score` 0–100; `score_breakdown` {problem, solution, traction, market, team, delivery, qa_handling, credibility} 1–10; `summary` (≤3 sentences); `investor_verdicts[]` {investor, decision in|out|conditional, reason, deciding_moment}; `answered_well[]` / `dodged[]` {investor, question, answer_quote, timestamp, why}; `fact_check_flags[]` {claim, timestamp, verdict, impact}; `delivery_feedback`; `confidence_feedback` (interprets VOCAL_CONFIDENCE); `strengths[]`; `top_fixes` (exactly 3) {fix, why, example}; `one_liner` (<25 words).

### 9.3 Metrics computed in code (`reference/lib/server/metrics.ts`; model estimates were badly wrong: WPM 141 vs 128.6, fillers 34 vs 74)
`pitch_duration_s`, `pitch_wpm`, `qa_answer_wpm`, `founder_words`, `filler_total`, `filler_per_100_words`, `filler_breakdown`, `talk_time_s` per speaker, `qa_founder_share`, `qa_founder_to_investor_ratio`, `longest_answer_s`, `questions_per_investor`, `verdicts_regex`. Fillers: multi-word first (`you know`, `i mean`, `kind of`, `sort of`), then `um uh er ah basically literally honestly`, and `like` excluding verb/preposition uses (`would/I/we/you/they/look(s/ed)/feel(s/t)/seem(s/ed)/sounds/something/just like`, and "like" + Capitalized word).

---

## 10. Data (Supabase)

`reference/supabase/migrations/0001_pitch_sessions.sql`:
- Table `public.pitch_sessions`: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `user_id uuid null references auth.users on delete set null`, `status text not null default 'created' check (status in ('created','live','processing','ready','failed'))`, `config jsonb not null`, `started_at timestamptz`, `ended_at timestamptz`, `ended_by text`, `timings jsonb`, `transcript jsonb`, `verdicts jsonb`, `fact_checks jsonb`, `delivery jsonb`, `hand_raises jsonb`, `metrics jsonb`, `report jsonb`, `recording_path text`, `error text`. Index on `(user_id, created_at desc)`.
- RLS **enabled**; one policy: authenticated users can `select` rows where `user_id = auth.uid()` (history page). All writes go through the server with the service-role key.
- Storage bucket `recordings` (private). Report reads it via a 1-hour signed URL.
- Local dev without Supabase: `lib/server/store.ts` falls back to a JSON file store in `.data/sessions/*.json` when `SUPABASE_SERVICE_ROLE_KEY` is unset (dev only; Vercel must have Supabase env).

## 11. Auth (P2, optional)
Supabase Auth magic link (`@supabase/ssr`). `/login`: email `Input` + "Send magic link" button; success state "Check your email". Header shows "History" + "Sign out" when signed in. Sessions created while signed in store `user_id`. Report URLs stay unguessable-uuid shareable regardless of auth.

## 12. Configuration & environment
| Var | Where | Example |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vercel (server) | full JSON key of `pitchroom-live@ashwanth-459106.iam.gserviceaccount.com` (roles/aiplatform.user on **both** projects). Unset locally → ADC (`gcloud auth application-default login`) |
| `LIVE_PROJECTS` | server | `ashwanth-459106,gen-lang-client-0326702225` |
| `TEXT_PROJECT` | server | `ashwanth-459106` |
| `NEXT_PUBLIC_SUPABASE_URL` | both | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | both (P2 auth) | … |
| `SUPABASE_SERVICE_ROLE_KEY` | server | … |

Security notes: the live access token appears in the WebSocket URL — the service account must only have `roles/aiplatform.user`; never log URLs; token lifetime ≤1 h.

## 13. Testing strategy
- Unit (node:test via `tsx`, 16 tests): `metrics` parity with the Python spike, `dhash`/slide dedup decisions, verdict regex, config validation (total-time rule), seats, persona prompt builder, transcript chunk diffing, WAV header, VoiceSampler, delivery lines in the packet.
- Server smoke (real Vertex, `pnpm smoke`): token, floor (hands + turn), delivery (confident clip ≥4 points above hesitant), fact-check (catches the planted false "Toast is bankrupt" claim), report (valid schema).
- Browser e2e (`pnpm e2e`, real Chrome via Playwright, **in-page fake media** `tests/e2e/fake-media.js` — automated Chrome on macOS hangs on real/fake device capture): a scripted founder (intro → 6 pitch segments → "Done pitching" → answers whenever an investor finishes a question) through config → room → meeting → report. `SEATS=1..4`, `QA_MIN`, `LEAVE=1` (walk out mid-pitch). Verified: 2-seat and 4-seat runs, leave mid-pitch, voice analysis on.
- Manual demo checklist in the plan's final task.

## 14. Verified platform facts (2026-10-02)
| Fact | Value |
|---|---|
| Avatar model | `gemini-3.8-live`, **us-central1 only** (404 in 18 other locations incl. global) |
| Avatars | Ben, Kai, Leo, Vera, Paul (custom avatars allow-list only) |
| Voices | 30 (Zephyr, Kore, Orus, Autonoe, Umbriel, Erinome, Laomedeia, Schedar, Achird, Sadachbia, Puck, Fenrir, Aoede, Enceladus, Algieba, Algenib, Achernar, Gacrux, Zubenelgenubi, Sadaltager, Charon, Leda, Callirrhoe, Iapetus, Despina, Rasalgethi, Alnilam, Pulcherrima, Vindemiatrix, Sulafat) |
| Avatar output | continuous fMP4 (H.264 704×1280 24 fps + AAC 24 kHz mono), init once per session, 16 KB chunks not box-aligned, idle video between turns |
| Bitrate | default ~10 Mbps; `video_bitrate_bps: 500000` → ~0.76 Mbps, fine at tile size |
| Latency | first speech ~1.4 s (text turn), ~1.75 s after founder stops (audio), ~1.5 s browser with live-edge chase; cold first turn ~3.3 s |
| Barge-in | `interrupted` 0.77 s after founder starts talking; speech stops ~1.1 s |
| VAD | default ends turn on 0.44 s pauses → use `silence_duration_ms: 1200` |
| Avatar quota | 3 concurrent / project / region; lagged enforcement; overshoot → ~10–13 min lockout |
| Browser auth | `?access_token=` accepted on the WSS URL |
| Text models | `global` only; no `gemini-3.8-flash-lite`; 3.8-flash thinking LOW/MEDIUM/HIGH only |
| Scribe | `gemini-3.5-transcribe-live-preview` @ global: 20/20 facts with vocabulary; `gemini-3.8-live` speaks during "silent" scribing and can't output TEXT |
| Context injection | `turn_complete:false` never triggers a reply; investors attribute other investors' lines correctly |
| Slide dedup | dHash 256-bit, same-slide ≤28, different ≥54, threshold 40 |
| Tab recording | Chrome 154 MP4 `avc3,mp4a.40.2`; tab audio excludes the mic |
| VAD tuning | `end_of_speech_sensitivity: END_SENSITIVITY_LOW` accepted with avatars; fewer mid-sentence cut-ins |
| Prompts while speaking | a `turn_complete:true` client turn interrupts an active generation |
| Proactive audio | permanently on in 3.8 Live (can't be disabled) — the model may stay silent; hence the nudge |
| User emotion API | none — affective dialogue is internal; confidence is measured via `/api/delivery` |
| Delivery analysis | `gemini-3.8-flash` hears confidence: confident 9/10 vs hesitant 2/10 |

## 15. Hackathon fast path (≤ 1 hour)
| Minute | Step | Command / where |
|---|---|---|
| 0–1 | Scaffold + copy + verify (typecheck, lint, 16 unit tests, build) — measured **34 s** | `sh reference/scripts/bootstrap.sh ~/Projects/pitchroom` |
| 1–10 | Service account key, Supabase project + migration, `.env.local` | plan Task 0 |
| 10–15 | `pnpm smoke` (real Vertex) + `pnpm dev` → one 1-investor meeting | plan Tasks 3, 7 |
| 15–30 | Vercel project + env + deploy, prod smoke | plan Task 9 |
| 30–60 | 4-investor rehearsal, demo script, polish | plan Task 10 |

