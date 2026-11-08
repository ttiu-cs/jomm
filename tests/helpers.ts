import { openDb, setDb } from "@/lib/db/client";
import { seedDemo, type SeedOptions } from "@/lib/server/sim-service";
import type { PayPalApi, PayPalOrder, CreateOrderArgs } from "@/lib/paypal/client";
import { PayPalHttpError } from "@/lib/paypal/client";

export function freshDb(opts: SeedOptions = {}) {
  const db = openDb(":memory:");
  setDb(db);
  seedDemo(db, opts, new Date("2026-11-08T17:00:00Z"));
  return db;
}

/** In-memory fake of the PayPal Orders v2 API with failure injection. */
export class FakePayPal implements PayPalApi {
  readonly mode = "sandbox" as const;
  orders = new Map<string, { args: CreateOrderArgs; status: string; captured?: PayPalOrder }>();
  captureCalls: { id: string; requestId: string }[] = [];
  next: null | "network_error" | "declined_instrument" | "pending" | "wrong_amount" | "already_captured_error" = null;
  webhookValid = true;
  private n = 0;

  async createOrder(args: CreateOrderArgs): Promise<PayPalOrder> {
    const id = `PP${++this.n}`;
    this.orders.set(id, { args, status: "CREATED" });
    return { id, status: "CREATED" };
  }
  approve(id: string) {
    this.orders.get(id)!.status = "APPROVED";
  }
  private repr(id: string, captureStatus: string, value?: string): PayPalOrder {
    const o = this.orders.get(id)!;
    return {
      id,
      status: captureStatus === "COMPLETED" ? "COMPLETED" : o.status,
      purchase_units: [
        {
          custom_id: o.args.internalOrderId,
          amount: { currency_code: o.args.currency, value: o.args.totalValue },
          payments: { captures: [{ id: `CAP-${id}`, status: captureStatus, amount: { currency_code: o.args.currency, value: value ?? o.args.totalValue } }] },
        },
      ],
    };
  }
  async captureOrder(id: string, requestId: string): Promise<PayPalOrder> {
    this.captureCalls.push({ id, requestId });
    const o = this.orders.get(id);
    if (!o) throw new PayPalHttpError(404, { name: "RESOURCE_NOT_FOUND" });
    const mode = this.next;
    this.next = null;
    if (o.captured) {
      // PayPal-Request-Id idempotency: same request id returns the same result
      return o.captured;
    }
    if (o.status !== "APPROVED") throw new PayPalHttpError(422, { details: [{ issue: "ORDER_NOT_APPROVED" }] });
    if (mode === "declined_instrument") throw new PayPalHttpError(422, { details: [{ issue: "INSTRUMENT_DECLINED" }] });
    const r = this.repr(id, mode === "pending" ? "PENDING" : "COMPLETED", mode === "wrong_amount" ? "0.01" : undefined);
    o.captured = r;
    o.status = r.status;
    if (mode === "network_error") throw new TypeError("fetch failed");
    if (mode === "already_captured_error") throw new PayPalHttpError(422, { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
    return r;
  }
  async getOrder(id: string): Promise<PayPalOrder> {
    const o = this.orders.get(id)!;
    return o.captured ?? { id, status: o.status, purchase_units: [{ custom_id: o.args.internalOrderId, amount: { currency_code: o.args.currency, value: o.args.totalValue } }] };
  }
  /** Simulate PayPal settling a PENDING capture. */
  settle(id: string) {
    const o = this.orders.get(id)!;
    o.captured = this.repr(id, "COMPLETED");
  }
  async verifyWebhookSignature(): Promise<boolean> {
    return this.webhookValid;
  }
}
