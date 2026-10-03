'use client';
// Pre-join lobby (neobrutalism). Spec §7.1: camera preview, mic meter, device pickers, panel preview, Join.
import { Check, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TOUGHNESS, avatarInfo } from '@/lib/catalog';
import { AvatarPlayer } from '@/lib/live/avatar-player';
import { seatTitle } from '@/lib/personas';
import type { RoomController } from '@/lib/room/controller';
import type { SessionConfig } from '@/lib/types';

type Device = { deviceId: string; label: string };

const supported = () =>
  AvatarPlayer.supported() && /Chrome\//.test(navigator.userAgent) && !/Mobile/.test(navigator.userAgent);

export function Lobby({
  config,
  controller,
  camera,
  onCamera,
  camOn,
  onCamOn,
  onJoin,
}: {
  config: SessionConfig;
  controller: RoomController;
  camera: MediaStream | null;
  onCamera: (s: MediaStream | null) => void;
  camOn: boolean;
  onCamOn: (on: boolean) => void;
  onJoin: (micOn: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [micOn, setMicOn] = useState(true);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState(false);
  const [camError, setCamError] = useState(false);
  const [level, setLevel] = useState(0);
  const [cams, setCams] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [camId, setCamId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const [ok, setOk] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser check must run after hydration
  useEffect(() => setOk(supported()), []);

  // Microphone (mandatory) — the same MicCapture is used during the meeting.
  useEffect(() => {
    let live = true;
    controller.mic
      .start(micId || undefined)
      .then(() => live && (setMicReady(true), setMicError(false)))
      .catch(() => live && (setMicReady(false), setMicError(true)));
    return () => {
      live = false;
    };
  }, [controller, micId, attempt]);

  // Camera (optional, local only — never sent to any model). The Room owns the stream's lifecycle (it keeps it for the
  // meeting tile and stops the previous one when it changes), so the lobby must not stop it on unmount.
  useEffect(() => {
    let live = true;
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: camId ? { exact: camId } : undefined, width: 1280, height: 720 } })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        onCamera(s);
        setCamError(false);
      })
      .catch(() => live && setCamError(true));
    return () => {
      live = false;
    };
  }, [camId, onCamera]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camOn ? camera : null;
  }, [camera, camOn]);

  // Device lists (labels are only available after permission).
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((ds) => {
      const map = (k: MediaDeviceKind) =>
        ds.filter((d) => d.kind === k && d.deviceId).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${k} ${i + 1}` }));
      setCams(map('videoinput'));
      setMics(map('audioinput'));
    });
  }, [micReady, camera]);

  // Mic level meter.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setLevel(controller.mic.level);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [controller]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-6 px-6 py-8">
      <h1 className="font-heading text-3xl font-bold">⛰️ Ready to pitch {config.startupName}?</h1>
      {!ok && (
        <Alert variant="destructive">
          <AlertTitle>Sandbox Hill needs desktop Chrome.</AlertTitle>
          <AlertDescription>Open this link in Google Chrome on a laptop or desktop.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        {/* Left — Check your setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Check your setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="relative aspect-video overflow-hidden rounded-base border-2 border-border bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
              {(!camOn || camError || !camera) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                  <VideoOff className="size-8" />
                  Camera is off
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-sm font-bold">Mic</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full border-2 border-border bg-secondary-background">
                <div className="h-full bg-main transition-[width]" style={{ width: `${Math.min(100, level * 600)}%` }} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="neutral" onClick={() => setMicOn((m) => !m)} aria-pressed={!micOn}>
                {micOn ? <Mic /> : <MicOff />} {micOn ? 'Mic on' : 'Mic off'}
              </Button>
              <Button variant="neutral" onClick={() => onCamOn(!camOn)} aria-pressed={!camOn}>
                {camOn ? <Video /> : <VideoOff />} {camOn ? 'Camera on' : 'Camera off'}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DevicePicker label="Camera" devices={cams} value={camId} onChange={setCamId} />
              <DevicePicker label="Microphone" devices={mics} value={micId} onChange={setMicId} />
            </div>
            {micError && (
              <Alert variant="destructive">
                <AlertTitle>Sandbox Hill needs your microphone.</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-2">
                  Allow microphone access in Chrome&apos;s address bar, then try again.
                  <Button size="sm" variant="neutral" onClick={() => setAttempt((a) => a + 1)}>
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Right — You're pitching to */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">You&apos;re pitching to</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {config.seats.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarInfo(s.avatar).image} alt="" className="size-12 rounded-base border-2 border-border object-cover" />
                  <div className="flex-1">
                    <div className="font-bold">
                      {s.avatar} {i === 0 && <Badge className="ml-1">HOST</Badge>}
                    </div>
                    <div className="text-sm">{seatTitle(s)}</div>
                  </div>
                  <Badge variant="neutral">{TOUGHNESS.find((t) => t.id === s.toughness)!.label}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 pt-6">
              <div className="font-bold">{config.startupName}</div>
              <div className="text-sm">{config.oneLiner}</div>
              <div className="text-sm">
                {config.pitchMinutes} min pitch · {config.qaMinutes} min Q&amp;A
              </div>
            </CardContent>
          </Card>
          <ul className="flex flex-col gap-1.5 text-sm">
            {[
              "Use headphones so investors don't hear themselves",
              'Open your slides in another window or tab',
              'Speak clearly — the panel is listening',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4" /> {t}
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full" disabled={!ok || !micReady} onClick={() => onJoin(micOn)}>
            Join meeting
          </Button>
          <p className="text-xs">Desktop Chrome required.</p>
        </div>
      </div>
    </main>
  );
}

function DevicePicker({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: Device[];
  value: string;
  onChange: (id: string) => void;
}) {
  const items = devices.map((d) => ({ value: d.deviceId, label: d.label }));
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select items={items} value={value || devices[0]?.deviceId || ''} onValueChange={(v) => v && onChange(v as string)}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          {items.map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
