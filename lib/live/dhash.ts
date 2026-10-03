// 256-bit difference hash for slide-change detection (pure, testable). Spike: same slide ≤28 bits apart under
// JPEG noise + cursor + brightness jitter; different slides ≥54 → threshold 40.

export const DHASH_W = 17;
export const DHASH_H = 16;
export const SLIDE_THRESHOLD = 40;

/** gray: DHASH_W*DHASH_H luminance values (row-major). Returns 256 bits as 8 uint32 words. */
export function dhash(gray: ArrayLike<number>): Uint32Array {
  const out = new Uint32Array(8);
  let bit = 0;
  for (let r = 0; r < DHASH_H; r++) {
    for (let c = 0; c < DHASH_W - 1; c++) {
      if (gray[r * DHASH_W + c] > gray[r * DHASH_W + c + 1]) out[bit >> 5] |= 1 << (bit & 31);
      bit++;
    }
  }
  return out;
}

export function hamming(a: Uint32Array, b: Uint32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      x &= x - 1;
      d++;
    }
  }
  return d;
}

/**
 * Decides which frames are new slides. A frame is kept when it is stable (close to the previous frame — skips
 * mid-transition frames) and far from every slide kept so far (skips revisits).
 */
export class SlideDeduper {
  private kept: Uint32Array[] = [];
  private prev: Uint32Array | null = null;

  constructor(private threshold = SLIDE_THRESHOLD) {}

  /** Returns true if this frame should be kept as a new slide. */
  offer(hash: Uint32Array): boolean {
    const stable = this.prev !== null && hamming(hash, this.prev) <= this.threshold;
    this.prev = hash;
    if (!stable) return false;
    if (this.kept.some((k) => hamming(hash, k) <= this.threshold)) return false;
    this.kept.push(hash);
    return true;
  }

  get count() {
    return this.kept.length;
  }
}
