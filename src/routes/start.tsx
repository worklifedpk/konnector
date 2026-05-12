import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Loader2, Sparkles, Calendar, Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMode, getSessionId, setMode } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/start")({
  component: StartPage,
});

const INTERESTS = ["Tech", "Startup", "Design", "Music", "Food", "Sports", "Art", "Coffee", "Travel"];

function StartPage() {
  const nav = useNavigate();
  const [mode, setModeState] = useState<"event" | "nearby">("nearby");
  const [name, setName] = useState("");
  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [instagram, setInstagram] = useState("");
  const [skills, setSkills] = useState("");
  const [eventName, setEventName] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => { setModeState(getMode()); }, []);

  const useGPS = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel("Current location");
        setGeoLoading(false);
        toast.success("Location locked in");
      },
      () => {
        setGeoLoading(false);
        toast.error("Couldn't get location. Pick manually.");
        // fallback random near city center
        setCoords({ lat: 28.6139, lng: 77.2090 });
        setLocationLabel("Approximate (default)");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submit = async () => {
    if (!name.trim()) return toast.error("Enter your first name");
    if (!coords) return toast.error("Share your location to go live");
    if (mode === "event" && !eventName.trim()) return toast.error("Enter event name");

    setLoading(true);
    setMode(mode);
    const session_id = getSessionId();

    const payload = {
      session_id,
      name: name.trim().slice(0, 40),
      age: age ? parseInt(age) : null,
      gender: gender || null,
      intent: mode === "event" ? "event" : "nearby",
      mode: mode === "event" ? `event:${eventName.trim().toLowerCase()}` : "nearby",
      location_name: locationLabel || (mode === "event" ? eventName : "Nearby"),
      location_lat: coords.lat,
      location_lng: coords.lng,
      instagram: instagram.trim() || null,
      skills: skills.trim() || null,
      interests: interests.length ? interests : null,
    };

    const { error } = await supabase.from("konnect_users").upsert(payload, { onConflict: "session_id" });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("You're live for 2 hours");
    nav({ to: "/live" });
  };

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
              <p className="text-xs text-muted-foreground">No login. Profile vanishes in 2 hours.</p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-card/50 p-1">
            <ModeBtn active={mode === "nearby"} onClick={() => setModeState("nearby")} icon={<Compass className="h-4 w-4" />} label="Nearby" />
            <ModeBtn active={mode === "event"} onClick={() => setModeState("event")} icon={<Calendar className="h-4 w-4" />} label="Event" />
          </div>

          {mode === "event" && (
            <Field label="Event name *" hint="People at the same event will see each other.">
              <input value={eventName} onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. TechCrunch Disrupt"
                className="input" maxLength={60} />
            </Field>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First name *">
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Alex" maxLength={40} />
            </Field>
            <Field label="Age">
              <input type="number" min={16} max={99} value={age} onChange={(e) => setAge(e.target.value)} className="input" placeholder="24" />
            </Field>
          </div>

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

          <Field label="Instagram (optional)">
            <input value={instagram} onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))} className="input" placeholder="yourhandle" maxLength={40} />
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
            className="mt-8 w-full rounded-2xl bg-gradient-royal px-6 py-4 font-display text-base font-bold text-primary-foreground glow-royal transition hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? "Going live..." : "Go Live →"}
          </button>
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
        active
          ? "border-gold bg-gold/15 text-gold"
          : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
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
