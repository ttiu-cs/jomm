"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/format";
import { EXAMPLE_SCRIPTS } from "@/lib/teach/examples";
import { DemoScene, regionFor, snapshotRegion, type SceneKind } from "@/components/DemoScene";
import { HangTag } from "@/components/HangTag";
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

const GREETING = "Hi! Point me at something you sell and tell me what it is. For example: “These are Fuji apples, about 30 lb.”";

export default function Studio({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    api<Session>("/api/teach/sessions", { shopId })
      .then(setSession)
      .catch((e) => setLoadErr(String(e.message ?? e)));
  }, [shopId]);
  if (!session) return <main className="grid min-h-[60vh] place-items-center p-6 text-ink-2">{loadErr ?? "Getting your shop assistant ready…"}</main>;
  return <Teach session={session} setSession={setSession} onOpened={() => router.push(`/seller/${shopId}?opened=1`)} />;
}

function Teach({ session, setSession, onOpened }: { session: Session; setSession: (s: Session) => void; onOpened: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
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
  const sceneFocus = source.kind === "demo" && focusItem ? regionFor(source.scene, focusItem.name, session.items.indexOf(focusItem)) : null;
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
      setCamErr(`The camera didn’t open (${e instanceof Error ? e.name : "error"}). Cameras need a secure (https) page and your permission. Try the demo stand instead.`);
    }
  };

  const frame = async (utterance: string): Promise<string | null> => {
    if (source.kind === "demo" && sceneRef.current) {
      // Prefer what was just said ("Next is white peaches…"); fall back to the item in focus.
      const said = regionFor(source.scene, utterance, -1);
      const idx = said >= 0 ? said : regionFor(source.scene, focusItem?.name ?? "", session.items.length);
      return snapshotRegion(sceneRef.current, source.scene, idx);
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
    rec.onerror = (e) => setErr(e.error === "not-allowed" ? "Microphone permission was denied. You can type instead." : `Couldn’t hear that (${e.error}). Try again or type.`);
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
    <main className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1.25fr_1fr] lg:gap-8 lg:px-4 lg:py-6">
      {/* Viewfinder */}
      <section className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative h-[56vh] min-h-[340px] overflow-hidden bg-[#1b2a20] lg:aspect-[4/3] lg:h-auto lg:rounded-3xl">
          {source.kind === "camera" && <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
          {source.kind === "demo" && <DemoScene ref={sceneRef} scene={source.scene} focus={sceneFocus} className="absolute inset-0" />}
          {source.kind === "none" && (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#2c4a36,#14201a)] p-6">
              <div className="w-full max-w-sm space-y-3 text-center text-white">
                <p className="font-sign text-3xl font-bold leading-tight">Show me your stall</p>
                <p className="text-white/80">Walk around with the camera on and talk, like you’re training a new helper.</p>
                <button type="button" onClick={startCamera} className="flex w-full items-center justify-center gap-2 rounded-full bg-sticker py-3.5 text-lg font-bold text-ink">
                  <IconCamera /> Use my camera
                </button>
                <button type="button" onClick={() => setSource({ kind: "demo", scene: "fruit" })} className="w-full rounded-full border border-white/40 py-3 font-bold text-white hover:bg-white/10">
                  Try it with a demo fruit stand
                </button>
                <button type="button" onClick={() => setSource({ kind: "demo", scene: "closet" })} className="text-sm text-white/75 underline underline-offset-2">
                  or a demo closet
                </button>
                {camErr && <p className="rounded-lg bg-black/40 p-2 text-sm text-white/90">{camErr}</p>}
              </div>
            </div>
          )}

          {/* top bar over the camera */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-3">
            <Link href={`/seller/${session.shopId}`} className="rounded-full bg-black/40 px-3 py-1.5 text-sm text-white lg:hidden">
              ← Done
            </Link>
            <span className="hidden text-sm text-white/85 lg:inline">{source.kind === "demo" ? "Demo camera" : source.kind === "camera" ? "Camera on" : ""}</span>
            <button
              type="button"
              onClick={openShop}
              disabled={!ready || opening}
              className="rounded-full bg-sticker px-4 py-2 text-[15px] font-bold text-ink shadow disabled:bg-white/25 disabled:text-white/80"
            >
              {opening ? "Opening…" : ready ? `Open my shop (${ready})` : "Open my shop"}
            </button>
          </div>

          {/* the assistant's latest line */}
          {source.kind !== "none" && (
            <div className="absolute inset-x-3 bottom-3 z-10 flex items-start gap-2.5 rounded-2xl bg-white/95 p-3 text-ink shadow-lg" aria-live="polite">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-leaf text-white">
                <IconStore size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-leaf">Your shop assistant{sending ? " is thinking…" : ""}</div>
                <p className="text-[15px] leading-snug">{lastAgent}</p>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        {err && <p className="mx-4 mt-3 rounded-xl border border-tomato/40 bg-tomato/5 px-3 py-2 text-sm text-tomato lg:mx-0">{err}</p>}

        {/* talk dock (fixed on phones) */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0">
          {nextLine && (
            <button
              type="button"
              disabled={sending}
              onClick={() => send(nextLine)}
              className="mb-2 flex w-full items-center gap-2 rounded-2xl border border-dashed border-leaf/50 bg-leaf-soft px-3 py-2 text-left text-sm text-leaf disabled:opacity-50"
            >
              <span className="shrink-0 rounded-full bg-leaf px-2 py-0.5 text-xs font-bold text-white">Tap to say</span>
              <span className="line-clamp-2">“{nextLine}”</span>
            </button>
          )}
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            {speechOk && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={sending}
                aria-label={listening ? "Stop listening" : "Talk"}
                className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white shadow-md ${listening ? "listening bg-tomato" : "bg-leaf"} disabled:opacity-40`}
              >
                {listening ? <IconStop size={26} /> : <IconMic size={26} />}
              </button>
            )}
            <form
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-4 pr-1"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input
                aria-label="Tell your assistant about the item"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] outline-none"
                placeholder={listening ? "Listening…" : speechOk ? "Talk, or type here" : "Type what you’d say"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="grid h-11 w-11 place-items-center rounded-full bg-leaf text-white disabled:bg-surface-2 disabled:text-muted">
                <IconSend size={20} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* What the assistant learned */}
      <section className="pb-48 pt-4 lg:pb-0 lg:pt-0">
        <div className="mx-4 mb-3 flex items-baseline justify-between lg:mx-0">
          <h2 className="font-sign text-2xl font-bold">What I’ve learned</h2>
          {session.items.length > 0 && <span className="text-sm text-ink-2">Tap a tag to fix it</span>}
        </div>
        {session.items.length === 0 && <p className="mx-4 rounded-2xl border-2 border-dashed border-line p-5 text-ink-2 lg:mx-0">Price tags appear here while you talk. You don’t need to fill in any forms.</p>}
        <div ref={stripRef} className="flex snap-x gap-4 overflow-x-auto px-4 pb-3 pt-2 lg:flex-col lg:overflow-visible lg:px-0">
          {items.map((it) => (
            <div key={it.id} className="tag-in w-[82%] shrink-0 snap-start lg:w-full">
              {editing === it.id ? (
                <EditTag
                  item={it}
                  onDone={(s) => {
                    if (s) setSession(s);
                    setEditing(null);
                  }}
                />
              ) : (
                <button type="button" onClick={() => setEditing(it.id)} className="block w-full text-left">
                  <HangTag t={it} active={session.focusItemId === it.id} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2 lg:mx-0">
          <label className="flex items-center gap-1.5">
            Language
            <select className="rounded-lg border border-line bg-surface px-2 py-1" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en-US">English</option>
              <option value="ko-KR">한국어</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="h-4 w-4 accent-[var(--leaf)]" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Assistant talks back
          </label>
          {session.messages.length > 0 && (
            <button type="button" className="underline underline-offset-2" onClick={() => setShowChat((v) => !v)}>
              {showChat ? "Hide" : "Show"} our conversation
            </button>
          )}
        </div>
        {showChat && (
          <div className="mx-4 mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-line bg-surface p-3 lg:mx-0">
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "owner" ? "justify-end" : ""}`}>
                <span className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "owner" ? "bg-leaf text-white" : "bg-surface-2"}`}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function EditTag({ item, onDone }: { item: Item; onDone: (s: Session | null) => void }) {
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
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="space-y-1 text-sm">
      <span className="font-bold">{label}</span>
      <input
        type={type}
        step="0.01"
        inputMode={type === "number" ? "decimal" : undefined}
        className="w-full rounded-lg border border-kraft-ink/30 bg-white/70 px-2.5 py-2 text-[16px]"
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="tag space-y-3 pb-4 pl-9 pr-4 pt-3">
      <div className="font-sign text-xl font-bold">Fix this tag</div>
      <div className="grid grid-cols-2 gap-2.5">
        {field("name", "Name")}
        {field("unit", "Sold by (lb, box, each)")}
        {field("quantity", "How many", "number")}
        {field("list", "Price $", "number")}
        {field("floor", "Your lowest $", "number")}
        <label className="space-y-1 text-sm">
          <span className="font-bold">Needs to sell</span>
          <select className="w-full rounded-lg border border-kraft-ink/30 bg-white/70 px-2.5 py-2 text-[16px]" value={f.sellBy} onChange={(e) => setF({ ...f, sellBy: e.target.value })}>
            <option value="">Not said</option>
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="no_rush">No rush</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-bold">What buyers should know (one per line)</span>
        <textarea className="h-20 w-full rounded-lg border border-kraft-ink/30 bg-white/70 px-2.5 py-2 text-[16px]" value={f.facts} onChange={(e) => setF({ ...f, facts: e.target.value })} />
      </label>
      {err && <p className="text-sm text-tomato">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full bg-leaf px-4 py-2 font-bold text-white"
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
          Save tag
        </button>
        <button type="button" className="rounded-full border border-kraft-ink/40 px-4 py-2 font-bold" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" className="ml-auto rounded-full px-3 py-2 text-sm text-tomato underline" onClick={() => call("DELETE")}>
          Remove item
        </button>
      </div>
    </div>
  );
}
