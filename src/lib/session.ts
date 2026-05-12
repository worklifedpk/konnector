const KEY = "konnect_session_id";

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
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

const MODE_KEY = "konnect_mode";
export function setMode(mode: "event" | "nearby") {
  if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, mode);
}
export function getMode(): "event" | "nearby" {
  if (typeof window === "undefined") return "nearby";
  return (localStorage.getItem(MODE_KEY) as "event" | "nearby") || "nearby";
}
