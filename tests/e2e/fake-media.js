// Injected into the page by tests/e2e/meeting.mjs (page.addInitScript). Replaces camera, mic and screen share with
// synthetic streams so the e2e test needs no OS media permissions:
//  - mic    = silence until the test calls window.__founder.play(i), which speaks segment i of /e2e/founder.wav
//             (segments listed in /e2e/founder.json: 0 intro, 1-6 pitch, 7-9 Q&A answers)
//  - camera = animated canvas
//  - screen = canvas cycling /e2e/slide1..4.jpg every 20 s
(() => {
  const md = navigator.mediaDevices;
  let ctx = null;
  let out = null; // GainNode every mic stream listens to
  let loaded = null; // Promise<{ buffer, segments }>
  let playing = null;

  function audio() {
    ctx ??= new AudioContext();
    out ??= ctx.createGain();
    loaded ??= Promise.all([
      fetch('/e2e/founder.wav').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)),
      fetch('/e2e/founder.json').then((r) => r.json()),
    ]).then(([buffer, segments]) => ({ buffer, segments }));
    return { ctx, out };
  }

  window.__founder = {
    /** Speak segment i; resolves when it has finished. */
    async play(i) {
      const { ctx, out } = audio();
      const { buffer, segments } = await loaded;
      const [start, dur] = segments[i % segments.length];
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(out);
      playing = new Promise((resolve) => (src.onended = resolve));
      src.start(0, start, dur);
      await playing;
      playing = null;
      return dur;
    },
    get busy() {
      return playing !== null;
    },
    async count() {
      audio();
      return (await loaded).segments.length;
    },
  };

  function canvasStream(draw, fps) {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const g = c.getContext('2d');
    setInterval(() => draw(g, c), 1000 / fps);
    draw(g, c);
    return c.captureStream(fps);
  }

  function cameraStream() {
    let t = 0;
    return canvasStream((g, c) => {
      t++;
      g.fillStyle = `hsl(${t % 360} 60% 40%)`;
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff';
      g.font = 'bold 64px sans-serif';
      g.fillText('Founder camera (fake)', 300, 380);
    }, 15);
  }

  function screenStream() {
    const imgs = [1, 2, 3, 4].map((i) => Object.assign(new Image(), { src: `/e2e/slide${i}.jpg` }));
    const start = Date.now();
    return canvasStream((g, c) => {
      const img = imgs[Math.floor((Date.now() - start) / 20000) % 4];
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      if (img.complete && img.naturalWidth) g.drawImage(img, (c.width - 720) / 2, 0, 720, 720);
    }, 5);
  }

  md.getUserMedia = async (c = {}) => {
    const tracks = [];
    if (c.audio) {
      const { ctx, out } = audio();
      const dest = ctx.createMediaStreamDestination();
      out.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }
    if (c.video) tracks.push(...cameraStream().getVideoTracks());
    return new MediaStream(tracks);
  };
  md.getDisplayMedia = async () => screenStream();
  md.enumerateDevices = async () => [
    { deviceId: 'fake-mic', kind: 'audioinput', label: 'Fake microphone', groupId: 'g' },
    { deviceId: 'fake-cam', kind: 'videoinput', label: 'Fake camera', groupId: 'g' },
  ];
})();
