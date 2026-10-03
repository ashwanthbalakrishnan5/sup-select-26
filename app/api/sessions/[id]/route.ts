// GET /api/sessions/[id] — session status + results (report page polls this while processing).
import { NextResponse } from 'next/server';
import { getSession, recordingViewUrl } from '@/lib/server/store';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const recording_url = s.recording_path ? await recordingViewUrl(s.recording_path) : null;
  return NextResponse.json({ ...s, recording_url }, { headers: { 'Cache-Control': 'no-store' } });
}
