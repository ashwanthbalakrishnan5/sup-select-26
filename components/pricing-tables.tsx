// Pricing for both user bases (display-only for the demo; "$xx" placeholders). Upgrade → fake checkout page.
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
}

export const INVESTOR_PLANS: Plan[] = [
  {
    id: 'vc-scout',
    name: 'Scout',
    price: '$xx',
    per: '/month',
    blurb: 'For angels and solo GPs screening a handful of deals.',
    features: ['1 interview panel', '25 startup interviews / month', 'AI report + transcript', 'Voice confidence & emotion signals'],
  },
  {
    id: 'vc-fund',
    name: 'Fund',
    price: '$xx',
    per: '/month',
    blurb: 'For funds running a structured first round.',
    features: [
      'Unlimited panels',
      '200 startup interviews / month',
      'Custom prompts per AI investor',
      'Recordings + live fact-checking',
      'Custom scoring criteria',
    ],
    highlight: true,
  },
  {
    id: 'vc-platform',
    name: 'Platform',
    price: '$xx',
    per: '/month',
    blurb: 'For accelerators screening whole cohorts.',
    features: ['Everything in Fund', 'Unlimited interviews', 'Team seats', 'Priority avatar capacity'],
  },
];

export const FOUNDER_PLANS: Plan[] = [
  {
    id: 'founder-free',
    name: 'Free',
    price: '$0',
    per: '',
    blurb: 'Try a full practice pitch.',
    features: ['1 practice pitch', '1 AI investor', 'Basic report'],
  },
  {
    id: 'founder-pro',
    name: 'Pro',
    price: '$xx',
    per: '/month',
    blurb: 'Rehearse until the room says "I\'m in".',
    features: ['Unlimited practice pitches', 'Full 4-investor panel', 'Fact-checking + voice confidence', 'Recordings'],
    highlight: true,
  },
];

function PlanCard({ plan, role }: { plan: Plan; role: 'investor' | 'founder' }) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-base border-2 border-border p-6 shadow-shadow ${plan.highlight ? 'bg-main' : 'bg-secondary-background'}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold">{plan.name}</h3>
        {plan.highlight && <Badge variant="neutral">Popular</Badge>}
      </div>
      <div>
        <span className="text-5xl font-bold">{plan.price}</span>
        <span className="text-lg">{plan.per}</span>
      </div>
      <p className="text-sm">{plan.blurb}</p>
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="size-4 shrink-0" /> {f}
          </li>
        ))}
      </ul>
      <Button
        variant={plan.highlight ? 'neutral' : 'default'}
        nativeButton={false}
        render={<Link href={plan.price === '$0' ? `/login?role=${role}` : `/checkout?plan=${plan.id}`} />}
      >
        {plan.price === '$0' ? 'Start free' : `Choose ${plan.name}`}
      </Button>
    </div>
  );
}

export function PricingTables() {
  return (
    <div className="flex flex-col gap-12">
      <section id="investors" className="flex flex-col gap-4">
        <h2 className="text-3xl font-bold">For investors</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {INVESTOR_PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} role="investor" />
          ))}
        </div>
      </section>
      <section id="founders" className="flex flex-col gap-4">
        <h2 className="text-3xl font-bold">For founders</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {FOUNDER_PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} role="founder" />
          ))}
        </div>
      </section>
    </div>
  );
}
