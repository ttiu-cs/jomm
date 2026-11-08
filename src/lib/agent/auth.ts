import crypto from "node:crypto";
import type { Actor } from "../server/pricing-service";

export type Scope = "pricing:read" | "pricing:recommend" | "pricing:publish";

/** Local-dev fallback only (mirrors .env.example). Production requires AGENT_API_KEYS explicitly. */
const DEV_KEYS = "demo-agent-readonly:pricing:read|pricing:recommend,demo-agent-publisher:pricing:read|pricing:recommend|pricing:publish";

function parseKeys(env = process.env.AGENT_API_KEYS ?? (process.env.NODE_ENV === "production" ? "" : DEV_KEYS)): { token: string; scopes: string[] }[] {
  return env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(":");
      return { token: entry.slice(0, i), scopes: entry.slice(i + 1).split("|").filter(Boolean) };
    })
    .filter((k) => k.token.length >= 8);
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Authenticate a seller agent from `Authorization: Bearer <token>`; returns null if invalid. */
export function authenticateAgent(header: string | null, required: Scope): { actor: Actor } | { error: string; status: number } {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: "Missing bearer token", status: 401 };
  const key = parseKeys().find((k) => safeEqual(k.token, m[1].trim()));
  if (!key) return { error: "Invalid agent token", status: 401 };
  if (!key.scopes.includes(required)) return { error: `Token lacks scope ${required}`, status: 403 };
  const id = crypto.createHash("sha256").update(key.token).digest("hex").slice(0, 10);
  return { actor: { kind: "agent", id: `agent-${id}`, scopes: key.scopes } };
}
