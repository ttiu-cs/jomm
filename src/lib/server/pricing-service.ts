import { z } from "zod";
import type { DB } from "../db/client";
import { recommendPrice } from "../pricing/optimizer";
import type { PriceDecisionResult, PricingPolicy } from "../pricing/types";
import { getContext, expireStaleQuotes } from "./context";
import { emit } from "./events";
import { DomainError, audit, newId } from "./util";

export type Actor = { kind: "merchant" | "agent" | "autopilot" | "system"; id: string; scopes?: string[] };
export const actorLabel = (a: Actor) => `${a.kind}:${a.id}`;

export interface StoredDecision {
  id: string;
  simDay: number;
  simHour: number;
  createdAt: string;
  actor: string;
  status: string;
  policyVersion: number;
  result: PriceDecisionResult;
}

function rowToDecision(r: Record<string, unknown>): StoredDecision {
  return {
    id: r.id as string,
    simDay: r.sim_day as number,
    simHour: r.sim_hour as number,
    createdAt: r.created_at as string,
    actor: r.actor as string,
    status: r.status as string,
    policyVersion: r.policy_version as number,
    result: JSON.parse(r.result_json as string),
  };
}

export function computeRecommendation(db: DB, productId: string, actor: Actor, now = new Date()): StoredDecision {
  expireStaleQuotes(db, now);
  const ctx = getContext(db, productId, now);
  if (!ctx.published) throw new DomainError("NO_PRICE", "No published price exists.", 409);
  const inputs = {
    state: {
      hour: ctx.sim.current_hour,
      openHour: ctx.product.openHour,
      closeHour: ctx.batch ? Math.min(ctx.product.closeHour, ctx.batch.sellByHour) : ctx.product.closeHour,
      availableStock: ctx.storeOpen ? ctx.stock.available : 0,
      currentPriceCents: ctx.published.priceCents,
      minutesSinceLastChange: ctx.minutesSinceLastChange,
      confidence: ctx.confidence,
    },
    policy: ctx.policy,
    costs: ctx.costs,
    model: ctx.model,
    // Weather and events are forecastable signals known to the optimizer. Unforecasted traffic
    // shifts are only visible to it through observed sell-through (calibration).
    ctx: { weather: ctx.sim.weather, event: ctx.sim.event, demandMultiplier: 1, calibration: ctx.calibration },
  };
  const result = recommendPrice(inputs);
  const id = newId("dec");
  const status = result.action === "HOLD" ? "HELD" : "PROPOSED";
  const tx = db.transaction(() => {
    db.prepare("UPDATE price_decisions SET status='SUPERSEDED' WHERE product_id=? AND status='PROPOSED'").run(productId);
    db.prepare(
      `INSERT INTO price_decisions (id, product_id, sim_day, sim_hour, created_at, actor, model_version, policy_version, current_price_cents,
        recommended_price_cents, action, reason_codes_json, explanation_json, result_json, inputs_json, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      productId,
      ctx.sim.sim_day,
      ctx.sim.current_hour,
      now.toISOString(),
      actorLabel(actor),
      result.modelVersion,
      ctx.policyVersion,
      result.currentPriceCents,
      result.recommendedPriceCents,
      result.action,
      JSON.stringify(result.reasonCodes),
      JSON.stringify(result.explanation),
      JSON.stringify(result),
      JSON.stringify({ ...inputs, stock: ctx.stock, costSnapshotId: ctx.costSnapshotId }),
      status,
    );
    audit(db, actorLabel(actor), "pricing.recommend", "price_decision", id, { action: result.action, price: result.recommendedPriceCents, reasons: result.reasonCodes }, now);
  });
  tx();
  emit("decision", productId, { id, action: result.action });
  return getDecision(db, id);
}

export function getDecision(db: DB, id: string): StoredDecision {
  const r = db.prepare("SELECT * FROM price_decisions WHERE id=?").get(id) as Record<string, unknown> | undefined;
  if (!r) throw new DomainError("NOT_FOUND", "Decision not found", 404);
  return rowToDecision(r);
}

export function listDecisions(db: DB, productId: string, simDay?: number, limit = 50): StoredDecision[] {
  const rows = (
    simDay === undefined
      ? db.prepare("SELECT * FROM price_decisions WHERE product_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(productId, limit)
      : db.prepare("SELECT * FROM price_decisions WHERE product_id=? AND sim_day=? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(productId, simDay, limit)
  ) as Record<string, unknown>[];
  return rows.map(rowToDecision);
}

/**
 * Publish a PROPOSED decision. Re-validates against the CURRENT state: the decision must have
 * been computed against the currently published price version and current policy version, and
 * the actor must be permitted by policy.
 */
export function publishDecision(db: DB, decisionId: string, actor: Actor, now = new Date()) {
  const d = getDecision(db, decisionId);
  const { product_id } = db.prepare("SELECT product_id FROM price_decisions WHERE id=?").get(decisionId) as { product_id: string };
  const ctx = getContext(db, product_id, now);
  if (d.status !== "PROPOSED") throw new DomainError("DECISION_NOT_PROPOSED", `Decision is ${d.status}; only PROPOSED decisions can be published.`, 409);
  if (!ctx.published || ctx.published.priceCents !== d.result.currentPriceCents) throw new DomainError("STALE_DECISION", "Published price changed since this recommendation; recompute.", 409);
  if (d.simDay !== ctx.sim.sim_day || d.simHour !== ctx.sim.current_hour) throw new DomainError("STALE_DECISION", "Store clock moved since this recommendation; recompute.", 409);
  if (d.policyVersion !== ctx.policyVersion) throw new DomainError("STALE_DECISION", "Pricing policy changed since this recommendation; recompute.", 409);
  if (!ctx.storeOpen) throw new DomainError("STORE_CLOSED", "Store is closed for the day.", 409);

  if (actor.kind === "agent") {
    if (!actor.scopes?.includes("pricing:publish")) throw new DomainError("FORBIDDEN", "Agent token lacks pricing:publish scope.", 403);
    if (!ctx.policy.agentPublishAllowed) throw new DomainError("POLICY_FORBIDS_AGENT_PUBLISH", "Merchant policy does not allow agents to publish prices.", 403);
    if (d.result.requiresApproval) throw new DomainError("APPROVAL_REQUIRED", "This decision requires merchant approval.", 403);
  }
  if (actor.kind === "autopilot" && (ctx.policy.mode !== "autopilot" || d.result.requiresApproval)) {
    throw new DomainError("APPROVAL_REQUIRED", "Autopilot cannot publish decisions that require approval.", 403);
  }
  const p = d.result.recommendedPriceCents;
  if (p < d.result.bounds.floorCents || p > d.result.bounds.ceilingCents) throw new DomainError("POLICY_VIOLATION", "Price outside policy bounds.", 422);

  const id = newId("pp");
  const version = ctx.published.version + 1;
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO published_prices (id, product_id, price_cents, currency, version, effective_at, sim_day, sim_hour, decision_id, actor) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(id, ctx.product.id, p, ctx.product.currency, version, now.toISOString(), ctx.sim.sim_day, ctx.sim.current_hour, d.id, actorLabel(actor));
    const upd = db.prepare("UPDATE price_decisions SET status='PUBLISHED', published_price_id=? WHERE id=? AND status='PROPOSED'").run(id, d.id);
    if (upd.changes !== 1) throw new DomainError("DECISION_NOT_PROPOSED", "Decision state changed concurrently.", 409);
    audit(db, actorLabel(actor), "pricing.publish", "published_price", id, { from: d.result.currentPriceCents, to: p, version, decisionId: d.id }, now);
  });
  tx();
  emit("price", ctx.product.id, { priceCents: p, version });
  return { publishedPriceId: id, priceCents: p, version };
}

export function rejectDecision(db: DB, decisionId: string, actor: Actor, now = new Date()) {
  const r = db.prepare("UPDATE price_decisions SET status='REJECTED' WHERE id=? AND status='PROPOSED'").run(decisionId);
  if (r.changes !== 1) throw new DomainError("DECISION_NOT_PROPOSED", "Only PROPOSED decisions can be rejected.", 409);
  audit(db, actorLabel(actor), "pricing.reject", "price_decision", decisionId, {}, now);
}

export const PolicyPatchSchema = z
  .object({
    floorCents: z.number().int().min(1),
    ceilingCents: z.number().int().min(1),
    maxStepCents: z.number().int().min(25).max(1000),
    cooldownMinutes: z.number().int().min(0).max(24 * 60),
    minGainCents: z.number().int().min(0),
    mode: z.enum(["approval", "autopilot"]),
    allowBelowFullCost: z.boolean(),
    allowedStartHour: z.number().int().min(0).max(23),
    allowedEndHour: z.number().int().min(1).max(24),
    agentPublishAllowed: z.boolean(),
    lowConfidenceRequiresApproval: z.boolean(),
    maxNegotiationDiscountBps: z.number().int().min(0).max(9000),
  })
  .partial()
  .strict();

export type PolicyPatch = z.infer<typeof PolicyPatchSchema>;

export function validatePolicy(p: PricingPolicy): string[] {
  const errs: string[] = [];
  if (p.floorCents > p.ceilingCents) errs.push("Floor must be ≤ ceiling.");
  if (p.ceilingCents > 5000) errs.push("Ceiling above $50 rejected as anomalous for this SKU.");
  if (p.allowedStartHour >= p.allowedEndHour) errs.push("Allowed repricing window is empty.");
  if (p.floorCents % p.priceGridCents || p.ceilingCents % p.priceGridCents) errs.push(`Floor and ceiling must be multiples of $${(p.priceGridCents / 100).toFixed(2)}.`);
  return errs;
}

export function updatePolicy(db: DB, productId: string, patch: PolicyPatch, actor: Actor, now = new Date()) {
  if (actor.kind !== "merchant") throw new DomainError("FORBIDDEN", "Only the merchant can change pricing policy.", 403);
  const parsed = PolicyPatchSchema.parse(patch);
  const ctx = getContext(db, productId, now);
  const next: PricingPolicy = { ...ctx.policy, ...parsed };
  const errs = validatePolicy(next);
  if (errs.length) throw new DomainError("INVALID_POLICY", errs.join(" "), 422);
  const version = ctx.policyVersion + 1;
  const tx = db.transaction(() => {
    db.prepare("UPDATE pricing_policies SET active=0 WHERE product_id=?").run(productId);
    db.prepare("INSERT INTO pricing_policies (id, product_id, version, policy_json, active, created_at, actor) VALUES (?,?,?,?,1,?,?)").run(
      newId("pol"),
      productId,
      version,
      JSON.stringify(next),
      now.toISOString(),
      actorLabel(actor),
    );
    db.prepare("UPDATE price_decisions SET status='SUPERSEDED' WHERE product_id=? AND status='PROPOSED'").run(productId);
    audit(db, actorLabel(actor), "policy.update", "pricing_policy", String(version), { patch: parsed }, now);
  });
  tx();
  emit("policy", productId, { version });
  return { version, policy: next };
}
