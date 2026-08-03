import {
  buildAppointmentEmailHtml,
  buildAppointmentEmailText,
} from "./appointment.ts";
import { buildOnboardingEmailHtml } from "./onboarding.ts";
import {
  buildReservationDepositEmailHtml,
  buildReservationDepositEmailText,
} from "./reservationDeposit.ts";
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

Deno.test("appointment template renders branded RSVP buttons", () => {
  const html = buildAppointmentEmailHtml({
    eventType: "appointment_confirmation_required",
    recipientName: "Buyer One",
    appointmentType: "Viewing",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    acceptLink: "https://app.example.test/accept",
    declineLink: "https://app.example.test/decline",
    branding,
  });

  assertIncludes(html, "Kingstons Property");
  assertIncludes(html, "background: #123abc");
  assertIncludes(html, "color: #123abc");
});

Deno.test("appointment template preserves notes and branded plain-text support", () => {
  const html = buildAppointmentEmailHtml({
    eventType: "appointment_confirmation_required",
    recipientName: "Buyer One",
    appointmentType: "Viewing",
    appointmentDate: "2026-07-28",
    appointmentTime: "10:00",
    notes: `<script>alert("x")</script> Bring ID.`,
    acceptLink: `https://app.example.test/accept?next="quoted"`,
    organisationName: branding.organisationName,
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
    notes: "Bring ID.",
    organisationName: branding.organisationName,
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
  assertIncludes(text, "Powered by Arch9");
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
