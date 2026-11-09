import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Natural voices for the teaching video: Rosa and her agent, spoken with OpenAI's steerable TTS
 * (gpt-4o-mini-tts). Cached on disk by text, so each line is generated once. Without
 * OPENAI_API_KEY this returns 404 and the page shows captions only.
 */
const VOICES = {
  owner: {
    voice: "marin",
    instructions:
      "You are Rosa, a warm, cheerful woman in her fifties who runs a fruit stall at a small-town farmers market. You're talking to your phone while you work: relaxed, friendly, a little smile in your voice, natural pace, not performing.",
  },
  mina: {
    voice: "coral",
    instructions:
      "You are Mina, a friendly woman in her late twenties selling a few things from her closet. You're filming with your phone in your bedroom, chatting casually and warmly, a bit upbeat, natural pace.",
  },
  agent: {
    voice: "cedar",
    instructions: "You are a friendly shop assistant speaking from a phone app. Warm, calm and clear, conversational, like a helpful new employee asking a quick question. Natural pace.",
  },
} as const;

const dir = path.join(process.env.VOICE_CACHE_DIR || path.join(os.homedir(), ".retail-pricing-os", "voice"));

export async function GET(req: Request) {
  const u = new URL(req.url);
  const r = u.searchParams.get("role");
  const role = r === "agent" ? "agent" : r === "mina" ? "mina" : "owner";
  const text = (u.searchParams.get("text") ?? "").trim().slice(0, 400);
  if (!text) return new Response("text required", { status: 422 });
  const key = process.env.OPENAI_API_KEY?.trim();
  const v = VOICES[role];
  const file = path.join(dir, `${crypto.createHash("sha256").update(`${role}|${v.voice}|${text}`).digest("hex").slice(0, 32)}.mp3`);
  const send = (buf: Buffer) => new Response(new Uint8Array(buf), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
  if (fs.existsSync(file)) return send(fs.readFileSync(file));
  if (!key) return new Response("no voice configured", { status: 404 });
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: key });
    const res = await client.audio.speech.create({ model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice: v.voice, input: text, instructions: v.instructions, response_format: "mp3" });
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buf);
    return send(buf);
  } catch (e) {
    console.warn("[voice] TTS failed", e instanceof Error ? e.message.slice(0, 120) : e);
    return new Response("voice unavailable", { status: 502 });
  }
}
