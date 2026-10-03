'use client';
// Report sections (neobrutalism). Spec §8.
import { Check, Copy } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { avatarInfo } from '@/lib/catalog';
import { seatTitle } from '@/lib/personas';
import { mmss } from '@/lib/room/transcript';
import type { Claim, DeliveryChunk, Metrics, QAItem, Report, SessionConfig, TranscriptLine, Verdict } from '@/lib/types';

const GREEN = '#00D696';
const RED = '#FF4D50';

export function scoreLabel(score: number) {
  if (score >= 80) return 'Term-sheet ready';
  if (score >= 65) return 'Promising';
  if (score >= 50) return 'Typical seed pitch';
  return 'Needs work';
}

export function ScoreCard({ score }: { score: number }) {
  return (
    <Card className="bg-main">
      <CardContent className="flex h-full flex-col justify-center gap-1 pt-6">
        <div className="flex items-baseline gap-1">
          <span className="text-7xl font-bold">{score}</span>
          <span className="text-2xl font-bold">/100</span>
        </div>
        <div className="text-lg font-bold">{scoreLabel(score)}</div>
      </CardContent>
    </Card>
  );
}

export function VerdictStrip({ config, report, verdicts }: { config: SessionConfig; report: Report; verdicts: Verdict[] }) {
  const items = config.seats.map((seat) => {
    const model = report.investor_verdicts.find((v) => v.investor === seat.avatar);
    const spoken = verdicts.find((v) => v.name === seat.avatar);
    // What they actually said wins; the model's reading is the fallback.
    const spokenDecision = spoken && spoken.decision !== 'unclear' ? spoken.decision : null;
    const modelDecision = model && model.decision !== 'conditional' ? model.decision : null;
    const decision = spokenDecision ?? modelDecision ?? 'unclear';
    return { seat, decision, reason: model?.reason ?? spoken?.text ?? '', moment: model?.deciding_moment };
  });
  const ins = items.filter((i) => i.decision === 'in').length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {ins} of {items.length} investors are in
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {items.map(({ seat, decision, reason, moment }) => (
          <div key={seat.id} className="flex gap-3 rounded-base border-2 border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarInfo(seat.avatar).image} alt="" className="size-14 rounded-base border-2 border-border object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold">{seat.avatar}</span>
                <Badge
                  style={{ background: decision === 'in' ? GREEN : decision === 'out' ? RED : '#d4d4d4' }}
                  className="text-black"
                >
                  {decision.toUpperCase()}
                </Badge>
              </div>
              <div className="text-xs">{seatTitle(seat)}</div>
              <p className="mt-1 text-sm">{reason}</p>
              {moment && <p className="mt-1 text-xs italic">{moment}</p>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function OneLiner({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-base border-2 border-main bg-secondary-background p-4">
      <div>
        <div className="text-xs font-bold uppercase">Your sharper one-liner</div>
        <p className="mt-1 text-lg font-bold">{text}</p>
      </div>
      <Button
        size="icon"
        variant="neutral"
        aria-label="Copy one-liner"
        onClick={() => navigator.clipboard.writeText(text).then(() => toast.add({ title: 'Copied', type: 'success' }))}
      >
        <Copy />
      </Button>
    </div>
  );
}

function Stat({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
      <div className="text-sm font-bold">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
      {hint && <div className="text-sm">{hint}</div>}
      {children}
    </div>
  );
}

const fmtSecs = (s: number) => mmss(s * 1000).replace(/^0/, '');

export function MetricsGrid({ m, config, feedback }: { m: Metrics; config: SessionConfig; feedback: string }) {
  const target = config.pitchMinutes * 60;
  const diff = m.pitch_duration_s - target;
  const pace = m.pitch_wpm < 120 ? 'Slow' : m.pitch_wpm > 165 ? 'Fast' : 'Natural';
  const share = Math.round(m.qa_founder_share * 100);
  const totalQ = Object.values(m.questions_per_investor).reduce((a, b) => a + b, 0);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Delivery</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Pitch length"
          value={fmtSecs(m.pitch_duration_s)}
          hint={Math.abs(diff) <= 15 ? 'On time' : diff > 0 ? `Over by ${fmtSecs(diff)}` : `Under by ${fmtSecs(-diff)}`}
        />
        <Stat label="Speaking pace" value={`${m.pitch_wpm} wpm`} hint={pace} />
        <Stat label="Filler words" value={String(m.filler_total)} hint={`${m.filler_per_100_words}/100 words`}>
          <div className="flex flex-wrap gap-1">
            {Object.entries(m.filler_breakdown)
              .slice(0, 3)
              .map(([k, v]) => (
                <Badge key={k} variant="neutral">
                  {k} ×{v}
                </Badge>
              ))}
          </div>
        </Stat>
        <Stat label="Q&A talk share" value={`${share}%`} hint={share >= 40 && share <= 65 ? 'Balanced' : share > 65 ? 'You talked a lot' : 'Panel talked a lot'} />
        <Stat label="Longest answer" value={`${m.longest_answer_s} s`} hint={m.longest_answer_s > 60 ? 'Too long — aim for 30 s' : 'Good length'} />
        <Stat label="Questions asked" value={String(totalQ)}>
          <div className="flex flex-wrap gap-1">
            {Object.entries(m.questions_per_investor).map(([k, v]) => (
              <Badge key={k} variant="neutral">
                {k} {v}
              </Badge>
            ))}
          </div>
        </Stat>
      </div>
      {feedback && <p>{feedback}</p>}
    </section>
  );
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
const confidenceColor = (c: number) => (c >= 7 ? GREEN : c >= 5 ? '#FACC00' : RED);

/** Vocal confidence: averages, one bar per ~45 s clip (height = confidence), notes and notable moments. */
export function ConfidenceSection({ deliveries, feedback }: { deliveries: DeliveryChunk[]; feedback?: string }) {
  if (!deliveries.length) return null;
  const c = avg(deliveries.map((d) => d.confidence));
  const moments = deliveries.flatMap((d) => d.moments.map((m) => ({ t: d.startSec + m.at_seconds, text: m.observation })));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Confidence &amp; delivery</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
          <div className="text-sm font-bold">Vocal confidence</div>
          <div className="text-5xl font-bold" style={{ color: confidenceColor(c) }}>
            {c}
            <span className="text-2xl text-foreground">/10</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="neutral">Energy {avg(deliveries.map((d) => d.energy))}/10</Badge>
            <Badge variant="neutral">Clarity {avg(deliveries.map((d) => d.clarity))}/10</Badge>
            <Badge variant="neutral">{deliveries.reduce((a, d) => a + d.hesitations, 0)} hesitations</Badge>
          </div>
        </div>
        <div className="rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
          <div className="mb-2 text-sm font-bold">Confidence over the meeting</div>
          <div className="flex h-32 items-end gap-2" role="img" aria-label="Confidence per clip">
            {deliveries.map((d, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={d.note}>
                <div
                  className="w-full rounded-t-base border-2 border-border"
                  style={{ height: `${d.confidence * 10}%`, background: confidenceColor(d.confidence) }}
                />
                <span className="text-xs">
                  {mmss(d.startSec * 1000)} {d.phase === 'qa' ? 'Q&A' : 'pitch'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {feedback && <p>{feedback}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {deliveries.map((d, i) => (
          <li key={i}>
            <span className="font-bold">[{mmss(d.startSec * 1000)}]</span> {d.note}
          </li>
        ))}
        {moments.map((m, i) => (
          <li key={`m${i}`}>
            <span className="font-bold">[{mmss(m.t * 1000)}]</span> {m.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

const AREAS: [keyof Report['score_breakdown'], string][] = [
  ['problem', 'Problem'],
  ['solution', 'Solution'],
  ['traction', 'Traction'],
  ['market', 'Market'],
  ['team', 'Team'],
  ['delivery', 'Delivery'],
  ['qa_handling', 'Q&A handling'],
  ['credibility', 'Credibility'],
];

export function ScoreBreakdown({ b }: { b: Report['score_breakdown'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score breakdown</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {AREAS.map(([k, label]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm font-bold">{label}</span>
            <Progress value={(b[k] ?? 0) * 10} className="flex-1" aria-label={label} />
            <span className="w-10 text-right text-sm">{b[k]}/10</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TopFixes({ fixes }: { fixes: Report['top_fixes'] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Top 3 fixes</h2>
      {fixes.map((f, i) => (
        <div key={i} className="flex gap-4 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-base border-2 border-border bg-main text-xl font-bold">
            {i + 1}
          </div>
          <div className="flex flex-col gap-1">
            <div className="font-bold">{f.fix}</div>
            <div className="text-sm">{f.why}</div>
            <blockquote className="mt-1 border-l-4 border-border pl-3 text-sm">
              <span className="font-bold">Say instead:</span> {f.example}
            </blockquote>
          </div>
        </div>
      ))}
    </section>
  );
}

function QAList({ title, items, color }: { title: string; items: QAItem[]; color: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">{title}</h3>
      {items.length === 0 && <p className="text-sm">None.</p>}
      {items.map((q, i) => (
        <div key={i} className="rounded-base border-2 border-border bg-secondary-background p-3" style={{ borderLeft: `8px solid ${color}` }}>
          <Badge variant="neutral">{q.investor}</Badge>
          <div className="mt-1 font-bold">{q.question}</div>
          <p className="text-sm">
            “{q.answer_quote}” <span className="text-xs">[{q.timestamp}]</span>
          </p>
          <p className="mt-1 text-sm">{q.why}</p>
        </div>
      ))}
    </div>
  );
}

export function QAReview({ well, dodged }: { well: QAItem[]; dodged: QAItem[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Q&amp;A review</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <QAList title="Answered well" items={well} color={GREEN} />
        <QAList title="Dodged" items={dodged} color={RED} />
      </div>
    </section>
  );
}

export function FactChecks({ claims }: { claims: Claim[] }) {
  const flagged = claims.filter((c) => c.verdict !== 'supported');
  if (!flagged.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Fact-check flags</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Claim</TableHead>
            <TableHead>Verdict</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Sources</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flagged.map((c, i) => (
            <TableRow key={i}>
              <TableCell className="max-w-xs whitespace-normal">
                {c.claim} <span className="text-xs">[{c.timestamp}]</span>
              </TableCell>
              <TableCell>
                <Badge style={{ background: c.verdict === 'contradicted' ? RED : '#d4d4d4' }}>{c.verdict}</Badge>
              </TableCell>
              <TableCell className="max-w-sm whitespace-normal text-sm">{c.evidence}</TableCell>
              <TableCell className="space-x-2">
                {c.source_urls.map((u, j) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="font-bold underline">
                    {j + 1}
                  </a>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export function Strengths({ items }: { items: string[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Strengths</h2>
      <ul className="flex flex-col gap-2">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <Check className="mt-0.5 size-5 shrink-0" /> {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Transcript({ lines, founder }: { lines: TranscriptLine[]; founder: string }) {
  return (
    <Accordion>
      <AccordionItem value="transcript">
        <AccordionTrigger>Full transcript ({lines.length} lines)</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2 p-1 text-sm">
            {lines.map((l) => (
              <p key={l.id}>
                <span className="text-xs">[{mmss(l.t)}]</span>{' '}
                <span className={l.speaker === 'founder' ? 'bg-main px-1 font-bold' : 'font-bold'}>
                  {l.speaker === 'founder' ? founder : l.name}:
                </span>{' '}
                {l.text}
              </p>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ---------- investor-facing sections (interview / test sessions) ----------

const REC = {
  advance: { label: 'Advance to human round', color: GREEN },
  hold: { label: 'Hold — needs more info', color: '#FACC00' },
  pass: { label: 'Pass', color: RED },
} as const;

export function RecommendationCard({ report }: { report: Report }) {
  if (!report.recommendation) return null;
  const r = REC[report.recommendation];
  return (
    <div className="flex flex-col gap-2 rounded-base border-2 border-border p-5 shadow-shadow" style={{ background: r.color }}>
      <div className="text-sm font-bold uppercase">AI panel recommendation</div>
      <div className="text-3xl font-bold">{r.label}</div>
      {report.recommendation_reason && <p>{report.recommendation_reason}</p>}
    </div>
  );
}

export function CriteriaScores({ items }: { items: NonNullable<Report['criteria_scores']> }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your criteria</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.map((c) => (
          <div key={c.criterion} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="w-48 shrink-0 text-sm font-bold">{c.criterion}</span>
              <Progress value={c.score * 10} className="flex-1" aria-label={c.criterion} />
              <span className="w-10 text-right text-sm">{c.score}/10</span>
            </div>
            <p className="text-xs">{c.evidence}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MustAskCoverage({ items }: { items: NonNullable<Report['must_ask_coverage']> }) {
  const real = items.filter((i) => i.question !== '(none)');
  if (!real.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Your must-ask questions</h2>
      {real.map((m) => (
        <div key={m.question} className="rounded-base border-2 border-border bg-secondary-background p-3" style={{ borderLeft: `8px solid ${m.covered ? GREEN : RED}` }}>
          <div className="flex items-center gap-2 font-bold">
            {m.covered ? <Check className="size-4" /> : '✗'} {m.question}
          </div>
          <p className="text-sm">{m.answer_summary}</p>
        </div>
      ))}
    </section>
  );
}

export function RedFlags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold">Red flags</h2>
      <ul className="flex flex-col gap-2">
        {items.map((f, i) => (
          <li key={i} className="rounded-base border-2 border-border bg-secondary-background p-3 text-sm" style={{ borderLeft: `8px solid ${RED}` }}>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

const EMOTIONS = [
  ['composure', 'Composure', GREEN],
  ['enthusiasm', 'Enthusiasm', '#7A83FF'],
  ['nervousness', 'Nervousness', '#FACC00'],
  ['defensiveness', 'Defensiveness', RED],
] as const;

/** Voice-based emotion signals: averages + per-clip dominant emotion. */
export function EmotionSection({ deliveries, read }: { deliveries: DeliveryChunk[]; read?: string }) {
  const withEmotions = deliveries.filter((d) => d.emotions);
  if (!withEmotions.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Emotional signals (from voice)</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-3 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
          {EMOTIONS.map(([k, label, color]) => {
            const v = avg(withEmotions.map((d) => d.emotions[k]));
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm font-bold">{label}</span>
                <div className="h-4 flex-1 rounded-base border-2 border-border bg-background">
                  <div className="h-full" style={{ width: `${v * 10}%`, background: color }} />
                </div>
                <span className="w-10 text-right text-sm">{v}/10</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
          <div className="text-sm font-bold">Moment by moment</div>
          {withEmotions.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 font-bold">
                [{mmss(d.startSec * 1000)}] {d.phase === 'qa' ? 'Q&A' : 'pitch'}
              </span>
              <Badge variant="neutral">{d.dominant_emotion}</Badge>
              <span className="truncate">{d.note}</span>
            </div>
          ))}
        </div>
      </div>
      {read && <p>{read}</p>}
      <p className="text-xs">Signals are inferred from tone of voice (pace, steadiness, pauses, hesitations). Use them as context, not as a verdict on the person.</p>
    </section>
  );
}
