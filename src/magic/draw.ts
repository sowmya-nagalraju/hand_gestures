// 10. Air drawing — recognise simple shapes drawn with the index finger.
// Points are in normalised 0..1 screen space.

export type AirSymbol = "circle" | "triangle" | "star" | "line" | "zigzag" | "none";

export interface StrokeResult {
  symbol: AirSymbol;
  dir: 1 | -1;
}

interface Pt {
  x: number;
  y: number;
}

function resample(pts: Pt[], count: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]!];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  const step = total / (count - 1);
  let acc = 0;
  let prev = pts[0]!;
  for (let i = 1; i < pts.length && out.length < count; i++) {
    const p = pts[i]!;
    let d = Math.hypot(p.x - prev.x, p.y - prev.y);
    while (acc + d >= step && out.length < count) {
      const t = (step - acc) / (d || 1e-6);
      const np = { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t };
      out.push(np);
      prev = np;
      d = Math.hypot(p.x - prev.x, p.y - prev.y);
      acc = 0;
    }
    acc += d;
    prev = p;
  }
  return out;
}

export function recognizeStroke(raw: Pt[]): StrokeResult {
  if (raw.length < 10) return { symbol: "none", dir: 1 };
  const pts = resample(raw, 40);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  if (len < 0.14) return { symbol: "none", dir: 1 };

  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const gap = Math.hypot(b.x - a.x, b.y - a.y);
  const closed = gap < len * 0.3;

  if (closed) {
    // centroid + radius statistics separate circle / triangle / star
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    const sd = Math.sqrt(radii.reduce((s, r) => s + (r - mean) * (r - mean), 0) / radii.length);
    const variance = sd / (mean || 1e-6);
    if (variance > 0.3) return { symbol: "star", dir: 1 };
    // corner counting: sharp heading changes
    let corners = 0;
    for (let i = 2; i < pts.length; i++) {
      const a0 = Math.atan2(pts[i - 1]!.y - pts[i - 2]!.y, pts[i - 1]!.x - pts[i - 2]!.x);
      const a1 = Math.atan2(pts[i]!.y - pts[i - 1]!.y, pts[i]!.x - pts[i - 1]!.x);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.9) corners++;
    }
    if (corners >= 2 && corners <= 4 && variance > 0.12) return { symbol: "triangle", dir: 1 };
    return { symbol: "circle", dir: signedWinding(pts) };
  }

  // straightness: max perpendicular distance from the start→end line
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ll = Math.hypot(dx, dy) || 1e-6;
  let dmax = 0;
  for (const p of pts) {
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / ll;
    if (d > dmax) dmax = d;
  }
  if (dmax < len * 0.1) return { symbol: "line", dir: dx >= 0 ? 1 : -1 };

  // zigzag: at least 3 direction reversals along the main axis
  let reversals = 0;
  let prevSign = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i]!.x - pts[i - 1]!.x) * dx + (pts[i]!.y - pts[i - 1]!.y) * dy;
    const s = Math.sign(d);
    if (s !== 0 && prevSign !== 0 && s !== prevSign) reversals++;
    if (s !== 0) prevSign = s;
  }
  if (reversals >= 3) return { symbol: "zigzag", dir: dx >= 0 ? 1 : -1 };
  return { symbol: "none", dir: 1 };
}

function signedWinding(pts: Pt[]): 1 | -1 {
  let sum = 0;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  for (let i = 1; i < pts.length; i++) {
    const a0 = Math.atan2(pts[i - 1]!.y - cy, pts[i - 1]!.x - cx);
    const a1 = Math.atan2(pts[i]!.y - cy, pts[i]!.x - cx);
    let da = a1 - a0;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    sum += da;
  }
  // screen y is down: positive winding = clockwise on screen
  return sum > 0 ? -1 : 1;
}
