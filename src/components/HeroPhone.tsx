"use client";
import { useEffect, useState } from "react";
import { ItemCard, type TagData } from "./ItemCard";
import { IconMic, IconStore } from "./icons";

const BEATS: { photo: string; owner: string; agent: string; tag: TagData }[] = [
  {
    photo: "/photos/apples-box.jpg",
    owner: "These are Fuji apples, about 30 lb. Really sweet this year.",
    agent: "Got it. What price per lb, and the lowest you’d take?",
    tag: { name: "Fuji apples", unit: "lb", quantity: 30, listPriceCents: 289, floorPriceCents: 235, sellBy: "no_rush", facts: [], photo: "/photos/apples-box.jpg" },
  },
  {
    photo: "/photos/peaches-hand.jpg",
    owner: "Peaches, 12 lb. A little soft, they have to go today.",
    agent: "I’ll start at $3.79 and work toward your $2.15 as closing nears.",
    tag: { name: "White peaches", unit: "lb", quantity: 12, listPriceCents: 379, floorPriceCents: 215, sellBy: "today", facts: [], photo: "/photos/peaches-hand.jpg" },
  },
  {
    photo: "/photos/strawberries-market.jpg",
    owner: "Strawberries, 8 boxes, picked this morning.",
    agent: "$5.49 a box? I’ll turn down anything under $4.25.",
    tag: { name: "Strawberries", unit: "box", quantity: 8, listPriceCents: 549, floorPriceCents: 425, sellBy: "this_week", facts: [], photo: "/photos/strawberries-market.jpg" },
  },
];

/** The landing page's single animated moment: a phone being taught a fruit stand. */
export function HeroPhone() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % BEATS.length), 4500);
    return () => clearInterval(t);
  }, []);
  const b = BEATS[i];
  return (
    <div className="relative mx-auto w-[290px] sm:w-[320px]">
      <div className="rounded-[54px] bg-[#1d1d1f] p-[11px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="grain relative h-[600px] overflow-hidden rounded-[44px] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={b.photo} src={b.photo} alt="" className="handheld warm-photo absolute inset-0 h-full w-full object-cover" />
          <span key={`f${i}`} className="focus-square" aria-hidden />
          <span className="frosted-dark absolute left-4 top-12 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-white">
            <span className="rec-dot h-1.5 w-1.5 rounded-full bg-[#ff3b30]" /> Live
          </span>
          <div className="absolute left-1/2 top-3 h-7 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div key={`o${i}`} className="rise absolute right-3 top-[88px] max-w-[80%] rounded-[20px] rounded-br-[6px] bg-brand px-3.5 py-2 text-[14px] leading-snug text-white">
            {b.owner}
          </div>
          <div key={`a${i}`} className="rise frosted absolute inset-x-3 bottom-24 flex items-start gap-2 rounded-[20px] p-3 text-[14px] leading-snug text-label" style={{ animationDelay: "600ms" }}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-label text-white">
              <IconStore size={15} />
            </span>
            {b.agent}
          </div>
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-label shadow-lg">
              <IconMic size={24} />
            </span>
          </div>
        </div>
      </div>
      <div key={`t${i}`} className="rise absolute -right-6 top-[300px] hidden w-[260px] sm:block lg:-right-40" style={{ animationDelay: "1100ms" }}>
        <ItemCard t={b.tag} />
      </div>
    </div>
  );
}
