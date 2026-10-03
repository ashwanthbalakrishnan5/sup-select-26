// Submitted interviews: startup, panel, when, score, recommendation, voice confidence, verdict tally.
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SessionSummary } from '@/lib/server/store';
import type { Panel } from '@/lib/types';

const REC_STYLE = { advance: '#00D696', hold: '#FACC00', pass: '#FF4D50' } as const;

export const avgConfidence = (s: SessionSummary) => {
  const d = s.delivery ?? [];
  return d.length ? Math.round((d.reduce((a, x) => a + x.confidence, 0) / d.length) * 10) / 10 : null;
};

export function InterviewTable({ rows, panels }: { rows: SessionSummary[]; panels: Panel[] }) {
  if (!rows.length) return <p className="text-sm">No interviews yet. Send your invite link to a startup — or try the panel yourself.</p>;
  const panelName = (id: string | null) => panels.find((p) => p.id === id)?.name ?? '—';
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Startup</TableHead>
          <TableHead>Panel</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Recommendation</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Verdicts</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => {
          const ins = (s.verdicts ?? []).filter((v) => v.decision === 'in').length;
          const conf = avgConfidence(s);
          const rec = s.report?.recommendation;
          return (
            <TableRow key={s.id}>
              <TableCell className="whitespace-normal">
                <div className="font-bold">{s.candidate?.startupName ?? s.config.startupName}</div>
                <div className="text-xs">
                  {s.candidate?.founderName ?? s.config.founderName}
                  {s.mode === 'test' && (
                    <Badge variant="neutral" className="ml-2">
                      TEST
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="whitespace-normal text-sm">{panelName(s.panel_id)}</TableCell>
              <TableCell className="text-sm">{new Date(s.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
              <TableCell className="text-lg font-bold">{s.report ? `${s.report.overall_score}` : s.status === 'failed' ? '—' : '…'}</TableCell>
              <TableCell>
                {rec ? (
                  <Badge style={{ background: REC_STYLE[rec] }} className="text-black uppercase">
                    {rec}
                  </Badge>
                ) : (
                  <span className="text-sm">{s.status === 'ready' ? '—' : s.status}</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{conf !== null ? `${conf}/10` : '—'}</TableCell>
              <TableCell className="text-sm">{s.verdicts?.length ? `${ins}/${s.verdicts.length} in` : '—'}</TableCell>
              <TableCell>
                <Link href={`/investor/reports/${s.id}`} className="font-bold underline">
                  Open
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
