'use client';
// In-call screen (Teams look) built on the Azure Communication Services UI kit — UI components only, no ACS
// backend: our own <video> elements are passed as renderElement. Loaded with next/dynamic(ssr:false). Spec §7.2.
import {
  CameraButton,
  ControlBar,
  ControlBarButton,
  DEFAULT_COMPONENT_ICONS,
  EndCallButton,
  FluentThemeProvider,
  MicrophoneButton,
  ScreenShareButton,
  VideoGallery,
  darkTheme,
  type VideoGalleryRemoteParticipant,
} from '@azure/communication-react';
import { registerIcons } from '@fluentui/react';
import { CheckCircle2, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { startScreenShare } from '@/lib/live/slides';
import type { RoomController, RoomState } from '@/lib/room/controller';
import type { SessionConfig } from '@/lib/types';
import { Captions, ConnectingOverlay, EndedOverlay, LeaveDialog } from './overlays';
import { TopBar } from './top-bar';

registerIcons({ icons: DEFAULT_COMPONENT_ICONS });

const theme = { ...darkTheme, palette: { ...darkTheme.palette, themePrimary: '#7A83FF' } };
const VERDICT_SUFFIX = { in: ' — ✅ IN', out: ' — ❌ OUT', unclear: ' — ❔' } as const;

/** <div><video muted autoplay></div> for an ACS tile (ACS shows its placeholder when renderElement has no children). */
class VideoBox {
  readonly box = document.createElement('div');
  readonly video = document.createElement('video');
  constructor(fit: 'cover' | 'contain') {
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.style.cssText = `width:100%;height:100%;object-fit:${fit};background:#000`;
    this.box.style.cssText = 'width:100%;height:100%';
    this.box.appendChild(this.video);
  }
  setStream(s: MediaStream | null) {
    this.video.srcObject = s;
    if (s) this.video.play().catch(() => {});
  }
}

export function Meeting({
  controller,
  state,
  config,
  camera,
  camOn,
  onCamOn,
  recording,
  onBackToSetup,
}: {
  controller: RoomController;
  state: RoomState;
  config: SessionConfig;
  camera: MediaStream | null;
  camOn: boolean;
  onCamOn: (on: boolean) => void;
  recording: boolean;
  onBackToSetup: () => void;
}) {
  const [cam] = useState(() => new VideoBox('cover'));
  const [share] = useState(() => new VideoBox('contain')); // never crop slides
  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const { phase } = state;

  useEffect(() => cam.setStream(camera), [cam, camera]);

  async function toggleShare() {
    if (shareStream) return stopShare();
    try {
      const s = await startScreenShare();
      share.setStream(s);
      s.getVideoTracks()[0].onended = () => stopShare(s); // Chrome's "Stop sharing" bar
      setShareStream(s);
      controller.startSlides(share.video);
    } catch {
      // user cancelled the picker
    }
  }

  function stopShare(s = shareStream) {
    s?.getTracks().forEach((t) => t.stop());
    share.setStream(null);
    setShareStream(null);
    controller.stopSlides();
  }

  useEffect(() => () => shareStream?.getTracks().forEach((t) => t.stop()), [shareStream]);

  // Keyboard: M toggles mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) controller.setMicMuted(!controller.getState().micMuted);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  const remotes = useMemo<VideoGalleryRemoteParticipant[]>(
    () =>
      state.seats
        .filter((s) => s.status === 'ready' || s.status === 'connecting')
        .map((s) => ({
          userId: s.seat.id,
          displayName: `${s.seat.avatar} · ${s.title}${s.verdict ? VERDICT_SUFFIX[s.verdict] : ''}`,
          isMuted: state.floorId !== s.seat.id,
          isSpeaking: s.speaking,
          raisedHand: s.hand && (phase === 'pitch' || phase === 'qa') ? { raisedHandOrderPosition: s.hand } : undefined,
          videoStream: { isAvailable: s.status === 'ready' && !!s.element, renderElement: s.element ?? undefined },
        })),
    [state.seats, state.floorId, phase],
  );
  const speaking = state.seats.filter((s) => s.speaking).map((s) => s.seat.id);

  return (
    <FluentThemeProvider fluentTheme={theme} rootStyle={{ height: '100%' }}>
      <div className="meeting-root" data-phase={phase} data-speaking={speaking.join(' ')}>
        <TopBar
          startupName={config.startupName}
          phase={phase}
          endsAt={state.phaseEndsAt}
          showTimer={config.showTimer}
          recording={recording}
        />
        <div className="relative min-h-0 flex-1">
          <VideoGallery
            layout="floatingLocalVideo"
            localVideoTileSize="16:9"
            localParticipant={{
              userId: 'founder',
              displayName: config.founderName,
              isMuted: state.micMuted,
              videoStream: { isAvailable: camOn && !!camera, renderElement: cam.box, isMirrored: true },
              isScreenSharingOn: !!shareStream,
              screenShareStream: shareStream ? { isAvailable: true, renderElement: share.box } : undefined,
            }}
            remoteParticipants={remotes}
            dominantSpeakers={speaking}
            showMuteIndicator
          />
          {(phase === 'connecting' || state.error) && <ConnectingOverlay state={state} onBack={onBackToSetup} />}
          {phase === 'ended' && <EndedOverlay />}
          <LeaveDialog
            open={leaveOpen}
            onStay={() => setLeaveOpen(false)}
            onLeave={() => {
              setLeaveOpen(false);
              void controller.end('left');
            }}
          />
        </div>
        {config.captions && <Captions caption={state.caption} />}
        <div className="flex shrink-0 justify-center pb-3">
          <ControlBar layout="horizontal">
            <MicrophoneButton
              checked={!state.micMuted}
              showLabel
              onToggleMicrophone={async () => controller.setMicMuted(!state.micMuted)}
            />
            <CameraButton checked={camOn} showLabel onToggleCamera={async () => onCamOn(!camOn)} />
            <ScreenShareButton
              checked={!!shareStream}
              showLabel
              strings={{ offLabel: 'Share', onLabel: 'Stop sharing' }}
              onToggleScreenShare={toggleShare}
            />
            {phase === 'intro' && (
              <ControlBarButton
                showLabel
                strings={{ label: 'Skip intro' }}
                onRenderIcon={() => <SkipForward size={20} />}
                onClick={() => controller.skipIntro()}
              />
            )}
            {phase === 'pitch' && (
              <ControlBarButton
                showLabel
                strings={{ label: 'Done pitching' }}
                onRenderIcon={() => <CheckCircle2 size={20} />}
                onClick={() => controller.donePitching()}
                styles={{ root: { background: '#7A83FF', color: '#fff' } }}
              />
            )}
            <EndCallButton showLabel onHangUp={async () => setLeaveOpen(true)} disabled={phase === 'ended'} />
          </ControlBar>
        </div>
      </div>
    </FluentThemeProvider>
  );
}
