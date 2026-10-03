// Investor view of one startup's interview: recommendation, criteria, red flags, must-ask coverage, voice signals,
// verdicts, recording and transcript.
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { ReportView } from '@/components/report/report-view';
import { requireUser } from '@/lib/server/auth';
import { getSession, recordingViewUrl } from '@/lib/server/store';

export const metadata = { title: 'Interview report' };
export const dynamic = 'force-dynamic';

export default async function InvestorReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('investor');
  const s = await getSession((await params).id);
  if (!s || s.mode === 'practice') notFound();
  const recording_url = s.recording_path ? await recordingViewUrl(s.recording_path) : null;
  return (
    <>
      <AppHeader user={user} />
      <ReportView initial={{ ...s, recording_url }} audience="investor" />
    </>
  );
}
