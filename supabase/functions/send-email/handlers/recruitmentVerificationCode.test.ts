import {
  authorizeRecruitmentCodeSender,
  handleHomeSeekersRecruitmentCodeEmail,
} from "./recruitmentVerificationCode.ts";
import { buildHomeSeekersRecruitmentCodeEmail } from "../content/recruitmentVerificationCode.ts";
import { HOME_SEEKERS_ORGANISATION_ID } from "./homeSeekersSellerEnquiry.ts";

function assert(condition: unknown, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
const leadId = "11111111-1111-4111-8111-111111111111";
const contact = {
  version: "recruitment-contact-v1",
  privacyAccepted: true,
  firstName: "<Applicant>",
  email: "applicant@sample.co.za",
};
async function configured(run: () => Promise<void>) {
  const keys = ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "SUPABASE_URL"];
  const previous = keys.map((key) => Deno.env.get(key));
  keys.forEach((key) => Deno.env.set(key, "fixture-private-key"));
  Deno.env.set("SUPABASE_URL", "https://project.supabase.co");
  try {
    await run();
  } finally {
    keys.forEach((key, i) =>
      previous[i] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, previous[i]!)
    );
  }
}
function fixture(
  {
    lead = {
      id: leadId,
      status: "lead_received",
      contact_capture_json: contact,
    } as any,
    generationError = false,
    sendError = false,
    generatedEmail = contact.email,
    senderAddress = "Home Seekers <recruitment@homeseekers.co.za>",
    expectedPlatformSender = "",
    fetchAdmin =
      (async () => new Response(null, { status: 403 })) as typeof fetch,
  } = {},
) {
  const filters: unknown[][] = [], sends: any[] = [], generations: any[] = [];
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => {
      filters.push(args);
      return query;
    },
    maybeSingle: async () => ({ data: lead }),
  };
  const admin = {
    from: (table: string) => {
      assert(table === "recruitment_leads");
      return query;
    },
    auth: {
      admin: {
        generateLink: async (args: unknown) => {
          generations.push(args);
          return {
            error: generationError ? { message: "private-token-detail" } : null,
            data: {
              user: { email: generatedEmail },
              properties: {
                email_otp: "12345678",
                hashed_token: "private-provider-token",
                action_link: "https://private-auth-link.invalid/activate",
              },
            },
          };
        },
      },
    },
  };
  const dependencies = {
    admin,
    fetchAdmin,
    branding: async (args: any) => {
      assert(
        args.supabase === admin &&
          args.organisationId === HOME_SEEKERS_ORGANISATION_ID,
      );
      return {
        organisationId: HOME_SEEKERS_ORGANISATION_ID,
        organisationName: "Home Seekers",
        primaryColor: "#f36f21",
        secondaryColor: "#171717",
      };
    },
    sender: async (args: any) => {
      assert(
        args.supabase === admin && args.audience === "client" &&
          args.platformSender === expectedPlatformSender,
      );
      return senderAddress;
    },
    send: async (args: any) => {
      sends.push(args);
      return sendError
        ? {
          ok: false as const,
          status: 500,
          error: { message: "private-email-detail" },
        }
        : {
          ok: true as const,
          status: 200,
          data: { id: "private-provider-receipt" },
        };
    },
  };
  const request = (authorization = "Bearer fixture-private-key") =>
    new Request("https://sample.co.za", { headers: { authorization } });
  const run = (
    payload = { leadId } as Record<string, unknown>,
    authorization?: string,
  ) =>
    handleHomeSeekersRecruitmentCodeEmail(
      request(authorization),
      payload,
      dependencies,
    );
  return { filters, sends, generations, run };
}
Deno.test("verification codes use the approved temporary Arch9 sender and Thomas reply-to", () =>
  configured(async () => {
    const previous = Deno.env.get("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM");
    Deno.env.set(
      "HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM",
      "notifications@arch9.co.za",
    );
    try {
      const f = fixture({
        senderAddress: "notifications@arch9.co.za",
        expectedPlatformSender: "notifications@arch9.co.za",
      });
      assert((await f.run()).status === 200);
      assert(f.sends.length === 1);
      assert(f.sends[0].from === "Home Seekers <notifications@arch9.co.za>");
      assert(f.sends[0].replyTo === "thomas@homeseekers.co.za");
      assert(f.sends[0].to === contact.email);
    } finally {
      previous === undefined
        ? Deno.env.delete("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM")
        : Deno.env.set("HOME_SEEKERS_RECRUITMENT_FALLBACK_FROM", previous);
    }
  }));

Deno.test("recruitment code email rejects unverified server credentials before reading or sending", () =>
  configured(async () => {
    const f = fixture();
    const forged = `Bearer ${btoa('{"role":"service_role"}')}.forged`;
    assert((await f.run({ leadId }, forged)).status === 403);
    assert((await f.run({ leadId: "invalid" })).status === 400);
    assert(
      f.filters.length === 0 && f.generations.length === 0 &&
        f.sends.length === 0,
    );
  }));
Deno.test("a rotated server credential is verified by this project's Auth before delivering a code", () =>
  configured(async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const authorization = "Bearer rotated-valid-service-credential";
    const f = fixture({
      fetchAdmin: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response("sensitive-user-records", { status: 200 });
      }) as typeof fetch,
    });
    const result = await f.run(
      { leadId, to: "attacker@sample.co.za" },
      authorization,
    );
    assert(result.status === 200);
    assert(calls.length === 1);
    assert(
      calls[0].url ===
        "https://project.supabase.co/auth/v1/admin/users?page=1&per_page=1",
    );
    const headers = new Headers(calls[0].init?.headers);
    assert(headers.get("authorization") === authorization);
    assert(headers.get("apikey") === "rotated-valid-service-credential");
    assert(calls[0].init?.redirect === "error" && calls[0].init?.signal);
    assert(f.generations.length === 1 && f.sends.length === 1);
    assert(f.sends[0].to === contact.email);
    assert(
      !JSON.stringify(await result.json()).includes("sensitive-user-records"),
    );
  }));
Deno.test("matching server credentials avoid an extra Auth request", () =>
  configured(async () => {
    let calls = 0;
    const allowed = await authorizeRecruitmentCodeSender(
      new Request("https://sample.co.za", {
        headers: { authorization: "Bearer fixture-private-key" },
      }),
      (async () => {
        calls++;
        throw new Error("unexpected request");
      }) as typeof fetch,
    );
    assert(allowed && calls === 0);
  }));
Deno.test("anonymous, ordinary user, forged and failing Auth checks cannot generate or send a code", () =>
  configured(async () => {
    for (const status of [401, 403, 302, 500]) {
      const f = fixture({
        fetchAdmin: (async () =>
          new Response(null, { status })) as typeof fetch,
      });
      assert(
        (await f.run({ leadId }, "Bearer unprivileged-credential")).status ===
          403,
      );
      assert(
        f.filters.length === 0 && f.generations.length === 0 &&
          f.sends.length === 0,
      );
    }
    const f = fixture({
      fetchAdmin: (async () => {
        throw new Error("private-network-detail");
      }) as typeof fetch,
    });
    const result = await f.run({ leadId }, "Bearer different-credential");
    assert(
      result.status === 403 &&
        !JSON.stringify(await result.json()).includes("private-network-detail"),
    );
    assert(
      f.filters.length === 0 && f.generations.length === 0 &&
        f.sends.length === 0,
    );
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    let calls = 0;
    assert(
      !(await authorizeRecruitmentCodeSender(
        new Request("https://sample.co.za", {
          headers: { authorization: "Bearer another-credential" },
        }),
        (async () => {
          calls++;
          return new Response(null, { status: 200 });
        }) as typeof fetch,
      )),
    );
    assert(calls === 0);
  }));
Deno.test("recruitment code email uses only the canonical Home Seekers contact and never sends the activation URL", () =>
  configured(async () => {
    const f = fixture();
    const result = await f.run({
      leadId,
      to: "attacker@sample.co.za",
      code: "87654321",
      organisationId: "forged",
    });
    assert(result.status === 200);
    assert(
      JSON.stringify(await result.json()) ===
        JSON.stringify({ verificationRequested: true, codeLength: 8 }),
    );
    assert(
      f.filters.some((args) =>
        args[0] === "organisation_id" &&
        args[1] === HOME_SEEKERS_ORGANISATION_ID
      ),
    );
    assert(
      f.generations.length === 1 && f.generations[0].type === "magiclink" &&
        f.generations[0].email === contact.email,
    );
    const sent = f.sends[0];
    assert(sent.to === contact.email && sent.subject.includes("Home Seekers"));
    assert(sent.from === "Home Seekers <recruitment@homeseekers.co.za>");
    assert(sent.replyTo === "thomas@homeseekers.co.za");
    assert(sent.html.includes("12345678") && sent.text.includes("12345678"));
    assert(
      sent.html.includes("&lt;Applicant&gt;") &&
        !sent.html.includes("<Applicant>"),
    );
    assert(
      !/private-provider-token|private-auth-link|attacker|87654321/.test(
        JSON.stringify(sent),
      ),
    );
    assert(
      !/\/invite\/|\/activate|activate account|sign in to arch9/i.test(
        sent.html,
      ),
    );
    assert(
      sent.idempotencyKey.match(/^home-seekers-recruitment-code:[a-f0-9]{64}$/),
    );
  }));
Deno.test("closed, missing, malformed and controlled test enquiries never generate or deliver codes", () =>
  configured(async () => {
    for (
      const lead of [
        null,
        { status: "closed_lost", contact_capture_json: contact },
        { status: "agent_activated", contact_capture_json: contact },
        { status: "legacy_joined", contact_capture_json: contact },
        { status: "lead_received", contact_capture_json: {} },
        {
          status: "lead_received",
          contact_capture_json: { ...contact, privacyAccepted: false },
        },
        {
          status: "lead_received",
          contact_capture_json: { ...contact, email: "invalid" },
        },
      ]
    ) {
      const f = fixture({ lead });
      assert((await f.run()).status === 409);
      assert(f.generations.length === 0 && f.sends.length === 0);
    }
    const f = fixture({
      lead: {
        status: "lead_received",
        contact_capture_json: { ...contact, email: "fixture@example.test" },
      },
    });
    const result = await f.run();
    assert(
      result.status === 200 &&
        (await result.json()).verificationRequested === false,
    );
    assert(f.generations.length === 0 && f.sends.length === 0);
  }));
Deno.test("provider failures and email mismatches preserve the enquiry and disclose no credentials", () =>
  configured(async () => {
    for (
      const f of [
        fixture({ generationError: true }),
        fixture({ sendError: true }),
        fixture({ generatedEmail: "other@sample.co.za" }),
      ]
    ) {
      const result = await f.run();
      assert(result.status === 503);
      const body = JSON.stringify(await result.json());
      assert(body.includes("saved enquiry is safe"));
      assert(
        !/private-token|private-email|12345678|private-provider/.test(body),
      );
    }
  }));
Deno.test("six and eight digit recruitment emails explain expiry and same-form recovery without a CTA", () => {
  for (const code of ["123456", "12345678"]) {
    const email = buildHomeSeekersRecruitmentCodeEmail(code, "Applicant", {});
    assert(
      email.text.includes(code) && email.text.includes("expires automatically"),
    );
    assert(
      email.text.includes("same form") &&
        !/\/invite\/|\/activate|activate account/i.test(email.html),
    );
  }
  let rejected = false;
  try {
    buildHomeSeekersRecruitmentCodeEmail("<script>", "", {});
  } catch {
    rejected = true;
  }
  assert(rejected);
});

Deno.test("an unconfigured Home Seekers sender cannot generate or send a code from an Arch9 mailbox", () =>
  configured(async () => {
    for (
      const senderAddress of ["", "Home Seekers <notifications@arch9.co.za>"]
    ) {
      const f = fixture({ senderAddress });
      assert((await f.run()).status === 503);
      assert(f.generations.length === 0 && f.sends.length === 0);
    }
  }));
