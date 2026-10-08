// Callback GET is public; account-management POST authenticates explicitly.
let handler: (request: Request) => Response | Promise<Response>;
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
Deno.test("Connection entrypoint validates session and state before any token exchange", async () => {
  Deno.env.set("SUPABASE_URL", "https://fixture.example.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "local-fixture-only");
  Deno.env.set("ARCH9_APP_URL", "https://app.example.test");
  let calls = 0;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls++;
    assert(
      String(input) === "https://fixture.example.test/auth/v1/user",
      "Only explicit session lookup is allowed",
    );
    return Promise.resolve(
      new Response('{"error":"expired"}', {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    assert(
      (await handler(
        new Request("https://fixture.example.test", { method: "POST" }),
      )).status === 401,
      "Missing session must fail",
    );
    assert(calls === 0, "Missing session must not query auth");
    assert(
      (await handler(
        new Request("https://fixture.example.test", {
          method: "POST",
          headers: { Authorization: "Bearer expired" },
        }),
      )).status === 401,
      "Expired session must fail",
    );
    assert(calls === 1, "Session must be verified");
    const response = await handler(
      new Request(
        "https://fixture.example.test/functions/v1/calendar-provider-connection?provider=google&state=invalid&code=private-code",
      ),
    );
    assert(response.status === 303, "Invalid callback must return safely");
    assert(
      response.headers.get("Location") ===
        "https://app.example.test/pipeline/calendar?calendar_provider=failed",
      "Authorization codes must not leave the callback",
    );
    assert(calls === 1, "Invalid state must not exchange credentials");
    assert(
      (await handler(
        new Request("https://fixture.example.test", {
          method: "POST",
          headers: { Origin: "https://evil.example.test" },
        }),
      )).status === 403,
      "Foreign origin must fail",
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
