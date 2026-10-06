// @ts-nocheck -- hot numeric loops over typed arrays/landmarks; strict indexed-access checks add noise without safety here.
// Shape generators. Every generator returns N points in unit space (roughly radius 1).
// Points are later scaled to the boundary so every particle always fits on screen.

export type ShapeId =
  | "sphere"
  | "heart"
  | "saturn"
  | "flower"
  | "galaxy"
  | "dna"
  | "torus"
  | "cube"
  | "star"
  | "wave"
  | "fireworks"
  // feature library formations
  | "atomic" // 39
  | "planet" // 14 mini planets
  | "eye" // 45 (pupil = last 8% of indices)
  | "dragon" // 46
  | "phoenix" // 46
  | "wolf" // 46
  | "butterfly" // 46
  | "wings" // 47
  | "neuron"; // 41

export const SHAPES: { id: ShapeId; label: string }[] = [
  { id: "sphere", label: "Sphere" },
  { id: "heart", label: "Heart" },
  { id: "saturn", label: "Saturn" },
  { id: "flower", label: "Flower" },
  { id: "galaxy", label: "Galaxy" },
  { id: "dna", label: "DNA" },
  { id: "torus", label: "Torus" },
  { id: "cube", label: "Cube" },
  { id: "star", label: "Star" },
  { id: "wave", label: "Wave" },
  { id: "fireworks", label: "Fireworks" },
  { id: "atomic", label: "Atomic" },
  { id: "planet", label: "Planet" },
  { id: "eye", label: "Eye" },
  { id: "dragon", label: "Dragon" },
  { id: "phoenix", label: "Phoenix" },
  { id: "wolf", label: "Wolf" },
  { id: "butterfly", label: "Butterfly" },
  { id: "wings", label: "Wings" },
  { id: "neuron", label: "Neural" },
];

/** fraction of particles forming the eye pupil (they follow the gaze) */
export const EYE_PUPIL_FRACTION = 0.08;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Gen = (n: number, out: Float32Array, rnd: () => number) => void;

const set = (out: Float32Array, i: number, x: number, y: number, z: number) => {
  out[i * 3] = x;
  out[i * 3 + 1] = y;
  out[i * 3 + 2] = z;
};

const sphere: Gen = (n, out, rnd) => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const k = 1 + (rnd() - 0.5) * 0.03;
    set(out, i, Math.cos(th) * r * k, y * k, Math.sin(th) * r * k);
  }
};

const heart: Gen = (n, out, rnd) => {
  for (let i = 0; i < n; i++) {
    const t = rnd() * Math.PI * 2;
    const s = Math.sqrt(rnd());
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const x = (hx / 17) * s;
    const y = (hy / 17) * s + 0.15;
    const thick = 0.42 * Math.sqrt(Math.max(0, 1 - s * s)) + 0.04;
    const z = (rnd() * 2 - 1) * thick;
    set(out, i, x, y, z);
  }
};

const saturn: Gen = (n, out, rnd) => {
  const nb = Math.floor(n * 0.55);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const tilt = 0.45;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number;
    if (i < nb) {
      const yy = 1 - (i / (nb - 1)) * 2;
      const r = Math.sqrt(1 - yy * yy);
      const th = golden * i;
      x = Math.cos(th) * r * 0.52;
      y = yy * 0.52;
      z = Math.sin(th) * r * 0.52;
    } else {
      const a = rnd() * Math.PI * 2;
      const rr = 0.72 + Math.pow(rnd(), 0.8) * 0.36;
      x = Math.cos(a) * rr;
      y = (rnd() - 0.5) * 0.02;
      z = Math.sin(a) * rr;
    }
    // tilt ring system
    set(out, i, x, y * c - z * s, y * s + z * c);
  }
};

const flower: Gen = (n, out, rnd) => {
  const petals = 6;
  for (let i = 0; i < n; i++) {
    if (i < n * 0.1) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.14;
      set(out, i, Math.cos(a) * r, Math.sin(a) * r, 0.08 * (1 - r / 0.14));
      continue;
    }
    const th = rnd() * Math.PI * 2;
    const rose = Math.abs(Math.cos((petals / 2) * th));
    const r = (0.18 + rose * 0.85) * Math.sqrt(rnd());
    const z = -0.35 * r * r + (rnd() - 0.5) * 0.03;
    set(out, i, Math.cos(th) * r, Math.sin(th) * r, z);
  }
};

const galaxy: Gen = (n, out, rnd) => {
  const arms = 3;
  const tilt = 1.0;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    const arm = i % arms;
    const r = Math.pow(rnd(), 0.7);
    const spread = (rnd() - 0.5) * (0.5 - r * 0.25);
    const a = (arm / arms) * Math.PI * 2 + r * 4.2 + spread;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = (rnd() - 0.5) * 0.08 * (1 - r);
    set(out, i, x, y * c - z * s, y * s + z * c);
  }
};

const dna: Gen = (n, out, rnd) => {
  const turns = 2.6;
  for (let i = 0; i < n; i++) {
    const u = rnd();
    const y = u * 2 - 1;
    const a = u * turns * Math.PI * 2;
    const R = 0.36;
    if (i % 6 === 0) {
      // rungs
      const k = rnd() * 2 - 1;
      set(out, i, Math.cos(a) * R * k, y, Math.sin(a) * R * k);
    } else {
      const off = i % 2 === 0 ? 0 : Math.PI;
      const j = (rnd() - 0.5) * 0.05;
      set(out, i, Math.cos(a + off) * (R + j), y, Math.sin(a + off) * (R + j));
    }
  }
};

const torus: Gen = (n, out, rnd) => {
  const R = 0.68;
  const r = 0.3;
  for (let i = 0; i < n; i++) {
    const u = rnd() * Math.PI * 2;
    const v = rnd() * Math.PI * 2;
    const x = (R + r * Math.cos(v)) * Math.cos(u);
    const z = (R + r * Math.cos(v)) * Math.sin(u);
    const y = r * Math.sin(v);
    set(out, i, x, y * 0.8 - z * 0.6, y * 0.6 + z * 0.8);
  }
};

const cube: Gen = (n, out, rnd) => {
  const h = 0.62;
  for (let i = 0; i < n; i++) {
    const face = Math.floor(rnd() * 6);
    const a = (rnd() * 2 - 1) * h;
    const b = (rnd() * 2 - 1) * h;
    const sgn = face % 2 === 0 ? h : -h;
    if (face < 2) set(out, i, sgn, a, b);
    else if (face < 4) set(out, i, a, sgn, b);
    else set(out, i, a, b, sgn);
  }
};

const star: Gen = (n, out, rnd) => {
  const pts = 5;
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    const sector = (th / (Math.PI * 2)) * pts;
    const f = Math.abs((sector % 1) - 0.5) * 2; // 1 at tips, 0 at valleys
    const edge = 0.42 + 0.58 * Math.pow(f, 1.6);
    const s = Math.sqrt(rnd());
    const r = edge * s;
    const z = (rnd() * 2 - 1) * 0.16 * (1 - s * 0.6);
    const a = th + Math.PI / 2;
    set(out, i, Math.cos(a) * r, Math.sin(a) * r, z);
  }
};

const wave: Gen = (n, out, rnd) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * 2 - 1;
    const z = rnd() * 2 - 1;
    const y = Math.sin(x * 4) * Math.cos(z * 3) * 0.22;
    set(out, i, x, y - z * 0.35, z * 0.6 + y);
  }
};

const fireworks: Gen = (n, out, rnd) => {
  const bursts = [
    [0, 0.1, 0, 0.55],
    [-0.62, 0.45, -0.1, 0.32],
    [0.6, 0.5, 0.1, 0.3],
    [-0.5, -0.5, 0.1, 0.3],
    [0.55, -0.45, -0.1, 0.34],
  ];
  for (let i = 0; i < n; i++) {
    const b = bursts[i % bursts.length];
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const rr = Math.sqrt(1 - u * u);
    const ray = Math.pow(rnd(), 0.35) * b[3];
    set(out, i, b[0] + Math.cos(th) * rr * ray, b[1] + u * ray, b[2] + Math.sin(th) * rr * ray);
  }
};

// ---------- feature library formations ----------

// 39. atom: nucleus + three tilted electron shells
const atomic: Gen = (n, out, rnd) => {
  const nn = Math.floor(n * 0.16);
  for (let i = 0; i < n; i++) {
    if (i < nn) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.cbrt(rnd()) * 0.18;
      const s = Math.sqrt(1 - u * u);
      set(out, i, Math.cos(th) * s * r, u * r, Math.sin(th) * s * r);
      continue;
    }
    const shell = i % 3;
    const a = rnd() * Math.PI * 2;
    const r = [0.42, 0.62, 0.84][shell]!;
    let x = Math.cos(a) * r;
    let y = Math.sin(a) * r;
    let z = (rnd() - 0.5) * 0.02;
    // tilt each shell differently
    if (shell === 1) {
      const c = Math.cos(1.05), s = Math.sin(1.05);
      const y2 = y * c - z * s;
      z = y * s + z * c;
      y = y2;
    } else if (shell === 2) {
      const c = Math.cos(0.9), s = Math.sin(0.9);
      const x2 = x * c + z * s;
      z = -x * s + z * c;
      x = x2;
    }
    set(out, i, x, y, z);
  }
};

// 14. mini planet: core + ring + two moons
const planet: Gen = (n, out, rnd) => {
  const nc = Math.floor(n * 0.52);
  const nr = Math.floor(n * 0.28);
  const tilt = 0.5;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number;
    if (i < nc) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u) * 0.5 * (0.98 + rnd() * 0.04);
      x = Math.cos(th) * r;
      z = Math.sin(th) * r;
      y = u * 0.5;
    } else if (i < nc + nr) {
      const a = rnd() * Math.PI * 2;
      const rr = 0.68 + rnd() * 0.2;
      x = Math.cos(a) * rr;
      y = (rnd() - 0.5) * 0.015;
      z = Math.sin(a) * rr;
    } else {
      // two moons
      const moon = i % 2;
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.cbrt(rnd()) * 0.09;
      const ss = Math.sqrt(1 - u * u);
      const mx = moon === 0 ? 0.95 : -0.78;
      const my = moon === 0 ? 0.28 : -0.42;
      const mz = moon === 0 ? 0 : 0.25;
      x = mx + Math.cos(th) * ss * r;
      y = my + u * r;
      z = mz + Math.sin(th) * ss * r;
    }
    set(out, i, x, y * c - z * s, y * s + z * c);
  }
};

// 45. eye: outline + iris + pupil. Pupil is the LAST 8% of indices (follows the hand).
const eye: Gen = (n, out, rnd) => {
  const no = Math.floor(n * 0.3);
  const ni = Math.floor(n * 0.46);
  const np = Math.floor(n * EYE_PUPIL_FRACTION);
  for (let i = 0; i < n; i++) {
    if (i < no) {
      // almond outline
      const u = rnd();
      const top = i % 2 === 0;
      const x = u * 1.9 - 0.95;
      const y = (top ? 0.4 : -0.32) * Math.sin(Math.PI * u) + (rnd() - 0.5) * 0.025;
      set(out, i, x, y, (rnd() - 0.5) * 0.05);
    } else if (i < no + ni) {
      // iris
      const a = rnd() * Math.PI * 2;
      const r = 0.16 + rnd() * 0.17;
      set(out, i, Math.cos(a) * r, Math.sin(a) * r + 0.02, (rnd() - 0.5) * 0.06);
    } else if (i < no + ni + Math.floor(n * 0.16)) {
      // soft sclera fill
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.55;
      const x = Math.cos(a) * r;
      let y = Math.sin(a) * r * 0.75 + 0.02;
      y = Math.max(-0.3 * Math.sin(Math.PI * ((x + 0.95) / 1.9)), Math.min(0.38 * Math.sin(Math.PI * ((x + 0.95) / 1.9)), y));
      set(out, i, x, y, (rnd() - 0.5) * 0.04);
    } else {
      // pupil (last np indices)
      const a = rnd() * Math.PI * 2;
      const r = Math.cbrt(rnd()) * 0.1;
      set(out, i, Math.cos(a) * r, Math.sin(a) * r + 0.02, 0.02 + (rnd() - 0.5) * 0.03);
    }
  }
};

// 46. dragon: serpentine body + head + wings
const dragon: Gen = (n, out, rnd) => {
  const nb = Math.floor(n * 0.44);
  const nh = Math.floor(n * 0.12);
  for (let i = 0; i < n; i++) {
    if (i < nb) {
      const u = rnd();
      const x = (u * 2 - 1) * 0.82;
      const y = Math.sin(x * 3.1) * 0.15;
      const th = 0.085 * (1 - Math.abs(x) * 0.4) + 0.02;
      set(out, i, x, y + (rnd() * 2 - 1) * th, (rnd() * 2 - 1) * th);
    } else if (i < nb + nh) {
      // head
      const hy = Math.sin(0.82 * 3.1) * 0.15;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.15;
      set(out, i, 0.82 + Math.cos(a) * r * 1.2, hy + 0.08 + Math.sin(a) * r, (rnd() - 0.5) * 0.08);
    } else {
      // wings (membrane triangles sweeping up)
      const side = i % 2 === 0 ? 1 : -1;
      const s = Math.pow(rnd(), 0.8);
      const w = rnd();
      const x = side * (0.12 + 0.72 * s);
      const y = 0.1 + s * 0.62 * (1 - 0.55 * w) + Math.sin(s * Math.PI) * 0.06;
      set(out, i, x, y, (rnd() - 0.5) * 0.05);
    }
  }
};

// 46. phoenix: rising bird with sweeping wings + flame tail
const phoenix: Gen = (n, out, rnd) => {
  const nw = Math.floor(n * 0.55);
  const nt = Math.floor(n * 0.25);
  for (let i = 0; i < n; i++) {
    if (i < nw) {
      const side = i % 2 === 0 ? 1 : -1;
      const k = i % 6;
      const s = Math.pow(rnd(), 0.85);
      const x = side * (0.06 + 0.88 * s);
      const y = -0.05 + s * 0.42 + Math.sin(s * Math.PI) * 0.22 - k * 0.075;
      set(out, i, x, y + (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.05);
    } else if (i < nw + nt) {
      // flame tail curling down
      const u = rnd();
      const y = -0.35 - u * 0.5;
      const x = Math.sin(u * 5.5) * 0.14 * (1 - u * 0.5) + (rnd() - 0.5) * 0.06 * (1 + u);
      set(out, i, x, y, (rnd() - 0.5) * 0.05);
    } else {
      // body
      const u = rnd();
      set(out, i, (rnd() - 0.5) * 0.09, -0.4 + u * 0.95, (rnd() - 0.5) * 0.06);
    }
  }
};

// 46. wolf head, front-facing silhouette
const wolf: Gen = (n, out, rnd) => {
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    // base skull with cheek fur + snout
    let r = 0.42 + 0.06 * Math.sin(th * 5 + 1) + (rnd() - 0.5) * 0.05;
    const deg = (th * 180) / Math.PI;
    if (deg > 40 && deg < 80) r = 0.42 + (deg - 40) / 40 * 0.4; // right ear
    else if (deg > 100 && deg < 140) r = 0.42 + (140 - deg) / 40 * 0.4; // left ear
    else if (deg > 255 && deg < 285) r = 0.42 + Math.sin(((deg - 255) / 30) * Math.PI) * 0.22; // snout
    const s = Math.sqrt(rnd());
    const rr = r * s;
    set(out, i, Math.cos(th) * rr, Math.sin(th) * rr - 0.02, (rnd() * 2 - 1) * 0.1 * (1 - s * 0.5));
  }
};

// 46. butterfly
const butterfly: Gen = (n, out, rnd) => {
  const nb = Math.floor(n * 0.08);
  for (let i = 0; i < n; i++) {
    if (i < nb) {
      set(out, i, (rnd() - 0.5) * 0.07, (rnd() * 2 - 1) * 0.6, (rnd() - 0.5) * 0.05);
      continue;
    }
    const side = i % 2 === 0 ? 1 : -1;
    const upper = rnd() < 0.62;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    let x: number, y: number;
    if (upper) {
      x = 0.42 + Math.cos(a) * 0.48 * r;
      y = 0.3 + Math.sin(a) * 0.42 * r;
    } else {
      x = 0.3 + Math.cos(a) * 0.34 * r;
      y = -0.33 + Math.sin(a) * 0.3 * r;
    }
    set(out, i, x * side, y, (rnd() - 0.5) * 0.05);
  }
};

// 47. wings: six feather strands per side
const wings: Gen = (n, out, rnd) => {
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = i % 6;
    const s = Math.pow(rnd(), 0.9);
    const x = side * (0.08 + 0.86 * s);
    const y = 0.1 + Math.sin(s * Math.PI) * (0.34 - k * 0.045) + s * 0.28 - k * 0.1;
    set(out, i, x, y + (rnd() - 0.5) * 0.035, (rnd() - 0.5) * 0.05);
  }
};

// 41. neural network: node clusters + connecting strands
const neuron: Gen = (n, out, rnd) => {
  const NODES = 12;
  const nodes: [number, number, number][] = [];
  for (let k = 0; k < NODES; k++) {
    const a = (k / NODES) * Math.PI * 2 + rnd() * 0.5;
    const r = 0.35 + rnd() * 0.5;
    nodes.push([Math.cos(a) * r, Math.sin(a) * r * 0.85, (rnd() - 0.5) * 0.4]);
  }
  // connect each node to its two nearest neighbours
  const edges: [number, number][] = [];
  for (let k = 0; k < NODES; k++) {
    const ds = nodes
      .map((p, j) => ({ j, d: Math.hypot(p[0] - nodes[k]![0], p[1] - nodes[k]![1]) }))
      .sort((p, q) => p.d - q.d);
    edges.push([k, ds[1]!.j], [k, ds[2]!.j]);
  }
  const nn = Math.floor(n * 0.55);
  for (let i = 0; i < n; i++) {
    if (i < nn) {
      const node = nodes[i % NODES]!;
      const a = rnd() * Math.PI * 2;
      const r = Math.cbrt(rnd()) * 0.085;
      const s = Math.sqrt(1 - (rnd() * 2 - 1) * (rnd() * 2 - 1));
      set(out, i, node[0] + Math.cos(a) * r, node[1] + Math.sin(a) * r, node[2] + (rnd() - 0.5) * 0.06);
    } else {
      const [a, b] = edges[i % edges.length]!;
      const t = rnd();
      const pa = nodes[a]!, pb = nodes[b]!;
      set(
        out,
        i,
        pa[0] + (pb[0] - pa[0]) * t + (rnd() - 0.5) * 0.03,
        pa[1] + (pb[1] - pa[1]) * t + (rnd() - 0.5) * 0.03,
        pa[2] + (pb[2] - pa[2]) * t + (rnd() - 0.5) * 0.03,
      );
    }
  }
};

const GENS: Record<ShapeId, Gen> = {
  sphere,
  heart,
  saturn,
  flower,
  galaxy,
  dna,
  torus,
  cube,
  star,
  wave,
  fireworks,
  atomic,
  planet,
  eye,
  dragon,
  phoenix,
  wolf,
  butterfly,
  wings,
  neuron,
};

const cache = new Map<string, Float32Array>();

export function buildShape(id: ShapeId, n: number): Float32Array {
  const key = `${id}:${n}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = new Float32Array(n * 3);
  GENS[id](n, out, mulberry32(1337 + id.length * 97));
  // normalise so the farthest point sits at radius 1 (guarantees fit in boundary)
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
    if (d > max) max = d;
  }
  const k = max > 0 ? 1 / max : 1;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  cache.set(key, out);
  return out;
}

/** Solid ball used by the fist "energy sphere" — volume filled so particles keep their gaps. */
export function buildCompressBall(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const rnd = mulberry32(99);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const r = Math.cbrt(rnd());
    const s = Math.sqrt(1 - u * u);
    set(out, i, Math.cos(th) * s * r, u * r, Math.sin(th) * s * r);
  }
  return out;
}
