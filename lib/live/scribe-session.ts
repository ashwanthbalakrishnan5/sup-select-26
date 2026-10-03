// Silent pitch transcriber: gemini-3.5-transcribe-live-preview @ global, manual activity (VAD off), ONE activity per
// pitch. Measured 20/20 facts with custom_vocabulary, interim text every ~1 s, never speaks. See spec §7.4.
import { LiveSocket, liveUrl, modelPath, type LiveMessage } from './live-socket';

export const SCRIBE_MODEL = 'gemini-3.5-transcribe-live-preview';

export function scribeSetup(project: string, vocabulary: string[]) {
  return {
    model: modelPath(project, 'global', SCRIBE_MODEL),
    input_audio_transcription: { language_codes: ['en-US'], custom_vocabulary: vocabulary.slice(0, 50) },
    realtime_input_config: { automatic_activity_detection: { disabled: true } },
  };
}

export class ScribeSession {
  private socket: LiveSocket;
  private interim = '';
  private finalText = '';
  private finalWaiters: ((t: string) => void)[] = [];
  private active = false;
  /** Cumulative transcript of the current activity (replace, don't append). */
  onText: (text: string) => void = () => {};
  onDrop: (code: number, reason: string) => void = () => {};

  constructor(project: string, accessToken: string, vocabulary: string[]) {
    this.socket = new LiveSocket(liveUrl('global', accessToken), scribeSetup(project, vocabulary));
    this.socket.onMessage = this.handle;
    this.socket.onDrop = (c, r) => this.onDrop(c, r);
  }

  get ready() {
    return this.socket.ready;
  }

  get text() {
    return this.finalText || this.interim;
  }

  private handle = (msg: LiveMessage) => {
    const sc = msg.serverContent;
    if (sc?.interimInputTranscription?.text != null) {
      this.interim = sc.interimInputTranscription.text;
      this.onText(this.interim);
    }
    if (sc?.inputTranscription?.text != null) {
      this.finalText += sc.inputTranscription.text;
      this.onText(this.finalText);
      for (const w of this.finalWaiters.splice(0)) w(this.finalText);
    }
  };

  start() {
    this.active = true;
    this.socket.send({ realtime_input: { activity_start: {} } });
  }

  sendAudio(pcmBase64: string) {
    if (this.active) this.socket.sendAudio(pcmBase64);
  }

  /** Ends the activity and resolves with the final transcript (or the last interim after timeoutMs). */
  async end(timeoutMs = 3000): Promise<string> {
    if (!this.active) return this.text;
    this.active = false;
    this.socket.send({ realtime_input: { activity_end: {} } });
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.text), timeoutMs);
      this.finalWaiters.push((t) => {
        clearTimeout(timer);
        resolve(t);
      });
    });
  }

  close() {
    this.socket.close();
  }
}
