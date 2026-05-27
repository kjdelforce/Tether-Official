/**
 * Avatar3D — Robust hybrid animation system for RPM GLB avatars.
 *
 * FBX layer   Mixamo clips loaded via FBXLoader, retargeted to RPM bone names,
 *             played on a per-avatar THREE.AnimationMixer.  On every vibe change
 *             the clip is validated (must have > 0 tracks after retargeting) and
 *             faded in smoothly.  If a clip fails or has no usable tracks the
 *             system falls through to the bone-math layer automatically.
 *
 * Math layer  Procedural bone rotations as safe idle / fallback for vibes with
 *             no FBX or when FBX load fails.  Always runs when FBX weight < 0.05.
 *
 * Transition  Old action fadeOut + new action fadeIn run concurrently inside the
 *             same mixer so Three.js handles the blend automatically.  A
 *             generation counter prevents stale async callbacks from interfering
 *             when the user switches vibes rapidly.
 */
import React, { useRef, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, PerspectiveCamera } from "@react-three/drei";
import { FBXLoader } from "three-stdlib";
import * as THREE from "three";
import { AnimatePresence, motion } from "framer-motion";
import { VIBES } from "@/components/VibeCheckSection";
import { MoodFX } from "@/components/FullBodyAvatar";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_HEIGHT = 1.48;   // world-units — keeps raised-arm poses in frame
const CROSSFADE_S   = 0.5;    // bone-math state cross-fade
const FBX_FADE_S    = 0.35;   // FBX action fade-in / fade-out
const FBX_WEIGHT_THRESHOLD = 0.05; // below this → bone-math takes over

// ── Vibe → FBX file ────────────────────────────────────────────────────────────
const VIBE_TO_FBX: Record<string, string> = {
  wonderful:    "/animations/DancingTwerk.fbx",
  happy:        "/animations/GangnamStyle.fbx",
  content:      "/animations/Walking3.fbx",
  cozy:         "/animations/HappyIdle.fbx",
  excited:      "/animations/SillyDancing.fbx",
  brave:        "/animations/Flying.fbx",
  romantic:     "/animations/BlowKiss.fbx",
  horny:        "/animations/CatwalkWalk.fbx",
  drunk:        "/animations/DrunkWalk3.fbx",
  high:         "/animations/DrunkWalk.fbx",
  nervous:      "/animations/NervousLook.fbx",
  anxious:      "/animations/NervousLook.fbx",
  scared:       "/animations/Terrified.fbx",
  sad:          "/animations/Crying4.fbx",
  tired:        "/animations/Yawn.fbx",
  sleepy:       "/animations/Yawn.fbx",
  exhausted:    "/animations/WipingSweat.fbx",
  angry:        "/animations/Angry2.fbx",
  "pissed-off": "/animations/AngryGesture.fbx",
  hangry:       "/animations/Angry2.fbx",
  sore:         "/animations/Injured.fbx",
  sick:         "/animations/DizzyIdle3.fbx",
  hungover:     "/animations/Falling.fbx",
  hungry:       "/animations/StandingReactDeathForward.fbx",
};

// ── Vibes that play ONCE and hold the final frame (not looped) ─────────────────
const VIBE_LOOP_ONCE = new Set(["hungover", "hungry"]);

// ── Per-vibe time-scale ────────────────────────────────────────────────────────
const VIBE_TIME_SCALE: Record<string, number> = {
  wonderful:    0.85,  // DancingTwerk — keep the energy but not too fast
  happy:        0.68,
  content:      0.72,
  cozy:         0.60,
  excited:      0.68,
  brave:        0.62,
  romantic:     0.65,
  horny:        0.70,
  drunk:        0.70,  // DrunkWalk3
  high:         0.65,
  nervous:      0.75,
  anxious:      0.70,
  scared:       0.72,
  sad:          0.55,  // Crying4
  tired:        0.50,
  sleepy:       0.45,
  exhausted:    0.65,
  angry:        0.72,
  "pissed-off": 0.72,
  hangry:       0.75,
  sore:         0.60,
  sick:         0.65,  // DizzyIdle3
  hungover:     0.80,  // Falling — plays once, natural fall speed
  hungry:       0.75,  // StandingReactDeathForward — plays once, hold final frame
};

// ── Retargeting ────────────────────────────────────────────────────────────────
// Handles every bone-name format Mixamo / re-exporters produce:
//   mixamorig:BoneName.quaternion   (Mixamo "FBX for Unity" export)
//   mixamorigBoneName.quaternion    (older Mixamo FBX export)
//   Armature|mixamorig:Hips.quaternion  (Blender re-export with object path)
//   BoneName.quaternion             (already stripped re-exports)
const MIXAMO_RE = /^(?:.*\|)?mixamorig[: _]?/i;

function retargetClip(raw: THREE.AnimationClip, label: string): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];

  for (const track of raw.tracks) {
    // Property separator is always the LAST dot (handles bone names with dots)
    const dot = track.name.lastIndexOf(".");
    if (dot === -1) continue;
    const nodePart = track.name.slice(0, dot);
    const prop     = track.name.slice(dot);          // e.g. ".quaternion"

    // Strip object-path prefix and mixamorig prefix in one pass
    const boneName = nodePart.replace(MIXAMO_RE, "");
    if (!boneName) continue;

    // Never carry root-position tracks — they drift the avatar off-screen
    if (boneName === "Hips" && prop === ".position") continue;

    const t = track.clone();
    t.name  = boneName + prop;
    tracks.push(t);
  }

  if (tracks.length === 0) {
    // Log raw track samples so future debugging is easy
    const samples = raw.tracks.slice(0, 4).map(t => t.name).join(", ");
    console.warn(`[Avatar3D] "${label}" retargeted to 0 tracks → idle fallback. Sample tracks: ${samples}`);
    return null;
  }

  console.log(`[Avatar3D] "${label}" OK — ${tracks.length} tracks (sample: ${tracks[0].name})`);
  const clip = new THREE.AnimationClip(raw.name, raw.duration, tracks);
  clip.optimize();
  return clip;
}

// ── Global FBX cache ───────────────────────────────────────────────────────────
// Promise resolves to the retargeted clip (or null = unusable).
// Keyed by URL so each file is fetched and retargeted exactly once.
const fbxCache = new Map<string, Promise<THREE.AnimationClip | null>>();

function loadFbxClip(url: string): Promise<THREE.AnimationClip | null> {
  if (!fbxCache.has(url)) {
    fbxCache.set(url, (async () => {
      try {
        const loader = new FBXLoader();
        const fbx    = await new Promise<THREE.Group>((res, rej) =>
          loader.load(url, res as (g: THREE.Group) => void, undefined, rej)
        );
        if (!fbx.animations?.length) {
          console.warn(`[Avatar3D] ${url}: no animations in file`);
          return null;
        }
        const label = url.split("/").pop() ?? url;
        return retargetClip(fbx.animations[0], label);
      } catch (e) {
        console.warn(`[Avatar3D] failed to load ${url}:`, e);
        return null;
      }
    })());
  }
  return fbxCache.get(url)!;
}

// Pre-warm all clips the moment this module loads
[...new Set(Object.values(VIBE_TO_FBX))].forEach(url => loadFbxClip(url));

// ── Bone-math types ────────────────────────────────────────────────────────────
interface BoneDelta { x?: number; y?: number; z?: number }
interface MoodFrame {
  hipsY?: number; hipsRot?: BoneDelta;
  spine?: BoneDelta; spine1?: BoneDelta; spine2?: BoneDelta;
  neck?: BoneDelta; head?: BoneDelta;
  leftArm?: BoneDelta; rightArm?: BoneDelta;
  leftForeArm?: BoneDelta; rightForeArm?: BoneDelta;
  leftUpLeg?: BoneDelta; rightUpLeg?: BoneDelta;
  leftLeg?: BoneDelta; rightLeg?: BoneDelta;
  lerpSpeed?: number;
}
type MoodFn = (t: number, lookDir?: number) => MoodFrame;

// ── Clamping ───────────────────────────────────────────────────────────────────
const CLAMPS: Record<string, Partial<Record<"x"|"y"|"z", [number,number]>>> = {
  LeftArm:      { z: [-1.05, 0.65], x: [-0.5, 0.5] },
  RightArm:     { z: [-0.65, 1.05], x: [-0.5, 0.5] },
  LeftForeArm:  { x: [-2.2, 0.08] },
  RightForeArm: { x: [-2.2, 0.08] },
  Head:         { x: [-0.45, 0.32], z: [-0.48, 0.48] },
  Neck:         { x: [-0.32, 0.22] },
  Spine:        { x: [-0.38, 0.28] },
  Spine1:       { x: [-0.30, 0.22] },
  Spine2:       { x: [-0.22, 0.16] },
  LeftUpLeg:    { x: [-0.48, 0.9],  z: [-0.28, 0.28] },
  RightUpLeg:   { x: [-0.48, 0.9],  z: [-0.28, 0.28] },
  LeftLeg:      { x: [-2.3,  0.04] },
  RightLeg:     { x: [-2.3,  0.04] },
};
const clamp = (bone: string, ax: "x"|"y"|"z", v: number) => {
  const lim = CLAMPS[bone]?.[ax];
  return lim ? Math.max(lim[0], Math.min(lim[1], v)) : v;
};

// ── Frame helpers ──────────────────────────────────────────────────────────────
function blendBone(a?: BoneDelta, b?: BoneDelta, α = 1): BoneDelta | undefined {
  if (!a && !b) return undefined;
  const out: BoneDelta = {};
  for (const ax of ["x","y","z"] as const) {
    const av = a?.[ax], bv = b?.[ax];
    if (av !== undefined || bv !== undefined)
      out[ax] = (av ?? 0) + ((bv ?? 0) - (av ?? 0)) * α;
  }
  return out;
}
function blendFrames(a: MoodFrame, b: MoodFrame, α: number): MoodFrame {
  const n = (av?: number, bv?: number) =>
    av === undefined && bv === undefined ? undefined : (av ?? 0) + ((bv ?? 0) - (av ?? 0)) * α;
  return {
    hipsY: n(a.hipsY, b.hipsY),
    hipsRot:      blendBone(a.hipsRot,      b.hipsRot,      α),
    spine:        blendBone(a.spine,        b.spine,        α),
    spine1:       blendBone(a.spine1,       b.spine1,       α),
    spine2:       blendBone(a.spine2,       b.spine2,       α),
    neck:         blendBone(a.neck,         b.neck,         α),
    head:         blendBone(a.head,         b.head,         α),
    leftArm:      blendBone(a.leftArm,      b.leftArm,      α),
    rightArm:     blendBone(a.rightArm,     b.rightArm,     α),
    leftForeArm:  blendBone(a.leftForeArm,  b.leftForeArm,  α),
    rightForeArm: blendBone(a.rightForeArm, b.rightForeArm, α),
    leftUpLeg:    blendBone(a.leftUpLeg,    b.leftUpLeg,    α),
    rightUpLeg:   blendBone(a.rightUpLeg,   b.rightUpLeg,   α),
    leftLeg:      blendBone(a.leftLeg,      b.leftLeg,      α),
    rightLeg:     blendBone(a.rightLeg,     b.rightLeg,     α),
    lerpSpeed:    n(a.lerpSpeed, b.lerpSpeed),
  };
}

// ── Bone-math mood functions ───────────────────────────────────────────────────
const MOODS: Record<string, MoodFn> = {
  default: (t) => ({
    hipsY:    Math.sin(t * 0.72) * 0.006,
    spine:    { x: Math.sin(t * 0.72) * 0.022 },
    spine1:   { x: Math.sin(t * 0.72) * 0.014 },
    neck:     { z: Math.sin(t * 0.31) * 0.018 },
    head:     { z: Math.sin(t * 0.31) * 0.055 + Math.sin(t * 0.19) * 0.025, x: Math.sin(t * 0.44) * 0.035 },
    leftArm:  { z:  0.025 + Math.sin(t * 0.72) * 0.018 },
    rightArm: { z: -0.025 + Math.sin(t * 0.72) * 0.018 },
    lerpSpeed: 0.04,
  }),
  calm: (t) => ({
    hipsY: Math.sin(t * 0.52) * 0.006,
    spine: { x: Math.sin(t * 0.52) * 0.013 },
    head:  { z: Math.sin(t * 0.40) * 0.033 },
    lerpSpeed: 0.03,
  }),
  romanticMath: (t, lookDir = 0) => ({
    hipsY:    Math.sin(t * 1.2) * 0.007,
    spine:    { z: lookDir * 0.038, x: Math.sin(t * 1.2) * 0.015 },
    spine1:   { z: lookDir * 0.028 },
    neck:     { z: lookDir * 0.045 },
    head:     { z: lookDir * 0.11 + Math.sin(t * 1.2) * 0.028 },
    leftArm:  { z:  0.055, x: Math.sin(t * 1.2) * 0.045 },
    rightArm: { z: -0.055, x: Math.sin(t * 1.2) * 0.045 },
    lerpSpeed: 0.04,
  }),
  high: (t) => ({
    hipsY:    Math.sin(t * 1.3) * 0.017,
    hipsRot:  { y: Math.sin(t * 0.9) * 0.055, z: Math.sin(t * 1.1) * 0.085 },
    spine:    { z: Math.sin(t * 1.2) * 0.10 },
    spine1:   { z: Math.sin(t * 1.0) * 0.075 },
    neck:     { z: Math.sin(t * 1.4) * 0.055 },
    head:     { z: Math.sin(t * 1.6) * 0.13, x: -0.04 },
    leftArm:  { z:  0.11 + Math.sin(t * 1.1) * 0.07 },
    rightArm: { z: -0.11 + Math.sin(t * 1.3) * 0.07 },
    lerpSpeed: 0.04,
  }),
  hungry: (t) => ({
    hipsY:    Math.sin(t * 2.2) * 0.009,
    hipsRot:  { y: Math.sin(t * 2.2) * 0.045 },
    spine:    { z: Math.sin(t * 2.2) * 0.038 },
    head:     { z: Math.sin(t * 2.2) * 0.055 },
    lerpSpeed: 0.08,
  }),
};

// ── AvatarModel (inside R3F Canvas) ───────────────────────────────────────────
interface ModelProps { url: string; vibeId: string | null; lookDir: number; faceDir: number; }

function AvatarModel({ url, vibeId, lookDir, faceDir }: ModelProps) {
  const { scene, animations } = useGLTF(url);
  const { mixer: eyeMixer }   = useAnimations(animations, scene);

  // ── Auto-scale + inward rotation ─────────────────────────────────────────
  const groupRef   = useRef<THREE.Group>(null);
  const scaleReady = useRef(false);
  useEffect(() => {
    if (scaleReady.current || !groupRef.current) return;
    scene.updateMatrixWorld(true);
    const box  = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y < 0.01) return;
    const s = TARGET_HEIGHT / size.y;
    groupRef.current.scale.setScalar(s);
    groupRef.current.position.y = -box.min.y * s;
    groupRef.current.rotation.y = faceDir * (Math.PI / 12);
    scaleReady.current = true;
  }, [scene, faceDir]);

  // ── Bone map + rest-pose snapshot ────────────────────────────────────────
  const bones = useMemo(() => {
    const map: Record<string, THREE.Bone> = {};
    scene.traverse(o => { if ((o as THREE.Bone).isBone) map[o.name] = o as THREE.Bone; });
    return map;
  }, [scene]);

  const rest      = useRef<Record<string, { x:number; y:number; z:number; posY?:number }>>({});
  const restReady = useRef(false);
  useEffect(() => {
    if (restReady.current || !Object.keys(bones).length) return;
    for (const [n, b] of Object.entries(bones))
      rest.current[n] = { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z };
    const hips = bones["Hips"];
    if (hips) rest.current["Hips"].posY = hips.position.y;
    restReady.current = true;
  }, [bones]);

  // ── Eye blink clips ───────────────────────────────────────────────────────
  useEffect(() => {
    ["idle_eyes", "idle_eyes_2"].forEach(name => {
      const clip = animations.find(a => a.name === name);
      if (clip) eyeMixer.clipAction(clip).play();
    });
    return () => { eyeMixer.stopAllAction(); };
  }, [eyeMixer, animations]);

  // ── FBX mixer ─────────────────────────────────────────────────────────────
  const fbxMixer  = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const fbxAction = useRef<THREE.AnimationAction | null>(null);
  // Generation counter: incremented on every vibe change so stale async
  // callbacks from a previous vibe never activate on the new one.
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const url  = VIBE_TO_FBX[vibeId ?? ""];

    // ── Going to a bone-math vibe ──────────────────────────────────────────
    if (!url) {
      const old = fbxAction.current;
      if (old) {
        old.fadeOut(FBX_FADE_S);
        setTimeout(() => {
          if (generation.current !== gen) return; // superseded
          fbxMixer.stopAllAction();
          fbxAction.current = null;
        }, (FBX_FADE_S + 0.1) * 1000);
      }
      return;
    }

    // ── Going to an FBX vibe ───────────────────────────────────────────────
    loadFbxClip(url).then(clip => {
      if (generation.current !== gen) return; // user already changed vibe

      if (!clip) {
        // Retargeting failed or no tracks — fall back to bone-math idle
        const old = fbxAction.current;
        if (old) {
          old.fadeOut(FBX_FADE_S);
          setTimeout(() => {
            if (generation.current !== gen) return;
            fbxMixer.stopAllAction();
            fbxAction.current = null;
          }, (FBX_FADE_S + 0.1) * 1000);
        } else {
          fbxAction.current = null;
        }
        return;
      }

      const loopOnce = VIBE_LOOP_ONCE.has(vibeId ?? "");
      const newAct = fbxMixer.clipAction(clip);
      newAct.loop              = loopOnce ? THREE.LoopOnce : THREE.LoopRepeat;
      newAct.clampWhenFinished = loopOnce;  // hold final frame instead of snapping to T-pose
      newAct.timeScale         = VIBE_TIME_SCALE[vibeId ?? ""] ?? 0.75;

      const old = fbxAction.current;
      if (old && old !== newAct) {
        // Concurrent fade: old out, new in — mixer blends them automatically
        old.fadeOut(FBX_FADE_S);
        newAct.reset().fadeIn(FBX_FADE_S).play();
      } else if (!old || old === newAct) {
        // Cold start or same clip selected again
        newAct.reset().fadeIn(FBX_FADE_S).play();
      }

      fbxAction.current = newAct;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibeId, fbxMixer]);

  // ── Bone-math cross-fade state ────────────────────────────────────────────
  const clock        = useRef(0);
  const fromVibe     = useRef<string | null>(null);
  const vibeChangeAt = useRef(-CROSSFADE_S);
  const mathPrev     = useRef<string | null>(null);
  useEffect(() => {
    if (vibeId !== mathPrev.current) {
      fromVibe.current     = mathPrev.current;
      vibeChangeAt.current = clock.current;
      mathPrev.current     = vibeId;
    }
  }, [vibeId]);

  // ── Per-frame ─────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    eyeMixer.update(delta);
    clock.current += delta;

    // Always advance the FBX mixer if there's an active action
    const act = fbxAction.current;
    if (act !== null) {
      fbxMixer.update(delta);
      // FBX is primary driver while its weight is significant
      if (act.getEffectiveWeight() > FBX_WEIGHT_THRESHOLD) return;
    }

    // Bone-math: safe idle + fallback for failed/transitioning FBX clips
    if (!restReady.current) return;
    const t = clock.current;
    const α = Math.min((t - vibeChangeAt.current) / CROSSFADE_S, 1.0);

    const toKey   = vibeId === "romantic" ? "romanticMath" : (vibeId ?? "");
    const fromKey = fromVibe.current === "romantic" ? "romanticMath" : (fromVibe.current ?? "");
    const toFn    = MOODS[toKey]   ?? MOODS.default;
    const fromFn  = MOODS[fromKey] ?? MOODS.default;
    const frame   = α >= 1 ? toFn(t, lookDir) : blendFrames(fromFn(t, lookDir), toFn(t, lookDir), α);

    const speed = frame.lerpSpeed ?? 0.07;
    const L     = THREE.MathUtils.lerp;

    const applyBone = (name: string, d: BoneDelta) => {
      const bone = bones[name], r = rest.current[name];
      if (!bone || !r) return;
      if (d.x !== undefined) bone.rotation.x = L(bone.rotation.x, r.x + clamp(name,"x",d.x), speed);
      if (d.y !== undefined) bone.rotation.y = L(bone.rotation.y, r.y + clamp(name,"y",d.y), speed);
      if (d.z !== undefined) bone.rotation.z = L(bone.rotation.z, r.z + clamp(name,"z",d.z), speed);
    };

    const hips = bones["Hips"], rh = rest.current["Hips"];
    if (hips && rh) {
      if (rh.posY !== undefined && frame.hipsY !== undefined)
        hips.position.y = L(hips.position.y, rh.posY + frame.hipsY, speed);
      if (frame.hipsRot) {
        const hr = frame.hipsRot;
        if (hr.x !== undefined) hips.rotation.x = L(hips.rotation.x, rh.x + clamp("Hips","x",hr.x), speed);
        if (hr.y !== undefined) hips.rotation.y = L(hips.rotation.y, rh.y + clamp("Hips","y",hr.y), speed);
        if (hr.z !== undefined) hips.rotation.z = L(hips.rotation.z, rh.z + clamp("Hips","z",hr.z), speed);
      }
    }
    if (frame.spine)        applyBone("Spine",        frame.spine);
    if (frame.spine1)       applyBone("Spine1",       frame.spine1);
    if (frame.spine2)       applyBone("Spine2",       frame.spine2);
    if (frame.neck)         applyBone("Neck",         frame.neck);
    if (frame.head)         applyBone("Head",         frame.head);
    if (frame.leftArm)      applyBone("LeftArm",      frame.leftArm);
    if (frame.rightArm)     applyBone("RightArm",     frame.rightArm);
    if (frame.leftForeArm)  applyBone("LeftForeArm",  frame.leftForeArm);
    if (frame.rightForeArm) applyBone("RightForeArm", frame.rightForeArm);
    if (frame.leftUpLeg)    applyBone("LeftUpLeg",    frame.leftUpLeg);
    if (frame.rightUpLeg)   applyBone("RightUpLeg",   frame.rightUpLeg);
    if (frame.leftLeg)      applyBone("LeftLeg",      frame.leftLeg);
    if (frame.rightLeg)     applyBone("RightLeg",     frame.rightLeg);
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.22, 40]} />
        <meshBasicMaterial color="#000010" transparent opacity={0.42} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Public wrapper ─────────────────────────────────────────────────────────────
interface Props {
  url: string; vibeId: string | null; partnerVibeId?: string | null;
  name: string; height?: number; align?: "left" | "right";
}

export function Avatar3D({ url, vibeId, partnerVibeId = null, name, height = 240, align = "left" }: Props) {
  const vibe  = VIBES.find(v => v.id === vibeId) ?? null;
  const glow  = vibe?.glow ?? "rgba(255,255,255,0.16)";
  const width = Math.round(height * 0.54);

  const bothRomantic = vibeId === "romantic" && partnerVibeId === "romantic";
  const lookDir      = bothRomantic ? (align === "left" ? 1 : -1) : 0;
  const faceDir      = align === "left" ? 1 : -1;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width, height, overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          <MoodFX key={`fx-${vibeId}`} id={vibeId} h={height} />
        </AnimatePresence>

        <Canvas
          gl={{ alpha: true, antialias: true }}
          style={{ width: "100%", height: "100%", display: "block" }}
          onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}
        >
          <PerspectiveCamera
            makeDefault position={[0, 0.84, 3.4]} fov={28} near={0.1} far={20}
            onUpdate={self => self.lookAt(0, 0.84, 0)}
          />
          <hemisphereLight args={["#253570", "#080a14", 1.1]} />
          <directionalLight position={[0.5, 3.2, 2.8]} intensity={2.2} color="#ffffff" />
          <pointLight position={[0, 1.4, -1.6]} intensity={3.5} color="#5b3fe8" distance={4.5} decay={2} />
          <directionalLight position={[2.0, 0.8, 1.8]} intensity={0.5} color="#ffd8b0" />

          <Suspense fallback={null}>
            <AvatarModel url={url} vibeId={vibeId} lookDir={lookDir} faceDir={faceDir} />
          </Suspense>
        </Canvas>

        {/* Glow pedestal */}
        <motion.div
          animate={{ opacity: [0.40, 0.78, 0.40], scaleX: [1, 1.22, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
            width: "82%", height: 24,
            background: `radial-gradient(ellipse at center, ${glow} 0%, transparent 70%)`,
            filter: "blur(7px)", pointerEvents: "none", zIndex: -1,
          }}
        />
        <motion.div
          animate={{ opacity: [0.10, 0.28, 0.10] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: "-18% -26%",
            background: `radial-gradient(ellipse at 50% 58%, ${glow} 0%, transparent 62%)`,
            pointerEvents: "none", zIndex: -2,
          }}
        />
      </div>

      <span style={{
        fontFamily: "'Quicksand', sans-serif", fontSize: "0.72rem",
        fontWeight: 600, color: "rgba(255,255,255,0.55)",
        letterSpacing: "0.08em", textTransform: "uppercase", pointerEvents: "none",
      }}>
        {name}
      </span>
    </div>
  );
}

export function preloadAvatar(url: string) { useGLTF.preload(url); }
