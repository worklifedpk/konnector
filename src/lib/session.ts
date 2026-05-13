const KEY = "konnect_session_id";
const MODE_KEY = "konnect_mode";
const PROFILE_KEY = "konnect_profile_v2";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PROFILE_KEY);
  }
}

export function setMode(mode: "event" | "nearby") {
  if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, mode);
}
export function getMode(): "event" | "nearby" {
  if (typeof window === "undefined") return "nearby";
  return (localStorage.getItem(MODE_KEY) as "event" | "nearby") || "nearby";
}

export type CachedProfile = {
  name?: string;
  age?: string;
  gender?: string;
  email?: string;
  instagram?: string;
  skills?: string;
  interests?: string[];
  eventType?: string;
  eventName?: string;
  ttlHours?: number;
  mode?: "event" | "nearby";
};

export function saveProfile(p: CachedProfile) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}
export function loadProfile(): CachedProfile {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); } catch { return {}; }
}
