'use client';
// A startup opening a VC's invite link: their details + consent → their interview room.
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field } from '@/components/config/config-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CandidateSchema } from '@/lib/config';

export function InviteForm({ panelId, record, voiceAnalysis }: { panelId: string; record: boolean; voiceAnalysis: boolean }) {
  const router = useRouter();
  const [c, setC] = useState({ founderName: '', startupName: '', oneLiner: '', email: '', consent: false });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const parsed = CandidateSchema.safeParse(c);
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
  const err = (k: string) => (submitted ? errors[k] : undefined);

  async function start() {
    setSubmitted(true);
    if (!parsed.success) return;
    setBusy(true);
    setServerError('');
    try {
      const res = await fetch(`/api/panels/${panelId}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'interview', candidate: c }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not start the interview');
      router.push(`/room/${data.id}`);
    } catch (e) {
      setServerError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Your name" error={err('founderName')} htmlFor="founderName">
          <Input id="founderName" maxLength={40} value={c.founderName} onChange={(e) => setC({ ...c, founderName: e.target.value })} />
        </Field>
        <Field label="Startup name" error={err('startupName')} htmlFor="startupName">
          <Input id="startupName" maxLength={60} value={c.startupName} onChange={(e) => setC({ ...c, startupName: e.target.value })} />
        </Field>
      </div>
      <Field label="One-liner" error={err('oneLiner')} htmlFor="oneLiner">
        <Textarea id="oneLiner" rows={2} maxLength={200} value={c.oneLiner} onChange={(e) => setC({ ...c, oneLiner: e.target.value })} />
      </Field>
      <Field label="Email (so the fund can reach you)" htmlFor="email">
        <Input id="email" type="email" maxLength={120} value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
      </Field>
      <label className="flex items-start gap-3 rounded-base border-2 border-border bg-secondary-background p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-black"
          checked={c.consent}
          onChange={(e) => setC({ ...c, consent: e.target.checked })}
        />
        <span>
          I understand this is an AI-run interview. The fund receives the transcript, an AI analysis of my answers
          {voiceAnalysis ? ', and voice-based signals of confidence and emotion inferred from my tone of voice' : ''}
          {record ? ', and a recording of the call (my browser will ask to share this tab)' : ''}. My camera is shown only to me and is never
          analyzed.
        </span>
      </label>
      {err('consent') && <p className="text-sm font-medium text-red-600">{errors.consent}</p>}
      {serverError && <p className="text-sm font-medium text-red-600">{serverError}</p>}
      <Button size="lg" onClick={start} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" /> Preparing your interview…
          </>
        ) : (
          'Continue to the interview →'
        )}
      </Button>
    </div>
  );
}
