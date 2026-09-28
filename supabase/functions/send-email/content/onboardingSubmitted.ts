import type { OnboardingSubmittedEmailPayload } from "../types.ts";
import {
  type BridgeEmailLayoutBranding,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

function resolvePropertyLine(payload: OnboardingSubmittedEmailPayload) {
  return [payload.developmentName, payload.unitLabel].filter(Boolean).join(" • ");
}

export function buildOnboardingSubmittedSubject() {
  return "Your onboarding is complete – next steps";
}

export function buildOnboardingSubmittedPreview() {
  return "We’ve received your information. Access your client portal to track your transaction.";
}

export function buildOnboardingSubmittedEmailHtml(
  payload: OnboardingSubmittedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const greetingName = payload.buyerName || "there";
  const previewText = buildOnboardingSubmittedPreview();
  const branding = payload.branding as BridgeEmailLayoutBranding | undefined;

  const contentHtml = [
    renderBridgeIntroParagraphs([
      "Thank you. We have successfully received your onboarding information.",
      "Our team will review your details and contact you if anything else is needed.",
    ]),
    renderBridgeCta("Open Client Portal", payload.clientPortalLink, {
      primaryColor: branding?.primaryColor,
    }),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLine },
        { label: "Transaction Reference", value: payload.transactionReference },
      ],
      "Onboarding Summary",
    ),
    `<div style="margin: 22px 0; padding: 16px 18px; border: 1px solid #DDDDDA; background: #F7F7F5;">
       <p style="margin: 0 0 10px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #171717; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps([
      "Our team reviews your information.",
      "We contact you if any details or documents are needed.",
      "You can follow updates and upload documents through your client portal.",
    ])}
     </div>`,
  ].join("");

  return renderBridgeEmailLayout({
    preheader: previewText,
    title: "Onboarding Submitted",
    greeting: `Hi ${greetingName},`,
    contentHtml,
    organisationName: payload.organisationName,
    supportEmail: payload.supportEmail,
    supportPhone: payload.supportPhone,
    branding,
  });
}

export function buildOnboardingSubmittedEmailText(
  payload: OnboardingSubmittedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const previewText = buildOnboardingSubmittedPreview();

  return [
    `Hi ${payload.buyerName || "there"},`,
    "",
    "Thank you — we’ve successfully received your onboarding information.",
    "Our team will review your details and contact you if anything else is needed.",
    propertyLine ? `Property: ${propertyLine}` : null,
    payload.transactionReference
      ? `Transaction Reference: ${payload.transactionReference}`
      : null,
    "",
    "What happens next:",
    "1. Our team reviews your information",
    "2. We contact you if any details or documents are needed",
    "3. You can follow updates and upload documents via your client portal",
    "",
    `Open Client Portal: ${payload.clientPortalLink}`,
    "",
    previewText,
    "",
    "Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildClientPortalLinkSubject() {
  return "Your client portal link is ready";
}

export function buildClientPortalLinkPreview() {
  return "Click here to access your client portal link.";
}

export function buildClientPortalLinkEmailHtml(
  payload: OnboardingSubmittedEmailPayload,
) {
  const propertyLine = resolvePropertyLine(payload);
  const greetingName = payload.buyerName || "there";
  const previewText = buildClientPortalLinkPreview();
  const branding = payload.branding as BridgeEmailLayoutBranding | undefined;

  const contentHtml = [
    renderBridgeIntroParagraphs([
      "Your onboarding has been completed and your client portal is ready.",
      "Open the secure link below to access your client portal and continue where you left off.",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLine },
        { label: "Transaction Reference", value: payload.transactionReference },
      ],
      "Portal Summary",
    ),
    renderBridgeCta("Open Client Portal", payload.clientPortalLink, {
      primaryColor: branding?.primaryColor,
    }),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: previewText,
    title: "Client Portal Access",
    greeting: `Hi ${greetingName},`,
    contentHtml,
    organisationName: payload.organisationName,
    supportEmail: payload.supportEmail,
    supportPhone: payload.supportPhone,
    branding,
  });
}

export function buildClientPortalLinkEmailText(payload: OnboardingSubmittedEmailPayload) {
  const propertyLine = resolvePropertyLine(payload);
  const previewText = buildClientPortalLinkPreview();

  return [
    `Hi ${payload.buyerName || "there"},`,
    "",
    "Your onboarding has been completed and your client portal is ready.",
    "Click here to access your client portal link:",
    payload.clientPortalLink,
    propertyLine ? `Property: ${propertyLine}` : null,
    payload.transactionReference
      ? `Transaction Reference: ${payload.transactionReference}`
      : null,
    "",
    previewText,
    "",
    "Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
