// POST /api/sessions — create a pitch session from the config page.
import { NextResponse } from 'next/server';
import { SessionConfigSchema } from '@/lib/config';
import { createSession } from '@/lib/server/store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const parsed = SessionConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid config' }, { status: 400 });
  try {
    const id = await createSession(parsed.data, { mode: 'practice' });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
