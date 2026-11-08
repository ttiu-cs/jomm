/**
 * Minimal server-side PayPal REST client (Orders v2 + webhook signature verification).
 * Secrets never leave the server. The interface allows a fake implementation in tests.
 */

export interface PayPalAmount {
  currency_code: string;
  value: string;
}

export interface PayPalCapture {
  id: string;
  status: string; // COMPLETED | PENDING | DECLINED | ...
  amount: PayPalAmount;
  custom_id?: string;
  invoice_id?: string;
}

export interface PayPalOrder {
  id: string;
  status: string; // CREATED | APPROVED | COMPLETED | ...
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: PayPalAmount;
    payments?: { captures?: PayPalCapture[] };
  }[];
  links?: { href: string; rel: string; method?: string }[];
}

export class PayPalHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`PayPal API error ${status}`);
  }
  get issue(): string | undefined {
    const b = this.body as { details?: { issue?: string }[]; name?: string } | undefined;
    return b?.details?.[0]?.issue ?? b?.name;
  }
}

export interface CreateOrderArgs {
  requestId: string;
  internalOrderId: string;
  sku: string;
  name: string;
  qty: number;
  unitValue: string;
  totalValue: string;
  currency: string;
}

export interface PayPalApi {
  readonly mode: "sandbox";
  createOrder(args: CreateOrderArgs): Promise<PayPalOrder>;
  captureOrder(paypalOrderId: string, requestId: string): Promise<PayPalOrder>;
  getOrder(paypalOrderId: string): Promise<PayPalOrder>;
  verifyWebhookSignature(headers: Record<string, string | null>, event: unknown): Promise<boolean>;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  webhookId?: string;
}

export function readPayPalConfig(env = process.env): { mode: "sandbox" | "mock"; config?: PayPalConfig } {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  const requested = env.PAYPAL_MODE?.trim();
  const apiBase = env.PAYPAL_API_BASE?.trim() || "https://api-m.sandbox.paypal.com";
  if (apiBase.includes("api-m.paypal.com") && !apiBase.includes("sandbox")) {
    throw new Error("Live PayPal endpoints are out of MVP scope. Use the Sandbox API base.");
  }
  if (requested === "mock") return { mode: "mock" };
  if (clientId && clientSecret) return { mode: "sandbox", config: { clientId, clientSecret, apiBase, webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || undefined } };
  if (requested === "sandbox") throw new Error("PAYPAL_MODE=sandbox requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  return { mode: "mock" };
}

export class HttpPayPalApi implements PayPalApi {
  readonly mode = "sandbox" as const;
  private token?: { value: string; expiresAt: number };

  constructor(
    private cfg: PayPalConfig,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 15000,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.cfg.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new PayPalHttpError(res.status, body);
    const b = body as { access_token: string; expires_in: number };
    this.token = { value: b.access_token, expiresAt: Date.now() + b.expires_in * 1000 };
    return b.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
    const token = await this.accessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" };
    if (requestId) headers["PayPal-Request-Id"] = requestId; // PayPal-side idempotency for retries
    const res = await this.fetchImpl(`${this.cfg.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new PayPalHttpError(res.status, json);
    return json as T;
  }

  createOrder(a: CreateOrderArgs) {
    return this.call<PayPalOrder>(
      "POST",
      "/v2/checkout/orders",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: a.sku,
            custom_id: a.internalOrderId,
            invoice_id: a.internalOrderId,
            description: `${a.name} (price-locked quote)`,
            amount: { currency_code: a.currency, value: a.totalValue, breakdown: { item_total: { currency_code: a.currency, value: a.totalValue } } },
            items: [{ name: a.name, sku: a.sku, quantity: String(a.qty), unit_amount: { currency_code: a.currency, value: a.unitValue }, category: "PHYSICAL_GOODS" }],
          },
        ],
        payment_source: {
          paypal: { experience_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", brand_name: "Retail Pricing OS Demo" } },
        },
      },
      a.requestId,
    );
  }

  captureOrder(id: string, requestId: string) {
    return this.call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, requestId);
  }

  getOrder(id: string) {
    return this.call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`);
  }

  async verifyWebhookSignature(h: Record<string, string | null>, event: unknown): Promise<boolean> {
    if (!this.cfg.webhookId) return false;
    const r = await this.call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: h["paypal-auth-algo"],
      cert_url: h["paypal-cert-url"],
      transmission_id: h["paypal-transmission-id"],
      transmission_sig: h["paypal-transmission-sig"],
      transmission_time: h["paypal-transmission-time"],
      webhook_id: this.cfg.webhookId,
      webhook_event: event,
    });
    return r.verification_status === "SUCCESS";
  }
}

const g = globalThis as unknown as { __paypalApi?: PayPalApi | null };

/** Returns the configured Sandbox client, or null when running in clearly-labeled MOCK mode. */
export function getPayPalApi(): PayPalApi | null {
  if (g.__paypalApi !== undefined) return g.__paypalApi;
  const { mode, config } = readPayPalConfig();
  g.__paypalApi = mode === "sandbox" && config ? new HttpPayPalApi(config) : null;
  return g.__paypalApi;
}

/** Test hook. Pass undefined to re-read env. */
export function setPayPalApi(api: PayPalApi | null | undefined) {
  g.__paypalApi = api;
}

export function paymentMode(): "PAYPAL_SANDBOX" | "MOCK_CHECKOUT" {
  return getPayPalApi() ? "PAYPAL_SANDBOX" : "MOCK_CHECKOUT";
}
