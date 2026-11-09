"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/format";
import { EXAMPLE_SCRIPTS, scriptLine } from "@/lib/teach/examples";
import {
  SCENES,
  photoFor,
  photoToDataUrl,
  type SceneKind,
} from "@/lib/client/demoPhotos";
import { ItemCard } from "@/components/ItemCard";
import {
  IconCamera,
  IconMic,
  IconSend,
  IconStop,
  IconStore,
} from "@/components/icons";
import { ROSA } from "@/lib/demo/rosa";
import { MINA } from "@/lib/demo/mina";
import {
  prefetch,
  speak as speakLine,
  stopVoice,
  type VoiceRole,
} from "@/lib/client/voice";

/**
 * Sample videos: one phone clip per item, played while the owner's lines go through the real
 * teaching pipeline and the agent's actual replies are spoken back.
 */
type VideoKind = "fruit" | "closet";
interface VideoScript {
  voice: VoiceRole;
  hello: string;
  open: string | null;
  openPoster: string;
  scenes: { clip: string; photo: string; lines: string[] }[];
}
const VIDEOS: Record<VideoKind, VideoScript> = {
  fruit: {
    voice: "owner",
    hello: "Morning, Rosa! Show me what you've got today.",
    open: ROSA.clips.open,
    openPoster: "/photos/stall-live.jpg",
    scenes: ROSA.scenes.map((sc, i) => ({
      clip: ROSA.clips.scenes[i],
      photo: sc.photo,
      lines: sc.lines,
    })),
  },
  closet: {
    voice: "mina",
    hello: MINA.hello,
    open: null,
    openPoster: "/photos/closet-bedroom.jpg",
    scenes: MINA.scenes,
  },
};
const flat = (v: VideoScript) =>
  v.scenes.flatMap((sc, si) => sc.lines.map((line) => ({ line, si })));

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
  rules?: {
    closeHour?: number | null;
    marketCents?: number | null;
    marketNote?: string | null;
    demand?: string | null;
    bulk?: { minQty: number; pctOff: number } | false | null;
    leftover?: string | null;
    lookup?: {
      count: number;
      lowCents: number;
      highCents: number;
      suggestedLowCents: number;
      suggestedHighCents: number;
      examples: { title: string; priceCents: number; domain: string }[];
    };
  };
  checklist?: {
    key: string;
    label: string;
    done: boolean;
    skipped?: boolean;
  }[];
}
interface Session {
  id: string;
  shopId: string;
  shopName: string;
  status: string;
  focusItemId: string | null;
  items: Item[];
  messages: {
    role: "owner" | "agent";
    text: string;
    had_image: number;
    source: string;
  }[];
  reply?: string;
  channel3?: boolean;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRec;
type Source =
  | { kind: "none" }
  | { kind: "camera" }
  | { kind: "demo"; scene: SceneKind }
  | { kind: "video"; scene: VideoKind };

const GREETING =
  "Hi! Point me at something you sell and tell me what it is, like “These are Fuji apples, about 30 lb.”";

export default function Studio({ shopId }: { shopId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    api<Session>("/api/teach/sessions", { shopId })
      .then(setSession)
      .catch((e) => setLoadErr(String(e.message ?? e)));
  }, [shopId]);
  if (!session)
    return (
      <main className="grid min-h-[60vh] place-items-center p-6 text-label-2">
        {loadErr ?? "Getting your assistant ready…"}
      </main>
    );
  return (
    <Teach
      session={session}
      setSession={setSession}
      onOpened={() => router.push(`/seller/${shopId}?opened=1`)}
    />
  );
}

function Teach({
  session,
  setSession,
  onOpened,
}: {
  session: Session;
  setSession: (s: Session) => void;
  onOpened: () => void;
}) {
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
  const clipRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  /** Items that existed before the sample started: their Channel3 cards were shown earlier, not now. */
  const [before, setBefore] = useState<Set<string>>(() => new Set());
  const [agentLine, setAgentLine] = useState<string | null>(null);
  const [speechOk] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [session.focusItemId, session.items.length]);
  useEffect(() => {
    const v = videoRef.current;
    return () =>
      (v?.srcObject as MediaStream | null)
        ?.getTracks()
        .forEach((t) => t.stop());
  }, []);

  const focusItem =
    session.items.find((i) => i.id === session.focusItemId) ?? null;
  const items = [...session.items].sort((a, b) =>
    a.id === session.focusItemId ? -1 : b.id === session.focusItemId ? 1 : 0,
  );
  const ready = session.items.filter(
    (i) => i.quantity !== null && i.quantity > 0 && i.listPriceCents !== null,
  ).length;
  const lastAgent =
    agentLine ??
    [...session.messages].reverse().find((m) => m.role === "agent")?.text ??
    GREETING;
  const ownerSaid = session.messages.filter((m) => m.role === "owner").length;
  const vid = source.kind === "video" ? VIDEOS[source.scene] : null;
  const vlines = useMemo(() => (vid ? flat(vid) : []), [vid]);
  const [pos, setPos] = useState(0); // next script line in the sample video
  const posRef = useRef(0);
  const videoDone = !!vid && pos >= vlines.length;
  const sceneNow = vid
    ? (vlines[Math.min(pos, vlines.length - 1)]?.si ?? 0)
    : 0;
  const clip = !vid
    ? null
    : pos === 0 && !caption && vid.open
      ? vid.open
      : vid.scenes[sceneNow].clip;
  const clipPoster = !vid
    ? undefined
    : clip === vid.open
      ? vid.openPoster
      : vid.scenes[sceneNow].photo;
  const demoPhoto =
    source.kind === "demo"
      ? (focusItem && photoFor(source.scene, focusItem.name)?.src) ||
        SCENES[source.scene].wide
      : null;
  const nextLine = useMemo(() => {
    if (source.kind !== "demo") return null;
    const said = new Set(
      session.messages.filter((m) => m.role === "owner").map((m) => m.text),
    );
    const lastReply =
      [...session.messages].reverse().find((m) => m.role === "agent")?.text ??
      null;
    const lines = EXAMPLE_SCRIPTS[source.scene].lines;
    const lastSaid = lines.reduce(
      (acc, l, i) => (said.has(l.replace(/^\?market:/, "")) ? i : acc),
      -1,
    );
    for (const raw of lines.slice(lastSaid + 1)) {
      const l = scriptLine(raw, lastReply);
      if (l && !said.has(l)) return l;
    }
    return null;
  }, [source, session.messages]);

  const startCamera = async () => {
    setCamErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      setSource({ kind: "camera" });
      requestAnimationFrame(async () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setCamErr(
        `The camera didn’t open (${e instanceof Error ? e.name : "error"}). Cameras need a secure (https) page and your permission. You can use the sample stall instead.`,
      );
    }
  };

  const frame = async (utterance: string): Promise<string | null> => {
    const cv = clipRef.current;
    if (source.kind === "video" && cv && canvasRef.current && cv.videoWidth) {
      const c = canvasRef.current;
      c.width = 512;
      c.height = Math.round((cv.videoHeight / cv.videoWidth) * 512);
      c.getContext("2d")!.drawImage(cv, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.7);
    }
    if (vid) {
      // Clip not loaded yet: use the matching still.
      const still = vid.scenes[sceneNow]?.photo;
      return still ? photoToDataUrl(still) : null;
    }
    if (source.kind === "demo") {
      const p =
        photoFor(source.scene, utterance) ??
        (focusItem ? photoFor(source.scene, focusItem.name) : null);
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

  const send = async (utterance: string): Promise<Session | null> => {
    const t = utterance.trim();
    if (!t || sending) return null;
    setSending(true);
    setErr(null);
    try {
      const s = await api<Session>(`/api/teach/sessions/${session.id}/turn`, {
        text: t,
        image: await frame(t),
        scripted: source.kind === "video" || source.kind === "demo",
      });
      setSession(s);
      setText("");
      if (s.reply && source.kind !== "video") say(s.reply);
      return s;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSending(false);
    }
  };

  // The sample video: Rosa says each line (her voice), the line goes through the real teaching
  // pipeline, and the agent's actual reply is spoken back. Pausing stops after the current line.
  const playRef = useRef({ on: false });
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
    if (muted) stopVoice();
  }, [muted]);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (source.kind !== "video" || !playing) return;
    const ctl = { on: true };
    playRef.current = ctl;
    const v = VIDEOS[source.scene];
    const lines = flat(v);
    (async () => {
      let i = posRef.current;
      let lastReply: string | null =
        [...session.messages].reverse().find((m) => m.role === "agent")?.text ??
        null;
      if (i === 0) {
        setAgentLine(v.hello);
        prefetch(v.voice, lines[0].line);
        await speakLine("agent", v.hello, { muted: mutedRef.current });
      }
      while (ctl.on && i < lines.length) {
        const line = scriptLine(lines[i].line, lastReply);
        if (!line) {
          // An answer the agent didn't ask for (e.g. the price elsewhere, already looked up on Channel3).
          i++;
          posRef.current = i;
          setPos(i);
          continue;
        }
        setCaption(line);
        await speakLine(v.voice, line, { muted: mutedRef.current });
        if (!ctl.on) break;
        const s = await sendRef.current(line);
        if (!s) break;
        i++;
        posRef.current = i;
        setPos(i);
        setAgentLine(null);
        lastReply = s.reply ?? null;
        if (i < lines.length)
          prefetch(v.voice, lines[i].line.replace(/^\?market:/, ""));
        if (s.reply && ctl.on)
          await speakLine("agent", s.reply, { muted: mutedRef.current });
      }
      setCaption(null);
      if (i >= lines.length) setPlaying(false);
    })();
    return () => {
      ctl.on = false;
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, source]);

  const toggleMic = () => {
    if (listening) return recRef.current?.stop();
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
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
    rec.onerror = (e) =>
      setErr(
        e.error === "not-allowed"
          ? "Microphone access was denied. You can type instead."
          : `Couldn’t hear that (${e.error}). Try again or type.`,
      );
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
        <div className="grain relative h-[58vh] min-h-[360px] overflow-hidden bg-black lg:aspect-[4/5] lg:h-auto lg:rounded-[32px]">
          {source.kind === "camera" && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {clip && (
            <video
              ref={clipRef}
              key={clip}
              src={clip}
              poster={clipPoster}
              autoPlay
              loop
              muted
              playsInline
              className="warm-photo absolute inset-0 h-full w-full object-cover"
            />
          )}
          {source.kind === "video" && source.scene === "closet" && (
            <div className="absolute inset-x-4 top-16 z-20 flex justify-center">
              {focusItem?.rules?.lookup && !before.has(focusItem.id) ? (
                <div
                  key={focusItem.id}
                  className="relative flex w-full justify-center"
                >
                  <div className="c3-life absolute inset-x-0 top-0 mx-auto w-full max-w-[340px]">
                    <div className="c3-pop w-full rounded-[22px] bg-white/95 p-3.5 text-label shadow-2xl">
                      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-label-2">
                        <span className="rounded-md bg-label px-2 py-0.5 text-[12px] font-bold normal-case tracking-normal text-white">
                          Channel3
                        </span>
                        Price check · {focusItem.rules.lookup.count} stores
                      </div>
                      <p className="mt-1 truncate text-[15px] font-semibold">
                        {focusItem.name}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-[14px] bg-fill/60 px-3 py-2">
                          <span className="block text-[11px] text-label-2">
                            New, online
                          </span>
                          <span className="block text-[22px] font-bold leading-tight">
                            ${Math.round(focusItem.rules.lookup.lowCents / 100)}
                            –$
                            {Math.round(focusItem.rules.lookup.highCents / 100)}
                          </span>
                        </div>
                        <div className="rounded-[14px] bg-brand px-3 py-2 text-white">
                          <span className="block text-[11px] text-white/80">
                            Fair resale
                          </span>
                          <span className="block text-[22px] font-bold leading-tight">
                            $
                            {Math.round(
                              focusItem.rules.lookup.suggestedLowCents / 100,
                            )}
                            –$
                            {Math.round(
                              focusItem.rules.lookup.suggestedHighCents / 100,
                            )}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-[12px] leading-snug text-label-2">
                        Mina’s agent uses this to hold her price when buyers
                        haggle.
                      </p>
                    </div>
                  </div>
                  <span className="c3-mini frosted flex items-center gap-2 rounded-full px-3 py-1 text-[12px] text-label shadow">
                    <span className="rounded bg-label px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Channel3
                    </span>
                    New ${Math.round(focusItem.rules.lookup.lowCents / 100)}–$
                    {Math.round(focusItem.rules.lookup.highCents / 100)} ·
                    resale $
                    {Math.round(focusItem.rules.lookup.suggestedLowCents / 100)}
                    –$
                    {Math.round(
                      focusItem.rules.lookup.suggestedHighCents / 100,
                    )}
                  </span>
                </div>
              ) : sending && session.channel3 && /^(this is|these are|next (is|are)|and (this|these))\b/i.test(caption ?? "") ? (
                <div className="c3-scan relative w-full max-w-[340px] overflow-hidden rounded-[22px] bg-white/95 p-3.5 text-label shadow-2xl">
                  <div className="flex items-center gap-2 text-[15px] font-semibold">
                    <span className="rounded-md bg-label px-2 py-0.5 text-[12px] font-bold text-white">
                      Channel3
                    </span>
                    Checking prices online…
                  </div>
                  <p className="mt-1 text-[12px] text-label-2">
                    Searching stores for the same item, new
                  </p>
                </div>
              ) : session.channel3 === false ? (
                <span className="frosted-dark rounded-full px-3.5 py-1.5 text-[12px] text-white/90">
                  Channel3 not connected (CHANNEL3_API_KEY) · Mina tells the
                  price herself
                </span>
              ) : null}
            </div>
          )}
          {source.kind === "video" && caption && (
            <p
              key={caption}
              className="rise absolute inset-x-4 bottom-[132px] z-10 ml-auto w-fit max-w-[88%] rounded-[20px] rounded-br-[6px] bg-brand px-4 py-2.5 text-[16px] leading-snug text-white shadow-lg"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/70">
                {source.scene === "closet"
                  ? `${MINA.owner} · Closet seller`
                  : `${ROSA.owner} · Shop owner`}
              </span>
              {caption}
            </p>
          )}
          {demoPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={demoPhoto}
              src={demoPhoto}
              alt="Sample camera view"
              className="handheld warm-photo absolute inset-0 h-full w-full object-cover"
            />
          )}
          {source.kind !== "none" && (
            <span
              key={`focus-${demoPhoto ?? clip ?? "cam"}-${session.focusItemId ?? ""}`}
              className="focus-square z-10"
              aria-hidden
            />
          )}
          {source.kind === "none" && (
            <div className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/photos/stall-live.jpg"
                alt=""
                className="warm-photo absolute inset-0 h-full w-full object-cover opacity-55"
              />
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/30 to-black/80 p-6">
                <div className="w-full max-w-sm text-center text-white">
                  <p className="hand text-[30px] text-[#ffd9a8]">
                    Morning! What are we selling today?
                  </p>
                  <h2 className="display mt-1 text-[30px] leading-tight">
                    Show me your stall.
                  </h2>
                  <p className="mt-2 text-[17px] text-white/80">
                    Walk around with the camera on and talk, like you’re
                    training a new helper. Your assistant asks until it knows
                    enough to haggle for you.
                  </p>
                  <p className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-white/70">
                    Watch a sample (instead of your camera)
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2.5 text-left">
                    {(
                      [
                        {
                          scene: "fruit",
                          photo: "/photos/apples-box.jpg",
                          who: "Rosa · Shop owner",
                          what: "Fruit stall, 3 crates",
                          extra: "Prices elsewhere, closing time, bulk deals",
                        },
                        {
                          scene: "closet",
                          photo: "/photos/denim-jacket.jpg",
                          who: "Mina · Closet seller",
                          what: "Closet, 5 items",
                          extra: "New prices looked up on Channel3",
                        },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.scene}
                        type="button"
                        onClick={() => {
                          setBefore(new Set(session.items.map((i) => i.id)));
                          setSource({ kind: "video", scene: o.scene });
                          setPlaying(true);
                        }}
                        className="group overflow-hidden rounded-[18px] bg-white text-label shadow-lg transition hover:-translate-y-0.5"
                      >
                        <span className="relative block h-24 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={o.photo}
                            alt=""
                            className="warm-photo h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 grid place-items-center bg-black/25 text-[22px] text-white">
                            ▶
                          </span>
                        </span>
                        <span className="block px-3 pb-3 pt-2">
                          <span className="block text-[15px] font-semibold leading-tight">
                            {o.what}
                          </span>
                          <span className="block text-[12px] text-label-2">
                            {o.who}
                          </span>
                          <span className="mt-1 block text-[11px] leading-snug text-label-3">
                            {o.extra}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-4 inline-flex items-center gap-1.5 text-[15px] text-white/80 hover:text-white"
                  >
                    <IconCamera size={16} /> Or use my camera (needs https)
                  </button>
                  {camErr && (
                    <p className="mt-4 rounded-2xl bg-white/15 p-3 text-[14px]">
                      {camErr}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pb-8 pt-4"
            style={{
              background: "linear-gradient(rgba(0,0,0,.45), transparent)",
            }}
          >
            <Link
              href={`/seller/${session.shopId}`}
              className="frosted-dark rounded-full px-3.5 py-1.5 text-[15px] text-white lg:hidden"
            >
              Done
            </Link>
            {source.kind !== "none" ? (
              <LiveBadge
                sample={source.kind === "demo" || source.kind === "video"}
              />
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={openShop}
              disabled={!ready || opening}
              className="rounded-full bg-brand px-4 py-1.5 text-[15px] font-semibold text-white shadow disabled:bg-white/25 disabled:text-white/80"
            >
              {opening
                ? "Opening…"
                : ready
                  ? `Open shop · ${ready}`
                  : "Open shop"}
            </button>
          </div>

          {source.kind !== "none" && (
            <div
              className="frosted absolute inset-x-3 bottom-3 z-10 flex items-start gap-3 rounded-[22px] p-3.5 text-label shadow-lg"
              aria-live="polite"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-label text-white">
                <IconStore size={19} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between text-[13px] font-semibold">
                  <span>
                    {source.kind === "video"
                      ? `${source.scene === "closet" ? MINA.owner : ROSA.owner}’s agent (AI)`
                      : "Assistant"}
                  </span>
                  <span className="font-normal text-label-2">
                    {sending ? "Thinking…" : "now"}
                  </span>
                </div>
                <p className="text-[15px] leading-snug">{lastAgent}</p>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        {err && (
          <p className="mx-4 mt-3 rounded-2xl bg-red/10 px-4 py-3 text-[15px] text-red lg:mx-0">
            {err}
          </p>
        )}

        {/* Talk bar */}
        <div className="frosted fixed inset-x-0 bottom-0 z-40 border-t border-black/10 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {source.kind === "video" && (
            <div className="mx-auto mb-2.5 flex max-w-[1100px] items-center gap-2">
              {videoDone ? (
                <p className="flex-1 rounded-[18px] bg-card px-4 py-3 text-[15px] font-medium text-green">
                  Done. Check the cards, then tap “Open shop”.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="flex-1 rounded-full bg-label py-3 text-[16px] font-semibold text-white"
                >
                  {playing
                    ? "❚❚ Pause"
                    : ownerSaid
                      ? "▶ Resume video"
                      : "▶ Play"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="rounded-full bg-card px-4 py-3 text-[15px]"
                aria-label={muted ? "Sound on" : "Sound off"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            </div>
          )}
          {nextLine && (
            <button
              type="button"
              disabled={sending}
              onClick={() => send(nextLine)}
              className="mb-2.5 flex w-full items-center gap-3 rounded-[18px] bg-card px-3.5 py-2.5 text-left shadow-[0_1px_6px_rgba(0,0,0,0.08)] disabled:opacity-50"
            >
              <span className="shrink-0 text-[13px] font-semibold text-brand">
                Tap to say
              </span>
              <span className="line-clamp-2 text-[15px] text-label">
                “{nextLine}”
              </span>
            </button>
          )}
          <div className="mx-auto flex max-w-[1100px] items-center gap-2.5">
            {speechOk && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={sending}
                aria-label={listening ? "Stop listening" : "Talk"}
                className={`grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-white ${listening ? "listening bg-[#ff3b30]" : "bg-brand"} disabled:opacity-40`}
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
              <button
                type="submit"
                disabled={sending || !text.trim()}
                aria-label="Send"
                className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white disabled:bg-transparent disabled:text-label-3"
              >
                <IconSend size={18} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* What the assistant learned */}
      <section className="pb-52 pt-6 lg:pb-0 lg:pt-0">
        <div className="mx-5 mb-3 flex items-baseline justify-between lg:mx-0">
          <h2 className="text-[28px] font-bold tracking-tight">
            Learned so far
          </h2>
          {session.items.length > 0 && (
            <span className="text-[15px] text-label-2">Tap to edit</span>
          )}
        </div>
        {session.items.length === 0 && (
          <p className="mx-5 rounded-[22px] bg-card p-5 text-[17px] text-label-2 lg:mx-0">
            Products appear here while you talk. There are no forms to fill in.
          </p>
        )}
        <div
          ref={stripRef}
          className="flex snap-x gap-3 overflow-x-auto px-5 pb-3 pt-1 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {items.map((it) => (
            <div
              key={it.id}
              className="rise w-[85%] shrink-0 snap-start lg:w-full"
            >
              {editing === it.id ? (
                <EditItem
                  item={it}
                  onDone={(s) => {
                    if (s) setSession(s);
                    setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(it.id)}
                  className="block w-full text-left"
                >
                  <ItemCard
                    t={it}
                    active={session.focusItemId === it.id}
                    showSteps={!it.checklist}
                  />
                  {it.rules?.lookup && <LookupNote l={it.rules.lookup} />}
                  {it.checklist && <Checklist items={it.checklist} />}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mx-5 mt-5 overflow-hidden rounded-[14px] bg-card text-[17px] lg:mx-0">
          <label className="flex items-center justify-between border-b border-line px-4 py-3">
            Language
            <select
              className="bg-transparent text-label-2 outline-none"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="en-US">English</option>
              <option value="ko-KR">한국어</option>
            </select>
          </label>
          <label className="flex items-center justify-between border-b border-line px-4 py-3">
            Assistant speaks
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#34c759]"
              checked={speak}
              onChange={(e) => setSpeak(e.target.checked)}
            />
          </label>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setShowChat((v) => !v)}
          >
            Conversation
            <span className="text-label-2">
              {showChat ? "Hide" : `${session.messages.length} messages ›`}
            </span>
          </button>
        </div>
        {showChat && (
          <div className="mx-5 mt-3 max-h-80 space-y-2 overflow-y-auto rounded-[22px] bg-card p-4 lg:mx-0">
            {session.messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "owner" ? "justify-end" : ""}`}
              >
                <span
                  className={`max-w-[85%] rounded-[18px] px-3.5 py-2 text-[15px] ${m.role === "owner" ? "bg-brand text-white" : "bg-fill"}`}
                >
                  {m.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/** The Channel3 price lookup the assistant did for a second-hand item. */
function LookupNote({
  l,
}: {
  l: NonNullable<NonNullable<Item["rules"]>["lookup"]>;
}) {
  const $ = (c: number) => `$${Math.round(c / 100)}`;
  return (
    <div className="mt-1.5 rounded-[14px] bg-card px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Looked up with Channel3</span>
        <span className="text-label-3">{l.count} listings</span>
      </div>
      <div className="mt-0.5 text-label-2">
        New online:{" "}
        <b className="tnum text-label">
          {$(l.lowCents)}–{$(l.highCents)}
        </b>{" "}
        · Fair resale:{" "}
        <b className="tnum text-label">
          {$(l.suggestedLowCents)}–{$(l.suggestedHighCents)}
        </b>
      </div>
      <div className="mt-0.5 truncate text-label-3">
        {l.examples.map((e) => `${e.domain} ${$(e.priceCents)}`).join(" · ")}
      </div>
    </div>
  );
}

/** What the assistant still needs to know to haggle well. */
function Checklist({ items }: { items: NonNullable<Item["checklist"]> }) {
  const done = items.filter((c) => c.done).length;
  const missing = items.filter((c) => !c.done);
  return (
    <div className="mt-1.5 rounded-[14px] bg-card px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Ready to haggle</span>
        <span
          className={`tnum rounded-full px-2 py-0.5 font-semibold ${missing.length ? "bg-fill text-label-2" : "bg-green-fill/15 text-green"}`}
        >
          {done}/{items.length}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((c) => (
          <span
            key={c.key}
            className={`rounded-full px-2 py-0.5 ${c.done ? "bg-label text-white" : c.skipped ? "bg-fill text-label-3 line-through" : "bg-fill text-label-3"}`}
          >
            {c.done ? "✓ " : ""}
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "● Live 00:42" like a phone camera recording, so the screen reads as a live camera, not a photo. */
function LiveBadge({ sample }: { sample: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="frosted-dark flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-white">
      <span className="rec-dot h-2 w-2 rounded-full bg-[#ff3b30]" aria-hidden />
      <span className="tnum">
        {sample ? "Sample" : "Live"} {mm}:{ss}
      </span>
    </span>
  );
}

function EditItem({
  item,
  onDone,
}: {
  item: Item;
  onDone: (s: Session | null) => void;
}) {
  const [f, setF] = useState({
    name: item.name,
    unit: item.unit,
    quantity: item.quantity?.toString() ?? "",
    list:
      item.listPriceCents !== null
        ? (item.listPriceCents / 100).toFixed(2)
        : "",
    floor:
      item.floorPriceCents !== null
        ? (item.floorPriceCents / 100).toFixed(2)
        : "",
    sellBy: item.sellBy ?? "",
    facts: item.facts.join("\n"),
    closeHour:
      typeof item.rules?.closeHour === "number"
        ? String(item.rules.closeHour)
        : "",
    market:
      typeof item.rules?.marketCents === "number"
        ? (item.rules.marketCents / 100).toFixed(2)
        : "",
    marketNote: item.rules?.marketNote ?? "",
    bulkQty: item.rules?.bulk ? String(item.rules.bulk.minQty) : "",
    bulkPct: item.rules?.bulk ? String(item.rules.bulk.pctOff) : "",
    leftover: item.rules?.leftover ?? "",
    demand: item.rules?.demand ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const cents = (s: string) =>
    s.trim() ? Math.round(parseFloat(s) * 100) : null;
  const call = async (method: "PATCH" | "DELETE", body?: unknown) => {
    try {
      const res = await fetch(`/api/teach/items/${item.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
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
        <button
          type="button"
          className="text-link"
          onClick={() => onDone(null)}
        >
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
              facts: f.facts
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
              rules: {
                closeHour: f.closeHour ? parseInt(f.closeHour, 10) : null,
                marketCents: cents(f.market),
                marketNote: f.marketNote.trim() || null,
                bulk:
                  f.bulkQty && f.bulkPct
                    ? {
                        minQty: parseInt(f.bulkQty, 10),
                        pctOff: parseInt(f.bulkPct, 10),
                      }
                    : item.rules?.bulk === false
                      ? false
                      : null,
                leftover: (f.leftover || null) as
                  | "waste"
                  | "use"
                  | "keep"
                  | null,
                demand: (f.demand || null) as "high" | "normal" | "slow" | null,
              },
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
        <select
          className="bg-transparent text-right text-label-2 outline-none"
          value={f.sellBy}
          onChange={(e) => setF({ ...f, sellBy: e.target.value })}
        >
          <option value="">Not set</option>
          <option value="today">Today</option>
          <option value="this_week">This week</option>
          <option value="no_rush">No rush</option>
        </select>
      </label>
      <div className="border-b border-line bg-canvas px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-label-2">
        For haggling (only you see this)
      </div>
      {f.sellBy === "today" && (
        <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span>Closing time</span>
          <select
            className="bg-transparent text-right text-label-2 outline-none"
            value={f.closeHour}
            onChange={(e) => setF({ ...f, closeHour: e.target.value })}
          >
            <option value="">Not set</option>
            {Array.from({ length: 12 }, (_, k) => k + 12).map((h) => (
              <option key={h} value={h}>
                {h === 12 ? "12 pm" : `${h - 12} pm`}
              </option>
            ))}
          </select>
        </label>
      )}
      {row("market", "Price elsewhere ($)", "number")}
      {row("marketNote", "Where (e.g. the supermarket)")}
      <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="shrink-0">Bulk deal</span>
        <span className="flex min-w-0 items-center gap-1 text-label-2">
          <input
            type="number"
            inputMode="numeric"
            className="w-12 bg-transparent text-right outline-none"
            placeholder="5"
            value={f.bulkQty}
            onChange={(e) => setF({ ...f, bulkQty: e.target.value })}
            aria-label="Bulk minimum quantity"
          />
          {item.unit === "each" ? "+" : `${item.unit}+`}
          <input
            type="number"
            inputMode="numeric"
            className="w-10 bg-transparent text-right outline-none"
            placeholder="10"
            value={f.bulkPct}
            onChange={(e) => setF({ ...f, bulkPct: e.target.value })}
            aria-label="Bulk percent off"
          />
          % off
        </span>
      </label>
      <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span>If unsold</span>
        <select
          className="bg-transparent text-right text-label-2 outline-none"
          value={f.leftover}
          onChange={(e) => setF({ ...f, leftover: e.target.value })}
        >
          <option value="">Not set</option>
          <option value="waste">Thrown away</option>
          <option value="use">I use them (jam, juice…)</option>
          <option value="keep">They keep</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span>How fast it sells</span>
        <select
          className="bg-transparent text-right text-label-2 outline-none"
          value={f.demand}
          onChange={(e) => setF({ ...f, demand: e.target.value })}
        >
          <option value="">Not set</option>
          <option value="high">Sells out</option>
          <option value="normal">Steady</option>
          <option value="slow">Slow</option>
        </select>
      </label>
      <label className="block px-4 py-2.5">
        <span className="text-[13px] text-label-2">
          What buyers should know, one per line
        </span>
        <textarea
          className="mt-1 h-20 w-full resize-none bg-transparent outline-none"
          value={f.facts}
          onChange={(e) => setF({ ...f, facts: e.target.value })}
        />
      </label>
      {err && <p className="px-4 pb-2 text-[15px] text-red">{err}</p>}
      <button
        type="button"
        className="w-full border-t border-line py-3 text-red"
        onClick={() => call("DELETE")}
      >
        Remove item
      </button>
    </div>
  );
}
