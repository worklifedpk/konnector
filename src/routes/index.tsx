import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Sparkles, Users, Zap, Shield, Hand, Calendar, Compass, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-radar.jpg";
import { setMode } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const nav = useNavigate();
  const [activeCount, setActiveCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { count } = await supabase
        .from("konnect_users")
        .select("id", { count: "exact", head: true })
        .gt("expires_at", new Date().toISOString());
      if (mounted) setActiveCount(count ?? 0);
    };
    load();
    const ch = supabase
      .channel("landing-active")
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_users" }, load)
      .subscribe();
    const i = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(i);
      supabase.removeChannel(ch);
    };
  }, []);

  const choose = (mode: "event" | "nearby") => {
    setMode(mode);
    nav({ to: "/start" });
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 -z-10">
          <img
            src={heroImg}
            alt="Live city map with glowing pulses of nearby people"
            width={1536}
            height={1024}
            className="h-full w-full object-cover opacity-40"
          />
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
            <span className="text-muted-foreground">{activeCount} live now</span>
          </div>
        </nav>

        <div className="mx-auto grid max-w-7xl gap-12 px-6 pt-10 pb-24 lg:grid-cols-2 lg:items-center lg:pt-20 lg:pb-32">
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

            {/* Mode picker - the user's #1 ask */}
            <div className="mt-10">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                What do you want to use konnect for?
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ModeCard
                  icon={<Calendar className="h-5 w-5" />}
                  title="At an Event"
                  desc="Conference, meetup, party. Find your people in the room."
                  cta="Join Event Mode"
                  variant="gold"
                  onClick={() => choose("event")}
                />
                <ModeCard
                  icon={<Compass className="h-5 w-5" />}
                  title="Nearby"
                  desc="Discover people around your current or chosen location."
                  cta="Go Live Nearby"
                  variant="royal"
                  onClick={() => choose("nearby")}
                />
              </div>
            </div>
          </div>

          {/* Radar visual */}
          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="absolute inset-0 rounded-full border border-gold/20" />
            <div className="absolute inset-8 rounded-full border border-gold/15" />
            <div className="absolute inset-16 rounded-full border border-gold/10" />
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="radar-sweep absolute inset-0 rounded-full" />
            </div>
            {[
              { t: "12%", l: "30%", c: "bg-gold" },
              { t: "60%", l: "20%", c: "bg-primary" },
              { t: "40%", l: "70%", c: "bg-gold" },
              { t: "75%", l: "60%", c: "bg-primary" },
              { t: "25%", l: "82%", c: "bg-gold" },
            ].map((d, i) => (
              <span
                key={i}
                className={`absolute h-2.5 w-2.5 rounded-full ring-pulse ${d.c}`}
                style={{ top: d.t, left: d.l }}
              />
            ))}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card/60 px-4 py-2 text-xs uppercase tracking-widest text-gold backdrop-blur">
              You
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/40 bg-background/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Three steps. Zero friction.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Step n="01" icon={<Sparkles className="h-5 w-5" />} title="Drop your name" desc="Just first name, age, vibe. No email. No password." />
            <Step n="02" icon={<MapPin className="h-5 w-5" />} title="Share location" desc="Use GPS or pick a spot on the map. Stay in control." />
            <Step n="03" icon={<Users className="h-5 w-5" />} title="Meet for real" desc="Match, chat briefly, then show up. Confirm with a gesture." />
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Made for the moment.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Dating", d: "Skip the swipe. Meet now." },
              { t: "New Friends", d: "Coffee, walk, vibe-check." },
              { t: "Startup Networking", d: "Founders & builders nearby." },
              { t: "Events", d: "Find your tribe in the room." },
            ].map((u) => (
              <div key={u.t} className="glass rounded-2xl p-6 transition hover:-translate-y-1 hover:glow-royal">
                <h3 className="font-display text-lg font-semibold text-gold">{u.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{u.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-border/40 bg-background/40 py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 md:grid-cols-3">
          {[
            { i: <Shield className="h-5 w-5" />, t: "Auto-delete in 2h", d: "Your profile and chats vanish. By design." },
            { i: <Hand className="h-5 w-5" />, t: "Gesture verify", d: "Send ✌️ + 👍 to safely confirm in real life." },
            { i: <Zap className="h-5 w-5" />, t: "Real-time only", d: "No history. No archives. Live or gone." },
          ].map((x) => (
            <div key={x.t} className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-gold text-accent-foreground">
                {x.i}
              </span>
              <div>
                <h4 className="font-display text-lg font-semibold">{x.t}</h4>
                <p className="text-sm text-muted-foreground">{x.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-4xl font-extrabold md:text-5xl">
            We don't help you swipe. <br />
            <span className="text-shimmer-gold">We help you show up.</span>
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => choose("nearby")}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-royal px-6 py-3 font-semibold text-primary-foreground glow-royal transition hover:scale-105"
            >
              Go Live <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => choose("event")}
              className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-card/40 px-6 py-3 font-semibold text-gold backdrop-blur transition hover:bg-card/70"
            >
              Join an Event
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        konnect · built for the real world
      </footer>
    </main>
  );
}

function ModeCard({
  icon, title, desc, cta, onClick, variant,
}: {
  icon: React.ReactNode; title: string; desc: string; cta: string;
  onClick: () => void; variant: "gold" | "royal";
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl glass-strong p-5 text-left transition hover:-translate-y-1 ${
        variant === "gold" ? "hover:glow-gold" : "hover:glow-royal"
      }`}
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${variant === "gold" ? "bg-gradient-gold text-accent-foreground" : "bg-gradient-royal text-primary-foreground"}`}>
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${variant === "gold" ? "text-gold" : "text-royal"}`}>
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
