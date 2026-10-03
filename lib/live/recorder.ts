// Records the meeting without any browser prompt: the call is composited onto a canvas (shared screen, investor
// tiles, founder camera) and mixed with the founder's mic + the investors' audio (captured from their <video>s).

export interface RecordingSources {
  investors: { name: string; video: HTMLVideoElement }[];
  camera: HTMLVideoElement | null;
  share: HTMLVideoElement | null;
}

const W = 1280;
const H = 720;
const FPS = 15;

/** Draws `v` letterboxed into the box (never crops faces or slides). */
function drawContain(g: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#000';
  g.fillRect(x, y, w, h);
  if (!v.videoWidth || v.readyState < 2) return;
  const s = Math.min(w / v.videoWidth, h / v.videoHeight);
  const dw = v.videoWidth * s;
  const dh = v.videoHeight * s;
  g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.font = '600 16px system-ui, sans-serif';
  const w = g.measureText(text).width + 16;
  g.fillStyle = 'rgba(0,0,0,.6)';
  g.fillRect(x, y - 24, w, 24);
  g.fillStyle = '#fff';
  g.fillText(text, x + 8, y - 7);
}

export class MeetingRecorder {
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private wired = new WeakSet<HTMLVideoElement>();
  private parts: Blob[] = [];
  private done: Promise<Blob> | null = null;
  private canvas = document.createElement('canvas');

  constructor(private sources: () => RecordingSources) {
    this.canvas.width = W;
    this.canvas.height = H;
  }

  start(mic: MediaStream | null) {
    this.ctx = new AudioContext();
    this.dest = this.ctx.createMediaStreamDestination();
    if (mic?.getAudioTracks().length) this.ctx.createMediaStreamSource(mic).connect(this.dest);
    const g = this.canvas.getContext('2d')!;
    this.timer = setInterval(() => this.frame(g), 1000 / FPS);
    this.frame(g);

    const stream = new MediaStream([...this.canvas.captureStream(FPS).getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    const mimeType = ['video/mp4;codecs=avc3,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    this.parts = [];
    this.rec.ondataavailable = (e) => e.data.size && this.parts.push(e.data);
    this.done = new Promise((resolve) => {
      this.rec!.onstop = () => resolve(new Blob(this.parts, { type: this.rec!.mimeType }));
    });
    this.rec.start(1000);
  }

  /** Mix in an investor's audio once their stream has an audio track (avatars join after the recording starts). */
  private wireAudio(v: HTMLVideoElement) {
    if (this.wired.has(v) || !this.ctx || !this.dest) return;
    const s = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    if (!s?.getAudioTracks().length) return;
    this.wired.add(v);
    this.ctx.createMediaStreamSource(s).connect(this.dest);
  }

  private frame(g: CanvasRenderingContext2D) {
    const { investors, camera, share } = this.sources();
    investors.forEach((i) => this.wireAudio(i.video));
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, W, H);
    const pad = 8;
    const sharing = !!share?.videoWidth;
    // Sharing: slides large on the left, investors stacked on the right. Otherwise a 1/2/2x2 grid.
    const area = sharing ? { x: W - 320, y: 0, w: 320, h: H } : { x: 0, y: 0, w: W, h: H };
    if (sharing) drawContain(g, share!, pad, pad, W - 320 - pad * 2, H - pad * 2);
    const n = investors.length;
    const cols = sharing ? 1 : n <= 1 ? 1 : 2;
    const rows = sharing ? Math.max(n, 1) : Math.ceil(n / cols) || 1;
    const tw = (area.w - pad * (cols + 1)) / cols;
    const th = (area.h - pad * (rows + 1)) / rows;
    investors.forEach((inv, i) => {
      const x = area.x + pad + (i % cols) * (tw + pad);
      const y = area.y + pad + Math.floor(i / cols) * (th + pad);
      drawContain(g, inv.video, x, y, tw, th);
      label(g, inv.name, x + 8, y + th - 8);
    });
    if (camera?.videoWidth) {
      const cw = 240;
      const ch = 135;
      const x = sharing ? pad : W - cw - pad * 2;
      const y = H - ch - pad * 2;
      g.save();
      g.translate(x + cw, y);
      g.scale(-1, 1); // mirrored like the tile
      drawContain(g, camera, 0, 0, cw, ch);
      g.restore();
      label(g, 'Founder', x + 8, y + ch - 8);
    }
  }

  get recording() {
    return this.rec?.state === 'recording';
  }

  async stop(): Promise<Blob | null> {
    if (!this.rec || !this.done) return null;
    if (this.timer) clearInterval(this.timer);
    if (this.rec.state !== 'inactive') this.rec.stop();
    const blob = await this.done;
    this.ctx?.close().catch(() => {});
    return blob;
  }
}
