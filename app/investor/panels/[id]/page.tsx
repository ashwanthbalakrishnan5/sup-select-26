import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { PanelForm } from '@/components/investor/panel-form';
import { requireUser } from '@/lib/server/auth';
import { getPanel } from '@/lib/server/store';

export const metadata = { title: 'Panel' };

export default async function PanelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('investor');
  const panel = await getPanel((await params).id);
  if (!panel) notFound();
  return (
    <>
      <AppHeader user={user} />
      <PanelForm key={panel.updated_at} initial={panel.config} panelId={panel.id} />
    </>
  );
}
