// One AI investor = one gemini-3.8-live avatar session + its AvatarPlayer. See spec §7.4.
import { AvatarPlayer } from './avatar-player';
import { base64ToBytes } from './base64';
import { LiveSocket, liveUrl, modelPath, type LiveMessage } from './live-socket';

export const INVESTOR_MODEL = 'gemini-3.8-live';

export interface InvestorSessionOptions {
  project: string;
  location: string; // 'us-central1' (only region serving gemini-3.8-live)
  accessToken: string;
  avatar: string;
  voice: string;
  instruction: string;
  videoBitrate?: number;
}

export function investorSetup(o: Omit<InvestorSessionOptions, 'accessToken'>) {
  return {
    model: modelPath(o.project, o.location, INVESTOR_MODEL),
    generation_config: {
      response_modalities: ['VIDEO'],
      speech_config: { voice_config: { prebuilt_voice_config: { voice_name: o.voice } } },
    },
    avatar_config: { avatar_name: o.avatar, video_bitrate_bps: o.videoBitrate ?? 500_000 },
    system_instruction: { parts: [{ text: o.instruction }] },
    input_audio_transcription: {},
    output_audio_transcription: {},
    // Default VAD ends the founder's turn on 0.44 s pauses; 1200 ms + LOW end sensitivity stops investors jumping
    // into mid-sentence pauses (e2e: 2 cut-ins per Q&A with 1200 ms alone).
    realtime_input_config: {
      automatic_activity_detection: { silence_duration_ms: 1200, end_of_speech_sensitivity: 'END_SENSITIVITY_LOW' },
    },
  };
}

export class InvestorSession {
  readonly player = new AvatarPlayer();
  private socket: LiveSocket;
  private outText = '';
  private inText = '';
  private interrupted = false;
  speaking = false;

  /** Model started/stopped speaking (from transcription events, never from video — video is continuous). */
  onSpeaking: (speaking: boolean) => void = () => {};
  /** Running text of the investor's current turn (for captions). */
  onOutputText: (text: string) => void = () => {};
  /** Running text of the founder's current answer, heard live by this investor. */
  onInputText: (text: string) => void = () => {};
  /** Founder finished a live answer (fires when the investor starts replying). */
  onFounderLine: (text: string) => void = () => {};
  /** Investor finished (or was interrupted). */
  onTurnComplete: (text: string, interrupted: boolean) => void = () => {};
  /** Server VAD on the founder's audio (only for the seat receiving the mic). */
  onActivity: (type: 'start' | 'end') => void = () => {};
  onDrop: (code: number, reason: string) => void = () => {};

  constructor(o: InvestorSessionOptions) {
    this.socket = new LiveSocket(liveUrl(o.location, o.accessToken), investorSetup(o));
    this.socket.onMessage = this.handle;
    this.socket.onDrop = (c, r) => this.onDrop(c, r);
  }

  get ready() {
    return this.socket.ready;
  }

  private flushFounder() {
    const t = this.inText.trim();
    this.inText = '';
    if (t) this.onFounderLine(t);
  }

  /** Founder speech heard since the investor last spoke (not yet answered). */
  get pendingFounderText() {
    return this.inText.trim();
  }

  private handle = (msg: LiveMessage) => {
    const va = msg.voiceActivity?.type;
    if (va === 'ACTIVITY_START') this.onActivity('start');
    if (va === 'ACTIVITY_END') this.onActivity('end');
    const sc = msg.serverContent;
    if (!sc) return;
    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.mimeType?.startsWith('video/mp4')) this.player.push(base64ToBytes(p.inlineData.data));
    }
    if (sc.inputTranscription?.text) {
      this.inText += sc.inputTranscription.text;
      this.onInputText(this.inText.trim());
    }
    if (sc.outputTranscription?.text) {
      if (!this.speaking) {
        this.flushFounder();
        this.speaking = true;
        this.onSpeaking(true);
      }
      this.outText += sc.outputTranscription.text;
      this.onOutputText(this.outText.trim());
    }
    if (sc.interrupted || sc.turnComplete) {
      const text = this.outText.trim();
      this.outText = '';
      if (this.speaking) {
        this.speaking = false;
        this.onSpeaking(false);
      }
      // The server sends `interrupted` and then a bare `turnComplete` for the same turn: report it once.
      if (sc.interrupted) {
        this.interrupted = true;
        this.onTurnComplete(text, true);
      } else if (this.interrupted && !text) {
        this.interrupted = false;
      } else {
        this.interrupted = false;
        this.onTurnComplete(text, false);
      }
    }
  };

  sendAudio(pcmBase64: string) {
    this.socket.sendAudio(pcmBase64);
  }

  /** Silent context: the investor "hears" it but does not reply. */
  addContext(text: string, images: string[] = []) {
    const parts: object[] = [{ text }];
    for (const data of images) parts.push({ inline_data: { mime_type: 'image/jpeg', data } });
    this.socket.sendTurn(parts, false);
  }

  /** A [Moderator] prompt the investor answers out loud. */
  prompt(text: string) {
    this.socket.sendTurn([{ text }], true);
  }

  close() {
    this.socket.close();
    this.player.dispose();
  }
}
