import { resolveArch9InvitationSender } from "./arch9InvitationSender.ts";
import { handleOrganisationPartnerInvitationEmail } from "../handlers/organisationPartnerInvitation.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const verified = { id: "arch9-domain", name: "arch9.co.za", status: "verified", capabilities: { sending: "enabled" } };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

Deno.test("invitations discard test and foreign senders and select the verified Arch9 identity", async () => {
  for (const sender of ["Arch9 <onboarding@resend.dev>", "spoof@arch9.co.za.evil.test", "office@agency.co.za"]) {
    const result = await resolveArch9InvitationSender({ apiKey: "test", configuredSenders: [sender], request: async () => response({ data: [verified] }) });
    assert(result.from === "Arch9 <notifications@arch9.co.za>");
    assert(result.domainId === verified.id);
  }
});

Deno.test("configured verified Arch9 subdomain takes priority over fallback", async () => {
  const result = await resolveArch9InvitationSender({ apiKey: "test", configuredSenders: ["invite@notify.arch9.co.za"], request: async () => response({ data: [verified, { ...verified, id: "subdomain", name: "notify.arch9.co.za" }] }) });
  assert(result.from === "Arch9 <invite@notify.arch9.co.za>");
});

Deno.test("unverified, disabled and missing domains cannot send invitations", async () => {
  for (const domains of [[], [{ ...verified, status: "pending" }], [{ ...verified, capabilities: { sending: "disabled" } }]]) {
    let failed = false;
    try { await resolveArch9InvitationSender({ apiKey: "test", configuredSenders: [], request: async () => response({ data: domains }) }); } catch { failed = true; }
    assert(failed);
  }
});

Deno.test("domain verification follows provider pagination and fails closed on API errors", async () => {
  const urls: string[] = [];
  const result = await resolveArch9InvitationSender({ apiKey: "test", configuredSenders: [], request: async (url) => {
    urls.push(String(url));
    return response(urls.length === 1 ? { data: [{ id: "cursor", name: "other.test" }], has_more: true } : { data: [verified], has_more: false });
  } });
  assert(result.domainId === verified.id && urls[1].includes("after=cursor"));
  let failed = false;
  try { await resolveArch9InvitationSender({ apiKey: "test", configuredSenders: [], request: async () => response({}, 403) }); } catch { failed = true; }
  assert(failed);
});

Deno.test("the actual invitation handler sends only after verification and requires provider acceptance", async () => {
  const keys = ["RESEND_API_KEY", "ARCH9_RESEND_FROM_EMAIL", "RESEND_FROM_EMAIL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS"];
  const previous = keys.map((key) => Deno.env.get(key));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of keys) Deno.env.delete(key);
    Deno.env.set("RESEND_API_KEY", "test-provider-key");
    Deno.env.set("ARCH9_RESEND_FROM_EMAIL", "Arch9 <onboarding@resend.dev>");
    const payload: any = { to: "partner@agency.test", invitationId: "invitation", deliveryAttemptId: "attempt", invitationLink: "https://app.arch9.test/partner-invite/invitation" };
    for (const scenario of ["verified", "pending", "rejected", "missing_receipt"]) {
      const sends: any[] = [];
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/domains")) return response({ data: [{ ...verified, status: scenario === "pending" ? "pending" : "verified" }] });
        assert(String(url) === "https://api.resend.com/emails", "Unexpected network request");
        sends.push({ body: JSON.parse(String(init?.body)), headers: init?.headers });
        return scenario === "rejected" ? response({ message: "Rejected" }, 403) : response(scenario === "missing_receipt" ? {} : { id: "accepted-receipt" });
      };
      const result = await handleOrganisationPartnerInvitationEmail(payload);
      const body = await result.json();
      if (scenario === "verified") {
        assert(result.status === 200 && body.sent === true && body.providerResponse.id === "accepted-receipt");
        assert(sends[0].body.from === "Arch9 <notifications@arch9.co.za>");
        assert(sends[0].headers["Idempotency-Key"] === "partner-invite:invitation:attempt");
      } else {
        assert(result.status >= 500 && body.sent === false);
        assert(scenario !== "pending" || sends.length === 0);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!));
  }
});
