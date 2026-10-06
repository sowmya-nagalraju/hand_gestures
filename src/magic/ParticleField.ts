// @ts-nocheck -- hot numeric loops over typed arrays/landmarks; strict indexed-access checks add noise without safety here.
import * as THREE from "three";
import { buildCompressBall, buildShape, type ShapeId } from "./shapes";
import type { MagicStyle } from "./styles";

export const PARTICLE_COUNT = 14000;
/** Minimum distance kept between any two particles (CSS px) — the "oil & water" gap. */
export const MIN_GAP = 3.6;

export interface Bounds {
  /** half width / half height / half depth of the boundary box, in CSS px */
  hw: number;
  hh: number;
  hd: number;
}

/** Boundary box: centred on screen, leaves room for the side panels. */
export function computeBounds(w: number, h: number): Bounds {
  const mobile = w < 768;
  const bw = mobile ? w * 0.9 : Math.min(w - 600, w * 0.6, h * 1.3);
  const bh = mobile ? h * 0.56 : h * 0.7;
  const hw = bw / 2;
  const hh = bh / 2;
  return { hw, hh, hd: Math.min(hw, hh) };
}

export interface FieldInput {
  /** desired formation centre in world px (0,0 = screen centre, +y up) */
  targetX: number;
  targetY: number;
  scale: number;
  explode: number; // 0..1  open palm scatter
  compress: number; // 0..1  fist energy sphere
  rotZ: number;
  rotY: number; // extra user rotation around Y
  pinch: { x: number; y: number; strength: number } | null;
}

const HASH_SIZE = 1 << 16;
const HASH_MASK = HASH_SIZE - 1;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uDepth;
uniform float uShimmer;
attribute float aSeed;
varying float vSeed;
varying float vAlpha;
void main() {
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = clamp(position.z / uDepth, -1.0, 1.0);
  float tw = 0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 3.4) * uShimmer + aSeed * 61.0);
  vAlpha = (0.35 + 0.65 * pow(tw, 2.5)) * (0.62 + 0.38 * (depth * 0.5 + 0.5));
  gl_PointSize = uSize * uPixelRatio * (0.8 + 0.32 * (depth * 0.5 + 0.5)) * (0.85 + 0.3 * tw);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vSeed;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  core = pow(core, 1.6);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.3, 1.0, vSeed));
  gl_FragColor = vec4(col * (0.7 + core * 0.8), min(1.0, core * vAlpha * 1.25));
}
`;

export class ParticleField {
  readonly n = PARTICLE_COUNT;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  private pos: Float32Array;
  private vel: Float32Array;
  private corr: Float32Array;
  private seed: Float32Array;
  private field: Float32Array;
  private ball: Float32Array;
  private shape: Float32Array;
  private prevShape: Float32Array;
  private morph = 1;

  private cellOf: Int32Array;
  private cellStart = new Int32Array(HASH_SIZE + 1);
  private sorted: Int32Array;

  bounds: Bounds = { hw: 300, hh: 300, hd: 300 };
  private R = 250;

  // smoothed formation state
  private cx = 0;
  private cy = 0;
  private sc = 1;
  private ex = 0;
  private cp = 0;
  private rx = 0;
  private ry = 0;
  private rz = 0;
  private autoY = 0;
  private spinBoost = 0;

  private waves: { x: number; dir: number; age: number }[] = [];
  private style: MagicStyle;
  private time = 0;

  // rewind history (ring buffer of recent positions, ~6 s)
  private static HIST = 60;
  private hist: Float32Array;
  private histHead = 0;
  private histCount = 0;
  private histTimer = 0;
  rewinding = false;

  // portals: particles entering A reappear out of B
  portals: { ax: number; ay: number; bx: number; by: number; r: number } | null = null;
  private portalPull = 0;

  /** 0..1 charging level — particles swell and glow */
  charge = 0;
  private spectrumWas = false;

  constructor(
    private container: HTMLElement,
    style: MagicStyle,
    shapeId: ShapeId,
  ) {
    this.style = style;
    const n = this.n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.corr = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    this.field = new Float32Array(n * 3);
    this.cellOf = new Int32Array(n);
    this.sorted = new Int32Array(n);
    this.hist = new Float32Array(ParticleField.HIST * n * 3);
    this.ball = buildCompressBall(n);
    this.shape = buildShape(shapeId, n);
    this.prevShape = this.shape;
    for (let i = 0; i < n; i++) this.seed[i] = Math.random();

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000);
    this.camera.position.z = 1000;

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(this.seed, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 2.6 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uDepth: { value: 300 },
        uShimmer: { value: style.shimmer },
        uColorA: { value: new THREE.Color(style.colors[0]) },
        uColorB: { value: new THREE.Color(style.colors[1]) },
      },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.resize();
    // start scattered inside the boundary, then gather into the shape
    this.pos.set(this.field);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
    this.bounds = computeBounds(w, h);
    this.R = Math.min(this.bounds.hw, this.bounds.hh) * 0.8;
    this.material.uniforms.uDepth.value = this.bounds.hd;
    const { hw, hh, hd } = this.bounds;
    const m = 0.96;
    for (let i = 0; i < this.n; i++) {
      this.field[i * 3] = (Math.random() * 2 - 1) * hw * m;
      this.field[i * 3 + 1] = (Math.random() * 2 - 1) * hh * m;
      this.field[i * 3 + 2] = (Math.random() * 2 - 1) * hd * 0.6;
    }
  }

  setShape(id: ShapeId) {
    const next = buildShape(id, this.n);
    if (next === this.shape) return;
    this.prevShape = this.shape;
    this.shape = next;
    this.morph = 0;
  }

  setStyle(style: MagicStyle, customColor?: string | null) {
    this.style = style;
    const u = this.material.uniforms;
    (u.uColorA.value as THREE.Color).set(customColor ?? style.colors[0]);
    (u.uColorB.value as THREE.Color).set(customColor ? "#ffffff" : style.colors[1]);
    u.uShimmer.value = style.shimmer;
  }

  burst(strength = 420) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const dx = this.pos[i * 3] - this.cx;
      const dy = this.pos[i * 3 + 1] - this.cy;
      const dz = this.pos[i * 3 + 2];
      const d = Math.hypot(dx, dy, dz) + 1;
      const k = strength * (0.6 + this.seed[i] * 0.8);
      this.vel[i * 3] += (dx / d) * k;
      this.vel[i * 3 + 1] += (dy / d) * k;
      this.vel[i * 3 + 2] += (dz / d) * k;
    }
  }

  wave(dir: 1 | -1) {
    this.waves.push({ x: -dir * this.bounds.hw, dir, age: 0 });
  }

  spin(dir: 1 | -1) {
    this.spinBoost = dir * 2.4;
  }

  togglePortals() {
    if (this.portals) {
      this.portals = null;
      return false;
    }
    const { hw, hh } = this.bounds;
    const r = Math.min(hw, hh) * 0.16;
    this.portals = { ax: -hw * 0.62, ay: hh * 0.25, bx: hw * 0.62, by: -hh * 0.25, r };
    this.portalPull = 1;
    return true;
  }

  /** pour the formation into portal A for a moment */
  pourPortal() {
    this.portalPull = 1;
  }

  get canRewind() {
    return this.histCount > 2;
  }

  private rewindStep() {
    if (this.histCount <= 1) return false;
    const H = ParticleField.HIST;
    this.histHead = (this.histHead - 1 + H) % H;
    this.histCount--;
    const size = this.n * 3;
    const idx = ((this.histHead - 1 + H) % H) * size;
    // glide toward the older frame (smooth playback)
    const pos = this.pos;
    for (let i = 0; i < size; i++) pos[i] += (this.hist[idx + i] - pos[i]) * 0.6;
    this.vel.fill(0);
    return true;
  }

  /** current formation centre, useful for UI */
  get center() {
    return { x: this.cx, y: this.cy };
  }

  world = { mode: "normal", timeScale: 1, frozen: false, dimension: "3d", spectrum: false };

  update(dtRaw: number, input: FieldInput) {
    const dt0 = Number.isFinite(dtRaw) ? Math.min(Math.max(dtRaw, 0), 1 / 30) : 0;
    const dt = this.world.frozen ? 0 : Math.min(dt0 * this.world.timeScale, 1 / 20);
    if (dt <= 0) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    const t = this.time;
    const st = this.style;
    const { hw, hh, hd } = this.bounds;
    const n = this.n;
    const pos = this.pos;
    const vel = this.vel;

    if (this.world.spectrum) {
      const u = this.material.uniforms;
      (u.uColorA.value as THREE.Color).setHSL((t * 0.08) % 1, 0.9, 0.6);
      (u.uColorB.value as THREE.Color).setHSL((t * 0.08 + 0.35) % 1, 0.9, 0.65);
      this.spectrumWas = true;
    } else if (this.spectrumWas) { this.spectrumWas = false; this.setStyle(this.style); }
    this.material.uniforms.uSize.value = 2.6 * (1 + this.charge * 0.6);

    if (this.rewinding) {
      this.histTimer += dt;
      if (this.histTimer > 0.05) {
        this.histTimer = 0;
        this.rewindStep();
      }
      this.confine(hw, hh, hd);
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.material.uniforms.uTime.value = t;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const portals = this.portals;
    this.portalPull *= Math.exp(-dt / 1.6);
    const pull = this.portalPull;


    // ---------- smoothed formation state (this is what stops "over-reacting") ----------
    const ease = (tau: number) => 1 - Math.exp(-dt / tau);
    const minHalf = Math.min(hw, hh);
    const maxScale = (minHalf * 0.98) / this.R;
    const tScale = Math.min(Math.max(input.scale, 0.3), maxScale);
    this.sc += (tScale - this.sc) * ease(0.3);
    this.ex += (input.explode - this.ex) * ease(input.explode > this.ex ? 0.25 : 0.45);
    this.cp += (input.compress - this.cp) * ease(0.28);

    const extent = this.R * this.sc * (1 - this.cp * 0.66);
    const limX = Math.max(0, hw - extent);
    const limY = Math.max(0, hh - extent);
    const tx = Math.min(Math.max(input.targetX, -limX), limX);
    const ty = Math.min(Math.max(input.targetY, -limY), limY);
    const maxStep = Math.max(hw, hh) * 1.3 * dt; // cap formation speed
    let dx = (tx - this.cx) * ease(0.2);
    let dy = (ty - this.cy) * ease(0.2);
    const step = Math.hypot(dx, dy);
    if (step > maxStep) {
      dx *= maxStep / step;
      dy *= maxStep / step;
    }
    this.cx += dx;
    this.cy += dy;

    this.spinBoost *= Math.exp(-dt / 2.5);
    this.autoY += (st.spin + this.spinBoost) * dt;
    this.ry += (input.rotY - this.ry) * ease(0.25);
    let dz = input.rotZ - this.rz;
    this.rz += dz * ease(0.25);
    this.rx = Math.sin(t * 0.13) * 0.22;
    this.morph = Math.min(1, this.morph + dt / 1.2);
    const mEase = this.morph * this.morph * (3 - 2 * this.morph);

    // rotation matrix (Z * X * Y)
    const ay = this.autoY + this.ry;
    const cyA = Math.cos(ay), syA = Math.sin(ay);
    const cxA = Math.cos(this.rx), sxA = Math.sin(this.rx);
    const czA = Math.cos(this.rz), szA = Math.sin(this.rz);

    const R = this.R * this.sc;
    const Rc = Math.max(this.R * 0.34, 70);
    const comp = this.cp;
    const expl = this.ex;
    const k = st.stiffness * (1 + comp * 0.6);
    const damp = Math.exp(-dt * 2 * Math.sqrt(k) * 0.95);
    const vmax = Math.max(hw, hh) * 1.6;
    const floatAmp = st.float * (1 + expl * 2);

    const pinch = input.pinch;
    const pinchR = this.R * 0.7;

    for (let w of this.waves) w.age += dt;
    this.waves = this.waves.filter((w) => w.age < 2.2);
    const waveSpeed = hw * 1.3;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const sd = this.seed[i];
      // shape target (with morph from previous shape)
      let sx = this.shape[i3], sy = this.shape[i3 + 1], sz = this.shape[i3 + 2];
      if (mEase < 1) {
        sx = this.prevShape[i3] + (sx - this.prevShape[i3]) * mEase;
        sy = this.prevShape[i3 + 1] + (sy - this.prevShape[i3 + 1]) * mEase;
        sz = this.prevShape[i3 + 2] + (sz - this.prevShape[i3 + 2]) * mEase;
      }
      if (comp > 0.001) {
        sx += (this.ball[i3] * (Rc / R) - sx) * comp;
        sy += (this.ball[i3 + 1] * (Rc / R) - sy) * comp;
        sz += (this.ball[i3 + 2] * (Rc / R) - sz) * comp;
      }
      sx *= R; sy *= R; sz *= R;
      // rotate Y
      let x1 = cyA * sx + syA * sz;
      let z1 = -syA * sx + cyA * sz;
      // rotate X
      let y1 = cxA * sy - sxA * z1;
      let z2 = sxA * sy + cxA * z1;
      // rotate Z
      let x2 = czA * x1 - szA * y1;
      let y2 = szA * x1 + czA * y1;

      let gx = x2 + this.cx;
      let gy = y2 + this.cy;
      let gz = z2;
      const dim = this.world.dimension;
      if (dim === "flat") gz *= 0.04;
      else if (dim === "warp") { const wr = Math.hypot(x2, y2) / (R + 1); const wf = 1 + 0.35 * Math.sin(wr * 6 - t * 2); gx = x2 * wf + this.cx; gy = y2 * wf + this.cy; gz = z2 + Math.sin(wr * 8 - t * 3) * R * 0.25; }
      if (expl > 0.001) {
        gx += (this.field[i3] - gx) * expl;
        gy += (this.field[i3 + 1] - gy) * expl;
        gz += (this.field[i3 + 2] - gz) * expl;
      }
      // gentle floating drift — particles never look frozen
      const ph = sd * 6.2831;
      gx += Math.sin(t * (0.5 + sd * 0.4) + ph) * floatAmp;
      gy += Math.cos(t * (0.45 + sd * 0.35) + ph * 1.7) * floatAmp;
      gz += Math.sin(t * 0.38 + ph * 2.3) * floatAmp;

      const px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2];
      let vx = vel[i3] + (gx - px) * k * dt;
      let vy = vel[i3 + 1] + (gy - py) * k * dt;
      let vz = vel[i3 + 2] + (gz - pz) * k * dt;

      const wm = this.world.mode;
      if (wm !== "normal") {
        const dx = this.cx - px, dy = this.cy - py;
        const dl = Math.sqrt(dx * dx + dy * dy) + 30;
        if (wm === "well") { vx += (dx / dl * 300 - dy / dl * 500) * dt; vy += (dy / dl * 300 + dx / dl * 500) * dt; }
        else if (wm === "blackhole") { const f = 90000 / (dl * dl + 2000); vx += (dx / dl * f * 40 - dy / dl * 900) * dt; vy += (dy / dl * f * 40 + dx / dl * 900) * dt; }
        else if (wm === "rain") { vy -= (500 + sd * 400) * dt; }
        else if (wm === "ocean") { vy += Math.sin(px * 0.02 + t * 2.4) * 900 * dt; }
        else if (wm === "fluid") { vx += Math.sin(py * 0.013 + t) * 700 * dt; vy += Math.cos(px * 0.013 - t * 0.8) * 700 * dt; }
        else if (wm === "poles") { const ox = hw * 0.45 * (sd < 0.5 ? -1 : 1); const qx = ox - px, qy = -py; const ql = Math.hypot(qx, qy) + 30; vx += (qx / ql * 600 - qy / ql * 300) * dt; vy += (qy / ql * 600 + qx / ql * 300) * dt; }
        else if (wm === "shield") { const rr = Math.min(hw, hh) * 0.75; const d0 = dl - 30; const f = (rr - d0) * 6; vx -= dx / dl * f * dt; vy -= dy / dl * f * dt; vx += -dy / dl * 250 * dt; vy += dx / dl * 250 * dt; }
        else if (wm === "eclipse") { const rr = Math.min(hw, hh) * 0.35; const d0 = dl - 30; if (d0 < rr) { const f = (rr - d0) * 14; vx -= dx / dl * f * dt; vy -= dy / dl * f * dt; } vx += -dy / dl * 400 * dt; vy += dx / dl * 400 * dt; }
      }
      if (st.lift) {
        vy += st.lift * (0.4 + Math.sin(t * 3 + ph * 5) * 0.6) * dt * 6;
      }
      if (st.jitter && Math.random() < 0.012) {
        vx += (Math.random() - 0.5) * st.jitter * 6;
        vy += (Math.random() - 0.5) * st.jitter * 6;
      }
      if (st.swirl) {
        const rx = px - this.cx, ry = py - this.cy;
        const rl = Math.hypot(rx, ry) + 20;
        vx += (-ry / rl) * st.swirl * dt * 6;
        vy += (rx / rl) * st.swirl * dt * 6;
      }
      if (pinch && pinch.strength > 0.01) {
        const ddx = pinch.x - px, ddy = pinch.y - py, ddz = -pz;
        const d = Math.hypot(ddx, ddy, ddz) + 0.001;
        if (d < pinchR) {
          const f = pinch.strength * (1 - d / pinchR) * 2600 * dt;
          vx += (ddx / d) * f - (ddy / d) * f * 0.35;
          vy += (ddy / d) * f + (ddx / d) * f * 0.35;
          vz += (ddz / d) * f;
        }
      }
      for (let w = 0; w < this.waves.length; w++) {
        const wv = this.waves[w];
        const front = wv.x + wv.dir * waveSpeed * wv.age;
        const q = (px - front) / 70;
        const g = Math.exp(-q * q);
        if (g > 0.02) {
          vy += Math.sin(q * 2.2) * g * 1800 * dt;
          vz += g * 900 * dt;
          vx += wv.dir * g * 400 * dt;
        }
      }

      if (portals) {
        const pdx = portals.ax - px, pdy = portals.ay - py;
        const pd = Math.hypot(pdx, pdy) + 0.001;
        if (pull > 0.02 && sd < pull) {
          vx += (pdx / pd) * 1400 * dt;
          vy += (pdy / pd) * 1400 * dt;
        }
        if (pd < portals.r * 0.45) {
          // step through: appear at portal B, flung outward
          const a = sd * 6.2831 + t;
          const out = portals.r * 0.5;
          pos[i3] = portals.bx + Math.cos(a) * out;
          pos[i3 + 1] = portals.by + Math.sin(a) * out;
          vx = Math.cos(a) * 260;
          vy = Math.sin(a) * 260;
          vel[i3] = vx * damp; vel[i3 + 1] = vy * damp; vel[i3 + 2] = vz * damp;
          continue;
        }
      }

      vx *= damp; vy *= damp; vz *= damp;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > vmax) {
        const s = vmax / sp;
        vx *= s; vy *= s; vz *= s;
      }
      const nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      if (nx === nx && ny === ny && nz === nz && sp === sp) {
        vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
        pos[i3] = nx; pos[i3 + 1] = ny; pos[i3 + 2] = nz;
      } else {
        // safety net: a corrupted particle respawns quietly instead of freezing the page
        vel[i3] = 0; vel[i3 + 1] = 0; vel[i3 + 2] = 0;
        pos[i3] = this.field[i3]; pos[i3 + 1] = this.field[i3 + 1]; pos[i3 + 2] = this.field[i3 + 2];
      }
    }

    this.separate(dt);
    this.confine(hw, hh, hd);

    this.histTimer += dt;
    if (this.histTimer > 0.1) {
      this.histTimer = 0;
      const H = ParticleField.HIST;
      this.hist.set(pos, this.histHead * n * 3);
      this.histHead = (this.histHead + 1) % H;
      this.histCount = Math.min(H, this.histCount + 1);
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.uTime.value = t;
    this.renderer.render(this.scene, this.camera);
  }

  /** Oil & water: neighbours push apart so particles never touch — a tiny gap always remains. */
  private separate(dt: number) {
    const n = this.n;
    const pos = this.pos;
    const vel = this.vel;
    const corr = this.corr;
    const gap = MIN_GAP;
    const gap2 = gap * gap;
    const inv = 1 / gap;
    const cellStart = this.cellStart;
    const cellOf = this.cellOf;
    const sorted = this.sorted;
    const hash = (x: number, y: number, z: number) =>
      (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & HASH_MASK;

    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const h = hash(
        Math.floor(pos[i * 3] * inv),
        Math.floor(pos[i * 3 + 1] * inv),
        Math.floor(pos[i * 3 + 2] * inv),
      );
      cellOf[i] = h;
      cellStart[h + 1]++;
    }
    for (let h = 0; h < HASH_SIZE; h++) cellStart[h + 1] += cellStart[h];
    const fillPtr = cellStart.slice(0, HASH_SIZE);
    for (let i = 0; i < n; i++) sorted[fillPtr[cellOf[i]]++] = i;

    corr.fill(0);
    const MAX_CHECKS = 64; // hard cap per particle → a crowded spot can never stall a frame
    for (let i = 0; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      const ix = Math.floor(px * inv), iy = Math.floor(py * inv), iz = Math.floor(pz * inv);
      let cx = 0, cy = 0, cz = 0;
      let checks = 0;
      cells: for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++) {
            const h = hash(ix + ox, iy + oy, iz + oz);
            const end = cellStart[h + 1];
            for (let s = cellStart[h]; s < end; s++) {
              if (++checks > MAX_CHECKS) break cells;
              const j = sorted[s];
              if (j === i) continue;
              let dx = px - pos[j * 3];
              let dy = py - pos[j * 3 + 1];
              let dz = pz - pos[j * 3 + 2];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (!(d2 < gap2)) continue;
              let d = Math.sqrt(d2);
              if (d < 1e-4) {
                dx = Math.random() - 0.5;
                dy = Math.random() - 0.5;
                dz = Math.random() - 0.5;
                d = Math.hypot(dx, dy, dz);
              }
              const push = ((gap - d) / d) * 0.5;
              cx += dx * push;
              cy += dy * push;
              cz += dz * push;
            }
          }
      corr[i * 3] = cx;
      corr[i * 3 + 1] = cy;
      corr[i * 3 + 2] = cz;
    }
    const soft = 0.6;
    const vk = (soft / Math.max(dt, 1e-3)) * 0.25;
    for (let i = 0; i < n * 3; i++) {
      const c = corr[i] * soft;
      pos[i] += c;
      vel[i] += c * vk;
    }
  }

  /** Hard boundary: nothing ever leaves the frame. */
  private confine(hw: number, hh: number, hd: number) {
    const pos = this.pos;
    const vel = this.vel;
    const soft = 18;
    const lims = [hw, hh, hd * 0.9];
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      for (let a = 0; a < 3; a++) {
        const L = lims[a];
        let p = pos[i3 + a];
        if (p !== p || vel[i3 + a] !== vel[i3 + a]) {
          p = this.field[i3 + a];
          vel[i3 + a] = 0;
        }
        if (p > L - soft) vel[i3 + a] -= (p - (L - soft)) * 0.9;
        else if (p < -L + soft) vel[i3 + a] += (-L + soft - p) * 0.9;
        if (p > L) {
          p = L;
          if (vel[i3 + a] > 0) vel[i3 + a] *= -0.25;
        } else if (p < -L) {
          p = -L;
          if (vel[i3 + a] < 0) vel[i3 + a] *= -0.25;
        }
        pos[i3 + a] = p;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
