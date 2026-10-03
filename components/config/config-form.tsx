'use client';
// Config page ("/"). Spec §6. Layout: hero → Your startup → Session → Your panel → Advanced → sticky footer.
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { MAX_PITCH_PLUS_QA, MAX_SEATS, PITCH_MINUTES, QA_MINUTES, STAGES, avatarInfo } from '@/lib/catalog';
import { api } from '@/lib/client/api';
import { DEFAULT_CONFIG, SessionConfigSchema, addSeat, parseVocabulary, removeSeat, totalMinutes } from '@/lib/config';
import type { SessionConfig, Stage } from '@/lib/types';
import { PillGroup } from './pill-group';
import { SeatCard } from './seat-card';

const STORAGE_KEY = 'sandboxhill:config:v2'; // v2: photoreal default panel (drops older saved seats)

export function loadSavedConfig(): SessionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = SessionConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as SessionConfig) : null;
  } catch {
    return null;
  }
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function ToggleRow({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="font-bold">{label}</div>
        <div className="text-sm">{help}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function ConfigForm() {
  const router = useRouter();
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_CONFIG);
  const [vocabRaw, setVocabRaw] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = loadSavedConfig();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore last-used config after hydration
      setConfig(saved);
      setVocabRaw(saved.vocabulary.join(', '));
    }
  }, []);

  const set = <K extends keyof SessionConfig>(k: K, v: SessionConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const parsed = useMemo(() => SessionConfigSchema.safeParse(config), [config]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
    return e;
  }, [parsed]);
  const err = (k: string) => (touched[k] || submitted ? errors[k] : undefined);
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const usedAvatars = new Set(config.seats.map((s) => s.avatar));

  async function submit() {
    setSubmitted(true);
    if (!parsed.success) {
      toast.add({ title: 'Check the highlighted fields', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await api.createSession(parsed.data as SessionConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
      } catch {}
      router.push(`/room/${id}`);
    } catch {
      toast.add({ title: "Couldn't create the room. Try again.", type: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-28">
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-6">
        {/* Hero */}
        <section className="flex flex-col items-start justify-between gap-6 py-6 md:flex-row md:items-end">
          <div>
            <h1 className="font-heading text-4xl font-bold leading-tight md:text-5xl">Pitch to an AI investor panel.</h1>
            <p className="mt-2 text-lg">Get grilled. Get a verdict. Get better.</p>
          </div>
          <div className="flex -space-x-2" aria-hidden>
            {config.seats.map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={s.id}
                src={avatarInfo(s.avatar).image}
                alt=""
                className="size-10 rounded-full border-2 border-border object-cover"
              />
            ))}
          </div>
        </section>

        {/* Card 1 — Your startup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Your startup</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Your name" error={err('founderName')} htmlFor="founderName">
              <Input
                id="founderName"
                placeholder="Priya"
                maxLength={40}
                value={config.founderName}
                onChange={(e) => set('founderName', e.target.value)}
                onBlur={blur('founderName')}
              />
            </Field>
            <Field label="Startup name" error={err('startupName')} htmlFor="startupName">
              <Input
                id="startupName"
                placeholder="LedgerLoop"
                maxLength={60}
                value={config.startupName}
                onChange={(e) => set('startupName', e.target.value)}
                onBlur={blur('startupName')}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="One-liner" error={err('oneLiner')} htmlFor="oneLiner">
                <div className="relative">
                  <Textarea
                    id="oneLiner"
                    rows={2}
                    maxLength={200}
                    placeholder="AI that closes the books for small businesses in a day"
                    value={config.oneLiner}
                    onChange={(e) => set('oneLiner', e.target.value)}
                    onBlur={blur('oneLiner')}
                  />
                  <span className="absolute right-2 bottom-1 text-xs">{config.oneLiner.length}/200</span>
                </div>
              </Field>
            </div>
            <Field label="Stage">
              <Select
                items={STAGES.map((s) => ({ value: s.id, label: s.label }))}
                value={config.stage}
                onValueChange={(v) => v && set('stage', v as Stage)}
              >
                <SelectTrigger aria-label="Stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Raising (optional)" htmlFor="raising">
              <Input
                id="raising"
                placeholder="$2M seed"
                maxLength={30}
                value={config.raising}
                onChange={(e) => set('raising', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        {/* Card 2 — Session */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Pitch length">
              <PillGroup
                label="Pitch length"
                value={config.pitchMinutes}
                onChange={(v) => set('pitchMinutes', v)}
                options={PITCH_MINUTES.map((m) => ({
                  value: m,
                  label: `${m} min`,
                  disabled: m + config.qaMinutes > MAX_PITCH_PLUS_QA,
                  title: m + config.qaMinutes > MAX_PITCH_PLUS_QA ? 'Meetings are capped at 10 minutes' : undefined,
                }))}
              />
            </Field>
            <Field label="Q&A length" error={err('qaMinutes')}>
              <PillGroup
                label="Q&A length"
                value={config.qaMinutes}
                onChange={(v) => set('qaMinutes', v)}
                options={QA_MINUTES.map((m) => ({
                  value: m,
                  label: `${m} min`,
                  disabled: m + config.pitchMinutes > MAX_PITCH_PLUS_QA,
                  title: m + config.pitchMinutes > MAX_PITCH_PLUS_QA ? 'Meetings are capped at 10 minutes' : undefined,
                }))}
              />
            </Field>
            <div className="divide-y-2 divide-border/20">
              <ToggleRow
                label="Show timer"
                help="Countdown in the top bar during the call."
                checked={config.showTimer}
                onChange={(v) => set('showTimer', v)}
              />
              <ToggleRow
                label="1-minute warning"
                help="A heads-up when one minute is left."
                checked={config.oneMinuteWarning}
                onChange={(v) => set('oneMinuteWarning', v)}
              />
              <ToggleRow
                label="Live captions"
                help="Show what's being said at the bottom of the call."
                checked={config.captions}
                onChange={(v) => set('captions', v)}
              />
            </div>
            <p className="text-sm">Total meeting ≈ {totalMinutes(config)} min (max 10)</p>
          </CardContent>
        </Card>

        {/* Card 3 — Your panel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Your panel</CardTitle>
            <Badge variant="neutral">
              {config.seats.length}/{MAX_SEATS} investors
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {config.seats.map((seat, i) => (
              <SeatCard
                key={seat.id}
                seat={seat}
                index={i}
                usedAvatars={usedAvatars}
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
            {err('seats') && <p className="text-sm font-medium text-red-600 md:col-span-2">{errors.seats}</p>}
          </CardContent>
        </Card>

        {/* Card 4 — Advanced */}
        <Accordion className="w-full">
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-xl">Advanced</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2 p-1">
                <ToggleRow
                  label="Live fact-checking"
                  help="Investors check your claims on the web while you pitch."
                  checked={config.factCheck}
                  onChange={(v) => set('factCheck', v)}
                />
                <ToggleRow
                  label="Voice confidence analysis"
                  help="The panel and your report take into account how confident you sound, not just what you say."
                  checked={config.voiceAnalysis}
                  onChange={(v) => set('voiceAnalysis', v)}
                />
                <ToggleRow
                  label="Record the meeting"
                  help="Saves a video of the call (panel, your camera and anything you share) to your report."
                  checked={config.record}
                  onChange={(v) => set('record', v)}
                />
                <Field label="Words to listen for" htmlFor="vocab">
                  <Input
                    id="vocab"
                    placeholder="LedgerLoop, FloQast, NetSuite"
                    value={vocabRaw}
                    onChange={(e) => {
                      setVocabRaw(e.target.value);
                      set('vocabulary', parseVocabulary(e.target.value));
                    }}
                  />
                  <p className="text-sm">Product, company and competitor names. Improves transcription.</p>
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>

      {/* Sticky footer */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-secondary-background">
        <div className="mx-auto flex h-20 w-full max-w-[960px] items-center justify-between gap-4 px-6">
          <span className="text-sm">
            {config.seats.length} investors · {config.pitchMinutes} min pitch · {config.qaMinutes} min Q&amp;A
          </span>
          <Button size="lg" onClick={submit} disabled={submitting || (submitted && !parsed.success)}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" /> Creating room…
              </>
            ) : (
              'Start pitch →'
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
