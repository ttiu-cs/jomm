"use client";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

/**
 * Illustrated stand-in for a phone camera, used in demo mode when no camera is available.
 * Drawn entirely in SVG so it ships with the app (no stock photos). The view pans to the
 * crate/garment the owner is talking about, and `snapshotRegion` crops a "photo" for the tag.
 */

export type SceneKind = "fruit" | "closet";
const W = 1200;
const H = 800;
export const REGIONS: Record<SceneKind, { x: number; y: number; w: number; h: number }[]> = {
  fruit: [
    { x: 40, y: 300, w: 380, h: 360 },
    { x: 410, y: 300, w: 380, h: 360 },
    { x: 780, y: 300, w: 380, h: 360 },
  ],
  closet: [
    { x: 70, y: 120, w: 360, h: 600 },
    { x: 420, y: 120, w: 360, h: 600 },
    { x: 770, y: 120, w: 360, h: 600 },
  ],
};

/** Which region an item name refers to. */
export function regionFor(scene: SceneKind, name: string, fallbackIndex: number): number {
  const n = name.toLowerCase();
  const keys = scene === "fruit" ? [/apple|사과/, /peach|복숭아/, /strawberr|딸기|berry/] : [/coat|코트/, /denim|jean|jacket|자켓|재킷/, /sweater|knit|니트|스웨터/];
  const i = keys.findIndex((k) => k.test(n));
  return i >= 0 ? i : fallbackIndex < 0 ? -1 : Math.min(2, fallbackIndex);
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A heaped mound of round fruit: narrow at the top, widest at the bottom row. */
function pile(seed: number, cx: number, top: number, width: number, rows: number, r: number) {
  const rand = rng(seed);
  const out: { x: number; y: number; r: number; rot: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const y = top + row * r * 1.2;
    const rowWidth = width * (rows === 1 ? 1 : 0.45 + (0.55 * row) / (rows - 1));
    const n = Math.max(1, Math.floor(rowWidth / (r * 1.8)));
    for (let i = 0; i < n; i++) {
      const x = cx - ((n - 1) * r * 1.8) / 2 + i * r * 1.8 + (rand() - 0.5) * r * 0.35;
      out.push({ x, y: y + (rand() - 0.5) * r * 0.3, r: r * (0.9 + rand() * 0.18), rot: rand() * 360 });
    }
  }
  // Draw back rows first so lower rows overlap them.
  return out;
}

function CrateBack({ x }: { x: number }) {
  return <rect x={x + 6} y={470} width={328} height={80} rx={6} fill="#6e4b25" />;
}

function Crate({ x, label }: { x: number; label: string }) {
  return (
    <g aria-label={label}>
      <rect x={x} y={520} width={340} height={170} rx={8} fill="url(#wood)" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x} y={530 + i * 54} width={340} height={44} rx={4} fill="url(#slat)" opacity={0.95} />
      ))}
      {[x + 14, x + 326].map((nx) => [548, 602, 656].map((ny) => <circle key={`${nx}${ny}`} cx={nx} cy={ny} r={2.6} fill="#5a3d1d" opacity={0.7} />))}
      <rect x={x} y={510} width={340} height={22} rx={6} fill="#b98a52" />
    </g>
  );
}

function FruitScene() {
  const apples = useMemo(() => pile(11, 230, 392, 318, 5, 27), []);
  const peaches = useMemo(() => pile(23, 600, 386, 318, 5, 30), []);
  return (
    <>
      <rect width={W} height={H} fill="url(#sky)" />
      <g filter="url(#bgblur)">
        <rect x={0} y={160} width={W} height={260} fill="#7f9a83" opacity={0.55} />
        {[...Array(14)].map((_, i) => (
          <circle key={i} cx={(i * 97) % W} cy={190 + ((i * 53) % 160)} r={20 + ((i * 7) % 30)} fill={i % 3 ? "#f6efd9" : "#c7d9b8"} opacity={0.35} />
        ))}
      </g>
      {/* awning */}
      <g>
        {[...Array(13)].map((_, i) => (
          <path key={i} d={`M${i * 100 - 20} 0h100v92q-50 34-100 0z`} fill={i % 2 ? "#f4f1e8" : "#2f6e47"} />
        ))}
        <rect width={W} height={10} y={0} fill="#1f4d33" />
      </g>
      {/* table */}
      <rect x={0} y={640} width={W} height={160} fill="url(#table)" />
      <rect x={0} y={632} width={W} height={14} fill="#7b5530" />
      <CrateBack x={60} />
      <CrateBack x={430} />
      <CrateBack x={800} />
      {/* apples */}
      {apples.map((a, i) => (
        <g key={`a${i}`} transform={`translate(${a.x} ${a.y}) rotate(${a.rot % 40 - 20})`}>
          <circle r={a.r} fill="url(#apple)" />
          <ellipse cx={-a.r * 0.35} cy={-a.r * 0.4} rx={a.r * 0.28} ry={a.r * 0.16} fill="#fff" opacity={0.45} />
          <path d={`M0 ${-a.r * 0.8} q4 -10 9 -14`} stroke="#4b2e12" strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* peaches */}
      {peaches.map((p, i) => (
        <g key={`p${i}`} transform={`translate(${p.x} ${p.y})`}>
          <circle r={p.r} fill="url(#peach)" />
          <path d={`M${-p.r * 0.1} ${-p.r * 0.95} q${p.r * 0.35} ${p.r * 0.9} 0 ${p.r * 1.8}`} stroke="#c9695a" strokeWidth={2} fill="none" opacity={0.35} />
          <ellipse cx={-p.r * 0.35} cy={-p.r * 0.35} rx={p.r * 0.3} ry={p.r * 0.2} fill="#fff" opacity={0.3} />
        </g>
      ))}
      {/* strawberry pints */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const bx = 820 + (i % 3) * 108;
        const by = 392 + Math.floor(i / 3) * 70;
        const berries = pile(40 + i, bx + 48, by + 6, 90, 2, 15);
        return (
          <g key={`s${i}`}>
            {berries.map((b, j) => (
              <g key={j} transform={`translate(${b.x} ${b.y}) rotate(${b.rot % 50 - 25})`}>
                <path d="M0 15c-11-4-15-14-13-20 2-5 8-6 13-4 5-2 11-1 13 4 2 6-2 16-13 20z" fill="url(#berry)" />
                <path d="M-7-7l7 4 7-4-3 6h-8z" fill="#3f8a2f" />
                {[-5, 0, 5, -3, 3].map((sx, k) => (
                  <circle key={k} cx={sx} cy={k < 3 ? 2 : 8} r={0.9} fill="#ffe7a6" />
                ))}
              </g>
            ))}
            <path d={`M${bx} ${by + 24}h96l-8 66h-80z`} fill="url(#pint)" />
            {[1, 2, 3].map((k) => (
              <path key={k} d={`M${bx + 4 + k * 22} ${by + 28}l-2 58`} stroke="#5f8c46" strokeWidth={2} opacity={0.5} />
            ))}
          </g>
        );
      })}
      <Crate x={60} label="Fuji apples" />
      <Crate x={430} label="White peaches" />
      <Crate x={800} label="Strawberries" />
    </>
  );
}

function Garment({ x, kind }: { x: number; kind: 0 | 1 | 2 }) {
  const fill = kind === 0 ? "url(#navy)" : kind === 1 ? "url(#denim)" : "url(#knit)";
  return (
    <g transform={`translate(${x} 150)`}>
      <path d="M150 0 q0 -22 18 -22 q18 0 18 18" stroke="#7a5a32" strokeWidth={5} fill="none" />
      <path d="M150 18 L70 52 L230 52 Z" fill="#a37a45" />
      {kind === 0 && (
        <>
          <path d="M80 50 L40 120 L30 360 L80 368 L84 160 L92 560 L208 560 L216 160 L220 368 L270 360 L260 120 L220 50 Q150 80 80 50Z" fill={fill} />
          <path d="M150 70 L150 560" stroke="#0f1a33" strokeWidth={3} opacity={0.6} />
          {[150, 230, 310, 390].map((y) => (
            <circle key={y} cx={166} cy={y} r={7} fill="#1c2742" stroke="#3a4a6e" strokeWidth={2} />
          ))}
          <path d="M150 70 L112 150 L150 200 M150 70 L188 150 L150 200" stroke="#0f1a33" strokeWidth={4} fill="none" opacity={0.5} />
        </>
      )}
      {kind === 1 && (
        <>
          <path d="M84 50 L44 110 L36 330 L84 336 L88 170 L94 420 L206 420 L212 170 L216 336 L264 330 L256 110 L216 50 Q150 76 84 50Z" fill={fill} />
          <path d="M94 230 L206 230 M150 74 L150 420" stroke="#e8d38b" strokeWidth={2.5} strokeDasharray="6 5" opacity={0.8} />
          <rect x={102} y={170} width={36} height={40} rx={4} fill="none" stroke="#e8d38b" strokeWidth={2.5} strokeDasharray="5 4" opacity={0.8} />
          <rect x={162} y={170} width={36} height={40} rx={4} fill="none" stroke="#e8d38b" strokeWidth={2.5} strokeDasharray="5 4" opacity={0.8} />
          <ellipse cx={58} cy={318} rx={9} ry={6} fill="#6d5a3a" opacity={0.55} />
        </>
      )}
      {kind === 2 && (
        <>
          <path d="M80 50 L36 120 L28 340 L76 344 L84 170 L88 430 L212 430 L216 170 L224 344 L272 340 L264 120 L220 50 Q150 92 80 50Z" fill={fill} />
          {[...Array(9)].map((_, i) => (
            <path key={i} d={`M${96 + i * 13} 120 v300`} stroke="#d9cdb0" strokeWidth={3} opacity={0.6} />
          ))}
          <rect x={88} y={406} width={124} height={24} fill="#e3d8bd" />
        </>
      )}
    </g>
  );
}

function ClosetScene() {
  return (
    <>
      <rect width={W} height={H} fill="url(#wall)" />
      <rect x={880} y={40} width={300} height={420} rx={6} fill="#fffaf0" opacity={0.6} filter="url(#bgblur)" />
      <rect x={0} y={700} width={W} height={100} fill="url(#floor)" />
      <rect x={40} y={118} width={1120} height={14} rx={7} fill="url(#rail)" />
      <Garment x={100} kind={0} />
      <Garment x={450} kind={1} />
      <Garment x={800} kind={2} />
    </>
  );
}

type VB = [number, number, number, number];
function targetBox(scene: SceneKind, focus: number | null): VB {
  if (focus === null) return [0, 0, W, H];
  const r = REGIONS[scene][focus];
  const w = Math.min(W, r.w * 1.35);
  const h = Math.min(H, r.h * 1.15);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [Math.max(0, Math.min(W - w, cx - w / 2)), Math.max(0, Math.min(H - h, cy - h / 2)), w, h];
}

export const DemoScene = forwardRef<SVGSVGElement, { scene: SceneKind; focus: number | null; className?: string }>(function DemoScene({ scene, focus, className = "" }, ref) {
  // Pan/zoom by tweening the SVG viewBox toward the region being discussed.
  const [vb, setVb] = useState<VB>(() => targetBox(scene, focus));
  const vbRef = useRef(vb);
  useEffect(() => {
    const to = targetBox(scene, focus);
    const from = vbRef.current;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : 900;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = dur ? Math.min(1, (t - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      const next = from.map((f, i) => f + (to[i] - f) * e) as VB;
      vbRef.current = next;
      setVb(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scene, focus]);
  return (
    <div className={`overflow-hidden bg-[#2b3a2f] ${className || "relative"}`}>
      <svg
        ref={ref}
        viewBox={vb.join(" ")}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label={scene === "fruit" ? "Demo camera: a fruit stand with crates of apples, peaches and strawberries" : "Demo camera: a clothing rail with a coat, a denim jacket and a sweater"}
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dfe8dc" />
            <stop offset="1" stopColor="#b9c8b3" />
          </linearGradient>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9c6f3d" />
            <stop offset="1" stopColor="#6e4b25" />
          </linearGradient>
          <linearGradient id="slat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9ad74" />
            <stop offset="1" stopColor="#b98a52" />
          </linearGradient>
          <linearGradient id="table" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a6239" />
            <stop offset="1" stopColor="#5d3f20" />
          </linearGradient>
          <radialGradient id="apple" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ff6b57" />
            <stop offset="0.45" stopColor="#d1271f" />
            <stop offset="1" stopColor="#7c0f12" />
          </radialGradient>
          <radialGradient id="peach" cx="0.4" cy="0.35" r="0.85">
            <stop offset="0" stopColor="#fff3d6" />
            <stop offset="0.5" stopColor="#ffd2a6" />
            <stop offset="0.85" stopColor="#f2a184" />
            <stop offset="1" stopColor="#d97a6a" />
          </radialGradient>
          <radialGradient id="berry" cx="0.4" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ff5a5f" />
            <stop offset="1" stopColor="#a8101e" />
          </radialGradient>
          <linearGradient id="pint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fbf6a" />
            <stop offset="1" stopColor="#5e8f41" />
          </linearGradient>
          <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#efe9df" />
            <stop offset="1" stopColor="#ddd3c4" />
          </linearGradient>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b08a62" />
            <stop offset="1" stopColor="#8a6945" />
          </linearGradient>
          <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d6d6d6" />
            <stop offset="1" stopColor="#8c8c8c" />
          </linearGradient>
          <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2b3b63" />
            <stop offset="1" stopColor="#141d36" />
          </linearGradient>
          <linearGradient id="denim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9db8d6" />
            <stop offset="1" stopColor="#5c7ea6" />
          </linearGradient>
          <linearGradient id="knit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5eedb" />
            <stop offset="1" stopColor="#dcd0b2" />
          </linearGradient>
          <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
          <filter id="bgblur">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0" />
          </filter>
        </defs>
        {scene === "fruit" ? <FruitScene /> : <ClosetScene />}
        <rect width={W} height={H} filter="url(#grain)" />
        <rect width={W} height={H} fill="url(#vignette)" />
      </svg>
    </div>
  );
});

/** Rasterize one region of the scene into a square JPEG "photo" for the product tag. */
export async function snapshotRegion(svg: SVGSVGElement, scene: SceneKind, index: number, size = 384): Promise<string | null> {
  try {
    const r = REGIONS[scene][index];
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const side = Math.min(r.w, r.h);
    clone.setAttribute("viewBox", `${r.x + (r.w - side) / 2} ${r.y + (r.h - side) / 2} ${side} ${side}`);
    clone.setAttribute("width", String(size));
    clone.setAttribute("height", String(size));
    clone.removeAttribute("style");
    clone.removeAttribute("class");
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("render failed"));
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await loaded;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    c.getContext("2d")!.drawImage(img, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}
