import { AppHeader } from '@/components/app-header';
import { PricingTables } from '@/components/pricing-tables';
import { currentUser } from '@/lib/server/auth';

export const metadata = { title: 'Pricing' };

export default async function PricingPage() {
  return (
    <>
      <AppHeader user={await currentUser()} />
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-6 pb-24">
        <h1 className="text-5xl font-bold">Pricing</h1>
        <p className="text-lg">Simple plans for both sides of the table.</p>
        <PricingTables />
      </main>
    </>
  );
}
