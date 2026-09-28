import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";
import { renderOnboardingInvitation } from "./onboardingInvitationLayout.ts";

type SellerPortalRequiredDocument = {
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  isReplacement?: boolean;
};

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
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(normalized)) {
    return "";
  }
  return normalized;
}

export function buildSellerOnboardingSubject(
  propertyTitle: string,
  transactionReference = "",
  propertyType = "",
  emailKind = "onboarding",
) {
  const normalizedKind = String(emailKind || "").trim().toLowerCase();
  if (normalizedKind === "onboarding_follow_up") {
    const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
    return propertyLabel && !isGenericPropertyLabel(propertyLabel)
      ? `Reminder: complete your seller profile for ${propertyLabel}`
      : "Reminder: complete your seller profile";
  }
  if (normalizedKind === "existing_listing") {
    const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
    return `Activate your Seller Portal for ${
      propertyLabel || "your property"
    }`;
  }
  if (normalizedKind === "portal_documents") {
    const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
    if (propertyLabel && !isGenericPropertyLabel(propertyLabel)) {
      return `Your seller portal is ready for ${propertyLabel}`;
    }
    if (propertyType) {
      return `Your seller portal is ready for ${propertyType}`;
    }
    return "Your seller portal is ready";
  }
  const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
  const referenceLabel = normalizeReference(transactionReference || "");
  if (propertyLabel && !isGenericPropertyLabel(propertyLabel)) {
    return `Complete your seller profile for ${propertyLabel}`;
  }
  if (propertyType) {
    return `Complete your seller profile for ${propertyType}`;
  }
  if (referenceLabel) {
    return `Complete your seller profile (${referenceLabel})`;
  }
  return "Complete your seller profile";
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

function resolveFirstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function resolvePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : fallback;
}

function resolveExpiryDays(expiryDays: unknown, expiresAt: unknown) {
  const explicit = resolvePositiveInteger(expiryDays, 0);
  if (explicit > 0) return explicit;

  const expiryDate = String(expiresAt || "").trim();
  const expiryTime = expiryDate ? Date.parse(expiryDate) : Number.NaN;
  if (Number.isFinite(expiryTime)) {
    return Math.max(0, Math.ceil((expiryTime - Date.now()) / 86400000));
  }

  return 14;
}

function normalizeRequiredDocuments(
  value: unknown,
): SellerPortalRequiredDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? item as Record<string, unknown>
        : null
    )
    .filter(Boolean)
    .map((item) => ({
      id: String(item?.id || "").trim(),
      key: String(
        item?.key || item?.requirementKey || item?.requirement_key || "",
      ).trim(),
      name: String(
        item?.name || item?.label || item?.requirementName ||
          item?.requirement_name || item?.key || "",
      ).trim(),
      description: String(
        item?.description || item?.requirementDescription ||
          item?.requirement_description || "",
      ).trim(),
      priority: String(
        item?.priority || item?.requestPriority || item?.request_priority || "",
      ).trim(),
      dueDate: String(
        item?.dueDate || item?.due_date || item?.requestDueDate ||
          item?.request_due_date || "",
      ).trim(),
      isReplacement: item?.isReplacement === true ||
        item?.is_replacement === true,
    }))
    .filter((item) => item.name || item.key);
}

function resolveSellerStructureLabel(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object" || Array.isArray(value)) return "";
  const source = value as Record<string, unknown>;
  return String(
    source.label ||
      source.sellerStructureLabel ||
      source.seller_structure_label ||
      source.sellerType ||
      source.seller_type ||
      source.sellerBranch ||
      source.seller_branch ||
      "",
  ).trim();
}

function renderRequiredDocumentsHtml(
  requiredDocuments: unknown,
  sellerStructure: unknown,
) {
  const documents = normalizeRequiredDocuments(requiredDocuments);
  if (!documents.length) return "";
  const sellerStructureLabel = resolveSellerStructureLabel(sellerStructure);
  const visibleDocuments = documents.slice(0, 12);
  const remainingCount = Math.max(
    0,
    documents.length - visibleDocuments.length,
  );
  const rows = visibleDocuments.map((document) => {
    const title = escapeHtml(
      document.name || document.key || "Requested document",
    );
    const description = document.description
      ? `<p style="margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: #555555;">${
        escapeHtml(document.description)
      }</p>`
      : "";
    const badge = document.isReplacement
      ? `<span style="display: inline-block; margin-left: 8px; padding: 2px 7px; border-radius: 999px; background: #fff4e5; color: #9a5a00; font-size: 11px; font-weight: 700;">Replacement needed</span>`
      : "";
    return `<li style="margin: 0 0 10px; padding: 0;">
      <p style="margin: 0; font-size: 15px; line-height: 1.35; color: #171717; font-weight: 700;">${title}${badge}</p>
      ${description}
    </li>`;
  }).join("");
  const suffix = remainingCount
    ? `<p style="margin: 8px 0 0; font-size: 13px; line-height: 1.45; color: #555555;">Plus ${remainingCount} more item${
      remainingCount === 1 ? "" : "s"
    } in your portal checklist.</p>`
    : "";
  return `<div style="margin: 0 0 16px; padding: 16px 18px; border: 1px solid #DDDDDA; background: #F7F7F5;">
    <p style="margin: 0 0 6px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #171717; font-weight: 700;">Documents requested</p>
    <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.45; color: #555555;">${
    sellerStructureLabel
      ? `Based on your ${
        escapeHtml(sellerStructureLabel.toLowerCase())
      } onboarding profile, please upload:`
      : "Please upload the documents that apply to your seller and property profile:"
  }</p>
    <ul style="margin: 0; padding-left: 20px;">${rows}</ul>
    ${suffix}
  </div>`;
}

function renderRequiredDocumentsText(
  requiredDocuments: unknown,
  sellerStructure: unknown,
) {
  const documents = normalizeRequiredDocuments(requiredDocuments);
  if (!documents.length) return [];
  const sellerStructureLabel = resolveSellerStructureLabel(sellerStructure);
  const header = sellerStructureLabel
    ? `Documents requested for your ${sellerStructureLabel.toLowerCase()} profile:`
    : "Documents requested:";
  return [
    header,
    ...documents.map((document, index) => {
      const replacement = document.isReplacement ? " - replacement needed" : "";
      return `${index + 1}. ${document.name || document.key}${replacement}`;
    }),
  ];
}

function pickSellerInvitationTitle(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized === "Your Property Sale Starts Here" ||
    normalized === "Welcome to your property transaction workspace."
  ) {
    return "Let's get your property ready.";
  }
  return normalized;
}

function pickSellerInvitationCta(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized === "Complete Seller Onboarding" ||
    normalized === "Complete Seller Information" ||
    normalized === "Start seller onboarding"
  ) {
    return "Complete your seller profile";
  }
  return normalized;
}

function pickSellerInvitationPreheader(
  value: string | undefined,
  agencyName: string,
) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized ===
      "Your agent has invited you to complete seller information for your property." ||
    normalized ===
      `${agencyName} has prepared your secure seller workspace on Arch9.`
  ) {
    return `${agencyName} has prepared a secure seller intake for your property sale.`;
  }
  return normalized;
}

function formatExpiryCopy(expiryDays: number) {
  if (!Number.isFinite(expiryDays) || expiryDays <= 0) {
    return "This secure link expires soon.";
  }
  return `This secure link expires in ${expiryDays} ${
    expiryDays === 1 ? "day" : "days"
  }.`;
}

function buildPremiumSellerOnboardingInvitationHtml({
  sellerName,
  agencyName,
  agencyLogoUrl,
  onboardingUrl,
  expiryDays,
  propertyLabel,
  agentName,
  referenceLabel,
  agentEmail,
  agentPhone,
  ctaLabel,
  preheader,
  title,
  branding,
}: {
  sellerName: string;
  agencyName: string;
  agencyLogoUrl?: string;
  onboardingUrl: string;
  expiryDays: number;
  propertyLabel?: string;
  agentName?: string;
  referenceLabel?: string;
  agentEmail?: string;
  agentPhone?: string;
  ctaLabel?: string;
  preheader?: string;
  title?: string;
  branding?: BridgeEmailLayoutBranding;
}) {
  const questionContact = [agentEmail, agentPhone].map((item) =>
    String(item || "").trim()
  ).filter(Boolean).join(" | ");
  return renderOnboardingInvitation({
    organisationName: agencyName,
    organisationLogoUrl: agencyLogoUrl,
    branding,
    preheader: pickSellerInvitationPreheader(preheader, agencyName),
    eyebrow: "Seller onboarding",
    title: pickSellerInvitationTitle(title),
    recipientName: pickText(sellerName, "there"),
    introParagraphs: [
      `${agencyName} has prepared a secure seller intake for your property sale. Share your ownership and property details so your agent can prepare the next step with you.`,
    ],
    ctaLabel: pickSellerInvitationCta(ctaLabel),
    ctaUrl: onboardingUrl,
    timingText: "Allow about 8 minutes. Save as you go and return anytime.",
    steps: [
      { title: "Your details", detail: "Confirm your seller and ownership information." },
      { title: "Your property", detail: "Share the key facts about your sale." },
      { title: "We take it forward", detail: "Your agent reviews the next steps with you." },
    ],
    summaryRows: [
      { label: "Property", value: propertyLabel && !isGenericPropertyLabel(propertyLabel) ? propertyLabel : "" },
      { label: "Agent", value: agentName || "" },
      { label: "Reference", value: referenceLabel || "" },
    ],
    note: formatExpiryCopy(expiryDays),
    helpBody: "Reply to this email or contact your agent directly.",
    contactLine: questionContact,
  });
}

export function buildSellerOnboardingEmailHtml({
  sellerName,
  propertyTitle,
  propertyType,
  transactionReference,
  onboardingLink,
  agentName,
  agentEmail,
  agentPhone,
  organisationName,
  senderOrganisationName,
  senderOrganisationLogoUrl,
  supportEmail,
  supportPhone,
  expiryDays,
  expiresAt,
  emailKind,
  requiredDocuments,
  sellerStructure,
  templateOverrides,
  branding,
}: {
  sellerName: string;
  propertyTitle: string;
  propertyType?: string;
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  organisationName?: string;
  senderOrganisationName?: string;
  senderOrganisationLogoUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  expiryDays?: number | string;
  expiresAt?: string;
  emailKind?: string;
  requiredDocuments?: SellerPortalRequiredDocument[];
  sellerStructure?: unknown;
  branding?: BridgeEmailLayoutBranding;
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
  const normalizedKind = String(emailKind || "").trim().toLowerCase();
  const portalDocumentsMode = normalizedKind === "portal_documents" ||
    normalizedKind === "existing_listing";
  const existingListingMode = normalizedKind === "existing_listing";

  if (!portalDocumentsMode) {
    const followUpMode = normalizedKind === "onboarding_follow_up";
    return buildPremiumSellerOnboardingInvitationHtml({
      sellerName,
      agencyName: pickText(
        senderOrganisationName || organisationName ||
          branding?.organisationName,
        "Your agency",
      ),
      agencyLogoUrl: senderOrganisationLogoUrl,
      onboardingUrl: onboardingLink,
      expiryDays: resolveExpiryDays(expiryDays, expiresAt),
      propertyLabel,
      agentName: agentName || "",
      referenceLabel,
      agentEmail: resolveFirstText(agentEmail, supportEmail),
      agentPhone: resolveFirstText(agentPhone, supportPhone),
      ctaLabel: followUpMode ? "Continue seller onboarding" : templateOverrides?.ctaLabel,
      preheader: followUpMode ? `${agentLabel} is following up on your outstanding seller details.` : templateOverrides?.preheader,
      title: followUpMode ? "A quick reminder from your agent" : templateOverrides?.title,
      branding,
    });
  }

  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    ...(existingListingMode
      ? [
        `${
          senderOrganisationName || organisationName || "Your agency"
        } has invited you to activate your secure Seller Portal for ${
          propertyLabel || "your property"
        }.`,
        "Your property is already listed. The portal gives you one place to follow the sale, receive updates, upload documents, and track the transaction through to registration.",
        "Activate your portal to create your password and get started.",
      ]
      : portalDocumentsMode
      ? [
        "Thanks - your seller onboarding has been submitted.",
        "The next step is to create a password for your secure seller portal before any documents can be viewed or uploaded.",
        "Upload what you have now. Your agent will review the file, confirm what is complete, and let you know if anything needs to be replaced or added.",
      ]
      : [
        "Your agent has invited you to complete the seller onboarding process for your property.",
        "It should only take a few minutes and helps keep your sale moving from the start.",
        "To get everything ready, we need a few details and any available property documents from you.",
      ]),
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    ...(existingListingMode
      ? [
        "Create your Seller Portal password.",
        "Review your property summary, listing status, and assigned agent details.",
        "Upload any outstanding documents securely.",
        "Follow sale progress and transfer updates as they become available.",
      ]
      : portalDocumentsMode
      ? [
        "Open your secure seller portal and set your password before the document centre unlocks.",
        "Review the checklist created from your seller type and property details.",
        "Upload the requested FICA, proof of address, ownership or authority, rates, levy, bond, and property documents that apply to your sale.",
        "Your agent reviews the uploads, marks anything outstanding, and prepares the next mandate or listing step.",
        "Return to the same secure portal for updates and any follow-up document requests.",
      ]
      : [
        "Complete your seller profile.",
        "Upload any available property documents.",
        "Your agent reviews everything and prepares the property for listing.",
        "We'll keep you updated as your sale progresses.",
      ]),
  ]);
  const ctaLabel = pickText(
    templateOverrides?.ctaLabel,
    existingListingMode
      ? "Activate Seller Portal"
      : portalDocumentsMode
      ? "Set Password & Upload Documents"
      : "Complete Seller Information",
  );
  const securityTitle = pickText(
    templateOverrides?.securityTitle,
    "Trust & Security",
  );
  const securityBody = pickText(
    templateOverrides?.securityBody,
    existingListingMode
      ? "Your Seller Portal is password protected. Only authorised parties linked to your sale can access the property and transaction information."
      : portalDocumentsMode
      ? "Because this portal may contain identity, ownership, and property records, the document centre is password protected and only shared with authorised parties involved in your sale."
      : "Your information is securely stored and only shared with authorised parties involved in your property sale.",
  );
  const helpBody = pickText(
    templateOverrides?.helpBody,
    "Need help? Reply to this email or contact your agent directly.",
  );

  const contentHtml = [
    renderBridgeIntroParagraphs(introParagraphs),
    renderBridgeCta(ctaLabel, onboardingLink, {
      primaryColor: branding?.primaryColor,
    }),
    `<div style="margin: 22px 0; padding: 16px 18px; border: 1px solid #DDDDDA; background: #F7F7F5;">
       <p style="margin: 0 0 10px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #171717; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    portalDocumentsMode && !existingListingMode
      ? renderRequiredDocumentsHtml(requiredDocuments, sellerStructure)
      : "",
    `<div style="margin: 0 0 16px; padding: 14px 16px; border: 1px solid #DDDDDA; background: #F7F7F5;">
       <p style="margin: 0 0 4px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #555555; font-weight: 700;">Estimated Completion Time</p>
       <p style="margin: 0; font-size: 16px; line-height: 1.4; color: #171717; font-weight: 700;">${
      existingListingMode
        ? "2 Minutes"
        : portalDocumentsMode
        ? "2-5 Minutes"
        : "5-10 Minutes"
    }</p>
     </div>`,
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyLabel },
        { label: "Agent", value: agentLabel },
        { label: "Reference", value: referenceLabel },
      ],
      "Property Summary",
    ),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: pickText(
      templateOverrides?.preheader,
      existingListingMode
        ? "Activate your secure Seller Portal to follow your listed property sale, updates, documents, and transaction progress."
        : portalDocumentsMode
        ? "Create your seller portal password first, then upload the documents needed for FICA, mandate preparation, and listing readiness."
        : "Your agent has invited you to complete seller information for your property.",
    ),
    title: pickText(
      templateOverrides?.title,
      existingListingMode
        ? "Activate your Seller Portal"
        : portalDocumentsMode
        ? "Your seller portal is ready"
        : "Complete your seller profile",
    ),
    greeting: `Hi ${sellerName || "there"},`,
    contentHtml,
    securityTitle,
    securityBody,
    helpBody,
    organisationName: organisationName || "Arch9",
    senderOrganisationName,
    senderOrganisationLogoUrl,
    supportEmail: supportEmail || "",
    supportPhone: supportPhone || "",
    branding,
  });
}

export function buildSellerOnboardingEmailText({
  sellerName,
  propertyTitle,
  propertyType,
  transactionReference,
  onboardingLink,
  agentName,
  agentEmail,
  agentPhone,
  organisationName,
  supportEmail,
  supportPhone,
  expiryDays,
  expiresAt,
  emailKind,
  requiredDocuments,
  sellerStructure,
  templateOverrides,
}: {
  sellerName: string;
  propertyTitle: string;
  propertyType?: string;
  transactionReference?: string;
  onboardingLink: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  expiryDays?: number | string;
  expiresAt?: string;
  emailKind?: string;
  requiredDocuments?: SellerPortalRequiredDocument[];
  sellerStructure?: unknown;
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
  const normalizedKind = String(emailKind || "").trim().toLowerCase();
  const portalDocumentsMode = normalizedKind === "portal_documents" ||
    normalizedKind === "existing_listing";
  const existingListingMode = normalizedKind === "existing_listing";

  if (!portalDocumentsMode) {
    const agencyName = pickText(organisationName, "Your agency");
    const days = resolveExpiryDays(expiryDays, expiresAt);
    if (normalizedKind === "onboarding_follow_up") {
      return [
        "SELLER ONBOARDING REMINDER",
        "",
        `Hi ${sellerName || "there"},`,
        "",
        `${agentLabel} is following up on the seller information still needed for your property sale.`,
        "Please use your secure link below to continue where you left off.",
        "",
        "Continue seller onboarding:",
        onboardingLink,
        "",
        propertyLabel && !isGenericPropertyLabel(propertyLabel) ? `Property: ${propertyLabel}` : null,
        agentName ? `Agent: ${agentName}` : null,
        formatExpiryCopy(days),
        "",
        "If you have already completed this, no further action is needed.",
      ].filter(Boolean).join("\n");
    }
    const resolvedCtaLabel = pickSellerInvitationCta(
      templateOverrides?.ctaLabel,
    );
    const questionContact = [
      resolveFirstText(agentEmail, supportEmail),
      resolveFirstText(agentPhone, supportPhone),
    ].filter(Boolean).join(" | ");
    return [
      "SELLER INFORMATION",
      "",
      `Hi ${sellerName || "there"},`,
      "",
      `${agencyName} has prepared a secure seller intake for your property sale.`,
      "Please complete your seller profile so your agent can confirm ownership details, property facts, and the documents needed for mandate and listing readiness.",
      "",
      `${resolvedCtaLabel}:`,
      onboardingLink,
      "",
      "This usually takes about 8 minutes. You can complete it on any device.",
      "",
      "What you will need:",
      "1. Your contact, FICA, and ownership details.",
      "2. Core property information for the sale record.",
      "3. Any mandate, rates, levy, bond, or property documents you already have available.",
      "",
      "What happens after you submit:",
      "Your agent will review your answers, confirm anything outstanding, and prepare the next step in the mandate and listing workflow.",
      "",
      "Security:",
      "Your information is stored securely in Arch9 and is shared only with authorised people working on your sale.",
      formatExpiryCopy(days),
      "",
      propertyLabel && !isGenericPropertyLabel(propertyLabel)
        ? `Property: ${propertyLabel}`
        : null,
      agentName ? `Agent: ${agentName}` : null,
      referenceLabel ? `Reference: ${referenceLabel}` : null,
      questionContact
        ? `Questions: ${questionContact}`
        : "Questions: Please contact your agent directly or reply to this email.",
      "",
      agencyName,
      "Powered by Arch9",
    ].filter(Boolean).join("\n");
  }

  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    ...(existingListingMode
      ? [
        `${
          organisationName || "Your agency"
        } has invited you to activate your secure Seller Portal for ${
          propertyLabel || "your property"
        }.`,
        "Your property is already listed. The portal gives you one place to follow the sale, receive updates, upload documents, and track the transaction through to registration.",
        "Activate your portal to create your password and get started.",
      ]
      : portalDocumentsMode
      ? [
        "Your seller onboarding has been submitted. The next step is to create a password for your secure seller portal before any documents can be viewed or uploaded.",
        "The link will ask you to set a password before uploading the documents, then guide you through the items normally needed for FICA, proof of ownership or authority, mandate preparation, and listing readiness.",
        "Upload what you have now. Your agent will review the file, confirm what is complete, and let you know if anything needs to be replaced or added.",
      ]
      : [
        "Your agent has invited you to complete the seller onboarding process for your property.",
        "This should only take a few minutes and helps ensure your property sale progresses smoothly from the start.",
        "To get everything ready, we need a few details and any available property documents from you.",
      ]),
  ]);
  const processSteps = pickLines(templateOverrides?.processSteps, [
    ...(existingListingMode
      ? [
        "Create your Seller Portal password.",
        "Review your property summary, listing status, and assigned agent details.",
        "Upload any outstanding documents securely.",
        "Follow sale progress and transfer updates as they become available.",
      ]
      : portalDocumentsMode
      ? [
        "Open your secure seller portal and set your password before the document centre unlocks.",
        "Review the checklist created from your seller type and property details.",
        "Upload the requested FICA, proof of address, ownership or authority, rates, levy, bond, and property documents that apply to your sale.",
        "Your agent reviews the uploads, marks anything outstanding, and prepares the next mandate or listing step.",
        "Return to the same secure portal for updates and any follow-up document requests.",
      ]
      : [
        "Complete your seller profile.",
        "Upload any available property documents.",
        "Your agent reviews everything and prepares the property for listing.",
        "We'll keep you updated as your sale progresses.",
      ]),
  ]);
  const ctaLabel = pickText(
    templateOverrides?.ctaLabel,
    existingListingMode
      ? "Activate Seller Portal"
      : portalDocumentsMode
      ? "Set Password & Upload Documents"
      : "Complete Seller Information",
  );
  const securityBody = pickText(
    templateOverrides?.securityBody,
    existingListingMode
      ? "Your Seller Portal is password protected. Only authorised parties linked to your sale can access the property and transaction information."
      : portalDocumentsMode
      ? "Because this portal may contain identity, ownership, and property records, the document centre is password protected and only shared with authorised parties involved in your sale."
      : "Your information is securely stored and only shared with authorised parties involved in your property sale.",
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
    ...(existingListingMode
      ? []
      : renderRequiredDocumentsText(requiredDocuments, sellerStructure)),
    ...(portalDocumentsMode && !existingListingMode &&
        normalizeRequiredDocuments(requiredDocuments).length
      ? [""]
      : []),
    `Estimated Completion Time: ${
      existingListingMode
        ? "2 Minutes"
        : portalDocumentsMode
        ? "2-5 Minutes"
        : "5-10 Minutes"
    }`,
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
    organisationName || "Arch9",
    "Powered by Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
