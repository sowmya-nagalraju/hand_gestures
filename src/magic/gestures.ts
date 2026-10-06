// @ts-nocheck -- hot numeric loops over typed arrays/landmarks; strict indexed-access checks add noise without safety here.
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { OneEuro, OneEuro2D } from "./oneEuro";

export type Gesture =
  | "none"
  | "hand"
  | "point"
  | "pinch"
  | "open"
  | "fist"
  | "victory"
  | "three"
  | "four"
  | "thumbs-up"
  | "thumbs-down"
  | "rock"
  | "call"
  | "pinky"
  | "gun"
  | "ok"
  | "two-hands";

export const GESTURE_LABEL: Record<Gesture, string> = {
  none: "no hand",
  hand: "hand",
  point: "point · follow",
  pinch: "pinch · gravity",
  open: "open palm · scatter",
  fist: "fist · energy sphere",
  victory: "two fingers · rotate",
  three: "three fingers · next shape",
  four: "four fingers · tight ring",
  "thumbs-up": "thumbs up · next colour",
  "thumbs-down": "thumbs down · previous shape",
  rock: "rock sign · vortex spin",
  call: "call sign · swirl",
  pinky: "pinky · shrink",
  gun: "L sign · aim & push",
  ok: "OK sign · freeze / unfreeze",
  "two-hands": "two hands · stretch",
};

export type GestureEvent =
  | { type: "swipe"; dir: 1 | -1 }
  | { type: "next-shape" }
  | { type: "circle"; dir: 1 | -1 }
  | { type: "burst" }
  | { type: "hold"; gesture: Gesture }
  | { type: "clap" };

export interface Pt {
  x: number;
  y: number;
}

export interface GestureState {
  gesture: Gesture;
  hands: number;
  /** all points are mirrored & normalised 0..1 (x right, y down) */
  pointer: Pt;
  palm: Pt;
  pinchPoint: Pt;
  pinchStrength: number;
  roll: number;
  twoDist: number;
  mid: Pt;
  events: GestureEvent[];
  landmarks: Pt[][];
}

type LM = { x: number; y: number; z: number };

const d3 = (a: LM, b: LM) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);

const FINGERS: [number, number][] = [
  [8, 6], // index tip, pip
  [12, 10],
  [16, 14],
  [20, 18],
];

interface HandMemory {
  ext: boolean[];
  pinch: boolean;
  thumb: boolean;
}

export class GestureEngine {
  private memory: HandMemory[] = [
    { ext: [false, false, false, false], pinch: false, thumb: false },
    { ext: [false, false, false, false], pinch: false, thumb: false },
  ];
  private history: Gesture[] = [];
  private stable: Gesture = "none";
  private stableSince = 0;
  private lastSeen = -10;
  private appearedAt = 0;
  private fPointer = new OneEuro2D(1.2, 0.015);
  private fPalm = new OneEuro2D(1.0, 0.012);
  private fPinch = new OneEuro2D(1.2, 0.015);
  private fPalm2 = new OneEuro2D(1.0, 0.012);
  private fRoll = new OneEuro(0.8, 0.01);
  private fDist = new OneEuro(0.9, 0.01);
  private rollUnwrap = 0;
  private lastRollRaw = 0;
  private lastPalm: Pt | null = null;
  private lastT = 0;
  private vx = 0;
  private vy = 0;
  private swipeCooldown = 0;
  private shapeCooldown = 0;
  private threeFired = false;
  private holdFired = false;
  private clapCooldown = 0;
  private circleBuf: { x: number; y: number; t: number }[] = [];
  private circleCooldown = 0;
  private last: GestureState = {
    gesture: "none",
    hands: 0,
    pointer: { x: 0.5, y: 0.5 },
    palm: { x: 0.5, y: 0.5 },
    pinchPoint: { x: 0.5, y: 0.5 },
    pinchStrength: 0,
    roll: 0,
    twoDist: 0.3,
    mid: { x: 0.5, y: 0.5 },
    events: [],
    landmarks: [],
  };

  private classify(lm: LM[], mem: HandMemory): Gesture {
    const palmSize = d3(lm[0], lm[9]) || 0.1;
    // finger extension with hysteresis (prevents flicker between gestures)
    for (let f = 0; f < 4; f++) {
      const [tip, pip] = FINGERS[f];
      const ratio = d3(lm[0], lm[tip]) / (d3(lm[0], lm[pip]) || 1e-3);
      if (mem.ext[f] && ratio < 1.04) mem.ext[f] = false;
      else if (!mem.ext[f] && ratio > 1.18) mem.ext[f] = true;
    }
    const pd = d3(lm[4], lm[8]) / palmSize;
    if (mem.pinch && pd > 0.46) mem.pinch = false;
    else if (!mem.pinch && pd < 0.3) mem.pinch = true;
    const indexReach = d3(lm[0], lm[8]) / palmSize;
    // thumb extension: tip far from index knuckle & middle knuckle
    const th = Math.min(d3(lm[4], lm[5]), d3(lm[4], lm[9])) / palmSize;
    if (mem.thumb && th < 0.42) mem.thumb = false;
    else if (!mem.thumb && th > 0.62) mem.thumb = true;
    const T = mem.thumb;

    const [i, m, r, p] = mem.ext;
    const count = mem.ext.filter(Boolean).length;
    if (pd < 0.4 && !i && m && r && p) return "ok";
    if (mem.pinch && indexReach > 0.95 && !(m && r && p && pd > 0.38)) return "pinch";
    if (count === 0) {
      if (T) {
        const dy = lm[4].y - lm[2].y;
        if (dy < -0.6 * palmSize * 0.5) return "thumbs-up";
        if (dy > 0.6 * palmSize * 0.5) return "thumbs-down";
      }
      return "fist";
    }
    if (count === 4) return T || th > 0.5 ? "open" : "four";
    if (i && !m && !r && p) return "rock";
    if (!i && !m && !r && p) return T ? "call" : "pinky";
    if (i && !m && !r && !p && T) return "gun";
    if (i && !m && !r && !p) return "point";
    if (i && m && !r && !p) return "victory";
    if (i && m && r && !p) return "three";
    return "hand";
  }

  process(result: HandLandmarkerResult | null, nowMs: number): GestureState {
    const t = nowMs / 1000;
    const events: GestureEvent[] = [];
    const hands = (result?.landmarks ?? [])
      .map((l) => l.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })))
      .sort((a, b) => a[0].x - b[0].x);

    if (hands.length === 0) {
      // short grace period so a single dropped frame doesn't reset everything
      if (t - this.lastSeen > 0.35) {
        if (this.stable !== "none") {
          this.stable = "none";
          this.history = [];
          this.fPointer.reset();
          this.fPalm.reset();
          this.fPinch.reset();
          this.fPalm2.reset();
          this.fRoll.reset();
          this.fDist.reset();
          this.lastPalm = null;
          this.circleBuf = [];
        }
        this.last = { ...this.last, gesture: "none", hands: 0, events: [], landmarks: [] };
      } else {
        this.last = { ...this.last, events: [] };
      }
      return this.last;
    }

    if (this.stable === "none") this.appearedAt = t;
    this.lastSeen = t;

    const a = hands[0];
    const raw: Gesture =
      hands.length >= 2 ? "two-hands" : this.classify(a, this.memory[0]);
    if (hands.length >= 2) {
      this.classify(a, this.memory[0]);
      this.classify(hands[1], this.memory[1]);
    }

    // temporal voting: a gesture must win 5 of the last 7 frames
    this.history.push(raw);
    if (this.history.length > 7) this.history.shift();
    const votes = this.history.filter((g) => g === raw).length;
    const need = this.stable === "none" ? 3 : 5;
    if (raw !== this.stable && votes >= need) {
      const prev = this.stable;
      this.stable = raw;
      this.stableSince = t;
      this.threeFired = false;
      this.holdFired = false;
      if (raw === "open" && prev !== "open" && prev !== "none") events.push({ type: "burst" });
      if (raw !== "point") this.circleBuf = [];
    }

    // --- smoothed points ---
    const palmRaw = {
      x: (a[0].x + a[5].x + a[9].x + a[13].x + a[17].x) / 5,
      y: (a[0].y + a[5].y + a[9].y + a[13].y + a[17].y) / 5,
    };
    const palm = this.fPalm.filter(palmRaw.x, palmRaw.y, t);
    const pointer = this.fPointer.filter(a[8].x, a[8].y, t);
    const pinchPoint = this.fPinch.filter((a[4].x + a[8].x) / 2, (a[4].y + a[8].y) / 2, t);
    const palmSize = d3(a[0], a[9]) || 0.1;
    const pd = d3(a[4], a[8]) / palmSize;
    const pinchStrength = Math.min(1, Math.max(0, (0.5 - pd) / 0.35));

    // hand roll (unwrapped + filtered)
    const rollRaw = Math.atan2(a[9].x - a[0].x, -(a[9].y - a[0].y));
    let dr = rollRaw - this.lastRollRaw;
    if (dr > Math.PI) dr -= Math.PI * 2;
    if (dr < -Math.PI) dr += Math.PI * 2;
    this.rollUnwrap += dr;
    this.lastRollRaw = rollRaw;
    const roll = this.fRoll.filter(this.rollUnwrap, t);

    // two hands
    let twoDist = this.last.twoDist;
    let mid = palm;
    if (hands.length >= 2) {
      const b = hands[1];
      const p2 = this.fPalm2.filter((b[0].x + b[9].x) / 2, (b[0].y + b[9].y) / 2, t);
      twoDist = this.fDist.filter(Math.hypot(p2.x - palm.x, p2.y - palm.y), t);
      mid = { x: (p2.x + palm.x) / 2, y: (p2.y + palm.y) / 2 };
    }

    // swipe detection from palm velocity
    const dt = Math.max(1e-3, t - this.lastT);
    if (this.lastPalm) {
      const ivx = (palmRaw.x - this.lastPalm.x) / dt;
      const ivy = (palmRaw.y - this.lastPalm.y) / dt;
      this.vx = this.vx * 0.6 + ivx * 0.4;
      this.vy = this.vy * 0.6 + ivy * 0.4;
    }
    this.lastPalm = palmRaw;
    this.lastT = t;
    if (
      hands.length === 1 &&
      t > this.swipeCooldown &&
      t - this.appearedAt > 0.4 &&
      (this.stable === "open" || this.stable === "hand") &&
      Math.abs(this.vx) > 1.7 &&
      Math.abs(this.vx) > Math.abs(this.vy) * 2
    ) {
      events.push({ type: "swipe", dir: this.vx > 0 ? 1 : -1 });
      this.swipeCooldown = t + 1.0;
    }

    // three fingers held → next shape (once per hold)
    if (
      this.stable === "three" &&
      !this.threeFired &&
      t - this.stableSince > 0.35 &&
      t > this.shapeCooldown
    ) {
      events.push({ type: "next-shape" });
      this.threeFired = true;
      this.shapeCooldown = t + 1.2;
    }

    // held one-shot gestures
    if (
      (this.stable === "thumbs-up" || this.stable === "thumbs-down" || this.stable === "ok") &&
      !this.holdFired &&
      t - this.stableSince > 0.45
    ) {
      events.push({ type: "hold", gesture: this.stable });
      this.holdFired = true;
    }
    // clap: two hands come very close together
    if (hands.length >= 2 && twoDist < 0.09 && t > this.clapCooldown) {
      events.push({ type: "clap" });
      this.clapCooldown = t + 1.2;
    }

    // circle drawing with index finger → orbit
    if (this.stable === "point") {
      this.circleBuf.push({ x: pointer.x, y: pointer.y, t });
      while (this.circleBuf.length && t - this.circleBuf[0].t > 1.6) this.circleBuf.shift();
      if (this.circleBuf.length > 14 && t > this.circleCooldown) {
        let cx = 0, cy = 0;
        for (const p of this.circleBuf) {
          cx += p.x;
          cy += p.y;
        }
        cx /= this.circleBuf.length;
        cy /= this.circleBuf.length;
        let sum = 0;
        let rad = 0;
        for (let i = 1; i < this.circleBuf.length; i++) {
          const p0 = this.circleBuf[i - 1];
          const p1 = this.circleBuf[i];
          let da = Math.atan2(p1.y - cy, p1.x - cx) - Math.atan2(p0.y - cy, p0.x - cx);
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          sum += da;
          rad += Math.hypot(p1.x - cx, p1.y - cy);
        }
        rad /= this.circleBuf.length - 1;
        if (Math.abs(sum) > Math.PI * 1.7 && rad > 0.035) {
          // y is down in camera space: positive sum = clockwise on screen
          events.push({ type: "circle", dir: sum > 0 ? -1 : 1 });
          this.circleBuf = [];
          this.circleCooldown = t + 1.0;
        }
      }
    }

    this.last = {
      gesture: this.stable,
      hands: hands.length,
      pointer,
      palm,
      pinchPoint,
      pinchStrength,
      roll,
      twoDist,
      mid,
      events,
      landmarks: hands.map((h) => h.map((p) => ({ x: p.x, y: p.y }))),
    };
    return this.last;
  }
}
