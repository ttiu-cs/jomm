/**
 * Merchant instruction → DRAFT policy patch. The draft is shown for confirmation and applied only
 * through updatePolicy() by the merchant.
 */
import { PolicyPatchSchema, type PolicyPatch } from "../server/pricing-service";
import type { PricingPolicy } from "../pricing/types";
import { getLlm } from "./llm";

const money = String.raw`\$?\s*(\d+(?:\.\d{1,2})?)`;
const toCents = (s: string) => Math.round(parseFloat(s) * 100);
const snap = (c: number, grid = 25) => Math.round(c / grid) * grid;

export function parsePolicyIntentDeterministic(text: string): { patch: PolicyPatch; notes: string[] } {
  const t = text.toLowerCase().replace(/,/g, "");
  const patch: PolicyPatch = {};
  const notes: string[] = [];
  const grab = (re: RegExp) => t.match(re)?.[1];

  const floor =
    grab(new RegExp(String.raw`(?:≥|>=|at least|no lower than|not below|never below|floor(?: of| at| to)?|minimum(?: price)?(?: of)?|min(?:imum)? price|keep (?:the )?price (?:≥|>=|above|at or above))\s*` + money)) ??
    grab(new RegExp(money + String.raw`\s*(?:이상|최저|하한)`));
  if (floor) patch.floorCents = snap(toCents(floor));
  const ceiling =
    grab(new RegExp(String.raw`(?:≤|<=|at most|no higher than|not above|never above|ceiling(?: of| at| to)?|cap(?: at| of)?|maximum(?: price)?(?: of)?|max(?:imum)? price)\s*` + money)) ??
    grab(new RegExp(money + String.raw`\s*(?:이하|최고|상한)`));
  if (ceiling) patch.ceilingCents = snap(toCents(ceiling));
  const step = grab(new RegExp(String.raw`(?:max(?:imum)? (?:change|step|move)|change (?:by )?(?:at most|no more than)|steps? of)\s*` + money));
  if (step) patch.maxStepCents = Math.max(25, snap(toCents(step)));
  const cooldown = grab(/(?:cooldown|wait|every|at most once (?:every|per))\s*(\d+)\s*(?:min|minutes|m\b)/) ?? (/(?:once|at most once) (?:an|per|every) hour/.test(t) ? "60" : undefined);
  if (cooldown) patch.cooldownMinutes = parseInt(cooldown, 10);
  if (/autopilot\s*(?:on|enabled?)|enable autopilot|turn on autopilot|auto[- ]publish|자동/.test(t)) patch.mode = "autopilot";
  if (/autopilot\s*(?:off|disabled?)|disable autopilot|require approval|ask me first|approval mode|승인/.test(t)) patch.mode = "approval";
  if (/(?:never|don'?t|do not) (?:sell )?below (?:full )?cost|원가 이하.*(?:금지|않)/.test(t)) patch.allowBelowFullCost = false;
  if (/(?:allow|ok to|may) (?:sell )?below (?:full )?cost/.test(t)) patch.allowBelowFullCost = true;
  if (/(?:allow|let) (?:the )?agents? (?:to )?publish/.test(t)) patch.agentPublishAllowed = true;
  if (/(?:don'?t|do not|never) (?:allow|let) (?:the )?agents? (?:to )?publish/.test(t)) patch.agentPublishAllowed = false;
  if (/optimi[sz]e for today|today'?s demand/.test(t)) notes.push("“Optimize for today’s demand” is already the optimizer objective (expected rest-of-day contribution); no policy change needed.");
  if (!Object.keys(patch).length) notes.push("No policy constraint recognised. Try e.g. “Keep price ≥ $4.50, cap at $9, max change $0.75, autopilot on”.");
  return { patch, notes };
}

export interface PolicyDraft {
  source: "llm" | "deterministic";
  patch: PolicyPatch;
  notes: string[];
  preview: PricingPolicy;
  requiresConfirmation: true;
}

const SYSTEM = `You translate a retail merchant's pricing instruction into a JSON patch of their pricing policy.
Return ONLY a JSON object with any of these optional keys (money in integer US cents, multiples of 25):
floorCents, ceilingCents, maxStepCents, cooldownMinutes, minGainCents, mode ("approval"|"autopilot"),
allowBelowFullCost (boolean), allowedStartHour, allowedEndHour, agentPublishAllowed (boolean),
lowConfidenceRequiresApproval (boolean), plus "notes": string[] explaining ambiguities.
Never invent constraints the merchant did not state. Never set a price directly.`;

export async function draftPolicyFromText(text: string, current: PricingPolicy): Promise<PolicyDraft> {
  const det = parsePolicyIntentDeterministic(text);
  const llm = getLlm();
  if (llm) {
    const raw = (await llm.completeJson(SYSTEM, `Current policy: ${JSON.stringify(current)}\nMerchant instruction: ${text}`)) as Record<string, unknown> | null;
    if (raw) {
      const { notes, ...rest } = raw as { notes?: unknown };
      const parsed = PolicyPatchSchema.safeParse(rest);
      if (parsed.success) {
        return {
          source: "llm",
          patch: parsed.data,
          notes: Array.isArray(notes) ? notes.map(String) : [],
          preview: { ...current, ...parsed.data },
          requiresConfirmation: true,
        };
      }
    }
  }
  return { source: "deterministic", patch: det.patch, notes: det.notes, preview: { ...current, ...det.patch }, requiresConfirmation: true };
}
