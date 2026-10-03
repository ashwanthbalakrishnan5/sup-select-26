// Display-only checkout for the demo (no payment is taken).
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { FOUNDER_PLANS, INVESTOR_PLANS } from '@/components/pricing-tables';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { currentUser } from '@/lib/server/auth';

export const metadata = { title: 'Checkout' };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: id } = await searchParams;
  const plan = [...INVESTOR_PLANS, ...FOUNDER_PLANS].find((p) => p.id === id) ?? INVESTOR_PLANS[1];
  const role = plan.id.startsWith('vc-') ? 'investor' : 'founder';
  return (
    <>
      <AppHeader user={await currentUser()} />
      <main className="mx-auto mt-10 w-full max-w-md px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-8 text-center">
            <CheckCircle2 className="size-12" />
            <h1 className="text-3xl font-bold">You&apos;re on {plan.name}</h1>
            <p>
              {plan.price}
              {plan.per} — demo mode, no payment was taken.
            </p>
            <Button size="lg" nativeButton={false} render={<Link href={`/login?role=${role}`} />}>
              Continue →
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
