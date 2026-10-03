'use client';
// Meeting top bar (Teams dark). Spec §7.2: brand · phase pill · REC · countdown.
import { useEffect, useState } from 'react';
import type { Phase } from '@/lib/types';

const PILL: Partial<Record<Phase, { label: string; style: string }>> = {
  connecting: { label: 'JOINING…', style: 'border-white text-white' },
  intro: { label: 'INTRO', style: 'border-white text-white' },
  pitch: { label: 'PITCH', style: 'border-white bg-[#7A83FF] text-white' },
  qa: { label: 'Q&A', style: 'border-black bg-[#FACC00] text-black' },
  verdict: { label: 'VERDICT', style: 'border-black bg-[#00D696] text-black' },
  ended: { label: 'ENDED', style: 'border-white text-white' },
};

export function TopBar({
  startupName,
  phase,
  endsAt,
  showTimer,
  recording,
}: {
  startupName: string;
  phase: Phase;
  endsAt: number | null;
  showTimer: boolean;
  recording: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const color = left === null ? '' : left <= 15 ? 'text-[#FF4D50]' : left <= 60 ? 'text-[#FACC00]' : 'text-white';
  const pill = PILL[phase];

  return (
    <div className="grid h-12 shrink-0 grid-cols-3 items-center bg-[#292929] px-4">
      <div className="truncate text-sm font-semibold">🦈 PitchRoom · {startupName}</div>
      <div className="flex justify-center">
        {pill && <span className={`rounded-full border-2 px-3 py-0.5 text-xs font-bold tracking-wide ${pill.style}`}>{pill.label}</span>}
      </div>
      <div className="flex items-center justify-end gap-4">
        {recording && (
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <span className="size-2.5 animate-pulse rounded-full bg-[#FF4D50]" /> REC
          </span>
        )}
        {showTimer && left !== null && (
          <span className={`tabular text-lg font-bold ${color}`} aria-label="Time left">
            {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  );
}
