/**
 * Optional LLM adapter (Anthropic). Used ONLY to (a) draft structured policy patches from merchant
 * text and (b) narrate already-computed decisions. It never sets prices and never applies policy:
 * outputs are validated and require merchant confirmation. Without ANTHROPIC_API_KEY every caller
 * falls back to deterministic logic.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface LlmProvider {
  name: string;
  completeJson(system: string, user: string, imageJpegBase64?: string): Promise<unknown | null>;
  completeText(system: string, user: string): Promise<string | null>;
}

class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  private client = new Anthropic();
  private model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

  private async run(system: string, user: string, imageJpegBase64?: string): Promise<string | null> {
    try {
      const res = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 2000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system,
          messages: [
            {
              role: "user",
              content: imageJpegBase64
                ? [
                    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageJpegBase64 } },
                    { type: "text", text: user },
                  ]
                : user,
            },
          ],
        },
        { timeout: 20_000 },
      );
      if (res.stop_reason === "refusal") return null;
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return text || null;
    } catch (err) {
      if (err instanceof Anthropic.APIError) console.warn(`[llm] Anthropic API error ${err.status}: ${err.message}`);
      else console.warn("[llm] request failed", err);
      return null;
    }
  }

  async completeJson(system: string, user: string, imageJpegBase64?: string) {
    const text = await this.run(system, user, imageJpegBase64);
    if (!text) return null;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }

  completeText(system: string, user: string) {
    return this.run(system, user);
  }
}

/** OpenAI chat completions, used when only OPENAI_API_KEY is set (same contract as above). */
class OpenAIProvider implements LlmProvider {
  name = "openai";
  private model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  private async run(system: string, user: string, json: boolean): Promise<string | null> {
    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await client.chat.completions.create(
        { model: this.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...(json ? { response_format: { type: "json_object" as const } } : {}) },
        { timeout: 20_000 },
      );
      return res.choices[0]?.message?.content ?? null;
    } catch (err) {
      console.warn("[llm] OpenAI request failed", err instanceof Error ? err.message.slice(0, 120) : err);
      return null;
    }
  }
  async completeJson(system: string, user: string) {
    const text = await this.run(system, user, true);
    if (!text) return null;
    try {
      return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "null");
    } catch {
      return null;
    }
  }
  completeText(system: string, user: string) {
    return this.run(system, user, false);
  }
}

let cached: LlmProvider | null | undefined;
export function getLlm(): LlmProvider | null {
  if (cached !== undefined) return cached;
  cached = process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : process.env.OPENAI_API_KEY ? new OpenAIProvider() : null;
  return cached;
}
