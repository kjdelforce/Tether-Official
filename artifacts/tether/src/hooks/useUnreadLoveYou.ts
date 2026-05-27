import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

interface LoveMessageRow {
  id: string;
  sender_id: string;
  read_at: string | null;
}

/**
 * useUnreadLoveYou — detect & dismiss unread Love-You messages.
 *
 * Polls once on mount + opens a Supabase realtime subscription so
 * a Love-You sent while the receiver is on the Home screen also
 * triggers the overlay.  Returns the most recent unread message id
 * (or null) plus a `dismiss()` callback that marks every unread
 * message from the partner as read.
 *
 * Lives in its own hook so the overlay/page stays declarative and
 * the data-access logic is testable in isolation.
 */
export function useUnreadLoveYou(opts: {
  tetherId: string | null | undefined;
  partnerId: string | null | undefined;
}) {
  const { tetherId, partnerId } = opts;
  const [unreadId, setUnreadId] = useState<string | null>(null);

  // Initial check + realtime subscription.
  useEffect(() => {
    if (!tetherId || !partnerId) return;

    let cancelled = false;

    async function check() {
      const { data } = await supabase
        .from("love_messages")
        .select("id")
        .eq("tether_id", tetherId)
        .eq("sender_id", partnerId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) setUnreadId(data[0].id);
    }
    check();

    // Realtime: fire if a new unread Love-You arrives while the
    // user is already on the page.
    const channel = supabase
      .channel(`love-unread-${tetherId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "love_messages",
          filter: `tether_id=eq.${tetherId}`,
        },
        (payload: RealtimePostgresInsertPayload<LoveMessageRow>) => {
          const row = payload.new;
          if (row.sender_id === partnerId && !row.read_at) {
            setUnreadId(row.id);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tetherId, partnerId]);

  // Mark every unread message from the partner as read.  Clears
  // local state immediately so the overlay closes optimistically.
  const dismiss = useCallback(async () => {
    if (!tetherId || !partnerId) return;
    setUnreadId(null);
    await supabase
      .from("love_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("tether_id",  tetherId)
      .eq("sender_id",  partnerId)
      .is("read_at", null);
  }, [tetherId, partnerId]);

  return { unreadId, dismiss };
}
