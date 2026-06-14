import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

function isGenericPropertyLabel(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return [
    "",
    "property",
    "your property",
    "selected property",
    "this property",
    "listing",
    "your listing",
  ].includes(normalized);
}

function resolvePropertyLabel(propertyTitle: string, propertyType = "") {
  const title = String(propertyTitle || "").trim();
  const type = String(propertyType || "").trim();
  if (title && !isGenericPropertyLabel(title)) {
    return title;
  }
  if (type) {
    return type;
  }
  return title || "Property";
}

function normalizeReference(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(normalized)) {
    return "";
  }
  return normalized;
}

export function buildSellerOnboardingSubject(
  propertyTitle: string,
  transactionReference = "",
  propertyType = "",
) {
  const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
  const referenceLabel = normalizeReference(transactionReference || "");
  if (propertyLabel && !isGenericPropertyLabel(propertyLabel)) {
    return `Complete your seller information for ${propertyLabel}`;
  }
  if (propertyType) {
    return `Complete your seller information for ${propertyType}`;
  }
  if (referenceLabel) {
    return `Complete your seller information (${referenceLabel})`;
  }
  return "Complete your seller information";
}

function pickText(value: string | undefined, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function pickLines(value: string[] | undefined, fallback: string[]) {
  const rows = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return rows.length ? rows : fallback;
}

export function buildSellerOnboardingEmailHtml({
  sellerName,
  propertyTitle,
  propertyType,
  transactionReference,
  onboardingLink,
  agentName,
  organisationName,
  senderOrganisationName,
  senderOrganisationLogoUrl,
  supportEmail,
  supportPhone,
  templateOverrides,
}: {
  sellerName: string;
  propertyTitle: string;
  propertyType?: string;
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
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
  const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
  const referenceLabel = normalizeReference(transactionReference || "");
  const agentLabel = pickText(agentName, "Your agent");
  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    "Your agent has invited you to complete the seller onboarding process for your property.",
    "This should only take a few minutes and helps ensure your property sale progresses smoothly from the start.",
    "To get everything ready, we need a few details and any available property documents from you.",
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    "Complete your seller information.",
    "Upload any available property documents.",
    "Your agent reviews everything and prepares the property for listing.",
    "We'll keep you updated as your sale progresses.",
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Complete Seller Information");
  const securityTitle = pickText(templateOverrides?.securityTitle, "Trust & Security");
  const securityBody = pickText(
    templateOverrides?.securityBody,
    "Your information is securely stored and only shared with authorised parties involved in your property sale.",
  );
  const helpBody = pickText(
    templateOverrides?.helpBody,
    "Need help? Reply to this email or contact your agent directly.",
  );

  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    `<div style="margin: 0 0 16px; padding: 16px; border: 1px solid #dbe6f2; border-radius: 14px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    `<div style="margin: 0 0 16px; padding: 14px 16px; border: 1px solid #e3eaf1; border-radius: 12px; background: #f6f8fb;">
       <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6d8096; font-weight: 700;">Estimated Completion Time</p>
       <p style="margin: 0; font-size: 16px; line-height: 1.4; color: #0f2f4f; font-weight: 700;">5-10 Minutes</p>
     </div>`,
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLabel },
        { label: "Agent", value: agentLabel },
        { label: "Reference", value: referenceLabel },
      ],
      "Property Summary",
    ),
    renderBridgeCta(ctaLabel, onboardingLink),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: pickText(
      templateOverrides?.preheader,
      "Your agent has invited you to complete seller information for your property.",
    ),
    title: pickText(templateOverrides?.title, "Your Property Sale Starts Here"),
    greeting: `Hi ${sellerName || "there"},`,
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

export function buildSellerOnboardingEmailText({
  sellerName,
  propertyTitle,
  propertyType,
  transactionReference,
  onboardingLink,
  agentName,
  organisationName,
  supportEmail,
  supportPhone,
  templateOverrides,
}: {
  sellerName: string;
  propertyTitle: string;
  propertyType?: string;
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  templateOverrides?: {
    introParagraphs?: string[];
    processSteps?: string[];
    ctaLabel?: string;
    securityBody?: string;
    helpBody?: string;
  };
}) {
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");
  const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
  const referenceLabel = normalizeReference(transactionReference || "");
  const agentLabel = pickText(agentName, "Your agent");
  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    "Your agent has invited you to complete the seller onboarding process for your property.",
    "This should only take a few minutes and helps ensure your property sale progresses smoothly from the start.",
    "To get everything ready, we need a few details and any available property documents from you.",
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    "Complete your seller information.",
    "Upload any available property documents.",
    "Your agent reviews everything and prepares the property for listing.",
    "We'll keep you updated as your sale progresses.",
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Complete Seller Information");
  const securityBody = pickText(
    templateOverrides?.securityBody,
    "Your information is securely stored and only shared with authorised parties involved in your property sale.",
  );
  const helpBody = pickText(
    templateOverrides?.helpBody,
    "Need help? Reply to this email or contact your agent directly.",
  );

  return [
    `Hi ${sellerName || "there"},`,
    "",
    ...introParagraphs,
    "",
    "What happens next:",
    ...processSteps.map((line, index) => `${index + 1}. ${line}`),
    "",
    "Estimated Completion Time: 5-10 Minutes",
    "",
    propertyLabel ? `Property: ${propertyLabel}` : null,
    agentLabel ? `Agent: ${agentLabel}` : null,
    referenceLabel ? `Reference: ${referenceLabel}` : null,
    "",
    `${ctaLabel}:`,
    onboardingLink,
    "",
    supportLine ? `Support: ${supportLine}` : null,
    securityBody,
    "",
    helpBody,
    "",
    organisationName || "Bridge",
    "Powered by Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
