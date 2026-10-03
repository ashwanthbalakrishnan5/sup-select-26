'use client';
// Shortlist agent output for one panel: Claude's ranking of every finished interview (meet / maybe / pass).
// Refreshed automatically by the Supabase Compute worker after each interview; "Re-rank now" runs it on demand.
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import type { Panel } from '@/lib/types';

const TIER_STYLE = { meet: '#00D696', maybe: '#FACC00', pass: '#FF4D50' } as const;
const TIER_LABEL = { meet: 'Meet', maybe: 'Maybe', pass: 'Pass' } as const;

export function ShortlistCard({ panel, interviews }: { panel: Panel; interviews: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const s = panel.shortlist;

  async function rerank() {
    setBusy(true);
    try {
      const res = await fetch(`/api/panels/${panel.id}/shortlist`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      toast.add({ title: (e as Error).message, type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Sparkles /> Shortlist
          </CardTitle>
          <p className="mt-1 text-sm">
            Claude ranks every interview against your thesis and criteria. Updated automatically after each interview by the
            shortlist agent on Supabase Compute
            {panel.shortlist_at ? ` · last run ${new Date(panel.shortlist_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.
          </p>
        </div>
        <Button variant="neutral" onClick={rerank} disabled={busy || !interviews}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {busy ? 'Ranking…' : 'Re-rank now'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!s ? (
          <p className="text-sm">{interviews ? 'No ranking yet — click Re-rank now.' : 'Rankings appear once startups finish their interviews.'}</p>
        ) : (
          <>
            <p className="text-lg">{s.summary}</p>
            <ol className="flex flex-col gap-3">
              {s.ranking.map((r, i) => (
                <li key={r.session_id} className="flex gap-4 rounded-base border-2 border-border p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-base border-2 border-border bg-main text-lg font-bold">
                    {i + 1}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/investor/reports/${r.session_id}`} className="text-lg font-bold underline">
                        {r.startup}
                      </Link>
                      <Badge style={{ background: TIER_STYLE[r.tier] }} className="text-black uppercase">
                        {TIER_LABEL[r.tier]}
                      </Badge>
                    </div>
                    <p>{r.reason}</p>
                    <p className="text-sm">
                      <b>Standout:</b> {r.standout} · <b>Concern:</b> {r.concern}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs">
              {s.count} interview{s.count === 1 ? '' : 's'} ranked by {s.model}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
