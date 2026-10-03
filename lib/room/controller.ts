// RoomController: the meeting state machine (intro → pitch → qa → verdict → ended). Framework-agnostic;
// React subscribes via useSyncExternalStore(controller.subscribe, controller.getState). See spec §7.3.
import { archetype } from '../catalog';
import { api } from '../client/api';
import { InvestorSession } from '../live/investor-session';
import { MicCapture } from '../live/mic';
import { ScribeSession } from '../live/scribe-session';
import { SlideCapture } from '../live/slides';
import { VoiceSampler, type VoiceClip } from '../live/voice-sampler';
import { buildInvestorInstruction, seatTitle } from '../personas';
import { parseVerdict } from '../verdict';
import type {
  Claim,
  DeliveryChunk,
  FinishPayload,
  HandRaise,
  LiveToken,
  Phase,
  SeatBrief,
  SeatConfig,
  SessionConfig,
  Slide,
  Timings,
  TranscriptLine,
  Verdict,
} from '../types';
import { deliveryLine, moderator, pitchPacketText, roomLine } from './prompts';
import { formatLine, formatTranscript, lineId, takeNewText } from './transcript';

export type SeatStatus = 'connecting' | 'ready' | 'failed' | 'dropped';

export interface SeatState {
  seat: SeatConfig;
  title: string;
  status: SeatStatus;
  speaking: boolean;
  hand: number | null; // 1-based raise order
  verdict: Verdict['decision'] | null;
  element: HTMLDivElement | null; // AvatarPlayer container for the ACS tile
}

export interface RoomState {
  phase: Phase;
  seats: SeatState[];
  hostId: string | null;
  floorId: string | null;
  phaseEndsAt: number | null; // epoch ms; drives the countdown in pitch/qa
  caption: { name: string; text: string; at: number } | null;
  micMuted: boolean;
  sharing: boolean;
  error: string | null;
}

export type NoticeKind = 'info' | 'warning' | 'error';

const SEAT_STAGGER_MS = 400; // never open avatar sessions in a burst (quota lockout)
const CONNECT_TIMEOUT_MS = 20_000;
const CHUNK_MS = 60_000;
const INTRO_CAP_MS = 60_000;
const MAX_FOLLOW_UPS = 2;
const VERDICT_TIMEOUT_MS = 20_000;
const MAX_PACKET_SLIDES = 12;
const DELIVERY_WAIT_MS = 8000; // Q&A start waits this long for the last pitch delivery analysis
const NUDGE_MS = 3500; // founder stopped talking but the floor-holder stays silent (proactive audio) → moderator nudge

/** Fewer seats = bigger tiles = more pixels. 500 kbps measured fine at 4-up tile size (~0.76 Mbps on the wire). */
export const videoBitrateFor = (seats: number) => (seats <= 1 ? 1_500_000 : seats === 2 ? 1_000_000 : 500_000);

interface Thread {
  seatId: string;
  asked: boolean; // the floor-holder has asked its question (founder speech before that isn't an answer)
  followUps: number;
  founderAnswered: boolean;
}

export class RoomController {
  private state: RoomState;
  private listeners = new Set<() => void>();
  readonly mic = new MicCapture();
  private sessions = new Map<string, InvestorSession>();
  private scribe: ScribeSession | null = null;
  private slideCapture: SlideCapture | null = null;
  private token: LiveToken | null = null;

  private meetingStart = 0;
  private timings: Timings = { meetingStart: 0 };
  private transcript: TranscriptLine[] = [];
  private slides: Slide[] = [];
  private claims: Claim[] = [];
  private voice = new VoiceSampler();
  private deliveries: DeliveryChunk[] = [];
  private deliveryPending = new Set<Promise<void>>();
  private handRaises: HandRaise[] = [];
  private handQueue: string[] = []; // seat ids in raise order
  private verdicts: Verdict[] = [];
  private questionCounts: Record<string, number> = {};

  private hostTurns = 0;
  private founderSpokeInIntro = false;
  private pendingPitchStart = false;
  private wrapPending = false;
  private pitchFinal: Promise<void> = Promise.resolve();
  private enteringQA = false;
  private scribeConsumed = 0;
  private lastChunkAt = 0;
  private thread: Thread | null = null;
  private deciding = false;
  private qaEnding = false;
  private warned = new Set<string>();
  private turnStart = new Map<string, number>(); // seatId → t of current output start
  private founderStart: { t: number; phase: Phase } | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private waiters = new Map<string, (text: string) => void>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  private mutedTalk = 0;
  private lastMutedNotice = 0;

  private onNotice: (text: string, kind: NoticeKind) => void = () => {};
  private onEnded: () => void | Promise<void> = () => {};

  /** UI callbacks: toasts and "meeting over" (navigate to the report). */
  setHandlers(h: { onNotice: (text: string, kind: NoticeKind) => void; onEnded: () => void | Promise<void> }) {
    this.onNotice = h.onNotice;
    this.onEnded = h.onEnded;
  }

  constructor(
    readonly sessionId: string,
    readonly config: SessionConfig,
  ) {
    this.state = {
      phase: 'lobby',
      seats: config.seats.map((seat) => ({
        seat,
        title: seatTitle(seat),
        status: 'connecting',
        speaking: false,
        hand: null,
        verdict: null,
        element: null,
      })),
      hostId: null,
      floorId: null,
      phaseEndsAt: null,
      caption: null,
      micMuted: false,
      sharing: false,
      error: null,
    };
    this.mic.onChunk = this.routeAudio;
    this.mic.onLevel = this.watchMutedTalk;
  }

  // ---------- store plumbing ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  /** Current phase (a getter so TypeScript doesn't narrow it across awaits). */
  get phase(): Phase {
    return this.state.phase;
  }
  private set(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private setSeat(id: string, patch: Partial<SeatState>) {
    this.set({ seats: this.state.seats.map((s) => (s.seat.id === id ? { ...s, ...patch } : s)) });
  }
  private seatState = (id: string) => this.state.seats.find((s) => s.seat.id === id)!;
  private activeSeats = () => this.state.seats.filter((s) => s.status === 'ready');
  private clock = () => (this.meetingStart ? Date.now() - this.meetingStart : 0);
  private name = (id: string) => this.seatState(id).seat.avatar;
  private seatByName = (name: string) =>
    this.activeSeats().find((s) => s.seat.avatar.toLowerCase() === name.trim().toLowerCase());
  private briefs = (): SeatBrief[] =>
    this.activeSeats().map((s) => ({ name: s.seat.avatar, title: s.title, lane: archetype(s.seat.archetype).lane }));

  // ---------- lifecycle ----------
  /** Lobby → connecting → intro. Call from the "Join meeting" click (after mic.start()). */
  async start() {
    this.set({ phase: 'connecting' });
    try {
      this.token = await api.liveToken();
    } catch {
      this.set({ error: "Couldn't reach the panel." });
      return;
    }
    const { projects, liveLocation, accessToken } = this.token;

    this.scribe = new ScribeSession(projects[0], accessToken, [this.config.startupName, ...this.config.vocabulary]);
    this.scribe.onText = (text) => {
      if (this.state.phase === 'pitch') this.caption(this.config.founderName, text.slice(-160));
    };
    this.scribe.ready.catch(() => (this.scribe = null));

    const readies: Promise<void>[] = [];
    for (const [i, s] of this.state.seats.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, SEAT_STAGGER_MS));
      readies.push(this.openSeat(s.seat, projects[i % projects.length], liveLocation, accessToken, i === 0));
    }
    await Promise.all(readies);

    const ready = this.activeSeats();
    if (!ready.length) {
      this.set({ error: "The panel couldn't join. Try again in a few minutes." });
      return;
    }
    const hostId = ready[0].seat.id;
    this.set({ hostId });
    if (hostId !== this.config.seats[0].id) this.sessions.get(hostId)!.addContext(moderator.newHost(this.config));
    this.enterIntro();
  }

  private async openSeat(seat: SeatConfig, project: string, location: string, token: string, isHost: boolean) {
    const s = new InvestorSession({
      project,
      location,
      accessToken: token,
      avatar: seat.avatar,
      voice: seat.voice,
      instruction: buildInvestorInstruction(this.config, seat, isHost),
      videoBitrate: videoBitrateFor(this.config.seats.length),
    });
    this.sessions.set(seat.id, s);
    this.setSeat(seat.id, { element: s.player.element });
    this.wireSeat(seat.id, s);
    try {
      await Promise.race([
        s.ready,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), CONNECT_TIMEOUT_MS)),
      ]);
      this.setSeat(seat.id, { status: 'ready' });
    } catch (e) {
      s.close();
      this.sessions.delete(seat.id);
      this.setSeat(seat.id, { status: 'failed', element: null });
      const capacity = (e as { capacity?: boolean }).capacity;
      this.onNotice(
        capacity
          ? `${seat.avatar} couldn't join (avatar capacity). Continuing without them.`
          : `${seat.avatar} couldn't join.`,
        'warning',
      );
    }
  }

  private wireSeat(id: string, s: InvestorSession) {
    s.onSpeaking = (speaking) => {
      this.setSeat(id, { speaking });
      if (speaking) {
        this.turnStart.set(id, this.clock());
        this.clearNudge();
      }
    };
    s.onOutputText = (text) => this.caption(this.name(id), text);
    s.onInputText = (text) => {
      this.founderStart ??= { t: this.clock(), phase: this.state.phase };
      this.caption(this.config.founderName, text);
    };
    s.onActivity = (type) => this.onFounderActivity(id, type);
    s.onFounderLine = (text) => this.onFounderLine(id, text);
    s.onTurnComplete = (text, interrupted) => this.onInvestorTurn(id, text, interrupted);
    s.onDrop = () => this.dropSeat(id);
  }

  // ---------- transcript ----------
  private caption(name: string, text: string) {
    if (this.config.captions && text) this.set({ caption: { name, text, at: Date.now() } });
  }

  private pushLine(speaker: string, name: string, text: string, t: number, phase: Phase = this.state.phase) {
    const line: TranscriptLine = { id: lineId(), t, endT: this.clock(), speaker, name, text, phase };
    this.transcript.push(line);
    return line;
  }

  /** Send a finalized line to every active seat except `exceptId` (who heard/said it live). */
  private broadcast(line: TranscriptLine, exceptId: string | null) {
    if (this.state.phase === 'pitch') return; // investors get the pitch as one packet at Q&A
    for (const s of this.activeSeats()) if (s.seat.id !== exceptId) this.sessions.get(s.seat.id)?.addContext(roomLine(line));
  }

  private onFounderLine(heardBy: string, text: string) {
    const start = this.founderStart ?? { t: this.clock(), phase: this.state.phase };
    const line = this.pushLine('founder', this.config.founderName, text, start.t, start.phase);
    this.founderStart = null;
    this.broadcast(line, heardBy);
    if (this.state.phase === 'intro') this.founderSpokeInIntro = true;
    const th = this.thread;
    if (this.state.phase === 'qa' && th?.seatId === heardBy && th.asked) th.founderAnswered = true;
  }

  private onInvestorTurn(id: string, text: string, interrupted: boolean) {
    if (text) {
      const line = this.pushLine(id, this.name(id), interrupted ? `${text} —` : text, this.turnStart.get(id) ?? this.clock());
      this.broadcast(line, id);
      if (text.includes('?')) this.questionCounts[id] = (this.questionCounts[id] ?? 0) + 1;
    }
    const waiter = this.waiters.get(id);
    if (waiter) {
      this.waiters.delete(id);
      waiter(text);
    }
    const phase = this.state.phase;
    if (phase === 'intro' && id === this.state.hostId) this.onHostIntroTurn();
    else if (phase === 'pitch' && id === this.state.hostId && this.wrapPending) void this.enterQA();
    else if (phase === 'qa' && id === this.state.floorId && this.thread?.seatId === id) {
      if (!this.thread.asked) this.thread.asked = true; // that turn was the question itself
      // A reply the founder barged into still counts if it got its question out; a cut-off "Understood, —" doesn't.
      else if (!interrupted || text.includes('?')) void this.onFloorTurn(id, text);
    }
  }

  // ---------- audio routing ----------
  private routeAudio = (pcm: string, rms: number) => {
    const { phase, floorId } = this.state;
    if (phase === 'pitch') this.scribe?.sendAudio(pcm);
    else if ((phase === 'intro' || phase === 'qa') && floorId) this.sessions.get(floorId)?.sendAudio(pcm);
    else return; // nobody is listening → nothing to analyze either
    if (this.config.voiceAnalysis && phase !== 'intro') {
      const clip = this.voice.push(pcm, rms, this.clock());
      if (clip) this.analyzeVoice(clip, phase);
    }
  };

  // ---------- vocal confidence ----------
  /** Flush whatever speech is buffered (phase boundaries) and analyze it. */
  private flushVoice(phase: Phase) {
    const clip = this.config.voiceAnalysis ? this.voice.flush() : null;
    if (clip) this.analyzeVoice(clip, phase);
  }

  private analyzeVoice(clip: VoiceClip, phase: Phase) {
    const p = api
      .delivery({ wavBase64: clip.wavBase64, startSec: clip.startMs / 1000, phase, founderName: this.config.founderName })
      .then((d) => {
        this.deliveries.push(d);
        // During Q&A the panel "hears" how the founder is coming across, so it can shape follow-ups and verdicts.
        if (this.state.phase === 'qa' || this.state.phase === 'verdict')
          for (const s of this.activeSeats())
            this.sessions.get(s.seat.id)?.addContext(`[Scribe] How ${this.config.founderName} sounds in their answers: ${deliveryLine(d)}`);
      })
      .catch(() => {})
      .finally(() => this.deliveryPending.delete(p));
    this.deliveryPending.add(p);
  }

  private watchMutedTalk = (rms: number) => {
    if (!this.state.micMuted || this.state.phase === 'lobby') return;
    this.mutedTalk = rms > 0.04 ? this.mutedTalk + 1 : 0;
    if (this.mutedTalk >= 10 && Date.now() - this.lastMutedNotice > 10_000) {
      this.lastMutedNotice = Date.now();
      this.onNotice('Your microphone is muted.', 'info');
    }
  };

  /** The founder stopped talking to the floor-holder: if it doesn't reply within NUDGE_MS, prompt it. */
  private onFounderActivity(id: string, type: 'start' | 'end') {
    if (id !== this.state.floorId) return;
    // Transcription arrives at the end of speech; VAD start is the real start of the founder's line.
    if (type === 'start') this.founderStart ??= { t: this.clock(), phase: this.state.phase };
    this.clearNudge();
    if (type === 'end') this.nudgeTimer = setTimeout(() => this.nudge(id), NUDGE_MS);
  }

  private clearNudge() {
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = null;
  }

  private nudge(id: string) {
    this.nudgeTimer = null;
    const s = this.sessions.get(id);
    if (!s || id !== this.state.floorId || this.seatState(id).speaking || !s.pendingFounderText) return;
    if (this.state.phase === 'intro') s.prompt(moderator.handOff(this.config));
    else if (this.state.phase === 'qa') s.prompt(moderator.respond(this.config, this.seatState(id).seat));
  }

  setMicMuted(muted: boolean) {
    this.mic.setMuted(muted);
    this.set({ micMuted: muted });
  }

  // ---------- screen share ----------
  startSlides(shareVideo: HTMLVideoElement) {
    this.slideCapture?.stop();
    this.slideCapture = new SlideCapture(shareVideo, this.clock);
    this.slideCapture.onSlide = (slide) => {
      this.slides.push(slide);
      if (this.state.phase === 'qa') {
        for (const s of this.activeSeats())
          this.sessions.get(s.seat.id)?.addContext('[Scribe] New slide shown:', [slide.jpegBase64]);
      }
    };
    this.slideCapture.start();
    this.set({ sharing: true });
  }

  stopSlides() {
    this.slideCapture?.stop();
    this.slideCapture = null;
    this.set({ sharing: false });
  }

  // ---------- intro ----------
  private enterIntro() {
    this.meetingStart = Date.now();
    this.timings = { meetingStart: this.meetingStart };
    this.set({ phase: 'intro', floorId: null });
    api.startSession(this.sessionId).catch(() => {});
    this.loop = setInterval(this.tick, 250);
    const host = this.state.hostId!;
    this.sessions.get(host)!.prompt(
      moderator.welcome(this.config, this.seatState(host).seat, this.activeSeats().map((s) => s.seat)),
    );
  }

  private onHostIntroTurn() {
    this.hostTurns++;
    if (this.pendingPitchStart || (this.hostTurns >= 2 && this.founderSpokeInIntro)) return this.enterPitch();
    if (this.hostTurns === 1) {
      this.set({ floorId: this.state.hostId }); // founder introduces themselves to the host
      this.introTimer = setTimeout(() => this.skipIntro(), INTRO_CAP_MS);
    }
  }

  /** "Skip intro" button or 60 s intro cap: host hands the floor over, then the pitch starts. */
  skipIntro() {
    if (this.state.phase !== 'intro' || this.pendingPitchStart) return;
    this.pendingPitchStart = true;
    this.set({ floorId: null });
    this.sessions.get(this.state.hostId!)?.prompt(moderator.handOff(this.config));
  }

  // ---------- pitch ----------
  private enterPitch() {
    if (this.introTimer) clearTimeout(this.introTimer);
    this.timings.pitchStart = this.clock();
    this.lastChunkAt = Date.now();
    this.scribe?.start();
    this.set({ phase: 'pitch', floorId: null, phaseEndsAt: Date.now() + this.config.pitchMinutes * 60_000 });
  }

  /** "Done pitching" button. */
  donePitching() {
    if (this.state.phase === 'pitch' && !this.wrapPending) void this.endPitch('done');
  }

  private endPitch(reason: 'time' | 'done') {
    this.wrapPending = true;
    this.set({ phaseEndsAt: null });
    const host = this.sessions.get(this.state.hostId!);
    host?.prompt(reason === 'time' ? moderator.timeUp(this.config) : moderator.pitchDone(this.config));
    this.pitchFinal = this.finalizePitch();
    setTimeout(() => void this.enterQA(), 15_000); // host never answered: move on
  }

  /** Ends the scribe activity and stores the pitch as one founder line. Q&A waits for this. */
  private async finalizePitch() {
    this.flushVoice('pitch');
    const final = (await this.scribe?.end()) ?? '';
    this.processChunk(final, true);
    this.timings.pitchEnd = this.clock();
    if (final.trim()) {
      this.transcript.push({
        id: lineId(),
        t: this.timings.pitchStart ?? 0,
        endT: this.timings.pitchEnd,
        speaker: 'founder',
        name: this.config.founderName,
        text: final.trim(),
        phase: 'pitch',
      });
    }
    this.scribe?.close();
    this.scribe = null;
  }

  /** Every 60 s of pitch: new scribe text → hand-raises + fact-check (fire-and-forget). */
  private processChunk(fullText: string, final = false) {
    const { chunk, consumed } = takeNewText(fullText, this.scribeConsumed, final);
    this.scribeConsumed = consumed;
    if (chunk.length < 40) return;
    const line = formatLine({ t: this.clock() - CHUNK_MS, name: 'Founder', text: chunk });
    api
      .floorHands(line, this.briefs())
      .then((d) => this.applyHands(d.hand_raises))
      .catch(() => {});
    if (this.config.factCheck)
      api
        .factCheck(line)
        .then((r) => this.claims.push(...r.claims))
        .catch(() => {});
  }

  private applyHands(raises: { investor: string; question: string }[]) {
    if (this.state.phase !== 'pitch' && this.state.phase !== 'qa') return;
    for (const r of raises) {
      const s = this.seatByName(r.investor);
      if (!s || this.handQueue.includes(s.seat.id) || s.seat.id === this.state.floorId) continue;
      this.handQueue.push(s.seat.id);
      this.handRaises.push({ seatId: s.seat.id, question: r.question, t: this.clock() });
    }
    this.syncHands();
  }

  private syncHands() {
    this.set({
      seats: this.state.seats.map((s) => {
        const i = this.handQueue.indexOf(s.seat.id);
        return { ...s, hand: i >= 0 ? i + 1 : null };
      }),
    });
  }

  private queuedQuestion(seatId: string) {
    return [...this.handRaises].reverse().find((h) => h.seatId === seatId)?.question;
  }

  // ---------- Q&A ----------
  private async enterQA() {
    if (this.state.phase !== 'pitch' || this.enteringQA) return;
    this.enteringQA = true;
    await this.pitchFinal;
    // Give the last pitch delivery analysis a moment so the panel's briefing includes how the founder sounded.
    await Promise.race([Promise.allSettled([...this.deliveryPending]), new Promise((r) => setTimeout(r, DELIVERY_WAIT_MS))]);
    if (this.state.phase !== 'pitch') return;
    this.wrapPending = false;
    this.timings.qaStart = this.clock();
    this.set({ phase: 'qa', phaseEndsAt: Date.now() + this.config.qaMinutes * 60_000 });

    const pitch = this.transcript.find((l) => l.phase === 'pitch' && l.speaker === 'founder')?.text ?? '';
    const slides = this.slides.slice(-MAX_PACKET_SLIDES).map((s) => s.jpegBase64);
    const pitchDelivery = this.deliveries.filter((d) => d.phase === 'pitch').sort((a, b) => a.startSec - b.startSec);
    const packet = pitchPacketText(this.config, pitch, this.claims, slides.length, pitchDelivery);
    for (const s of this.activeSeats()) this.sessions.get(s.seat.id)?.addContext(packet, slides);

    const first =
      this.handQueue.find((id) => this.seatState(id).status === 'ready') ??
      this.activeSeats().find((s) => s.seat.id !== this.state.hostId)?.seat.id ??
      this.state.hostId!;
    this.giveFloor(first);
  }

  private giveFloor(seatId: string) {
    this.clearNudge();
    this.thread = { seatId, asked: false, followUps: 0, founderAnswered: false };
    // Only a hand that is still raised carries a question (raises are kept for the report; never re-ask one).
    const queued = this.handQueue.includes(seatId) ? this.queuedQuestion(seatId) : undefined;
    this.handQueue = this.handQueue.filter((id) => id !== seatId);
    this.syncHands();
    this.set({ floorId: seatId });
    this.sessions.get(seatId)?.prompt(moderator.floor(this.config, this.seatState(seatId).seat, queued));
  }

  private pickNext(exclude: string | null): string | null {
    const candidates = this.activeSeats().filter((s) => s.seat.id !== exclude);
    if (!candidates.length) return exclude;
    const raised = this.handQueue.find((id) => candidates.some((c) => c.seat.id === id));
    if (raised) return raised;
    return candidates.reduce((a, b) =>
      (this.questionCounts[a.seat.id] ?? 0) <= (this.questionCounts[b.seat.id] ?? 0) ? a : b,
    ).seat.id;
  }

  private async onFloorTurn(seatId: string, text: string) {
    const th = this.thread;
    if (!th || th.seatId !== seatId || !th.founderAnswered || this.deciding) return;
    if (this.qaEnding) return void this.enterVerdict();
    if (this.timeLeft() < 45_000) return void this.enterVerdict();

    let finished = th.followUps >= MAX_FOLLOW_UPS || !text.includes('?');
    let next: string | null = null;
    if (!finished) {
      this.deciding = true;
      try {
        const recent = formatTranscript(this.transcript.slice(-6));
        const counts = Object.fromEntries(this.activeSeats().map((s) => [s.seat.avatar, this.questionCounts[s.seat.id] ?? 0]));
        const d = await api.floorTurn({
          recent,
          seats: this.briefs(),
          current: this.name(seatId),
          questionCounts: counts,
          queuedHands: this.handQueue.map((id) => `${this.name(id)}: ${this.queuedQuestion(id) ?? ''}`),
        });
        this.applyHands(d.hand_raises);
        finished = d.thread_finished;
        const n = this.seatByName(d.next_speaker);
        if (n && n.seat.id !== seatId) next = n.seat.id;
      } catch {
        finished = true; // rule fallback
      } finally {
        this.deciding = false;
      }
    }
    if (this.state.phase !== 'qa') return;
    if (!finished) {
      th.followUps++;
      th.founderAnswered = false; // that reply was the follow-up question; wait for the answer
      if (th.followUps >= MAX_FOLLOW_UPS) this.sessions.get(seatId)?.addContext(moderator.lastFollowUp(this.config));
      return;
    }
    const nextId = next ?? this.pickNext(seatId);
    if (nextId) this.giveFloor(nextId);
  }

  private timeLeft() {
    return this.state.phaseEndsAt ? this.state.phaseEndsAt - Date.now() : Infinity;
  }

  // ---------- verdict ----------
  private async enterVerdict() {
    if (this.state.phase === 'verdict' || this.state.phase === 'ended') return;
    this.timings.qaEnd = this.clock();
    this.flushVoice('qa');
    this.handQueue = [];
    this.set({ phase: 'verdict', floorId: null, phaseEndsAt: null });
    this.syncHands();

    const host = this.state.hostId;
    const order = [
      ...this.activeSeats().filter((s) => s.seat.id !== host),
      ...this.activeSeats().filter((s) => s.seat.id === host),
    ];
    for (const [i, s] of order.entries()) {
      if (this.phase !== 'verdict') return;
      const session = this.sessions.get(s.seat.id);
      if (!session || this.seatState(s.seat.id).status !== 'ready') continue;
      const spoken = new Promise<string>((resolve) => {
        this.waiters.set(s.seat.id, resolve);
        setTimeout(() => resolve(''), VERDICT_TIMEOUT_MS);
      });
      session.prompt(moderator.verdict(this.config, s.seat, i === order.length - 1));
      const text = await spoken;
      this.waiters.delete(s.seat.id);
      const decision = parseVerdict(text);
      this.verdicts.push({ seatId: s.seat.id, name: s.seat.avatar, decision, text });
      this.setSeat(s.seat.id, { verdict: decision });
    }
    await new Promise((r) => setTimeout(r, 1500));
    await this.end('complete');
  }

  // ---------- timer loop ----------
  private tick = () => {
    const { phase, phaseEndsAt } = this.state;
    if (this.state.caption && Date.now() - this.state.caption.at > 6000) this.set({ caption: null });
    if (phase === 'pitch' && !this.wrapPending && Date.now() - this.lastChunkAt >= CHUNK_MS && this.scribe) {
      this.lastChunkAt = Date.now();
      this.processChunk(this.scribe.text);
    }
    if (!phaseEndsAt) return;
    const left = phaseEndsAt - Date.now();
    const key = `${phase}-warn`;
    if (this.config.oneMinuteWarning && left <= 60_000 && left > 0 && !this.warned.has(key)) {
      this.warned.add(key);
      this.onNotice('1 minute left', 'info');
    }
    if (left > 0) return;
    if (phase === 'pitch' && !this.wrapPending) void this.endPitch('time');
    if (phase === 'qa' && !this.qaEnding) {
      this.qaEnding = true;
      const floor = this.state.floorId;
      if (floor && this.seatState(floor).speaking) setTimeout(() => void this.enterVerdict(), 8000); // let them finish
      else void this.enterVerdict();
    }
  };

  // ---------- drops & end ----------
  private dropSeat(id: string) {
    this.sessions.get(id)?.close();
    this.sessions.delete(id);
    this.handQueue = this.handQueue.filter((h) => h !== id);
    this.setSeat(id, { status: 'dropped', speaking: false, element: null });
    this.onNotice(`Connection to ${this.name(id)} lost.`, 'warning');
    this.waiters.get(id)?.('');
    if (!this.activeSeats().length) return void this.end('error');
    if (this.state.hostId === id) {
      const newHost = this.activeSeats()[0].seat.id;
      this.set({ hostId: newHost });
      this.sessions.get(newHost)?.addContext(moderator.newHost(this.config));
    }
    if (this.state.floorId === id && this.state.phase === 'qa') {
      const next = this.pickNext(id);
      if (next) this.giveFloor(next);
    }
  }

  /** "Leave" (endedBy 'left') or natural end. Saves everything and triggers report generation. */
  async end(endedBy: FinishPayload['endedBy'] = 'left') {
    if (this.state.phase === 'ended') return;
    const wasPitch = this.state.phase === 'pitch' && !this.wrapPending;
    this.set({ phase: 'ended', floorId: null, phaseEndsAt: null, caption: null });
    if (this.loop) clearInterval(this.loop);
    if (this.introTimer) clearTimeout(this.introTimer);
    this.clearNudge();
    if (wasPitch && this.scribe) {
      const final = await this.scribe.end(1500);
      if (final.trim())
        this.transcript.push({
          id: lineId(),
          t: this.timings.pitchStart ?? 0,
          endT: this.clock(),
          speaker: 'founder',
          name: this.config.founderName,
          text: final.trim(),
          phase: 'pitch',
        });
      this.timings.pitchEnd = this.clock();
    }
    await this.pitchFinal;
    if (wasPitch || this.timings.qaStart !== undefined) this.flushVoice(wasPitch ? 'pitch' : 'qa');
    await Promise.race([Promise.allSettled([...this.deliveryPending]), new Promise((r) => setTimeout(r, DELIVERY_WAIT_MS))]);
    this.timings.end = this.clock();
    this.closeAll();

    const payload: FinishPayload = {
      transcript: [...this.transcript].sort((a, b) => a.t - b.t),
      verdicts: this.verdicts,
      factChecks: this.claims,
      deliveries: [...this.deliveries].sort((a, b) => a.startSec - b.startSec),
      handRaises: this.handRaises,
      timings: this.timings,
      endedBy,
    };
    try {
      sessionStorage.setItem(`sandboxhill:finish:${this.sessionId}`, JSON.stringify(payload));
    } catch {}
    try {
      await api.finishSession(this.sessionId, payload);
    } catch {
      this.onNotice("Couldn't save the meeting. You can retry from the report page.", 'error');
    }
    await this.onEnded();
  }

  private closeAll() {
    this.mic.stop();
    this.stopSlides();
    this.scribe?.close();
    this.scribe = null;
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }

  /** Unmount / pagehide: release avatar quota slots immediately. */
  dispose() {
    if (this.loop) clearInterval(this.loop);
    if (this.introTimer) clearTimeout(this.introTimer);
    this.clearNudge();
    this.closeAll();
  }
}
