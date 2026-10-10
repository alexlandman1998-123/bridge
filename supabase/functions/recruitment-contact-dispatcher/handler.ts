import { buildRecruitmentContactNotification } from "../send-email/content/recruitmentContactNotification.ts";
import { sendViaResendApi } from "../send-email/services/resend.ts";
import {
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../send-email/services/emailBranding.ts";
import { assessControlledTestRecipient } from "../send-email/utils/controlledTestRecipient.ts";
import {
  homeSeekersRecruitmentBranding,
  resolveHomeSeekersRecruitmentSender,
  HOME_SEEKERS_RECRUITMENT_REPLY_TO,
} from "../send-email/services/homeSeekersRecruitmentBranding.ts";

const organisationId = "2958d402-368e-43c9-b728-0098e10505f1";
const recipients = new Set([
  "thomas@homeseekers.co.za",
  "admin@homeseekers.co.za",
  "alex@arch9.co.za",
]);

export async function dispatchRecruitmentContacts(request: Request, {
  key,
  apiKey,
  admin,
  send = sendViaResendApi,
  branding = resolveEmailBranding,
  sender = resolveAudienceEmailSender,
  pause = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  key: string;
  apiKey: string;
  admin: any;
  send?: typeof sendViaResendApi;
  branding?: typeof resolveEmailBranding;
  sender?: typeof resolveAudienceEmailSender;
  pause?: (ms: number) => Promise<void>;
}) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  if (request.method !== "POST") return reply(405, { error: "POST required" });
  if (!key || request.headers.get("authorization") !== `Bearer ${key}`) {
    return reply(401, { error: "Server dispatch required" });
  }
  if (!admin || !apiKey) return reply(503, { error: "Dispatch unavailable" });
  // Only saved jobs determine the event, agency, applicant and recipients. The request body is ignored.
  const claimed = await admin.rpc("recruitment_claim_contact_notifications", {
    p_limit: 3,
  });
  if (claimed.error || !Array.isArray(claimed.data)) {
    return reply(503, { error: "Dispatch unavailable" });
  }
  let accepted = 0, pending = 0, suppressed = 0, providerAttempts = 0;
  for (const job of claimed.data) {
    const complete = (providerId: string | null, error: string | null) =>
      admin.rpc("recruitment_complete_contact_notification", {
        p_id: job.id,
        p_lease_id: job.lease_id,
        p_provider_id: providerId,
        p_error: error,
      });
    try {
      if (
        job.organisation_id !== organisationId ||
        !recipients.has(job.recipient) ||
        !["lead_received", "application_received", "documents_received", "contract_returned"]
          .includes(job.event_kind || "lead_received")
      ) {
        await complete(null, "invalid_saved_recipient");
        pending++;
        continue;
      }
      const contact = job.contact_json;
      if (
        assessControlledTestRecipient({
          email: contact?.email,
          recipientName: `${contact?.firstName || ""} ${
            contact?.lastName || ""
          }`,
        }).suppressed
      ) {
        const saved = await complete(null, "controlled_test_recipient");
        if (!saved.error && saved.data === true) suppressed++;
        else pending++;
        continue;
      }
      let message = job.message_json;
      if (!message || !Object.keys(message).length) {
        const resolved = homeSeekersRecruitmentBranding(
          await branding({
            supabase: admin,
            payload: {},
            organisationId,
            defaults: {
              organisationId,
              organisationName: "Home Seekers",
              primaryColor: "#f25c1f",
              secondaryColor: "#171717",
            },
          }),
        );
        const from = await resolveHomeSeekersRecruitmentSender({
          branding: resolved,
          supabase: admin,
          sender,
        });
        message = {
          from,
          to: job.recipient,
          ...buildRecruitmentContactNotification(
            job.lead_id,
            contact,
            resolved,
            job.event_kind || "lead_received",
          ),
        };
      }
      // Persist the exact provider payload before calling Resend, including on an uncertain retry.
      const prepared = await admin.rpc(
        "recruitment_prepare_contact_notification",
        { p_id: job.id, p_lease_id: job.lease_id, p_message: message },
      );
      if (
        prepared.error || prepared.data?.to !== job.recipient ||
        !prepared.data?.from || !prepared.data?.html || !prepared.data?.text ||
        !prepared.data?.subject
      ) {
        pending++;
        continue;
      }
      const frozen = prepared.data;
      // Space this lead's three requests rather than bursting them at the provider.
      if (providerAttempts > 0) await pause(600);
      providerAttempts++;
      const result = await send({
        apiKey,
        from: frozen.from,
        to: frozen.to,
        replyTo: HOME_SEEKERS_RECRUITMENT_REPLY_TO,
        subject: frozen.subject,
        html: frozen.html,
        text: frozen.text,
        idempotencyKey: `recruitment-contact/${job.id}`,
        timeoutMs: 10_000,
      });
      const providerId = result.ok && typeof result.data?.id === "string" &&
          result.data.id.trim()
        ? result.data.id
        : null;
      const permanent = !result.ok && result.status !== null &&
        result.status >= 400 && result.status < 500 &&
        ![408, 409, 429].includes(result.status);
      const saved = await complete(
        providerId,
        providerId
          ? null
          : permanent
          ? "provider_rejected"
          : "dispatch_unconfirmed",
      );
      if (providerId && !saved.error && saved.data === true) accepted++;
      else pending++;
    } catch {
      pending++; /* Recover the lease with the same frozen payload and provider idempotency key. */
    }
  }
  return reply(200, { accepted, pending, suppressed });
}
