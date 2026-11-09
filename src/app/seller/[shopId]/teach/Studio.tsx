"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/format";
import { EXAMPLE_SCRIPTS } from "@/lib/teach/examples";
import { SCENES, photoFor, photoToDataUrl, type SceneKind } from "@/lib/client/demoPhotos";
import { ItemCard } from "@/components/ItemCard";
import { IconCamera, IconMic, IconSend, IconStop, IconStore } from "@/components/icons";

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
type Source = { kind: "none" } | { kind: "camera" } | { kind: "demo"; scene: SceneKind };

const GREETING = "Hi! Point me at something you sell and tell me what it is, like “These are Fuji apples, about 30 lb.”";

export default function Studio({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    api<Session>("/api/teach/sessions", { shopId })
      .then(setSession)
      .catch((e) => setLoadErr(String(e.message ?? e)));
  }, [shopId]);
  if (!session) return <main className="grid min-h-[60vh] place-items-center p-6 text-label-2">{loadErr ?? "Getting your assistant ready…"}</main>;
  return <Teach session={session} setSession={setSession} onOpened={() => router.push(`/seller/${shopId}?opened=1`)} />;
}

function Teach({ session, setSession, onOpened }: { session: Session; setSession: (s: Session) => void; onOpened: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<Source>({ kind: "none" });
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
  const [speechOk] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [session.focusItemId, session.items.length]);
  useEffect(() => {
    const v = videoRef.current;
    return () => (v?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }, []);

  const focusItem = session.items.find((i) => i.id === session.focusItemId) ?? null;
  const items = [...session.items].sort((a, b) => (a.id === session.focusItemId ? -1 : b.id === session.focusItemId ? 1 : 0));
  const ready = session.items.filter((i) => i.quantity !== null && i.quantity > 0 && i.listPriceCents !== null).length;
  const lastAgent = [...session.messages].reverse().find((m) => m.role === "agent")?.text ?? GREETING;
  const demoPhoto = source.kind === "demo" ? (focusItem && photoFor(source.scene, focusItem.name)?.src) || SCENES[source.scene].wide : null;
  const nextLine = useMemo(() => {
    if (source.kind !== "demo") return null;
    const said = new Set(session.messages.filter((m) => m.role === "owner").map((m) => m.text));
    return EXAMPLE_SCRIPTS[source.scene].lines.find((l) => !said.has(l)) ?? null;
  }, [source, session.messages]);

  const startCamera = async () => {
    setCamErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      setSource({ kind: "camera" });
      requestAnimationFrame(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setCamErr(`The camera didn’t open (${e instanceof Error ? e.name : "error"}). Cameras need a secure (https) page and your permission. You can use the sample stall instead.`);
    }
  };

  const frame = async (utterance: string): Promise<string | null> => {
    if (source.kind === "demo") {
      const p = photoFor(source.scene, utterance) ?? (focusItem ? photoFor(source.scene, focusItem.name) : null);
      return p ? photoToDataUrl(p.src) : null;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    if (source.kind !== "camera" || !v || !c || !v.videoWidth) return null;
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
    if (!t || sending) return;
    setSending(true);
    setErr(null);
    try {
      const s = await api<Session>(`/api/teach/sessions/${session.id}/turn`, { text: t, image: await frame(t) });
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
    rec.onerror = (e) => setErr(e.error === "not-allowed" ? "Microphone access was denied. You can type instead." : `Couldn’t hear that (${e.error}). Try again or type.`);
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

  return (
    <main className="mx-auto max-w-[1100px] lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:px-5 lg:py-8">
      {/* Viewfinder */}
      <section className="lg:sticky lg:top-20 lg:self-start">
        <div className="relative h-[58vh] min-h-[360px] overflow-hidden bg-black lg:aspect-[4/5] lg:h-auto lg:rounded-[32px]">
          {source.kind === "camera" && <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
          {demoPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={demoPhoto} src={demoPhoto} alt="Sample camera view" className="kenburns absolute inset-0 h-full w-full object-cover" />
          )}
          {source.kind === "none" && (
            <div className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/stall-wide.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/30 to-black/80 p-6">
                <div className="w-full max-w-sm text-center text-white">
                  <h2 className="display text-[34px] leading-tight">Show me your stall.</h2>
                  <p className="mt-2 text-[17px] text-white/80">Walk around with the camera on and talk, like you’re training a new helper.</p>
                  <button type="button" onClick={startCamera} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[17px] font-semibold text-label">
                    <IconCamera size={22} /> Turn on camera
                  </button>
                  <button type="button" onClick={() => setSource({ kind: "demo", scene: "fruit" })} className="frosted-dark mt-3 w-full rounded-full py-3.5 text-[17px] font-medium text-white">
                    Use the sample fruit stand
                  </button>
                  <button type="button" onClick={() => setSource({ kind: "demo", scene: "closet" })} className="mt-3 text-[15px] text-white/80 hover:text-white">
                    Or a sample closet
                  </button>
                  {camErr && <p className="mt-4 rounded-2xl bg-white/15 p-3 text-[14px]">{camErr}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pb-8 pt-4" style={{ background: "linear-gradient(rgba(0,0,0,.45), transparent)" }}>
            <Link href={`/seller/${session.shopId}`} className="frosted-dark rounded-full px-3.5 py-1.5 text-[15px] text-white lg:hidden">
              Done
            </Link>
            <span className="hidden text-[13px] font-medium text-white/85 lg:inline">{source.kind === "demo" ? "Sample camera" : source.kind === "camera" ? "Camera" : ""}</span>
            <button
              type="button"
              onClick={openShop}
              disabled={!ready || opening}
              className="rounded-full bg-blue px-4 py-1.5 text-[15px] font-semibold text-white shadow disabled:bg-white/25 disabled:text-white/80"
            >
              {opening ? "Opening…" : ready ? `Open shop · ${ready}` : "Open shop"}
            </button>
          </div>

          {source.kind !== "none" && (
            <div className="frosted absolute inset-x-3 bottom-3 z-10 flex items-start gap-3 rounded-[22px] p-3.5 text-label shadow-lg" aria-live="polite">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-label text-white">
                <IconStore size={19} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between text-[13px] font-semibold">
                  <span>Assistant</span>
                  <span className="font-normal text-label-2">{sending ? "Thinking…" : "now"}</span>
                </div>
                <p className="text-[15px] leading-snug">{lastAgent}</p>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        {err && <p className="mx-4 mt-3 rounded-2xl bg-red/10 px-4 py-3 text-[15px] text-red lg:mx-0">{err}</p>}

        {/* Talk bar */}
        <div className="frosted fixed inset-x-0 bottom-0 z-40 border-t border-black/10 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {nextLine && (
            <button
              type="button"
              disabled={sending}
              onClick={() => send(nextLine)}
              className="mb-2.5 flex w-full items-center gap-3 rounded-[18px] bg-card px-3.5 py-2.5 text-left shadow-[0_1px_6px_rgba(0,0,0,0.08)] disabled:opacity-50"
            >
              <span className="shrink-0 text-[13px] font-semibold text-blue">Tap to say</span>
              <span className="line-clamp-2 text-[15px] text-label">“{nextLine}”</span>
            </button>
          )}
          <div className="mx-auto flex max-w-[1100px] items-center gap-2.5">
            {speechOk && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={sending}
                aria-label={listening ? "Stop listening" : "Talk"}
                className={`grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-white ${listening ? "listening bg-[#ff3b30]" : "bg-blue"} disabled:opacity-40`}
              >
                {listening ? <IconStop size={24} /> : <IconMic size={24} />}
              </button>
            )}
            <form
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-fill py-1 pl-4 pr-1"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input
                aria-label="Tell your assistant about the item"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[17px] outline-none placeholder:text-label-3"
                placeholder={listening ? "Listening…" : "Talk or type"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-blue text-white disabled:bg-transparent disabled:text-label-3">
                <IconSend size={18} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* What the assistant learned */}
      <section className="pb-52 pt-6 lg:pb-0 lg:pt-0">
        <div className="mx-5 mb-3 flex items-baseline justify-between lg:mx-0">
          <h2 className="text-[28px] font-bold tracking-tight">Learned so far</h2>
          {session.items.length > 0 && <span className="text-[15px] text-label-2">Tap to edit</span>}
        </div>
        {session.items.length === 0 && <p className="mx-5 rounded-[22px] bg-card p-5 text-[17px] text-label-2 lg:mx-0">Products appear here while you talk. There are no forms to fill in.</p>}
        <div ref={stripRef} className="flex snap-x gap-3 overflow-x-auto px-5 pb-3 pt-1 lg:flex-col lg:overflow-visible lg:px-0">
          {items.map((it) => (
            <div key={it.id} className="rise w-[85%] shrink-0 snap-start lg:w-full">
              {editing === it.id ? (
                <EditItem
                  item={it}
                  onDone={(s) => {
                    if (s) setSession(s);
                    setEditing(null);
                  }}
                />
              ) : (
                <button type="button" onClick={() => setEditing(it.id)} className="block w-full text-left">
                  <ItemCard t={it} active={session.focusItemId === it.id} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mx-5 mt-5 overflow-hidden rounded-[14px] bg-card text-[17px] lg:mx-0">
          <label className="flex items-center justify-between border-b border-line px-4 py-3">
            Language
            <select className="bg-transparent text-label-2 outline-none" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en-US">English</option>
              <option value="ko-KR">한국어</option>
            </select>
          </label>
          <label className="flex items-center justify-between border-b border-line px-4 py-3">
            Assistant speaks
            <input type="checkbox" className="h-5 w-5 accent-[#34c759]" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
          </label>
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setShowChat((v) => !v)}>
            Conversation
            <span className="text-label-2">{showChat ? "Hide" : `${session.messages.length} messages ›`}</span>
          </button>
        </div>
        {showChat && (
          <div className="mx-5 mt-3 max-h-80 space-y-2 overflow-y-auto rounded-[22px] bg-card p-4 lg:mx-0">
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "owner" ? "justify-end" : ""}`}>
                <span className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-[15px] ${m.role === "owner" ? "bg-blue text-white" : "bg-fill"}`}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function EditItem({ item, onDone }: { item: Item; onDone: (s: Session | null) => void }) {
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
  const row = (k: keyof typeof f, label: string, type = "text") => (
    <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <span className="shrink-0">{label}</span>
      <input
        type={type}
        step="0.01"
        inputMode={type === "number" ? "decimal" : undefined}
        className="min-w-0 flex-1 bg-transparent text-right text-label-2 outline-none"
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="overflow-hidden rounded-[22px] bg-card text-[17px] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <button type="button" className="text-link" onClick={() => onDone(null)}>
          Cancel
        </button>
        <span className="font-semibold">Edit item</span>
        <button
          type="button"
          className="font-semibold text-link"
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
          Done
        </button>
      </div>
      {row("name", "Name")}
      {row("unit", "Sold by")}
      {row("quantity", "Quantity", "number")}
      {row("list", "Price ($)", "number")}
      {row("floor", "Lowest price ($)", "number")}
      <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span>Must sell</span>
        <select className="bg-transparent text-right text-label-2 outline-none" value={f.sellBy} onChange={(e) => setF({ ...f, sellBy: e.target.value })}>
          <option value="">Not set</option>
          <option value="today">Today</option>
          <option value="this_week">This week</option>
          <option value="no_rush">No rush</option>
        </select>
      </label>
      <label className="block px-4 py-2.5">
        <span className="text-[13px] text-label-2">What buyers should know, one per line</span>
        <textarea className="mt-1 h-20 w-full resize-none bg-transparent outline-none" value={f.facts} onChange={(e) => setF({ ...f, facts: e.target.value })} />
      </label>
      {err && <p className="px-4 pb-2 text-[15px] text-red">{err}</p>}
      <button type="button" className="w-full border-t border-line py-3 text-red" onClick={() => call("DELETE")}>
        Remove item
      </button>
    </div>
  );
}
