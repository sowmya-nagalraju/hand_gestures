// One Euro filter — removes hand jitter while staying responsive to deliberate motion.
class LowPass {
  private y = 0;
  private init = false;
  filter(x: number, a: number) {
    if (!this.init) {
      this.y = x;
      this.init = true;
    } else this.y = a * x + (1 - a) * this.y;
    return this.y;
  }
  last() {
    return this.y;
  }
  reset() {
    this.init = false;
  }
}

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT = -1;
  constructor(
    private minCutoff = 1.0,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value: number, tSec: number) {
    const dt = this.lastT < 0 ? 1 / 30 : Math.max(1e-3, tSec - this.lastT);
    const prev = this.lastT < 0 ? value : this.x.last();
    this.lastT = tSec;
    const d = (value - prev) / dt;
    const ed = this.dx.filter(d, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(value, this.alpha(cutoff, dt));
  }
  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastT = -1;
  }
}

export class OneEuro2D {
  private fx: OneEuro;
  private fy: OneEuro;
  constructor(minCutoff = 1.0, beta = 0.02) {
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
  }
  filter(x: number, y: number, t: number) {
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
