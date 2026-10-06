// Tiny synthesized sound kit (Web Audio) — no files to download.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hum: { osc: OscillatorNode; gain: GainNode } | null = null;
let enabled = true;

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) setCharge(0);
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slideTo?: number) {
  if (!enabled) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(master!);
  o.start();
  o.stop(c.currentTime + dur + 0.05);
}

function noise(dur: number, vol = 0.3, lp = 1200) {
  if (!enabled) return;
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master!);
  src.start();
}

export const sfx = {
  burst: (power = 0.5) => {
    noise(0.6 + power * 0.6, 0.25 + power * 0.3, 900 + power * 2500);
    tone(180 + power * 200, 0.5, "triangle", 0.2, 60);
  },
  wave: () => noise(0.7, 0.18, 600),
  chime: () => {
    tone(880, 0.5, "sine", 0.15);
    setTimeout(() => tone(1320, 0.6, "sine", 0.12), 80);
  },
  spin: () => tone(300, 0.6, "sine", 0.15, 900),
  portal: () => tone(120, 0.9, "sawtooth", 0.08, 520),
  rewind: () => tone(900, 0.5, "square", 0.05, 200),
  spell: () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.4, "triangle", 0.12), i * 70));
  },
};

/** continuous humming that rises with the charge level (0 = silent) */
export function setCharge(level: number) {
  if (!enabled || level <= 0.01) {
    if (hum && ctx) {
      hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      const h = hum;
      setTimeout(() => h.osc.stop(), 300);
      hum = null;
    }
    return;
  }
  const c = ac();
  if (!hum) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0;
    osc.connect(gain).connect(master!);
    osc.start();
    hum = { osc, gain };
  }
  hum.osc.frequency.setTargetAtTime(70 + level * 330, c.currentTime, 0.05);
  hum.gain.gain.setTargetAtTime(0.02 + level * 0.07, c.currentTime, 0.05);
}
