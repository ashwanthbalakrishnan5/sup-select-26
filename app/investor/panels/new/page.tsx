import { AppHeader } from '@/components/app-header';
import { PanelForm } from '@/components/investor/panel-form';
import { DEFAULT_PANEL } from '@/lib/config';
import { requireUser } from '@/lib/server/auth';

export const metadata = { title: 'New panel' };

export default async function NewPanelPage() {
  const user = await requireUser('investor');
  return (
    <>
      <AppHeader user={user} />
      <PanelForm initial={DEFAULT_PANEL} />
    </>
  );
}
