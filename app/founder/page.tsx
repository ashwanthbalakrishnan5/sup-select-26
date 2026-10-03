// Founder practice: configure a practice panel and pitch.
import { AppHeader } from '@/components/app-header';
import { ConfigForm } from '@/components/config/config-form';
import { requireUser } from '@/lib/server/auth';

export const metadata = { title: 'Practice' };

export default async function FounderPage() {
  const user = await requireUser('founder');
  return (
    <>
      <AppHeader user={user} />
      <ConfigForm />
    </>
  );
}
