import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

export function buildOnboardingSubject(transactionReference: string) {
  return transactionReference
    ? `Complete your Bridge onboarding (${transactionReference})`
    : "Complete your Bridge onboarding";
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

export function buildOnboardingEmailHtml({
  buyerName,
  clientName,
  developmentName,
  propertyName,
  unitLabel,
  unitNumber,
  purchasePrice,
  transactionReference,
  onboardingUrl,
  agentName,
  organisationName,
  supportEmail,
  supportPhone,
  templateOverrides,
}: {
  buyerName: string;
  clientName?: string;
  developmentName: string;
  propertyName?: string;
  unitLabel: string;
  unitNumber?: string;
  purchasePrice: string;
  transactionReference?: string;
  onboardingUrl: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  templateOverrides?: {
    title?: string;
    preheader?: string;
    introParagraphs?: string[];
    capabilityBullets?: string[];
    processSteps?: string[];
    ctaLabel?: string;
    securityTitle?: string;
    securityBody?: string;
    helpBody?: string;
  };
}) {
  const greetingName = clientName || buyerName || "there";
  const summaryProperty = propertyName || [developmentName, unitLabel].filter(Boolean).join(" • ");
  const summaryUnit = unitNumber || unitLabel;

  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    "Your property transaction has been added to Bridge and your onboarding process is now ready to begin.",
    "Bridge is a property transaction platform that keeps buyers, sellers, agents, attorneys, and bond originators connected throughout the process.",
  ]);
  const capabilityBullets = pickLines(templateOverrides?.capabilityBullets, [
    "Complete your onboarding information",
    "Upload required documents securely",
    "Track transaction progress",
    "Receive updates and next steps from your team",
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    "Complete your onboarding information.",
    "Upload the required documents.",
    "Your team reviews and prepares the next steps.",
    "Progress and updates appear in your client portal.",
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Open Onboarding");

  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    `<div style="margin: 14px 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What you can do in Bridge</p>
       ${renderBridgeBullets(capabilityBullets)}
     </div>`,
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">How onboarding works</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    renderBridgeSummaryCard(
      [
        { label: "Property", value: summaryProperty },
        { label: "Unit", value: summaryUnit },
        { label: "Purchase Price", value: purchasePrice },
        { label: "Transaction Reference", value: transactionReference || "" },
        { label: "Agent", value: agentName || "" },
      ],
      "Property / Transaction Summary",
    ),
    renderBridgeCta(ctaLabel, onboardingUrl),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: pickText(templateOverrides?.preheader, "Your Bridge onboarding is ready. Complete your details and documents to continue."),
    title: pickText(templateOverrides?.title, "Client Onboarding"),
    greeting: `Hi ${greetingName},`,
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

export function buildOnboardingEmailText({
  buyerName,
  clientName,
  onboardingUrl,
  developmentName,
  propertyName,
  unitLabel,
  unitNumber,
  purchasePrice,
  transactionReference,
  agentName,
  organisationName,
  supportEmail,
  supportPhone,
  templateOverrides,
}: {
  buyerName: string;
  clientName?: string;
  onboardingUrl: string;
  developmentName: string;
  propertyName?: string;
  unitLabel: string;
  unitNumber?: string;
  purchasePrice?: string;
  transactionReference?: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  templateOverrides?: {
    introParagraphs?: string[];
    capabilityBullets?: string[];
    processSteps?: string[];
    ctaLabel?: string;
    securityBody?: string;
    helpBody?: string;
  };
}) {
  const greetingName = clientName || buyerName || "there";
  const propertyLine = propertyName || [developmentName, unitLabel].filter(Boolean).join(" • ");
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");

  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    "Your property transaction has been added to Bridge and your onboarding process is now ready.",
    "Bridge helps keep buyers, sellers, agents, attorneys, and bond originators connected throughout your transaction.",
  ]);
  const capabilityBullets = pickLines(templateOverrides?.capabilityBullets, [
    "Complete your onboarding information",
    "Upload required documents securely",
    "Track transaction progress",
    "Receive updates and next steps from your team",
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    "Complete your onboarding information.",
    "Upload the required documents.",
    "Your team reviews and prepares the next steps.",
    "Progress and updates appear in your client portal.",
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, "Open Onboarding");

  return [
    `Hi ${greetingName},`,
    "",
    ...introParagraphs,
    "",
    "You can use Bridge to:",
    ...capabilityBullets.map((line) => `- ${line}`),
    propertyLine ? `Property: ${propertyLine}` : null,
    unitNumber || unitLabel ? `Unit: ${unitNumber || unitLabel}` : null,
    purchasePrice ? `Purchase Price: ${purchasePrice}` : null,
    transactionReference ? `Transaction Reference: ${transactionReference}` : null,
    agentName ? `Agent: ${agentName}` : null,
    "",
    "How onboarding works:",
    ...processSteps.map((line, index) => `${index + 1}. ${line}`),
    "",
    `${ctaLabel}:`,
    onboardingUrl,
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
