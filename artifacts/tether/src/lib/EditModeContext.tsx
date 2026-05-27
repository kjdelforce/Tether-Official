// ════════════════════════════════════════════════════════════════
//  EditModeContext — Global Architect Mode (Kyle only)
//
//  • Loads all app_content rows from Supabase on mount.
//  • Subscribes to realtime so Nathan's device updates instantly.
//  • Kyle can toggle edit mode, edit any labelled text, and save.
//  • pendingEdits is a local delta; nothing touches the DB until save.
// ════════════════════════════════════════════════════════════════
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { supabase } from "./supabaseClient";
import { isKyle } from "./naughtyBox";

// ── Types ──────────────────────────────────────────────────────
interface EditModeContextValue {
  isEditMode: boolean;
  isKyleSession: boolean;
  content: Record<string, string>;    // live content from Supabase
  pendingEdits: Record<string, string>; // unsaved local changes
  /** Start / stop edit mode (Kyle only) */
  toggleEditMode: (profile: { full_name: string }) => void;
  /** Queue a text change without saving yet */
  setEdit: (key: string, value: string) => void;
  /** Flush pendingEdits → Supabase and exit edit mode. Returns an error on failure. */
  saveEdits: () => Promise<unknown>;
  /** Discard pending changes and exit edit mode */
  discardEdits: () => void;
  /** Resolve final display value: pending > loaded > fallback */
  getContent: (key: string, fallback: string) => string;
}

const EditModeContext = createContext<EditModeContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [content,      setContent]      = useState<Record<string, string>>({});
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [isEditMode,   setIsEditMode]   = useState(false);
  const [isKyleSession, setIsKyleSession] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load all app_content rows ────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_content").select("key,value");
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(r => { map[r.key] = r.value; });
        setContent(map);
      }
    })();
  }, []);

  // ── Realtime subscription — updates Nathan's device instantly ─
  useEffect(() => {
    const ch = supabase
      .channel("app_content_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_content" },
        (payload) => {
          const row = payload.new as { key: string; value: string } | undefined;
          if (!row?.key) return;
          setContent(prev => ({ ...prev, [row.key]: row.value }));
        },
      )
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Kyle gate ─────────────────────────────────────────────────
  const toggleEditMode = useCallback((profile: { full_name: string }) => {
    if (!isKyle(profile.full_name)) return; // hard block for Nathan
    setIsKyleSession(true);
    setIsEditMode(prev => {
      if (prev) setPendingEdits({}); // discard on close
      return !prev;
    });
  }, []);

  // ── Queue local edit ──────────────────────────────────────────
  const setEdit = useCallback((key: string, value: string) => {
    setPendingEdits(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Save all pending edits → Supabase ────────────────────────
  const saveEdits = useCallback(async () => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) {
      setIsEditMode(false);
      return;
    }

    const rows = entries.map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("app_content")
      .upsert(rows, { onConflict: "key" });

    if (!error) {
      // Merge into live content immediately (realtime will also fire)
      setContent(prev => {
        const next = { ...prev };
        entries.forEach(([k, v]) => { next[k] = v; });
        return next;
      });
      setPendingEdits({});
      setIsEditMode(false);
    }
    return error ?? undefined;
  }, [pendingEdits]);

  // ── Discard ───────────────────────────────────────────────────
  const discardEdits = useCallback(() => {
    setPendingEdits({});
    setIsEditMode(false);
  }, []);

  // ── Resolve display value ─────────────────────────────────────
  const getContent = useCallback((key: string, fallback: string) => {
    return pendingEdits[key] ?? content[key] ?? fallback;
  }, [pendingEdits, content]);

  return (
    <EditModeContext.Provider value={{
      isEditMode,
      isKyleSession,
      content,
      pendingEdits,
      toggleEditMode,
      setEdit,
      saveEdits,
      discardEdits,
      getContent,
    }}>
      {children}
    </EditModeContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────
export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error("useEditMode must be used within EditModeProvider");
  return ctx;
}
