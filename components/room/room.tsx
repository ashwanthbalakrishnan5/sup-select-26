'use client';
// Room shell: owns the RoomController and switches Lobby → Meeting. Spec §7.
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from '@/components/ui/toast';
import { uploadRecording } from '@/lib/client/supabase';
import { MeetingRecorder } from '@/lib/live/recorder';
import { RoomController } from '@/lib/room/controller';
import type { SessionConfig, SessionMode } from '@/lib/types';
import { Lobby } from './lobby';

// ACS UI touches `window` at import time → client-only.
const Meeting = dynamic(() => import('./meeting').then((m) => m.Meeting), {
  ssr: false,
  loading: () => <div className="meeting-root items-center justify-center">Loading meeting…</div>,
});

/** Where each kind of session goes when the meeting ends (interview reports belong to the VC, not the founder). */
const afterMeeting = (mode: SessionMode, id: string) =>
  mode === 'interview' ? '/thanks' : mode === 'test' ? `/investor/reports/${id}` : `/report/${id}`;

export function Room({ id, config, mode = 'practice' }: { id: string; config: SessionConfig; mode?: SessionMode }) {
  const router = useRouter();
  const [controller] = useState(() => new RoomController(id, config));
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const recorder = useRef<MeetingRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    controller.setHandlers({
      onNotice: (title, kind) => toast.add({ title, type: kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'info' }),
      onEnded: async () => {
        const rec = recorder.current;
        if (rec) {
          try {
            const blob = await rec.stop();
            if (blob) await uploadRecording(id, blob);
          } catch {
            toast.add({ title: "Couldn't save the recording.", type: 'warning' });
          }
        }
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        router.replace(afterMeeting(mode, id));
      },
    });
    // Close every WebSocket cleanly on tab close/refresh: abrupt drops can hold avatar quota slots.
    const onHide = () => controller.dispose();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      controller.dispose();
    };
  }, [controller, id, mode, router]);

  useEffect(() => () => camera?.getTracks().forEach((t) => t.stop()), [camera]);

  /** "Join meeting" click (user gesture): fullscreen + optional tab recording, then connect the panel. */
  function join(micOn: boolean) {
    if (config.record) {
      const rec = new MeetingRecorder();
      recorder.current = rec;
      rec.start(controller.mic.stream).then(
        () => setRecording(true),
        () => {
          recorder.current = null;
          toast.add({ title: 'Recording was not started.', type: 'info' });
        },
      );
    }
    document.documentElement.requestFullscreen?.().catch(() => {});
    controller.setMicMuted(!micOn);
    void controller.start();
  }

  if (state.phase === 'lobby')
    return (
      <Lobby
        config={config}
        controller={controller}
        camera={camera}
        onCamera={setCamera}
        camOn={camOn}
        onCamOn={setCamOn}
        onJoin={join}
      />
    );

  return (
    <Meeting
      controller={controller}
      state={state}
      config={config}
      camera={camera}
      camOn={camOn}
      onCamOn={setCamOn}
      recording={recording}
      onBackToSetup={() => router.push(mode === 'practice' ? '/founder' : mode === 'test' ? '/investor' : '/')}
    />
  );
}
