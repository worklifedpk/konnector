import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId, clearSession } from "@/lib/session";
import { distKm, formatDist } from "@/lib/dist";
import {
  ArrowLeft, MessageCircle, MapPin, Users, Search, LogOut, Link2, Mail,
  Map as MapIcon, List, Bell, Check, X, Send, Clock, Plus, UserPlus, Crown,
  ChevronLeft, ChevronRight, Sparkles, Hash, Share2,
} from "lucide-react";
import { toast } from "sonner";

// Normalize a free-form social handle (or URL) to a clickable URL.
function socialUrl(s: string): string {
  const v = s.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("@")) return `https://instagram.com/${v.slice(1)}`;
  return `https://${v}`;
}

export const Route = createFileRoute("/live")({ component: LivePage });

const sb = supabase as any;

type LiveUser = {
  id: string; session_id: string; name: string;
  age: number | null; gender: string | null;
  intent: string; mode: string;
  location_name: string | null; location_lat: number; location_lng: number;
  location_address?: string | null; location_accuracy_m?: number | null;
  skills: string | null; instagram: string | null; email: string | null;
  interests: string[] | null; expires_at: string;
};

type Req = {
  id: string; from_session: string; to_session: string;
  status: "pending" | "accepted" | "declined"; created_at: string;
};

type Group = {
  id: string; owner_session: string; name: string;
  event_type: string; mode: string;
  location_name: string | null; location_lat: number; location_lng: number;
  max_size: number; description: string | null; expires_at: string;
};

type GroupReq = {
  id: string; group_id: string; from_session: string;
  to_session: string | null; kind: "join" | "invite";
  status: "pending" | "accepted" | "declined";
};

type GroupMember = { id: string; group_id: string; session_id: string };

// distKm + formatDist imported from @/lib/dist

function LivePage() {
  const nav = useNavigate();
  const me = getSessionId();
  const [meRow, setMeRow] = useState<LiveUser | null>(null);
  const [users, setUsers] = useState<LiveUser[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupReqs, setGroupReqs] = useState<GroupReq[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "event" | "nearby">("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [tab, setTab] = useState<"discover" | "groups" | "inbox">("discover");
  const [showCreate, setShowCreate] = useState(false);
  const [profileOpen, setProfileOpen] = useState<LiveUser | null>(null);
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me) { nav({ to: "/start" }); return; }

    const load = async () => {
      const nowIso = new Date().toISOString();
      const [u, r, g, gr, gm] = await Promise.all([
        sb.from("konnect_users").select("*").gt("expires_at", nowIso).order("created_at", { ascending: false }),
        sb.from("konnect_requests").select("*").or(`from_session.eq.${me},to_session.eq.${me}`).gt("expires_at", nowIso),
        sb.from("konnect_groups").select("*").gt("expires_at", nowIso).order("created_at", { ascending: false }),
        sb.from("konnect_group_requests").select("*").gt("expires_at", nowIso),
        sb.from("konnect_group_members").select("*").gt("expires_at", nowIso),
      ]);
      const list = (u.data ?? []) as LiveUser[];
      const myRow = list.find((x) => x.session_id === me) ?? null;
      setMeRow(myRow);
      if (!myRow) { nav({ to: "/start" }); return; }
      setUsers(list);
      setRequests((r.data ?? []) as Req[]);
      setGroups((g.data ?? []) as Group[]);
      setGroupReqs((gr.data ?? []) as GroupReq[]);
      setGroupMembers((gm.data ?? []) as GroupMember[]);
    };
    load();

    const ch = supabase
      .channel("live-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_users" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_groups" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_group_requests" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_group_members" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_requests" }, (payload: any) => {
        load();
        const n = payload.new as Req | undefined;
        if (n && n.to_session === me && payload.eventType === "INSERT") {
          toast("New chat request", { description: "Someone wants to connect." });
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

  const sendRequest = async (peer: string, intro?: string) => {
    const { error } = await sb.from("konnect_requests").insert({ from_session: me, to_session: peer, status: "pending" });
    if (error) return toast.error(error.message);
    if (intro && intro.trim()) {
      // pre-send the intro message; it becomes visible once the request is accepted.
      await sb.from("konnect_messages").insert({
        from_session: me, to_session: peer, content: intro.trim().slice(0, 300), kind: "text",
      });
    }
    toast.success("Request sent");
  };

  const respond = async (req: Req, status: "accepted" | "declined") => {
    const { error } = await sb.from("konnect_requests").update({ status }).eq("id", req.id);
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
  const hLeft = Math.floor(minsLeft / 60);
  const mLeft = minsLeft % 60;

  const leave = async () => {
    if (!meRow) return;
    await sb.from("konnect_users").delete().eq("session_id", meRow.session_id);
    clearSession();
    toast.success("You're offline");
    nav({ to: "/" });
  };

  // Groups helpers
  const memberCount = (gid: string) => groupMembers.filter((m) => m.group_id === gid).length + 1; // +owner
  const myGroupReq = (gid: string) => groupReqs.find((r) => r.group_id === gid && r.from_session === me && r.kind === "join");
  const isMember = (gid: string) =>
    groupMembers.some((m) => m.group_id === gid && m.session_id === me) ||
    groups.some((g) => g.id === gid && g.owner_session === me);
  const myOwnedGroups = groups.filter((g) => g.owner_session === me);
  const incomingGroupReqs = groupReqs.filter((r) =>
    r.status === "pending" && r.kind === "join" &&
    groups.some((g) => g.id === r.group_id && g.owner_session === me)
  );
  const incomingInvites = groupReqs.filter((r) =>
    r.status === "pending" && r.kind === "invite" && r.to_session === me
  );

  const requestJoinGroup = async (gid: string) => {
    const { error } = await sb.from("konnect_group_requests").insert({ group_id: gid, from_session: me, kind: "join", status: "pending" });
    if (error) return toast.error(error.message);
    toast.success("Join request sent");
  };

  const inviteToGroup = async (gid: string, peer: string) => {
    // prevent duplicates
    const dup = groupReqs.find((r) => r.group_id === gid && r.to_session === peer && r.kind === "invite" && r.status !== "declined");
    if (dup) return toast("Already invited");
    const { error } = await sb.from("konnect_group_requests").insert({ group_id: gid, from_session: me, to_session: peer, kind: "invite", status: "pending" });
    if (error) return toast.error(error.message);
    toast.success("Invite sent");
  };

  const respondGroupReq = async (req: GroupReq, status: "accepted" | "declined") => {
    const { error } = await sb.from("konnect_group_requests").update({ status }).eq("id", req.id);
    if (error) return toast.error(error.message);
    if (status === "accepted") {
      const g = groups.find((x) => x.id === req.group_id);
      if (g && memberCount(g.id) >= g.max_size) {
        toast.error("Group is full");
        return;
      }
      // For invites the joining session is to_session; for join requests it's from_session
      const joinerSession = req.kind === "invite" ? (req.to_session ?? me) : req.from_session;
      await sb.from("konnect_group_members").insert({ group_id: req.group_id, session_id: joinerSession });
      toast.success(req.kind === "invite" ? "Joined group" : "Member added");
    }
  };

  if (!meRow) return null;
  const isEventMode = meRow.mode.startsWith("event:");
  const eventLabel = isEventMode ? meRow.mode.split(":")[1] : "Nearby";

  return (
    <main className="min-h-screen px-4 py-6 pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <button onClick={leave} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive">
            <LogOut className="h-3.5 w-3.5" /> Go offline
          </button>
        </div>

        <div className="mt-5 glass-strong rounded-3xl p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-gold text-accent-foreground font-display text-xl font-bold">
              {meRow.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-widest text-gold">Live · {eventLabel}</p>
              <h1 className="font-display text-2xl font-bold">Hey {meRow.name}</h1>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> expires in {hLeft > 0 ? `${hLeft}h ` : ""}{mLeft}m · {others.length} people {isEventMode ? "in event" : "nearby"}
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

        {/* Tabs */}
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-card/40 p-1">
          <TabBtn active={tab === "discover"} onClick={() => setTab("discover")} icon={<Users className="h-4 w-4" />} label="Discover" />
          <TabBtn active={tab === "groups"} onClick={() => setTab("groups")} icon={<UserPlus className="h-4 w-4" />} label="Groups" badge={incomingGroupReqs.length || undefined} />
          <TabBtn active={tab === "inbox"} onClick={() => setTab("inbox")} icon={<Bell className="h-4 w-4" />} label="Inbox" badge={incomingPending.length || undefined} />
        </div>

        {tab === "discover" && (
          <>
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

            {/* Sliding profile carousel — nearest live people */}
            {others.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-display text-sm uppercase tracking-widest text-gold inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Nearest live · tap to connect
                  </h3>
                  <div className="hidden sm:flex gap-1">
                    <button onClick={() => sliderRef.current?.scrollBy({ left: -260, behavior: "smooth" })} className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card/40 text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => sliderRef.current?.scrollBy({ left: 260, behavior: "smooth" })} className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card/40 text-muted-foreground hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
                <div ref={sliderRef} className="profile-slider flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory">
                  {others.slice(0, 30).map((u) => (
                    <button key={u.id} onClick={() => setProfileOpen(u as LiveUser)}
                      className="snap-start shrink-0 w-[220px] rounded-2xl glass p-3 text-left transition hover:-translate-y-1 hover:glow-gold">
                      <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-royal grid place-items-center">
                        <span className="font-display text-4xl font-bold text-primary-foreground">
                          {u.name[0]?.toUpperCase()}
                        </span>
                        <span className="absolute top-2 right-2 rounded-full bg-background/70 px-2 py-0.5 text-[10px] text-gold backdrop-blur inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {formatDist(u._km)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <p className="font-semibold truncate">{u.name}{u.age ? `, ${u.age}` : ""}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{u.skills || u.gender || "Available now"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === "map" && <MapView me={meRow} others={others as any} sendRequest={sendRequest} reqStatus={reqStatus} nav={nav} />}

            {view === "list" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {others.length === 0 && (
                  <div className="col-span-full glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-3 h-6 w-6 text-gold" />
                    No one nearby yet. Share konnect with people around you.
                  </div>
                )}
                {others.map((u) => (
                  <UserCard key={u.id} u={u as any}
                    status={reqStatus(u.session_id)}
                    onRequest={() => setProfileOpen(u as LiveUser)}
                    onChat={() => nav({ to: "/chat/$peer", params: { peer: u.session_id } })}
                    canInvite={myOwnedGroups.length > 0}
                    onInvite={() => {
                      const g = myOwnedGroups[0];
                      if (g) inviteToGroup(g.id, u.session_id);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "groups" && (
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Groups</h2>
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-gold px-4 py-2 text-sm font-semibold text-accent-foreground glow-gold transition hover:scale-[1.02]">
                <Plus className="h-4 w-4" /> Create Group
              </button>
            </div>

            {/* incoming join requests for groups I own */}
            {incomingGroupReqs.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-2 text-xs uppercase tracking-widest text-gold">Join requests</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {incomingGroupReqs.map((r) => {
                    const u = users.find((x) => x.session_id === r.from_session);
                    const g = groups.find((x) => x.id === r.group_id);
                    if (!u || !g) return null;
                    return (
                      <div key={r.id} className="glass rounded-2xl p-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-royal font-bold text-primary-foreground">
                            {u.name[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{u.name} → {g.name}</p>
                            <p className="text-[11px] text-muted-foreground">{memberCount(g.id)}/{g.max_size} members</p>
                          </div>
                          <button onClick={() => respondGroupReq(r, "declined")}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                          </button>
                          <button onClick={() => respondGroupReq(r, "accepted")}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-gold text-accent-foreground">
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.length === 0 && (
                <div className="col-span-full glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
                  <UserPlus className="mx-auto mb-3 h-6 w-6 text-gold" />
                  No active groups. Be the first to create one.
                </div>
              )}
              {groups.map((g) => {
                const owner = users.find((u) => u.session_id === g.owner_session);
                const km = distKm({ lat: meRow.location_lat, lng: meRow.location_lng }, { lat: g.location_lat, lng: g.location_lng });
                const mine = g.owner_session === me;
                const member = isMember(g.id);
                const myr = myGroupReq(g.id);
                const full = memberCount(g.id) >= g.max_size;
                return (
                  <div key={g.id} className="glass rounded-2xl p-4 transition hover:-translate-y-1 hover:glow-royal">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-gold">{g.event_type}</p>
                        <h3 className="font-display text-base font-semibold truncate">{g.name}</h3>
                      </div>
                      {mine && <Crown className="h-4 w-4 text-gold shrink-0" />}
                    </div>
                    {g.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{g.description}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {memberCount(g.id)}/{g.max_size}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {formatDist(km)}</span>
                      {owner && <span>by {owner.name}</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {mine ? (
                        <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs text-gold">You're the host</span>
                      ) : member ? (
                        <span className="inline-block rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">Member</span>
                      ) : myr?.status === "pending" ? (
                        <span className="inline-block rounded-full border border-gold/30 bg-card/40 px-3 py-1.5 text-xs text-gold">Request pending…</span>
                      ) : myr?.status === "declined" ? (
                        <span className="inline-block rounded-full border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground">Declined</span>
                      ) : full ? (
                        <span className="inline-block rounded-full border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground">Full</span>
                      ) : (
                        <button onClick={() => requestJoinGroup(g.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-royal px-4 py-1.5 text-xs font-semibold text-primary-foreground glow-royal transition hover:scale-[1.02]">
                          <Send className="h-3 w-3" /> Request to Join
                        </button>
                      )}
                      {(mine || member) && (
                        <button onClick={() => setChatGroup(g)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20">
                          <Hash className="h-3 w-3" /> Group chat
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const url = `${window.location.origin}/live?join=${g.id}`;
                          try {
                            if ((navigator as any).share) await (navigator as any).share({ title: `Join ${g.name} on konnect`, url });
                            else { await navigator.clipboard.writeText(url); toast.success("Invite link copied"); }
                          } catch {}
                        }}
                        title="Share invite link"
                        className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-card/40 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/10">
                        <Share2 className="h-3 w-3" /> Share
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "inbox" && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {incomingInvites.length > 0 && (
              <section className="md:col-span-2">
                <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
                  Group invites ({incomingInvites.length})
                </h2>
                <div className="grid gap-2 md:grid-cols-2">
                  {incomingInvites.map((r) => {
                    const g = groups.find((x) => x.id === r.group_id);
                    const owner = g ? users.find((u) => u.session_id === g.owner_session) : null;
                    if (!g) return null;
                    return (
                      <div key={r.id} className="glass rounded-2xl p-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-gold text-accent-foreground"><Crown className="h-4 w-4" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">Invite to {g.name}</p>
                            <p className="text-[11px] text-muted-foreground">from {owner?.name ?? "host"} · {memberCount(g.id)}/{g.max_size}</p>
                          </div>
                          <button onClick={() => respondGroupReq(r, "declined")} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                          <button onClick={() => respondGroupReq(r, "accepted")} className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-gold text-accent-foreground"><Check className="h-4 w-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            <section>
              <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
                Requests for you ({incomingPending.length})
              </h2>
              <div className="space-y-2">
                {incomingPending.length === 0 && (
                  <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">No incoming requests.</div>
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
                  <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">No open chats yet.</div>
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

      {showCreate && (
        <CreateGroupDialog me={meRow} onClose={() => setShowCreate(false)} />
      )}

      {profileOpen && (
        <ProfileDialog
          u={profileOpen}
          me={meRow}
          status={reqStatus(profileOpen.session_id)}
          onClose={() => setProfileOpen(null)}
          onSendRequest={async (intro) => {
            await sendRequest(profileOpen.session_id, intro);
            setProfileOpen(null);
          }}
          onChat={() => {
            const sid = profileOpen.session_id;
            setProfileOpen(null);
            nav({ to: "/chat/$peer", params: { peer: sid } });
          }}
        />
      )}

      {chatGroup && (
        <GroupChatDialog
          group={chatGroup}
          me={meRow}
          users={users}
          onClose={() => setChatGroup(null)}
        />
      )}

      <style>{`
        .profile-slider::-webkit-scrollbar { height: 6px; }
        .profile-slider::-webkit-scrollbar-thumb { background: color-mix(in oklab, var(--gold) 40%, transparent); border-radius: 9999px; }
      `}</style>
    </main>
  );
}

function TabBtn({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button onClick={onClick}
      className={`relative inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
        active ? "bg-gradient-royal text-primary-foreground glow-royal" : "text-muted-foreground hover:text-foreground"
      }`}>
      {icon} {label}
      {badge ? (
        <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-[10px] font-bold text-accent-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

const EVENT_TYPES = [
  "College Fest", "Concert / DJ Night", "Club / Nightlife",
  "Tech Event / Hackathon", "Exhibition / Conference",
  "Marriage / Wedding", "Birthday Party", "House Party",
  "Travel Buddy", "Custom",
];

function CreateGroupDialog({ me, onClose }: { me: LiveUser; onClose: () => void }) {
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("College Fest");
  const [description, setDescription] = useState("");
  const [maxSize, setMaxSize] = useState(10);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast.error("Group name required");
    if (maxSize < 2 || maxSize > 100) return toast.error("Size must be 2–100");
    setSaving(true);
    const { error } = await sb.from("konnect_groups").insert({
      owner_session: me.session_id,
      name: name.trim().slice(0, 60),
      event_type: eventType,
      mode: me.mode,
      location_name: me.location_name,
      location_lat: me.location_lat,
      location_lng: me.location_lng,
      max_size: maxSize,
      description: description.trim().slice(0, 200) || null,
      expires_at: me.expires_at,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Group created");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur p-4" onClick={onClose}>
      <div className="w-full max-w-md glass-strong rounded-3xl p-6 animate-float-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Create Group</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <label className="mt-4 block text-xs uppercase tracking-widest text-gold">Type</label>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-border bg-card/40 px-3 py-2.5 text-sm outline-none focus:border-gold">
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className="mt-4 block text-xs uppercase tracking-widest text-gold">Group name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          placeholder="e.g. Hackathon Team Alpha"
          className="mt-1.5 w-full rounded-xl border border-border bg-card/40 px-3 py-2.5 text-sm outline-none focus:border-gold" />

        <label className="mt-4 block text-xs uppercase tracking-widest text-gold">Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2}
          placeholder="What's the vibe? What are you looking for?"
          className="mt-1.5 w-full rounded-xl border border-border bg-card/40 px-3 py-2.5 text-sm outline-none focus:border-gold" />

        <label className="mt-4 block text-xs uppercase tracking-widest text-gold">Group size (2 – 100)</label>
        <div className="mt-1.5 flex items-center gap-3">
          <input type="range" min={2} max={100} value={maxSize} onChange={(e) => setMaxSize(parseInt(e.target.value))}
            className="flex-1 accent-[var(--gold)]" />
          <span className="w-12 rounded-lg border border-gold/30 bg-card/40 text-center py-1 text-sm font-semibold text-gold">{maxSize}</span>
        </div>

        <button onClick={create} disabled={saving}
          className="mt-6 w-full rounded-2xl px-6 py-3 font-display text-base font-bold transition hover:scale-[1.01] disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, color-mix(in oklab, var(--gold) 92%, white 30%), color-mix(in oklab, white 70%, var(--gold) 30%), color-mix(in oklab, var(--gold) 88%, white 25%))",
            color: "#1a1408",
            boxShadow: "0 10px 30px -8px color-mix(in oklab, var(--gold) 45%, transparent)",
          }}>
          {saving ? "Creating…" : "Create Group"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Map View ---------- */

function MapView({
  me, others, sendRequest, reqStatus, nav,
}: {
  me: LiveUser;
  others: (LiveUser & { _km: number })[];
  sendRequest: (peer: string) => void;
  reqStatus: (peer: string) => "none" | "sent" | "incoming" | "accepted" | "declined";
  nav: ReturnType<typeof useNavigate>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const maxKm = Math.min(10, Math.max(1, Math.ceil((others[others.length - 1]?._km ?? 1) * 1.1)));
  const sel = others.find((o) => o.session_id === selected);

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-3xl border border-gold/20 glass-strong">
        <div className="relative h-[420px] sm:h-[520px] grid-bg">
          <div className="absolute inset-0 radar-sweep opacity-25" />
          {[0.33, 0.66, 1].map((p, i) => (
            <div key={i} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20"
              style={{ width: `${p * 80}%`, height: `${p * 80}%` }}>
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-gold/70">
                {(maxKm * p).toFixed(1)} km
              </span>
            </div>
          ))}
          <div className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-gold/30 bg-background/60 text-[10px] text-gold backdrop-blur">N</div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-accent-foreground font-bold ring-pulse glow-gold">
              {me.name[0]?.toUpperCase()}
            </div>
          </div>
          {others.slice(0, 60).map((u) => {
            const km = Math.min(maxKm, u._km || 0.05);
            const r = (km / maxKm) * 38;
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
              <button key={u.id} onClick={() => setSelected(isSel ? null : u.session_id)}
                title={`${u.name} · ${km.toFixed(2)} km`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 transition ${isSel ? "z-20 scale-125" : "z-10 hover:scale-125"}`}
                style={{ left: `${x}%`, top: `${y}%` }}>
                <div className={`grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-primary-foreground ring-pulse ${color}`}>
                  {u.name[0]?.toUpperCase()}
                </div>
                {(isSel || others.length < 8) && (
                  <span className="mt-1 block rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground backdrop-blur">{u.name}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <Legend color="bg-gold" label="You" />
          <Legend color="bg-primary" label="Available" />
          <Legend color="bg-yellow-400/80" label="Request sent" />
          <Legend color="bg-emerald-400" label="Wants to connect" />
          <span className="ml-auto">Tap a dot to view profile</span>
        </div>
      </div>

      {sel && (
        <div className="mt-4 animate-float-up">
          <UserCard u={sel}
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

function UserCard({
  u, status, onRequest, onChat, onInvite, canInvite,
}: {
  u: LiveUser & { _km: number };
  status: "none" | "sent" | "incoming" | "accepted" | "declined";
  onRequest: () => void;
  onChat: () => void;
  onInvite?: () => void;
  canInvite?: boolean;
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
            <MapPin className="h-3 w-3" /> {formatDist(u._km)}
            {u.location_accuracy_m != null && <span className="text-muted-foreground">±{Math.round(u.location_accuracy_m)}m</span>}
          </div>
          {u.email && (
            <a href={`mailto:${u.email}`} className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground hover:text-foreground">
              <Mail className="h-3 w-3 text-gold" /> {u.email}
            </a>
          )}
          {u.instagram && (
            <a href={socialUrl(u.instagram)} target="_blank" rel="noreferrer"
              className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground hover:text-foreground">
              <Link2 className="h-3 w-3 text-gold" /> {u.instagram.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>
      {u.interests && u.interests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {u.interests.slice(0, 4).map((i) => (
            <span key={i} className="rounded-full border border-border bg-card/40 px-2 py-0.5 text-[10px] text-muted-foreground">{i}</span>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {status === "accepted" && (
          <button onClick={onChat} className="flex-1 btn-gw inline-flex items-center justify-center gap-2 px-3 py-2 text-sm">
            <MessageCircle className="h-4 w-4" /> Open Chat
          </button>
        )}
        {status === "none" && (
          <button onClick={onRequest} className="flex-1 btn-gw inline-flex items-center justify-center gap-2 px-3 py-2 text-sm">
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
        {canInvite && onInvite && (
          <button onClick={onInvite} title="Invite to your group"
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-gold/40 bg-card/40 px-3 py-2 text-xs font-semibold text-gold hover:bg-gold/10">
            <UserPlus className="h-3.5 w-3.5" /> Invite
          </button>
        )}
      </div>
    </div>
  );
}


/* ---------- Profile Dialog (slide-up) ---------- */

function ProfileDialog({
  u, me, status, onClose, onSendRequest, onChat,
}: {
  u: LiveUser;
  me: LiveUser;
  status: "none" | "sent" | "incoming" | "accepted" | "declined";
  onClose: () => void;
  onSendRequest: (intro: string) => void | Promise<void>;
  onChat: () => void;
}) {
  const [intro, setIntro] = useState("");
  const [sending, setSending] = useState(false);
  const km = distKm({ lat: me.location_lat, lng: me.location_lng }, { lat: u.location_lat, lng: u.location_lng });

  const send = async () => {
    setSending(true);
    await onSendRequest(intro);
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-background/80 backdrop-blur p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md glass-strong rounded-t-3xl sm:rounded-3xl p-6 animate-float-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Profile</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-royal font-display text-2xl font-bold text-primary-foreground">
            {u.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold truncate">{u.name}{u.age ? `, ${u.age}` : ""}</p>
            <p className="truncate text-xs text-muted-foreground">{u.skills || u.gender || "Available now"}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-gold">
              <MapPin className="h-3 w-3" /> {formatDist(km)}
              {u.location_accuracy_m != null && <span className="text-muted-foreground">· ±{Math.round(u.location_accuracy_m)}m</span>}
            </p>
          </div>
        </div>

        {u.location_address && (
          <p className="mt-3 text-xs text-muted-foreground truncate">{u.location_address}</p>
        )}

        {u.interests && u.interests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {u.interests.map((i) => (
              <span key={i} className="rounded-full border border-border bg-card/40 px-2 py-0.5 text-[11px] text-muted-foreground">{i}</span>
            ))}
          </div>
        )}

        {status === "accepted" ? (
          <button onClick={onChat} className="btn-gw mt-6 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm">
            <MessageCircle className="h-4 w-4" /> Open Chat
          </button>
        ) : status === "sent" ? (
          <div className="mt-6 rounded-2xl border border-gold/30 bg-card/40 p-4 text-center text-sm text-gold">
            <Clock className="mx-auto mb-1 h-4 w-4" /> Waiting for {u.name} to accept…
          </div>
        ) : status === "incoming" ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-center text-sm text-emerald-300">
            They want to connect. Open Inbox to accept.
          </div>
        ) : status === "declined" ? (
          <div className="mt-6 rounded-2xl border border-border bg-card/40 p-4 text-center text-sm text-muted-foreground">
            Request was declined.
          </div>
        ) : (
          <>
            <label className="mt-5 block text-xs uppercase tracking-widest text-gold">Say hi (optional)</label>
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={300} rows={3}
              placeholder={`Hi ${u.name}! I'm at the same spot — want to meet?`}
              className="mt-1.5 w-full rounded-xl border border-border bg-card/40 px-3 py-2.5 text-sm outline-none focus:border-gold" />
            <button onClick={send} disabled={sending}
              className="btn-gw mt-4 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold disabled:opacity-60">
              <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send Request"}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              When they accept, your chat opens automatically.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Group Chat Dialog ---------- */

type GMsg = {
  id: string; group_id: string; from_session: string;
  content: string; kind: string; created_at: string;
};

function GroupChatDialog({
  group, me, users, onClose,
}: {
  group: Group;
  me: LiveUser;
  users: LiveUser[];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<GMsg[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.from("konnect_group_messages")
        .select("*")
        .eq("group_id", group.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      setMessages((data ?? []) as GMsg[]);
    };
    load();
    const ch = supabase
      .channel(`group-${group.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "konnect_group_messages", filter: `group_id=eq.${group.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as GMsg])
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [group.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = text.trim();
    if (!c) return;
    const { error } = await sb.from("konnect_group_messages").insert({
      group_id: group.id, from_session: me.session_id, content: c.slice(0, 500), kind: "text",
    });
    if (error) return toast.error(error.message);
    setText("");
  };

  const nameOf = (sid: string) => sid === me.session_id ? "You" : (users.find((u) => u.session_id === sid)?.name ?? "Member");

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-background/80 backdrop-blur p-0 sm:p-4" onClick={onClose}>
      <div className="flex w-full max-w-lg h-[80vh] sm:h-[600px] flex-col overflow-hidden glass-strong rounded-t-3xl sm:rounded-3xl animate-float-up" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-gold text-accent-foreground"><Hash className="h-4 w-4" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-gold">{group.event_type}</p>
            <h2 className="font-display text-base font-semibold truncate">{group.name}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">No messages yet — say hi to the group.</p>
          )}
          {messages.map((m) => {
            const mine = m.from_session === me.session_id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? "bg-gradient-royal text-primary-foreground rounded-br-sm" : "glass text-foreground rounded-bl-sm"
                }`}>
                  {!mine && <p className="text-[10px] font-semibold text-gold mb-0.5">{nameOf(m.from_session)}</p>}
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
            placeholder="Message the group…"
            className="flex-1 rounded-full border border-border bg-card/60 px-4 py-2.5 text-sm outline-none focus:border-gold" />
          <button type="submit" className="btn-gw grid h-10 w-10 place-items-center !rounded-full">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
