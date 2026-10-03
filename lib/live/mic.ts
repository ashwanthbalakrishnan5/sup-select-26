// Microphone → 16 kHz PCM16 100 ms chunks (base64) for the Live API. Needs /pcm-worklet.js in public/.
import { bytesToBase64 } from './base64';

export class MicCapture {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  stream: MediaStream | null = null;
  muted = false;
  level = 0; // RMS 0..1 of the last chunk
  /** Called for every 100 ms chunk while not muted (rms = speech energy 0..1 of that chunk). */
  onChunk: (pcmBase64: string, rms: number) => void = () => {};
  /** Called for every chunk (even when muted) with the RMS level, for meters and "you're muted" hints. */
  onLevel: (rms: number) => void = () => {};

  async start(deviceId?: string) {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule('/pcm-worklet.js');
    this.node = new AudioWorkletNode(this.ctx, 'pcm-capture');
    this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      this.level = e.data.rms;
      this.onLevel(e.data.rms);
      if (!this.muted) this.onChunk(bytesToBase64(new Uint8Array(e.data.pcm)), e.data.rms);
    };
    this.ctx.createMediaStreamSource(this.stream).connect(this.node);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /** Muted = nothing is forwarded to any model. The track stays live so the level meter can warn "you're muted". */
  setMuted(muted: boolean) {
    this.muted = muted;
  }

  stop() {
    this.node?.disconnect();
    this.ctx?.close().catch(() => {});
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.ctx = null;
    this.stream = null;
  }
}
