// P2: browser Supabase client (auth + signed recording upload). Null when public env vars aren't set.
import { createBrowserClient } from '@supabase/ssr';
import { api } from './api';

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createBrowserClient(url, key) : null;
}

/** Upload the meeting recording straight to Supabase Storage (bypasses Vercel's 4.5 MB body limit). */
export async function uploadRecording(sessionId: string, blob: Blob) {
  const sb = supabaseBrowser();
  if (!sb) throw new Error('Supabase is not configured');
  const { token, path } = await api.recordingUploadUrl(sessionId);
  const { error } = await sb.storage.from('recordings').uploadToSignedUrl(path, token, blob, { contentType: blob.type });
  if (error) throw error;
}
