import { expect, test } from "bun:test";
import { defaultConfig } from "../src/config";
import { startServer } from "../src/server";

test("PAD managed catalog requires a capability and never calls a native provider or browser", async () => {
  const previous = process.env.PADSWITCHER_WEB_MANAGED;
  process.env.PADSWITCHER_WEB_MANAGED = "1";
  const config = { ...defaultConfig("browser-only"), port: 0, controlToken: "fixture-control-token" };
  let calls = 0;
  const server = startServer(config, {
    fetchUpstream: async () => { calls++; throw new Error("No upstream requests allowed"); },
    adapterFactory: () => { calls++; throw new Error("No browser inference allowed"); },
  });
  try {
    const url = `http://127.0.0.1:${server.port}/admin/pad-catalog`;
    const catalog = { models: [{ slug: "gpt-5.6-sol", visibility: "list", supported_in_api: true,
      supported_reasoning_levels: [{ effort: "low", description: "Low" }], tool_mode: "code_mode_only",
      context_window: 300_000, multi_agent_version: "v2" }] };
    const bytes = JSON.stringify(catalog);
    for (const authorization of [undefined, "Bearer wrong"]) {
      const response = await fetch(url, { method: "POST", headers: authorization ? { authorization } : {}, body: bytes });
      expect(response.status).toBe(401); await response.text();
    }
    const response = await fetch(url, { method: "POST", headers: { authorization: "Bearer fixture-control-token" }, body: bytes });
    expect(response.status).toBe(200);
    const result = await response.json() as { models: Array<{ slug: string }> };
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every(row => row.slug.startsWith("chatgpt-web/"))).toBe(true);
    expect(JSON.stringify(catalog)).toBe(bytes);
    expect(calls).toBe(0);
    const health = await fetch(`http://127.0.0.1:${server.port}/healthz`).then(r => r.json()) as { active_http_turns: number; model_catalog_requests: number };
    expect(health.active_http_turns).toBe(0); expect(health.model_catalog_requests).toBe(0);
  } finally {
    server.stop(true);
    if (previous === undefined) delete process.env.PADSWITCHER_WEB_MANAGED; else process.env.PADSWITCHER_WEB_MANAGED = previous;
  }
});
