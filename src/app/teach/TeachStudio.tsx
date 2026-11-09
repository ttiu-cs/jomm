"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, usd } from "@/lib/client/format";
import { Btn, Card, TopNav } from "@/components/ui";

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
  source?: string;
}
interface PublishResult {
  shopId: string;
  published: { productId: string; sku: string; name: string }[];
  skipped: string[];
}

// Minimal typing for the Web Speech API (not in TS DOM lib everywhere).
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

function completeness(i: Item) {
  const steps = [i.quantity !== null, i.listPriceCents !== null, i.floorPriceCents !== null, i.facts.length > 0 || !!i.condition, i.sellBy !== null];
  return steps.filter(Boolean).length / steps.length;
}

export default function TeachStudio() {
  const [session, setSession] = useState<Session | null>(null);
  const [shops, setShops] = useState<{ id: string; name: string; items: number }[]>([]);
  const [shopName, setShopName] = useState("Sunny Fruit Stand");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishResult | null>(null);

  useEffect(() => {
    api<{ id: string; name: string; items: number }[]>("/api/shops").then(setShops).catch(() => {});
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (published && session) return <Published session={session} result={published} onMore={() => run("more", async () => {
    setSession(await api<Session>("/api/teach/sessions", { shopId: published.shopId }));
    setPublished(null);
  })} />;

  if (!session)
    return (
      <div>
        <TopNav active="teach" />
        <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
          <div>
            <p className="text-sm font-semibold text-s1">Step 1 · Teach your seller agent</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Turn on the camera. Show your shop. Talk.</h1>
            <p className="mt-2 text-ink-2">Your AI seller agent asks questions like a new employee: how many, what price, the lowest you’d take, what buyers should know. Then it sells for you.</p>
          </div>
          {err && <div className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}
          <Card title="Start a new shop">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="flex-1 rounded-lg border border-line bg-surface px-3 py-2" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop name" maxLength={60} />
              <Btn kind="primary" disabled={!!busy} onClick={() => run("start", async () => setSession(await api<Session>("/api/teach/sessions", { shopName })))}>
                Start teaching
              </Btn>
            </div>
          </Card>
          {shops.length > 0 && (
            <Card title="Good morning: update an existing shop">
              <div className="flex flex-wrap gap-2">
                {shops.map((s) => (
                  <Btn key={s.id} disabled={!!busy} onClick={() => run("cont", async () => setSession(await api<Session>("/api/teach/sessions", { shopId: s.id })))}>
                    {s.name} · {s.items} items
                  </Btn>
                ))}
              </div>
            </Card>
          )}
          <Card title="Rehearsal (no camera needed)">
            <p className="mb-2 text-sm text-ink-2">Replays a scripted walk-through through the same conversation logic, so you can see the result instantly or use it as a stage fallback.</p>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={!!busy} onClick={() => run("ex", async () => setSession(await api<Session>("/api/teach/example", { script: "fruit" })))}>
                🍎 Fruit stand example
              </Btn>
              <Btn disabled={!!busy} onClick={() => run("ex", async () => setSession(await api<Session>("/api/teach/example", { script: "closet" })))}>
                🧥 Closet example
              </Btn>
            </div>
          </Card>
        </main>
      </div>
    );

  return <Studio session={session} setSession={setSession} onPublished={setPublished} />;
}

function Studio({ session, setSession, onPublished }: { session: Session; setSession: (s: Session) => void; onPublished: (r: PublishResult) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [speak, setSpeak] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // Studio only mounts after a client-side action, so reading window here is safe (no SSR mismatch).
  const [speechOk] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [session.messages.length]);

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
      setCamErr(
        `Camera unavailable (${e instanceof Error ? e.name : "error"}). Camera needs https or localhost and permission. You can still teach by typing.`,
      );
    }
  };
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const grabFrame = (): string | null => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!camOn || !v || !c || !v.videoWidth) return null;
    const w = 512;
    c.width = w;
    c.height = Math.round((v.videoHeight / v.videoWidth) * w);
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
    if (listening) {
      recRef.current?.stop();
      return;
    }
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
    speechSynthesis?.cancel();
    rec.start();
    setListening(true);
  };

  const publish = async () => {
    setErr(null);
    try {
      onPublished(await api<PublishResult>(`/api/teach/sessions/${session.id}/publish`, {}));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const lastAgent = [...session.messages].reverse().find((m) => m.role === "agent");
  const ready = session.items.filter((i) => i.quantity !== null && i.quantity > 0 && i.listPriceCents !== null).length;

  return (
    <div>
      <TopNav active="teach" />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs text-muted">Teaching your seller agent</div>
            <h1 className="text-2xl font-bold tracking-tight">{session.shopName}</h1>
          </div>
          <Btn kind="primary" disabled={!ready} onClick={publish} title={ready ? "" : "An item needs a quantity and a price first"}>
            Open my shop ({ready} ready)
          </Btn>
        </div>
        {err && <div className="rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad">{err}</div>}

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
              <video ref={videoRef} playsInline muted className={`aspect-[4/3] w-full object-cover ${camOn ? "" : "hidden"}`} />
              {!camOn && (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
                  <div className="text-5xl" aria-hidden>
                    📷
                  </div>
                  <button type="button" onClick={startCamera} className="rounded-full bg-white px-5 py-2 font-semibold text-black">
                    Turn on camera
                  </button>
                  {camErr && <p className="max-w-sm text-xs text-white/80">{camErr}</p>}
                </div>
              )}
              {lastAgent && (
                <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 px-3 py-2 text-sm text-white backdrop-blur">
                  <span className="mr-1 text-[10px] font-semibold uppercase text-white/60">Seller agent</span>
                  {lastAgent.text}
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex items-center gap-2">
              {speechOk && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={sending}
                  aria-label={listening ? "Stop listening" : "Talk"}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-white ${listening ? "animate-pulse bg-bad" : "bg-accent"} disabled:opacity-40`}
                >
                  {listening ? "■" : "🎤"}
                </button>
              )}
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
              >
                <input
                  className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-3"
                  placeholder={speechOk ? "Talk, or type: “These are Fuji apples, about 30 lb…”" : "Type: “These are Fuji apples, about 30 lb…”"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <Btn type="submit" kind="primary" disabled={sending || !text.trim()}>
                  {sending ? "…" : "Send"}
                </Btn>
              </form>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
              <label className="flex items-center gap-1">
                Voice
                <select className="rounded border border-line bg-surface px-1 py-0.5" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="en-US">English</option>
                  <option value="ko-KR">한국어</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Agent speaks aloud
              </label>
              <span className="text-muted">{camOn ? "Each message sends the current camera frame." : "Camera off: text only."}</span>
            </div>

            <Card title="Conversation">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {session.messages.length === 0 && <p className="text-sm text-muted">Point the camera at an item and say what it is.</p>}
                {session.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "owner" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "owner" ? "bg-accent text-white" : "border border-line bg-surface-2"}`}>
                      <div className="mb-0.5 text-[10px] font-semibold uppercase opacity-70">
                        {m.role === "owner" ? `You${m.had_image ? " · 📷" : ""}` : `Seller agent${m.source === "llm" ? " · AI" : ""}`}
                      </div>
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>
            </Card>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">What your agent learned ({session.items.length})</h2>
              <span className="text-xs text-muted">Tap a card to correct it</span>
            </div>
            {session.items.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Product cards appear here as you talk.</p>}
            {session.items.map((it) =>
              editing === it.id ? (
                <EditCard key={it.id} item={it} onDone={(s) => { if (s) setSession(s); setEditing(null); }} />
              ) : (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setEditing(it.id)}
                  className={`w-full rounded-xl border bg-surface p-3 text-left transition hover:border-s1/50 ${session.focusItemId === it.id ? "border-accent" : "border-line"}`}
                >
                  <div className="flex gap-3">
                    {it.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.photo} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-2xl" aria-hidden>
                        📦
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{it.name}</span>
                        <span className="text-[10px] text-muted">{Math.round(completeness(it) * 100)}%</span>
                      </div>
                      <div className="tnum text-sm text-ink-2">
                        {it.quantity ?? "?"} {it.unit} · {it.listPriceCents !== null ? usd(it.listPriceCents) : "price ?"}
                        {it.unit !== "each" ? `/${it.unit}` : ""}
                      </div>
                      <div className="tnum text-xs text-ink-2">
                        🔒 lowest {it.floorPriceCents !== null ? usd(it.floorPriceCents) : "?"} {it.sellBy ? `· ${SELL_BY[it.sellBy]}` : ""} {it.condition ? `· ${it.condition}` : ""}
                      </div>
                    </div>
                  </div>
                  {it.facts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {it.facts.map((f, i) => (
                        <span key={i} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 h-1 overflow-hidden rounded bg-surface-2">
                    <div className="h-full bg-accent" style={{ width: `${completeness(it) * 100}%` }} />
                  </div>
                </button>
              ),
            )}
            <p className="text-[11px] text-muted">🔒 The lowest price stays private: buyers and buyer agents never see it. Your agent never sells below it.</p>
          </div>
        </div>
      </main>
    </div>
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
  const save = async () => {
    try {
      const res = await fetch(`/api/teach/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          unit: f.unit,
          quantity: f.quantity.trim() ? parseInt(f.quantity, 10) : null,
          listPriceCents: cents(f.list),
          floorPriceCents: cents(f.floor),
          sellBy: f.sellBy || null,
          facts: f.facts.split("\n").map((x) => x.trim()).filter(Boolean),
        }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.message ?? `HTTP ${res.status}`);
      onDone(b as Session);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const del = async () => {
    const res = await fetch(`/api/teach/items/${item.id}`, { method: "DELETE" });
    onDone(res.ok ? ((await res.json()) as Session) : null);
  };
  const input = (k: keyof typeof f, label: string, type = "text") => (
    <label className="space-y-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <input type={type} step="0.01" className="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="space-y-2 rounded-xl border border-accent bg-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        {input("name", "Name")}
        {input("unit", "Unit (lb, box, each…)")}
        {input("quantity", "Quantity", "number")}
        {input("list", "Price ($)", "number")}
        {input("floor", "Lowest price ($) 🔒", "number")}
        <label className="space-y-0.5 text-xs">
          <span className="text-muted">Sell by</span>
          <select className="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm" value={f.sellBy} onChange={(e) => setF({ ...f, sellBy: e.target.value })}>
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
        <Btn kind="primary" onClick={save}>
          Save
        </Btn>
        <Btn onClick={() => onDone(null)}>Cancel</Btn>
        <Btn kind="danger" onClick={del}>
          Remove
        </Btn>
      </div>
    </div>
  );
}

function Published({ session, result, onMore }: { session: Session; result: PublishResult; onMore: () => void }) {
  return (
    <div>
      <TopNav active="teach" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div className="text-5xl" aria-hidden>
          🎉
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{session.shopName} is open. Your seller agent is working.</h1>
        <p className="text-ink-2">Each item now has a SKU, stock and a price. Buyer agents can find it, ask your agent questions, negotiate within your limits and pay with PayPal.</p>
        <Card title="Live items">
          <ul className="divide-y divide-line text-sm">
            {result.published.map((p) => (
              <li key={p.sku} className="flex items-center justify-between py-2">
                <span>{p.name}</span>
                <span className="font-mono text-xs text-ink-2">{p.sku}</span>
              </li>
            ))}
          </ul>
          {result.skipped.length > 0 && <p className="mt-2 text-xs text-warn">Not opened yet (needs quantity and price): {result.skipped.join(", ")}</p>}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Link href={`/seller/${result.shopId}`} className="rounded-lg bg-accent px-4 py-2 font-semibold text-white">
            My shop dashboard & QR labels
          </Link>
          <Link href="/market" className="rounded-lg border border-line bg-surface px-4 py-2 font-semibold">
            Watch a buyer agent shop →
          </Link>
          <button type="button" onClick={onMore} className="rounded-lg border border-line bg-surface px-4 py-2">
            Teach more items
          </button>
        </div>
      </main>
    </div>
  );
}
