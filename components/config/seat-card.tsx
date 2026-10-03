'use client';
// One investor seat on the config page. Spec §6.5.
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ARCHETYPES, AVATARS, TOUGHNESS, VOICES, archetype, avatarInfo } from '@/lib/catalog';
import type { ArchetypeId, AvatarName, SeatConfig, Toughness } from '@/lib/types';
import { PillGroup } from './pill-group';

const voiceItems = VOICES.map((v) => ({ value: v.name, label: `${v.name} — ${v.tone}` }));

/** One-click starters for an investor's custom instructions (panel editor). */
export const INSTRUCTION_CHIPS = [
  'Ask how confident they are in their numbers, and push back if they sound unsure.',
  'Ask about their go-to-market strategy for the first 100 customers.',
  'Ask why their product is better than [competitor X].',
  'Ask why they chose this approach instead of [alternative approach B].',
  'Probe their unit economics: CAC, payback and gross margin.',
  'Ask what the team has built before and why they will win.',
];

export function SeatCard({
  seat,
  index,
  usedAvatars,
  onChange,
  onRemove,
  withInstructions = false,
}: {
  seat: SeatConfig;
  index: number;
  usedAvatars: Set<AvatarName>;
  onChange: (seat: SeatConfig) => void;
  onRemove?: () => void;
  withInstructions?: boolean;
}) {
  const isHost = index === 0;
  const avatarItems = AVATARS.map((a) => ({ value: a.name, label: a.name }));
  const roleItems = ARCHETYPES.filter((a) => (isHost ? a.id === 'chair' : a.id !== 'chair')).map((a) => ({
    value: a.id,
    label: a.title,
  }));

  return (
    <div className="relative flex flex-col gap-3 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarInfo(seat.avatar).image}
          alt={seat.avatar}
          width={64}
          height={64}
          className="size-16 rounded-base border-2 border-border object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{seat.avatar}</span>
            {isHost && <Badge className="bg-main">HOST</Badge>}
          </div>
          <div className="text-sm">{archetype(seat.archetype).title}</div>
        </div>
        {onRemove && (
          <Button size="icon" variant="neutral" aria-label={`Remove ${seat.avatar}`} onClick={onRemove} className="size-8">
            <X />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Investor</Label>
          <Select
            items={avatarItems}
            value={seat.avatar}
            onValueChange={(v) => v && onChange({ ...seat, avatar: v as AvatarName, voice: avatarInfo(v as AvatarName).defaultVoice })}
          >
            <SelectTrigger aria-label="Investor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVATARS.map((a) => (
                <SelectItem key={a.name} value={a.name} disabled={a.name !== seat.avatar && usedAvatars.has(a.name)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Role</Label>
          <Select
            items={roleItems}
            value={seat.archetype}
            disabled={isHost}
            onValueChange={(v) => v && onChange({ ...seat, archetype: v as ArchetypeId })}
          >
            <SelectTrigger aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleItems.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Toughness</Label>
        <PillGroup<Toughness>
          label={`${seat.avatar} toughness`}
          value={seat.toughness}
          options={TOUGHNESS.map((t) => ({ value: t.id, label: t.label }))}
          onChange={(toughness) => onChange({ ...seat, toughness })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Voice</Label>
        <Select items={voiceItems} value={seat.voice} onValueChange={(v) => v && onChange({ ...seat, voice: v as string })}>
          <SelectTrigger aria-label="Voice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {voiceItems.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {withInstructions && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${seat.id}-instructions`}>Custom instructions for {seat.avatar}</Label>
          <Textarea
            id={`${seat.id}-instructions`}
            rows={4}
            maxLength={1500}
            placeholder="What should this investor focus on? e.g. Ask why this beats Ramp. Rate their confidence on GTM."
            value={seat.instructions ?? ''}
            onChange={(e) => onChange({ ...seat, instructions: e.target.value })}
          />
          <div className="flex flex-wrap gap-1.5">
            {INSTRUCTION_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="rounded-base border-2 border-border bg-secondary-background px-2 py-0.5 text-left text-xs hover:bg-main/40"
                onClick={() => onChange({ ...seat, instructions: [seat.instructions?.trim(), c].filter(Boolean).join('\n') })}
              >
                + {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
