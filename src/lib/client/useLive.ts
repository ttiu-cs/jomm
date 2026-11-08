"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Fetch JSON and refetch on server-sent events (with polling fallback). */
export function useLive<T>(url: string, pollMs = 8000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message ?? `HTTP ${r.status}`);
      setData(b);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inflight.current = false;
    }
  }, [url]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const es = typeof EventSource !== "undefined" ? new EventSource("/api/events") : null;
    let t: ReturnType<typeof setTimeout> | null = null;
    if (es)
      es.onmessage = () => {
        if (t) clearTimeout(t);
        t = setTimeout(refresh, 120);
      };
    const iv = setInterval(refresh, pollMs);
    return () => {
      clearTimeout(first);
      es?.close();
      clearInterval(iv);
      if (t) clearTimeout(t);
    };
  }, [refresh, pollMs]);

  return { data, error, refresh };
}
