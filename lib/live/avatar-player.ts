// Plays a Live avatar's continuous fMP4 stream in a <video> via MediaSource. Verified recipe (browser spike):
// one SourceBuffer for the whole session, append in order, never reset per turn, chase the live edge, trim old media.

export const AVATAR_MIME = 'video/mp4; codecs="avc1.42C020, mp4a.40.2"';

export class AvatarPlayer {
  /** Wrapper div (ACS VideoTile shows its placeholder when renderElement has no children). */
  readonly element: HTMLDivElement;
  readonly video: HTMLVideoElement;
  private ms = new MediaSource();
  private sb: SourceBuffer | null = null;
  private queue: Uint8Array[] = [];
  private tick = false;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private keepSec = 10,
    private maxLatencySec = 0.8,
  ) {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000';
    this.video.src = URL.createObjectURL(this.ms);
    this.element = document.createElement('div');
    this.element.style.cssText = 'width:100%;height:100%';
    this.element.appendChild(this.video);
    this.ms.addEventListener(
      'sourceopen',
      () => {
        this.sb = this.ms.addSourceBuffer(AVATAR_MIME);
        this.sb.addEventListener('updateend', this.pump);
        this.pump();
      },
      { once: true },
    );
    this.timer = setInterval(() => {
      this.tick = true;
      this.pump();
    }, 5000);
  }

  static supported() {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(AVATAR_MIME);
  }

  push(chunk: Uint8Array) {
    this.queue.push(chunk);
    this.pump();
    if (this.video.paused) this.video.play().catch(() => {});
  }

  private end() {
    const b = this.sb?.buffered;
    return b && b.length ? b.end(b.length - 1) : 0;
  }

  private pump = () => {
    const sb = this.sb;
    if (!sb || sb.updating || this.ms.readyState !== 'open') return;
    const ct = this.video.currentTime;
    if (this.tick) {
      this.tick = false;
      if (this.end() - ct > this.maxLatencySec) this.video.currentTime = this.end() - 0.3; // chase live edge
      if (ct > this.keepSec + 1) {
        sb.remove(0, ct - this.keepSec); // idle video never stops: trim or Chrome's ~150 MB quota fills in ~2 min
        return;
      }
    }
    const next = this.queue.shift();
    if (next) {
      try {
        sb.appendBuffer(next as BufferSource);
      } catch (e) {
        console.warn('[AvatarPlayer] append failed', e);
      }
    }
  };

  dispose() {
    clearInterval(this.timer);
    this.queue = [];
    this.video.pause();
    URL.revokeObjectURL(this.video.src);
    this.video.removeAttribute('src');
  }
}
