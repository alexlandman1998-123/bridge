import { buildClientJourneyEmail, CLIENT_JOURNEY_EMAIL_KINDS } from "./clientJourneyEmails.ts";
import { normalizeEmailBranding } from "../services/emailBranding.ts";

const branding = normalizeEmailBranding({
  organisationName: "Home Seekers",
  logoLightUrl: "https://cdn.example.test/home-seekers.png",
  primaryColor: "#202020",
  secondaryColor: "#f47a35",
  supportEmail: "hello@example.test",
});

Deno.test("every client journey email uses the agency shell and human copy", () => {
  for (const kind of CLIENT_JOURNEY_EMAIL_KINDS) {
    const content = buildClientJourneyEmail({
      kind,
      recipientName: "Alex Landman",
      propertyLabel: "12 Ocean Road",
      agentName: "Mia",
      actionUrl: "https://app.example.test/portal",
      appointmentWhen: "Tuesday at 10:00",
      appointmentWhere: "12 Ocean Road",
      documentCount: 2,
      branding,
    });
    if (!content.subject || !content.text.includes("Hi Alex,")) {
      throw new Error(`${kind} needs a personal subject and greeting`);
    }
    if (!content.html.includes("home-seekers.png") ||
      !content.html.includes("class=\"arch9-shell\"") ||
      !content.html.includes("https://app.example.test/portal")) {
      throw new Error(`${kind} is missing agency branding or its action`);
    }
    if (/\boffer\b|\botp\b/i.test(`${content.subject} ${content.text}`)) {
      throw new Error(`${kind} must not refer to the retired offer workflow`);
    }
  }
});

Deno.test("seller enquiry acknowledgement works before a portal link exists", () => {
  const content = buildClientJourneyEmail({
    kind: "seller_enquiry_received",
    recipientName: "Alex Landman",
    propertyLabel: "12 Ocean Road",
    branding,
  });
  if (!content.text.includes("You do not need to fill in anything else")) {
    throw new Error("Seller enquiry email should set a clear expectation");
  }
  if (content.html.includes("href=\"\"")) {
    throw new Error("Seller enquiry email must not render an empty action");
  }
});

Deno.test("document receipt confirms arrival without claiming approval", () => {
  const content = buildClientJourneyEmail({
    kind: "client_documents_received",
    recipientName: "Alex Landman",
    documentCount: 2,
    actionUrl: "https://app.example.test/documents",
    branding,
  });
  if (!content.text.includes("Both of your documents arrived safely") ||
    !content.text.includes("will review what you sent") ||
    /approved|verified/i.test(content.text)) {
    throw new Error("Document receipt must distinguish arrival from review");
  }
});
