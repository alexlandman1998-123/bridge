import {
  buildWebsiteLeadEmailPayload,
  isWebsiteLeadFallback,
  shouldPrepareWebsiteLeadFallback,
  websiteLeadDeliveryStatus,
  websiteLeadProviderMessageId,
  websiteLeadReceiptId,
} from "./websiteLeadDispatch.ts";

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const primary = {
  id: "11111111-1111-4111-8111-111111111111",
  organisation_id: "22222222-2222-4222-8222-222222222222",
  lead_id: "33333333-3333-4333-8333-333333333333",
  event_key: "new_enquiry_assigned_agent",
  recipient_email: " AGENT@EXAMPLE.COM ",
  dedupe_key: "website-lead:receipt:primary",
  payload_json: {
    recipientName: "Pilot Agent",
    leadName: "Pilot Buyer",
    leadEmail: "buyer@example.com",
    leadPhone: "+27 82 000 0000",
    leadCategory: "buyer",
    propertyLabel: "12 Pilot Road",
  },
  metadata_json: {
    websiteSubmissionId: "44444444-4444-4444-8444-444444444444",
  },
};

Deno.test("website lead dispatcher builds a tenant-bound provider payload", () => {
  const payload = buildWebsiteLeadEmailPayload(
    primary,
    "https://app.example.com/",
  );
  expect(payload.to === "agent@example.com", "recipient should be normalized");
  expect(
    payload.actionLink ===
      "https://app.example.com/pipeline/leads/33333333-3333-4333-8333-333333333333",
    "lead action should point to the CRM",
  );
  expect(
    payload.idempotencyKey === "website-lead:receipt:primary",
    "provider retries should retain one idempotency key",
  );
  expect(
    payload.metadata.websiteSubmissionId ===
      "44444444-4444-4444-8444-444444444444",
    "receipt identity should be retained",
  );
});

Deno.test("website lead dispatcher distinguishes provider outcomes", () => {
  expect(
    websiteLeadDeliveryStatus({ sent: true }) === "sent",
    "sent should be terminal",
  );
  expect(
    websiteLeadDeliveryStatus({ sent: false, suppressed: true }) === "skipped",
    "controlled suppression should be auditable",
  );
  expect(
    websiteLeadProviderMessageId({ providerResponse: { id: "resend-1" } }) ===
      "resend-1",
    "provider receipt should be captured",
  );
});

Deno.test("website lead dispatcher only escalates a terminal assigned-agent failure", () => {
  expect(
    shouldPrepareWebsiteLeadFallback(primary, { terminal: true }),
    "terminal primary failure should escalate",
  );
  expect(
    !shouldPrepareWebsiteLeadFallback(primary, { terminal: false }),
    "scheduled retry should not escalate yet",
  );
  const fallback = {
    ...primary,
    metadata_json: {
      websiteSubmissionId: websiteLeadReceiptId(primary),
      fallbackForEventId: primary.id,
    },
  };
  expect(
    isWebsiteLeadFallback(fallback),
    "fallback identity should be explicit",
  );
  expect(
    !shouldPrepareWebsiteLeadFallback(fallback, { terminal: true }),
    "fallback failures must not recurse",
  );
});
