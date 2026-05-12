import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { ArrowLeft, MessageCircle, Hand, MapPin, Users, Search, LogOut, Instagram } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/live")({
  component: LivePage,
});

type LiveUser = {
  id: string;
  session_id: string;
  name: string;
  age: number | null;
  gender: string | null;
  intent: string;
  mode: string;
  location_name: string | null;
  location_lat: number;
  location_lng: number;
  skills: string | null;
  instagram: string | null;
  interests: string[] | null;
  expires_at: string;
};

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function LivePage() {
  const nav = useNavigate();
  const [me, setMe] = useState<LiveUser | null>(null);
  const [users, setUsers] = useState<LiveUser[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "event" | "nearby">("all");

  useEffect(() => {
    const sid = getSessionId();
    if (!sid) { nav({ to: "/start" }); return; }

    const load = async () => {
      const { data } = await supabase
        .from("konnect_users").select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      const list = (data ?? []) as LiveUser[];
      const myRow = list.find((u) => u.session_id === sid) ?? null;
      setMe(myRow);
      if (!myRow) { nav({ to: "/start" }); return; }
      setUsers(list);
    };
    load();

    const ch = supabase
      .channel("live-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_users" }, load)
      .subscribe();
    const i = setInterval(load, 20000);
    return () => { clearInterval(i); supabase.removeChannel(ch); };
  }, [nav]);

  const others = useMemo(() => {
    if (!me) return [];
    let list = users.filter((u) => u.session_id !== me.session_id);
    if (filter === "event") list = list.filter((u) => u.mode.startsWith("event:") && u.mode === me.mode);
    if (filter === "nearby") list = list.filter((u) => !u.mode.startsWith("event:"));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((u) =>
        u.name.toLowerCase().includes(q) ||
        (u.skills?.toLowerCase().includes(q) ?? false) ||
        (u.interests?.some((i) => i.toLowerCase().includes(q)) ?? false)
      );
    }
    return list
      .map((u) => ({ ...u, _km: distKm({ lat: me.location_lat, lng: me.location_lng }, { lat: u.location_lat, lng: u.location_lng }) }))
      .sort((a, b) => a._km - b._km);
  }, [users, me, filter, query]);

  const expiresMs = me ? new Date(me.expires_at).getTime() - Date.now() : 0;
  const minsLeft = Math.max(0, Math.floor(expiresMs / 60000));

  const leave = async () => {
    if (!me) return;
    await supabase.from("konnect_users").delete().eq("session_id", me.session_id);
    toast.success("You're offline");
    nav({ to: "/" });
  };

  if (!me) return null;

  const isEventMode = me.mode.startsWith("event:");
  const eventLabel = isEventMode ? me.mode.split(":")[1] : "Nearby";

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-6xl">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <button onClick={leave} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive">
            <LogOut className="h-3.5 w-3.5" /> Go offline
          </button>
        </div>

        {/* Status header */}
        <div className="mt-5 glass-strong rounded-3xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-gold text-accent-foreground font-display text-xl font-bold">
              {me.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-widest text-gold">Live · {eventLabel}</p>
              <h1 className="font-display text-2xl font-bold">Hey {me.name}</h1>
              <p className="text-xs text-muted-foreground">{others.length} {isEventMode ? "people in this event" : "people around you"} · expires in {minsLeft}m</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-gold/30 bg-card/40 px-3 py-1.5 text-xs text-gold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              real-time
            </div>
          </div>
        </div>

        {/* Filters + search */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, skill, interest..."
              className="w-full rounded-full border border-border bg-card/40 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gold" />
          </div>
          {(["all", "nearby", "event"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                filter === f ? "border-gold bg-gold/15 text-gold" : "border-border text-muted-foreground hover:text-foreground"
              }`}>
              {f}
            </button>
          ))}
        </div>

        {/* Mini "map" radar */}
        <div className="relative mt-5 h-64 overflow-hidden rounded-3xl border border-border/60 grid-bg">
          <div className="absolute inset-0 radar-sweep opacity-40" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold ring-pulse" />
          {others.slice(0, 30).map((u) => {
            // map distance to radial position on radar (max 5km = edge)
            const km = Math.min(5, (u as any)._km || 0.1);
            const r = 30 + (km / 5) * 110; // px from center
            const angle = (parseInt(u.id.slice(0, 8), 16) % 360) * (Math.PI / 180);
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            return (
              <button
                key={u.id}
                onClick={() => nav({ to: "/chat/$peer", params: { peer: u.session_id } })}
                title={`${u.name} · ${km.toFixed(1)} km`}
                className="absolute h-3 w-3 rounded-full bg-primary ring-pulse hover:scale-150 transition"
                style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
              />
            );
          })}
        </div>

        {/* User list */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.length === 0 && (
            <div className="col-span-full glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-3 h-6 w-6 text-gold" />
              No one nearby yet. Share konnect with people around you.
            </div>
          )}
          {others.map((u) => (
            <UserCard key={u.id} u={u as any} onChat={() => nav({ to: "/chat/$peer", params: { peer: u.session_id } })} />
          ))}
        </div>
      </div>
    </main>
  );
}

function UserCard({ u, onChat }: { u: LiveUser & { _km: number }; onChat: () => void }) {
  return (
    <div className="glass rounded-2xl p-4 transition hover:-translate-y-1 hover:glow-royal">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-royal font-display text-lg font-bold text-primary-foreground">
          {u.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-base font-semibold">{u.name}</h3>
            {u.age && <span className="text-xs text-muted-foreground">{u.age}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{u.skills || u.gender || "Available now"}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gold">
            <MapPin className="h-3 w-3" /> {u._km < 0.1 ? "Same spot" : `${u._km.toFixed(1)} km away`}
          </div>
        </div>
      </div>
      {u.interests && u.interests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {u.interests.slice(0, 4).map((i) => (
            <span key={i} className="rounded-full border border-border bg-card/40 px-2 py-0.5 text-[10px] text-muted-foreground">{i}</span>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button onClick={onChat} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-royal px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02]">
          <MessageCircle className="h-4 w-4" /> Chat
        </button>
        <button onClick={onChat} className="inline-flex items-center justify-center gap-1 rounded-xl border border-gold/30 bg-card/40 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10">
          <Hand className="h-4 w-4" /> Meet
        </button>
        {u.instagram && (
          <a href={`https://instagram.com/${u.instagram}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card/40 px-3 py-2 text-muted-foreground hover:text-foreground">
            <Instagram className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
