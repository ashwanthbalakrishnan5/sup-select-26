// P2: POST /api/sessions/[id]/recording — signed upload URL; the browser PUTs the recording, then we store the path.
import { NextResponse } from 'next/server';
import { getSession, recordingUploadUrl, updateSession } from '@/lib/server/store';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSession(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const { token, path } = await recordingUploadUrl(id);
    await updateSession(id, { recording_path: path });
    return NextResponse.json({ token, path });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
