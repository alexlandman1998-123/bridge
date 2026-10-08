import { leadAgentEmailQueueResponse } from "./leadAgentEmailQueue.ts";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }
};
const payload = {
  type: "lead_operations_notification",
  eventKind: "new_enquiry_assigned_agent",
  organisationId: "11111111-1111-4111-8111-111111111111",
  leadId: "22222222-2222-4222-8222-222222222222",
  to: "untrusted@outside.co.za",
};
async function withEnvironment(run: () => Promise<void>) {
  const keys = {
    SUPABASE_URL: "https://fixture.test",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    SUPABASE_ANON_KEY: "fixture-anon",
  };
  const previous = Object.fromEntries(
    Object.keys(keys).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(keys)) Deno.env.set(key, value);
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
}
function fixture(
  {
    allowed = true,
    receipt = false,
    state = { status: "pending" },
    error = false,
    eligible = true,
  } = {},
) {
  const calls: any[] = [];
  return {
    calls,
    makeClient: ((_url: unknown, key: unknown, options: unknown) => {
      calls.push({ key, options });
      return {
        from: (table: string) => {
          const q = {
            select: () => q,
            eq: () => q,
            limit: () => q,
            maybeSingle: async () => ({
              data: table === "leads"
                ? (allowed ? { lead_id: payload.leadId } : null)
                : (receipt ? { id: "receipt" } : null),
              error: null,
            }),
          };
          return q;
        },
        rpc: async (name: string, args: unknown) => {
          calls.push({ name, args });
          return {
            data: name === "lead_agent_email_website_agent_eligible"
              ? eligible
              : state,
            error: error ? {} : null,
          };
        },
      };
    }) as any,
  };
}
Deno.test("new lead requests read the saved queue status and cannot choose recipients", () =>
  withEnvironment(async () => {
    const f = fixture();
    const response = await leadAgentEmailQueueResponse(
      new Request("https://fixture.test", {
        headers: { authorization: "Bearer user-token" },
      }),
      payload,
      f.makeClient,
    );
    equal(response?.status, 200);
    const body = await response!.json();
    equal(body.queued, true);
    equal(body.sent, false);
    equal(f.calls.at(-1).args, {
      p_organisation_id: payload.organisationId,
      p_lead_id: payload.leadId,
    });
    equal(f.calls[0].key, "fixture-anon");
  }));
Deno.test("missing authentication, inaccessible leads and missing queue evidence never fall back to sending", () =>
  withEnvironment(async () => {
    equal(
      (await leadAgentEmailQueueResponse(
        new Request("https://fixture.test"),
        payload,
        fixture().makeClient,
      ))?.status,
      401,
    );
    const request = new Request("https://fixture.test", {
      headers: { authorization: "Bearer user-token" },
    });
    equal(
      (await leadAgentEmailQueueResponse(
        request,
        payload,
        fixture({ allowed: false }).makeClient,
      ))?.status,
      403,
    );
    equal(
      (await leadAgentEmailQueueResponse(
        request,
        payload,
        fixture({ error: true }).makeClient,
      ))?.status,
      503,
    );
  }));
Deno.test("only a service dispatcher with a real website receipt retains direct website delivery", () =>
  withEnvironment(async () => {
    const input = {
      ...payload,
      metadata: { dispatchContract: "website-lead-dispatch-v1" },
    };
    const service = new Request("https://fixture.test", {
      headers: { authorization: "Bearer fixture-service" },
    });
    equal(
      await leadAgentEmailQueueResponse(
        service,
        input,
        fixture({ receipt: true }).makeClient,
      ),
      null,
    );
    equal(
      (await leadAgentEmailQueueResponse(
        service,
        input,
        fixture({ receipt: true, eligible: false }).makeClient,
      ))?.status,
      409,
    );
    equal(
      (await leadAgentEmailQueueResponse(service, input, fixture().makeClient))
        ?.status,
      200,
    );
    const user = new Request("https://fixture.test", {
      headers: { authorization: "Bearer user-token" },
    });
    equal(
      (await leadAgentEmailQueueResponse(
        user,
        input,
        fixture({ receipt: true }).makeClient,
      ))?.status,
      200,
    );
  }));
Deno.test("reassignment and other communication routes are preserved", async () => {
  equal(
    await leadAgentEmailQueueResponse(new Request("https://fixture.test"), {
      ...payload,
      eventKind: "lead_reassigned",
    }),
    null,
  );
});

Deno.test("client intro callers can only inspect the saved queue, including trusted website callers", () =>
  withEnvironment(async () => {
    const f = fixture({ receipt: true });
    const request = new Request("https://fixture.test", {
      headers: { authorization: "Bearer fixture-service" },
    });
    const input = {
      ...payload,
      type: "property_enquiry_acknowledgement",
      eventKind: undefined,
      metadata: { dispatchContract: "website-lead-dispatch-v1" },
    };
    const response = await leadAgentEmailQueueResponse(
      request,
      input,
      f.makeClient,
    );
    equal(response?.status, 200);
    equal((await response!.json()).sent, false);
    equal(f.calls.at(-1).name, "lead_client_intro_status");
    equal(
      await leadAgentEmailQueueResponse(request, {
        ...input,
        type: "lead_acknowledgement",
        leadId: undefined,
      }, f.makeClient),
      null,
    );
  }));
