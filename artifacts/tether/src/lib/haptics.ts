/**
 * Haptic feedback via Web Vibration API.
 * Works on Android Chrome; gracefully no-ops on iOS Safari (not supported).
 *
 * Pattern reference (navigator.vibrate):
 *   number        — single vibration of N ms
 *   number[]      — alternating [vibrate, pause, vibrate, pause …]
 */

export type HapticPattern =
  | "tap"          // 12 ms  — featherlight UI touch
  | "light"        // 18 ms  — subtle acknowledge
  | "medium"       // 32 ms  — standard button press
  | "heavy"        // 55 ms  — strong confirmation
  | "heartbeat"    // lub-dub — receiving a Love You
  | "celebration"  // escalating burst — sending Love You / correct answer
  | "envelope"     // soft-then-firm thud — envelope landing
  | "reveal"       // building drama — Couple's Corner curtain pull
  | "success"      // single solid — submit / save confirmed
  | "error";       // double strike — wrong answer / delete

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap:         12,
  light:       18,
  medium:      32,
  heavy:       55,
  heartbeat:   [60, 50, 60],                   // lub … dub
  celebration: [18, 28, 36, 28, 55, 28, 80],   // crescendo burst
  envelope:    [32, 38, 62],                    // soft land → firm settle
  reveal:      [70, 40, 70, 40, 130],           // two pulses → big finish
  success:     [80],                            // single definitive beat
  error:       [50, 40, 50],                    // double strike
};

export function haptic(pattern: HapticPattern = "light"): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(PATTERNS[pattern]);
}

/**
 * Repeats a haptic pattern on an interval.
 * Returns a cancel function — always call it in a cleanup / useEffect return.
 *
 * Example:
 *   const stop = hapticLoop("heartbeat", 1600);
 *   return () => stop();
 */
export function hapticLoop(
  pattern: HapticPattern,
  intervalMs: number,
): () => void {
  haptic(pattern);
  const id = setInterval(() => haptic(pattern), intervalMs);
  return () => clearInterval(id);
}
