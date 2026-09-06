export type JsonRecord = Record<string, unknown>;

export type WebsiteLeadNotificationEvent = {
  id?: unknown;
  organisation_id?: unknown;
  lead_id?: unknown;
  event_key?: unknown;
  recipient_email?: unknown;
  recipient_role?: unknown;
  dedupe_key?: unknown;
  idempotency_key?: unknown;
  payload_json?: unknown;
  metadata_json?: unknown;
};

export function websiteLeadText(value: unknown, maximum = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function websiteLeadRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function websiteLeadErrorMessage(error: unknown) {
  if (error instanceof Error) return websiteLeadText(error.message, 1000);
  const record = websiteLeadRecord(error);
  return websiteLeadText(record.message || record.error || error, 1000) ||
    "Website lead notification delivery failed.";
}

export function websiteLeadProviderMessageId(payload: unknown) {
  const body = websiteLeadRecord(payload);
  const provider = websiteLeadRecord(body.providerResponse);
  return websiteLeadText(provider.id, 500) ||
    websiteLeadText(body.providerMessageId || body.emailId, 500) || null;
}

export function websiteLeadDeliveryStatus(payload: unknown) {
  const body = websiteLeadRecord(payload);
  return body.sent === false || body.suppressed === true ? "skipped" : "sent";
}

export function websiteLeadReceiptId(event: WebsiteLeadNotificationEvent) {
  return websiteLeadText(
    websiteLeadRecord(event.metadata_json).websiteSubmissionId,
    64,
  );
}

export function isWebsiteLeadFallback(event: WebsiteLeadNotificationEvent) {
  return Boolean(
    websiteLeadText(
      websiteLeadRecord(event.metadata_json).fallbackForEventId,
      64,
    ),
  );
}

export function shouldPrepareWebsiteLeadFallback(
  event: WebsiteLeadNotificationEvent,
  completion: unknown,
) {
  const result = websiteLeadRecord(completion);
  return result.terminal === true &&
    !isWebsiteLeadFallback(event) &&
    websiteLeadText(event.event_key, 80) === "new_enquiry_assigned_agent";
}

export function buildWebsiteLeadEmailPayload(
  event: WebsiteLeadNotificationEvent,
  appUrl = "https://app.arch9.co.za",
) {
  const payload = websiteLeadRecord(event.payload_json);
  const metadata = websiteLeadRecord(event.metadata_json);
  const eventKind = websiteLeadText(
    payload.eventKind || event.event_key,
    80,
  );
  const leadId = websiteLeadText(event.lead_id, 64);
  return {
    type: eventKind,
    eventKind,
    to: websiteLeadText(event.recipient_email, 254).toLowerCase(),
    recipientName: websiteLeadText(payload.recipientName, 160) || undefined,
    organisationId: websiteLeadText(event.organisation_id, 64),
    leadId,
    leadName: websiteLeadText(payload.leadName, 160) || undefined,
    leadEmail: websiteLeadText(payload.leadEmail, 254).toLowerCase() ||
      undefined,
    leadPhone: websiteLeadText(payload.leadPhone, 64) || undefined,
    leadSource: "Website",
    leadCategory: websiteLeadText(payload.leadCategory, 80) || undefined,
    leadStatus: "New Lead",
    propertyLabel: websiteLeadText(payload.propertyLabel, 300) || undefined,
    actionLink: leadId
      ? `${appUrl.replace(/\/$/, "")}/pipeline/leads/${leadId}`
      : undefined,
    idempotencyKey: websiteLeadText(
      event.idempotency_key || event.dedupe_key ||
        `website-lead:${websiteLeadText(event.id, 64)}`,
      200,
    ),
    metadata: {
      websiteSubmissionId: websiteLeadText(metadata.websiteSubmissionId, 64) ||
        undefined,
      dispatchContract: "website-lead-dispatch-v1",
    },
  };
}
