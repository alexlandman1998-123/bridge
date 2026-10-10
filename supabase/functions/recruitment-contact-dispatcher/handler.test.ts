import { dispatchRecruitmentContacts } from "./handler.ts";
import { buildRecruitmentContactNotification } from "../send-email/content/recruitmentContactNotification.ts";

function assert(value: unknown): asserts value {
  if (!value) throw new Error("Assertion failed");
}
const contact = {
  firstName: "Sam",
  lastName: "Agent",
  email: "sam@homeseekers.co.za",
  phone: "+27821234567",
};
const base = {
  id: "33333333-3333-4333-8333-333333333333",
  organisation_id: "2958d402-368e-43c9-b728-0098e10505f1",
  lead_id: "22222222-2222-4222-8222-222222222222",
  lease_id: "44444444-4444-4444-8444-444444444444",
  contact_json: contact,
  message_json: {},
};
const recipients = [
  "thomas@homeseekers.co.za",
  "admin@homeseekers.co.za",
  "alex@arch9.co.za",
];
const request = (authorization = "Bearer server-only") =>
  new Request("https://worker.test", {
    method: "POST",
    headers: { authorization },
    body: JSON.stringify({ to: "attacker@other.co.za", leadId: "forged" }),
  });
function harness(jobs: any[], outcome?: (message: any) => any) {
  const calls: any[] = [], sends: any[] = [], pauses: number[] = [];
  const admin = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return {
        data: name === "recruitment_claim_contact_notifications"
          ? jobs
          : name === "recruitment_prepare_contact_notification"
          ? args.p_message
          : true,
      };
    },
  };
  return {
    calls,
    sends,
    pauses,
    dependencies: {
      key: "server-only",
      apiKey: "provider-test-key",
      admin,
      branding: async () => ({ organisationName: "Home Seekers" }),
      sender: async (args: any) => {
        assert(
          args.audience === "client" && args.supabase === admin &&
            args.platformSender === "",
        );
        assert(
          args.branding.organisationName === "Home Seekers" &&
            args.branding.organisationId === base.organisation_id,
        );
        return "Home Seekers <recruitment@homeseekers.co.za>";
      },
      pause: async (ms: number) => {
        pauses.push(ms);
      },
      send: async (message: any) => {
        sends.push(message);
        return outcome
          ? outcome(message)
          : { ok: true, status: 200, data: { id: `provider-${message.to}` } };
      },
    },
  };
}

Deno.test("saved first-screen contact notifies exactly the three recipients, ignoring caller routing and without applicant auth", async () => {
  const h = harness(
    recipients.map((recipient, index) => ({
      ...base,
      id: `00000000-0000-4000-8000-00000000000${index}`,
      recipient,
    })),
  );
  const result = await dispatchRecruitmentContacts(
    request(),
    h.dependencies as any,
  );
  assert((await result.json()).accepted === 3);
  assert(JSON.stringify(h.pauses) === "[600,600]");
  assert(
    JSON.stringify(h.sends.map((item) => item.to)) ===
      JSON.stringify(recipients),
  );
  for (const email of h.sends) {
    assert(email.from === "Home Seekers <recruitment@homeseekers.co.za>");
    assert(email.replyTo === "thomas@homeseekers.co.za");
    assert(
      email.text.includes(contact.email) &&
        email.text.includes(contact.phone) &&
        email.text.includes("first Join Us screen"),
    );
    assert(email.html.includes(`/agency/recruitment/${base.lead_id}`));
    assert(email.subject === "Home Seekers: New Lead Received" && !email.bcc);
    assert(email.idempotencyKey.startsWith("recruitment-contact/"));
  }
  assert(
    h.calls.filter((call) =>
      call.name === "recruitment_complete_contact_notification"
    ).every((call) => call.args.p_provider_id && !call.args.p_error),
  );
});

Deno.test("staff notifications use the temporary Arch9 sender with Thomas reply-to", async () => {
  const previous = Deno.env.get("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM");
  Deno.env.set("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM", "notifications@arch9.co.za");
  try {
    const h = harness([{ ...base, recipient: recipients[0] }]);
    h.dependencies.sender = async (args: any) => args.platformSender;
    const result = await (await dispatchRecruitmentContacts(request(), h.dependencies as any)).json();
    assert(result.accepted === 1 && h.sends.length === 1);
    assert(h.sends[0].from === "Home Seekers <notifications@arch9.co.za>");
    assert(h.sends[0].replyTo === "thomas@homeseekers.co.za");
    assert(h.sends[0].to === recipients[0]);
  } finally {
    previous === undefined ? Deno.env.delete("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM") : Deno.env.set("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM", previous);
  }
});

Deno.test("a missing Home Seekers sender keeps notifications pending without freezing an Arch9 fallback", async () => {
  const h = harness([{ ...base, recipient: recipients[0] }]);
  h.dependencies.sender = async () => "";
  const result =
    await (await dispatchRecruitmentContacts(request(), h.dependencies as any))
      .json();
  assert(result.pending === 1 && result.accepted === 0 && !h.sends.length);
  assert(
    !h.calls.some((call) =>
      call.name === "recruitment_prepare_contact_notification"
    ),
  );
});

Deno.test("unauthorised callers, wrong agency and invalid saved recipients cannot send notifications", async () => {
  const h = harness([{ ...base, recipient: recipients[0] }]);
  for (const token of ["", "Bearer user-token", "Bearer wrong-key"]) {
    assert(
      (await dispatchRecruitmentContacts(request(token), h.dependencies as any))
        .status === 401,
    );
  }
  assert(!h.calls.length && !h.sends.length);
  const forged = harness([{ ...base, recipient: "attacker@other.co.za" }, {
    ...base,
    recipient: recipients[0],
    organisation_id: "wrong-agency",
  }]);
  assert(
    (await (await dispatchRecruitmentContacts(
      request(),
      forged.dependencies as any,
    )).json()).accepted === 0,
  );
  assert(!forged.sends.length);
});

Deno.test("retries use the saved exact payload and idempotency key, while an empty queue sends nothing", async () => {
  const frozen = {
    from: "Original sender <no-reply@arch9.co.za>",
    to: recipients[0],
    subject: "Original subject",
    html: "<p>Original</p>",
    text: "Original text",
  };
  const h = harness([{
    ...base,
    recipient: recipients[0],
    message_json: frozen,
  }]);
  h.dependencies.branding = () => {
    throw new Error("Must retain original branding");
  };
  for (let i = 0; i < 2; i++) {
    await dispatchRecruitmentContacts(request(), h.dependencies as any);
  }
  assert(
    h.sends.length === 2 &&
      JSON.stringify(h.sends[0]) === JSON.stringify(h.sends[1]),
  );
  assert(
    h.sends[0].from === frozen.from &&
      h.sends[0].idempotencyKey === `recruitment-contact/${base.id}`,
  );
  const empty = harness([]);
  assert(
    (await (await dispatchRecruitmentContacts(
          request(),
          empty.dependencies as any,
        )).json()).accepted === 0 && !empty.sends.length,
  );
});

Deno.test("uncertain or rejected delivery to one recipient does not prevent the other two notifications", async () => {
  for (
    const failure of [{ ok: false, status: 429 }, { ok: false, status: 422 }, {
      ok: true,
      status: 200,
      data: {},
    }]
  ) {
    const h = harness(
      recipients.map((recipient) => ({ ...base, recipient })),
      (message) =>
        message.to === recipients[0]
          ? failure
          : { ok: true, status: 200, data: { id: "accepted" } },
    );
    const result = await (await dispatchRecruitmentContacts(
      request(),
      h.dependencies as any,
    )).json();
    assert(
      result.accepted === 2 && result.pending === 1 && h.sends.length === 3,
    );
    const failed = h.calls.find((call) =>
      call.name === "recruitment_complete_contact_notification"
    );
    assert(
      failed.args.p_provider_id === null &&
        failed.args.p_error ===
          (failure.status === 422
            ? "provider_rejected"
            : "dispatch_unconfirmed"),
    );
  }
});

Deno.test("controlled test leads are suppressed before notifying real staff recipients", async () => {
  const h = harness([{
    ...base,
    recipient: recipients[0],
    contact_json: { ...contact, email: "fixture@example.test" },
  }]);
  const result =
    await (await dispatchRecruitmentContacts(request(), h.dependencies as any))
      .json();
  assert(result.suppressed === 1 && !h.sends.length);
  assert(h.calls[1].args.p_error === "controlled_test_recipient");
});

Deno.test("lead-provided fields are escaped in HTML and never become the notification subject or action URL", () => {
  const email = buildRecruitmentContactNotification(base.lead_id, {
    ...contact,
    firstName: "<script>alert(1)</script>",
  }, {});
  assert(
    email.html.includes("&lt;script&gt;") && !email.html.includes("<script>"),
  );
  assert(
    email.subject === "Home Seekers: New Lead Received" &&
      email.html.includes(
        `https://app.arch9.co.za/agency/recruitment/${base.lead_id}`,
      ),
  );
});
Deno.test("application and completed-pack events notify the same three staff recipients using saved events only", async () => {
  for (const event_kind of ["application_received", "documents_received"]) {
    const h = harness(
      recipients.map((recipient, index) => ({
        ...base,
        id: `00000000-0000-4000-8000-00000000000${index}`,
        recipient,
        event_kind,
      })),
    );
    const result = await dispatchRecruitmentContacts(
      request(),
      h.dependencies as any,
    );
    assert((await result.json()).accepted === 3);
    assert(
      JSON.stringify(h.sends.map((item) => item.to)) ===
        JSON.stringify(recipients),
    );
    assert(
      h.sends.every((item) =>
        event_kind === "application_received"
          ? item.subject.includes("New Application Received")
          : item.subject.includes("Sam Agent has uploaded their documents")
      ),
    );
    assert(
      h.sends.every((item) =>
        item.text.includes(`/agency/recruitment/${base.lead_id}`) &&
        !item.html.includes("storage/")
      ),
    );
  }
});
Deno.test("unknown saved notification events cannot send a staff email", async () => {
  const h = harness([{
    ...base,
    recipient: recipients[0],
    event_kind: "forged",
  }]);
  await dispatchRecruitmentContacts(request(), h.dependencies as any);
  assert(h.sends.length === 0);
});
Deno.test('a saved signed-return notification goes to the agency with a review link and retains provider idempotency', async () => {
  const job = { ...base, recipient: recipients[0], event_kind: 'contract_returned', contact_json: { ...contact, contractVersion: 1, contractFilename: 'Signed.pdf' } };
  const h = harness([job]);
  const response = await dispatchRecruitmentContacts(request(), h.dependencies as any);
  assert((await response.json()).accepted === 1);
  assert(h.sends[0].subject.includes('returned their signed contract'));
  assert(h.sends[0].text.includes('verify all pages and signatures'));
  assert(h.sends[0].html.includes(`/agency/recruitment/${base.lead_id}`));
  assert(h.sends[0].idempotencyKey === `recruitment-contact/${base.id}`);
  assert(!h.sends[0].html.includes('storage/v1'));
});
