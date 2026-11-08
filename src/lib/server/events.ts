import { EventEmitter } from "node:events";

const g = globalThis as unknown as { __pricingBus?: EventEmitter };
export const bus: EventEmitter = g.__pricingBus ?? (g.__pricingBus = new EventEmitter().setMaxListeners(200));

export type BusEvent = { type: string; productId: string; at: string; detail?: unknown };

export function emit(type: string, productId: string, detail?: unknown) {
  const ev: BusEvent = { type, productId, at: new Date().toISOString(), detail };
  bus.emit("event", ev);
}
