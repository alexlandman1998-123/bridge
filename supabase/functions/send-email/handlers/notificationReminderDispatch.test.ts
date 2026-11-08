import { buildReminderEmail, isObsoleteBondApplicationReminder } from "./notificationReminderDispatch.ts";

function assertIncludes(source: string, expected: string, message?: string) {
  if (!source.includes(expected)) {
    throw new Error(message || `Expected output to include ${expected}`);
  }
}

const branding = {
  organisationName: "Kingstons Property",
  logoUrl: "https://cdn.example.test/kingstons.png",
  primaryColor: "#123abc",
  secondaryColor: "#fedcba",
  supportEmail: "support@example.test",
  supportPhone: "+27 21 000 0000",
};

Deno.test("tracker keeps manual progress links and suppresses scheduled application-completion nudges", () => {
  const event = { id: "tracker", automation_key: "bond_application_portal_completion_reminder", organisation_id: null };
  if (!isObsoleteBondApplicationReminder(event) ||
    !isObsoleteBondApplicationReminder({ ...event, trigger_type: "scheduled_reminder" }) ||
    isObsoleteBondApplicationReminder({ ...event, metadata_json: { deliveryKind: "manual" } }) ||
    isObsoleteBondApplicationReminder({ ...event, trigger_type: "manual_send" }) ||
    isObsoleteBondApplicationReminder({ ...event, automation_key: "buyer_onboarding_reminder" })) {
    throw new Error("Only obsolete application-completion reminders should be suppressed.");
  }
  const content = buildReminderEmail({ ...event, subject: "Complete your bond application", message_preview: "Sign and complete now", payload_json: { accessToken: "tracker-link" } }, new Request("https://functions.example.test/send-email", { headers: { origin: "https://app.example.test" } }), branding);
  if (content.subject !== "View your bond progress" || /Sign and complete|Complete your bond application/i.test(content.html + content.text)) {
    throw new Error("Historical queued links must use current tracker wording.");
  }
  assertIncludes(content.html, "View bond progress");
  assertIncludes(content.text, "tracker-link");
});

Deno.test("lead SLA reminder template uses branded reminder shell", () => {
  const { html, text } = buildReminderEmail(
    {
      id: "event-1",
      automation_key: "lead_first_response_sla_reminder",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      lead_id: "00000000-0000-4000-8000-000000000002",
      recipient_email: "agent@example.test",
      recipient_role: "agent",
      subject: "First response SLA due soon",
      message_preview: "Buyer One is approaching the first-response SLA.",
      payload_json: {
        leadName: "Buyer One",
        leadEmail: "buyer@example.test",
        leadPhone: "+27 21 000 0000",
        leadSource: "Website",
        leadStatus: "New Lead",
        slaDueAt: "2026-08-03T12:00:00.000Z",
      },
      metadata_json: {
        organisationName: "Kingstons Property",
      },
    },
    new Request("https://functions.example.test/send-email", {
      headers: { origin: "https://app.example.test" },
    }),
    branding,
  );

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "First response SLA due soon");
  assertIncludes(html, "Lead SLA");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "Open Lead:");
});

Deno.test("manual seller document reminder uses the secure document request template", () => {
  const { html, text } = buildReminderEmail(
    {
      id: "event-2",
      automation_key: "seller_document_manual_reminder",
      organisation_id: "00000000-0000-4000-8000-000000000001",
      listing_id: "00000000-0000-4000-8000-000000000003",
      recipient_email: "trustee@example.test",
      recipient_role: "seller",
      subject: "Reminder: trustee identity required",
      message_preview: "Please upload the outstanding document.",
      payload_json: {
        requirementName: "Trustee identity",
        recipientName: "Trustee One",
        sellerWorkspaceToken: "seller-token",
      },
      metadata_json: {},
    },
    new Request("https://functions.example.test/send-email", {
      headers: { origin: "https://app.example.test" },
    }),
    branding,
  );

  assertIncludes(html, "Trustee identity");
  assertIncludes(html, "Upload Document");
  assertIncludes(text, "/client/seller-token/selling/documents");
});
