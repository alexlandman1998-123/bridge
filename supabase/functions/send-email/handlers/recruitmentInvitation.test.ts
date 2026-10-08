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
      if (name === "recruitment_begin_invitation_email") {
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
    branding: async () => ({
      organisationName: "Agency",
      primaryColor: "#123456",
      supportEmail: "",
      supportPhone: "",
      logoUrl: "",
    }),
    sender: async () => "Agency <verified@agency.co.za>",
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
      dependencies,
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
