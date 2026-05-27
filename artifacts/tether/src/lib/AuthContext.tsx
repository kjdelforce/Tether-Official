import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase, Profile, Tether } from "./supabaseClient";

type AuthContextType = {
  profile: Profile | null;
  partnerProfile: Profile | null;
  tether: Tether | null;
  loading: boolean;
  login: (fullName: string, inviteCode: string) => Promise<{ error: string | null }>;
  logout: () => void;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<Profile | null>(null);
  const [tether, setTether] = useState<Tether | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem("tether_profile_id");
    if (storedId) {
      loadSession(storedId);
    } else {
      setLoading(false);
    }
  }, []);

  async function loadSession(profileId: string) {
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (error || !prof) {
      localStorage.removeItem("tether_profile_id");
      setLoading(false);
      return;
    }

    setProfile(prof);

    if (prof.tether_id) {
      await loadTetherAndPartner(prof);
    }

    setLoading(false);
  }

  async function loadTetherAndPartner(prof: Profile) {
    if (!prof.tether_id) return;

    const { data: tet } = await supabase
      .from("tethers")
      .select("*")
      .eq("id", prof.tether_id)
      .single();

    if (tet) setTether(tet);

    // Find the partner (another profile with the same tether_id, not self)
    const { data: partners } = await supabase
      .from("profiles")
      .select("*")
      .eq("tether_id", prof.tether_id)
      .neq("id", prof.id);

    if (partners && partners.length > 0) {
      // If somehow there are multiple candidates (data anomaly), prefer the one
      // whose name is a known partner name, otherwise fall back to the first.
      const known = ["kyle", "nathan"];
      const best = partners.find((p) =>
        known.includes(p.full_name?.trim().toLowerCase())
      ) ?? partners[0];
      setPartnerProfile(best);
    }
  }

  async function login(fullName: string, inviteCode: string): Promise<{ error: string | null }> {
    const trimmedName = fullName.trim();
    const trimmedCode = inviteCode.trim().toUpperCase();

    if (!trimmedName || trimmedCode.length !== 6) {
      return { error: "Please enter your name and a 6-digit Tether Code." };
    }

    // 1. Find or create a Tether with this invite_code
    let currentTether: Tether | null = null;

    const { data: existingTether } = await supabase
      .from("tethers")
      .select("*")
      .eq("invite_code", trimmedCode)
      .single();

    if (existingTether) {
      currentTether = existingTether;
    } else {
      const { data: newTether, error: tetherError } = await supabase
        .from("tethers")
        .insert({ id: crypto.randomUUID(), invite_code: trimmedCode })
        .select()
        .single();

      if (tetherError || !newTether) {
        return { error: tetherError?.message || "Failed to create tether." };
      }
      currentTether = newTether;
    }

    // 2. List all profiles already in this tether
    const { data: tetherProfiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("tether_id", currentTether.id);

    const existing = tetherProfiles ?? [];

    // Case A: name matches an existing member → log them straight in
    const matchedProfile = existing.find(
      (p) => p.full_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (matchedProfile) {
      setProfile(matchedProfile);
      setTether(currentTether);
      localStorage.setItem("tether_profile_id", matchedProfile.id);
      await loadTetherAndPartner(matchedProfile);
      return { error: null };
    }

    // Case B: tether is already full (2 members) — prevent ghost profiles
    // The only two valid names on this tether are Kyle and Nathan.
    // If someone typed a different name they almost certainly made a typo.
    if (existing.length >= 2) {
      const names = existing.map((p) => p.full_name).join(" or ");
      return {
        error: `This Tether Code is already connected to ${names}. Check your name spelling and try again.`,
      };
    }

    // Case C: tether exists but isn't full yet → create the second profile
    const { data: newProfile, error: profileError } = await supabase
      .from("profiles")
      .insert({ id: crypto.randomUUID(), full_name: trimmedName, tether_id: currentTether.id })
      .select()
      .single();

    if (profileError || !newProfile) {
      return { error: profileError?.message || "Failed to create profile." };
    }

    setProfile(newProfile);
    setTether(currentTether);
    localStorage.setItem("tether_profile_id", newProfile.id);
    await loadTetherAndPartner(newProfile);

    return { error: null };
  }

  function logout() {
    localStorage.removeItem("tether_profile_id");
    setProfile(null);
    setPartnerProfile(null);
    setTether(null);
  }

  async function reload() {
    const storedId = localStorage.getItem("tether_profile_id");
    if (storedId) await loadSession(storedId);
  }

  return (
    <AuthContext.Provider value={{ profile, partnerProfile, tether, loading, login, logout, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
