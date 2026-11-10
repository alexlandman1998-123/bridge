import { sendingDomainState } from "../../_shared/emailSendingDomain.ts";
import { formatEmailSender, normalizeEmailAddress } from "./emailBranding.ts";

// Invitations are platform mail. A legacy test or agency sender must never
// override the Arch9 identity, even when it is configured in a shared secret.
export async function resolveArch9InvitationSender({
  apiKey,
  configuredSenders = [Deno.env.get("ARCH9_RESEND_FROM_EMAIL"), Deno.env.get("RESEND_FROM_EMAIL")],
  request = fetch,
}: {
  apiKey: string;
  configuredSenders?: Array<string | undefined>;
  request?: typeof fetch;
}) {
  const candidates = [...new Set([...configuredSenders, "notifications@arch9.co.za"]
    .map(normalizeEmailAddress).filter((address) => {
      const domain = address.split("@")[1] || "";
      return domain === "arch9.co.za" || domain.endsWith(".arch9.co.za");
    }))];
  const domains = new Map<string, any>();
  let after = "";
  for (let page = 0; page < 10; page += 1) {
    const response = await request(`https://api.resend.com/domains?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("The Arch9 invitation sender could not be verified. Please try again shortly.");
    const result = await response.json();
    const rows = Array.isArray(result?.data) ? result.data : [];
    for (const row of rows) domains.set(String(row.name || "").toLowerCase(), row);
    if (!result.has_more) break;
    const cursor = String(rows.at(-1)?.id || "");
    if (!cursor || cursor === after) throw new Error("The Arch9 invitation sender could not be verified.");
    after = cursor;
  }
  for (const email of candidates) {
    const domain = domains.get(email.split("@")[1]);
    if (domain?.id && sendingDomainState(domain).status === "verified") {
      return { from: formatEmailSender(email, "Arch9"), domainId: String(domain.id) };
    }
  }
  throw new Error("Invitation email was not sent because the Arch9 sender is not verified or sending is disabled.");
}
