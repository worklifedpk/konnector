import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import {
  ArrowLeft, MessageCircle, MapPin, Users, Search, LogOut, Instagram,
  Map as MapIcon, List, Bell, Check, X, Send, Clock,
} from "lucide-react";
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

type Req = {
  id: string;
  from_session: string;
  to_session: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
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
  const me = getSessionId();
  const [meRow, setMeRow] = useState<LiveUser | null>(null);
  const [users, setUsers] = useState<LiveUser[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "event" | "nearby">("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [tab, setTab] = useState<"discover" | "inbox">("discover");

  useEffect(() => {
    if (!me) { nav({ to: "/start" }); return; }

    const load = async () => {
      const [{ data: u }, { data: r }] = await Promise.all([
        supabase.from("konnect_users").select("*")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }),
        supabase.from("konnect_requests").select("*")
          .or(`from_session.eq.${me},to_session.eq.${me}`)
          .gt("expires_at", new Date().toISOString()),
      ]);
      const list = (u ?? []) as LiveUser[];
      const myRow = list.find((x) => x.session_id === me) ?? null;
      setMeRow(myRow);
      if (!myRow) { nav({ to: "/start" }); return; }
      setUsers(list);
      setRequests((r ?? []) as Req[]);
    };
    load();

    const ch = supabase
      .channel("live-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_users" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_requests" }, (payload) => {
        load();
        const n = payload.new as Req | undefined;
        if (n && n.to_session === me && payload.eventType === "INSERT") {
          toast("New chat request", { description: "Someone wants to connect with you." });
        }
        if (n && n.from_session === me && payload.eventType === "UPDATE" && n.status === "accepted") {
          toast.success("Request accepted! Chat is open.");
        }
      })
      .subscribe();
    const i = setInterval(load, 25000);
    return () => { clearInterval(i); supabase.removeChannel(ch); };
  }, [me, nav]);

  const others = useMemo(() => {
    if (!meRow) return [];
    let list = users.filter((u) => u.session_id !== meRow.session_id);
    if (filter === "event") list = list.filter((u) => u.mode.startsWith("event:") && u.mode === meRow.mode);
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
      .map((u) => ({ ...u, _km: distKm({ lat: meRow.location_lat, lng: meRow.location_lng }, { lat: u.location_lat, lng: u.location_lng }) }))
      .sort((a, b) => a._km - b._km);
  }, [users, meRow, filter, query]);

  const reqStatus = (peer: string): "none" | "sent" | "incoming" | "accepted" | "declined" => {
    const r = requests.find((x) =>
      (x.from_session === me && x.to_session === peer) ||
      (x.from_session === peer && x.to_session === me)
    );
    if (!r) return "none";
    if (r.status === "accepted") return "accepted";
    if (r.status === "declined") return "declined";
    if (r.from_session === me) return "sent";
    return "incoming";
  };

  const sendRequest = async (peer: string) => {
    const { error } = await supabase.from("konnect_requests").upsert(
      { from_session: me, to_session: peer, status: "pending" },
      { onConflict: "from_session,to_session" }
    );
    if (error) return toast.error(error.message);
    toast.success("Request sent");
  };

  const respond = async (req: Req, status: "accepted" | "declined") => {
    const { error } = await supabase.from("konnect_requests").update({ status }).eq("id", req.id);
    if (error) return toast.error(error.message);
    if (status === "accepted") {
      toast.success("Connected — opening chat");
      nav({ to: "/chat/$peer", params: { peer: req.from_session } });
    }
  };

  const incomingPending = requests.filter((r) => r.to_session === me && r.status === "pending");
  const acceptedPeers = requests.filter((r) => r.status === "accepted");

  const expiresMs = meRow ? new Date(meRow.expires_at).getTime() - Date.now() : 0;
  const minsLeft = Math.max(0, Math.floor(expiresMs / 60000));

  const leave = async () => {
    if (!meRow) return;
    await supabase.from("konnect_users").delete().eq("session_id", meRow.session_id);
    toast.success("You're offline");
    nav({ to: "/" });
  };

  if (!meRow) return null;
  const isEventMode = meRow.mode.startsWith("event:");
  const eventLabel = isEventMode ? meRow.mode.split(":")[1] : "Nearby";

  return (
    <main className="min-h-screen px-4 py-6 pb-24">
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
              {meRow.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-widest text-gold">Live · {eventLabel}</p>
              <h1 className="font-display text-2xl font-bold">Hey {meRow.name}</h1>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> expires in {minsLeft}m · {others.length} people {isEventMode ? "in event" : "nearby"}
              </p>
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

        {/* Tabs: Discover / Inbox */}
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-card/40 p-1">
          <button onClick={() => setTab("discover")}
            className={`inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              tab === "discover" ? "bg-gradient-royal text-primary-foreground glow-royal" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Users className="h-4 w-4" /> Discover
          </button>
          <button onClick={() => setTab("inbox")}
            className={`relative inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              tab === "inbox" ? "bg-gradient-royal text-primary-foreground glow-royal" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Bell className="h-4 w-4" /> Inbox
            {incomingPending.length > 0 && (
              <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-[10px] font-bold text-accent-foreground">
                {incomingPending.length}
              </span>
            )}
          </button>
        </div>

        {tab === "discover" && (
          <>
            {/* View toggle + search + filters */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, skill, interest..."
                  className="w-full rounded-full border border-border bg-card/40 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-gold" />
              </div>
              <div className="flex items-center gap-1 rounded-full border border-border bg-card/40 p-1">
                <button onClick={() => setView("list")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    view === "list" ? "bg-gradient-royal text-primary-foreground" : "text-muted-foreground"
                  }`}>
                  <List className="h-3.5 w-3.5" /> List
                </button>
                <button onClick={() => setView("map")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    view === "map" ? "bg-gradient-gold text-accent-foreground" : "text-muted-foreground"
                  }`}>
                  <MapIcon className="h-3.5 w-3.5" /> Map
                </button>
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

            {view === "map" && <MapView me={meRow} others={others as any} requests={requests} sendRequest={sendRequest} reqStatus={reqStatus} nav={nav} />}

            {view === "list" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {others.length === 0 && (
                  <div className="col-span-full glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-3 h-6 w-6 text-gold" />
                    No one nearby yet. Share konnect with people around you.
                  </div>
                )}
                {others.map((u) => (
                  <UserCard
                    key={u.id}
                    u={u as any}
                    status={reqStatus(u.session_id)}
                    onRequest={() => sendRequest(u.session_id)}
                    onChat={() => nav({ to: "/chat/$peer", params: { peer: u.session_id } })}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "inbox" && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
                Requests for you ({incomingPending.length})
              </h2>
              <div className="space-y-2">
                {incomingPending.length === 0 && (
                  <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    No incoming requests.
                  </div>
                )}
                {incomingPending.map((r) => {
                  const u = users.find((x) => x.session_id === r.from_session);
                  if (!u) return null;
                  return (
                    <div key={r.id} className="glass rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-royal font-bold text-primary-foreground">
                          {u.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{u.name}{u.age ? `, ${u.age}` : ""}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.skills || "wants to connect"}</p>
                        </div>
                        <button onClick={() => respond(r, "declined")}
                          className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                        <button onClick={() => respond(r, "accepted")}
                          className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-gold text-accent-foreground glow-gold">
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
                Open chats ({acceptedPeers.length})
              </h2>
              <div className="space-y-2">
                {acceptedPeers.length === 0 && (
                  <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    No open chats yet. Send a request from Discover.
                  </div>
                )}
                {acceptedPeers.map((r) => {
                  const peerId = r.from_session === me ? r.to_session : r.from_session;
                  const u = users.find((x) => x.session_id === peerId);
                  if (!u) return null;
                  return (
                    <button key={r.id} onClick={() => nav({ to: "/chat/$peer", params: { peer: peerId } })}
                      className="flex w-full items-center gap-3 rounded-2xl glass p-4 text-left transition hover:-translate-y-0.5 hover:glow-royal">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-gold text-accent-foreground font-bold">
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.skills || "Tap to chat"}</p>
                      </div>
                      <MessageCircle className="h-4 w-4 text-gold" />
                    </button>
                  );
                })}

                {/* Outgoing pending */}
                {requests.filter((r) => r.from_session === me && r.status === "pending").map((r) => {
                  const u = users.find((x) => x.session_id === r.to_session);
                  if (!u) return null;
                  return (
                    <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/20 p-4 text-sm text-muted-foreground">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-card font-bold">{u.name[0]}</div>
                      <span className="flex-1">Waiting for {u.name}…</span>
                      <span className="rounded-full border border-gold/30 px-2 py-0.5 text-[10px] text-gold">pending</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

/* ---------- Map View ---------- */

function MapView({
  me, others, requests, sendRequest, reqStatus, nav,
}: {
  me: LiveUser;
  others: (LiveUser & { _km: number })[];
  requests: Req[];
  sendRequest: (peer: string) => void;
  reqStatus: (peer: string) => "none" | "sent" | "incoming" | "accepted" | "declined";
  nav: ReturnType<typeof useNavigate>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // dynamic max radius based on farthest person, min 1km, max 10km
  const maxKm = Math.min(10, Math.max(1, Math.ceil((others[others.length - 1]?._km ?? 1) * 1.1)));

  const sel = others.find((o) => o.session_id === selected);

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-3xl border border-gold/20 glass-strong">
        {/* Map area */}
        <div className="relative h-[420px] sm:h-[520px] grid-bg">
          {/* radar sweep */}
          <div className="absolute inset-0 radar-sweep opacity-25" />

          {/* distance rings */}
          {[0.33, 0.66, 1].map((p, i) => (
            <div key={i} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20"
              style={{ width: `${p * 80}%`, height: `${p * 80}%` }}>
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-gold/70">
                {(maxKm * p).toFixed(1)} km
              </span>
            </div>
          ))}

          {/* compass */}
          <div className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-gold/30 bg-background/60 text-[10px] text-gold backdrop-blur">
            N
          </div>

          {/* "you" marker */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-accent-foreground font-bold ring-pulse glow-gold">
              {me.name[0]?.toUpperCase()}
            </div>
          </div>

          {/* others */}
          {others.slice(0, 60).map((u) => {
            const km = Math.min(maxKm, u._km || 0.05);
            const r = (km / maxKm) * 38; // % of container half
            // deterministic pseudo-angle per id to spread out
            const angle = (parseInt(u.id.slice(0, 8), 16) % 360) * (Math.PI / 180);
            const x = 50 + Math.cos(angle) * r;
            const y = 50 + Math.sin(angle) * r;
            const status = reqStatus(u.session_id);
            const color =
              status === "accepted" ? "bg-gold glow-gold"
              : status === "sent" ? "bg-yellow-400/80"
              : status === "incoming" ? "bg-emerald-400 glow-gold"
              : "bg-primary glow-royal";
            const isSel = selected === u.session_id;
            return (
              <button key={u.id}
                onClick={() => setSelected(isSel ? null : u.session_id)}
                title={`${u.name} · ${km.toFixed(2)} km`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 transition ${isSel ? "z-20 scale-125" : "z-10 hover:scale-125"}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div className={`grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-primary-foreground ring-pulse ${color}`}>
                  {u.name[0]?.toUpperCase()}
                </div>
                {(isSel || others.length < 8) && (
                  <span className="mt-1 block rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground backdrop-blur">
                    {u.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <Legend color="bg-gold" label="You" />
          <Legend color="bg-primary" label="Available" />
          <Legend color="bg-yellow-400/80" label="Request sent" />
          <Legend color="bg-emerald-400" label="Wants to connect" />
          <Legend color="bg-gold" label="Connected" />
          <span className="ml-auto">Tap a dot to view profile</span>
        </div>
      </div>

      {/* Selected user popover */}
      {sel && (
        <div className="mt-4 animate-float-up">
          <UserCard
            u={sel}
            status={reqStatus(sel.session_id)}
            onRequest={() => sendRequest(sel.session_id)}
            onChat={() => nav({ to: "/chat/$peer", params: { peer: sel.session_id } })}
          />
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
    </span>
  );
}

/* ---------- User Card ---------- */

function UserCard({
  u, status, onRequest, onChat,
}: {
  u: LiveUser & { _km: number };
  status: "none" | "sent" | "incoming" | "accepted" | "declined";
  onRequest: () => void;
  onChat: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-4 transition hover:-translate-y-1 hover:glow-royal">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-royal font-display text-lg font-bold text-primary-foreground">
          {u.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-base font-semibold truncate">{u.name}</h3>
            {u.age && <span className="text-xs text-muted-foreground">{u.age}</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{u.skills || u.gender || "Available now"}</p>
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
        {status === "accepted" && (
          <button onClick={onChat} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-royal px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02]">
            <MessageCircle className="h-4 w-4" /> Open Chat
          </button>
        )}
        {status === "none" && (
          <button onClick={onRequest} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-gold px-3 py-2 text-sm font-semibold text-accent-foreground glow-gold transition hover:scale-[1.02]">
            <Send className="h-4 w-4" /> Send Request
          </button>
        )}
        {status === "sent" && (
          <button disabled className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-card/40 px-3 py-2 text-sm font-semibold text-gold">
            <Clock className="h-4 w-4" /> Pending…
          </button>
        )}
        {status === "incoming" && (
          <button onClick={onChat} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 px-3 py-2 text-sm font-semibold text-emerald-300">
            Respond in Inbox
          </button>
        )}
        {status === "declined" && (
          <button disabled className="flex-1 rounded-xl border border-border bg-card/40 px-3 py-2 text-sm text-muted-foreground">
            Declined
          </button>
        )}
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
