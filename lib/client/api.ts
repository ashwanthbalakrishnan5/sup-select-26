// Typed fetch wrappers for the route handlers (browser). See spec §9.
import type {
  Claim,
  DeliveryChunk,
  FinishPayload,
  HandsDecision,
  IntentDecision,
  LiveToken,
  SeatBrief,
  SessionConfig,
  SessionRecord,
  TurnDecision,
} from '../types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

export const api = {
  createSession: (config: SessionConfig) => post('/api/sessions', config).then((r) => json<{ id: string }>(r)),
  getSession: (id: string) => fetch(`/api/sessions/${id}`, { cache: 'no-store' }).then((r) => json<SessionRecord>(r)),
  startSession: (id: string) => post(`/api/sessions/${id}/start`, {}).then((r) => json<{ ok: true }>(r)),
  finishSession: (id: string, payload: FinishPayload | { retry: true }) =>
    post(`/api/sessions/${id}/finish`, payload).then((r) => json<{ status: string }>(r)),
  liveToken: () => fetch('/api/live-token', { cache: 'no-store' }).then((r) => json<LiveToken>(r)),
  factCheck: (chunk: string) =>
    post('/api/fact-check', { chunk }, AbortSignal.timeout(45_000)).then((r) => json<{ claims: Claim[] }>(r)),
  delivery: (body: { wavBase64: string; startSec: number; phase: string; founderName: string }) =>
    post('/api/delivery', body, AbortSignal.timeout(45_000)).then((r) => json<DeliveryChunk>(r)),
  floorHands: (recent: string, seats: SeatBrief[]) =>
    post('/api/floor', { mode: 'hands', recent, seats }, AbortSignal.timeout(10_000)).then((r) => json<HandsDecision>(r)),
  floorIntent: (body: { phase: 'intro' | 'pitch' | 'aside'; seats: SeatBrief[]; host: string; founder: string; latest: string; context: string }) =>
    post('/api/floor', { mode: 'intent', ...body }, AbortSignal.timeout(4_000)).then((r) => json<IntentDecision>(r)),
  floorTurn: (body: {
    recent: string;
    seats: SeatBrief[];
    current: string;
    questionCounts: Record<string, number>;
    queuedHands: string[];
  }) => post('/api/floor', { mode: 'turn', ...body }, AbortSignal.timeout(2_000)).then((r) => json<TurnDecision>(r)),
  recordingUploadUrl: (id: string) =>
    post(`/api/sessions/${id}/recording`, {}).then((r) => json<{ token: string; path: string }>(r)),
};
