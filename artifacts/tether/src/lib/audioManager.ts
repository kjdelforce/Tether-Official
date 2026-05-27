const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function warmAudio(): void {
  getCtx();
}

export type SoundName =
  | "glassClick"
  | "heartbeatPulse"
  | "shimmer"
  | "whoosh"
  | "sparkle"
  | "risingSwell"
  | "refresh"
  | "glassTension"
  | "crystalPlink";

export function playVibeSound(vibeId: string): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    const synth = VIBE_SYNTHS[vibeId];
    if (synth) synth(ac, t);
  } catch (_) {}
}

export function playSound(name: SoundName): void {
  try {
    const ac = getCtx();
    switch (name) {
      case "glassClick":      glassClick(ac); break;
      case "heartbeatPulse":  heartbeatPulse(ac); break;
      case "shimmer":         shimmer(ac); break;
      case "whoosh":          whoosh(ac); break;
      case "sparkle":         sparkle(ac); break;
      case "risingSwell":     risingSwell(ac); break;
      case "refresh":         refresh(ac); break;
      case "glassTension":   glassTension(ac); break;
      case "crystalPlink":   crystalPlink(ac); break;
    }
  } catch (_) {}
}

function glassClick(ac: AudioContext) {
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();

  osc.type = "sine";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);

  filter.type = "lowpass";
  filter.frequency.value = 600;
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.1);

  const sub = ac.createOscillator();
  const subGain = ac.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(140, t);
  sub.frequency.exponentialRampToValueAtTime(80, t + 0.07);
  subGain.gain.setValueAtTime(0.06, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  sub.connect(subGain).connect(ac.destination);
  sub.start(t);
  sub.stop(t + 0.1);
}

function heartbeatPulse(ac: AudioContext) {
  const t = ac.currentTime;

  function beat(offset: number, freq: number, vol: number) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t + offset);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + offset + 0.15);
    gain.gain.setValueAtTime(0, t + offset);
    gain.gain.linearRampToValueAtTime(vol, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.2);
  }

  beat(0, 65, 0.22);
  beat(0.18, 55, 0.18);
}

function shimmer(ac: AudioContext) {
  const t = ac.currentTime;
  const freqs = [2400, 3200, 4000, 4800, 5600];

  const hasPanner = typeof ac.createStereoPanner === "function";
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const start = t + i * 0.06;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.08, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
    if (hasPanner) {
      const pan = ac.createStereoPanner();
      pan.pan.value = (i / (freqs.length - 1)) * 2 - 1;
      osc.connect(gain).connect(pan).connect(ac.destination);
    } else {
      osc.connect(gain).connect(ac.destination);
    }
    osc.start(start);
    osc.stop(start + 0.55);
  });
}

function whoosh(ac: AudioContext) {
  const t = ac.currentTime;
  const bufSize = ac.sampleRate * 0.5;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(200, t);
  filter.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
  filter.frequency.exponentialRampToValueAtTime(400, t + 0.45);
  filter.Q.value = 1.5;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.08);
  gain.gain.linearRampToValueAtTime(0.12, t + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.5);
}

function sparkle(ac: AudioContext) {
  const t = ac.currentTime;
  const notes = [4186, 5274, 6272, 7040, 7902];

  notes.forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const start = t + i * 0.055;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

function risingSwell(ac: AudioContext) {
  const t = ac.currentTime;
  const harmonics = [
    { freq: 261.6, delay: 0 },
    { freq: 329.6, delay: 0.12 },
    { freq: 392.0, delay: 0.24 },
    { freq: 523.3, delay: 0.36 },
    { freq: 659.3, delay: 0.48 },
  ];

  harmonics.forEach(({ freq, delay }) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t + delay;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.15);
    gain.gain.setValueAtTime(0.12, start + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 1.25);
  });

  const shimmerOsc = ac.createOscillator();
  const shimmerGain = ac.createGain();
  shimmerOsc.type = "sine";
  shimmerOsc.frequency.setValueAtTime(1318, t + 0.6);
  shimmerGain.gain.setValueAtTime(0, t + 0.6);
  shimmerGain.gain.linearRampToValueAtTime(0.06, t + 0.7);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  shimmerOsc.connect(shimmerGain).connect(ac.destination);
  shimmerOsc.start(t + 0.6);
  shimmerOsc.stop(t + 1.45);
}

function refresh(ac: AudioContext) {
  const t = ac.currentTime;

  const droplet = ac.createOscillator();
  const dropGain = ac.createGain();
  droplet.type = "sine";
  droplet.frequency.setValueAtTime(800, t);
  droplet.frequency.exponentialRampToValueAtTime(1600, t + 0.04);
  droplet.frequency.exponentialRampToValueAtTime(600, t + 0.15);
  dropGain.gain.setValueAtTime(0.14, t);
  dropGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  droplet.connect(dropGain).connect(ac.destination);
  droplet.start(t);
  droplet.stop(t + 0.22);

  const bufSize = ac.sampleRate * 0.3;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const splash = ac.createBufferSource();
  splash.buffer = buf;
  const splashFilter = ac.createBiquadFilter();
  splashFilter.type = "bandpass";
  splashFilter.frequency.setValueAtTime(3000, t + 0.04);
  splashFilter.frequency.exponentialRampToValueAtTime(800, t + 0.3);
  splashFilter.Q.value = 2;
  const splashGain = ac.createGain();
  splashGain.gain.setValueAtTime(0, t);
  splashGain.gain.linearRampToValueAtTime(0.07, t + 0.06);
  splashGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  splash.connect(splashFilter).connect(splashGain).connect(ac.destination);
  splash.start(t + 0.03);
  splash.stop(t + 0.35);

  const ring = ac.createOscillator();
  const ringGain = ac.createGain();
  ring.type = "sine";
  ring.frequency.setValueAtTime(1200, t + 0.08);
  ring.frequency.exponentialRampToValueAtTime(900, t + 0.4);
  ringGain.gain.setValueAtTime(0, t + 0.08);
  ringGain.gain.linearRampToValueAtTime(0.06, t + 0.12);
  ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  ring.connect(ringGain).connect(ac.destination);
  ring.start(t + 0.08);
  ring.stop(t + 0.5);
}

function glassTension(ac: AudioContext) {
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1800, t);
  osc.frequency.exponentialRampToValueAtTime(3600, t + 0.6);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2400, t);
  filter.frequency.linearRampToValueAtTime(4200, t + 0.6);
  filter.Q.value = 8;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.06, t + 0.08);
  gain.gain.linearRampToValueAtTime(0.10, t + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.7);

  const harmonics = [2700, 3200, 4100];
  harmonics.forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.55);
    g.gain.setValueAtTime(0, t + i * 0.04);
    g.gain.linearRampToValueAtTime(0.025, t + i * 0.04 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(ac.destination);
    o.start(t + i * 0.04);
    o.stop(t + 0.65);
  });

  const bufSize = ac.sampleRate * 0.5;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const ns = ac.createBufferSource();
  ns.buffer = buf;
  const nf = ac.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.setValueAtTime(5000, t);
  nf.frequency.linearRampToValueAtTime(8000, t + 0.5);
  nf.Q.value = 12;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.015, t + 0.1);
  ng.gain.linearRampToValueAtTime(0.025, t + 0.4);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  ns.connect(nf).connect(ng).connect(ac.destination);
  ns.start(t);
  ns.stop(t + 0.6);
}

function crystalPlink(ac: AudioContext) {
  const t = ac.currentTime;

  const main = ac.createOscillator();
  const mainGain = ac.createGain();
  main.type = "sine";
  main.frequency.setValueAtTime(2800, t);
  main.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
  mainGain.gain.setValueAtTime(0.18, t);
  mainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  main.connect(mainGain).connect(ac.destination);
  main.start(t);
  main.stop(t + 0.4);

  const h1 = ac.createOscillator();
  const h1g = ac.createGain();
  h1.type = "sine";
  h1.frequency.setValueAtTime(4200, t);
  h1.frequency.exponentialRampToValueAtTime(2100, t + 0.2);
  h1g.gain.setValueAtTime(0.08, t);
  h1g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  h1.connect(h1g).connect(ac.destination);
  h1.start(t);
  h1.stop(t + 0.35);

  const h2 = ac.createOscillator();
  const h2g = ac.createGain();
  h2.type = "sine";
  h2.frequency.setValueAtTime(5600, t + 0.02);
  h2.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
  h2g.gain.setValueAtTime(0.04, t + 0.02);
  h2g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  h2.connect(h2g).connect(ac.destination);
  h2.start(t + 0.02);
  h2.stop(t + 0.3);

  const tail = ac.createOscillator();
  const tailG = ac.createGain();
  tail.type = "sine";
  tail.frequency.setValueAtTime(1600, t + 0.05);
  tail.frequency.exponentialRampToValueAtTime(900, t + 0.6);
  tailG.gain.setValueAtTime(0, t + 0.05);
  tailG.gain.linearRampToValueAtTime(0.05, t + 0.1);
  tailG.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  tail.connect(tailG).connect(ac.destination);
  tail.start(t + 0.05);
  tail.stop(t + 0.7);

  const bufSize = ac.sampleRate * 0.15;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const splash = ac.createBufferSource();
  splash.buffer = buf;
  const sf = ac.createBiquadFilter();
  sf.type = "highpass";
  sf.frequency.value = 6000;
  sf.Q.value = 3;
  const sg = ac.createGain();
  sg.gain.setValueAtTime(0.06, t);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  splash.connect(sf).connect(sg).connect(ac.destination);
  splash.start(t);
  splash.stop(t + 0.15);
}

type VibeSynth = (ac: AudioContext, t: number) => void;

function tone(ac: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.01);
}

function chord(ac: AudioContext, t: number, freqs: number[], dur: number, vol: number, type: OscillatorType = "sine") {
  freqs.forEach(f => tone(ac, f, t, dur, vol, type));
}

const VIBE_SYNTHS: Record<string, VibeSynth> = {
  romantic(ac, t) {
    chord(ac, t, [261.6, 329.6, 392], 0.8, 0.09);
    tone(ac, 523.3, t + 0.15, 0.7, 0.06);
    tone(ac, 659.3, t + 0.3, 0.6, 0.04);
  },

  happy(ac, t) {
    [523.3, 659.3, 784, 1047].forEach((f, i) => {
      tone(ac, f, t + i * 0.07, 0.25, 0.1);
    });
  },

  calm(ac, t) {
    const buf = ac.createBuffer(1, ac.sampleRate * 1.2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(500, t + 0.4);
    f.frequency.linearRampToValueAtTime(200, t + 1.1);
    f.Q.value = 0.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.3);
    g.gain.linearRampToValueAtTime(0.06, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t);
    s.stop(t + 1.2);
    tone(ac, 220, t + 0.1, 1.0, 0.04);
  },

  tired(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.6);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.75);
  },

  cozy(ac, t) {
    chord(ac, t, [196, 247, 294], 0.6, 0.07);
    tone(ac, 392, t + 0.2, 0.5, 0.05);
  },

  angry(ac, t) {
    const buf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 800;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t);
    s.stop(t + 0.2);
    tone(ac, 80, t, 0.12, 0.15);
  },

  sad(ac, t) {
    chord(ac, t, [220, 261.6, 311.1], 1.0, 0.07);
    tone(ac, 440, t + 0.25, 0.8, 0.04);
  },

  high(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(800, t + 0.8);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.95);
  },

  horny(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = 65;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.05);
    g.gain.setValueAtTime(0.15, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    g.gain.linearRampToValueAtTime(0.12, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.55);
    tone(ac, 130, t + 0.08, 0.4, 0.06);
  },

  hungry(ac, t) {
    [440, 554, 660].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const s = t + i * 0.1;
      g.gain.setValueAtTime(0.12, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.08);
      o.connect(g).connect(ac.destination);
      o.start(s);
      o.stop(s + 0.1);
    });
  },

  hangry(ac, t) {
    const buf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 300;
    f.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t);
    s.stop(t + 0.4);
  },

  sick(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(180, t);
    const lfo = ac.createOscillator();
    const lfoG = ac.createGain();
    lfo.frequency.value = 4;
    lfoG.gain.value = 30;
    lfo.connect(lfoG).connect(o.frequency);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(ac.destination);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.65);
    lfo.stop(t + 0.65);
  },

  nervous(ac, t) {
    for (let i = 0; i < 6; i++) {
      tone(ac, 600 + Math.random() * 200, t + i * 0.06, 0.05, 0.08);
    }
  },

  scared(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = 1200;
    const lfo = ac.createOscillator();
    const lfoG = ac.createGain();
    lfo.frequency.value = 12;
    lfoG.gain.value = 100;
    lfo.connect(lfoG).connect(o.frequency);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(ac.destination);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.55);
    lfo.stop(t + 0.55);
  },

  "pissed-off"(ac, t) {
    const buf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(g).connect(ac.destination);
    s.start(t);
    s.stop(t + 0.15);
    tone(ac, 60, t, 0.15, 0.18);
  },

  exhausted(ac, t) {
    const buf = ac.createBuffer(1, ac.sampleRate * 0.8, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(100, t + 0.7);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t);
    s.stop(t + 0.8);
  },

  sleepy(ac, t) {
    [392, 330, 262].forEach((f, i) => {
      tone(ac, f, t + i * 0.3, 0.5, 0.06);
    });
  },

  excited(ac, t) {
    [523.3, 659.3, 784, 1047, 1319].forEach((f, i) => {
      tone(ac, f, t + i * 0.05, 0.3, 0.09);
    });
  },

  drunk(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(280, t);
    const lfo = ac.createOscillator();
    const lfoG = ac.createGain();
    lfo.frequency.value = 2.5;
    lfoG.gain.value = 50;
    lfo.connect(lfoG).connect(o.frequency);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(ac.destination);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.75);
    lfo.stop(t + 0.75);
  },

  hungover(ac, t) {
    tone(ac, 120, t, 0.4, 0.08);
    tone(ac, 100, t + 0.1, 0.35, 0.06);
  },

  anxious(ac, t) {
    for (let i = 0; i < 8; i++) {
      tone(ac, 800, t + i * 0.04, 0.03, 0.07);
    }
  },

  content(ac, t) {
    chord(ac, t, [262, 330, 392, 523], 0.9, 0.06);
  },

  sore(ac, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.6);
  },

  brave(ac, t) {
    [262, 330, 392, 523, 659].forEach((f, i) => {
      tone(ac, f, t + i * 0.08, 0.5, 0.08, "triangle");
    });
  },
};
