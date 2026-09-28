import type { EmailBranding } from "../services/emailBranding.ts";
import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";

export const CLIENT_JOURNEY_EMAIL_KINDS = [
  "seller_enquiry_received",
  "seller_listing_live",
  "client_portal_agent_message",
  "client_documents_received",
  "transfer_lodged",
  "transfer_registered",
  "seller_valuation_confirmed",
  "buyer_proof_of_funds_required",
] as const;

export type ClientJourneyEmailKind = typeof CLIENT_JOURNEY_EMAIL_KINDS[number];

export type ClientJourneyEmailInput = {
  kind: ClientJourneyEmailKind;
  recipientName?: string;
  propertyLabel?: string;
  agentName?: string;
  actionUrl?: string;
  appointmentWhen?: string;
  appointmentWhere?: string;
  documentCount?: number;
  branding: EmailBranding;
};

function firstName(value: string | undefined) {
  return (value || "").trim().split(/\s+/)[0] || "there";
}

function singleLine(value: string | undefined, fallback: string) {
  return (value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ")
    .trim().slice(0, 180) || fallback;
}

function agencyTeam(input: ClientJourneyEmailInput) {
  return singleLine(input.agentName, `the ${input.branding.organisationName} team`);
}

type EmailCopy = {
  subject: string;
  title: string;
  preheader: string;
  paragraphs: string[];
  cta: string;
  summaryTitle?: string;
  summary?: Array<{ label: string; value: string }>;
  security: string;
};

function copyFor(input: ClientJourneyEmailInput): EmailCopy {
  const property = singleLine(input.propertyLabel, "your property");
  const agent = agencyTeam(input);
  const canReply = !!(input.branding.replyTo || input.branding.supportEmail ||
    input.branding.fromEmail);
  switch (input.kind) {
    case "seller_enquiry_received":
      return {
        subject: "We received your property enquiry",
        title: "Thanks for getting in touch",
        preheader: `${input.branding.organisationName} has your enquiry and will be in touch.`,
        paragraphs: [
          `Thanks for telling us about ${property}. We have your enquiry, and ${agent} will take a look and get back to you.`,
          `You do not need to fill in anything else right now. If you have a question in the meantime, ${canReply ? "reply to this email and it will reach our team" : "contact your property team"}.`,
        ],
        cta: "View your enquiry",
        security: "We will use your details only to follow up on your property enquiry.",
      };
    case "seller_listing_live":
      return {
        subject: `${property} is live`,
        title: "Your property is live",
        preheader: "Your listing is ready for buyers to see.",
        paragraphs: [
          `It's official: ${property} is live. Your listing is ready for buyers to see.`,
          `${agent} will keep you posted as interest comes in. For now, take a look at how your property appears online.`,
        ],
        cta: "View your listing",
        security: "Your documents and private sale details stay in your secure seller portal.",
      };
    case "client_portal_agent_message":
      return {
        subject: `A message from ${agent}`,
        title: "You have a new message",
        preheader: `${agent} has sent you a message in your portal.`,
        paragraphs: [
          `${agent} has left you a message in your portal. Open it when you have a moment and reply there to keep the conversation together.`,
        ],
        cta: "Read the message",
        security: "Please use your secure portal for documents and private transaction details.",
      };
    case "client_documents_received": {
      const count = Number.isFinite(input.documentCount)
        ? Math.max(0, Math.min(100, Math.floor(input.documentCount || 0)))
        : 0;
      return {
        subject: "We received your documents",
        title: "Your documents are with us",
        preheader: "Your upload arrived safely.",
        paragraphs: [
          count === 1
            ? "Your document arrived safely. Thank you for sending it through."
            : count > 1
            ? `${count === 2 ? "Both of your documents" : `All ${count} of your documents`} arrived safely. Thank you for sending them through.`
            : "Your documents arrived safely. Thank you for sending them through.",
          `${agent} will review what you sent and let you know if anything else is needed. You can check the current status in your portal.`,
        ],
        cta: "View your documents",
        security: "Your documents stay in the secure portal and are shared only with authorised people working on your file.",
      };
    }
    case "transfer_lodged":
      return {
        subject: `An update on ${property}: transfer lodged`,
        title: "Your transfer has been lodged",
        preheader: "Your transfer has reached the Deeds Office.",
        paragraphs: [
          `The transfer for ${property} has been lodged at the Deeds Office. It is an important step forward.`,
          "There may still be checks before registration. We will share the next confirmed milestone with you as soon as we have it.",
        ],
        cta: "Follow the transfer",
        security: "We only share confirmed milestones and information available to your role.",
      };
    case "transfer_registered":
      return {
        subject: `Transfer registered for ${property}`,
        title: "The transfer is registered",
        preheader: "A major milestone for your property journey.",
        paragraphs: [
          `The transfer of ${property} has been registered. Thank you for trusting us to help you through the process.`,
          "Your property team will be in touch about any practical handover steps that still apply. Your documents and history remain available in the portal.",
        ],
        cta: "Open your portal",
        security: "Your transaction records remain available only to authorised people.",
      };
    case "seller_valuation_confirmed":
      return {
        subject: `Your property valuation is confirmed`,
        title: "We look forward to meeting you",
        preheader: `Your valuation for ${property} is confirmed.`,
        paragraphs: [
          `Your valuation for ${property} is confirmed. ${agent} looks forward to seeing the property and hearing what matters most to you.`,
          `There is nothing special you need to prepare. If your plans change, ${canReply ? "reply to this email" : "contact your property team"} so we can find another time together.`,
        ],
        cta: "View appointment",
        summaryTitle: "Your appointment",
        summary: [
          { label: "When", value: input.appointmentWhen?.trim() || "" },
          { label: "Where", value: input.appointmentWhere?.trim() || "" },
          { label: "With", value: agent },
        ],
        security: "Appointment details are shared only with you and the property team.",
      };
    case "buyer_proof_of_funds_required":
      return {
        subject: "A document needed for your finance review",
        title: "One document to keep things moving",
        preheader: "Please upload proof of funds through your secure portal.",
        paragraphs: [
          `To continue reviewing the finance details for ${property}, we need your proof of funds.`,
          `Please upload it through your secure portal when you can. If you are unsure which document to use, ${canReply ? "reply to this email" : "contact your property team"} and we will help you choose the right one.`,
        ],
        cta: "Upload proof of funds",
        security: "Please upload financial documents through the secure portal rather than attaching them to an email reply.",
      };
  }
}

export function buildClientJourneyEmail(input: ClientJourneyEmailInput) {
  const copy = copyFor(input);
  const actionUrl = input.actionUrl?.trim() || "";
  const help = input.branding.replyTo || input.branding.supportEmail ||
      input.branding.fromEmail
    ? "Reply to this email if you need a hand. We are here to help."
    : "Your property team is here to help if you need a hand.";
  const contentHtml = [
    renderBridgeIntroParagraphs(copy.paragraphs),
    actionUrl
      ? renderBridgeCta(copy.cta, actionUrl, {
        primaryColor: input.branding.primaryColor,
      })
      : "",
    copy.summary?.length
      ? renderBridgeSummaryCard(copy.summary, copy.summaryTitle)
      : "",
  ].join("");
  const html = renderBridgeEmailLayout({
    preheader: copy.preheader,
    title: copy.title,
    greeting: `Hi ${firstName(input.recipientName)},`,
    contentHtml,
    securityTitle: "Your privacy",
    securityBody: copy.security,
    helpBody: help,
    branding: input.branding,
  });
  const text = [
    `Hi ${firstName(input.recipientName)},`,
    "",
    ...copy.paragraphs,
    "",
    ...(copy.summary || []).filter((row) => row.value).map((row) => `${row.label}: ${row.value}`),
    actionUrl ? `${copy.cta}: ${actionUrl}` : "",
    "",
    help,
    input.branding.organisationName,
  ].filter(Boolean).join("\n");
  return { subject: copy.subject, html, text, preheader: copy.preheader };
}
