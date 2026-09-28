import {
  type BridgeEmailLayoutBranding,
} from "./bridgeEmailLayout.ts";
import { renderOnboardingInvitation } from "./onboardingInvitationLayout.ts";

export function buildOnboardingSubject(transactionReference: string) {
  return transactionReference
    ? `Complete your buyer profile (${transactionReference})`
    : "Complete your buyer profile";
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

function pickCurrentBuyerText(value: string | undefined, fallback: string) {
  const selected = pickText(value, fallback);
  return /\boffer\b/i.test(selected) ? fallback : selected;
}

function pickCurrentBuyerLines(value: string[] | undefined, fallback: string[]) {
  const selected = pickLines(value, fallback);
  return selected.some((line) => /\boffer\b/i.test(line)) ? fallback : selected;
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
  branding,
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
  branding?: BridgeEmailLayoutBranding;
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
  const agencyName = branding?.organisationName || organisationName || "Your agency";
  const greetingName = clientName || buyerName || "there";
  const summaryProperty = propertyName ||
    [developmentName, unitLabel].filter(Boolean).join(" • ");
  const summaryUnit = unitNumber || unitLabel;
  const defaultIntro = [
    `${agencyName} has prepared your secure buyer profile. Complete your details and share the requested documents so your team can prepare the next step with you.`,
  ];
  const introParagraphs = pickCurrentBuyerLines(templateOverrides?.introParagraphs, defaultIntro);
  const customCapabilities = pickCurrentBuyerLines(templateOverrides?.capabilityBullets, []);
  if (customCapabilities.length) {
    introParagraphs.push(customCapabilities.join(" • "));
  }
  const customSteps = pickCurrentBuyerLines(templateOverrides?.processSteps, []);
  const steps = customSteps.length
    ? customSteps.map((title) => ({ title, detail: "" }))
    : [
      { title: "Your details", detail: "Confirm your buyer and contact information." },
      { title: "Your documents", detail: "Upload the requested supporting documents securely." },
      { title: "We take it forward", detail: "Your team coordinates finance, where applicable, and transfer next steps." },
    ];
  const ctaLabel = pickCurrentBuyerText(templateOverrides?.ctaLabel, "Complete your buyer profile");
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");

  return renderOnboardingInvitation({
    organisationName: agencyName,
    branding,
    preheader: pickCurrentBuyerText(
      templateOverrides?.preheader,
      "Your secure buyer profile is ready. Complete your details to continue.",
    ),
    eyebrow: "Buyer onboarding",
    title: pickCurrentBuyerText(templateOverrides?.title, "Your next step starts here."),
    recipientName: greetingName,
    introParagraphs,
    ctaLabel,
    ctaUrl: onboardingUrl,
    timingText: "Open securely on any device.",
    steps,
    summaryRows: [
      { label: "Property", value: summaryProperty },
      { label: "Unit", value: summaryUnit },
      { label: "Purchase price", value: purchasePrice },
      { label: "Reference", value: transactionReference || "" },
      { label: "Agent", value: agentName || "" },
    ],
    helpBody: pickCurrentBuyerText(
      templateOverrides?.helpBody,
      "Reply to this email or contact your agent directly.",
    ),
    contactLine: supportLine,
    securityTitle: pickCurrentBuyerText(templateOverrides?.securityTitle, "Security & privacy"),
    securityBody: pickCurrentBuyerText(
      templateOverrides?.securityBody,
      "Your information and documents are shared only with authorised people working on your transaction.",
    ),
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
  const agencyName = organisationName || "Your agency";
  const greetingName = clientName || buyerName || "there";
  const propertyLine = propertyName ||
    [developmentName, unitLabel].filter(Boolean).join(" • ");
  const supportLine = [supportEmail, supportPhone].filter(Boolean).join(" | ");
  const introParagraphs = pickCurrentBuyerLines(
    templateOverrides?.introParagraphs,
    [
      `${agencyName} has prepared your secure buyer profile. Complete your details and share the requested documents so your team can prepare the next step with you.`,
    ],
  );
  const customCapabilities = pickCurrentBuyerLines(templateOverrides?.capabilityBullets, []);
  const processSteps = pickCurrentBuyerLines(
    templateOverrides?.processSteps,
    [
      "Confirm your buyer and contact information.",
      "Upload the requested supporting documents securely.",
      "Your team coordinates finance, where applicable, and transfer next steps.",
    ],
  );
  const ctaLabel = pickCurrentBuyerText(templateOverrides?.ctaLabel, "Complete your buyer profile");

  return [
    `Hi ${greetingName},`,
    "",
    ...introParagraphs,
    "",
    ...customCapabilities.map((line) => `- ${line}`),
    propertyLine ? `Property: ${propertyLine}` : null,
    unitNumber || unitLabel ? `Unit: ${unitNumber || unitLabel}` : null,
    purchasePrice ? `Purchase price: ${purchasePrice}` : null,
    transactionReference ? `Reference: ${transactionReference}` : null,
    agentName ? `Agent: ${agentName}` : null,
    "",
    "What happens next:",
    ...processSteps.map((line, index) => `${index + 1}. ${line}`),
    "",
    `${ctaLabel}:`,
    onboardingUrl,
    "",
    supportLine ? `Support: ${supportLine}` : null,
    pickCurrentBuyerText(
      templateOverrides?.securityBody,
      "Your information and documents are shared only with authorised people working on your transaction.",
    ),
    pickCurrentBuyerText(
      templateOverrides?.helpBody,
      "Need help? Reply to this email or contact your agent directly.",
    ),
    "",
    agencyName,
    "Powered by Arch9",
  ].filter(Boolean).join("\n");
}
