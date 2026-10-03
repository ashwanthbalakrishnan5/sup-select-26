// Public invite link a VC sends to startups.
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { InviteForm } from '@/components/investor/invite-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { avatarInfo } from '@/lib/catalog';
import { totalMinutes } from '@/lib/config';
import { seatTitle } from '@/lib/personas';
import { getPanel } from '@/lib/server/store';

export const metadata = { title: 'Your interview' };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ panelId: string }> }) {
  const panel = await getPanel((await params).panelId);
  if (!panel) notFound();
  const p = panel.config;
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-6 pb-16">
        <div>
          <h1 className="text-4xl font-bold">{p.fundName} invited you to pitch</h1>
          <p className="mt-2 text-lg">
            A live first-round interview with {p.fundName}&apos;s AI investor panel: a {p.pitchMinutes}-minute pitch (share your slides),
            then {p.qaMinutes} minutes of questions. About {totalMinutes(p)} minutes in total. Desktop Chrome and headphones recommended.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">About you</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteForm panelId={panel.id} record={p.record} voiceAnalysis={p.voiceAnalysis} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Your panel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {p.seats.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarInfo(s.avatar).image} alt="" className="size-12 rounded-base border-2 border-border object-cover" />
                  <div>
                    <div className="font-bold">{s.avatar}</div>
                    <div className="text-sm">{seatTitle(s)}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
