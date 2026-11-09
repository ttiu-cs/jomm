"use client";
import { useEffect, useState } from "react";
import { ItemCard, type TagData } from "./ItemCard";
import { IconMic, IconStore } from "./icons";

const BEATS: { photo: string; owner: string; agent: string; tag: TagData }[] = [
  {
    photo: "/photos/apples-crate.jpg",
    owner: "These are Fuji apples, about 30 lb. Really sweet this year.",
    agent: "Got it. What price per lb, and the lowest you’d take?",
    tag: { name: "Fuji apples", unit: "lb", quantity: 30, listPriceCents: 300, floorPriceCents: 240, sellBy: "no_rush", facts: [], photo: "/photos/apples-crate.jpg" },
  },
  {
    photo: "/photos/white-peaches.jpg",
    owner: "Peaches, 12 lb. A little soft, they have to go today.",
    agent: "I’ll start at $4 and go down toward your $2 as closing nears.",
    tag: { name: "White peaches", unit: "lb", quantity: 12, listPriceCents: 400, floorPriceCents: 200, sellBy: "today", facts: [], photo: "/photos/white-peaches.jpg" },
  },
  {
    photo: "/photos/strawberries-basket.jpg",
    owner: "Strawberries, 8 boxes, picked this morning.",
    agent: "$6 a box? I’ll turn down anything under $4.50.",
    tag: { name: "Strawberries", unit: "box", quantity: 8, listPriceCents: 600, floorPriceCents: 450, sellBy: "this_week", facts: [], photo: "/photos/strawberries-basket.jpg" },
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
        <div className="relative h-[600px] overflow-hidden rounded-[44px] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={b.photo} src={b.photo} alt="" className="kenburns absolute inset-0 h-full w-full object-cover" />
          <div className="absolute left-1/2 top-3 h-7 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div key={`o${i}`} className="rise absolute right-3 top-14 max-w-[80%] rounded-[20px] rounded-br-[6px] bg-blue px-3.5 py-2 text-[14px] leading-snug text-white">
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
