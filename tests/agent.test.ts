import { describe, expect, it } from "vitest";
import { parsePolicyIntentDeterministic } from "@/lib/agent/policy-intent";
import { authenticateAgent } from "@/lib/agent/auth";

describe("policy intent (deterministic)", () => {
  it("parses the demo instruction", () => {
    const r = parsePolicyIntentDeterministic("Keep price ≥ $4.50; optimize for today’s demand.");
    expect(r.patch).toEqual({ floorCents: 450 });
    expect(r.notes.join(" ")).toMatch(/already the optimizer objective/);
  });
  it("parses multiple constraints", () => {
    const r = parsePolicyIntentDeterministic("Never below $5, cap at $9.25, max change $0.50, cooldown 30 min, autopilot on, don't sell below cost");
    expect(r.patch).toEqual({ floorCents: 500, ceilingCents: 925, maxStepCents: 50, cooldownMinutes: 30, mode: "autopilot", allowBelowFullCost: false });
  });
  it("returns guidance when nothing recognised", () => {
    expect(parsePolicyIntentDeterministic("hello").patch).toEqual({});
  });
});

describe("agent auth", () => {
  it("checks tokens and scopes", () => {
    process.env.AGENT_API_KEYS = "readonly-token-1:pricing:read|pricing:recommend,publisher-token-1:pricing:read|pricing:recommend|pricing:publish";
    expect(authenticateAgent(null, "pricing:read")).toMatchObject({ status: 401 });
    expect(authenticateAgent("Bearer nope-nope-nope", "pricing:read")).toMatchObject({ status: 401 });
    expect(authenticateAgent("Bearer readonly-token-1", "pricing:publish")).toMatchObject({ status: 403 });
    const ok = authenticateAgent("Bearer publisher-token-1", "pricing:publish");
    expect("actor" in ok && ok.actor.scopes).toContain("pricing:publish");
  });
});
