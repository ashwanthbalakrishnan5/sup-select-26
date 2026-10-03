// Landing page: what Sandbox Hill is, how it works for each side, pricing, and the two entry points.
import { ArrowRight, BarChart3, Link2, Mic, ShieldCheck, SlidersHorizontal, Video } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { PricingTables } from '@/components/pricing-tables';
import { Button } from '@/components/ui/button';
import { AVATARS } from '@/lib/catalog';
import { currentUser } from '@/lib/server/auth';

const INVESTOR_STEPS = [
  { icon: SlidersHorizontal, title: 'Build your panel', text: 'Pick up to 4 AI investors, give each one custom instructions, must-ask questions and your scoring criteria.' },
  { icon: Link2, title: 'Send one link', text: 'Every startup that applies gets the same live video interview — no scheduling, no PDFs to skim.' },
  { icon: BarChart3, title: 'Shortlist with evidence', text: 'Scores against your criteria, fact-checked claims, voice confidence & emotion signals, verdicts and the recording.' },
];

const FOUNDER_STEPS = [
  { icon: Video, title: 'Pitch to a live panel', text: 'Screen-share your deck to four AI investors with different personalities. They listen — no interruptions.' },
  { icon: Mic, title: 'Get grilled', text: 'They raise hands, ask follow-ups on what you actually said, and fact-check your claims on the web.' },
  { icon: ShieldCheck, title: 'Get a verdict', text: '"I\'m in" or "I\'m out" from each investor, plus a report on delivery, confidence and the 3 fixes that matter.' },
];

function Steps({ steps }: { steps: typeof INVESTOR_STEPS }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-base border-2 border-border bg-main font-bold">{i + 1}</div>
          <div>
            <div className="flex items-center gap-2 font-bold">
              <s.icon className="size-4" /> {s.title}
            </div>
            <p className="text-sm">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function Landing() {
  const user = await currentUser();
  const investorHref = user?.role === 'investor' ? '/investor' : '/login?role=investor';
  const founderHref = user?.role === 'founder' ? '/founder' : '/login?role=founder';
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-20 px-6 pb-24">
        {/* Hero */}
        <section className="flex flex-col items-start gap-8 pt-10 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-xl flex-col gap-5">
            <span className="self-start rounded-base border-2 border-border bg-main px-3 py-1 text-sm font-bold">Sand Hill, before Sand Hill.</span>
            <h1 className="font-heading text-5xl font-bold leading-tight md:text-6xl">The first round, run by AI investors.</h1>
            <p className="text-xl">
              VCs send one link and every startup gets a live video interview with an AI investor panel. Founders practice with the
              same panel until the room says &ldquo;I&rsquo;m in&rdquo;.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" nativeButton={false} render={<Link href={investorHref} />}>
                I&rsquo;m an investor <ArrowRight />
              </Button>
              <Button size="lg" variant="neutral" nativeButton={false} render={<Link href={founderHref} />}>
                I&rsquo;m a founder <ArrowRight />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {AVATARS.slice(0, 4).map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.name} src={a.image} alt={a.name} className="size-36 rounded-base border-2 border-border object-cover shadow-shadow" />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="grid gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-3xl font-bold">For investors</h2>
              <p className="mt-1 font-bold">Your first-round partners, on call for every startup.</p>
            </div>
            <Steps steps={INVESTOR_STEPS} />
            <Button className="self-start" nativeButton={false} render={<Link href={investorHref} />}>
              Build a panel <ArrowRight />
            </Button>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-3xl font-bold">For founders</h2>
              <p className="mt-1 font-bold">Pitch the hill before you climb it.</p>
            </div>
            <Steps steps={FOUNDER_STEPS} />
            <Button className="self-start" variant="neutral" nativeButton={false} render={<Link href={founderHref} />}>
              Start practicing <ArrowRight />
            </Button>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="flex flex-col gap-6">
          <h2 className="text-4xl font-bold">Pricing</h2>
          <PricingTables />
        </section>
      </main>
    </>
  );
}
