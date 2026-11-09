"use client";
import { useEffect, useState } from "react";
import { DemoScene } from "./DemoScene";
import { HangTag, type TagData } from "./HangTag";
import { IconMic, IconStore } from "./icons";

const BEATS: { focus: number; owner: string; agent: string; tag: TagData }[] = [
  {
    focus: 0,
    owner: "These are Fuji apples, about 30 lb. Really sweet this year.",
    agent: "Got it. What price per lb, and what’s the lowest you’d take?",
    tag: { name: "Fuji apples", unit: "lb", quantity: 30, listPriceCents: 300, floorPriceCents: 240, sellBy: "no_rush", facts: ["Really sweet this year"] },
  },
  {
    focus: 1,
    owner: "White peaches, 12 lb. A little soft, they have to go today.",
    agent: "I’ll start at $4 and go down toward your $2 floor as closing gets near.",
    tag: { name: "White peaches", unit: "lb", quantity: 12, listPriceCents: 400, floorPriceCents: 200, sellBy: "today", facts: ["A little soft"] },
  },
  {
    focus: 2,
    owner: "Strawberries, 8 boxes, picked this morning.",
    agent: "Lovely. $6 a box? Anything below $4.50 I’ll turn down.",
    tag: { name: "Strawberries", unit: "box", quantity: 8, listPriceCents: 600, floorPriceCents: 450, sellBy: "this_week", facts: ["Picked this morning"] },
  },
];

/** The landing page's one animated moment: a phone being taught a fruit stand. */
export function HeroPhone() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % BEATS.length), 4200);
    return () => clearInterval(t);
  }, []);
  const b = BEATS[i];
  return (
    <div className="relative mx-auto w-[300px] sm:w-[330px]">
      <div className="overflow-hidden rounded-[44px] border-[10px] border-ink bg-ink shadow-2xl">
        <div className="relative h-[560px] overflow-hidden rounded-[34px] bg-[#1b2a20]">
          <DemoScene scene="fruit" focus={b.focus} className="absolute inset-0" />
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
          <div key={`o${i}`} className="tag-in absolute right-3 top-10 max-w-[78%] rounded-2xl rounded-tr-sm bg-leaf px-3 py-2 text-sm text-white shadow">
            {b.owner}
          </div>
          <div key={`a${i}`} className="tag-in absolute inset-x-3 bottom-20 flex items-start gap-2 rounded-2xl bg-white/95 p-2.5 text-sm text-ink shadow-lg" style={{ animationDelay: "500ms" }}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-leaf text-white">
              <IconStore size={16} />
            </span>
            {b.agent}
          </div>
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-leaf text-white shadow-lg ring-4 ring-white/30">
              <IconMic size={26} />
            </span>
          </div>
        </div>
      </div>
      <div key={`t${i}`} className="tag-in absolute -right-4 bottom-28 w-56 rotate-3 sm:-right-24" style={{ animationDelay: "900ms" }}>
        <HangTag t={b.tag} compact />
      </div>
    </div>
  );
}
