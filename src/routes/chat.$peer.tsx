import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { ArrowLeft, Send, Hand, ThumbsUp, Eye, MessageCircle } from "lucide-react";
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
};

const GESTURES = [
  { kind: "gesture-peace", emoji: "✌️", label: "Two fingers" },
  { kind: "gesture-thumb", emoji: "👍", label: "Good vibes" },
  { kind: "gesture-eye", emoji: "👀", label: "I see you" },
];

function ChatPage() {
  const { peer } = Route.useParams();
  const nav = useNavigate();
  const me = getSessionId();
  const [peerInfo, setPeerInfo] = useState<Peer | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [allowed, setAllowed] = useState<"checking" | "yes" | "no">("checking");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: p }, { data: req }, { data: m }] = await Promise.all([
        supabase.from("konnect_users").select("session_id,name,age,skills").eq("session_id", peer).maybeSingle(),
        supabase.from("konnect_requests").select("status,from_session,to_session")
          .or(`and(from_session.eq.${me},to_session.eq.${peer}),and(from_session.eq.${peer},to_session.eq.${me})`)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
        supabase.from("konnect_messages").select("*")
          .or(`and(from_session.eq.${me},to_session.eq.${peer}),and(from_session.eq.${peer},to_session.eq.${me})`)
          .order("created_at", { ascending: true }),
      ]);
      if (p) setPeerInfo(p as Peer);
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, peer]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  const send = async (content: string, kind = "text") => {
    if (!content.trim()) return;
    if (allowed !== "yes") { toast.error("You need an accepted request to chat."); return; }
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
          <button onClick={() => nav({ to: "/live" })}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-royal px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-royal">
            Back to Discover
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Header */}
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
            <p className="text-[11px] text-muted-foreground">{peerInfo?.skills ?? "live · vanishes in 2h"}</p>
          </div>
          <span className="rounded-full border border-gold/30 bg-card/40 px-2 py-1 text-[10px] text-gold">live</span>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6 space-y-3">
        {msgs.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted-foreground">
            Say hi. Send a ✌️ when you find each other in real life.
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.from_session === me;
          const isGesture = m.kind.startsWith("gesture-");
          if (isGesture) {
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-float-up`}>
                <div className="text-6xl drop-shadow-[0_0_20px_rgba(255,200,80,0.5)]">{m.content}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} animate-float-up`}>
              <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                mine
                  ? "bg-gradient-royal text-primary-foreground rounded-br-sm"
                  : "glass text-foreground rounded-bl-sm"
              }`}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 border-t border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="flex justify-center gap-2">
            {GESTURES.map((g) => (
              <button key={g.kind} onClick={() => send(g.emoji, g.kind)}
                title={g.label}
                className="grid h-12 w-12 place-items-center rounded-2xl border border-gold/30 bg-card/40 text-2xl transition hover:scale-110 hover:bg-gold/10">
                {g.emoji}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 rounded-full border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-gold"
            />
            <button type="submit"
              className="grid h-11 w-11 place-items-center rounded-full bg-gradient-gold text-accent-foreground glow-gold transition hover:scale-105">
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground">
            Chats vanish with your profile in 2 hours.
          </p>
        </div>
      </div>
    </main>
  );
}

// avoid unused import lints
void Hand; void ThumbsUp; void Eye; void Link;
