import { notFound, redirect } from 'next/navigation';
import { Room } from '@/components/room/room';
import { getSession } from '@/lib/server/store';

export const metadata = { title: 'Meeting' };

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession(id);
  if (!s) notFound();
  // A session can only be run once.
  if (s.status !== 'created') redirect(s.mode === 'interview' ? '/thanks' : s.mode === 'test' ? `/investor/reports/${id}` : `/report/${id}`);
  return <Room id={id} config={s.config} mode={s.mode} />;
}
