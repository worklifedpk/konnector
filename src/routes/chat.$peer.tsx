import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { ArrowLeft, Send, MessageCircle, MapPin, Lock } from "lucide-react";
import { distKm, formatDist } from "@/lib/dist";
import { useLiveLocation } from "@/lib/useLiveLocation";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/$peer")({
  component: ChatPage,
});

type Msg = {
  id: string;
  from_session: string;
  to_session: string;
  content: string;
  kind: string;
  created_at: string;
};

type Peer = {
  session_id: string;
  name: string;
  age: number | null;
  skills: string | null;
  location_lat: number;
  location_lng: number;
};

type Me = {
  session_id: string;
  location_lat: number;
  location_lng: number;
};

// Curated gestures grouped — Founder/CEO + Public Speaking presets.
const GESTURES = [
  // Founder / CEO
  { kind: "g-steeple", emoji: "🤲", label: "Steeple" },
  { kind: "g-pinch", emoji: "🤌", label: "Precision pinch" },
  { kind: "g-clap", emoji: "👏", label: "Applause" },
  { kind: "g-thinker", emoji: "🤔", label: "Thinking" },
  { kind: "g-point", emoji: "👉", label: "Controlled point" },
  { kind: "g-deal", emoji: "🤝", label: "Deal-making" },
  { kind: "g-power", emoji: "💪", label: "Power pose" },
  { kind: "g-fold", emoji: "🙏", label: "Calm fold" },
  // Event / Public Speaking
  { kind: "g-wave", emoji: "👋", label: "Greeting wave" },
  { kind: "g-open", emoji: "🤗", label: "Open arms" },
  { kind: "g-thumbs", emoji: "👍", label: "Thumbs up" },
  { kind: "g-peace", emoji: "✌️", label: "Peace" },
  { kind: "g-heart", emoji: "🫶", label: "Heart hands" },
  { kind: "g-victory", emoji: "🏆", label: "Victory" },
  { kind: "g-spark", emoji: "✨", label: "Vision" },
  { kind: "g-mic", emoji: "🎤", label: "Keynote" },
];

const CHAT_RADIUS_KM = 1.0; // Chat unlocks only when both are within 1 km

// distKm imported from @/lib/dist

function ChatPage() {
  const { peer } = Route.useParams();
  const nav = useNavigate();
  const me = getSessionId();
  const live = useLiveLocation(true);
  const [meRow, setMeRow] = useState<Me | null>(null);
  const [peerInfo, setPeerInfo] = useState<Peer | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [allowed, setAllowed] = useState<"checking" | "yes" | "no">("checking");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: p }, { data: meData }, { data: req }, { data: m }] = await Promise.all([
        supabase.from("konnect_users").select("session_id,name,age,skills,location_lat,location_lng").eq("session_id", peer).maybeSingle(),
        supabase.from("konnect_users").select("session_id,location_lat,location_lng").eq("session_id", me).maybeSingle(),
        supabase.from("konnect_requests").select("status,from_session,to_session")
          .or(`and(from_session.eq.${me},to_session.eq.${peer}),and(from_session.eq.${peer},to_session.eq.${me})`)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
        supabase.from("konnect_messages").select("*")
          .or(`and(from_session.eq.${me},to_session.eq.${peer}),and(from_session.eq.${peer},to_session.eq.${me})`)
          .order("created_at", { ascending: true }),
      ]);
      if (p) setPeerInfo(p as Peer);
      if (meData) setMeRow(meData as Me);
      setMsgs((m ?? []) as Msg[]);
      setAllowed(req && (req as any).status === "accepted" ? "yes" : "no");
    };
    load();
    const ch = supabase
      .channel(`chat-${[me, peer].sort().join("-")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "konnect_messages" }, (payload) => {
        const m = payload.new as Msg;
        if (
          (m.from_session === me && m.to_session === peer) ||
          (m.from_session === peer && m.to_session === me)
        ) {
          setMsgs((prev) => [...prev, m]);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_requests" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "konnect_users" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, peer]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  const km = useMemo(() => {
    if (!peerInfo) return null;
    // Prefer live GPS for "me" — recomputes on every fix for real-time accuracy.
    const myPoint = live
      ? { lat: live.lat, lng: live.lng }
      : meRow
      ? { lat: meRow.location_lat, lng: meRow.location_lng }
      : null;
    if (!myPoint) return null;
    return distKm(myPoint, { lat: peerInfo.location_lat, lng: peerInfo.location_lng });
  }, [meRow, peerInfo, live]);

  const inRange = km !== null && km <= CHAT_RADIUS_KM;

  const send = async (content: string, kind = "text") => {
    if (!content.trim()) return;
    if (allowed !== "yes") { toast.error("You need an accepted request to chat."); return; }
    if (!inRange) { toast.error(`You must be within ${CHAT_RADIUS_KM} km to chat.`); return; }
    const { error } = await supabase.from("konnect_messages").insert({
      from_session: me, to_session: peer, content: content.slice(0, 500), kind,
    });
    if (error) { toast.error(error.message); return; }
    if (kind === "text") setText("");
  };

  if (allowed === "no") {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass-strong w-full max-w-md rounded-3xl p-8 text-center animate-float-up">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-gold text-accent-foreground">
            <MessageCircle className="h-5 w-5" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">Chat is locked</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a connection request first. Once they accept, your chat opens here.
          </p>
          <button onClick={() => nav({ to: "/live" })} className="btn-gw mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            Back to Discover
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => nav({ to: "/live" })} className="rounded-full p-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-royal font-display font-bold text-primary-foreground">
            {peerInfo?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1">
            <h2 className="font-display text-base font-semibold leading-none">{peerInfo?.name ?? "Stranger"}</h2>
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {km === null ? "locating…" : formatDist(km)}
            </p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[10px] ${inRange ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-gold/30 bg-card/40 text-gold"}`}>
            {inRange ? "in range" : "too far"}
          </span>
        </div>
      </header>

      {!inRange && km !== null && (
        <div className="mx-auto mt-3 w-full max-w-2xl px-4">
          <div className="glass rounded-2xl p-4 text-center text-sm">
            <Lock className="mx-auto mb-2 h-4 w-4 text-gold" />
            You need to be within <span className="text-gold font-semibold">{CHAT_RADIUS_KM} km</span> of {peerInfo?.name ?? "your match"} to chat.
            Currently <span className="text-gold font-semibold">{formatDist(km)}</span> apart — get closer to unlock.
          </div>
        </div>
      )}

      <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6 space-y-3">
        {msgs.length === 0 && inRange && (
          <div className="mt-10 text-center text-sm text-muted-foreground">
            Say hi. Send a ✌️ when you find each other in real life.
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.from_session === me;
          const isGesture = m.kind.startsWith("g-") || m.kind.startsWith("gesture-");
          if (isGesture) {
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-float-up`}>
                <div className="text-6xl drop-shadow-[0_0_20px_rgba(255,200,80,0.5)]">{m.content}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-float-up`}>
              <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm font-medium leading-snug chat-bubble ${
                mine ? "chat-bubble--mine rounded-br-sm" : "chat-bubble--peer rounded-bl-sm"
              }`}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 border-t border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {GESTURES.map((g) => (
              <button key={g.kind} onClick={() => send(g.emoji, g.kind)}
                disabled={!inRange}
                title={g.label}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-gold/30 bg-card/40 text-2xl transition hover:scale-110 hover:bg-gold/10 disabled:opacity-40 disabled:hover:scale-100">
                {g.emoji}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={inRange ? "Type a message..." : "Get within 1 km to chat"}
              maxLength={500}
              disabled={!inRange}
              className="flex-1 rounded-full border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-gold disabled:opacity-50"
            />
            <button type="submit" disabled={!inRange}
              className="btn-gw grid h-11 w-11 place-items-center !rounded-full">
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground">
            Chats vanish with your profile. Stay within {CHAT_RADIUS_KM} km to keep chatting.
          </p>
        </div>
      </div>

      <style>{`
        .chat-bubble {
          color: #1a1408;
          background: linear-gradient(135deg,
            color-mix(in oklab, var(--gold) 92%, white 30%) 0%,
            color-mix(in oklab, white 70%, var(--gold) 30%) 55%,
            color-mix(in oklab, var(--gold) 85%, white 25%) 100%);
          border: 1px solid color-mix(in oklab, var(--gold) 45%, white 25%);
          box-shadow: 0 8px 24px -10px color-mix(in oklab, var(--gold) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.55);
        }
        .chat-bubble--mine { border-color: color-mix(in oklab, var(--gold) 60%, white 20%); }
        .chat-bubble--peer { background: linear-gradient(135deg,
            color-mix(in oklab, white 88%, var(--gold) 15%) 0%,
            color-mix(in oklab, white 96%, var(--gold) 8%) 100%); }
      `}</style>
    </main>
  );
}

void Link;
