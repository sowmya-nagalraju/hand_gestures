// 51. Sound-reactive magic (microphone level + beat detection)
// 52. Music synchronisation (beat pulses drive particle size)
// 53. Voice commands (Web Speech API, optional)

export interface MicSample {
  level: number; // smoothed 0..1
  beat: number; // 1 on a detected beat, decays to 0
}

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array | null = null;
  private stream: MediaStream | null = null;
  private level = 0;
  private beat = 0;
  private hist: number[] = [];
  private lastBeat = 0;
  running = false;

  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    src.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.fftSize);
    this.running = true;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.running = false;
    this.level = 0;
    this.beat = 0;
  }

  sample(dt: number, now: number): MicSample {
    if (!this.running || !this.analyser || !this.data) return { level: 0, beat: 0 };
    this.analyser.getByteTimeDomainData(this.data as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.data.length);
    const loud = Math.min(1, rms * 6);
    this.level += (loud - this.level) * Math.min(1, dt * 12);

    this.hist.push(loud);
    if (this.hist.length > 40) this.hist.shift();
    const avg = this.hist.reduce((s, v) => s + v, 0) / (this.hist.length || 1);
    this.beat = Math.max(0, this.beat - dt * 3.5);
    if (loud > avg * 1.4 + 0.04 && loud > 0.08 && now - this.lastBeat > 0.28) {
      this.beat = 1;
      this.lastBeat = now;
    }
    return { level: this.level, beat: this.beat };
  }
}

type VoiceMap = Record<string, () => void>;

/** 53. Voice + hand combination: say a command, hands do the rest. */
export class VoiceEngine {
  private rec: unknown = null;
  private wanted = false;
  private map: VoiceMap = {};

  static get supported() {
    return typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>)["SpeechRecognition"] || (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"]);
  }

  start(map: VoiceMap) {
    this.map = map;
    this.wanted = true;
    this.spawn();
  }

  stop() {
    this.wanted = false;
    const rec = this.rec as { stop?: () => void } | null;
    try {
      rec?.stop?.();
    } catch {
      /* already stopped */
    }
    this.rec = null;
  }

  private spawn() {
    if (!this.wanted) return;
    const w = window as unknown as Record<string, new () => unknown>;
    const Ctor = (w["SpeechRecognition"] || w["webkitSpeechRecognition"]) as
      | (new () => {
          continuous: boolean;
          lang: string;
          interimResults: boolean;
          onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onend: (() => void) | null;
          onerror: (() => void) | null;
          start: () => void;
          stop: () => void;
        })
      | undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        const said = (e.results[i]?.[0]?.transcript ?? "").toLowerCase();
        for (const phrase of Object.keys(this.map)) {
          if (said.includes(phrase)) {
            this.map[phrase]?.();
            break;
          }
        }
      }
    };
    rec.onend = () => {
      if (this.wanted) window.setTimeout(() => this.spawn(), 300);
    };
    rec.onerror = () => {};
    try {
      rec.start();
      this.rec = rec;
    } catch {
      /* already started */
    }
  }
}
