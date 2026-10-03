// Persistence. Supabase (service role, server-only) when SUPABASE_SERVICE_ROLE_KEY is set; otherwise local JSON files
// in .data/ for development. Vercel must use Supabase (its filesystem is read-only).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Candidate, Panel, PanelConfig, SessionConfig, SessionMode, SessionRecord } from '../types';

const SESSIONS = 'pitch_sessions';
const PANELS = 'panels';
export const RECORDINGS_BUCKET = 'recordings';
export const DEMO_OWNER = 'demo'; // fake login → one shared demo workspace

let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return (admin ??= createClient(url, key, { auth: { persistSession: false } }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- local file fallback ----------
const dir = (table: string) => path.join(process.cwd(), '.data', table);
async function fileGet<T>(table: string, id: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(dir(table), `${id}.json`), 'utf8')) as T;
  } catch {
    return null;
  }
}
async function filePut(table: string, row: { id: string }) {
  await mkdir(dir(table), { recursive: true });
  await writeFile(path.join(dir(table), `${row.id}.json`), JSON.stringify(row));
}
async function fileList<T extends { created_at: string }>(table: string): Promise<T[]> {
  const names = await readdir(dir(table)).catch(() => [] as string[]);
  const rows = await Promise.all(names.map((n) => fileGet<T>(table, n.replace(/\.json$/, ''))));
  return rows.filter((r): r is Awaited<T> => !!r).sort((a, b) => b.created_at.localeCompare(a.created_at)) as T[];
}

// ---------- sessions ----------
export async function createSession(
  config: SessionConfig,
  opts: { mode?: SessionMode; panelId?: string | null; candidate?: Candidate | null } = {},
): Promise<string> {
  const row = { config, mode: opts.mode ?? 'practice', panel_id: opts.panelId ?? null, candidate: opts.candidate ?? null };
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db.from(SESSIONS).insert(row).select('id').single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  const rec: SessionRecord = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    user_id: null,
    status: 'created',
    started_at: null,
    ended_at: null,
    ended_by: null,
    timings: null,
    transcript: null,
    verdicts: null,
    fact_checks: null,
    delivery: null,
    hand_raises: null,
    metrics: null,
    report: null,
    recording_path: null,
    error: null,
    ...row,
  };
  await filePut(SESSIONS, rec);
  return rec.id;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  if (!UUID.test(id)) return null;
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db.from(SESSIONS).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as SessionRecord | null;
  }
  return fileGet<SessionRecord>(SESSIONS, id);
}

export async function updateSession(id: string, patch: Partial<SessionRecord>): Promise<void> {
  const db = supabaseAdmin();
  if (db) {
    const { error } = await db.from(SESSIONS).update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const rec = await getSession(id);
  if (!rec) throw new Error('Session not found');
  await filePut(SESSIONS, { ...rec, ...patch });
}

export type SessionSummary = Pick<
  SessionRecord,
  'id' | 'created_at' | 'status' | 'mode' | 'panel_id' | 'candidate' | 'config' | 'report' | 'verdicts' | 'delivery'
>;

/** Interview (and VC test) sessions for the investor reports page, newest first. */
export async function listInterviews(panelId?: string): Promise<SessionSummary[]> {
  const db = supabaseAdmin();
  if (db) {
    let q = db
      .from(SESSIONS)
      .select('id, created_at, status, mode, panel_id, candidate, config, report, verdicts, delivery')
      .in('mode', ['interview', 'test'])
      .neq('status', 'created')
      .order('created_at', { ascending: false })
      .limit(200);
    if (panelId) q = q.eq('panel_id', panelId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as SessionSummary[];
  }
  return (await fileList<SessionRecord>(SESSIONS)).filter(
    (s) => s.mode !== 'practice' && s.status !== 'created' && (!panelId || s.panel_id === panelId),
  );
}

// ---------- panels ----------
export async function createPanel(config: PanelConfig, owner = DEMO_OWNER): Promise<string> {
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db.from(PANELS).insert({ owner, name: config.name, config }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  const now = new Date().toISOString();
  const panel: Panel = { id: randomUUID(), created_at: now, updated_at: now, owner, name: config.name, config };
  await filePut(PANELS, panel);
  return panel.id;
}

export async function getPanel(id: string): Promise<Panel | null> {
  if (!UUID.test(id)) return null;
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db.from(PANELS).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Panel | null;
  }
  return fileGet<Panel>(PANELS, id);
}

export async function updatePanel(id: string, config: PanelConfig): Promise<void> {
  const patch = { name: config.name, config, updated_at: new Date().toISOString() };
  const db = supabaseAdmin();
  if (db) {
    const { error } = await db.from(PANELS).update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const p = await getPanel(id);
  if (!p) throw new Error('Panel not found');
  await filePut(PANELS, { ...p, ...patch });
}

export async function listPanels(owner = DEMO_OWNER): Promise<Panel[]> {
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db.from(PANELS).select('*').eq('owner', owner).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as Panel[];
  }
  return (await fileList<Panel>(PANELS)).filter((p) => p.owner === owner);
}

// ---------- recordings ----------
/** Signed upload token for the meeting recording (the browser uploads straight to Storage). */
export async function recordingUploadUrl(id: string) {
  const db = supabaseAdmin();
  if (!db) throw new Error('Recording needs Supabase Storage');
  const p = `${id}.mp4`;
  const { data, error } = await db.storage.from(RECORDINGS_BUCKET).createSignedUploadUrl(p, { upsert: true });
  if (error) throw new Error(error.message);
  return { signedUrl: data.signedUrl, token: data.token, path: p };
}

export async function recordingViewUrl(p: string): Promise<string | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db.storage.from(RECORDINGS_BUCKET).createSignedUrl(p, 3600);
  return data?.signedUrl ?? null;
}
