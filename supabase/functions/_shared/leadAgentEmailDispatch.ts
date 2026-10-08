import { buildLeadOperationsNotificationEmail } from "../send-email/handlers/leadOperationsNotification.ts";
import {
  resolveAudienceEmailSender,
  resolveEmailBranding,
} from "../send-email/services/emailBranding.ts";
import { sendViaResendApi } from "../send-email/services/resend.ts";
import { assessControlledTestRecipient } from "../send-email/utils/controlledTestRecipient.ts";
import { renderLeadAcknowledgementEnvelope } from "../send-email/handlers/leadAcknowledgement.ts";
import type { SupabaseClient } from "supabase";
import type { LeadEnquiryKind } from "../send-email/services/leadAcknowledgementContext.ts";
import { buildHomeSeekersSellerClientEmail } from "../send-email/content/homeSeekersSellerEnquiry.ts";
import {
  arch9ConciergeSender,
  HOME_SEEKERS_ORGANISATION_ID,
} from "../send-email/handlers/homeSeekersSellerEnquiry.ts";

type Json = Record<string, any>;
type Client = {
  rpc(name: string, args: Json): PromiseLike<{ data: any; error: any }>;
  from: any;
};
const text = (value: unknown) => String(value ?? "").trim();
type LeadEmailEnvelope = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  bcc?: string;
};

export async function renderLeadAgentEnvelope(
  client: Client,
  job: Json,
  appUrl: string,
): Promise<LeadEmailEnvelope> {
  const payload = job.payload_json as Json;
  if (job.kind === "client_intro") {
    if (
      job.organisation_id === HOME_SEEKERS_ORGANISATION_ID &&
      payload.enquiryKind === "seller" &&
      ["true", "1", "on", "enabled"].includes(
        (Deno.env.get("HOME_SEEKERS_SELLER_EMAILS_ENABLED") || "false").trim()
          .toLowerCase(),
      )
    ) {
      const content = buildHomeSeekersSellerClientEmail({
        sellerName: payload.leadName,
        sellerEmail: payload.to,
        propertyAddress: payload.propertyAddress,
        message: payload.originalMessage,
      });
      return {
        from: arch9ConciergeSender(
          Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
            Deno.env.get("RESEND_FROM_EMAIL") || "",
        ),
        to: payload.to,
        subject: content.subject,
        html: content.html,
        text: content.text,
        replyTo: "info@homeseeker.co.za",
      };
    }
    const envelope = await renderLeadAcknowledgementEnvelope(
      {
        type: "lead_acknowledgement",
        organisationId: job.organisation_id,
        leadId: job.lead_id,
        to: payload.to,
        recipientName: payload.leadName,
        source: payload.leadSource,
        originalMessage: payload.originalMessage,
        enquiryReceivedAt: payload.enquiryReceivedAt,
        agentName: payload.agentName,
        agentEmail: payload.agentEmail,
        agentPhone: payload.agentPhone,
        agentAvatarUrl: payload.agentAvatarUrl,
        agentJobTitle: payload.agentJobTitle,
      },
      client as unknown as SupabaseClient,
      payload.enquiryKind as LeadEnquiryKind,
    );
    // Agent alerts have their own durable job. Keep client delivery independent.
    return { ...envelope, bcc: undefined };
  }
  const branding = await resolveEmailBranding({
    supabase: client,
    organisationId: job.organisation_id,
  });
  const from = await resolveAudienceEmailSender({
    audience: "internal",
    branding,
    platformSender: text(
      Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
        Deno.env.get("RESEND_FROM_EMAIL"),
    ) || "Arch9 <no-reply@arch9.co.za>",
  });
  const source = text(payload.leadSource) || "Manual Entry";
  const agent = job.kind === "agent";
  const category = payload.rental
    ? "rental "
    : ["buyer", "seller"].includes(text(payload.leadCategory).toLowerCase())
    ? `${text(payload.leadCategory).toLowerCase()} `
    : "";
  const subject = agent
    ? `New ${category}lead: ${source}`
    : `Lead needs attention: ${source}`;
  const title = agent ? "A new lead just landed" : "A new lead needs your help";
  const message = agent
    ? `${text(payload.leadName) || "Someone new"} is your new ${category}lead${
      source === "Manual Entry" ? "" : ` from ${source}`
    }. Their details are ready below. Take a look and say hello.`
    : `${
      text(payload.leadName) || "A new lead"
    } needs follow-up. The agent email could not be delivered or no eligible agent is assigned. Please check the lead and make sure someone gets in touch.`;
  const actionLink = `${appUrl.replace(/\/+$/, "")}${
    payload.rental ? "/agent/rentals/pipeline/leads" : "/pipeline/leads"
  }/${encodeURIComponent(job.lead_id)}`;
  const content = buildLeadOperationsNotificationEmail({
    ...payload,
    eventKind: payload.eventKind,
    recipientName: text(payload.recipientName),
    title,
    message,
    actionLink,
    branding,
  });
  return {
    from,
    to: payload.to,
    subject,
    html: content.html,
    text: content.text,
  };
}

export async function dispatchLeadAgentEmails(client: Client, {
  apiKey,
  appUrl = "https://app.arch9.co.za",
  limit = 10,
  enabled = true,
  clientEnabled = true,
  send = sendViaResendApi,
  render = renderLeadAgentEnvelope,
}: {
  apiKey: string;
  appUrl?: string;
  limit?: number;
  enabled?: boolean;
  clientEnabled?: boolean;
  send?: typeof sendViaResendApi;
  render?: typeof renderLeadAgentEnvelope;
}) {
  const claim = await client.rpc("lead_agent_email_claim", {
    p_limit: Math.max(1, Math.min(limit, 10)),
  });
  if (claim.error) throw new Error("Unable to claim the lead email queue.");
  const results: Json[] = [];
  for (const job of claim.data || []) {
    let status = "failed",
      providerId: string | null = null,
      error = "Email delivery failed.";
    try {
      const safety = assessControlledTestRecipient({
        email: job.payload_json?.to,
        recipientName: job.payload_json?.leadName,
        metadata: job.payload_json?.metadata,
      });
      if (safety.suppressed) {
        status = "skipped";
        error = "controlled_test_recipient";
      } else {
        if (
          !(job.kind === "client_intro" ? clientEnabled : enabled) || !apiKey
        ) {
          throw new Error("Lead email delivery configuration is unavailable.");
        }
        const rendered = job.envelope_json || await render(client, job, appUrl);
        const frozen = await client.rpc("lead_agent_email_freeze", {
          p_id: job.id,
          p_claim_token: job.claim_token,
          p_envelope: rendered,
        });
        if (frozen.error || !frozen.data) {
          throw new Error("Unable to freeze the email request.");
        }
        const envelope = frozen.data;
        const delivered = await send({
          apiKey,
          ...envelope,
          idempotencyKey: `lead-agent-email:${job.id}`,
          timeoutMs: 10_000,
        });
        providerId = delivered.ok && typeof delivered.data?.id === "string"
          ? text(delivered.data.id) || null
          : null;
        if (!delivered.ok || !providerId) {
          throw new Error("The email provider has not confirmed acceptance.");
        }
        status = "sent";
        error = "";
      }
    } catch (cause) {
      // Never store provider bodies, credentials or contact data in errors.
      error =
        cause instanceof Error && /configuration|freeze/.test(cause.message)
          ? cause.message
          : "Email delivery is unconfirmed and will be retried.";
    }
    const completed = await Promise.resolve(
      client.rpc("lead_agent_email_complete", {
        p_id: job.id,
        p_claim_token: job.claim_token,
        p_status: status,
        p_provider_message_id: providerId,
        p_error: error || null,
      }),
    ).catch(() => ({ data: null, error: true }));
    results.push({
      jobId: job.id,
      status: completed.error ? "claim_recovery_required" : status,
    });
  }
  return { claimed: results.length, results };
}

export async function handleLeadAgentEmailDispatcher(
  request: Request,
  configuration: {
    serviceRoleKey: string;
    apiKey: string;
    appUrl?: string;
    enabled?: boolean;
    clientEnabled?: boolean;
    client: Client | null;
  },
  dispatch = dispatchLeadAgentEmails,
) {
  const token = text(request.headers.get("authorization")).replace(
    /^Bearer\s+/i,
    "",
  );
  if (!configuration.serviceRoleKey || token !== configuration.serviceRoleKey) {
    return Response.json({ error: "Service authorization is required." }, {
      status: 403,
    });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "POST is required." }, { status: 405 });
  }
  if (!configuration.client) {
    return Response.json({ error: "Queue configuration is unavailable." }, {
      status: 503,
    });
  }
  let body: Json;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "A JSON object is required." }, {
      status: 400,
    });
  }
  try {
    const result = await dispatch(configuration.client, {
      ...configuration,
      limit: Math.max(1, Math.min(Number(body.limit) || 10, 10)),
    });
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ error: "Lead email queue processing failed." }, {
      status: 503,
    });
  }
}
