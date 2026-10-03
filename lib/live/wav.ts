// PCM16 mono chunks → WAV bytes (pure; used to send the founder's voice to the delivery analyzer).

export function pcm16ToWav(chunks: Uint8Array[], sampleRate = 16000): Uint8Array {
  const dataLen = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(44 + dataLen);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // PCM fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  let o = 44;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
