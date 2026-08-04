import {
  type BridgeEmailSummaryField,
  escapeHtml,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import {
  type EmailBranding,
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { applyNotificationQueueControls } from "../services/notificationControls.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendWeeklyDigestNotificationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

const DIGEST_LABELS: Record<string, { title: string; subject: string }> = {
  agent_weekly_lead_digest: {
    title: "Weekly Lead Digest",
    subject: "Your weekly lead digest",
  },
  agent_weekly_transaction_digest: {
    title: "Weekly Transaction Digest",
    subject: "Your weekly transaction digest",
  },
  agent_weekly_task_digest: {
    title: "Weekly Task Digest",
    subject: "Your weekly task digest",
  },
  manager_weekly_team_digest: {
    title: "Weekly Team Digest",
    subject: "Your weekly team digest",
  },
  principal_weekly_business_digest: {
    title: "Weekly Business Digest",
    subject: "Your weekly business digest",
  },
  seller_weekly_listing_digest: {
    title: "Weekly Listing Digest",
    subject: "Your weekly listing digest",
  },
  buyer_weekly_transaction_digest: {
    title: "Weekly Transaction Digest",
    subject: "Your weekly transaction digest",
  },
  attorney_weekly_matter_digest: {
    title: "Weekly Matter Digest",
    subject: "Your weekly matter digest",
  },
  bond_originator_weekly_pipeline_digest: {
    title: "Weekly Bond Pipeline Digest",
    subject: "Your weekly bond pipeline digest",
  },
  commercial_weekly_pipeline_digest: {
    title: "Weekly Commercial Pipeline Digest",
    subject: "Your weekly commercial pipeline digest",
  },
};

const DISPATCH_TYPES = new Set([
  "weekly_digest_dispatch",
  "weekly_digest_resend",
  "weekly_digest_notifications_dispatch",
]);

function uuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
      .test(normalized)
    ? normalized
    : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

async function serviceClient() {
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const key = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !key) return null;
  const { createClient } = await import("supabase");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jwtRole(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1] || "";
  if (!payload) return "";
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return normalizeText(JSON.parse(atob(padded))?.role).toLowerCase();
  } catch {
    return "";
  }
}

function isServiceRequest(req: Request) {
  const authorization = normalizeText(req.headers.get("authorization"));
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  return Boolean(
    (serviceKey && authorization === `Bearer ${serviceKey}`) ||
      jwtRole(authorization) === "service_role",
  );
}

function normalizeDigestKind(payload: SendWeeklyDigestNotificationPayload) {
  const eventKind = firstText(
    payload.eventKind,
    payload.event_kind,
    payload.type,
  );
  if (eventKind === "weekly_digest_notification") {
    return "manager_weekly_team_digest";
  }
  return DIGEST_LABELS[eventKind] ? eventKind : "manager_weekly_team_digest";
}

function actionLinkFor(
  req: Request,
  payload: Record<string, unknown>,
  digestKind: string,
) {
  const direct = firstText(payload.actionLink, payload.action_link);
  if (direct) return direct;
  const appBaseUrl = resolveAppBaseUrl(req);
  if (!appBaseUrl) return "";
  if (digestKind.includes("lead")) return `${appBaseUrl}/leads`;
  if (digestKind.includes("transaction") || digestKind.includes("matter")) {
    return `${appBaseUrl}/transactions`;
  }
  if (digestKind.includes("task")) return `${appBaseUrl}/tasks`;
  if (digestKind.includes("listing")) return `${appBaseUrl}/private-listings`;
  if (digestKind.includes("bond")) return `${appBaseUrl}/finance`;
  if (digestKind.includes("commercial")) return `${appBaseUrl}/commercial`;
  return appBaseUrl;
}

function fieldValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return normalizeText(value);
}

function summaryFieldsFrom(
  payload: SendWeeklyDigestNotificationPayload,
  metadata: Record<string, unknown>,
) {
  const fields: BridgeEmailSummaryField[] = [];
  for (
    const item of [
      ...asArray(payload.summaryItems),
      ...asArray(metadata.summaryItems),
      ...asArray(metadata.summary_items),
    ]
  ) {
    const record = asRecord(item);
    const label = firstText(record.label, record.name);
    const value = fieldValue(record.value ?? record.count);
    if (label && value) fields.push({ label, value });
  }

  const metrics = {
    ...asRecord(metadata.metrics),
    ...asRecord(payload.metrics),
  };
  for (const [label, value] of Object.entries(metrics)) {
    const displayValue = fieldValue(value);
    if (label && displayValue) {
      fields.push({
        label: label.replaceAll("_", " "),
        value: displayValue,
      });
    }
  }

  const reportPeriod = firstText(
    payload.reportPeriod,
    payload.report_period,
    metadata.reportPeriod,
    metadata.report_period,
  );
  if (
    reportPeriod && !fields.some((field) => field.label === "Report Period")
  ) {
    fields.unshift({ label: "Report Period", value: reportPeriod });
  }
  return fields;
}

function renderDigestSections(
  sections: unknown[],
  fallbackTitle = "Highlights",
) {
  const normalized = sections
    .map((section) => {
      const record = asRecord(section);
      const title = firstText(record.title, record.heading) || fallbackTitle;
      const items = asArray(record.items).map((item) => {
        if (typeof item === "string") return { label: item, detail: "" };
        const itemRecord = asRecord(item);
        return {
          label: firstText(itemRecord.label, itemRecord.title, itemRecord.name),
          detail: firstText(
            itemRecord.detail,
            itemRecord.value,
            itemRecord.body,
          ),
        };
      }).filter((item) => item.label || item.detail);
      return { title, items };
    })
    .filter((section) => section.items.length);

  return normalized.map((section) => `
      <div style="margin: 16px 0; border-top: 1px solid #e2eaf4; padding-top: 16px;">
        <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">${
    escapeHtml(section.title)
  }</p>
        ${
    section.items.map((item) =>
      `<p style="margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #1f3347;"><strong>${
        escapeHtml(item.label || item.detail)
      }</strong>${
        item.label && item.detail ? `: ${escapeHtml(item.detail)}` : ""
      }</p>`
    ).join("")
  }
      </div>
    `).join("");
}

function textSections(sections: unknown[]) {
  return sections.flatMap((section) => {
    const record = asRecord(section);
    const title = firstText(record.title, record.heading);
    const items = asArray(record.items).map((item) => {
      if (typeof item === "string") return item;
      const itemRecord = asRecord(item);
      const label = firstText(
        itemRecord.label,
        itemRecord.title,
        itemRecord.name,
      );
      const detail = firstText(
        itemRecord.detail,
        itemRecord.value,
        itemRecord.body,
      );
      return label && detail ? `${label}: ${detail}` : label || detail;
    }).filter(Boolean);
    return items.length ? [title, ...items, ""] : [];
  }).filter(Boolean);
}

export function buildWeeklyDigestNotificationEmail({
  digestKind,
  recipientName,
  title,
  message,
  actionLink,
  ctaLabel,
  reportPeriod,
  summaryFields,
  sections,
  branding,
}: {
  digestKind: string;
  recipientName: string;
  title: string;
  message: string;
  actionLink?: string;
  ctaLabel?: string;
  reportPeriod?: string;
  summaryFields: BridgeEmailSummaryField[];
  sections: unknown[];
  branding: EmailBranding;
}) {
  const sectionHtml = renderDigestSections(sections);
  const html = renderBridgeEmailLayout({
    preheader: message,
    title,
    greeting: `Hi ${recipientName || "there"},`,
    contentHtml: [
      renderBridgeIntroParagraphs([message]),
      renderBridgeSummaryCard(summaryFields, "Weekly Summary"),
      sectionHtml,
      actionLink
        ? renderBridgeCta(ctaLabel || "Open Weekly Digest", actionLink, {
          primaryColor: branding.primaryColor,
        })
        : "",
    ].join(""),
    securityTitle: "Account Visibility",
    securityBody:
      "This weekly digest only includes account activity you are authorised to access.",
    helpBody:
      "Open the workspace for the underlying records, owners, due dates and next actions.",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    message,
    reportPeriod ? `Report period: ${reportPeriod}` : "",
    ...summaryFields.map((field) => `${field.label}: ${field.value}`),
    "",
    ...textSections(sections),
    actionLink ? `${ctaLabel || "Open Weekly Digest"}: ${actionLink}` : "",
    `Digest type: ${digestKind}`,
  ].filter(Boolean).join("\n");

  return { html, text };
}

function contentFromPayload(
  req: Request,
  payload: SendWeeklyDigestNotificationPayload,
  branding: EmailBranding,
) {
  const metadata = asRecord(payload.metadata);
  const digestKind = normalizeDigestKind(payload);
  const labels = DIGEST_LABELS[digestKind] ||
    DIGEST_LABELS.manager_weekly_team_digest;
  const merged = { ...(payload as Record<string, unknown>), ...metadata };
  const reportPeriod = firstText(
    payload.reportPeriod,
    payload.report_period,
    metadata.reportPeriod,
    metadata.report_period,
  );
  const subject = firstText(payload.subject, metadata.subject) ||
    (reportPeriod ? `${labels.subject}: ${reportPeriod}` : labels.subject);
  const title = firstText(payload.title, metadata.title) || labels.title;
  const message = firstText(payload.message, metadata.message) ||
    `Here is the weekly activity summary for ${
      reportPeriod || "your account"
    }.`;
  const summaryFields = summaryFieldsFrom(payload, metadata);
  const sections = [
    ...asArray(payload.sections),
    ...asArray(metadata.sections),
  ];
  const email = buildWeeklyDigestNotificationEmail({
    digestKind,
    recipientName: firstText(
      payload.recipientName,
      payload.recipient_name,
      metadata.recipientName,
    ),
    title,
    message,
    actionLink: actionLinkFor(req, merged, digestKind),
    ctaLabel: firstText(payload.ctaLabel, payload.cta_label, metadata.ctaLabel),
    reportPeriod,
    summaryFields,
    sections,
    branding,
  });
  return { ...email, digestKind, subject, messagePreview: message };
}

function payloadFromEvent(event: Record<string, unknown>) {
  const payload = asRecord(event.payload_json);
  const metadata = asRecord(event.metadata_json);
  return {
    ...payload,
    metadata,
    type: normalizeText(event.automation_key) || "weekly_digest_notification",
    eventKind: normalizeText(event.automation_key) ||
      normalizeText(event.event_key),
    to: normalizeText(event.recipient_email),
    subject: normalizeText(event.subject),
    message: normalizeText(event.message_preview),
    organisationId: normalizeText(event.organisation_id),
    recipientName: firstText(payload.recipientName, metadata.recipientName),
  } as SendWeeklyDigestNotificationPayload;
}

async function insertCommunicationDelivery(
  supabase: any,
  event: Record<string, unknown>,
  content: { subject: string; messagePreview: string },
  {
    status,
    providerMessageId = "",
    errorMessage = "",
  }: {
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorMessage?: string | null;
  },
) {
  const now = new Date().toISOString();
  const inserted = await supabase.from("communication_deliveries").insert({
    organisation_id: uuid(event.organisation_id),
    branch_id: uuid(event.branch_id) || null,
    lead_id: uuid(event.lead_id) || null,
    transaction_id: uuid(event.transaction_id) || null,
    communication_type: normalizeText(event.automation_key),
    automation_key: normalizeText(event.automation_key),
    notification_event_id: uuid(event.id),
    channel: "email",
    recipient: normalizeText(event.recipient_email).toLowerCase(),
    recipient_role: normalizeText(event.recipient_role).toLowerCase() || null,
    subject: content.subject,
    message_preview: content.messagePreview,
    status,
    provider: "resend",
    provider_message_id: normalizeText(providerMessageId) || null,
    error_message: normalizeText(errorMessage) || null,
    prepared_at: now,
    sent_at: status === "sent" ? now : null,
    failed_at: status === "failed" ? now : null,
    metadata_json: {
      source: "weekly_digest_notification",
      phase: "phase_7_weekly_digests",
      notificationEventId: event.id,
      automationKey: event.automation_key,
      dedupeKey: event.dedupe_key || null,
    },
  }).select("id").single();
  return inserted.error ? null : inserted.data;
}

async function dispatchQueuedEvents(
  req: Request,
  payload: SendWeeklyDigestNotificationPayload,
) {
  if (!isServiceRequest(req)) {
    return jsonResponse(403, {
      error:
        "Service role authorization is required for weekly digest dispatch.",
    });
  }
  const supabase = await serviceClient();
  if (!supabase) {
    return jsonResponse(500, {
      error: "Notification delivery is not configured.",
    });
  }
  await applyNotificationQueueControls(supabase, {
    limit: Math.max(1, Math.min(Number(payload.limit) || 25, 100)),
    now: normalizeText(payload.now),
    eventId: uuid(payload.eventId || payload.event_id),
  });

  let queued: unknown = null;
  if (payload.queueDue || payload.queue_due) {
    const queue = await supabase.rpc(
      "bridge_queue_weekly_digest_notifications_phase7",
      {
        p_now: firstText(payload.now) || null,
        p_limit: Math.max(
          1,
          Math.min(
            Number(payload.queueLimit || payload.queue_limit) || 500,
            2000,
          ),
        ),
        p_dry_run: Boolean(payload.dryRun || payload.dry_run),
      },
    );
    if (queue.error) return jsonResponse(500, { error: queue.error.message });
    queued = queue.data;
  }

  const claim = await supabase.rpc(
    "bridge_claim_weekly_digest_notifications_phase7",
    {
      p_event_id: uuid(payload.eventId || payload.event_id) || null,
      p_limit: Math.max(1, Math.min(Number(payload.limit) || 25, 100)),
    },
  );
  if (claim.error) return jsonResponse(500, { error: claim.error.message });

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  const results: Array<Record<string, unknown>> = [];
  for (const event of claim.data || []) {
    const eventPayload = payloadFromEvent(event);
    const branding = await resolveEmailBranding({
      supabase,
      payload: {
        ...asRecord(event.payload_json),
        ...asRecord(event.metadata_json),
      },
      organisationId: uuid(event.organisation_id),
      defaults: { organisationName: "Arch9" },
    });
    const content = contentFromPayload(req, eventPayload, branding);
    if (!resendApiKey) {
      const message = "Missing RESEND_API_KEY secret.";
      await supabase.from("notification_events").update({
        status: "failed",
        error_message: message,
        last_dispatch_error: message,
        failed_at: new Date().toISOString(),
        next_dispatch_attempt_at: new Date(Date.now() + 300_000).toISOString(),
      }).eq("id", event.id);
      results.push({ eventId: event.id, sent: false, error: message });
      continue;
    }

    const sendResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from: formatEmailSender(
        normalizeText(
          Deno.env.get("ARCH9_RESEND_FROM_EMAIL") ||
            Deno.env.get("RESEND_FROM_EMAIL"),
        ) || "Arch9 <onboarding@resend.dev>",
        branding.fromName || branding.organisationName,
      ),
      to: normalizeText(event.recipient_email).toLowerCase(),
      subject: content.subject,
      html: content.html,
      text: content.text,
      idempotencyKey: normalizeText(event.idempotency_key || event.dedupe_key),
      timeoutMs: 15_000,
    });

    if (sendResult.ok) {
      const providerId = normalizeText(sendResult.data?.id);
      const delivery = await insertCommunicationDelivery(
        supabase,
        event,
        content,
        { status: "sent", providerMessageId: providerId },
      );
      await supabase.from("notification_events").update({
        status: "sent",
        provider: "resend",
        provider_message_id: providerId || null,
        communication_delivery_id: delivery?.id || null,
        sent_at: new Date().toISOString(),
        error_message: null,
        last_dispatch_error: null,
        next_dispatch_attempt_at: null,
      }).eq("id", event.id);
      results.push({
        eventId: event.id,
        sent: true,
        providerMessageId: providerId || null,
      });
    } else {
      const message = normalizeText(sendResult.error?.message) ||
        "Resend rejected the weekly digest notification email.";
      const delivery = await insertCommunicationDelivery(
        supabase,
        event,
        content,
        { status: "failed", errorMessage: message },
      );
      const attempts = Number(event.dispatch_attempt_count) || 1;
      const exhausted = attempts >= (Number(event.max_dispatch_attempts) || 5);
      await supabase.from("notification_events").update({
        status: "failed",
        communication_delivery_id: delivery?.id || null,
        error_message: message,
        last_dispatch_error: message,
        failed_at: new Date().toISOString(),
        next_dispatch_attempt_at: exhausted
          ? null
          : new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000)
            .toISOString(),
      }).eq("id", event.id);
      results.push({
        eventId: event.id,
        sent: false,
        error: message,
        exhausted,
      });
    }
  }

  return jsonResponse(200, {
    success: true,
    queued,
    claimed: (claim.data || []).length,
    sent: results.filter((item) => item.sent === true).length,
    failed: results.filter((item) => item.sent !== true).length,
    results,
  });
}

export async function handleWeeklyDigestNotificationEmail(
  req: Request,
  payload: SendWeeklyDigestNotificationPayload,
) {
  const type = normalizeText(payload.type);
  if (DISPATCH_TYPES.has(type)) {
    return await dispatchQueuedEvents(req, payload);
  }

  const recipientEmail = normalizeText(payload.to).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const metadata = asRecord(payload.metadata);
  const branding = await resolveEmailBranding({
    payload: payload as Record<string, unknown>,
    organisationId: firstText(
      payload.organisationId,
      payload.organisation_id,
      metadata.organisationId,
      metadata.organisation_id,
    ),
    defaults: {
      organisationName: firstText(
        payload.organisationName,
        payload.organisation_name,
        metadata.organisationName,
        metadata.organisation_name,
      ) || "Arch9",
      supportEmail: firstText(metadata.supportEmail, metadata.support_email),
      supportPhone: firstText(metadata.supportPhone, metadata.support_phone),
    },
  });
  const content = contentFromPayload(req, payload, branding);
  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: formatEmailSender(
      normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
        "Arch9 <no-reply@arch9.co.za>",
      branding.fromName || branding.organisationName,
    ),
    to: recipientEmail,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sendResult.ok) {
    return jsonResponse(502, {
      error: "Resend rejected the weekly digest notification email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: content.digestKind,
    sent: true,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
