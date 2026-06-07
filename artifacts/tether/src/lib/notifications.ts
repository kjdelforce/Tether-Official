const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) ?? '';

function getApiUrl(): string {
  // The API server artifact is proxied at /api on the same domain.
  // Since all fetch calls already include /api/ in their paths, we just
  // need the origin — no extra path suffix.
  return window.location.origin;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const swUrl = `${base}sw.js`;
    await navigator.serviceWorker.register(swUrl, { scope: base });
    // Wait for the SW to be fully active — critical after re-adding the PWA
    // to the home screen, where the new context starts with no active SW.
    // navigator.serviceWorker.ready resolves only once a SW is controlling the page.
    const reg = await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('[Tether] Service worker registration failed:', e);
    return null;
  }
}

/**
 * Request notification permission.
 * MUST be called from a direct user-gesture handler on iOS (tap/click).
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  // On iOS 16.4+ the permission prompt must fire synchronously inside a
  // user-gesture handler. Awaiting it here is fine as long as the caller
  // is invoked from an onClick / onTouchEnd handler.
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function setupPushNotifications(
  registration: ServiceWorkerRegistration,
  userId: string,
  tetherId: string,
): Promise<void> {
  if (!('PushManager' in window) || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== 'granted') return;

  try {
    // Always unsubscribe stale subscriptions first so that a re-added PWA
    // gets a fresh endpoint. iOS can return an expired subscription from
    // getSubscription() after the app is removed and re-added to the home screen.
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      try { await existing.unsubscribe(); } catch { /* ignore */ }
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const apiUrl = getApiUrl();
    const resp = await fetch(`${apiUrl}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tetherId, subscription }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[Tether] Push registration failed:', resp.status, text);
    }
  } catch (e) {
    console.warn('[Tether] Push subscription failed:', e);
  }
}

async function sendPushEvent(
  endpoint: string,
  tetherId: string,
  senderId: string,
  senderName?: string,
): Promise<void> {
  try {
    const apiUrl = getApiUrl();
    const body: Record<string, string> = { tetherId, senderId };
    if (senderName) body.senderName = senderName;
    await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn(`[Tether] Push (${endpoint}) failed:`, e);
  }
}

export async function sendLoveYouNotification(
  tetherId: string,
  senderId: string,
  senderName: string,
): Promise<void> {
  return sendPushEvent('/api/push/love', tetherId, senderId, senderName);
}

export async function sendWhisperNotification(
  tetherId: string,
  senderId: string,
  senderName?: string,
): Promise<void> {
  return sendPushEvent('/api/push/whisper', tetherId, senderId, senderName);
}

export async function sendTriviaNotification(
  tetherId: string,
  senderId: string,
  senderName?: string,
): Promise<void> {
  return sendPushEvent('/api/push/trivia', tetherId, senderId, senderName);
}

export async function sendDailyConnectionNotification(
  tetherId: string,
  senderId: string,
  senderName?: string,
): Promise<void> {
  return sendPushEvent('/api/push/daily-connection', tetherId, senderId, senderName);
}
