import { handleRecruitmentInvitationEmail } from "./recruitmentInvitation.ts";
const org = "11111111-1111-4111-8111-111111111111",
  lead = "22222222-2222-4222-8222-222222222222",
  ref = "33333333-3333-4333-8333-333333333333",
  id = "44444444-4444-4444-8444-444444444444",
  actor = "55555555-5555-4555-8555-555555555555";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function fixture(run: (f: any) => Promise<void>) {
  const keys = ["RESEND_API_KEY", "CLIENT_APP_URL"];
  const previous = keys.map((key) => Deno.env.get(key));
  Deno.env.set(keys[0], "fake-unit-test-provider-key");
  Deno.env.set(keys[1], "https://app.arch9.test");
  const calls: any[] = [];
  let sends = 0;
  const f: any = {
    calls,
    authenticated: true,
    allowed: true,
    kind: "workspace",
    outcome: { ok: true, status: 200, data: { id: "provider-id" } },
    busy: false,
    finishError: false,
    email: "applicant@agency.co.za",
    claimError: null,
  };
  const candidate = {
    id: lead,
    name: "Sam Recruit",
    email: f.email,
    status: "onboarding_complete",
    activation_json: { role: "commercial_broker" },
  };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () =>
      Promise.resolve({
        data: f.table === "invites"
          ? { token: "canonical-token" }
          : { ...candidate, email: f.email },
        error: null,
      }),
  };
  const admin = {
    from: (table: string) => {
      f.table = table;
      return chain;
    },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (
        name === "recruitment_begin_invitation_email" ||
        name === "recruitment_begin_submission_email"
      ) {
        return {
          error: f.claimError,
          data: f.claimError ? null : {
            send: !f.busy,
            busy: f.busy,
            attempt: {
              id,
              lease_id: "lease",
              status: "sending",
              message_json: f.storedMessage || args.p_message,
            },
          },
        };
      }
      return {
        data: !f.finishError,
        error: f.finishError ? { message: "DB disconnected" } : null,
      };
    },
  };
  const user = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: f.authenticated ? { id: actor } : null },
          error: null,
        }),
    },
    rpc: () =>
      Promise.resolve({
        data: null,
        error: f.allowed ? null : { code: "42501" },
      }),
  };
  const dependencies: any = {
    admin,
    user,
    send: async (args: any) => {
      sends++;
      f.sent = args;
      return f.outcome;
    },
    branding: async (args: any) => {
      f.brandingArgs = args;
      return ({
        organisationName: "Agency",
        primaryColor: "#123456",
        supportEmail: "",
        supportPhone: "",
        logoUrl: "",
      });
    },
    sender: async (args: any) => {
      f.senderArgs = args;
      return f.senderOverride ??
        (args.branding.organisationName === "Home Seekers"
          ? "Home Seekers <recruitment@homeseekers.co.za>"
          : "Agency <verified@agency.co.za>");
    },
  };
  f.dispatch = async (patch: any = {}, auth = true) => {
    const response = await handleRecruitmentInvitationEmail(
      new Request("https://function.test", {
        headers: auth ? { authorization: "Bearer signed-user-token" } : {},
      }),
      {
        organisationId: org,
        leadId: lead,
        referenceId: ref,
        requestId: id,
        kind: f.kind,
        ...patch,
      },
      {
        ...dependencies,
        ...(f.submissionAutomation
          ? { automationActor: actor, submissionAutomation: true }
          : {}),
      },
    );
    return { status: response.status, ...await response.json() };
  };
  f.sends = () => sends;
  try {
    await run(f);
  } finally {
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!)
    );
  }
}
Deno.test("recruitment email requires a verified signed-in manager before loading private records", () =>
  fixture(async (f) => {
    assert((await f.dispatch({}, false)).status === 401);
    assert(f.calls.length === 0);
    f.authenticated = false;
    assert((await f.dispatch()).status === 401);
    assert(f.calls.length === 0);
    f.authenticated = true;
    f.allowed = false;
    assert((await f.dispatch()).status === 403);
    assert(f.sends() === 0);
  }));
Deno.test("workspace email derives recipient, role and secure URL from saved access; provider acceptance is recorded", () =>
  fixture(async (f) => {
    const result = await f.dispatch({
      to: "attacker@bad.org",
      inviteLink: "https://phishing.org",
      workspaceRole: "principal",
    });
    assert(result.ok === true && result.status === "provider_accepted");
    assert(f.sent.to === "applicant@agency.co.za");
    assert(
      f.sent.html.includes("https://app.arch9.test/invite/canonical-token"),
    );
    assert(!f.sent.html.includes("phishing"));
    assert(!f.sent.text.includes("principal"));
    assert(f.sent.text.includes("commercial broker"));
    assert(f.sent.idempotencyKey === `recruitment-invitation/${id}`);
    assert(f.calls.at(-1).args.p_status === "provider_accepted");
    assert(f.calls.at(-1).args.p_provider_id === "provider-id");
  }));
Deno.test("application email hashes the transient private token and clearly grants no staff access", () =>
  fixture(async (f) => {
    f.kind = "application";
    const token = "a".repeat(64);
    assert(
      (await f.dispatch({
        applicationLink: `https://different-host.test/join-us/${token}`,
      })).ok,
    );
    assert(f.sent.html.includes(`https://app.arch9.test/join-us/${token}`));
    assert(f.sent.text.includes("does not grant staff access"));
    const claim = f.calls[0].args;
    assert(/^[a-f0-9]{64}$/.test(claim.p_token_hash));
    assert(claim.p_token_hash !== token);
    assert(claim.p_kind === "application");
  }));
Deno.test("malformed links, expired access, suppressed contacts and in-flight attempts cannot send", () =>
  fixture(async (f) => {
    f.kind = "application";
    assert(
      (await f.dispatch({ applicationLink: "https://bad.org/invite/wrong" }))
        .status === 400,
    );
    f.kind = "workspace";
    f.claimError = { code: "P0001", message: "Invitation expired" };
    assert((await f.dispatch()).status === 409);
    assert(f.sends() === 0);
    f.claimError = null;
    f.busy = true;
    assert((await f.dispatch()).busy);
    assert(f.sends() === 0);
    f.busy = false;
    f.email = "test@example.test";
    assert((await f.dispatch()).suppressed);
    assert(f.sends() === 0);
  }));
Deno.test("uncertain retries use the frozen provider payload instead of changed content", () =>
  fixture(async (f) => {
    f.storedMessage = {
      from: "Original <original@agency.co.za>",
      to: f.email,
      subject: "Original",
      html: "frozen",
      text: "original link",
    };
    f.outcome = { ok: false, status: null, error: { message: "timeout" } };
    assert((await f.dispatch()).status === "unknown");
    assert(f.sent.html === "frozen");
    assert(f.calls.at(-1).args.p_status === "unknown");
    f.outcome = { ok: true, status: 200, data: { id: "same-provider-id" } };
    assert((await f.dispatch()).status === "provider_accepted");
    assert(f.sent.html === "frozen");
    assert(f.sent.idempotencyKey === `recruitment-invitation/${id}`);
  }));
Deno.test("provider rejection is distinct from uncertain 5xx or missing receipt persistence", () =>
  fixture(async (f) => {
    f.outcome = {
      ok: false,
      status: 422,
      error: { message: "invalid sender" },
    };
    assert((await f.dispatch()).status === "failed");
    f.outcome = {
      ok: false,
      status: 503,
      error: { message: "provider unavailable" },
    };
    assert((await f.dispatch()).status === "unknown");
    f.outcome = {
      ok: true,
      status: 200,
      data: { id: "accepted-but-not-recorded" },
    };
    f.finishError = true;
    const result = await f.dispatch();
    assert(result.ok === false && result.status === "unknown");
    assert(!result.error.includes("delivered"));
  }));
Deno.test("document reminder uses the canonical Home Seekers login screen without granting workspace access", () =>
  fixture(async (f) => {
    f.kind = "documents_reminder";
    const response = await f.dispatch({
      organisationId: "2958d402-368e-43c9-b728-0098e10505f1",
      referenceId: lead,
      applicationLink: "https://evil.test",
      to: "attacker@test",
      role: "admin",
      password: "FixturePass123",
    });
    assert(response.ok === true);
    const message = f.calls.find((call: any) =>
      call.name === "recruitment_begin_invitation_email"
    ).args.p_message;
    assert(
      message.text.includes("https://app.arch9.test/applicant/my-profile"),
    );
    assert(message.text.includes("password you set when applying"));
    assert(message.text.includes("FICA documents and FFC certificate"));
    assert(message.text.includes("review and approve your application"));
    assert(!message.text.includes("Log in to Arch9"));
    assert(!message.html.includes("Powered by Arch9"));
    assert(!message.html.includes("through Arch9"));
    assert(!message.html.includes("FixturePass123"));
    assert(!message.text.includes("evil.test"));
    assert(!message.html.includes("/invite/"));
    assert(message.to === f.email);
  }));
Deno.test("approval notice contains the saved decision message and promises a contract without offering access", () =>
  fixture(async (f) => {
    f.kind = "approval";
    const response = await f.dispatch({
      referenceId: lead,
      to: "attacker@test",
      text: "Forged content",
    });
    assert(response.ok === true);
    const message = f.calls.find((call: any) =>
      call.name === "recruitment_begin_invitation_email"
    ).args.p_message;
    assert(message.text.includes("Your application has been approved"));
    assert(message.text.includes("We will send you the contract shortly."));
    assert(!message.text.includes("/invite/"));
    assert(!message.html.includes("Accept workspace access"));
    assert(!message.text.includes("Forged content"));
  }));
Deno.test("automatic submission delivery uses the queued applicant claim and the same retained provider key", () =>
  fixture(async (f) => {
    f.kind = "documents_reminder";
    f.submissionAutomation = true;
    f.authenticated = false;
    f.allowed = false;
    const response = await f.dispatch({
      organisationId: "2958d402-368e-43c9-b728-0098e10505f1",
      referenceId: lead,
    });
    assert(response.ok === true && response.status === "provider_accepted");
    const claim = f.calls.find((call: any) =>
      call.name === "recruitment_begin_submission_email"
    );
    assert(
      claim.args.p_actor === actor &&
        claim.args.p_kind === "documents_reminder",
    );
    assert(claim.args.p_message.text.includes("open My Profile"));
    assert(f.sends() === 1);
    f.kind = "workspace";
    assert((await f.dispatch()).status === 400);
    assert(f.sends() === 1);
  }));
Deno.test("thank-you, follow-up and contract notices require their saved automation kind and applicant claim", () =>
  fixture(async (f) => {
    f.submissionAutomation = true;
    f.authenticated = false;
    f.allowed = false;
    for (const kind of ["application_thanks", "documents_followup", "contract_available"]) {
      f.kind = kind;
      const response = await f.dispatch({
        organisationId: "2958d402-368e-43c9-b728-0098e10505f1",
        referenceId: lead,
        subject: "Forged",
        to: "attacker@test",
        applicationLink: "https://evil.test",
      });
      assert(response.ok === true && response.status === "provider_accepted");
      const claim = f.calls.filter((call: any) =>
        call.name === "recruitment_begin_submission_email"
      ).at(-1);
      assert(
        claim.args.p_kind === kind && claim.args.p_actor === actor &&
          claim.args.p_message.to === f.email,
      );
      assert(
        !f.sent.text.includes("evil.test") &&
          f.sent.idempotencyKey === `recruitment-invitation/${id}`,
      );
      assert(
        kind === "application_thanks"
          ? f.sent.text.includes("second email")
          : kind === "documents_followup"
          ? f.sent.text.includes("still missing")
          : f.sent.text.includes("sign"),
      );
    }
    f.submissionAutomation = false;
    f.authenticated = true;
    f.allowed = true;
    assert(
      (await f.dispatch({
        organisationId: "2958d402-368e-43c9-b728-0098e10505f1",
        referenceId: lead,
      })).status === 400,
    );
    assert(f.sends() === 3);
  }));

Deno.test("Home Seekers applicant notices load saved branding and use its verified sender", () =>
  fixture(async (f) => {
    const organisationId = "2958d402-368e-43c9-b728-0098e10505f1";
    for (
      const kind of [
        "application_thanks",
        "documents_reminder",
        "documents_followup",
        "approval",
        "contract_available",
      ]
    ) {
      f.kind = kind;
      f.submissionAutomation = kind !== "approval";
      assert(
        (await f.dispatch({
          organisationId,
          referenceId: lead,
          branding: { organisationName: "Forged" },
        })).ok === true,
      );
      assert(
        f.brandingArgs.supabase &&
          f.brandingArgs.organisationId === organisationId,
      );
      assert(
        f.senderArgs.supabase === f.brandingArgs.supabase &&
          f.senderArgs.audience === "client" &&
          f.senderArgs.platformSender === "",
      );
      assert(f.sent.from === "Home Seekers <recruitment@homeseekers.co.za>");
      assert(f.sent.replyTo === "thomas@homeseekers.co.za");
      assert(
        f.sent.subject.startsWith("Home Seekers:") &&
          f.sent.html.includes(
            "/brand/homeseekers/recruitment-logo-on-white.png",
          ),
      );
      assert(!/Powered by Arch9|through Arch9|From Agency/.test(f.sent.html));
      assert(f.sent.html.includes("admin@homeseekers.co.za"));
    }
  }));

Deno.test("Home Seekers applicant emails freeze the temporary Arch9 sender and Thomas reply-to", () =>
  fixture(async (f) => {
    const previous = Deno.env.get("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM");
    Deno.env.set("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM", "notifications@arch9.co.za");
    try {
      f.kind = "documents_reminder";
      f.senderOverride = "notifications@arch9.co.za";
      assert((await f.dispatch({ organisationId: "2958d402-368e-43c9-b728-0098e10505f1", referenceId: lead })).ok === true);
      assert(f.senderArgs.platformSender === "notifications@arch9.co.za");
      assert(f.sent.from === "Home Seekers <notifications@arch9.co.za>");
      assert(f.sent.replyTo === "thomas@homeseekers.co.za");
      assert(f.calls[0].args.p_message.replyTo === f.sent.replyTo);
    } finally {
      previous === undefined ? Deno.env.delete("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM") : Deno.env.set("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM", previous);
    }
  }));

Deno.test("an unconfigured Home Seekers sender returns a setup error before creating an attempt or sending", () =>
  fixture(async (f) => {
    f.kind = "documents_reminder";
    f.senderOverride = "";
    const response = await f.dispatch({
      organisationId: "2958d402-368e-43c9-b728-0098e10505f1",
      referenceId: lead,
    });
    assert(
      response.status === 503 &&
        response.error.includes("verified Home Seekers"),
    );
    assert(f.sends() === 0 && !f.calls.length);
  }));
