import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

export function buildSellerOnboardingSubject(propertyTitle: string, transactionReference = "") {
  if (transactionReference) {
    return `Complete seller onboarding (${transactionReference})`;
  }
  return propertyTitle
    ? `Complete seller onboarding for ${propertyTitle}`
    : "Complete seller onboarding";
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
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
  organisationName?: string;
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
  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    "Your property sale has been added to Bridge and your onboarding process is now ready to begin.",
    "Bridge is a property transaction platform that keeps sellers, buyers, agents, attorneys, and supporting teams connected throughout the process.",
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    "Complete your seller onboarding information.",
    "Upload any required property and seller documents.",
    "Your agent reviews the information and prepares mandate steps.",
    "Progress and updates are shared through your Bridge workspace.",
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Open Onboarding");

  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">How onboarding works</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle || "Your property" },
        { label: "Transaction Reference", value: transactionReference || "" },
        { label: "Agent", value: agentName || "" },
      ],
      "Property Summary",
    ),
    renderBridgeCta(ctaLabel, onboardingLink),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: pickText(
      templateOverrides?.preheader,
      "Your Bridge seller onboarding is ready. Complete your details to continue mandate and listing preparation.",
    ),
    title: pickText(templateOverrides?.title, "Seller Onboarding"),
    greeting: `Hi ${sellerName || "there"},`,
    contentHtml,
    securityTitle: pickText(templateOverrides?.securityTitle, "Security & Privacy"),
    securityBody: pickText(
      templateOverrides?.securityBody,
      "Your information and documents are handled securely through Bridge. Only authorised parties involved in your transaction can access your onboarding details.",
    ),
    helpBody: pickText(templateOverrides?.helpBody, "Need help? Reply to this email or contact your property representative directly."),
    organisationName: organisationName || "Bridge",
    supportEmail: supportEmail || "",
    supportPhone: supportPhone || "",
  });
}

export function buildSellerOnboardingEmailText({
  sellerName,
  propertyTitle,
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
  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    "Your property sale has been added to Bridge and your onboarding process is now ready.",
    "Bridge keeps sellers, buyers, agents, attorneys, and supporting teams connected throughout your transaction.",
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    "Complete your seller onboarding information.",
    "Upload required property and seller documents.",
    "Your agent reviews your details and prepares mandate steps.",
    "Progress and updates are shared through your Bridge workspace.",
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Open Onboarding");

  return [
    `Hi ${sellerName || "there"},`,
    "",
    ...introParagraphs,
    "",
    "How onboarding works:",
    ...processSteps.map((line, index) => `${index + 1}. ${line}`),
    "",
    propertyTitle ? `Property: ${propertyTitle}` : null,
    transactionReference ? `Transaction Reference: ${transactionReference}` : null,
    agentName ? `Agent: ${agentName}` : null,
    "",
    `${ctaLabel}:`,
    onboardingLink,
    "",
    supportLine ? `Support: ${supportLine}` : null,
    pickText(
      templateOverrides?.securityBody,
      "Your information and documents are handled securely through Bridge and shared only with authorised parties in your transaction.",
    ),
    "",
    pickText(templateOverrides?.helpBody, "Need help? Reply to this email or contact your property representative directly."),
    "",
    organisationName || "Bridge",
    "Powered by Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
