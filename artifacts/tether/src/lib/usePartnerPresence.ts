import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

type PresenceResult = {
  isOnline:   boolean;        // partner is in the app right now
  minutesAgo: number | null;  // null = never seen this session/device
};

/**
 * Uses Supabase Realtime Presence — no SQL migration needed.
 * Each device independently tracks when it last observed the partner
 * in the presence channel and persists that in localStorage.
 */
export function usePartnerPresence(
  tetherId:  string | null,
  profileId: string | null,
  partnerId: string | null,
): PresenceResult {
  const [isOnline,  setIsOnline]  = useState(false);
  const [lastSeen,  setLastSeen]  = useState<Date | null>(null);
  const [tick,      setTick]      = useState(0); // drives minutesAgo recalc

  // Load persisted last-seen from localStorage on mount
  useEffect(() => {
    if (!partnerId) return;
    const stored = localStorage.getItem(`tether_ls_${partnerId}`);
    if (stored) setLastSeen(new Date(stored));
  }, [partnerId]);

  // Recalculate "minutes ago" every 30 s so the label stays accurate
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Supabase Presence subscription
  useEffect(() => {
    if (!tetherId || !profileId || !partnerId) return;

    const channel = supabase.channel(`presence-${tetherId}`, {
      config: { presence: { key: profileId } },
    });

    function syncState() {
      const state = channel.presenceState<{ id: string }>();
      const online = Object.values(state).flat().some(p => p.id === partnerId);
      setIsOnline(online);
      if (online) {
        const now = new Date();
        setLastSeen(now);
        localStorage.setItem(`tether_ls_${partnerId}`, now.toISOString());
      }
    }

    channel
      .on("presence", { event: "sync" },  syncState)
      .on("presence", { event: "join" },  syncState)
      .on("presence", { event: "leave" }, syncState)
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: profileId });
        }
      });

    // Re-track when the tab regains focus (handles phone wake / tab switch)
    const onVisible = () => {
      if (!document.hidden) channel.track({ id: profileId });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tetherId, profileId, partnerId]);

  const minutesAgo = lastSeen
    ? Math.floor((Date.now() - lastSeen.getTime()) / 60_000)
    : null;

  // silence the tick dep — only used to force re-render
  void tick;

  return { isOnline, minutesAgo };
}
