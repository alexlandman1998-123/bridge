// The real Edge entrypoint uses a local HTTP adapter, never a remote project.
let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve, originalFetch = globalThis.fetch;
Deno.serve = ((callback: typeof handler) => {
  handler = callback;
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = originalServe;
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const names = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARCH9_APP_URL",
  "CALENDAR_PROVIDER_ENCRYPTION_KEY",
];
const previous = new Map(names.map((name) => [name, Deno.env.get(name)]));
Deno.test("Provider worker refuses public callers, bounds claims and keeps server credentials out of responses", async () => {
  let calls = 0;
  Deno.env.set("SUPABASE_URL", "https://fixture.example.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "local-fixture-only");
  Deno.env.set("ARCH9_APP_URL", "https://app.example.test");
  Deno.env.set(
    "CALENDAR_PROVIDER_ENCRYPTION_KEY",
    btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  );
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert(
      String(input) ===
        "https://fixture.example.test/rest/v1/rpc/claim_calendar_provider_connections",
      "Unexpected external request",
    );
    assert(
      JSON.parse(String(init?.body)).p_limit === 5,
      "Claim must be bounded",
    );
    return Promise.resolve(
      new Response("[]", { headers: { "Content-Type": "application/json" } }),
    );
  }) as typeof fetch;
  try {
    assert(
      (await handler(
        new Request("https://fixture.example.test", { method: "GET" }),
      )).status === 405,
      "GET must be rejected",
    );
    assert(
      (await handler(
        new Request("https://fixture.example.test", { method: "POST" }),
      )).status === 403,
      "Anonymous caller must be rejected",
    );
    assert(
      (await handler(
        new Request("https://fixture.example.test", {
          method: "POST",
          headers: { Authorization: "Bearer unrelated" },
        }),
      )).status === 403,
      "Other tokens must be rejected",
    );
    assert(calls === 0, "Public callers must not claim work");
    const response = await handler(
      new Request("https://fixture.example.test", {
        method: "POST",
        headers: { Authorization: "Bearer local-fixture-only" },
        body: '{"limit":999}',
      }),
    );
    assert(response.status === 200, "Empty queue should complete");
    const body = await response.text();
    assert(
      body === '{"claimed":0,"completed":0}',
      "Only bounded counts should leave worker",
    );
    assert(calls === 1, "Empty queue must not invoke providers");
    Deno.env.delete("CALENDAR_PROVIDER_ENCRYPTION_KEY");
    assert(
      (await handler(
        new Request("https://fixture.example.test", {
          method: "POST",
          headers: { Authorization: "Bearer local-fixture-only" },
        }),
      )).status === 503,
      "Incomplete configuration must fail before claims",
    );
    assert(calls === 1, "Missing configuration must not claim");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
