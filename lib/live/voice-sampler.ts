// Collects the founder's voiced mic audio (100 ms PCM16 chunks with speech energy, plus a short hangover so words
// aren't clipped) and flushes ~45 s WAV clips for vocal-confidence analysis. Silence while investors talk is dropped.
import { base64ToBytes, bytesToBase64 } from './base64';
import { pcm16ToWav } from './wav';

const VOICE_RMS = 0.015;
const HANGOVER_CHUNKS = 5; // keep 500 ms after speech stops
export const FLUSH_SECONDS = 45;
export const MIN_SECONDS = 8;

export interface VoiceClip {
  wavBase64: string;
  startMs: number; // meeting clock when the first voiced chunk of this clip was captured
  seconds: number;
}

export class VoiceSampler {
  private chunks: Uint8Array[] = [];
  private startMs = 0;
  private hangover = 0;

  /** Feed every 100 ms chunk sent to a model. Returns a clip when FLUSH_SECONDS of speech have accumulated. */
  push(pcmBase64: string, rms: number, nowMs: number): VoiceClip | null {
    if (rms >= VOICE_RMS) this.hangover = HANGOVER_CHUNKS;
    else if (this.hangover > 0) this.hangover--;
    else return null;
    if (!this.chunks.length) this.startMs = nowMs;
    this.chunks.push(base64ToBytes(pcmBase64));
    return this.seconds >= FLUSH_SECONDS ? this.flush() : null;
  }

  get seconds() {
    return this.chunks.length / 10;
  }

  /** Returns the buffered speech as a clip (or null if shorter than MIN_SECONDS) and resets. */
  flush(): VoiceClip | null {
    const seconds = this.seconds;
    const chunks = this.chunks;
    this.chunks = [];
    this.hangover = 0;
    if (seconds < MIN_SECONDS) return null;
    return { wavBase64: bytesToBase64(pcm16ToWav(chunks)), startMs: this.startMs, seconds };
  }
}
