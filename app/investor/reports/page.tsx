// Every submitted interview across the investor's panels; filter by panel to see Claude's shortlist for it.
import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { InterviewTable } from '@/components/investor/interview-table';
import { ShortlistCard } from '@/components/investor/shortlist-card';
import { requireUser } from '@/lib/server/auth';
import { listInterviews, listPanels } from '@/lib/server/store';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const pill = (on: boolean) =>
  cn('rounded-base border-2 border-border px-3 py-1.5 text-sm font-bold', on ? 'bg-main shadow-shadow' : 'bg-secondary-background');

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ panel?: string }> }) {
  const user = await requireUser('investor');
  const { panel: panelId } = await searchParams;
  const [panels, interviews] = await Promise.all([listPanels(), listInterviews(panelId)]);
  const panel = panels.find((p) => p.id === panelId);
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-6 pb-16">
        <div>
          <h1 className="text-4xl font-bold">Interview reports</h1>
          <p className="mt-1">
            {interviews.length} submitted interview{interviews.length === 1 ? '' : 's'}. Pick a panel for Claude&apos;s shortlist; open
            one for scores, voice signals, verdicts and the recording.
          </p>
        </div>
        {panels.length > 0 && (
          <nav className="flex flex-wrap gap-2" aria-label="Filter by panel">
            <Link href="/investor/reports" className={pill(!panel)}>
              All panels
            </Link>
            {panels.map((p) => (
              <Link key={p.id} href={`/investor/reports?panel=${p.id}`} className={pill(p.id === panelId)}>
                {p.name}
              </Link>
            ))}
          </nav>
        )}
        {panel && <ShortlistCard panel={panel} interviews={interviews.filter((s) => s.status === 'ready').length} />}
        <InterviewTable rows={interviews} panels={panels} />
      </main>
    </>
  );
}
