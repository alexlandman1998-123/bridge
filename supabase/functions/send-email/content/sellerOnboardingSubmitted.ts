import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

function pickText(value: string | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizePropertyLabel(propertyTitle: string) {
  const normalized = String(propertyTitle || "").trim();
  return normalized || "property";
}

export function buildSellerOnboardingSubmittedSubject(propertyTitle = "") {
  const propertyLabel = normalizePropertyLabel(propertyTitle);
  return `Seller onboarding submitted: ${propertyLabel}`;
}

export function buildSellerOnboardingSubmittedEmailHtml({
  sellerName,
  propertyTitle,
  transactionReference,
  agentName,
  actionLink,
  organisationName,
  senderOrganisationName,
  senderOrganisationLogoUrl,
  supportEmail,
  supportPhone,
  templateOverrides,
}: {
  sellerName: string;
  propertyTitle: string;
  transactionReference?: string;
  agentName?: string;
  actionLink?: string;
  organisationName?: string;
  senderOrganisationName?: string;
  senderOrganisationLogoUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  templateOverrides?: {
    title?: string;
    preheader?: string;
    introParagraphs?: string[];
    processSteps?: string[];
    ctaLabel?: string;
    securityTitle?: string;
    securityBody?: string;
    helpBody?: string;
  };
}) {
  const propertyLabel = normalizePropertyLabel(propertyTitle);
  const agentLabel = pickText(agentName, "the assigned agent");
  const introParagraphs = Array.isArray(templateOverrides?.introParagraphs) && templateOverrides.introParagraphs.length
    ? templateOverrides.introParagraphs
    : [
      `${sellerName || "The seller"} has submitted their onboarding for ${propertyLabel}.`,
      "Please review the submitted details and generate the mandate from the lead workspace.",
      "Bridge keeps the onboarding, mandate, and signing flow tied to the same lead record.",
    ];
  const processSteps = Array.isArray(templateOverrides?.processSteps) && templateOverrides.processSteps.length
    ? templateOverrides.processSteps
    : [
      "Open the lead workspace.",
      "Review the seller onboarding submission.",
      "Generate the mandate.",
      "Continue the signing flow once the draft is ready.",
    ];
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Generate Mandate");
  const securityTitle = pickText(templateOverrides?.securityTitle, "Submission Review");
  const securityBody = pickText(
    templateOverrides?.securityBody,
    "This handoff is shared securely through Bridge and is only visible to authorised members of the transaction workspace.",
  );
  const helpBody = pickText(
    templateOverrides?.helpBody,
    "Need help? Reply to this email or open the lead workspace to continue the mandate workflow.",
  );

  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLabel },
        { label: "Seller", value: pickText(sellerName, "Seller") },
        { label: "Agent", value: agentLabel },
        { label: "Reference", value: pickText(transactionReference, "") },
      ],
      "Seller Onboarding Submitted",
    ),
    `<div style="margin: 0 0 16px; padding: 16px; border: 1px solid #dbe6f2; border-radius: 14px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    actionLink ? renderBridgeCta(ctaLabel, actionLink) : "",
  ].join("");

  return renderBridgeEmailLayout({
    preheader: pickText(
      templateOverrides?.preheader,
      "The seller has submitted onboarding. Review it and generate the mandate from Bridge.",
    ),
    title: pickText(templateOverrides?.title, "Seller Onboarding Submitted"),
    greeting: `Hi ${pickText(agentName, "there")},`,
    contentHtml,
    securityTitle,
    securityBody,
    helpBody,
    organisationName: organisationName || "Bridge",
    senderOrganisationName,
    senderOrganisationLogoUrl,
    supportEmail: supportEmail || "",
    supportPhone: supportPhone || "",
  });
}

export function buildSellerOnboardingSubmittedEmailText({
  sellerName,
  propertyTitle,
  transactionReference,
  agentName,
  actionLink,
  organisationName,
}: {
  sellerName: string;
  propertyTitle: string;
  transactionReference?: string;
  agentName?: string;
  actionLink?: string;
  organisationName?: string;
}) {
  const propertyLabel = normalizePropertyLabel(propertyTitle);

  return [
    `Hi ${pickText(agentName, "there")},`,
    "",
    `${sellerName || "The seller"} has submitted their onboarding for ${propertyLabel}.`,
    "Please review the submission and generate the mandate from the lead workspace.",
    "",
    "What happens next:",
    "1. Open the lead workspace.",
    "2. Review the seller onboarding submission.",
    "3. Generate the mandate.",
    "4. Continue the signing flow once the draft is ready.",
    "",
    `Property: ${propertyLabel}`,
    sellerName ? `Seller: ${sellerName}` : null,
    transactionReference ? `Reference: ${transactionReference}` : null,
    actionLink ? `Generate Mandate: ${actionLink}` : null,
    "",
    "Need help? Reply to this email or open the lead workspace to continue the mandate workflow.",
    "",
    organisationName || "Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
