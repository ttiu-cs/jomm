import crypto from "node:crypto";
import type { DB } from "../db/client";

export const DEMO = { merchantId: "m_demo", storeId: "st_demo", productId: "p_salad" } as const;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function audit(db: DB, actor: string, action: string, entity: string, entityId: string | null, details: unknown, at = new Date()) {
  db.prepare("INSERT INTO audit_events (at, actor, action, entity, entity_id, details_json) VALUES (?,?,?,?,?,?)").run(
    at.toISOString(),
    actor,
    action,
    entity,
    entityId,
    JSON.stringify(details ?? {}),
  );
}

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const centsToValue = (c: number) => (c / 100).toFixed(2);
export const valueToCents = (v: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return NaN;
  const [a, b = ""] = v.split(".");
  return Number(a) * 100 + Number((b + "00").slice(0, 2));
};
