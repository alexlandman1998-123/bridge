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

export function buildSellerOnboardingEmailHtml({
  sellerName,
  propertyTitle,
  transactionReference,
  onboardingLink,
  agentName,
  organisationName,
  supportEmail,
  supportPhone,
}: {
  sellerName: string;
  propertyTitle: string;
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
}) {
  const contentHtml = [
    renderBridgeIntroParagraphs([
      "Your property sale has been added to Bridge and your onboarding process is now ready to begin.",
      "Bridge is a property transaction platform that keeps sellers, buyers, agents, attorneys, and supporting teams connected throughout the process.",
    ]),
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">How onboarding works</p>
       ${renderBridgeSteps([
    "Complete your seller onboarding information.",
    "Upload any required property and seller documents.",
    "Your agent reviews the information and prepares mandate steps.",
    "Progress and updates are shared through your Bridge workspace.",
  ])}
     </div>`,
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle || "Your property" },
        { label: "Transaction Reference", value: transactionReference || "" },
        { label: "Agent", value: agentName || "" },
      ],
      "Property Summary",
    ),
    renderBridgeCta("Open Onboarding", onboardingLink),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: "Your Bridge seller onboarding is ready. Complete your details to continue mandate and listing preparation.",
    title: "Seller Onboarding",
    greeting: `Hi ${sellerName || "there"},`,
    contentHtml,
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
}: {
  sellerName: string;
  propertyTitle: string;
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
}) {
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");

  return [
    `Hi ${sellerName || "there"},`,
    "",
    "Your property sale has been added to Bridge and your onboarding process is now ready.",
    "",
    "Bridge keeps sellers, buyers, agents, attorneys, and supporting teams connected throughout your transaction.",
    "",
    "How onboarding works:",
    "1. Complete your seller onboarding information.",
    "2. Upload required property and seller documents.",
    "3. Your agent reviews your details and prepares mandate steps.",
    "4. Progress and updates are shared through your Bridge workspace.",
    "",
    propertyTitle ? `Property: ${propertyTitle}` : null,
    transactionReference ? `Transaction Reference: ${transactionReference}` : null,
    agentName ? `Agent: ${agentName}` : null,
    "",
    "Open Onboarding:",
    onboardingLink,
    "",
    supportLine ? `Support: ${supportLine}` : null,
    "Your information and documents are handled securely through Bridge and shared only with authorised parties in your transaction.",
    "",
    "Need help? Reply to this email or contact your property representative directly.",
    "",
    organisationName || "Bridge",
    "Powered by Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
