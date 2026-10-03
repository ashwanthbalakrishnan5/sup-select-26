import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { ReportView } from '@/components/report/report-view';
import { getSession, recordingViewUrl } from '@/lib/server/store';

export const metadata = { title: 'Report' };
export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession(id);
  if (!s) notFound();
  if (s.mode === 'interview') redirect('/thanks'); // interview reports are for the fund only
  if (s.mode === 'test') redirect(`/investor/reports/${id}`);
  const recording_url = s.recording_path ? await recordingViewUrl(s.recording_path) : null;
  return (
    <>
      <AppHeader />
      <ReportView initial={{ ...s, recording_url }} />
    </>
  );
}
