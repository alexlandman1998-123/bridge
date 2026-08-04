import { buildReminderEmail } from "./notificationReminderDispatch.ts";

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
