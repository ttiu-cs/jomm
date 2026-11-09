"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { Btn } from "@/components/ui";

interface Item {
  id: string;
  name: string;
  unit: string;
  quantity: number | null;
  listPriceCents: number | null;
  floorPriceCents: number | null;
  condition: string | null;
  sellBy: "today" | "this_week" | "no_rush" | null;
  facts: string[];
  photo: string | null;
}
interface Session {
  id: string;
  shopId: string;
  shopName: string;
  status: string;
  focusItemId: string | null;
  items: Item[];
  messages: { role: "owner" | "agent"; text: string; had_image: number; source: string }[];
  reply?: string;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRec;

const SELL_BY: Record<string, string> = { today: "Sell today", this_week: "This week", no_rush: "No rush" };
const STEPS = ["quantity", "price", "lowest", "details", "deadline"] as const;

function missing(i: Item): string[] {
  const m: string[] = [];
  if (i.quantity === null) m.push("quantity");
  if (i.listPriceCents === null) m.push("price");
  if (i.floorPriceCents === null) m.push("lowest");
  if (!i.facts.length && !i.condition) m.push("details");
  if (!i.sellBy) m.push("deadline");
  return m;
}

export default function Studio({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    api<Session>("/api/teach/sessions", { shopId })
      .then(setSession)
      .catch((e) => setLoadErr(String(e.message ?? e)));
  }, [shopId]);

  if (!session) return <main className="p-6 text-ink-2">{loadErr ?? "Getting your agent ready…"}</main>;
  return <Teach session={session} setSession={setSession} onOpened={() => router.push(`/seller/${shopId}?opened=1`)} />;
}

function Teach({ session, setSession, onOpened }: { session: Session; setSession: (s: Session) => void; onOpened: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [speak, setSpeak] = useState(true);
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [session.focusItemId, session.items.length]);
  const [speechOk] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  const startCamera = async () => {
    setCamErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch (e) {
      setCamErr(`Camera unavailable (${e instanceof Error ? e.name : "error"}). It needs https or localhost and your permission. You can still teach by typing.`);
    }
  };
  useEffect(() => {
    const v = videoRef.current;
    return () => (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }, []);

  const grabFrame = (): string | null => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!camOn || !v || !c || !v.videoWidth) return null;
    c.width = 512;
    c.height = Math.round((v.videoHeight / v.videoWidth) * 512);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  };

  const say = useCallback(
    (t: string) => {
      if (!speak || typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang;
      speechSynthesis.speak(u);
    },
    [speak, lang],
  );

  const send = async (utterance: string) => {
    const t = utterance.trim();
    if (!t) return;
    setSending(true);
    setErr(null);
    try {
      const s = await api<Session>(`/api/teach/sessions/${session.id}/turn`, { text: t, image: grabFrame() });
      setSession(s);
      setText("");
      if (s.reply) say(s.reply);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const toggleMic = () => {
    if (listening) return recRef.current?.stop();
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(finalText + interim);
    };
    rec.onerror = (e) => setErr(`Speech recognition: ${e.error}. You can type instead.`);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    recRef.current = rec;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    rec.start();
    setListening(true);
  };

  const openShop = async () => {
    setOpening(true);
    setErr(null);
    try {
      await api(`/api/teach/sessions/${session.id}/publish`, {});
      onOpened();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setOpening(false);
    }
  };

  const lastAgent = [...session.messages].reverse().find((m) => m.role === "agent");
  const ready = session.items.filter((i) => i.quantity !== null && i.quantity > 0 && i.listPriceCents !== null).length;
  const items = [...session.items].sort((a, b) => (a.id === session.focusItemId ? -1 : b.id === session.focusItemId ? 1 : 0));

  return (
    <main className="mx-auto max-w-6xl px-0 pb-28 sm:px-4 lg:grid lg:grid-cols-5 lg:gap-5 lg:pb-8 lg:pt-4">
      {/* Camera + what the agent just said */}
      <section className="lg:col-span-3">
        <div className="relative overflow-hidden bg-black sm:rounded-2xl">
          <video ref={videoRef} playsInline muted className={`h-[46vh] w-full object-cover sm:aspect-[4/3] sm:h-auto ${camOn ? "" : "hidden"}`} />
          {!camOn && (
            <div className="flex h-[46vh] w-full flex-col items-center justify-center gap-3 p-6 text-center text-white sm:aspect-[4/3] sm:h-auto">
              <div className="text-5xl" aria-hidden>
                📷
              </div>
              <p className="max-w-xs text-sm text-white/80">Point the camera at an item and tell your agent what it is.</p>
              <button type="button" onClick={startCamera} className="rounded-full bg-white px-6 py-3 font-semibold text-black">
                Turn on camera
              </button>
              {camErr && <p className="max-w-sm text-xs text-white/70">{camErr}</p>}
            </div>
          )}
          <div className="absolute inset-x-3 top-3 flex items-center justify-between">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">{session.items.length} items learned</span>
            <button type="button" onClick={openShop} disabled={!ready || opening} className="rounded-full bg-good px-4 py-1.5 text-sm font-semibold text-white shadow disabled:bg-white/30 disabled:text-white/70">
              {opening ? "Opening…" : `Open my shop${ready ? ` (${ready})` : ""}`}
            </button>
          </div>
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 px-3 py-2 text-sm text-white backdrop-blur" aria-live="polite">
            <span className="mr-1 text-[10px] font-semibold uppercase text-white/60">Your agent</span>
            {lastAgent?.text ?? "Hi! Show me the first item and tell me what it is, like “These are Fuji apples, about 30 lb.”"}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
        {err && <div className="mx-4 mt-3 rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad sm:mx-0">{err}</div>}

      </section>

      {/* What the agent learned */}
      <section className="mt-4 lg:col-span-2 lg:mt-0">
        <div className="mx-4 mb-2 flex items-center justify-between sm:mx-0">
          <h2 className="text-sm font-semibold">What your agent learned</h2>
          <span className="text-xs text-muted">Tap to fix</span>
        </div>
        {session.items.length === 0 && <p className="mx-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted sm:mx-0">Cards appear here as you talk.</p>}
        <div ref={stripRef} className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:px-0 lg:flex-col lg:overflow-visible">
          {items.map((it) =>
            editing === it.id ? (
              <div key={it.id} className="w-[85%] shrink-0 snap-start lg:w-full">
                <EditCard
                  item={it}
                  onDone={(s) => {
                    if (s) setSession(s);
                    setEditing(null);
                  }}
                />
              </div>
            ) : (
              <button
                key={it.id}
                type="button"
                onClick={() => setEditing(it.id)}
                className={`w-[78%] shrink-0 snap-start rounded-xl border bg-surface p-3 text-left lg:w-full ${session.focusItemId === it.id ? "border-accent ring-1 ring-accent" : "border-line"}`}
              >
                <div className="flex gap-3">
                  {it.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.photo} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-2xl" aria-hidden>
                      📦
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{it.name}</div>
                    <div className="tnum text-sm text-ink-2">
                      {it.quantity ?? "?"} {it.unit} · {it.listPriceCents !== null ? usd(it.listPriceCents) : "$?"}
                      {it.unit !== "each" ? `/${it.unit}` : ""}
                    </div>
                    <div className="tnum truncate text-xs text-ink-2">
                      🔒 {it.floorPriceCents !== null ? usd(it.floorPriceCents) : "?"}
                      {it.sellBy ? ` · ${SELL_BY[it.sellBy]}` : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-1" aria-label="Completeness">
                  {STEPS.map((s) => (
                    <span key={s} title={s} className={`h-1 flex-1 rounded ${missing(it).includes(s) ? "bg-surface-2" : "bg-accent"}`} />
                  ))}
                </div>
                {missing(it).length > 0 && <div className="mt-1 text-[11px] text-muted">Still need: {missing(it).join(", ")}</div>}
              </button>
            ),
          )}
        </div>
        <p className="mx-4 mt-2 text-[11px] text-muted sm:mx-0">🔒 = your lowest price. Buyers never see it, and your agent never sells below it.</p>
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-2 sm:mx-0">
          <label className="flex items-center gap-1">
            Language
            <select className="rounded border border-line bg-surface px-1 py-0.5" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en-US">English</option>
              <option value="ko-KR">한국어</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Agent talks back
          </label>
          <button type="button" className="underline" onClick={() => setShowChat((v) => !v)}>
            {showChat ? "Hide" : "Show"} conversation ({session.messages.length})
          </button>
        </div>
        {showChat && (
          <div className="mx-4 mt-2 max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-surface p-3 sm:mx-0">
            {session.messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "owner" ? "text-right" : ""}`}>
                <span className={`inline-block max-w-[85%] rounded-2xl px-3 py-1.5 ${m.role === "owner" ? "bg-accent text-white" : "bg-surface-2"}`}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Talk bar: fixed at the bottom on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur lg:static lg:col-span-3 lg:mt-3 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          {speechOk && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={sending}
              aria-label={listening ? "Stop listening" : "Hold a conversation: tap to talk"}
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl text-white shadow ${listening ? "animate-pulse bg-bad" : "bg-accent"} disabled:opacity-40`}
            >
              {listening ? "■" : "🎤"}
            </button>
          )}
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-3"
              placeholder={listening ? "Listening…" : speechOk ? "Tap 🎤 and talk, or type" : "Type what you’d say"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Btn type="submit" kind="primary" disabled={sending || !text.trim()}>
              {sending ? "…" : "Send"}
            </Btn>
          </form>
        </div>
      </div>
    </main>
  );
}

function EditCard({ item, onDone }: { item: Item; onDone: (s: Session | null) => void }) {
  const [f, setF] = useState({
    name: item.name,
    unit: item.unit,
    quantity: item.quantity?.toString() ?? "",
    list: item.listPriceCents !== null ? (item.listPriceCents / 100).toFixed(2) : "",
    floor: item.floorPriceCents !== null ? (item.floorPriceCents / 100).toFixed(2) : "",
    sellBy: item.sellBy ?? "",
    facts: item.facts.join("\n"),
  });
  const [err, setErr] = useState<string | null>(null);
  const cents = (s: string) => (s.trim() ? Math.round(parseFloat(s) * 100) : null);
  const call = async (method: "PATCH" | "DELETE", body?: unknown) => {
    try {
      const res = await fetch(`/api/teach/items/${item.id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const b = await res.json();
      if (!res.ok) throw new Error(b.message ?? `HTTP ${res.status}`);
      onDone(b as Session);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const input = (k: keyof typeof f, label: string, type = "text") => (
    <label className="space-y-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <input type={type} step="0.01" inputMode={type === "number" ? "decimal" : undefined} className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="space-y-2 rounded-xl border border-accent bg-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        {input("name", "Name")}
        {input("unit", "Unit (lb, box, each)")}
        {input("quantity", "How many", "number")}
        {input("list", "Price ($)", "number")}
        {input("floor", "Lowest ($) 🔒", "number")}
        <label className="space-y-0.5 text-xs">
          <span className="text-muted">Sell by</span>
          <select className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={f.sellBy} onChange={(e) => setF({ ...f, sellBy: e.target.value })}>
            <option value="">—</option>
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="no_rush">No rush</option>
          </select>
        </label>
      </div>
      <label className="block space-y-0.5 text-xs">
        <span className="text-muted">What buyers should know (one per line)</span>
        <textarea className="h-16 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm" value={f.facts} onChange={(e) => setF({ ...f, facts: e.target.value })} />
      </label>
      {err && <p className="text-xs text-bad">{err}</p>}
      <div className="flex gap-2">
        <Btn
          kind="primary"
          onClick={() =>
            call("PATCH", {
              name: f.name,
              unit: f.unit,
              quantity: f.quantity.trim() ? parseInt(f.quantity, 10) : null,
              listPriceCents: cents(f.list),
              floorPriceCents: cents(f.floor),
              sellBy: f.sellBy || null,
              facts: f.facts.split("\n").map((x) => x.trim()).filter(Boolean),
            })
          }
        >
          Save
        </Btn>
        <Btn onClick={() => onDone(null)}>Cancel</Btn>
        <Btn kind="danger" onClick={() => call("DELETE")}>
          Remove
        </Btn>
      </div>
    </div>
  );
}
