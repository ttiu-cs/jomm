/**
 * Gives the seller agent its own voice when an LLM is configured.
 *
 * The negotiation engine has already decided every number (counter, final price, deal) and written
 * a plain line. This only rewords that line in the stall's warm, first-person voice, using the
 * owner's own facts. The rewrite is kept only if it carries exactly the same dollar amounts as the
 * engine's line and no others, so the model can never change a price or leak the owner's floor.
 */
import type { DB } from "../db/client";
import { getLlm } from "../agent/llm";
import { getKnowledge } from "./negotiation";

const money = (s: string) => (s.match(/\$\d+(?:\.\d{2})?/g) ?? []).sort().join("|");

export async function voiceLastSellerLine(db: DB, negotiationId: string): Promise<void> {
  const llm = getLlm();
  if (!llm) return;
  const msg = db
    .prepare("SELECT id, role, kind, text FROM negotiation_messages WHERE negotiation_id=? ORDER BY id DESC LIMIT 1")
    .get(negotiationId) as { id: number; role: string; kind: string; text: string } | undefined;
  if (!msg || msg.role !== "seller") return;
  const n = db.prepare("SELECT product_id, qty FROM negotiations WHERE id=?").get(negotiationId) as { product_id: string; qty: number };
  const p = db.prepare("SELECT name, unit FROM products WHERE id=?").get(n.product_id) as { name: string; unit: string };
  const k = getKnowledge(db, n.product_id);
  const history = (db.prepare("SELECT role, text FROM negotiation_messages WHERE negotiation_id=? AND id<? ORDER BY id").all(negotiationId, msg.id) as { role: string; text: string }[])
    .map((m) => `${m.role === "buyer" ? "Shopper's agent" : "Stall"}: ${m.text}`)
    .join("\n");
  const out = await llm.completeText(
    `You are the voice of a small, friendly market stall haggling with a shopper's AI agent. Rewrite the stall's next line so it sounds like a warm, quick-witted stall owner: first person, plain words, one or two short sentences, a little personality. You may use the owner's facts. Keep the exact meaning and every dollar amount exactly as written; add no other numbers or prices; never mention a minimum or lowest price as a number. Reply with the line only.`,
    `Item: ${p.name} (sold per ${p.unit}), quantity ${n.qty}.\nOwner's facts: ${JSON.stringify(k?.facts ?? [])}\nConversation so far:\n${history}\n\nStall's line to rewrite (${msg.kind}): ${msg.text}`,
  );
  const line = out?.trim().replace(/^["“]|["”]$/g, "");
  if (!line || line.length > 280 || money(line) !== money(msg.text)) return;
  db.prepare("UPDATE negotiation_messages SET text=? WHERE id=?").run(line, msg.id);
}
