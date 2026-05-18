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

  const NEARBY_KM = 30;
  const nearbyGroups = useMemo(() => {
    if (!coords) return [];
    return groups
      .map((g) => ({ ...g, _km: distKm(coords, { lat: g.location_lat, lng: g.location_lng }) }))
      .filter((g) => g._km <= NEARBY_KM)
      .sort((a, b) => a._km - b._km)
      .slice(0, 12);
  }, [groups, coords]);

  const tooFar = coords && nearbyUsers.length > 0 && nearbyUsers.every((u) => u._km > NEARBY_KM);
  const nearbyUsers30 = useMemo(
    () => nearbyUsers.filter((u) => u._km <= NEARBY_KM),
    [nearbyUsers]
  );

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

  // Professional top strip — one chip per person, single contact (prefer social, else email)
  const topProfiles = useMemo(() => {
    const seen = new Set<string>();
    return live
      .filter((u) => u.email || u.instagram)
      .filter((u) => {
        const key = (u.instagram || u.email || u.session_id).toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 14);
  }, [live]);

  // Radar dots — project nearby users onto a circular radar around viewer
  const radarPoints = useMemo(() => {
    const pool = (nearbyUsers.length ? nearbyUsers : live.slice(0, 10).map((u) => ({ ...u, _km: 0 })));
    return pool.slice(0, 10).map((u, i) => {
      // map distance (0..NEARBY_KM) to radius% (10..46), with synthetic fallback
      const km = (u as any)._km ?? 0;
      const r = coords && km > 0
        ? Math.min(46, 10 + (km / NEARBY_KM) * 36)
        : 14 + (i * 31) % 32;
      const angle = (i * 47) % 360;
      const rad = (angle * Math.PI) / 180;
      const x = 50 + r * Math.cos(rad);
      const y = 50 + r * Math.sin(rad);
      return { u, x, y, delay: (i % 6) * 0.4, km };
    });
  }, [nearbyUsers, live, coords]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Top professional sliding profile strip */}
      {topProfiles.length > 0 && (
        <div className="relative z-10 border-b border-gold/20 bg-card/40 backdrop-blur">
          <div className="pro-strip py-2.5">
            <div className="pro-track">
              {[...topProfiles, ...topProfiles].map((u, i) => {
                const handle = u.instagram?.replace(/^https?:\/\//, "").replace(/^www\./, "") || u.email!;
                const link = u.instagram
                  ? (u.instagram.startsWith("http") ? u.instagram : `https://${u.instagram.replace(/^@/, "instagram.com/")}`)
                  : `mailto:${u.email}`;
                const Icon = u.instagram ? Link2 : Mail;
                return (
                  <a key={`${u.session_id}-${i}`} href={link} target="_blank" rel="noreferrer"
                    className="pro-chip group">
                    <span className="pro-avatar">{u.name?.[0]?.toUpperCase() ?? "?"}</span>
                    <span className="flex flex-col leading-tight min-w-0">
                      <span className="text-[12px] font-semibold text-foreground truncate max-w-[140px]">{u.name}</span>
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 truncate max-w-[140px]">
                        <Icon className="h-2.5 w-2.5 text-gold shrink-0" />{handle}
                      </span>
                    </span>
                  </a>
                );
              })}
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

          {/* GenZ sliding DP carousel — only DPs slide, social/email button beside */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="relative overflow-hidden rounded-3xl border border-gold/20 glass-strong p-5">
              <div className="absolute inset-0 grid-bg opacity-50" />
              <div className="absolute inset-0 radar-sweep opacity-20" />
              <div className="relative">
                <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                  Live now · slide to peek
                </p>

                {(nearbyUsers.length ? nearbyUsers : live.slice(0, 12).map((u) => ({ ...u, _km: 0 }))).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gold/20 p-8 text-center text-xs text-muted-foreground">
                    No one live yet. Be the first to drop in.
                  </div>
                ) : (
                  <div className="dp-marquee">
                    <div className="dp-track">
                      {[...(nearbyUsers.length ? nearbyUsers : live.slice(0, 12).map((u) => ({ ...u, _km: 0 }))),
                        ...(nearbyUsers.length ? nearbyUsers : live.slice(0, 12).map((u) => ({ ...u, _km: 0 })))]
                        .map((u, i) => {
                          const link = u.instagram
                            ? (u.instagram.startsWith("http") ? u.instagram : `https://${u.instagram.replace(/^@/, "instagram.com/")}`)
                            : u.email ? `mailto:${u.email}` : null;
                          const isMail = !u.instagram && !!u.email;
                          const cardInner = (
                            <>
                              <div className="dp-ring">
                                <div className="dp-inner">
                                  {u.name?.[0]?.toUpperCase() ?? "?"}
                                </div>
                                {coords && u._km > 0 && (
                                  <span className="dp-dist">{u._km < 1 ? `${Math.round(u._km*1000)}m` : `${u._km.toFixed(1)}km`}</span>
                                )}
                              </div>
                              <p className="mt-2 max-w-[78px] truncate text-center text-[11px] font-semibold text-foreground">{u.name}</p>
                              <span className="dp-check">
                                {isMail ? <Mail className="h-3 w-3" /> : link ? <Link2 className="h-3 w-3" /> : <AtSign className="h-3 w-3" />}
                                <span>{isMail ? "Mail" : link ? "Check" : "Profile"}</span>
                              </span>
                            </>
                          );
                          return link ? (
                            <a key={`${u.session_id}-${i}`} href={link} target="_blank" rel="noreferrer"
                              title={isMail ? `Email ${u.name}` : `Open ${u.name}'s profile`}
                              className="dp-card group">
                              {cardInner}
                            </a>
                          ) : (
                            <div key={`${u.session_id}-${i}`} className="dp-card">{cardInner}</div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {coords ? "Hover to pause · tap profile to connect" : "Allow location to see real distances"}
            </p>
          </div>
        </div>
      </section>

      {/* Nearby live snapshot — groups first */}
      {(nearbyUsers30.length > 0 || nearbyGroups.length > 0 || tooFar) && (
        <section className="border-t border-border/40 bg-background/40 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gold">Live around you</p>
                <h2 className="font-display text-2xl font-bold md:text-3xl">Within {NEARBY_KM} km right now</h2>
              </div>
              <button onClick={() => choose("nearby")} className="btn-gold-white text-sm px-4 py-2">Join them</button>
            </div>

            {tooFar && nearbyGroups.length === 0 && nearbyUsers30.length === 0 && (
              <div className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
                Nobody live within {NEARBY_KM} km of you. Closest person is {nearbyUsers[0]._km.toFixed(1)} km away.
                Try moving to a busier spot, or pick a location manually when you go live.
              </div>
            )}

            {nearbyGroups.length > 0 && (
              <>
                <h3 className="mt-6 mb-3 text-xs uppercase tracking-[0.2em] text-gold">
                  Active groups near you ({nearbyGroups.length})
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {nearbyGroups.map((g) => {
                    const url = typeof window !== "undefined"
                      ? `${window.location.origin}/live?join=${g.id}`
                      : `/live?join=${g.id}`;
                    return (
                      <div key={g.id} className="glass rounded-2xl p-4 transition hover:-translate-y-1 hover:glow-gold">
                        <button onClick={() => nav({ to: "/live", search: { join: g.id } as any })} className="block w-full text-left">
                          <p className="text-[10px] uppercase tracking-widest text-gold inline-flex items-center gap-1"><Crown className="h-3 w-3" />{g.event_type}</p>
                          <h4 className="mt-1 font-display text-sm font-semibold truncate">{g.name}</h4>
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />/{g.max_size}</span>
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-gold" />
                              {g._km < 1 ? `${Math.round(g._km*1000)} m` : `${g._km.toFixed(2)} km`}
                            </span>
                          </div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => nav({ to: "/live", search: { join: g.id } as any })}
                            className="flex-1 rounded-full bg-gradient-royal px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
                            Request to join
                          </button>
                          <button onClick={() => shareLink(url, `Join ${g.name} on konnect`)}
                            title="Share invite link"
                            className="grid h-7 w-7 place-items-center rounded-full border border-gold/40 bg-card/40 text-gold hover:bg-gold/10">
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {nearbyUsers30.length > 0 && (
              <>
                <h3 className="mt-8 mb-3 text-xs uppercase tracking-[0.2em] text-gold">
                  People near you ({nearbyUsers30.length})
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {nearbyUsers30.slice(0, 8).map((u) => {
                    const link = u.instagram
                      ? (u.instagram.startsWith("http") ? u.instagram : `https://${u.instagram.replace(/^@/, "instagram.com/")}`)
                      : u.email ? `mailto:${u.email}` : null;
                    const url = typeof window !== "undefined" ? `${window.location.origin}/live` : "/live";
                    return (
                      <div key={u.session_id} className="glass rounded-2xl p-4 transition hover:-translate-y-1 hover:glow-gold">
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
                        <div className="mt-3 flex gap-2">
                          {link && (
                            <a href={link} target="_blank" rel="noreferrer"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/20">
                              {u.instagram ? <><Link2 className="h-3 w-3" />Profile</> : <><Mail className="h-3 w-3" />Email</>}
                            </a>
                          )}
                          <button onClick={() => shareLink(url, `${u.name} is live on konnect`)}
                            title="Share konnect"
                            className="grid h-7 w-7 place-items-center rounded-full border border-gold/40 bg-card/40 text-gold hover:bg-gold/10">
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
        @keyframes dpSlide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .dp-marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent 0, #000 8%, #000 92%, transparent 100%); }
        .dp-track { display: flex; gap: 18px; width: max-content; animation: dpSlide 35s linear infinite; }
        .dp-marquee:hover .dp-track { animation-play-state: paused; }
        .dp-card { position: relative; display: flex; flex-direction: column; align-items: center; width: 84px; }
        .dp-ring {
          position: relative; width: 76px; height: 76px; border-radius: 9999px; padding: 3px;
          background: conic-gradient(from 120deg, var(--gold), color-mix(in oklab, var(--gold) 20%, white 60%), var(--gold));
          box-shadow: 0 6px 22px -6px color-mix(in oklab, var(--gold) 55%, transparent);
          transition: transform 200ms;
        }
        .dp-card:hover .dp-ring { transform: scale(1.07) rotate(-2deg); }
        .dp-inner {
          width: 100%; height: 100%; border-radius: 9999px;
          display: grid; place-items: center;
          background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 60%, black 10%), color-mix(in oklab, var(--gold) 35%, black 30%));
          color: #fff; font-weight: 800; font-size: 26px; letter-spacing: -0.02em;
        }
        .dp-dist {
          position: absolute; top: -6px; right: -6px;
          background: var(--background); color: var(--gold);
          border: 1px solid color-mix(in oklab, var(--gold) 50%, transparent);
          padding: 1px 6px; border-radius: 9999px; font-size: 9px; font-weight: 700;
        }
        .dp-check {
          position: absolute; bottom: 18px; right: -6px;
          display: inline-flex; align-items: center; gap: 3px;
          padding: 3px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700;
          color: #1a1408;
          background: linear-gradient(135deg, color-mix(in oklab, var(--gold) 92%, white 30%), color-mix(in oklab, white 70%, var(--gold) 30%));
          border: 1px solid color-mix(in oklab, var(--gold) 60%, white 20%);
          box-shadow: 0 4px 12px -4px color-mix(in oklab, var(--gold) 55%, transparent);
          transition: transform 150ms;
        }
        .dp-check:hover { transform: translateY(-2px) scale(1.05); }
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
