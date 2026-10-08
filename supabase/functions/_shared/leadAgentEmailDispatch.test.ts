import {
  dispatchLeadAgentEmails,
  handleLeadAgentEmailDispatcher,
  renderLeadAgentEnvelope,
} from "./leadAgentEmailDispatch.ts";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }
};
const job = {
  id: "job-one",
  claim_token: "claim-one",
  organisation_id: "org-one",
  lead_id: "lead-one",
  kind: "agent",
  payload_json: { to: "agent@agency.co.za", leadName: "Taylor Buyer" },
};
const envelope = {
  to: "agent@agency.co.za",
  from: "Arch9 <hello@arch9.co.za>",
  subject: "New lead",
  html: "<p>Hello</p>",
  text: "Hello",
};
function fixture(jobs: any[] = [job], completionFails = false) {
  const calls: any[] = [];
  return {
    calls,
    from: () => {
      throw new Error("Unexpected database read");
    },
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === "lead_agent_email_claim") return { data: jobs, error: null };
      if (name === "lead_agent_email_freeze") {
        return {
          data: jobs.find((row) => row.id === args.p_id)?.envelope_json ||
            args.p_envelope,
          error: null,
        };
      }
      return { data: true, error: completionFails ? true : null };
    },
  };
}
const render = async () => envelope;
Deno.test("agent queue retries uncertain provider results and requires an acceptance id", async () => {
  for (
    const response of [{ ok: false, status: 503, error: {} }, {
      ok: true,
      status: 200,
      data: {},
    }]
  ) {
    const db = fixture();
    const result = await dispatchLeadAgentEmails(db, {
      apiKey: "fixture",
      render,
      send: async () => response as any,
    });
    equal(result.results[0].status, "failed");
    equal(db.calls.at(-1).args.p_status, "failed");
  }
  const db = fixture();
  const sends: any[] = [];
  await dispatchLeadAgentEmails(db, {
    apiKey: "fixture",
    render,
    send: async (options) => {
      sends.push(options);
      return { ok: true, status: 200, data: { id: "provider-one" } };
    },
  });
  equal(sends[0].idempotencyKey, "lead-agent-email:job-one");
  equal(db.calls.at(-1).args.p_provider_message_id, "provider-one");
});
Deno.test("a lost completion can replay only the same frozen email and provider key", async () => {
  const sends: any[] = [];
  for (const fail of [true, false]) {
    const db = fixture([{
      ...job,
      envelope_json: envelope,
      claim_token: fail ? "first" : "retry",
    }], fail);
    const result = await dispatchLeadAgentEmails(db, {
      apiKey: "fixture",
      render: async () => {
        throw new Error("Must not re-render a frozen request");
      },
      send: async (options) => {
        sends.push(options);
        return { ok: true, status: 200, data: { id: "same-provider-id" } };
      },
    });
    equal(result.results[0].status, fail ? "claim_recovery_required" : "sent");
  }
  equal(sends[0], sends[1]);
});
Deno.test("disabled delivery and missing configuration remain retryable, never successful", async () => {
  for (
    const options of [{ apiKey: "" }, { apiKey: "fixture", enabled: false }]
  ) {
    const db = fixture();
    await dispatchLeadAgentEmails(db, {
      ...options,
      render,
      send: async () => {
        throw new Error("Unexpected provider call");
      },
    });
    equal(db.calls.at(-1).args.p_status, "failed");
  }
});
Deno.test("controlled contacts are suppressed and one failure does not block another lead", async () => {
  const db = fixture([{
    ...job,
    id: "test-job",
    payload_json: {
      to: "agent@agency.co.za",
      leadName: "TEST - DO NOT ACTION",
    },
  }, job]);
  let calls = 0;
  const result = await dispatchLeadAgentEmails(db, {
    apiKey: "fixture",
    render,
    send: async () => {
      calls++;
      return { ok: true, status: 200, data: { id: "real-acceptance" } };
    },
  });
  equal(result.results.map((row) => row.status), ["skipped", "sent"]);
  equal(calls, 1);
});
Deno.test("worker endpoint rejects public callers and caps the batch before processing", async () => {
  const config = {
    serviceRoleKey: "fixture-service",
    apiKey: "fixture",
    client: fixture(),
  };
  equal(
    (await handleLeadAgentEmailDispatcher(
      new Request("https://fixture.test", { method: "POST", body: "{}" }),
      config,
    )).status,
    403,
  );
  equal(
    (await handleLeadAgentEmailDispatcher(
      new Request("https://fixture.test", {
        headers: { authorization: "Bearer fixture-service" },
      }),
      config,
    )).status,
    405,
  );
  const response = await handleLeadAgentEmailDispatcher(
    new Request("https://fixture.test", {
      method: "POST",
      headers: { authorization: "Bearer fixture-service" },
      body: '{"limit":999}',
    }),
    config,
    async (_client, options) => {
      equal(options.limit, 10);
      return { claimed: 0, results: [] };
    },
  );
  equal(response.status, 200);
});

Deno.test("queued emails retain branding, a personal greeting and the correct rental action", async () => {
  const db = {
    ...fixture(),
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === "organisations" ? { name: "Fixture Agency" } : null,
          error: null,
        }),
      };
      return query;
    },
  };
  const message = await renderLeadAgentEnvelope(db, {
    ...job,
    organisation_id: "render-fixture-org",
    payload_json: {
      ...job.payload_json,
      eventKind: "new_enquiry_assigned_agent",
      recipientName: "Jamie Agent",
      leadSource: "Private Property",
      leadCategory: "buyer",
      rental: true,
    },
  }, "https://app.example.test/");
  equal(message.subject, "New rental lead: Private Property");
  equal(message.text.includes("Jamie"), true);
  equal(message.html.includes("Fixture Agency"), true);
  equal(message.html.includes("/agent/rentals/pipeline/leads/lead-one"), true);
  equal(
    /[\u2013\u2014]/u.test(message.subject + message.text + message.html),
    false,
  );
});

Deno.test("client intros and agent alerts succeed or retry independently", async () => {
  const intro = {
    ...job,
    id: "intro-one",
    kind: "client_intro",
    payload_json: { to: "client@real-agency.co.za", leadName: "Taylor Client" },
  };
  const db = fixture([job, intro]);
  const sent: any[] = [];
  const result = await dispatchLeadAgentEmails(db, {
    apiKey: "fixture",
    enabled: false,
    render,
    send: async (options) => {
      sent.push(options);
      return { ok: true, status: 200, data: { id: "intro-accepted" } };
    },
  });
  equal(result.results.map((row) => row.status), ["failed", "sent"]);
  equal(sent[0].idempotencyKey, "lead-agent-email:intro-one");
  const disabled = fixture([intro, job]);
  const reversed = await dispatchLeadAgentEmails(disabled, {
    apiKey: "fixture",
    clientEnabled: false,
    render,
    send: async () => ({
      ok: true,
      status: 200,
      data: { id: "agent-accepted" },
    }),
  });
  equal(reversed.results.map((row) => row.status), ["failed", "sent"]);
});

Deno.test("client intro rendering has distinct buyer and seller copy and no agent-copy dependency", async () => {
  const db = {
    ...fixture(),
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === "organisations" ? { name: "Intro Agency" } : null,
          error: null,
        }),
      };
      return q;
    },
  };
  for (const enquiryKind of ["sale", "seller"] as const) {
    const message = await renderLeadAgentEnvelope(db, {
      ...job,
      organisation_id: "intro-render-org",
      kind: "client_intro",
      payload_json: {
        to: "client@real-agency.co.za",
        leadName: "Taylor Client",
        leadSource: "Meta",
        enquiryKind,
        agentName: "Jamie Agent",
        agentEmail: "jamie@agency.co.za",
      },
    }, "https://app.example.test");
    equal(message.bcc, undefined);
    equal(message.html.includes("Intro Agency"), true);
    equal(message.text.includes("Hi Taylor"), true);
    equal(message.replyTo, "jamie@agency.co.za");
    equal(message.subject.includes("selling"), enquiryKind === "seller");
  }
});

Deno.test("invalid optional agent details cannot block or redirect a valid client intro", async () => {
  const db = {
    ...fixture(),
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return q;
    },
  };
  const message = await renderLeadAgentEnvelope(db, {
    ...job,
    organisation_id: "intro-no-agent-fixture",
    kind: "client_intro",
    payload_json: {
      to: "o'neill@agency.co.za",
      leadName: "Taylor",
      enquiryKind: "seller",
      agentEmail: "invalid email",
    },
  }, "https://app.example.test");
  equal(message.to, "o'neill@agency.co.za");
  equal(Boolean(message.replyTo?.includes("invalid")), false);
  equal(message.html.includes("Our team will connect you"), true);
});
