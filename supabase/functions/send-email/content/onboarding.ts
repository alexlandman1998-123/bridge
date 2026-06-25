import {
  renderBridgeBullets,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

export function buildOnboardingSubject(
  transactionReference: string,
  acceptedOffer = false,
) {
  if (acceptedOffer) {
    return transactionReference
      ? `Congratulations, the seller accepted your offer (${transactionReference})`
      : "Congratulations, the seller accepted your offer";
  }
  return transactionReference
    ? `Complete your Arch9 onboarding (${transactionReference})`
    : "Complete your Arch9 onboarding";
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
  acceptedOffer = false,
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
  acceptedOffer?: boolean;
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
  const summaryProperty = propertyName ||
    [developmentName, unitLabel].filter(Boolean).join(" • ");
  const summaryUnit = unitNumber || unitLabel;

  const introParagraphs = pickLines(
    templateOverrides?.introParagraphs,
    acceptedOffer
      ? [
        "Congratulations, the seller has accepted your offer. This is an exciting step, and Arch9 is here to help keep the next part of the journey clear and coordinated.",
        "Your accepted offer is now moving into the formal transaction workflow. Your agent and transaction team will guide you through onboarding, documents, finance where applicable, and the transfer process.",
      ]
      : [
        "Your property transaction has been added to Arch9 and your onboarding process is now ready to begin.",
        "Arch9 is a property transaction platform that keeps buyers, sellers, agents, attorneys, and bond originators connected throughout the process.",
      ],
  );
  const capabilityBullets = pickLines(templateOverrides?.capabilityBullets, [
    "Complete your onboarding information",
    "Upload required documents securely",
    "Track transaction progress",
    "Receive updates and next steps from your team",
  ]);
  const processSteps = pickLines(
    templateOverrides?.processSteps,
    acceptedOffer
      ? [
        "Complete your buyer onboarding details so the transaction record is ready for the transfer team.",
        "Upload the requested FICA and supporting documents securely in Arch9.",
        "If your offer depends on finance, expect follow-up from your bond originator or finance team.",
        "Your transfer attorney details and other roleplayers will be shared as they are confirmed.",
      ]
      : [
        "Complete your onboarding information.",
        "Upload the required documents.",
        "Your team reviews and prepares the next steps.",
        "Progress and updates appear in your client portal.",
      ],
  );
  const ctaLabel = pickText(
    templateOverrides?.ctaLabel,
    acceptedOffer ? "Start Buyer Onboarding" : "Open Onboarding",
  );

  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    `<div style="margin: 14px 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What you can do in Arch9</p>
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
    preheader: pickText(
      templateOverrides?.preheader,
      acceptedOffer
        ? "The seller has accepted your offer. Start buyer onboarding to continue."
        : "Your Arch9 onboarding is ready. Complete your details and documents to continue.",
    ),
    title: pickText(
      templateOverrides?.title,
      acceptedOffer ? "Offer Accepted" : "Client Onboarding",
    ),
    greeting: `Hi ${greetingName},`,
    contentHtml,
    securityTitle: pickText(
      templateOverrides?.securityTitle,
      "Security & Privacy",
    ),
    securityBody: pickText(
      templateOverrides?.securityBody,
      "Your information and documents are handled securely through Arch9. Only authorised parties involved in your transaction can access your onboarding details.",
    ),
    helpBody: pickText(
      templateOverrides?.helpBody,
      "Need help? Reply to this email or contact your property representative directly.",
    ),
    organisationName: organisationName || "Arch9",
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
  acceptedOffer = false,
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
  acceptedOffer?: boolean;
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
  const propertyLine = propertyName ||
    [developmentName, unitLabel].filter(Boolean).join(" • ");
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");

  const introParagraphs = pickLines(
    templateOverrides?.introParagraphs,
    acceptedOffer
      ? [
        "Congratulations, the seller has accepted your offer.",
        "Your accepted offer is now moving into the formal transaction workflow. Your agent and transaction team will guide you through onboarding, documents, finance where applicable, and the transfer process.",
      ]
      : [
        "Your property transaction has been added to Arch9 and your onboarding process is now ready.",
        "Arch9 helps keep buyers, sellers, agents, attorneys, and bond originators connected throughout your transaction.",
      ],
  );
  const capabilityBullets = pickLines(templateOverrides?.capabilityBullets, [
    "Complete your onboarding information",
    "Upload required documents securely",
    "Track transaction progress",
    "Receive updates and next steps from your team",
  ]);
  const processSteps = pickLines(
    templateOverrides?.processSteps,
    acceptedOffer
      ? [
        "Complete your buyer onboarding details.",
        "Upload the requested FICA and supporting documents.",
        "If your offer depends on finance, expect follow-up from your bond originator or finance team.",
        "Your transfer attorney details and other roleplayers will be shared as they are confirmed.",
      ]
      : [
        "Complete your onboarding information.",
        "Upload the required documents.",
        "Your team reviews and prepares the next steps.",
        "Progress and updates appear in your client portal.",
      ],
  );
  const ctaLabel = pickText(
    templateOverrides?.ctaLabel,
    acceptedOffer ? "Start Buyer Onboarding" : "Open Onboarding",
  );

  return [
    `Hi ${greetingName},`,
    "",
    ...introParagraphs,
    "",
    "You can use Arch9 to:",
    ...capabilityBullets.map((line) => `- ${line}`),
    propertyLine ? `Property: ${propertyLine}` : null,
    unitNumber || unitLabel ? `Unit: ${unitNumber || unitLabel}` : null,
    purchasePrice ? `Purchase Price: ${purchasePrice}` : null,
    transactionReference
      ? `Transaction Reference: ${transactionReference}`
      : null,
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
      "Your information and documents are handled securely through Arch9 and shared only with authorised parties in your transaction.",
    ),
    "",
    pickText(
      templateOverrides?.helpBody,
      "Need help? Reply to this email or contact your property representative directly.",
    ),
    "",
    organisationName || "Arch9",
    "Powered by Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
