import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { ParticleField, PARTICLE_COUNT, type FieldInput } from "./ParticleField";
import { SHAPES, type ShapeId } from "./shapes";
import { GESTURE_MANUAL } from "./gestureManual";
import { COLOR_SWATCHES, MAGIC_STYLES, type MagicStyleId } from "./styles";
import { GESTURE_LABEL, GestureEngine, type Gesture, type GestureState } from "./gestures";
import { createHandLandmarker, startCamera } from "./handTracker";
import { WORLD_MODES, ENVIRONMENTS, MOODS } from "./world";
import { MicEngine, VoiceEngine } from "./audio";
import { setCharge, setSoundEnabled, sfx } from "./sfx";
import { OverlayFX, type FxTool } from "./effects";

type SpellId = "supernova" | "tidal" | "vortex" | "metamorph" | "echo";
const SPELLS: { id: SpellId; name: string; hint: string }[] = [
  { id: "supernova", name: "Supernova", hint: "gather, then explode" },
  { id: "tidal", name: "Tidal Wave", hint: "waves from both sides" },
  { id: "vortex", name: "Vortex Gate", hint: "pour through a portal" },
  { id: "metamorph", name: "Metamorph", hint: "random new shape" },
  { id: "echo", name: "Time Echo", hint: "rewind 2 seconds" },
];

type CamStatus = "off" | "loading" | "live" | "denied" | "error";

const GUIDE: { g: string; label: string; effect: string }[] = [
  { g: "☝️", label: "Point", effect: "particles follow" },
  { g: "🤏", label: "Pinch", effect: "gravity pull" },
  { g: "🖐️", label: "Open palm", effect: "scatter burst" },
  { g: "✊", label: "Fist", effect: "energy sphere" },
  { g: "✌️", label: "Two fingers", effect: "rotate" },
  { g: "🤟", label: "Three fingers", effect: "next shape" },
  { g: "🙌", label: "Two hands", effect: "stretch" },
  { g: "👋", label: "Fast swipe", effect: "wave" },
  { g: "⭕", label: "Circle finger", effect: "orbit spin" },
  { g: "✊→🖐️", label: "Hold fist, open", effect: "charged blast" },
];

const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export default function MagicStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorLabelRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<ParticleField | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [shape, setShape] = useState<ShapeId>("sphere");
  const [styleId, setStyleId] = useState<MagicStyleId>("cosmic");
  const [customColor, setCustomColor] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(1);
  const [showCam, setShowCam] = useState(false);
  const [cam, setCam] = useState<CamStatus>("off");
  const [hud, setHud] = useState<{ gesture: Gesture; hands: number; fps: number }>({
    gesture: "none",
    hands: 0,
    fps: 60,
  });
  const [bounds, setBounds] = useState({ hw: 0, hh: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [portalsOn, setPortalsOn] = useState(false);
  const [rewinding, setRewinding] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [mode, setMode] = useState("normal");
  const [timeScale, setTimeScale] = useState(1);
  const [frozen, setFrozen] = useState(false);
  const [dimension, setDimension] = useState("3d");
  const [spectrum, setSpectrum] = useState(false);
  const [env, setEnv] = useState("void");
  const [cinema, setCinema] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const micRef = useRef<MicEngine | null>(null);
  const voiceRef = useRef<VoiceEngine | null>(null);
  useEffect(() => {
    const f = fieldRef.current;
    if (f) f.world = { mode, timeScale, frozen, dimension, spectrum };
  }, [mode, timeScale, frozen, dimension, spectrum]);
  useEffect(() => {
    if (!micOn) return;
    const mic = new MicEngine();
    micRef.current = mic;
    let raf = 0, last = performance.now(), cool = 0;
    mic.start().then(() => {
      const loop = (now: number) => {
        const dt = (now - last) / 1000; last = now;
        const smp = mic.sample(dt, now / 1000);
        cool -= dt;
        if (smp.beat >= 1 && cool <= 0) { fieldRef.current?.burst(140 + smp.level * 300); cool = 0.35; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }).catch(() => setMicOn(false));
    return () => { cancelAnimationFrame(raf); mic.stop(); };
  }, [micOn]);
  useEffect(() => {
    if (!voiceOn) return;
    const v = new VoiceEngine();
    voiceRef.current = v;
    const map: Record<string, () => void> = {
      freeze: () => setFrozen(true), resume: () => setFrozen(false),
      explode: () => fieldRef.current?.burst(500), faster: () => setTimeScale(2), slower: () => setTimeScale(0.4),
      normal: () => { setMode("normal"); setTimeScale(1); },
    };
    for (const sh of SHAPES) map[sh.label.toLowerCase()] = () => setShape(sh.id);
    for (const w of WORLD_MODES) map[w.label.toLowerCase()] = () => setMode(w.id);
    v.start(map);
    return () => v.stop();
  }, [voiceOn]);
  const snapshot = () => {
    const c = stageRef.current?.querySelector("canvas");
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "anime-magic.png";
    a.click();
  };
  const applyMood = (id: string) => {
    const m = MOODS.find((x) => x.id === id);
    if (!m) return;
    setEnv(m.env ?? "void"); setMode(m.mode ?? "normal");
    if (MAGIC_STYLES.some((x) => x.id === m.style)) { setStyleId(m.style as MagicStyleId); setCustomColor(null); }
    if (m.shape && SHAPES.some((x) => x.id === m.shape)) setShape(m.shape as ShapeId);
  };
  const meterRef = useRef<HTMLDivElement>(null);
  const spellRef = useRef<{ id: SpellId; t: number } | null>(null);

  const live = useRef({ sensitivity, shape, showCam });
  live.current = { sensitivity, shape, showCam };

  const toastTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  // ---- overlay tools, challenges, calibration ----
  const fxRef = useRef<OverlayFX | null>(null);
  const [tool, setTool] = useState<FxTool>("none");
  const [trails, setTrails] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [score, setScore] = useState(0);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const challengeRef = useRef<{ target: Gesture; label: string; t: number } | null>(null);
  const calibRef = useRef<{ t: number; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const colorRef = useRef("#7fe8ff");
  colorRef.current = customColor ?? MAGIC_STYLES.find((s) => s.id === styleId)?.colors[0] ?? "#7fe8ff";
  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;
    fx.tool = tool; fx.trails = trails; fx.ghost = ghost;
  }, [tool, trails, ghost]);
  const newChallenge = useCallback(() => {
    const list: [Gesture, string][] = [["fist", "make a fist"], ["open", "open your palm"], ["victory", "show two fingers"], ["pinch", "pinch"], ["point", "point one finger"], ["two-hands", "raise both hands"], ["three", "show three fingers"]];
    const [target, label] = list[Math.floor(Math.random() * list.length)]!;
    challengeRef.current = { target, label, t: 6 };
    setChallenge(label);
  }, []);
  const toggleChallenges = () => {
    if (challengeRef.current) { challengeRef.current = null; setChallenge(null); }
    else { setScore(0); newChallenge(); }
  };
  const startCalibration = () => {
    calibRef.current = { t: 0, minX: 1, maxX: 0, minY: 1, maxY: 0 };
    setCalibrating(true);
    flash("calibrating · move your hand to every corner");
  };

  const nextShape = useCallback(() => {
    const idx = SHAPES.findIndex((s) => s.id === live.current.shape);
    const next = SHAPES[(idx + 1) % SHAPES.length]!;
    setShape(next.id);
    flash(`next up · ${next.label.toLowerCase()}`);
  }, [flash]);

  // ---------------- main loop ----------------
  useEffect(() => {
    const stage = stageRef.current!;
    const style = MAGIC_STYLES[0]!;
    const field = new ParticleField(stage, style, "sphere");
    fieldRef.current = field;
    const engine = new GestureEngine();
    const syncBounds = () => setBounds({ hw: field.bounds.hw, hh: field.bounds.hh });
    syncBounds();
    const fx = new OverlayFX(stage);
    fxRef.current = fx;
    fx.onRune = (sym, dir) => {
      if (sym === "circle") { field.spin(dir); sfx.spin(); flash("rune · orbit"); }
      else if (sym === "triangle") { field.burst(500); sfx.burst(0.5); flash("rune · fire triangle"); }
      else if (sym === "star") { field.burst(800); sfx.burst(1); flash("rune · star nova"); }
      else if (sym === "line") { field.wave(dir); sfx.wave(); flash("rune · wave"); }
      else if (sym === "zigzag") { field.burst(650); sfx.burst(0.8); flash("rune · lightning"); }
    };
    const onResize = () => {
      field.resize();
      fx.resize();
      syncBounds();
    };
    window.addEventListener("resize", onResize);

    const ctrl = {
      rotZ: 0,
      rotY: 0,
      charge: 0,
      prev: "none" as Gesture,
      startRoll: 0,
      startRotZ: 0,
      startX: 0,
      startRotY: 0,
      holdX: 0,
      holdY: 0,
    };
    let gs: GestureState = engine.process(null, performance.now());
    let lastVideoTime = -1;
    let last = performance.now();
    let hudT = 0;
    let frames = 0;
    let raf = 0;

    const drawPreview = (state: GestureState) => {
      const cv = previewRef.current;
      const video = videoRef.current;
      if (!cv || !video || !live.current.showCam) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const w = cv.width, h = cv.height;
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
      ctx.strokeStyle = "rgba(127,232,255,0.85)";
      ctx.fillStyle = "rgba(233,255,250,0.95)";
      ctx.lineWidth = 1;
      for (const hand of state.landmarks) {
        ctx.beginPath();
        for (const [a, b] of HAND_LINKS as [number, number][]) {
          const pa = hand[a], pb = hand[b];
          if (!pa || !pb) continue;
          ctx.moveTo(pa.x * w, pa.y * h);
          ctx.lineTo(pb.x * w, pb.y * h);
        }
        ctx.stroke();
        for (const p of hand) {
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // rAF timestamps can be earlier than performance.now() at setup → never allow a negative step
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      const video = videoRef.current;
      const lmk = landmarkerRef.current;
      if (lmk && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
          const res = lmk.detectForVideo(video, now);
          gs = engine.process(res, now);
        } catch {
          gs = engine.process(null, now);
        }
        drawPreview(gs);
      } else if (!lmk) {
        gs = engine.process(null, now);
      } else {
        gs = { ...gs, events: [] };
      }

      const { hw, hh } = field.bounds;
      const s = live.current.sensitivity;
      const toW = (p: { x: number; y: number }) => ({
        x: (p.x - 0.5) * 2 * hw * s,
        y: -(p.y - 0.5) * 2 * hh * s,
      });

      const g = gs.gesture;
      if (g !== ctrl.prev) {
        if (g === "pinch" || g === "victory") {
          ctrl.holdX = field.center.x;
          ctrl.holdY = field.center.y;
        }
        if (g === "victory") {
          ctrl.startRoll = gs.roll;
          ctrl.startRotZ = ctrl.rotZ;
          ctrl.startX = gs.pointer.x;
          ctrl.startRotY = ctrl.rotY;
        }
        ctrl.prev = g;
      }

      const input: FieldInput = {
        targetX: 0,
        targetY: 0,
        scale: 1,
        explode: 0,
        compress: 0,
        rotZ: ctrl.rotZ,
        rotY: ctrl.rotY,
        pinch: null,
      };
      let cursor: { x: number; y: number } | null = null;
      switch (g) {
        case "hand":
        case "thumbs-up":
        case "thumbs-down":
        case "ok":
        case "three": {
          const p = toW(gs.palm);
          input.targetX = p.x;
          input.targetY = p.y;
          cursor = p;
          break;
        }
        case "point": {
          const p = toW(gs.pointer);
          input.targetX = p.x;
          input.targetY = p.y;
          cursor = p;
          break;
        }
        case "pinch": {
          const p = toW(gs.pinchPoint);
          input.targetX = ctrl.holdX;
          input.targetY = ctrl.holdY;
          input.pinch = { x: p.x, y: p.y, strength: 0.35 + 0.65 * gs.pinchStrength };
          cursor = p;
          break;
        }
        case "open": {
          const p = toW(gs.palm);
          input.targetX = p.x * 0.4;
          input.targetY = p.y * 0.4;
          input.explode = 1;
          cursor = p;
          break;
        }
        case "fist": {
          const p = toW(gs.palm);
          input.targetX = p.x;
          input.targetY = p.y;
          input.compress = 1;
          cursor = p;
          break;
        }
        case "victory": {
          ctrl.rotZ = ctrl.startRotZ - (gs.roll - ctrl.startRoll) * 1.2;
          ctrl.rotY = ctrl.startRotY + (gs.pointer.x - ctrl.startX) * 5;
          input.rotZ = ctrl.rotZ;
          input.rotY = ctrl.rotY;
          input.targetX = ctrl.holdX;
          input.targetY = ctrl.holdY;
          cursor = toW(gs.pointer);
          break;
        }
        case "four": {
          const p = toW(gs.palm);
          input.targetX = p.x; input.targetY = p.y; input.compress = 0.5; cursor = p;
          break;
        }
        case "rock": {
          const p = toW(gs.palm);
          ctrl.rotY += dt * 2.2; input.rotY = ctrl.rotY;
          input.targetX = p.x; input.targetY = p.y; cursor = p;
          break;
        }
        case "call": {
          const p = toW(gs.palm);
          ctrl.rotZ += dt * 1.4; input.rotZ = ctrl.rotZ;
          input.targetX = p.x; input.targetY = p.y; cursor = p;
          break;
        }
        case "pinky": {
          const p = toW(gs.palm);
          input.targetX = p.x; input.targetY = p.y; input.scale = 0.6; cursor = p;
          break;
        }
        case "gun": {
          const p = toW(gs.pointer);
          input.targetX = p.x * 0.6; input.targetY = p.y * 0.6; input.explode = 0.35; cursor = p;
          break;
        }
        case "two-hands": {
          const p = toW(gs.mid);
          input.targetX = p.x;
          input.targetY = p.y;
          input.scale = Math.min(1.6, Math.max(0.35, gs.twoDist / 0.32));
          cursor = p;
          break;
        }
        default:
          break;
      }

      // spell sequences
      const sp = spellRef.current;
      if (sp) {
        sp.t += dt;
        if (sp.id === "supernova") {
          input.compress = 1;
          ctrl.charge = Math.min(1, ctrl.charge + dt / 1.2);
          if (sp.t > 1.3) {
            field.burst(420 * (1 + ctrl.charge * 2.2));
            sfx.burst(1);
            ctrl.charge = 0;
            spellRef.current = null;
          }
        } else if (sp.id === "echo") {
          field.rewinding = sp.t < 2;
          if (sp.t >= 2) spellRef.current = null;
        } else spellRef.current = null;
      }

      // charging meter: hold a fist to build power
      if (g === "fist") ctrl.charge = Math.min(1, ctrl.charge + dt / 2.5);
      else if (!sp || sp.id !== "supernova") ctrl.charge = Math.max(0, ctrl.charge - dt * (g === "open" ? 0 : 0.35));

      for (const ev of gs.events) {
        if (ev.type === "burst") {
          const c = ctrl.charge;
          field.burst(420 * (1 + c * 2.5));
          sfx.burst(c);
          if (c > 0.3) flash(`charged blast · ${Math.round(c * 100)}%`);
          ctrl.charge = 0;
        } else if (ev.type === "swipe") {
          field.wave(ev.dir);
          sfx.wave();
          flash(ev.dir > 0 ? "wave →" : "← wave");
        } else if (ev.type === "next-shape") {
          nextShape();
          sfx.chime();
        } else if (ev.type === "clap") {
          field.burst(700);
          sfx.burst(0.6);
          flash("clap · shockwave");
        } else if (ev.type === "hold") {
          if (ev.gesture === "thumbs-up") {
            setCustomColor(null);
            setStyleId((cur) => {
              const i = MAGIC_STYLES.findIndex((x) => x.id === cur);
              return MAGIC_STYLES[(i + 1) % MAGIC_STYLES.length]!.id;
            });
            sfx.chime();
            flash("thumbs up · next colour");
          } else if (ev.gesture === "thumbs-down") {
            const idx = SHAPES.findIndex((s) => s.id === live.current.shape);
            const prev = SHAPES[(idx - 1 + SHAPES.length) % SHAPES.length]!;
            setShape(prev.id);
            sfx.chime();
            flash(`back to · ${prev.label.toLowerCase()}`);
          } else if (ev.gesture === "ok") {
            setFrozen((v) => !v);
            flash("OK · freeze toggled");
          }
        } else if (ev.type === "circle") {
          field.spin(ev.dir);
          sfx.spin();
          flash(ev.dir > 0 ? "orbit ↺" : "orbit ↻");
        }
      }
      field.charge = ctrl.charge;
      setCharge(field.rewinding ? 0 : ctrl.charge);
      if (meterRef.current) {
        meterRef.current.style.setProperty("--charge", String(ctrl.charge));
        meterRef.current.dataset["full"] = String(ctrl.charge > 0.98);
      }

      field.update(dt, input);

      // overlay effects (trails, runes, paint, bubbles, beams)
      const W2 = stage.clientWidth / 2, H2 = stage.clientHeight / 2;
      fx.update(dt, {
        gesture: g,
        cursor: cursor ? { x: W2 + Math.max(-hw, Math.min(hw, cursor.x)), y: H2 - Math.max(-hh, Math.min(hh, cursor.y)) } : null,
        center: { x: W2 + field.center.x, y: H2 - field.center.y },
        landmarks: gs.landmarks,
        color: colorRef.current,
      });

      // challenges
      const ch = challengeRef.current;
      if (ch) {
        ch.t -= dt;
        if (g === ch.target) {
          sfx.chime();
          flash(`✓ ${ch.label}`);
          setScore((s) => s + 1);
          newChallenge();
        } else if (ch.t <= 0) {
          flash("time's up — next challenge");
          newChallenge();
        }
      }

      // calibration: move your hand around for 4 s, sensitivity adapts to your reach
      const cal = calibRef.current;
      if (cal) {
        cal.t += dt;
        if (gs.hands > 0) {
          cal.minX = Math.min(cal.minX, gs.palm.x); cal.maxX = Math.max(cal.maxX, gs.palm.x);
          cal.minY = Math.min(cal.minY, gs.palm.y); cal.maxY = Math.max(cal.maxY, gs.palm.y);
        }
        if (cal.t > 4) {
          calibRef.current = null;
          const range = Math.max(cal.maxX - cal.minX, cal.maxY - cal.minY);
          if (range > 0.08) {
            const s2 = Math.round(Math.min(1.6, Math.max(0.6, 0.75 / range)) * 10) / 10;
            setSensitivity(s2);
            flash(`calibrated · sensitivity ${s2}`);
          } else flash("no hand seen — calibration skipped");
          setCalibrating(false);
        }
      }

      // cursor ring (stays inside the boundary)
      const cEl = cursorRef.current;
      if (cEl) {
        if (cursor) {
          const x = Math.max(-hw, Math.min(hw, cursor.x));
          const y = Math.max(-hh, Math.min(hh, cursor.y));
          cEl.style.opacity = "1";
          cEl.style.transform = `translate(${stage.clientWidth / 2 + x}px, ${stage.clientHeight / 2 - y}px)`;
          if (cursorLabelRef.current) cursorLabelRef.current.textContent = g;
        } else cEl.style.opacity = "0";
      }

      frames++;
      hudT += dt;
      if (hudT > 0.25) {
        const fps = Math.round(frames / hudT);
        frames = 0;
        hudT = 0;
        setHud((h) =>
          h.gesture === gs.gesture && h.hands === gs.hands && Math.abs(h.fps - fps) < 3
            ? h
            : { gesture: gs.gesture, hands: gs.hands, fps },
        );
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      field.dispose();
      fx.dispose();
      fxRef.current = null;
      fieldRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [flash, nextShape]);

  useEffect(() => {
    setSoundEnabled(sound);
  }, [sound]);

  useEffect(() => {
    const f = fieldRef.current;
    if (f && !spellRef.current) f.rewinding = rewinding;
    if (rewinding) sfx.rewind();
  }, [rewinding]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") setRewinding(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") setRewinding(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      setCharge(0);
    };
  }, []);

  const togglePortals = () => {
    const on = fieldRef.current?.togglePortals() ?? false;
    setPortalsOn(on);
    sfx.portal();
    flash(on ? "portals open" : "portals closed");
  };

  const cast = (id: SpellId) => {
    const f = fieldRef.current;
    if (!f) return;
    sfx.spell();
    const name = SPELLS.find((s) => s.id === id)!.name;
    flash(`spell · ${name.toLowerCase()}`);
    if (id === "tidal") {
      f.wave(1);
      window.setTimeout(() => f.wave(-1), 450);
      sfx.wave();
    } else if (id === "vortex") {
      if (!f.portals) setPortalsOn(f.togglePortals());
      f.pourPortal();
      f.spin(1);
      sfx.portal();
    } else if (id === "metamorph") {
      const others = SHAPES.filter((s) => s.id !== live.current.shape);
      setShape(others[Math.floor(Math.random() * others.length)]!.id);
    } else {
      spellRef.current = { id, t: 0 };
    }
  };

  useEffect(() => {
    fieldRef.current?.setShape(shape);
  }, [shape]);

  useEffect(() => {
    const st = MAGIC_STYLES.find((s) => s.id === styleId)!;
    fieldRef.current?.setStyle(st, customColor);
  }, [styleId, customColor]);

  const enableCamera = async () => {
    const video = videoRef.current;
    if (!video) return;
    setCam("loading");
    try {
      streamRef.current = await startCamera(video);
    } catch {
      setCam("denied");
      return;
    }
    try {
      landmarkerRef.current = await createHandLandmarker();
      setCam("live");
    } catch {
      setCam("error");
    }
  };

  const reset = () => {
    setShape("sphere");
    setStyleId("cosmic");
    setCustomColor(null);
    setSensitivity(1);
  };

  const shapeLabel = SHAPES.find((s) => s.id === shape)?.label ?? shape;

  return (
    <main className="magic-stage" data-env={env} data-cinema={cinema}>
      <div ref={stageRef} className="absolute inset-0" aria-hidden />
      <div className="magic-vignette" aria-hidden />

      {/* boundary frame — every particle always stays inside */}
      {bounds.hw > 0 && (
        <div
          className="magic-frame"
          style={{ width: bounds.hw * 2, height: bounds.hh * 2 }}
          aria-hidden
        >
          <span className="magic-corner" data-pos="tl" />
          <span className="magic-corner" data-pos="tr" />
          <span className="magic-corner" data-pos="bl" />
          <span className="magic-corner" data-pos="br" />
          <span className="magic-frame-label">&gt; shape test: {shapeLabel.toLowerCase()}</span>
          <span className="magic-frame-meta">
            {PARTICLE_COUNT.toLocaleString()} particles · {hud.fps} fps
          </span>
        </div>
      )}

      <div ref={cursorRef} className="magic-cursor" aria-hidden>
        <span ref={cursorLabelRef} className="magic-cursor-label" />
      </div>

      {/* header */}
      <header className="absolute left-5 top-5 z-10 md:left-8 md:top-6">
        <h1 className="magic-title">Anime Magic</h1>
        <p className="hud-line mt-1">
          <span className="hud-dot" data-state={cam === "live" ? (hud.hands ? "hand" : "live") : "off"} />
          {cam === "live"
            ? hud.hands
              ? `${hud.hands} hand · ${GESTURE_LABEL[hud.gesture]}`
              : "camera live · show your hand"
            : cam === "loading"
              ? "waking the camera…"
              : "camera off · particles drifting"}
        </p>
      </header>

      {/* shape list */}
      <nav className="hud-panel absolute left-5 top-28 z-10 hidden w-44 overflow-y-auto py-3 md:block md:left-8 max-h-[calc(100vh-8rem)] lg:max-h-[calc(55vh-7rem)]" aria-label="Shapes">
        <p className="hud-label px-4 pb-2">Shapes</p>
        <ul>
          {SHAPES.map((s) => (
            <li key={s.id}>
              <button className="shape-item" data-active={s.id === shape} onClick={() => setShape(s.id)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* controls */}
      <aside className="hud-panel absolute right-5 top-5 z-10 hidden w-60 space-y-5 overflow-y-auto p-4 md:block md:right-8 md:top-6 max-h-[calc(58vh-2rem)]">
        <div className="flex gap-2">
          <button className="hud-chip flex-1" data-active={showCam} onClick={() => setShowCam((v) => !v)}>
            {showCam ? "Hide camera" : "Show camera"}
          </button>
          <button className="hud-chip flex-1" onClick={reset}>
            Reset
          </button>
        </div>
        <div>
          <p className="hud-label mb-2">Magic style</p>
          <div className="flex flex-wrap gap-1.5">
            {MAGIC_STYLES.map((s) => (
              <button
                key={s.id}
                className="hud-chip"
                data-active={s.id === styleId && !customColor}
                onClick={() => {
                  setStyleId(s.id);
                  setCustomColor(null);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="hud-label mb-2">Particle colour</p>
          <div className="flex items-center gap-2">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                className="hud-swatch"
                data-active={customColor === c}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => setCustomColor(c)}
              />
            ))}
            <label className="hud-swatch hud-swatch-picker" aria-label="Custom colour">
              <input
                type="color"
                className="sr-only"
                value={customColor ?? "#7fe8ff"}
                onChange={(e) => setCustomColor(e.target.value)}
              />
              +
            </label>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="hud-label">Hand sensitivity</p>
            <span className="hud-value">{sensitivity.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="hud-range"
            aria-label="Hand sensitivity"
          />
        </div>
        <div className="flex gap-2">
          <button className="hud-chip flex-1" data-active={portalsOn} onClick={togglePortals}>
            {portalsOn ? "Close portals" : "Open portals"}
          </button>
          <button
            className="hud-chip flex-1"
            data-active={rewinding}
            onPointerDown={() => setRewinding(true)}
            onPointerUp={() => setRewinding(false)}
            onPointerLeave={() => setRewinding(false)}
            title="Hold (or hold R) to rewind"
          >
            ⏪ Hold rewind
          </button>
        </div>
        <div className="flex gap-2">
          <button className="hud-chip flex-1" data-active={sound} onClick={() => setSound((v) => !v)}>
            {sound ? "Sound on" : "Sound off"}
          </button>
        </div>
      </aside>

      {/* spell book */}
      <section className="hud-panel absolute bottom-6 right-5 z-10 hidden w-60 overflow-y-auto p-4 md:block md:right-8 max-h-[calc(42vh-2.5rem)]" aria-label="Spell book">
        <p className="hud-label mb-2">Spell book</p>
        <ul className="space-y-1">
          {SPELLS.map((s) => (
            <li key={s.id}>
              <button className="spell-item" onClick={() => cast(s.id)}>
                <span className="guide-name">{s.name}</span>
                <span className="guide-effect">{s.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>


      <button className="hud-chip manual-btn z-20" data-active={manualOpen} onClick={() => { setManualOpen((v) => !v); setLibOpen(false); }}>
        {manualOpen ? "Close manual" : "Gesture manual"}
      </button>
      {manualOpen && (
        <div className="hud-panel absolute left-1/2 top-24 z-20 max-h-[62vh] w-[min(92vw,34rem)] -translate-x-1/2 space-y-3 overflow-y-auto p-4" role="dialog" aria-label="Hand gesture manual">
          {GESTURE_MANUAL.map((sec) => (
            <section key={sec.title} className="space-y-1.5">
              <p className="hud-label">{sec.title}</p>
              <ul className="space-y-1.5">
                {sec.items.map((g) => (
                  <li key={g.name} className="flex gap-3 text-xs">
                    <span className="w-6 shrink-0 text-base leading-none">{g.icon}</span>
                    <span><span className="font-semibold text-foreground">{g.name}</span> — <span className="text-muted-foreground">{g.how}</span><br /><span className="text-primary">→ {g.effect}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <button className="hud-chip lib-btn z-20" data-active={libOpen} onClick={() => { setLibOpen((v) => !v); setManualOpen(false); }}>
        {libOpen ? "Close library" : "Magic library"}
      </button>
      {libOpen && (
        <div className="hud-panel absolute left-1/2 top-24 z-20 max-h-[60vh] w-[min(92vw,30rem)] -translate-x-1/2 space-y-3 overflow-y-auto p-4">
          <p className="hud-label">World mode</p>
          <div className="flex flex-wrap gap-1.5">{WORLD_MODES.map((w) => (
            <button key={w.id} className="hud-chip" title={w.hint} data-active={mode === w.id} onClick={() => setMode(w.id)}>{w.label}</button>))}</div>
          <p className="hud-label">Time</p>
          <div className="flex flex-wrap gap-1.5">
            <button className="hud-chip" data-active={frozen} onClick={() => setFrozen((v) => !v)}>{frozen ? "Unfreeze" : "Freeze"}</button>
            {[0.3, 1, 2].map((v) => (<button key={v} className="hud-chip" data-active={timeScale === v} onClick={() => setTimeScale(v)}>{v}×</button>))}
          </div>
          <p className="hud-label">Dimension &amp; colour</p>
          <div className="flex flex-wrap gap-1.5">
            {[["3d","3D"],["flat","Flat"],["warp","Warp"]].map(([id,l]) => (<button key={id} className="hud-chip" data-active={dimension === id} onClick={() => setDimension(id as string)}>{l}</button>))}
            <button className="hud-chip" data-active={spectrum} onClick={() => setSpectrum((v) => !v)}>Rainbow</button>
          </div>
          <p className="hud-label">Environment</p>
          <div className="flex flex-wrap gap-1.5">{ENVIRONMENTS.map((e) => (
            <button key={e.id} className="hud-chip" data-active={env === e.id} onClick={() => setEnv(e.id)}>{e.label}</button>))}</div>
          <p className="hud-label">Mood</p>
          <div className="flex flex-wrap gap-1.5">{MOODS.map((m) => (
            <button key={m.id} className="hud-chip" onClick={() => applyMood(m.id)}>{m.label}</button>))}</div>
          <p className="hud-label">Hand tools</p>
          <div className="flex flex-wrap gap-1.5">
            {([["none","Off"],["runes","Runes"],["paint","Paint"],["eraser","Eraser"],["bubbles","Bubbles"],["beam","Staff beam"]] as [FxTool,string][]).map(([id,l]) => (
              <button key={id} className="hud-chip" data-active={tool === id} onClick={() => setTool(id)}>{l}</button>))}
            <button className="hud-chip" onClick={() => fxRef.current?.clearPaint()}>Clear paint</button>
            <button className="hud-chip" data-active={trails} onClick={() => setTrails((v) => !v)}>Hand trail</button>
            <button className="hud-chip" data-active={ghost} onClick={() => setGhost((v) => !v)}>Ghost hand</button>
          </div>
          <p className="hud-label">Play</p>
          <div className="flex flex-wrap gap-1.5">
            <button className="hud-chip" data-active={!!challenge} onClick={toggleChallenges}>{challenge ? `Stop challenges · ${score}` : "Challenges"}</button>
            <button className="hud-chip" data-active={calibrating} onClick={startCalibration}>Calibrate hand</button>
          </div>
          {challenge && <p className="magic-cta-note">Challenge: {challenge} · score {score}</p>}
          <p className="hud-label">Extras</p>
          <div className="flex flex-wrap gap-1.5">
            <button className="hud-chip" data-active={micOn} onClick={() => setMicOn((v) => !v)}>Music beat</button>
            {VoiceEngine.supported && <button className="hud-chip" data-active={voiceOn} onClick={() => setVoiceOn((v) => !v)}>Voice commands</button>}
            <button className="hud-chip" data-active={cinema} onClick={() => setCinema((v) => !v)}>Cinematic</button>
            <button className="hud-chip" onClick={snapshot}>Snapshot</button>
          </div>
          {voiceOn && <p className="magic-cta-note">Say a shape name, a world mode, "freeze", "explode", "faster"…</p>}
        </div>
      )}
      {/* charging meter */}
      <div ref={meterRef} className="magic-meter z-10" aria-label="Charge meter">
        <span className="hud-label">charge</span>
        <div className="magic-meter-track"><div className="magic-meter-fill" /></div>
      </div>

      {portalsOn && fieldRef.current?.portals && (
        <>
          {(["a", "b"] as const).map((k) => {
            const p = fieldRef.current!.portals!;
            const x = k === "a" ? p.ax : p.bx;
            const y = k === "a" ? p.ay : p.by;
            return (
              <div
                key={k}
                className="magic-portal"
                data-kind={k}
                aria-hidden
                style={{ width: p.r * 2, height: p.r * 2, left: `calc(50% + ${x - p.r}px)`, top: `calc(50% - ${y + p.r}px)` }}
              />
            );
          })}
        </>
      )}

      {/* gesture guide */}
      <section className="hud-panel absolute bottom-6 left-5 z-10 hidden w-64 overflow-y-auto p-4 lg:block md:left-8 max-h-[calc(45vh-2rem)]" aria-label="Gesture controls">
        <p className="hud-label mb-2">Gesture controls</p>
        <ul className="space-y-1">
          {GUIDE.map((row) => (
            <li key={row.label} className="guide-row">
              <span className="w-5 text-center">{row.g}</span>
              <span className="guide-name">{row.label}</span>
              <span className="guide-effect">{row.effect}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* mobile shape strip */}
      <div className="absolute inset-x-0 bottom-4 z-10 flex gap-1.5 overflow-x-auto px-4 md:hidden">
        {SHAPES.map((s) => (
          <button key={s.id} className="hud-chip shrink-0" data-active={s.id === shape} onClick={() => setShape(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* camera preview (input only, hidden by default) */}
      <video ref={videoRef} className="magic-video-hidden" playsInline muted />
      <div className="magic-preview z-10" data-visible={showCam && cam === "live"}>
        <canvas ref={previewRef} width={224} height={168} />
      </div>

      {toast && (
        <div className="magic-toast z-20" role="status">
          {toast}
        </div>
      )}

      {cam !== "live" && (
        <div className="magic-cta z-20">
          {cam === "off" && (
            <>
              <p className="hud-label">Your hand is the controller</p>
              <button className="magic-button" onClick={enableCamera}>
                Awaken the magic
              </button>
              <p className="magic-cta-note">Camera stays private — used only to read your hand.</p>
            </>
          )}
          {cam === "loading" && <p className="hud-line">Loading hand tracking…</p>}
          {cam === "denied" && (
            <>
              <p className="hud-line">Camera permission was blocked. Allow it in your browser, then retry.</p>
              <button className="magic-button" onClick={enableCamera}>
                Try again
              </button>
            </>
          )}
          {cam === "error" && (
            <>
              <p className="hud-line">Hand tracking could not start.</p>
              <button className="magic-button" onClick={enableCamera}>
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
