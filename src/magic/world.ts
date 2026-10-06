// World state + environments + moods for the Anime Magic feature library.
// The world object is rebuilt every frame by MagicStage and consumed by ParticleField.

export type WorldMode =
  | "normal"
  | "well" // 26. gravity well
  | "blackhole" // 31. black hole
  | "rain" // 34. particle rain
  | "ocean" // 35. particle ocean
  | "fluid" // 36. particle fluid
  | "poles" // 38. magnetic poles
  | "shield" // 64. magic shield
  | "eclipse"; // 69. eclipse

export const WORLD_MODES: { id: WorldMode; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "classic formation" },
  { id: "well", label: "Gravity Well", hint: "hand pulls & orbits" },
  { id: "blackhole", label: "Black Hole", hint: "swallow & rebirth" },
  { id: "rain", label: "Rain", hint: "falling magic dust" },
  { id: "ocean", label: "Ocean", hint: "hand makes waves" },
  { id: "fluid", label: "Fluid", hint: "liquid swirling flow" },
  { id: "poles", label: "Poles", hint: "attract / repel hands" },
  { id: "shield", label: "Shield", hint: "dome deflects all" },
  { id: "eclipse", label: "Eclipse", hint: "dark disc, bright rim" },
];

export type Dimension = "3d" | "flat" | "warp";

export interface WorldState {
  mode: WorldMode;
  /** simulation speed multiplier (29. time acceleration) */
  timeScale: number;
  /** 27. time freeze */
  frozen: boolean;
  /** 30. dimension shift */
  dimension: Dimension;
  /** 63. bouncy collisions with the boundary + orbs */
  bounce: boolean;
  /** 68. spectrum colour cycling */
  spectrum: boolean;
  /** 43. growth mode — formation grows from a seed */
  growth: boolean;
  /** 44. bloom mode — flower breathing */
  bloom: boolean;
  /** gravity point (well / blackhole / fluid stir) in world px */
  well: { x: number; y: number } | null;
  /** 38. two poles: a attracts, b repels */
  poles: { ax: number; ay: number; bx: number; by: number } | null;
  /** 64. deflector dome */
  shield: { x: number; y: number; r: number } | null;
  /** 58/65. invisible objects the particles bounce off */
  orbs: { x: number; y: number; r: number; id: number }[];
  /** 34. hand wind for rain */
  wind: { x: number; y: number };
  /** 35. ocean ripples caused by hand movement */
  ripples: { x: number; y: number; age: number }[];
  /** 45. eye pupil gaze offset (world px) */
  eye: { x: number; y: number } | null;
  /** 62. colour mixing anchor */
  mix: { x: number; y: number; on: number };
  /** 51. microphone level 0..1 */
  level: number;
  /** 52. beat pulse 0..1 (decays) */
  beat: number;
}

export function defaultWorld(): WorldState {
  return {
    mode: "normal",
    timeScale: 1,
    frozen: false,
    dimension: "3d",
    bounce: false,
    spectrum: false,
    growth: false,
    bloom: false,
    well: null,
    poles: null,
    shield: null,
    orbs: [],
    wind: { x: 0, y: 0 },
    ripples: [],
    eye: null,
    mix: { x: 0, y: 0, on: 0 },
    level: 0,
    beat: 0,
  };
}

// 17/48. day-night + environment worlds (pure CSS backgrounds)
export type EnvId = "void" | "day" | "night" | "forest" | "space" | "underwater" | "cyberpunk" | "temple";

export const ENVIRONMENTS: { id: EnvId; label: string }[] = [
  { id: "void", label: "Void" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
  { id: "forest", label: "Forest" },
  { id: "space", label: "Space" },
  { id: "underwater", label: "Ocean" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "temple", label: "Temple" },
];

// 16. emotion / mood presets
export interface MoodPreset {
  id: string;
  label: string;
  style?: string;
  env?: EnvId;
  mode?: WorldMode;
  shape?: string;
  bubbles?: boolean;
  spectrum?: boolean;
}

export const MOODS: MoodPreset[] = [
  { id: "calm", label: "Calm", style: "ice", env: "void", mode: "normal" },
  { id: "energetic", label: "Energetic", style: "spark", env: "cyberpunk", mode: "fluid", spectrum: true },
  { id: "mysterious", label: "Mysterious", style: "shadow", env: "night", mode: "normal" },
  { id: "joyful", label: "Joyful", style: "starlight", env: "day", mode: "normal", bubbles: true },
  { id: "dramatic", label: "Dramatic", style: "fire", env: "night", mode: "eclipse" },
  { id: "cosmic", label: "Cosmic", style: "cosmic", env: "space", mode: "normal", shape: "galaxy" },
];
