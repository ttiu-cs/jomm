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

let cached: LlmProvider | null | undefined;
export function getLlm(): LlmProvider | null {
  if (cached !== undefined) return cached;
  cached = process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : null;
  return cached;
}
