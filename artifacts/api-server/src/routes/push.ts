import { Router, type IRouter, type Request, type Response } from "express";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const router: IRouter = Router();

// ── VAPID setup ────────────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY  = process.env["VAPID_PUBLIC_KEY"]  ?? "";
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_EMAIL       = process.env["VAPID_EMAIL"]       ?? "mailto:hello@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ── Supabase admin client (service role key) ───────────────────────────────
// We use the service role key so we can read push_subscriptions for any user
// without being bound by Row Level Security.
const SUPABASE_URL          = process.env["SUPABASE_URL"]          ?? process.env["VITE_SUPABASE_URL"]          ?? "";
const SUPABASE_SERVICE_KEY  = process.env["SUPABASE_SERVICE_KEY"]  ?? process.env["VITE_SUPABASE_ANON_KEY"]     ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helper: send a push to every subscription belonging to the partner ─────
async function notifyPartner(
  tetherId: string,
  senderId: string,
  payload: { title: string; body: string; tag: string },
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys not configured — skipping push");
    return;
  }

  // Fetch all push subscriptions for this tether EXCEPT the sender's own.
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("tether_id", tetherId)
    .neq("user_id", senderId);

  if (error) {
    console.error("[push] Failed to fetch subscriptions:", error.message);
    return;
  }

  if (!data || data.length === 0) return;

  const message = JSON.stringify(payload);

  await Promise.allSettled(
    data.map(async (row: { subscription: webpush.PushSubscription }) => {
      try {
        await webpush.sendNotification(row.subscription, message);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription expired — remove it
        if (status === 404 || status === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("subscription->>endpoint", row.subscription.endpoint);
        } else {
          console.warn("[push] sendNotification error:", err);
        }
      }
    }),
  );
}

// ── POST /api/push/subscribe ───────────────────────────────────────────────
// Saves (or updates) a web-push subscription for a user.
router.post("/push/subscribe", async (req: Request, res: Response) => {
  const { userId, tetherId, subscription } = req.body as {
    userId: string;
    tetherId: string;
    subscription: webpush.PushSubscription;
  };

  if (!userId || !tetherId || !subscription?.endpoint) {
    res.status(400).json({ error: "Missing userId, tetherId, or subscription" });
    return;
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      tether_id: tetherId,
      subscription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[push] upsert error:", error.message);
    res.status(500).json({ error: "Failed to save subscription" });
    return;
  }

  res.json({ ok: true });
});

// ── POST /api/push/love ────────────────────────────────────────────────────
router.post("/push/love", async (req: Request, res: Response) => {
  const { tetherId, senderId, senderName } = req.body as {
    tetherId: string;
    senderId: string;
    senderName?: string;
  };

  if (!tetherId || !senderId) {
    res.status(400).json({ error: "Missing tetherId or senderId" });
    return;
  }

  const from = senderName ?? "Your partner";
  await notifyPartner(tetherId, senderId, {
    title: `${from} sent you love`,
    body:  "Open Tether to feel it.",
    tag:   "love",
  });

  res.json({ ok: true });
});

// ── POST /api/push/whisper ─────────────────────────────────────────────────
router.post("/push/whisper", async (req: Request, res: Response) => {
  const { tetherId, senderId, senderName } = req.body as {
    tetherId: string;
    senderId: string;
    senderName?: string;
  };

  if (!tetherId || !senderId) {
    res.status(400).json({ error: "Missing tetherId or senderId" });
    return;
  }

  const from = senderName ?? "Your partner";
  await notifyPartner(tetherId, senderId, {
    title: `${from} sent you a Ghost Whisper`,
    body:  "Open Tether — it disappears in 5 seconds.",
    tag:   "whisper",
  });

  res.json({ ok: true });
});

// ── POST /api/push/trivia ──────────────────────────────────────────────────
router.post("/push/trivia", async (req: Request, res: Response) => {
  const { tetherId, senderId, senderName } = req.body as {
    tetherId: string;
    senderId: string;
    senderName?: string;
  };

  if (!tetherId || !senderId) {
    res.status(400).json({ error: "Missing tetherId or senderId" });
    return;
  }

  const from = senderName ?? "Your partner";
  await notifyPartner(tetherId, senderId, {
    title: "Your turn in Trivia",
    body:  `${from} just answered — now it's your go.`,
    tag:   "trivia",
  });

  res.json({ ok: true });
});

// ── POST /api/push/daily-connection ───────────────────────────────────────
router.post("/push/daily-connection", async (req: Request, res: Response) => {
  const { tetherId, senderId, senderName } = req.body as {
    tetherId: string;
    senderId: string;
    senderName?: string;
  };

  if (!tetherId || !senderId) {
    res.status(400).json({ error: "Missing tetherId or senderId" });
    return;
  }

  const from = senderName ?? "Your partner";
  await notifyPartner(tetherId, senderId, {
    title: `${from} answered today's question`,
    body:  "Open Tether to see their answer and share yours.",
    tag:   "daily-connection",
  });

  res.json({ ok: true });
});

export default router;
