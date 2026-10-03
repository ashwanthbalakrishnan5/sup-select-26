// Server-only: Vertex AI text client + short-lived OAuth token for browser Live sessions.
// Credentials: GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON or base64) on Vercel; ADC locally (gcloud auth application-default login).
import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import type { LiveToken } from '../types';

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text) as { client_email: string; private_key: string; project_id?: string };
}

export const liveProjects = () =>
  (process.env.LIVE_PROJECTS ?? 'ashwanth-459106')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const textProject = () => process.env.TEXT_PROJECT ?? liveProjects()[0];

let auth: GoogleAuth | null = null;
const getAuth = () => (auth ??= new GoogleAuth({ credentials: credentials(), scopes: SCOPES }));

let cached: LiveToken | null = null;

/** OAuth access token for browser WebSockets (?access_token=). Cached until 5 min before expiry. */
export async function liveToken(): Promise<LiveToken> {
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached;
  const client = await getAuth().getClient();
  const res = await client.getAccessToken();
  if (!res.token) throw new Error('No access token');
  const expiry = (client as { credentials?: { expiry_date?: number } }).credentials?.expiry_date;
  cached = {
    accessToken: res.token,
    expiresAt: expiry ?? Date.now() + 55 * 60_000,
    projects: liveProjects(),
    liveLocation: 'us-central1', // only region serving gemini-3.8-live
    scribeLocation: 'global',
  };
  return cached;
}

let genai: GoogleGenAI | null = null;

/** Text models (gemini-3.8-flash, gemini-3.5-flash-lite) are only served from `global` (404 in us-central1). */
export function textClient(): GoogleGenAI {
  return (genai ??= new GoogleGenAI({
    vertexai: true,
    project: textProject(),
    location: 'global',
    googleAuthOptions: { credentials: credentials(), scopes: SCOPES },
  }));
}

export const MODELS = {
  research: 'gemini-3.8-flash', // fact-check step 1 (google search) + report
  fast: 'gemini-3.5-flash-lite', // fact-check step 2 + floor manager
} as const;
