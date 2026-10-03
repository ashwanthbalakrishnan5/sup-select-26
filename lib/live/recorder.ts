// P2: record the meeting tab (video + investors' audio) with the founder's mic mixed in.
// Verified in Chrome 154: tab capture + MediaRecorder MP4 (avc3). Tab audio excludes the mic, so we mix it in.

export class MeetingRecorder {
  private rec: MediaRecorder | null = null;
  private display: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private parts: Blob[] = [];
  private done: Promise<Blob> | null = null;

  /** Must be called from a user gesture. Chrome shows a "share this tab" prompt. */
  async start(mic: MediaStream | null) {
    this.display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 24 },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      systemAudio: 'exclude',
    } as DisplayMediaStreamOptions);

    this.ctx = new AudioContext();
    const dest = this.ctx.createMediaStreamDestination();
    if (this.display.getAudioTracks().length) this.ctx.createMediaStreamSource(this.display).connect(dest);
    if (mic?.getAudioTracks().length) this.ctx.createMediaStreamSource(mic).connect(dest);
    const stream = new MediaStream([...this.display.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const mimeType = ['video/mp4;codecs=avc3,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    this.parts = [];
    this.rec.ondataavailable = (e) => e.data.size && this.parts.push(e.data);
    this.done = new Promise((resolve) => {
      this.rec!.onstop = () => resolve(new Blob(this.parts, { type: this.rec!.mimeType }));
    });
    this.display.getVideoTracks()[0].onended = () => this.rec?.state !== 'inactive' && this.rec?.stop();
    this.rec.start(1000);
  }

  get recording() {
    return this.rec?.state === 'recording';
  }

  async stop(): Promise<Blob | null> {
    if (!this.rec || !this.done) return null;
    if (this.rec.state !== 'inactive') this.rec.stop();
    const blob = await this.done;
    this.display?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    return blob;
  }
}
