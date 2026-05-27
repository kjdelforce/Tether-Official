/**
 * useGyroTilt — REMOVED.
 *
 * All device-orientation / gyro-tilt behaviour was intentionally
 * stripped from the app per the "hyper-realistic Liquid Glass" brief
 * — the new aesthetic is purely about static glass surfaces, rim
 * lighting and refraction, with no motion driven by the device.
 *
 * This file remains as a back-compat shim so existing import sites
 * (SpatialCard, SensorSyncIcon, etc.) continue to type-check and
 * compile.  Every export is a safe no-op:
 *
 *   useGyroTilt()            → does nothing
 *   useSensorPermission()    → always returns true (UI affordance hidden)
 *   isSensorPermissionGranted() → always returns true
 *   requestSensorPermission()  → resolves true without touching iOS APIs
 *   onSensorPermissionChange() → returns a no-op unsubscribe
 *
 * No DeviceOrientationEvent listeners, no permission prompts, no
 * --alpha / --beta / --gamma CSS variables are written.  The
 * spatial-card class in index.css has likewise been reduced to an
 * inert wrapper.
 */

export function useGyroTilt(): void {
  /* intentional no-op */
}

export function useSensorPermission(): boolean {
  return true;
}

export function isSensorPermissionGranted(): boolean {
  return true;
}

export async function requestSensorPermission(): Promise<boolean> {
  return true;
}

export function onSensorPermissionChange(
  _fn: (granted: boolean) => void,
): () => void {
  return () => {
    /* no-op unsubscribe */
  };
}
