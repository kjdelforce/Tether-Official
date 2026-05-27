/**
 * SensorSyncIcon — REMOVED.
 *
 * The visual indicator for the device-orientation permission flow no
 * longer has a purpose now that the app's gyro / tilt behaviour has
 * been stripped (see useGyroTilt.ts).  Render nothing so existing
 * call-sites (HomePage, ProfilePage, App's couple-name header) keep
 * compiling and laying out cleanly.
 */
export function SensorSyncIcon(_props: { size?: number }): null {
  return null;
}
