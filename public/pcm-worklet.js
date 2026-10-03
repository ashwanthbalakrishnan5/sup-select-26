// AudioWorklet: Float32 mic frames (AudioContext runs at 16 kHz) -> 100 ms PCM16 chunks + RMS level.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(1600); // 100 ms @ 16 kHz
    this.n = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.sumSq += s * s;
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        const rms = Math.sqrt(this.sumSq / this.n);
        this.port.postMessage({ pcm: this.buf.buffer, rms }, [this.buf.buffer]);
        this.buf = new Int16Array(1600);
        this.n = 0;
        this.sumSq = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
