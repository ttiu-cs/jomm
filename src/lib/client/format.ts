export const usd = (cents: number | null | undefined) =>
  cents === null || cents === undefined || Number.isNaN(cents) ? "—" : `${cents < -0.5 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

export async function api<T = unknown>(path: string, json?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: json !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  return body as T;
}
