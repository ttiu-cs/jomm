/**
 * Puts Rosa's stall in place for the demo by playing her scripted walk-through through the real
 * teaching pipeline (parser → drafts → publish). Re-running it restocks the stall, so every demo
 * starts from the same shelf.
 */
import type { DB } from "../db/client";
import { createShopSession, getSession, publishSession, teachTurn } from "../teach/service";
import { ROSA } from "./rosa";

export async function setupRosa(db: DB, now = new Date()) {
  const session = createShopSession(db, ROSA.shopName, now);
  // A resumed session may hold drafts from an interrupted run; start the shelf clean.
  db.prepare("DELETE FROM draft_items WHERE session_id=?").run(session.id);
  db.prepare("UPDATE teach_sessions SET focus_item_id=NULL WHERE id=?").run(session.id);
  db.prepare("DELETE FROM teach_messages WHERE session_id=?").run(session.id);
  for (const scene of ROSA.scenes) for (const line of scene.lines) await teachTurn(db, session.id, { text: line }, now, { rulesOnly: true });
  const taught = getSession(db, session.id);
  const out = publishSession(db, session.id, now);
  for (const p of out.published) {
    const photo = ROSA.photos[p.name.toLowerCase()];
    if (photo) db.prepare("UPDATE product_knowledge SET photo=? WHERE product_id=?").run(photo, p.productId);
  }
  return {
    shopId: out.shopId,
    items: out.published,
    startedAt: now.toISOString(),
    // The real conversation the replay shows: Rosa's lines and her agent's questions.
    transcript: taught.messages.map((m) => ({ role: m.role, text: m.text })),
    checklists: taught.items.map((i) => ({ name: i.name, checklist: i.checklist })),
  };
}
