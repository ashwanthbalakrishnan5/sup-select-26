// Screen share → distinct slide JPEGs at 1 FPS (browser). Only the screen share ever goes to a model.
import { DHASH_H, DHASH_W, SlideDeduper, dhash } from './dhash';
import type { Slide } from '../types';

/** Native meeting-style picker: Chrome tab, window or entire screen; switch tabs mid-share; never this meeting tab. */
export async function startScreenShare(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 15 },
    audio: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    monitorTypeSurfaces: 'include',
  } as DisplayMediaStreamOptions);
}

export class SlideCapture {
  private timer: ReturnType<typeof setInterval> | null = null;
  private deduper = new SlideDeduper();
  private small = document.createElement('canvas');
  private big = document.createElement('canvas');
  onSlide: (slide: Slide) => void = () => {};

  constructor(
    private video: HTMLVideoElement,
    private clock: () => number, // ms since meeting start
    private maxSide = 768,
  ) {
    this.small.width = DHASH_W;
    this.small.height = DHASH_H;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private sample() {
    const v = this.video;
    if (!v.videoWidth || v.readyState < 2) return;
    const sctx = this.small.getContext('2d', { willReadFrequently: true })!;
    sctx.drawImage(v, 0, 0, DHASH_W, DHASH_H);
    const px = sctx.getImageData(0, 0, DHASH_W, DHASH_H).data;
    const gray = new Float32Array(DHASH_W * DHASH_H);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    if (!this.deduper.offer(dhash(gray))) return;

    const scale = Math.min(1, this.maxSide / Math.max(v.videoWidth, v.videoHeight));
    this.big.width = Math.round(v.videoWidth * scale);
    this.big.height = Math.round(v.videoHeight * scale);
    this.big.getContext('2d')!.drawImage(v, 0, 0, this.big.width, this.big.height);
    const jpegBase64 = this.big.toDataURL('image/jpeg', 0.7).split(',')[1];
    this.onSlide({ id: `slide-${this.deduper.count}`, t: this.clock(), jpegBase64 });
  }
}
