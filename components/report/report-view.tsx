'use client';
// Report page body. Polls while the analysis runs (status processing/live). Spec §8.
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import type { SessionRecord } from '@/lib/types';
import {
  ConfidenceSection,
  CriteriaScores,
  EmotionSection,
  FactChecks,
  MustAskCoverage,
  RecommendationCard,
  RedFlags,
  MetricsGrid,
  OneLiner,
  QAReview,
  ScoreBreakdown,
  ScoreCard,
  Strengths,
  TopFixes,
  Transcript,
  VerdictStrip,
} from './report-sections';

type Rec = SessionRecord & { recording_url?: string | null };

/** audience 'investor' = the VC reading a startup's interview; 'founder' = practice feedback. */
export function ReportView({ initial, audience = 'founder' }: { initial: Rec; audience?: 'founder' | 'investor' }) {
  const router = useRouter();
  const [s, setS] = useState<Rec>(initial);
  const [busy, setBusy] = useState(false);
  const pending = s.status === 'processing' || s.status === 'live' || s.status === 'created';

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => api.getSession(s.id).then(setS).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [pending, s.id]);

  async function pitchAgain() {
    setBusy(true);
    try {
      const { id } = await api.createSession(s.config);
      router.push(`/room/${id}`);
    } catch {
      toast.add({ title: "Couldn't create the room.", type: 'error' });
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    try {
      // If the meeting never reached the server, re-send the copy saved in this tab.
      const saved = s.transcript ? null : sessionStorage.getItem(`pitchroom:finish:${s.id}`);
      await api.finishSession(s.id, saved ? JSON.parse(saved) : { retry: true });
      setS({ ...s, status: 'processing', error: null });
    } catch {
      toast.add({ title: 'Retry failed.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const date = new Date(s.started_at ?? s.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const durationMin = s.timings?.end ? Math.max(1, Math.round(s.timings.end / 60000)) : null;
  const r = s.report;
  const investor = audience === 'investor';
  const recording = s.recording_url && (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Recording</h2>
      <video src={s.recording_url} controls className="aspect-video w-full rounded-base border-2 border-border bg-black" />
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">{investor ? s.config.startupName : 'Pitch report'}</h1>
          <p className="mt-1">
            {investor
              ? `${s.config.founderName}${s.candidate?.email ? ` · ${s.candidate.email}` : ''} · ${s.config.panel?.name ?? ''} · ${date}`
              : `${s.config.startupName} · ${date}`}
            {durationMin ? ` · ${durationMin} min` : ''}
            {s.mode === 'test' ? ' · TEST RUN' : ''}
          </p>
          {investor && <p className="mt-1 italic">{s.config.oneLiner}</p>}
        </div>
        <div className="flex gap-3">
          {investor ? (
            <Button variant="neutral" onClick={() => router.push('/investor/reports')}>
              ← All reports
            </Button>
          ) : (
            <>
              <Button variant="neutral" onClick={() => router.push('/founder')}>
                New setup
              </Button>
              <Button onClick={pitchAgain} disabled={busy}>
                Pitch again
              </Button>
            </>
          )}
        </div>
      </header>

      {pending && (
        <>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Loader2 className="animate-spin" /> {investor ? 'Analyzing this interview…' : 'Analyzing your pitch…'} this takes about
              30–60 seconds.
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </>
      )}

      {s.status === 'failed' && (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t generate the analysis.</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            {s.error ?? 'Something went wrong.'}
            <Button size="sm" variant="neutral" onClick={retry} disabled={busy}>
              Retry analysis
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {s.status === 'ready' && r && s.metrics && (
        <>
          {investor && <RecommendationCard report={r} />}
          <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <ScoreCard score={r.overall_score} />
            <VerdictStrip config={s.config} report={r} verdicts={s.verdicts ?? []} />
          </section>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <p className="text-lg">{r.summary}</p>
              <OneLiner text={r.one_liner} />
            </CardContent>
          </Card>
          {investor && recording}
          {investor && <CriteriaScores items={r.criteria_scores ?? []} />}
          {investor && <RedFlags items={r.red_flags ?? []} />}
          {investor && <MustAskCoverage items={r.must_ask_coverage ?? []} />}
          <ConfidenceSection deliveries={s.delivery ?? []} feedback={r.confidence_feedback} />
          <EmotionSection deliveries={s.delivery ?? []} read={r.emotional_read} />
          <MetricsGrid m={s.metrics} config={s.config} feedback={r.delivery_feedback} />
          <ScoreBreakdown b={r.score_breakdown} />
          {!investor && <TopFixes fixes={r.top_fixes} />}
          <QAReview well={r.answered_well} dodged={r.dodged} />
          <FactChecks claims={s.fact_checks ?? []} />
          <Strengths items={r.strengths} />
          {!investor && recording}
          <Transcript lines={s.transcript ?? []} founder={s.config.founderName} />
        </>
      )}
    </main>
  );
}
