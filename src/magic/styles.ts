export type MagicStyleId =
  | "cosmic"
  | "fire"
  | "ice"
  | "lightning"
  | "wind"
  // 13/54. particle materials & shadow magic
  | "shadow"
  | "holo"
  | "snow"
  | "ember"
  | "crystal"
  | "smoke"
  | "spark"
  | "starlight";

export interface MagicStyle {
  id: MagicStyleId;
  label: string;
  /** styles are the classic element looks; materials change the particle feel */
  kind: "style" | "material";
  /** two particle colours, hex */
  colors: [string, string];
  /** shimmer speed multiplier */
  shimmer: number;
  /** idle float amplitude (px) */
  float: number;
  /** spring stiffness toward the formation */
  stiffness: number;
  /** extra behaviour */
  lift: number; // upward flicker (fire) — negative falls (snow)
  jitter: number; // electric kicks (lightning)
  swirl: number; // tangential flow (wind)
  spin: number; // auto rotation rad/s
}

// Particle colours live here because they are fed straight into the WebGL shader.
export const MAGIC_STYLES: MagicStyle[] = [
  {
    id: "cosmic",
    label: "Cosmic",
    kind: "style",
    colors: ["#7fe8ff", "#e9f3ff"],
    shimmer: 1,
    float: 2.6,
    stiffness: 9,
    lift: 0,
    jitter: 0,
    swirl: 0,
    spin: 0.16,
  },
  {
    id: "fire",
    label: "Fire",
    kind: "style",
    colors: ["#ff7a2e", "#ffd66b"],
    shimmer: 1.8,
    float: 3,
    stiffness: 8,
    lift: 38,
    jitter: 0,
    swirl: 0,
    spin: 0.12,
  },
  {
    id: "ice",
    label: "Ice",
    kind: "style",
    colors: ["#a9f1ff", "#ffffff"],
    shimmer: 0.6,
    float: 1.4,
    stiffness: 6,
    lift: 0,
    jitter: 0,
    swirl: 0,
    spin: 0.07,
  },
  {
    id: "lightning",
    label: "Lightning",
    kind: "style",
    colors: ["#fff36b", "#7ab8ff"],
    shimmer: 2.6,
    float: 2,
    stiffness: 11,
    lift: 0,
    jitter: 60,
    swirl: 0,
    spin: 0.2,
  },
  {
    id: "wind",
    label: "Wind",
    kind: "style",
    colors: ["#7dffc8", "#c9fff0"],
    shimmer: 1.2,
    float: 3.2,
    stiffness: 7,
    lift: 0,
    jitter: 0,
    swirl: 26,
    spin: 0.24,
  },
  {
    id: "shadow",
    label: "Shadow",
    kind: "style",
    colors: ["#5a3fae", "#c9b8ff"],
    shimmer: 0.5,
    float: 1.2,
    stiffness: 6,
    lift: 0,
    jitter: 0,
    swirl: -18,
    spin: 0.05,
  },
  {
    id: "holo",
    label: "Holographic",
    kind: "material",
    colors: ["#66fff2", "#ff6bd6"],
    shimmer: 2.2,
    float: 2,
    stiffness: 9,
    lift: 0,
    jitter: 0,
    swirl: 0,
    spin: 0.3,
  },
  {
    id: "snow",
    label: "Snow",
    kind: "material",
    colors: ["#ffffff", "#cfe8ff"],
    shimmer: 0.4,
    float: 4,
    stiffness: 4,
    lift: -14,
    jitter: 0,
    swirl: 0,
    spin: 0.02,
  },
  {
    id: "ember",
    label: "Embers",
    kind: "material",
    colors: ["#ff4d2e", "#ffb45e"],
    shimmer: 1.6,
    float: 2.6,
    stiffness: 8,
    lift: 20,
    jitter: 8,
    swirl: 0,
    spin: 0.1,
  },
  {
    id: "crystal",
    label: "Crystal",
    kind: "material",
    colors: ["#bfe9ff", "#ffffff"],
    shimmer: 0.5,
    float: 1,
    stiffness: 12,
    lift: 0,
    jitter: 0,
    swirl: 0,
    spin: 0.06,
  },
  {
    id: "smoke",
    label: "Smoke",
    kind: "material",
    colors: ["#8a93a8", "#dfe6f5"],
    shimmer: 0.3,
    float: 3.4,
    stiffness: 4,
    lift: 10,
    jitter: 0,
    swirl: 8,
    spin: 0.04,
  },
  {
    id: "spark",
    label: "Sparks",
    kind: "material",
    colors: ["#ffe66b", "#fff8d6"],
    shimmer: 3,
    float: 2,
    stiffness: 11,
    lift: 6,
    jitter: 30,
    swirl: 0,
    spin: 0.18,
  },
  {
    id: "starlight",
    label: "Starlight",
    kind: "material",
    colors: ["#fff3b0", "#ffffff"],
    shimmer: 2.4,
    float: 2.2,
    stiffness: 8,
    lift: 0,
    jitter: 0,
    swirl: 0,
    spin: 0.14,
  },
];

export const COLOR_SWATCHES = ["#7fe8ff", "#b8ff6b", "#ff6bd6", "#ffb45e", "#9d8cff", "#ffffff"];
