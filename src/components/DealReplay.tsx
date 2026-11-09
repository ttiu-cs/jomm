"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconCart, IconCheck, IconStore } from "./icons";

type Beat = { who: "buyer" | "seller" | "paid"; text: string };

/** Example conversation (scripted for the landing page; the numbers follow the real engine's rules). */
const SCRIPT: Beat[] = [
  { who: "buyer", text: "Hi! Are the Fuji apples sweet?" },
  { who: "seller", text: "Sweet and crisp. Best batch we’ve had this year." },
  { who: "buyer", text: "Could you do $2.00 a pound for 2 lb?" },
  { who: "seller", text: "Ha, I wish! I can do $2.85 a pound." },
  { who: "buyer", text: "Hmm. How about $2.45?" },
  { who: "seller", text: "Let’s meet in the middle: $2.75." },
  { who: "buyer", text: "Last try: $2.60?" },
  { who: "seller", text: "$2.67 and they’re yours. That’s as low as I go." },
  { who: "buyer", text: "$2.67 works. Deal!" },
  { who: "paid", text: "$5.34" },
];

/** The landing page's main event: a shopper's agent haggling with a stall's agent, then PayPal. */
export function DealReplay() {
  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setShown(SCRIPT.length), 0);
      return () => clearTimeout(t);
    }
    if (shown >= SCRIPT.length) {
      const t = setTimeout(() => setShown(1), 6000);
      return () => clearTimeout(t);
    }
    const timers = [setTimeout(() => setTyping(true), 150), setTimeout(() => setTyping(false), 1000), setTimeout(() => setShown((s) => s + 1), 1500)];
    return () => timers.forEach(clearTimeout);
  }, [shown]);

  const next = SCRIPT[shown];
  return (
    <div className="rounded-[28px] bg-card p-4 text-left shadow-[0_24px_60px_-24px_rgba(60,30,10,0.35)] sm:p-5">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-3 text-[13px] text-label-2">
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-label text-white">
            <IconStore size={16} />
          </span>
          <span>
            <span className="block font-semibold text-label">Riverside Fruit</span>
            stall’s agent
          </span>
        </span>
        <span className="flex items-center gap-2 text-right">
          <span>
            <span className="block font-semibold text-label">Maya’s agent</span>
            shopping for her
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">
            <IconCart size={16} />
          </span>
        </span>
      </div>
      <div className="flex h-[380px] flex-col justify-end gap-2 overflow-hidden" aria-live="polite">
        {SCRIPT.slice(0, shown).slice(-7).map((l, i, arr) =>
          l.who === "paid" ? (
            <div key={`${shown}-${i}`} className="rise mt-1 flex items-center gap-3 rounded-[18px] bg-green-fill/12 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-fill text-white">
                <IconCheck size={20} />
              </span>
              <span className="text-[15px] leading-snug">
                <b className="tnum">Paid {l.text}</b> with <b className="text-[#003087]">PayPal</b>
                <span className="block text-[13px] text-label-2">Maya tapped approve. The stall’s phone says “Sold”.</span>
              </span>
            </div>
          ) : (
            <div key={`${shown - arr.length + i}`} className={`rise flex ${l.who === "buyer" ? "justify-end" : ""}`}>
              <p className={`max-w-[82%] rounded-[20px] px-3.5 py-2 text-[15px] leading-snug ${l.who === "buyer" ? "rounded-br-[6px] bg-brand text-white" : "rounded-bl-[6px] bg-fill text-label"}`}>{l.text}</p>
            </div>
          ),
        )}
        <div className={`flex h-8 items-center ${next?.who === "buyer" ? "justify-end" : ""}`}>
          {typing && next && next.who !== "paid" && (
            <span className={`flex gap-1 rounded-full px-3 py-2 ${next.who === "buyer" ? "bg-brand/80" : "bg-fill"}`} aria-hidden>
              {[0, 1, 2].map((d) => (
                <span key={d} className={`typing-dot h-1.5 w-1.5 rounded-full ${next.who === "buyer" ? "bg-white" : "bg-label-3"}`} style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-3 text-[13px]">
        <span className="text-label-3">Example conversation</span>
        <Link href="/market?auto=1" className="font-medium text-link hover:underline">
          Run it for real ›
        </Link>
      </div>
    </div>
  );
}
