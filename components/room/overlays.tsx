'use client';
// Captions, connecting overlay, ended overlay and leave dialog for the meeting. Spec §7.2.
import { Check, Loader2, X } from 'lucide-react';
import { avatarInfo } from '@/lib/catalog';
import type { RoomState } from '@/lib/room/controller';

/** Fixed-height row between the gallery and the control bar (never covers tiles or the shared screen). */
export function Captions({ caption }: { caption: RoomState['caption'] }) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-center px-4" aria-live="polite">
      {caption && (
        <p className="line-clamp-2 max-w-[720px] rounded-md bg-black/75 px-3 py-1.5 text-base text-white">
          <b>{caption.name}:</b> {caption.text}
        </p>
      )}
    </div>
  );
}

export function ConnectingOverlay({ state, onBack }: { state: RoomState; onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-[360px] rounded-lg bg-[#292929] p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">{state.error ?? 'Investors are joining…'}</h2>
        {!state.error && (
          <ul className="flex flex-col gap-3">
            {state.seats.map((s) => (
              <li key={s.seat.id} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarInfo(s.seat.avatar).image} alt="" className="size-8 rounded-full object-cover" />
                <span className="flex-1">{s.seat.avatar}</span>
                {s.status === 'connecting' && (
                  <span className="flex items-center gap-1 text-sm text-white/70">
                    <Loader2 className="size-4 animate-spin" /> Connecting…
                  </span>
                )}
                {s.status === 'ready' && (
                  <span className="flex items-center gap-1 text-sm text-[#00D696]">
                    <Check className="size-4" /> Ready
                  </span>
                )}
                {(s.status === 'failed' || s.status === 'dropped') && (
                  <span className="flex items-center gap-1 text-sm text-[#FF4D50]">
                    <X className="size-4" /> Couldn&apos;t join
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {state.error && (
          <button onClick={onBack} className="mt-2 rounded-md bg-[#7A83FF] px-4 py-2 font-semibold text-white">
            Back to setup
          </button>
        )}
      </div>
    </div>
  );
}

export function EndedOverlay({ submitted }: { submitted?: boolean }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#1f1f1f]/95">
      <Loader2 className="size-10 animate-spin" />
      <p className="text-xl font-semibold">{submitted ? "That's a wrap. Submitting your interview…" : "That's a wrap. Generating your report…"}</p>
    </div>
  );
}

/** Interview panels: the investors give their verdicts privately (muted, hidden) — they go only to the VC. */
export function DeliberatingOverlay() {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#1f1f1f]/95 text-center">
      <Loader2 className="size-10 animate-spin" />
      <p className="text-xl font-semibold">The panel is taking a moment to confer privately…</p>
      <p className="text-sm text-white/70">They&apos;ll be right back to wrap up.</p>
    </div>
  );
}

export function LeaveDialog({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="leave-title" className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-lg bg-[#292929] p-6 shadow-2xl">
        <h2 id="leave-title" className="text-lg font-semibold">
          Leave the meeting?
        </h2>
        <p className="mt-2 text-sm text-white/80">The panel will stop here. You&apos;ll still get a report on everything so far.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onStay} className="rounded-md border border-white/40 px-4 py-2 font-semibold">
            Stay
          </button>
          <button onClick={onLeave} className="rounded-md bg-[#C4314B] px-4 py-2 font-semibold text-white">
            Leave and get report
          </button>
        </div>
      </div>
    </div>
  );
}
