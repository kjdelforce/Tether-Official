/**
 * VisionOS-style audio SFX — synthesized entirely via Web Audio API.
 * No external dependencies, no CDN links, zero load time.
 * Master volume: 30% (all gain values are scaled by MASTER).
 */

const MASTER = 0.30;

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (_ctx.state === "suspended") void _ctx.resume();
  return _ctx;
}

function tone(
  c: AudioContext,
  freq: number,
  vol: number,
  dur: number,
  offset = 0,
  freqEnd?: number,
): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g);
  g.connect(c.destination);
  o.type = "sine";
  const t = c.currentTime + offset;
  const attack = Math.min(0.008, dur * 0.12);
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd !== undefined) {
    o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * MASTER, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/**
 * Soft glass clink — button / tap press.
 * High transient sine with a tiny sub thud for organic body.
 */
export function playTap(): void {
  const c = getCtx();
  tone(c, 2200, 0.52, 0.10);
  tone(c, 120,  0.22, 0.07);
}

/**
 * Two-note ascending chime — successful save action.
 * E6 → A6 for a satisfying, harmonious resolution.
 */
export function playSave(): void {
  const c = getCtx();
  tone(c, 1318, 0.52, 0.30, 0.00); // E6
  tone(c, 1760, 0.46, 0.34, 0.14); // A6 — follows 140 ms later
}

/**
 * Rising glass swell — modal / sheet opening.
 * Dual detuned oscillators (+18 Hz apart) give glassy resonance.
 */
export function playModalOpen(): void {
  const c = getCtx();
  tone(c, 580,  0.42, 0.22, 0, 1100);
  tone(c, 598,  0.18, 0.24, 0, 1118);
}

/**
 * Descending sigh — modal / sheet closing.
 * Single warm sweep downward, softer than open.
 */
export function playModalClose(): void {
  const c = getCtx();
  tone(c, 1050, 0.36, 0.20, 0, 680);
}
