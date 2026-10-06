// @ts-nocheck -- per-frame canvas drawing loops over landmark arrays.
// Overlay effects drawn on a 2D canvas above the particles:
// hand trails, ghost hand, air-drawn runes, paint/eraser, bubbles and staff beams.
import { recognizeStroke, type AirSymbol } from "./draw";

export type FxTool = "none" | "runes" | "paint" | "eraser" | "bubbles" | "beam";

export interface FxFrame {
  gesture: string;
  /** cursor in screen px, or null */
  cursor: { x: number; y: number } | null;
  /** formation centre in screen px */
  center: { x: number; y: number };
  /** hand landmarks normalised 0..1 (mirrored) */
  landmarks: { x: number; y: number }[][];
  color: string;
}

const LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export class OverlayFX {
  tool: FxTool = "none";
  trails = false;
  ghost = false;
  onRune: ((s: AirSymbol, dir: 1 | -1) => void) | null = null;

  private cv = document.createElement("canvas");
  private paint = document.createElement("canvas");
  private ctx = this.cv.getContext("2d")!;
  private pctx = this.paint.getContext("2d")!;
  private trail: { x: number; y: number; a: number }[] = [];
  private stroke: { x: number; y: number }[] = [];
  private runes: { x: number; y: number; r: number; age: number; sym: AirSymbol }[] = [];
  private bubbles: { x: number; y: number; r: number; vy: number; pop: number }[] = [];
  private lastPaint: { x: number; y: number } | null = null;
  private bubbleT = 0;
  private time = 0;

  constructor(private host: HTMLElement) {
    for (const c of [this.paint, this.cv]) {
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1";
      host.appendChild(c);
    }
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const keep = document.createElement("canvas");
    keep.width = this.paint.width; keep.height = this.paint.height;
    keep.getContext("2d")!.drawImage(this.paint, 0, 0);
    this.cv.width = this.paint.width = w;
    this.cv.height = this.paint.height = h;
    this.pctx.drawImage(keep, 0, 0);
  }

  clearPaint() {
    this.pctx.clearRect(0, 0, this.paint.width, this.paint.height);
  }

  update(dt: number, f: FxFrame) {
    this.time += dt;
    const ctx = this.ctx;
    const W = this.cv.width, H = this.cv.height;
    ctx.clearRect(0, 0, W, H);
    const c = f.cursor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ---- hand trail ----
    if (this.trails && c) this.trail.push({ x: c.x, y: c.y, a: 1 });
    for (const p of this.trail) p.a -= dt * 1.6;
    this.trail = this.trail.filter((p) => p.a > 0).slice(-60);
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = b.a * 0.7;
      ctx.lineWidth = 1 + b.a * 5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- ghost hand ----
    if (this.ghost) {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      for (const hand of f.landmarks) {
        ctx.beginPath();
        for (const [a, b] of LINKS) {
          const pa = hand[a], pb = hand[b];
          if (!pa || !pb) continue;
          ctx.moveTo(pa.x * W, pa.y * H); ctx.lineTo(pb.x * W, pb.y * H);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- runes (air drawing with index finger) ----
    if (this.tool === "runes") {
      if (f.gesture === "point" && c) this.stroke.push({ x: c.x / W, y: c.y / H });
      else if (this.stroke.length) {
        const res = recognizeStroke(this.stroke);
        if (res.symbol !== "none") {
          let sx = 0, sy = 0;
          for (const p of this.stroke) { sx += p.x; sy += p.y; }
          this.runes.push({ x: (sx / this.stroke.length) * W, y: (sy / this.stroke.length) * H, r: 30, age: 0, sym: res.symbol });
          this.onRune?.(res.symbol, res.dir);
        }
        this.stroke = [];
      }
      if (this.stroke.length > 1) {
        ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.shadowColor = f.color; ctx.shadowBlur = 12;
        ctx.beginPath();
        this.stroke.forEach((p, i) => (i ? ctx.lineTo(p.x * W, p.y * H) : ctx.moveTo(p.x * W, p.y * H)));
        ctx.stroke(); ctx.shadowBlur = 0;
      }
    } else this.stroke = [];
    for (const r of this.runes) r.age += dt;
    this.runes = this.runes.filter((r) => r.age < 2);
    for (const r of this.runes) {
      const k = r.age / 2, rad = 40 + k * 140;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.5;
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(this.time * 0.8);
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rad * 0.78, 0, Math.PI * 2); ctx.stroke();
      const pts = r.sym === "triangle" ? 3 : r.sym === "star" ? 5 : 6;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i * (r.sym === "star" ? 2 : 1) * Math.PI * 2) / pts;
        const x = Math.cos(a) * rad * 0.78, y = Math.sin(a) * rad * 0.78;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillStyle = f.color;
        ctx.fillRect(Math.cos(a) * rad * 0.89 - 2, Math.sin(a) * rad * 0.89 - 2, 4, 4);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // ---- paint / eraser ----
    const drawing = c && (f.gesture === "point" || f.gesture === "pinch");
    if (drawing && (this.tool === "paint" || this.tool === "eraser")) {
      const p = this.pctx;
      p.globalCompositeOperation = this.tool === "eraser" ? "destination-out" : "source-over";
      p.strokeStyle = f.color; p.lineWidth = this.tool === "eraser" ? 40 : 4; p.lineCap = "round";
      p.shadowColor = f.color; p.shadowBlur = this.tool === "eraser" ? 0 : 10;
      const from = this.lastPaint ?? c;
      p.beginPath(); p.moveTo(from.x, from.y); p.lineTo(c.x, c.y); p.stroke();
      this.lastPaint = { x: c.x, y: c.y };
    } else this.lastPaint = null;
    if (this.tool === "eraser" && c) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, 20, 0, Math.PI * 2); ctx.stroke();
    }

    // ---- bubbles: float up, pop when your hand touches them ----
    if (this.tool === "bubbles") {
      this.bubbleT += dt;
      if (this.bubbleT > 0.35 && this.bubbles.length < 30) {
        this.bubbleT = 0;
        this.bubbles.push({ x: W * (0.2 + Math.random() * 0.6), y: H * 0.9, r: 10 + Math.random() * 22, vy: 30 + Math.random() * 40, pop: 0 });
      }
    }
    for (const b of this.bubbles) {
      if (b.pop) { b.pop += dt * 4; continue; }
      b.y -= b.vy * dt;
      b.x += Math.sin(this.time * 2 + b.r) * 12 * dt;
      if (c && Math.hypot(c.x - b.x, c.y - b.y) < b.r + 10) b.pop = 0.01;
    }
    this.bubbles = this.bubbles.filter((b) => b.y > H * 0.1 && b.pop < 1);
    for (const b of this.bubbles) {
      const rr = b.r * (1 + b.pop * 1.5);
      ctx.globalAlpha = 1 - b.pop;
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath(); ctx.arc(b.x - rr * 0.35, b.y - rr * 0.35, rr * 0.15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- staff beam: pinch fires a beam from your hand into the formation ----
    if (this.tool === "beam" && c && f.gesture === "pinch") {
      const { x: ex, y: ey } = f.center;
      ctx.shadowColor = f.color; ctx.shadowBlur = 20;
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 2 ? "#ffffff" : f.color;
        ctx.lineWidth = 6 - k * 2;
        ctx.globalAlpha = 0.5 + k * 0.25;
        ctx.beginPath(); ctx.moveTo(c.x, c.y);
        const segs = 10;
        for (let i = 1; i <= segs; i++) {
          const t = i / segs;
          const j = i < segs ? (Math.random() - 0.5) * 14 : 0;
          ctx.lineTo(c.x + (ex - c.x) * t + j, c.y + (ey - c.y) * t + j);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }

  dispose() {
    this.cv.remove();
    this.paint.remove();
  }
}
