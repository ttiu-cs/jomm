"use client";
import { useState } from "react";
import { Btn, Card, Code, TopNav } from "@/components/ui";

interface Call {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

export default function AgentConsole() {
  const [token, setToken] = useState("demo-agent-publisher");
  const [log, setLog] = useState<Call[]>([]);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const call = async (method: string, path: string, json?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: json ? JSON.stringify(json) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (path.endsWith("/recommend") && res.ok) setDecisionId((body as { decisionId?: string }).decisionId ?? null);
    setLog((l) => [{ method, path, status: res.status, body }, ...l].slice(0, 8));
  };

  return (
    <div>
      <TopNav active="agent" />
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Seller-agent API</h1>
        <p className="max-w-3xl text-sm text-ink-2">
          A seller agent, built on any model or framework, reads pricing context, asks for a recommendation and, only if the merchant’s policy allows it, publishes the
          server-computed decision. Agents cannot set an arbitrary price, change policy, or move money. Tokens and scopes are configured server-side in <Code>AGENT_API_KEYS</Code>.
        </p>
        <Card title="Try it">
          <label className="block space-y-1 text-xs">
            <span className="text-muted">Bearer token (demo tokens from .env.example)</span>
            <select className="w-full max-w-sm rounded-md border border-line bg-surface px-2 py-1 font-mono" value={token} onChange={(e) => setToken(e.target.value)}>
              <option value="demo-agent-readonly">demo-agent-readonly (read, recommend)</option>
              <option value="demo-agent-publisher">demo-agent-publisher (read, recommend, publish)</option>
              <option value="invalid-token-xyz">invalid-token-xyz</option>
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={() => call("GET", "/api/agent/pricing-context?sku=SALAD-001")}>GET pricing-context</Btn>
            <Btn onClick={() => call("POST", "/api/agent/recommend", { sku: "SALAD-001" })}>POST recommend</Btn>
            <Btn kind="primary" disabled={!decisionId} onClick={() => call("POST", "/api/agent/publish", { decisionId })}>
              POST publish {decisionId ? `(${decisionId.slice(0, 12)}…)` : ""}
            </Btn>
          </div>
          <p className="mt-2 text-xs text-muted">
            Publishing succeeds only when the token has <Code>pricing:publish</Code>, policy has “Allow authorized seller agents to publish” on, and the decision does not require
            approval (autopilot mode, sufficient confidence). Otherwise you get a 403 that explains why.
          </p>
        </Card>
        <div className="space-y-3">
          {log.map((c, i) => (
            <Card
              key={i}
              title={
                <span className="font-mono text-xs">
                  {c.method} {c.path}
                </span>
              }
              right={<span className={`text-xs font-semibold ${c.status < 300 ? "text-good" : "text-bad"}`}>HTTP {c.status}</span>}
            >
              <pre className="max-h-80 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug">{JSON.stringify(c.body, null, 2)}</pre>
            </Card>
          ))}
        </div>
        <Card title="curl">
          <pre className="overflow-x-auto rounded-md bg-surface-2 p-2 text-[11px]">{`curl -H "Authorization: Bearer demo-agent-readonly" \\
  "http://localhost:3000/api/agent/pricing-context?sku=SALAD-001"

curl -X POST -H "Authorization: Bearer demo-agent-publisher" -H "Content-Type: application/json" \\
  -d '{"sku":"SALAD-001"}' http://localhost:3000/api/agent/recommend`}</pre>
        </Card>
      </main>
    </div>
  );
}
