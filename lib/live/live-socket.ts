// Minimal Gemini Live API WebSocket client (browser). Auth via ?access_token= (verified: browsers can't set headers).
// Server frames arrive as binary JSON. See spec §7.4.

export type LiveMessage = Record<string, unknown> & {
  setupComplete?: object;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { mimeType: string; data: string }; text?: string }[] };
    outputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
    interimInputTranscription?: { text?: string };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
  voiceActivity?: { type?: 'ACTIVITY_START' | 'ACTIVITY_END' };
  goAway?: { timeLeft?: string };
};

export class LiveSetupError extends Error {
  constructor(
    public code: number,
    public reason: string,
  ) {
    super(`Live setup failed (${code}): ${reason}`);
  }
  /** Avatar concurrency quota hit (close 1011 RESOURCE_EXHAUSTED). */
  get capacity() {
    return this.reason.includes('RESOURCE_EXHAUSTED');
  }
}

export const liveUrl = (location: string, accessToken: string) => {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `wss://${host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=${encodeURIComponent(accessToken)}`;
};

export const modelPath = (project: string, location: string, model: string) =>
  `projects/${project}/locations/${location}/publishers/google/models/${model}`;

export class LiveSocket {
  private ws: WebSocket;
  private decoder = new TextDecoder();
  private closedByUs = false;
  /** Resolves on setupComplete; rejects with LiveSetupError if the socket closes first. */
  readonly ready: Promise<void>;
  onMessage: (msg: LiveMessage) => void = () => {};
  /** Unexpected close after setup (not called when close() was called by us). */
  onDrop: (code: number, reason: string) => void = () => {};

  constructor(url: string, setup: object) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    let setupDone = false;
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => this.ws.send(JSON.stringify({ setup }));
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : this.decoder.decode(e.data)) as LiveMessage;
        if (msg.setupComplete && !setupDone) {
          setupDone = true;
          resolve();
        }
        this.onMessage(msg);
      };
      this.ws.onclose = (e) => {
        if (!setupDone) reject(new LiveSetupError(e.code, e.reason));
        else if (!this.closedByUs) this.onDrop(e.code, e.reason);
      };
    });
  }

  get open() {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: object) {
    if (this.open) this.ws.send(JSON.stringify(msg));
  }

  sendAudio(pcmBase64: string) {
    this.send({ realtime_input: { audio: { mime_type: 'audio/pcm;rate=16000', data: pcmBase64 } } });
  }

  /** turn_complete:false = silent context (never triggers a reply); true = prompt (model replies). */
  sendTurn(parts: object[], turnComplete: boolean) {
    this.send({ client_content: { turns: [{ role: 'user', parts }], turn_complete: turnComplete } });
  }

  /** Clean close releases the avatar quota slot immediately (abrupt drops can lock the project out). */
  close() {
    this.closedByUs = true;
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close(1000);
  }
}
