'use client';
// Investor panel editor: fund + thesis, timing, what to cover (must-ask), how to score (criteria), the AI investors
// with per-agent custom instructions, and actions: Save · Try it · Copy invite link.
import { Copy, FlaskConical, Loader2, Plus, Save, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Field, ToggleRow } from '@/components/config/config-form';
import { PillGroup } from '@/components/config/pill-group';
import { SeatCard } from '@/components/config/seat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { MAX_PITCH_PLUS_QA, MAX_SEATS, PITCH_MINUTES, QA_MINUTES } from '@/lib/catalog';
import { PanelConfigSchema, addSeat, parseLines, parseVocabulary, removeSeat, totalMinutes } from '@/lib/config';
import type { PanelConfig } from '@/lib/types';

async function postJson<T>(url: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function PanelForm({ initial, panelId }: { initial: PanelConfig; panelId?: string }) {
  const router = useRouter();
  const [config, setConfig] = useState<PanelConfig>(initial);
  const [mustAskRaw, setMustAskRaw] = useState(initial.mustAsk.join('\n'));
  const [criteriaRaw, setCriteriaRaw] = useState(initial.criteria.join('\n'));
  const [vocabRaw, setVocabRaw] = useState(initial.vocabulary.join(', '));
  const [busy, setBusy] = useState<null | 'save' | 'try' | 'draft'>(null);
  const [brief, setBrief] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof PanelConfig>(k: K, v: PanelConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const parsed = useMemo(() => PanelConfigSchema.safeParse(config), [config]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
    return e;
  }, [parsed]);
  const err = (k: string) => (submitted ? errors[k] : undefined);
  const usedAvatars = new Set(config.seats.map((s) => s.avatar));
  const [origin, setOrigin] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = panelId ? `${origin}/i/${panelId}` : '';

  /** Panel builder agent: Claude drafts every field from the investor's plain-English brief. */
  async function onDraft() {
    setBusy('draft');
    try {
      const { config: c } = await postJson<{ config: PanelConfig }>('/api/panels/draft', 'POST', { brief });
      setConfig(c);
      setMustAskRaw(c.mustAsk.join('\n'));
      setCriteriaRaw(c.criteria.join('\n'));
      setVocabRaw(c.vocabulary.join(', '));
      toast.add({ title: 'Claude drafted your panel — review and tweak anything below', type: 'success' });
    } catch (e) {
      toast.add({ title: (e as Error).message, type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  /** Saves (create or update) and returns the panel id. */
  async function save(): Promise<string | null> {
    setSubmitted(true);
    if (!parsed.success) {
      toast.add({ title: 'Check the highlighted fields', type: 'error' });
      return null;
    }
    if (panelId) {
      await postJson(`/api/panels/${panelId}`, 'PUT', parsed.data);
      return panelId;
    }
    const { id } = await postJson<{ id: string }>('/api/panels', 'POST', parsed.data);
    return id;
  }

  async function onSave() {
    setBusy('save');
    try {
      const id = await save();
      if (!id) return;
      toast.add({ title: 'Panel saved', type: 'success' });
      if (!panelId) router.replace(`/investor/panels/${id}`);
      else router.refresh();
    } catch (e) {
      toast.add({ title: (e as Error).message, type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function onTry() {
    setBusy('try');
    try {
      const id = await save();
      if (!id) return;
      const { id: sid } = await postJson<{ id: string }>(`/api/panels/${id}/sessions`, 'POST', { mode: 'test' });
      router.push(`/room/${sid}`);
    } catch (e) {
      toast.add({ title: (e as Error).message, type: 'error' });
      setBusy(null);
    }
  }

  return (
    <div className="pb-28">
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-4">
          <div>
            <h1 className="text-4xl font-bold">{panelId ? config.name || 'Interview panel' : 'New interview panel'}</h1>
            <p className="mt-1">Configure once, then send the invite link to every startup you want to screen.</p>
            {panelId && (
              <Link href={`/investor/reports?panel=${panelId}`} className="mt-1 inline-block font-bold underline">
                Interviews &amp; Claude shortlist →
              </Link>
            )}
          </div>
          {panelId && (
            <div className="flex w-full flex-col gap-1.5 md:w-auto">
              <span className="text-sm font-bold">Invite link for startups</span>
              <div className="flex gap-2">
                <Input readOnly value={inviteUrl} className="md:w-80" aria-label="Invite link" />
                <Button
                  variant="neutral"
                  size="icon"
                  aria-label="Copy invite link"
                  onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => toast.add({ title: 'Invite link copied', type: 'success' }))}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          )}
        </div>

        {!panelId && (
          <Card className="bg-main">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Sparkles /> Describe your fund — Claude builds the panel
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                aria-label="Describe your fund"
                rows={4}
                maxLength={4000}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="bg-secondary-background"
                placeholder="We're Atlas Capital, a $40M pre-seed fund for vertical AI in healthcare. We want to know how founders get past HIPAA and hospital procurement, why they beat Epic's built-in tools, and how confident they are about their pilot pipeline. Be tough on the numbers."
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">Claude picks the investors, writes each one&apos;s instructions, the must-ask questions and your scoring criteria.</p>
                <Button variant="neutral" onClick={onDraft} disabled={!!busy || brief.trim().length < 20}>
                  {busy === 'draft' ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy === 'draft' ? 'Drafting…' : 'Draft with Claude'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Your fund</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Panel name" error={err('name')} htmlFor="name">
              <Input id="name" maxLength={80} value={config.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Fund name" error={err('fundName')} htmlFor="fundName">
              <Input id="fundName" maxLength={60} value={config.fundName} onChange={(e) => set('fundName', e.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Investment thesis (the panel screens against this)" htmlFor="thesis">
                <Textarea id="thesis" rows={3} maxLength={1000} value={config.thesis} onChange={(e) => set('thesis', e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">What the panel must cover</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Must-ask questions (one per line)" htmlFor="mustAsk">
              <Textarea
                id="mustAsk"
                rows={6}
                placeholder={'Why is this better than product X?\nWhy this approach instead of approach B?\nWhat is your go-to-market strategy?'}
                value={mustAskRaw}
                onChange={(e) => {
                  setMustAskRaw(e.target.value);
                  set('mustAsk', parseLines(e.target.value, 10));
                }}
              />
              <p className="text-xs">The AI investors work these in naturally; the report shows which were covered.</p>
            </Field>
            <Field label="Score every startup on (one per line)" htmlFor="criteria">
              <Textarea
                id="criteria"
                rows={6}
                placeholder={'Market size\nProduct differentiation\nTraction\nTeam strength\nFounder confidence'}
                value={criteriaRaw}
                onChange={(e) => {
                  setCriteriaRaw(e.target.value);
                  set('criteria', parseLines(e.target.value, 8));
                }}
              />
              <p className="text-xs">Each report scores the startup 1–10 on these, with evidence.</p>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Interview format</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Pitch length">
              <PillGroup
                label="Pitch length"
                value={config.pitchMinutes}
                onChange={(v) => set('pitchMinutes', v)}
                options={PITCH_MINUTES.map((m) => ({ value: m, label: `${m} min`, disabled: m + config.qaMinutes > MAX_PITCH_PLUS_QA }))}
              />
            </Field>
            <Field label="Q&A length" error={err('qaMinutes')}>
              <PillGroup
                label="Q&A length"
                value={config.qaMinutes}
                onChange={(v) => set('qaMinutes', v)}
                options={QA_MINUTES.map((m) => ({ value: m, label: `${m} min`, disabled: m + config.pitchMinutes > MAX_PITCH_PLUS_QA }))}
              />
            </Field>
            <div className="grid gap-x-8 md:grid-cols-2">
              <ToggleRow label="Voice confidence & emotions" help="Analyze how confident, nervous or composed the founder sounds." checked={config.voiceAnalysis} onChange={(v) => set('voiceAnalysis', v)} />
              <ToggleRow label="Live fact-checking" help="Panel checks the founder's claims on the web during the pitch." checked={config.factCheck} onChange={(v) => set('factCheck', v)} />
              <ToggleRow label="Record the interview" help="Founders are asked to share their tab; the video is in your report." checked={config.record} onChange={(v) => set('record', v)} />
              <ToggleRow label="Show timer" help="Countdown in the call." checked={config.showTimer} onChange={(v) => set('showTimer', v)} />
              <ToggleRow label="1-minute warning" help="Heads-up when one minute is left." checked={config.oneMinuteWarning} onChange={(v) => set('oneMinuteWarning', v)} />
              <ToggleRow label="Live captions" help="Captions at the bottom of the call." checked={config.captions} onChange={(v) => set('captions', v)} />
            </div>
            <Field label="Words to listen for" htmlFor="vocab">
              <Input
                id="vocab"
                placeholder="Competitor and product names"
                value={vocabRaw}
                onChange={(e) => {
                  setVocabRaw(e.target.value);
                  set('vocabulary', parseVocabulary(e.target.value));
                }}
              />
            </Field>
            <p className="text-sm">Total interview ≈ {totalMinutes(config)} min (max 10)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Your AI investors</CardTitle>
            <Badge variant="neutral">
              {config.seats.length}/{MAX_SEATS}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {config.seats.map((seat, i) => (
              <SeatCard
                key={seat.id}
                seat={seat}
                index={i}
                usedAvatars={usedAvatars}
                withInstructions
                onChange={(next) => set('seats', config.seats.map((s) => (s.id === seat.id ? next : s)))}
                onRemove={i > 0 ? () => set('seats', removeSeat(config.seats, seat.id)) : undefined}
              />
            ))}
            {config.seats.length < MAX_SEATS && (
              <button
                type="button"
                onClick={() => set('seats', addSeat(config.seats))}
                className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-base border-2 border-dashed border-border font-bold hover:bg-main/30"
              >
                <Plus className="size-6" />
                Add investor
              </button>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-secondary-background">
        <div className="mx-auto flex h-20 w-full max-w-[960px] items-center justify-between gap-4 px-6">
          <span className="hidden text-sm sm:inline">
            {config.seats.length} investors · {config.pitchMinutes} min pitch · {config.qaMinutes} min Q&amp;A · {config.mustAsk.length} must-ask ·{' '}
            {config.criteria.length} criteria
          </span>
          <div className="flex gap-3">
            <Button variant="neutral" size="lg" onClick={onTry} disabled={!!busy}>
              {busy === 'try' ? <Loader2 className="animate-spin" /> : <FlaskConical />} Try it yourself
            </Button>
            <Button size="lg" onClick={onSave} disabled={!!busy}>
              {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} {panelId ? 'Save changes' : 'Create panel'}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
