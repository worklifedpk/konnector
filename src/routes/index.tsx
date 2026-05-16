import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Sparkles, Users, Zap, Shield, Hand, Calendar, Compass, ArrowRight, Mail, AtSign, Crown, Link2, Share2 } from "lucide-react";
import heroImg from "@/assets/hero-radar.jpg";
import { setMode } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Landing,
});

type LiveLite = {
  session_id: string; name: string; email: string | null; instagram: string | null;
  skills: string | null; mode: string; location_lat: number; location_lng: number;
};
type GroupLite = {
  id: string; name: string; event_type: string; max_size: number;
  location_lat: number; location_lng: number;
};

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function Landing() {
  const nav = useNavigate();
  const [live, setLive] = useState<LiveLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const nowIso = new Date().toISOString();
      const [u, g] = await Promise.all([
        supabase.from("konnect_users").select("session_id,name,email,instagram,skills,mode,location_lat,location_lng").gt("expires_at", nowIso).order("created_at", { ascending: false }).limit(40),
        supabase.from("konnect_groups").select("id,name,event_type,max_size,location_lat,location_lng").gt("expires_at", nowIso).order("created_at", { ascending: false }).limit(20),
      ]);
      if (!mounted) return;
      setLive((u.data ?? []) as LiveLite[]);
      setGroups((g.data ?? []) as GroupLite[]);
    };
    load();
    const ch = supabase.channel("landing-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_users" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_groups" }, load)
      .subscribe();
    const i = setInterval(load, 20000);

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { timeout: 6000, enableHighAccuracy: false }
      );
    }
    return () => { mounted = false; clearInterval(i); supabase.removeChannel(ch); };
  }, []);

  const choose = (mode: "event" | "nearby") => {
    setMode(mode);
    nav({ to: "/start" });
  };

  const nearbyUsers = useMemo(() => {
    if (!coords) return [];
    return live.map((u) => ({ ...u, _km: distKm(coords, { lat: u.location_lat, lng: u.location_lng }) }))
      .sort((a, b) => a._km - b._km).slice(0, 8);
  }, [live, coords]);

  const nearbyGroups = useMemo(() => {
    if (!coords) return [];
    return groups
      .map((g) => ({ ...g, _km: distKm(coords, { lat: g.location_lat, lng: g.location_lng }) }))
      .filter((g) => g._km <= 40) // active groups within 40km
      .sort((a, b) => a._km - b._km)
      .slice(0, 12);
  }, [groups, coords]);

  const shareLink = async (url: string, title: string) => {
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {}
  };

  // marquee items: name + masked email + social handle
  const tickerItems = live.filter((u) => u.email || u.instagram).slice(0, 12);

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Live ticker bar */}
      {tickerItems.length > 0 && (
        <div className="relative z-10 border-b border-gold/20 bg-card/40 backdrop-blur">
          <div className="overflow-hidden py-2">
            <div className="ticker flex gap-8 whitespace-nowrap text-xs">
              {[...tickerItems, ...tickerItems].map((u, i) => (
                <span key={i} className="inline-flex items-center gap-2 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                  <span className="font-semibold text-foreground">{u.name}</span>
                  {u.email && (<><Mail className="h-3 w-3 text-gold" /><span>{u.email}</span></>)}
                  {u.instagram && (<><AtSign className="h-3 w-3 text-gold" /><span>{u.instagram.replace(/^https?:\/\//, "")}</span></>)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="relative">
        <div className="absolute inset-0 -z-10">
          <img src={heroImg} alt="Live city map with glowing pulses of nearby people" width={1536} height={1024} className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
          <div className="absolute inset-0 grid-bg opacity-40" />
        </div>

        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-royal glow-royal">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight">
              konnect<span className="text-gold">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
            </span>
            <span className="text-muted-foreground">{live.length} live now</span>
          </div>
        </nav>

        <div className="mx-auto grid max-w-7xl gap-12 px-6 pt-6 pb-24 lg:grid-cols-2 lg:items-center lg:pt-14 lg:pb-32">
          <div className="animate-float-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-card/40 px-3 py-1 text-xs text-gold backdrop-blur">
              <Zap className="h-3.5 w-3.5" /> No login. No waiting. Just show up.
            </div>
            <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
              Meet real people <br />
              <span className="text-shimmer-gold">nearby — right now.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              konnect is a real-time, hyperlocal meet-up. Drop a pin, get matched with people
              around you or at your event, and meet in the real world. Profiles vanish in 2 hours.
            </p>

            <div className="mt-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                What do you want to use konnect for?
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ModeCard icon={<Calendar className="h-5 w-5" />} title="At an Event" desc="Conference, meetup, party. Find your people in the room." cta="Join Event Mode" onClick={() => choose("event")} />
                <ModeCard icon={<Compass className="h-5 w-5" />} title="Nearby" desc="Discover people around your current or chosen location." cta="Go Live Nearby" onClick={() => choose("nearby")} />
              </div>
            </div>
          </div>

          {/* Animated nearby map preview */}
          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="relative h-full w-full overflow-hidden rounded-3xl border border-gold/20 glass-strong">
              <div className="absolute inset-0 grid-bg" />
              <div className="absolute inset-0 radar-sweep opacity-30" />
              {[0.33, 0.66, 1].map((p, i) => (
                <div key={i} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20"
                  style={{ width: `${p * 80}%`, height: `${p * 80}%` }} />
              ))}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-accent-foreground font-bold ring-pulse glow-gold">
                  You
                </div>
              </div>
              {(nearbyUsers.length ? nearbyUsers : live.slice(0, 8).map((u) => ({ ...u, _km: 0.5 + Math.random() * 5 }))).map((u, i) => {
                const angle = (i / Math.max(1, (nearbyUsers.length || 8))) * Math.PI * 2;
                const maxKm = Math.max(1, ...(nearbyUsers.length ? nearbyUsers.map((x) => x._km) : [5]));
                const r = (Math.min(u._km, maxKm) / maxKm) * 38;
                const x = 50 + Math.cos(angle) * r, y = 50 + Math.sin(angle) * r;
                return (
                  <button key={u.session_id || i} onClick={() => choose("nearby")}
                    title={`${u.name} · ${u._km.toFixed(2)} km`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 transition hover:scale-125"
                    style={{ left: `${x}%`, top: `${y}%` }}>
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-pulse glow-royal">
                      {u.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="mt-1 block rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-foreground backdrop-blur">{u._km.toFixed(1)}km</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {coords ? "Tap a dot to go live and connect" : "Allow location to see real distances"}
            </p>
          </div>
        </div>
      </section>

      {/* Nearby live snapshot */}
      {(nearbyUsers.length > 0 || nearbyGroups.length > 0) && (
        <section className="border-t border-border/40 bg-background/40 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gold">Live around you</p>
                <h2 className="font-display text-2xl font-bold md:text-3xl">Nearby right now</h2>
              </div>
              <button onClick={() => choose("nearby")} className="btn-gold-white text-sm px-4 py-2">Join them</button>
            </div>

            {nearbyUsers.length > 0 && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {nearbyUsers.slice(0, 8).map((u) => (
                  <button key={u.session_id} onClick={() => choose(u.mode.startsWith("event:") ? "event" : "nearby")}
                    className="glass rounded-2xl p-4 text-left transition hover:-translate-y-1 hover:glow-gold">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-royal font-bold text-primary-foreground">
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{u.name}</p>
                        <p className="text-[11px] text-gold inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{u._km.toFixed(2)} km</p>
                      </div>
                    </div>
                    {u.skills && <p className="mt-2 truncate text-xs text-muted-foreground">{u.skills}</p>}
                  </button>
                ))}
              </div>
            )}

            {nearbyGroups.length > 0 && (
              <>
                <h3 className="mt-10 mb-3 text-xs uppercase tracking-[0.2em] text-gold">Nearby groups</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {nearbyGroups.slice(0, 8).map((g) => (
                    <button key={g.id} onClick={() => choose("nearby")}
                      className="glass rounded-2xl p-4 text-left transition hover:-translate-y-1 hover:glow-gold">
                      <p className="text-[10px] uppercase tracking-widest text-gold inline-flex items-center gap-1"><Crown className="h-3 w-3" />{g.event_type}</p>
                      <h4 className="mt-1 font-display text-sm font-semibold truncate">{g.name}</h4>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />/{g.max_size}</span>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-gold" />{g._km.toFixed(2)} km</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Three steps. Zero friction.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Step n="01" icon={<Sparkles className="h-5 w-5" />} title="Drop your name" desc="Just first name, age, vibe. No password." />
            <Step n="02" icon={<MapPin className="h-5 w-5" />} title="Share location" desc="Use GPS or pick a spot on the map. Stay in control." />
            <Step n="03" icon={<Users className="h-5 w-5" />} title="Meet for real" desc="Match, chat briefly when nearby, then show up." />
          </div>
        </div>
      </section>

      <section className="border-t border-border/40 bg-background/40 py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 md:grid-cols-3">
          {[
            { i: <Shield className="h-5 w-5" />, t: "Auto-delete", d: "Profile and chats vanish when your time ends." },
            { i: <Hand className="h-5 w-5" />, t: "Gesture verify", d: "Confirm in real life with a chosen gesture." },
            { i: <Zap className="h-5 w-5" />, t: "Real-time only", d: "No history. No archives. Live or gone." },
          ].map((x) => (
            <div key={x.t} className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-gold text-accent-foreground">{x.i}</span>
              <div>
                <h4 className="font-display text-lg font-semibold">{x.t}</h4>
                <p className="text-sm text-muted-foreground">{x.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-4xl font-extrabold md:text-5xl">
            We don't help you swipe. <br />
            <span className="text-shimmer-gold">We help you show up.</span>
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button onClick={() => choose("nearby")} className="btn-gold-white inline-flex items-center gap-2 px-6 py-3 text-base">
              Go Live <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={() => choose("event")} className="btn-gold-white inline-flex items-center gap-2 px-6 py-3 text-base">
              Join an Event
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        konnect · built for the real world
      </footer>

      <style>{`
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ticker { animation: ticker 45s linear infinite; }
        .ticker:hover { animation-play-state: paused; }
        .btn-gold-white {
          background: linear-gradient(135deg,
            color-mix(in oklab, var(--gold) 92%, white 30%) 0%,
            color-mix(in oklab, white 70%, var(--gold) 30%) 50%,
            color-mix(in oklab, var(--gold) 88%, white 25%) 100%);
          color: #1a1408;
          border: 1px solid color-mix(in oklab, var(--gold) 50%, white 20%);
          border-radius: 9999px;
          font-weight: 700;
          box-shadow: 0 10px 30px -8px color-mix(in oklab, var(--gold) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.6);
          transition: transform 150ms, filter 150ms;
        }
        .btn-gold-white:hover { filter: brightness(1.05); transform: scale(1.03); }
      `}</style>
    </main>
  );
}

function ModeCard({ icon, title, desc, cta, onClick }: { icon: React.ReactNode; title: string; desc: string; cta: string; onClick: () => void; }) {
  return (
    <button onClick={onClick} className="group relative overflow-hidden rounded-2xl glass-strong p-5 text-left transition hover:-translate-y-1 hover:glow-gold">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-gold text-accent-foreground">{icon}</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gold">
        {cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
      </div>
    </button>
  );
}

function Step({ n, icon, title, desc }: { n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-3xl font-extrabold text-royal">{n}</span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-gold text-accent-foreground">{icon}</span>
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
