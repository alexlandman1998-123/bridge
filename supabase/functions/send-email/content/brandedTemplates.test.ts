import {
  buildAppointmentEmailHtml,
  buildAppointmentEmailText,
} from "./appointment.ts";
import {
  buildBuyerViewingAvailabilityRequestEmailHtml,
  buildBuyerViewingAvailabilityRequestEmailText,
} from "./viewingAvailabilityRequest.ts";
import {
  buildSellerViewingAvailabilityRequestEmailHtml,
  buildSellerViewingAvailabilityRequestEmailText,
} from "./sellerViewingAvailabilityRequest.ts";
import { buildOnboardingEmailHtml } from "./onboarding.ts";
import {
  buildReservationDepositEmailHtml,
  buildReservationDepositEmailText,
} from "./reservationDeposit.ts";
import { buildAdditionalDocumentRequestEmail } from "../handlers/additionalDocumentRequest.ts";
import { buildLeadOperationsNotificationEmail } from "../handlers/leadOperationsNotification.ts";
import { buildPublicDemoEnquiryEmail } from "../handlers/publicDemoEnquiry.ts";
import { buildTransactionOperationsNotificationEmail } from "../handlers/transactionOperationsNotification.ts";
import { buildClientSellerPortalNotificationEmail } from "../handlers/clientSellerPortalNotification.ts";
import { buildBondAttorneyLegalNotificationEmail } from "../handlers/bondAttorneyLegalNotification.ts";
import { buildWeeklyDigestNotificationEmail } from "../handlers/weeklyDigestNotification.ts";
import { buildCommercialEnterpriseNotificationEmail } from "../handlers/commercialEnterpriseNotification.ts";
import { buildSellerOnboardingEmailHtml } from "./sellerOnboarding.ts";
import { buildSellerOnboardingSubmittedSellerEmailHtml } from "./sellerOnboardingSubmitted.ts";

function assertIncludes(source: string, expected: string, message?: string) {
  if (!source.includes(expected)) {
    throw new Error(message || `Expected output to include ${expected}`);
  }
}

function assertNotIncludes(source: string, expected: string, message?: string) {
  if (source.includes(expected)) {
    throw new Error(message || `Expected output not to include ${expected}`);
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

Deno.test("buyer onboarding template renders company branding and branded CTA", () => {
  const html = buildOnboardingEmailHtml({
    buyerName: "Buyer One",
    developmentName: "Harbour View",
    unitLabel: "Unit 12",
    purchasePrice: "R 1 500 000",
    onboardingUrl: "https://app.example.test/onboarding",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "https://cdn.example.test/kingstons.png");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "border-bottom: 4px solid #fedcba");
  assertIncludes(html, "Kingstons Property · Powered by Arch9");
});

Deno.test("seller onboarding portal template renders company branding", () => {
  const html = buildSellerOnboardingEmailHtml({
    sellerName: "Seller One",
    propertyTitle: "12 Ocean Road",
    onboardingLink: "https://app.example.test/seller",
    emailKind: "portal_documents",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "Set Password &amp; Upload Documents");
});

Deno.test("seller onboarding invitation template renders company branding while preserving invitation copy", () => {
  const html = buildSellerOnboardingEmailHtml({
    sellerName: "Seller One",
    propertyTitle: "12 Ocean Road",
    onboardingLink: "https://app.example.test/seller",
    agentName: "Agent One",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "https://cdn.example.test/kingstons.png");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "color: #fedcba");
  assertIncludes(
    html,
    "has prepared a secure seller intake for your property sale",
  );
  assertNotIncludes(html, ">ARCH9<");
});

Deno.test("seller onboarding invitation uses dark-header logo variant", () => {
  const html = buildSellerOnboardingEmailHtml({
    sellerName: "Seller One",
    propertyTitle: "12 Ocean Road",
    onboardingLink: "https://app.example.test/seller",
    branding: {
      organisationName: "Kingstons Property",
      logoUrl: "https://cdn.example.test/logo-generic.png",
      logoLightUrl: "https://cdn.example.test/logo-light-background.png",
      logoDarkUrl: "https://cdn.example.test/logo-dark-header.png",
      primaryColor: "#123abc",
      secondaryColor: "#fedcba",
    },
  });

  assertIncludes(html, "https://cdn.example.test/logo-dark-header.png");
  assertNotIncludes(html, "https://cdn.example.test/logo-light-background.png");
});

Deno.test("seller submitted confirmation template renders branded seller portal CTA", () => {
  const html = buildSellerOnboardingSubmittedSellerEmailHtml({
    sellerName: "Seller One",
    propertyTitle: "12 Ocean Road",
    portalLink: "https://app.example.test/seller",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "Open seller portal");
});

Deno.test("appointment template renders branded host guidance and RSVP buttons", () => {
  const html = buildAppointmentEmailHtml({
    eventType: "appointment_confirmation_required",
    recipientName: "Buyer One",
    appointmentType: "Viewing",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    acceptLink: "https://app.example.test/accept",
    declineLink: "https://app.example.test/decline",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "color: #123abc");
  assertIncludes(html, "What to expect");
  assertIncludes(html, "Alex Landman");
  assertIncludes(html, "Calendar invite");
  assertIncludes(html, "We’ll walk through the property");
});

Deno.test("appointment template renders the Kingstons valuation invite experience", () => {
  const html = buildAppointmentEmailHtml({
    eventType: "appointment_confirmation_required",
    recipientName: "Seller One",
    appointmentType: "seller_valuation",
    appointmentTitle: "Valuation Appointment - Seller One",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    agentBio: "Specialist in residential sales across the local market.",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    actionLink: "https://app.example.test/appointment-rsvp/token-123",
    acceptLink: "https://app.example.test/accept",
    rescheduleLink: "https://app.example.test/reschedule",
    branding,
  });
  const text = buildAppointmentEmailText({
    eventType: "appointment_confirmation_required",
    recipientName: "Seller One",
    appointmentType: "seller_valuation",
    appointmentTitle: "Valuation Appointment - Seller One",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    agentBio: "Specialist in residential sales across the local market.",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    actionLink: "https://app.example.test/appointment-rsvp/token-123",
  });

  assertIncludes(html, "Kingstons Valuation Request");
  assertIncludes(html, "Your valuation appointment is ready for confirmation.");
  assertIncludes(html, "Confirm appointment");
  assertIncludes(html, "Property valuation");
  assertIncludes(html, "Valuation prepared");
  assertIncludes(html, "Before we meet");
  assertIncludes(
    html,
    "Specialist in residential sales across the local market.",
  );
  assertIncludes(html, "https://app.example.test/appointment-rsvp/token-123");
  assertIncludes(text, "Kingstons Valuation Request");
  assertIncludes(text, "This is your agent");
  assertIncludes(text, "This is our agency");
  assertIncludes(text, "This is what to expect");
  assertIncludes(
    text,
    "RSVP to this time: https://app.example.test/appointment-rsvp/token-123",
  );
  assertIncludes(
    text,
    "Specialist in residential sales across the local market.",
  );
});

Deno.test("appointment template renders the Kingstons valuation presentation invite experience", () => {
  const html = buildAppointmentEmailHtml({
    eventType: "appointment_confirmation_required",
    recipientName: "Seller One",
    appointmentType: "valuation_presentation",
    appointmentTitle: "Valuation Presentation - Seller One",
    appointmentDate: "2026-07-30",
    appointmentTime: "14:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    actionLink: "https://app.example.test/appointment-rsvp/token-456",
    acceptLink: "https://app.example.test/accept",
    branding,
  });
  const text = buildAppointmentEmailText({
    eventType: "appointment_confirmation_required",
    recipientName: "Seller One",
    appointmentType: "valuation_presentation",
    appointmentTitle: "Valuation Presentation - Seller One",
    appointmentDate: "2026-07-30",
    appointmentTime: "14:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    actionLink: "https://app.example.test/appointment-rsvp/token-456",
  });

  assertIncludes(html, "Kingstons Valuation Presentation Request");
  assertIncludes(html, "Your valuation presentation is ready for confirmation.");
  assertIncludes(html, "Confirm presentation");
  assertIncludes(html, "Review the valuation");
  assertIncludes(html, "Seller pack next steps");
  assertIncludes(text, "Kingstons Valuation Presentation Request");
  assertIncludes(text, "Seller Pack stage");
  assertIncludes(
    text,
    "RSVP to this time: https://app.example.test/appointment-rsvp/token-456",
  );
});

Deno.test("appointment template preserves notes and branded plain-text support", () => {
  const html = buildAppointmentEmailHtml({
    eventType: "appointment_confirmation_required",
    recipientName: "Buyer One",
    appointmentType: "Viewing",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    notes: `<script>alert("x")</script> Bring ID.`,
    acceptLink: `https://app.example.test/accept?next="quoted"`,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });
  const text = buildAppointmentEmailText({
    eventType: "appointment_confirmation_required",
    recipientName: "Buyer One",
    appointmentType: "Viewing",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    participantRole: "seller",
    agentName: "Alex Landman",
    agentRole: "Property Consultant",
    organisationName: branding.organisationName,
    attachCalendarInvite: true,
    notes: "Bring ID.",
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
  });

  assertIncludes(
    html,
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Bring ID.",
  );
  assertIncludes(html, "next=&quot;quoted&quot;");
  assertNotIncludes(html, `<script>alert("x")</script>`);
  assertIncludes(text, "Support: support@example.test | +27 21 000 0000");
  assertIncludes(text, "Kingstons Property");
  assertIncludes(
    text,
    "Host: Alex Landman, Property Consultant at Kingstons Property",
  );
  assertIncludes(text, "Calendar invite: Attached");
  assertIncludes(text, "Powered by Arch9");
});

Deno.test("buyer viewing availability request renders company branding and property list", () => {
  const html = buildBuyerViewingAvailabilityRequestEmailHtml({
    buyerName: "Buyer One",
    agentName: "Agent One",
    properties: [
      {
        title: "114 West Street",
        price: "R 1 250 000",
        area: "Brooklyn, Lynnwood",
        match: "72%",
        imageUrl: "https://cdn.example.test/listings/114.jpg",
        link: "https://app.example.test/listings/114",
      },
      {
        title: "115 Paul Kruger Street",
        price: "R 1 300 000",
        area: "Brooklyn, Lynnwood",
      },
    ],
    actionLink: "https://app.example.test/viewing-preferences/token-123",
    branding,
  });
  const text = buildBuyerViewingAvailabilityRequestEmailText({
    buyerName: "Buyer One",
    agentName: "Agent One",
    properties: [{ title: "114 West Street", price: "R 1 250 000" }],
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    actionLink: "https://app.example.test/viewing-preferences/token-123",
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "border-bottom: 4px solid #fedcba");
  assertIncludes(html, "Viewing Options");
  assertIncludes(html, "Confirm viewings");
  assertIncludes(
    html,
    "https://app.example.test/viewing-preferences/token-123",
  );
  assertIncludes(html, "114 West Street");
  assertIncludes(html, "https://cdn.example.test/listings/114.jpg");
  assertIncludes(html, `alt="114 West Street"`);
  assertIncludes(html, "View property details");
  assertIncludes(text, "Confirm your preferred viewings here:");
  assertIncludes(text, "Or reply with:");
  assertIncludes(text, "Support: support@example.test | +27 21 000 0000");
});

Deno.test("seller viewing availability request renders company branding and access instructions", () => {
  const html = buildSellerViewingAvailabilityRequestEmailHtml({
    sellerName: "Seller One",
    buyerName: "Buyer One",
    agentName: "Agent One",
    availabilityWindows: "Saturday 10:00-12:00\nMonday 15:00-16:00",
    coordinationNotes: "Please confirm gate access.",
    properties: [
      {
        title: "114 West Street",
        price: "R 1 250 000",
        area: "Brooklyn, Lynnwood",
        link: "https://app.example.test/listings/114",
      },
    ],
    branding,
  });
  const text = buildSellerViewingAvailabilityRequestEmailText({
    sellerName: "Seller One",
    buyerName: "Buyer One",
    agentName: "Agent One",
    availabilityWindows: "Saturday 10:00-12:00",
    properties: [{ title: "114 West Street", price: "R 1 250 000" }],
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "border-bottom: 4px solid #fedcba");
  assertIncludes(html, "Seller Viewing Availability");
  assertIncludes(html, "Properties To Confirm");
  assertIncludes(html, "114 West Street");
  assertIncludes(html, "Buyer availability");
  assertIncludes(text, "Please reply with:");
  assertIncludes(text, "Support: support@example.test | +27 21 000 0000");
});

Deno.test("reservation deposit template uses shared branded shell", () => {
  const html = buildReservationDepositEmailHtml({
    buyerName: "Buyer One",
    buyerEmail: "buyer@example.test",
    developmentName: "Harbour View",
    unitLabel: "Unit 12",
    transactionReference: "TX-12",
    reservationDepositEnabled: true,
    reservationDepositAmount: 25000,
    formattedReservationDepositAmount: "R 25 000",
    paymentReference: "HV-12",
    accountName: "Kingstons Trust",
    bankName: "Example Bank",
    accountNumber: "123456789",
    branchCode: "123456",
    accountType: "Current",
    paymentInstructions: "Use the exact reference.",
    uploadProofLink: "https://app.example.test/upload",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Reservation Deposit");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "Banking Details");
  assertNotIncludes(html, ">BRIDGE<");
});

Deno.test("reservation deposit text preserves upload instructions and support", () => {
  const text = buildReservationDepositEmailText({
    buyerName: "Buyer One",
    buyerEmail: "buyer@example.test",
    developmentName: "Harbour View",
    unitLabel: "Unit 12",
    transactionReference: "TX-12",
    reservationDepositEnabled: true,
    reservationDepositAmount: 25000,
    formattedReservationDepositAmount: "R 25 000",
    paymentReference: "HV-12",
    accountName: "Kingstons Trust",
    bankName: "Example Bank",
    accountNumber: "123456789",
    branchCode: "123456",
    accountType: "Current",
    paymentInstructions: "",
    uploadProofLink: "",
    organisationName: branding.organisationName,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
    branding,
  });

  assertIncludes(
    text,
    "3. Upload your proof of payment in the Documents section of your onboarding portal.",
  );
  assertNotIncludes(
    text,
    "3. Upload your proof of payment using the provided link.",
  );
  assertIncludes(text, "Support: support@example.test | +27 21 000 0000");
  assertIncludes(text, "Kingstons Property");
  assertIncludes(text, "Powered by Arch9");
});

Deno.test("additional document request template uses dedicated branded shell", () => {
  const { html, text } = buildAdditionalDocumentRequestEmail({
    recipientName: "Buyer One",
    title: "Document requested",
    message: "Please upload proof of residence for your transaction.",
    transactionId: "TX-12",
    actionLink: "https://app.example.test/client/documents",
    metadata: {
      documentTitle: "Proof of residence",
      requestedFrom: "buyer",
      requestedBy: "Agent",
      propertyLabel: "12 Ocean Road",
      dueDate: "2026-08-10",
    },
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Document Request");
  assertIncludes(html, "Proof of residence");
  assertIncludes(html, "background: #123abc");
  assertNotIncludes(html, "Bond application update");
  assertIncludes(text, "Requested document: Proof of residence");
});

Deno.test("public demo enquiry template uses shared Arch9 shell", () => {
  const { html, text } = buildPublicDemoEnquiryEmail({
    fullName: "Demo Lead",
    role: "Agency Principal",
    company: "Demo Realty",
    email: "lead@example.test",
    phone: "+27 21 000 0000",
    businessSize: "20 agents",
    monthlyVolume: "15 deals",
    demoFocus: ["Lead management", "Transactions"],
    preferredWindow: ["This week"],
    biggestFrustration: "Manual follow-up",
    pageUrl: "https://arch9.co.za/demo",
    adminUrl: "https://app.arch9.co.za/platform/demo-enquiries",
    submittedAt: "2026-08-03T10:00:00.000Z",
  });

  assertIncludes(html, "New Demo Enquiry");
  assertIncludes(html, "Arch9");
  assertIncludes(html, "background: #07152f");
  assertIncludes(html, "Open In Arch9 Admin");
  assertNotIncludes(html, "border-radius:999px");
  assertIncludes(text, "New Arch9 demo enquiry: Demo Lead");
});

Deno.test("lead operations template uses branded shell", () => {
  const { html, text } = buildLeadOperationsNotificationEmail({
    eventKind: "new_enquiry_assigned_agent",
    recipientName: "Agent One",
    title: "New Enquiry Assigned",
    message: "A new buyer enquiry has been assigned to you.",
    actionLink: "https://app.example.test/leads/lead-1",
    leadName: "Buyer One",
    leadEmail: "buyer@example.test",
    leadPhone: "+27 21 000 0000",
    leadSource: "Website",
    leadCategory: "buyer",
    leadStatus: "New Lead",
    propertyLabel: "12 Ocean Road",
    assignedAgentName: "Agent One",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "New Enquiry Assigned");
  assertIncludes(html, "Lead Summary");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "Lead: Buyer One");
});

Deno.test("transaction operations template uses branded shell", () => {
  const { html, text } = buildTransactionOperationsNotificationEmail({
    eventKind: "transaction_partner_declined",
    recipientName: "Agent One",
    title: "Partner Declined",
    message: "Example Attorneys declined the transfer attorney invitation.",
    actionLink: "https://app.example.test/transactions/tx-1",
    transactionReference: "TX-12",
    propertyLabel: "12 Ocean Road",
    previousStage: "Finance",
    stage: "Transfer",
    ownerName: "Agent One",
    roleLabel: "Transfer Attorney",
    partnerName: "Example Attorneys",
    reason: "Capacity unavailable",
    nextAction: "Nominate a replacement transfer attorney.",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Partner Declined");
  assertIncludes(html, "Transaction Summary");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "Transaction: TX-12");
  assertIncludes(
    text,
    "Next action: Nominate a replacement transfer attorney.",
  );
});

Deno.test("client seller portal template uses branded shell", () => {
  const { html, text } = buildClientSellerPortalNotificationEmail({
    eventKind: "client_portal_document_rejected",
    recipientName: "Seller One",
    title: "Document Needs Reupload",
    message: "Proof of residence needs to be uploaded again.",
    actionLink: "https://app.example.test/private-listings/listing-1",
    propertyLabel: "12 Ocean Road",
    sellerName: "Seller One",
    agentName: "Agent One",
    portalLabel: "Seller Portal",
    documentTitle: "Proof of residence",
    documentStatus: "Rejected",
    reason: "The file is unreadable.",
    nextAction: "Upload a clear copy in the seller portal.",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Document Needs Reupload");
  assertIncludes(html, "Portal Summary");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "Document: Proof of residence");
  assertIncludes(
    text,
    "Next action: Upload a clear copy in the seller portal.",
  );
});

Deno.test("bond attorney legal template uses branded shell", () => {
  const { html, text } = buildBondAttorneyLegalNotificationEmail({
    eventKind: "legal_signing_dispatch_failed",
    recipientName: "Agent One",
    title: "Signing Dispatch Failed",
    message: "Legal signing delivery failed for TX-12.",
    actionLink: "https://app.example.test/legal/packets/packet-1",
    transactionReference: "TX-12",
    propertyLabel: "12 Ocean Road",
    workflowLabel: "Legal Signing",
    status: "Failed",
    packetTitle: "Offer to Purchase",
    signerName: "Buyer One",
    signerRole: "Buyer",
    reason: "Recipient mailbox rejected delivery.",
    nextAction: "Confirm the signer email and resend the packet.",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Signing Dispatch Failed");
  assertIncludes(html, "Workflow Summary");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "Legal packet: Offer to Purchase");
  assertIncludes(
    text,
    "Next action: Confirm the signer email and resend the packet.",
  );
});

Deno.test("weekly digest template uses branded shell", () => {
  const { html, text } = buildWeeklyDigestNotificationEmail({
    digestKind: "manager_weekly_team_digest",
    recipientName: "Manager One",
    title: "Weekly Team Digest",
    message: "Here is the weekly activity summary for 27 Jul - 02 Aug 2026.",
    actionLink: "https://app.example.test/leads",
    reportPeriod: "27 Jul - 02 Aug 2026",
    summaryFields: [
      { label: "New Leads", value: "12" },
      { label: "Active Transactions", value: "8" },
    ],
    sections: [{
      title: "Account Focus",
      items: [{
        label: "Lead intake",
        detail: "12 new / 34 open",
      }],
    }],
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Weekly Team Digest");
  assertIncludes(html, "Weekly Summary");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "New Leads: 12");
  assertIncludes(text, "Lead intake: 12 new / 34 open");
});

Deno.test("commercial enterprise template uses branded shell", () => {
  const { html, text } = buildCommercialEnterpriseNotificationEmail({
    eventKind: "commercial_deal_stage_changed",
    recipientName: "Broker One",
    title: "Commercial Deal Updated",
    message: "Gateway Lease moved from heads of terms to lease pending.",
    actionLink: "https://app.example.test/commercial/deals",
    entityLabel: "Gateway Lease",
    entityType: "Commercial Deal",
    previousStatus: "heads_of_terms",
    status: "lease_pending",
    brokerName: "Broker One",
    branchName: "Cape Town",
    teamName: "Industrial",
    clientName: "Gateway Logistics",
    propertyLabel: "Unit 4, Gateway Park",
    amountLabel: "R 1 200 000",
    nextAction: "Prepare the lease pack.",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "Commercial Deal Updated");
  assertIncludes(html, "Commercial Summary");
  assertIncludes(html, "background: #123abc");
  assertIncludes(text, "Record: Gateway Lease");
  assertIncludes(text, "Next action: Prepare the lease pack.");
});
