import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Loader2, Sparkles, Calendar, Compass, Clock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMode, getSessionId, setMode, saveProfile, loadProfile } from "@/lib/session";
import { reverseGeocode } from "@/lib/dist";
import { toast } from "sonner";

export const Route = createFileRoute("/start")({ component: StartPage });

const INTERESTS = ["Tech", "Startup", "Design", "Music", "Food", "Sports", "Art", "Coffee", "Travel"];

const EVENT_TYPES = [
  "College Fest",
  "Concert / DJ Night",
  "Club / Nightlife",
  "Tech Event / Hackathon",
  "Exhibition / Conference",
  "Marriage / Wedding",
  "Birthday Party",
  "House Party",
  "Travel Buddy",
  "Custom",
] as const;

const TTL_OPTIONS = [1, 2, 4, 6, 8, 12, 24];

function StartPage() {
  const nav = useNavigate();
  const [mode, setModeState] = useState<"event" | "nearby">("nearby");
  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [skills, setSkills] = useState("");
  const [eventType, setEventType] = useState<string>("College Fest");
  const [eventName, setEventName] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [ttlHours, setTtlHours] = useState<number>(2);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [locationAddress, setLocationAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Bootstrap: restore cached form, and auto-redirect to /live if a live profile exists
  useEffect(() => {
    setModeState(getMode());
    const cached = loadProfile();
    if (cached.name) setName(cached.name);
    if (cached.age) setAge(cached.age);
    if (cached.gender) setGender(cached.gender);
    if (cached.email) setEmail(cached.email);
    if (cached.instagram) setInstagram(cached.instagram);
    if (cached.skills) setSkills(cached.skills);
    if (cached.interests) setInterests(cached.interests);
    if (cached.eventType) setEventType(cached.eventType);
    if (cached.eventName) setEventName(cached.eventName);
    if (cached.ttlHours) setTtlHours(cached.ttlHours);
    if (cached.mode) setModeState(cached.mode);

    const session_id = getSessionId();
    (async () => {
      const { data } = await supabase
        .from("konnect_users")
        .select("session_id, expires_at")
        .eq("session_id", session_id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (data) {
        nav({ to: "/live" });
        return;
      }
      setCheckingExisting(false);
    })();
  }, [nav]);

  const useGPS = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        setCoords({ lat, lng });
        setAccuracyM(acc);
        setLocationLabel("Current location");
        setGeoLoading(false);
        toast.success(`Location locked (±${Math.round(acc)}m)`);
        const addr = await reverseGeocode(lat, lng);
        if (addr) setLocationAddress(addr);
      },
      (err) => {
        setGeoLoading(false);
        toast.error(
          err.code === 1
            ? "Location permission denied. Please allow access to go live."
            : "Couldn't get your exact location. Please try again outside."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  const submit = async () => {
    if (!name.trim()) return toast.error("Enter your first name");
    if (!email.trim() || !validEmail(email)) return toast.error("Enter a valid email");
    if (!coords) return toast.error("Share your location to go live");
    const finalEventName = eventType === "Custom" ? eventName.trim() : eventType;
    if (mode === "event" && (!finalEventName || (eventType === "Custom" && !eventName.trim()))) {
      return toast.error("Enter event name");
    }

    setLoading(true);
    setMode(mode);
    saveProfile({ name, age, gender, email, instagram, skills, interests, eventType, eventName, ttlHours, mode });

    const session_id = getSessionId();
    const expires_at = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const payload = {
      session_id,
      name: name.trim().slice(0, 40),
      age: age ? parseInt(age) : null,
      gender: gender || null,
      email: email.trim().toLowerCase(),
      intent: mode === "event" ? "event" : "nearby",
      mode: mode === "event" ? `event:${finalEventName.toLowerCase()}` : "nearby",
      event_type: mode === "event" ? eventType : null,
      location_name: locationLabel || (mode === "event" ? finalEventName : "Nearby"),
      location_lat: coords.lat,
      location_lng: coords.lng,
      instagram: instagram.trim() || null,
      skills: skills.trim() || null,
      interests: interests.length ? interests : null,
      expires_at,
    };

    const { error } = await supabase.from("konnect_users").upsert(payload, { onConflict: "session_id" });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`You're live for ${ttlHours}h`);
    nav({ to: "/live" });
  };

  if (checkingExisting) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mt-6 glass-strong rounded-3xl p-6 md:p-8 animate-float-up">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-royal glow-royal">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold">Quick start</h1>
              <p className="text-xs text-muted-foreground">No password. Profile vanishes when your time is up.</p>
            </div>
          </div>

          {/* Mode */}
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-card/50 p-1">
            <ModeBtn active={mode === "nearby"} onClick={() => setModeState("nearby")} icon={<Compass className="h-4 w-4" />} label="Nearby" />
            <ModeBtn active={mode === "event"} onClick={() => setModeState("event")} icon={<Calendar className="h-4 w-4" />} label="Event" />
          </div>

          {mode === "event" && (
            <>
              <Field label="Event type *">
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="input">
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              {eventType === "Custom" && (
                <Field label="Custom event name *">
                  <input value={eventName} onChange={(e) => setEventName(e.target.value)} className="input" placeholder="e.g. Sarah & Tom Wedding" maxLength={60} />
                </Field>
              )}
            </>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First name *">
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Alex" maxLength={40} />
            </Field>
            <Field label="Age">
              <input type="number" min={16} max={99} value={age} onChange={(e) => setAge(e.target.value)} className="input" placeholder="24" />
            </Field>
          </div>

          <Field label="Email (Gmail) *" hint="Used only to keep your session safe. Never shown publicly.">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@gmail.com" maxLength={120} />
          </Field>

          <Field label="Gender">
            <div className="flex flex-wrap gap-2">
              {["Female", "Male", "Non-binary", "Prefer not to say"].map((g) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(gender === g ? "" : g)}>{g}</Chip>
              ))}
            </div>
          </Field>

          <Field label="Skills / Work (optional)">
            <input value={skills} onChange={(e) => setSkills(e.target.value)} className="input" placeholder="Designer at Stripe" maxLength={80} />
          </Field>

          <Field label="Social handle (optional)" hint="Any platform — Instagram, X, LinkedIn, Telegram. Paste handle or full URL.">
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className="input" placeholder="@yourhandle or https://linkedin.com/in/you" maxLength={120} />
          </Field>

          <Field label="Interests">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <Chip key={i}
                  active={interests.includes(i)}
                  onClick={() => setInterests((arr) => arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i])}
                >{i}</Chip>
              ))}
            </div>
          </Field>

          <Field label="Stay live for *" hint="Your profile auto-deletes after this time.">
            <div className="flex flex-wrap gap-2">
              {TTL_OPTIONS.map((h) => (
                <Chip key={h} active={ttlHours === h} onClick={() => setTtlHours(h)}>
                  <Clock className="mr-1 inline h-3 w-3" />{h}h
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Location *" hint="We use this to match you with people nearby.">
            <div className="flex flex-wrap gap-2">
              <button onClick={useGPS} disabled={geoLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-gradient-gold px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:scale-[1.02] disabled:opacity-60">
                {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Use current location
              </button>
              {coords && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-gold" />
                  {locationLabel} · {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}
                </span>
              )}
            </div>
          </Field>

          <button
            onClick={submit}
            disabled={loading}
            className="go-live-btn mt-8 w-full rounded-2xl px-6 py-4 font-display text-base font-bold transition hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? "Going live..." : "Go Live →"}
          </button>

          <p className="mt-3 text-center text-[11px] text-muted-foreground inline-flex w-full items-center justify-center gap-1">
            <Users className="h-3 w-3" /> You can also create a group from the Live screen.
          </p>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: color-mix(in oklab, var(--card) 60%, transparent);
          border: 1px solid var(--border);
          border-radius: 0.875rem;
          padding: 0.75rem 1rem;
          color: var(--foreground);
          outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .input:focus {
          border-color: var(--gold);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--gold) 20%, transparent);
        }
        .go-live-btn {
          background: linear-gradient(135deg,
            color-mix(in oklab, var(--gold) 92%, white 30%) 0%,
            color-mix(in oklab, white 70%, var(--gold) 30%) 50%,
            color-mix(in oklab, var(--gold) 88%, white 25%) 100%);
          color: #1a1408;
          border: 1px solid color-mix(in oklab, var(--gold) 50%, white 20%);
          box-shadow:
            0 10px 30px -8px color-mix(in oklab, var(--gold) 45%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .go-live-btn:hover {
          filter: brightness(1.05);
        }
      `}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <label className="mb-1.5 block text-sm font-medium text-foreground/90">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active ? "border-gold bg-gold/15 text-gold" : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
      }`}>
      {children}
    </button>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-gradient-royal text-primary-foreground glow-royal" : "text-muted-foreground hover:text-foreground"
      }`}>
      {icon} {label}
    </button>
  );
}
