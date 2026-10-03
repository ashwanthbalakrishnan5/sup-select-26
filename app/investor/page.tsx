// Investor dashboard: interview panels (with invite links) + the latest submitted interviews.
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { InterviewTable } from '@/components/investor/interview-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { avatarInfo } from '@/lib/catalog';
import { requireUser } from '@/lib/server/auth';
import { listInterviews, listPanels } from '@/lib/server/store';

export const metadata = { title: 'Panels' };
export const dynamic = 'force-dynamic';

export default async function InvestorHome() {
  const user = await requireUser('investor');
  const [panels, interviews] = await Promise.all([listPanels(), listInterviews()]);
  const countFor = (id: string) => interviews.filter((s) => s.panel_id === id && s.mode === 'interview').length;
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-10 px-6 pb-16">
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">Interview panels</h1>
              <p className="mt-1">Each panel is an AI first-round interview you can send to any startup.</p>
            </div>
            <Button size="lg" nativeButton={false} render={<Link href="/investor/panels/new" />}>
              <Plus /> New panel
            </Button>
          </div>
          {panels.length === 0 ? (
            <div className="rounded-base border-2 border-dashed border-border p-8 text-center">
              <p className="mb-4">No panels yet. Create one in under a minute.</p>
              <Button nativeButton={false} render={<Link href="/investor/panels/new" />}>
                Create your first panel
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {panels.map((p) => (
                <Link
                  key={p.id}
                  href={`/investor/panels/${p.id}`}
                  className="flex flex-col gap-3 rounded-base border-2 border-border bg-secondary-background p-5 shadow-shadow transition-transform hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xl font-bold">{p.name}</div>
                      <div className="text-sm">{p.config.fundName}</div>
                    </div>
                    <Badge>{countFor(p.id)} interviews</Badge>
                  </div>
                  <div className="flex -space-x-2">
                    {p.config.seats.map((s) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={s.id} src={avatarInfo(s.avatar).image} alt={s.avatar} className="size-9 rounded-full border-2 border-border object-cover" />
                    ))}
                  </div>
                  <div className="text-xs">
                    {p.config.pitchMinutes} min pitch · {p.config.qaMinutes} min Q&amp;A · {p.config.mustAsk.length} must-ask · {p.config.criteria.length} criteria
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="text-3xl font-bold">Latest interviews</h2>
            <Link href="/investor/reports" className="font-bold underline">
              All reports →
            </Link>
          </div>
          <InterviewTable rows={interviews.slice(0, 8)} panels={panels} />
        </section>
      </main>
    </>
  );
}
