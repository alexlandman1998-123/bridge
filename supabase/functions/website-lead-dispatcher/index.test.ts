import assert from "node:assert/strict";

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
try {
  Deno.serve = ((callback: Handler) => {
    handler = callback;
    return {};
  }) as typeof Deno.serve;
  await import("./index.ts");
} finally {
  Deno.serve = serve;
}

async function withLocalDatabase(
  run: (
    calls: { name: string; body: Record<string, unknown> }[],
  ) => Promise<void>,
) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const previous = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].map((key) =>
    [key, Deno.env.get(key)] as const
  );
  const fixture = serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (request) => {
      const name = new URL(request.url).pathname.split("/").at(-1)!;
      calls.push({ name, body: await request.json() });
      return new Response(
        JSON.stringify(name === "website_claim_lead_notifications" ? [] : 0),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  );
  Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${fixture.addr.port}`);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "local-dispatch-fixture-key");
  try {
    await run(calls);
  } finally {
    await fixture.shutdown();
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

const request = (body: unknown, authorized = true) =>
  new Request("https://dispatcher.example.test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized
        ? { Authorization: "Bearer local-dispatch-fixture-key" }
        : {}),
    },
    body: JSON.stringify(body),
  });

Deno.test("targeted website delivery claims only its event without global queue cleanup", async () => {
  await withLocalDatabase(async (calls) => {
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await handler(request({ eventId: id, limit: 100 }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).claimed, 0);
    assert.deepEqual(calls, [{
      name: "website_claim_lead_notifications",
      body: { p_limit: 1, p_event_id: id },
    }]);
  });
});

Deno.test("full website queue runs retain interrupted-claim recovery", async () => {
  await withLocalDatabase(async (calls) => {
    const response = await handler(request({ limit: 3 }));
    assert.equal(response.status, 200);
    await response.json();
    assert.deepEqual(calls, [
      { name: "website_reset_stale_lead_notification_claims", body: {} },
      {
        name: "website_claim_lead_notifications",
        body: { p_limit: 3, p_event_id: null },
      },
    ]);
  });
});

Deno.test("invalid or unauthorised delivery requests cannot access the queue", async () => {
  await withLocalDatabase(async (calls) => {
    const invalid = await handler(request({ eventId: "not-a-uuid" }));
    assert.equal(invalid.status, 400);
    await invalid.json();
    const forbidden = await handler(request({}, false));
    assert.equal(forbidden.status, 403);
    await forbidden.json();
    assert.equal(calls.length, 0);
  });
});
