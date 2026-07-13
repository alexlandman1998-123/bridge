import {
  escapeHtml,
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
  emailKind = "onboarding",
) {
  if (String(emailKind || "").trim().toLowerCase() === "portal_documents") {
    const propertyLabel = resolvePropertyLabel(propertyTitle, propertyType);
    if (propertyLabel && !isGenericPropertyLabel(propertyLabel)) {
      return `Upload your seller documents for ${propertyLabel}`;
    }
    if (propertyType) {
      return `Upload your seller documents for ${propertyType}`;
    }
    return "Upload your seller documents";
  }
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

function getInitial(value: string, fallback = "A") {
  const match = String(value || "").trim().match(/[a-z0-9]/i);
  return (match?.[0] || fallback).toUpperCase();
}

function isHostedRasterImageUrl(value: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const isHttpImage = parsed.protocol === "https:" || parsed.protocol === "http:";
    return isHttpImage && !parsed.pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

function renderSellerOnboardingCta(label: string, url: string) {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="arch9-cta-table" style="border-collapse: separate; border-spacing: 0;">
      <tr>
        <td align="center" bgcolor="#006B4D" style="border-radius: 6px; background: #006B4D;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="10%" stroke="f" fillcolor="#006B4D">
            <w:anchorlock/>
            <center style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${safeLabel} &rarr;</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${safeUrl}" class="arch9-cta-link" style="display: inline-block; min-width: 236px; padding: 16px 18px; border-radius: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 16px; color: #FFFFFF; font-weight: 700; text-align: center; text-decoration: none; background: #006B4D;">
            ${safeLabel}&nbsp;&nbsp;&rarr;
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;
}

function renderAgencyLogo({ agencyName, agencyLogoUrl }: { agencyName: string; agencyLogoUrl?: string }) {
  const safeAgencyName = escapeHtml(agencyName);
  const safeLogoUrl = agencyLogoUrl && isHostedRasterImageUrl(agencyLogoUrl) ? escapeHtml(agencyLogoUrl) : "";
  if (safeLogoUrl) {
    return `<img src="${safeLogoUrl}" alt="${safeAgencyName} logo" width="150" style="display: block; width: 150px; max-width: 150px; height: auto; border: 0; outline: none; text-decoration: none;" />`;
  }

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="right" style="border-collapse: collapse;">
      <tr>
        <td width="44" valign="middle" style="width: 44px; padding: 0 10px 0 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="40" style="border-collapse: separate; border-spacing: 0;">
            <tr>
              <td align="center" valign="middle" bgcolor="#FFF8E6" style="width: 40px; height: 40px; border: 1px solid #D69E2E; border-radius: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 22px; line-height: 40px; color: #D69E2E;">
                ${escapeHtml(getInitial(agencyName, "A"))}
              </td>
            </tr>
          </table>
        </td>
        <td valign="middle" style="font-family: Arial, Helvetica, sans-serif; font-size: 18px; line-height: 1.2; color: #17233A; font-weight: 700;">
          ${safeAgencyName}
        </td>
      </tr>
    </table>
  `;
}

function pickSellerInvitationTitle(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized === "Your Property Sale Starts Here" ||
    normalized === "Welcome to your property transaction workspace."
  ) {
    return "Complete your seller information";
  }
  return normalized;
}

function pickSellerInvitationCta(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized === "Complete Seller Onboarding" ||
    normalized === "Complete Seller Information"
  ) {
    return "Complete seller information";
  }
  return normalized;
}

function pickSellerInvitationPreheader(value: string | undefined, agencyName: string) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized === "Your agent has invited you to complete seller information for your property." ||
    normalized === `${agencyName} has prepared your secure seller workspace on Arch9.`
  ) {
    return `${agencyName} needs a few details to get your property sale ready.`;
  }
  return normalized;
}

function formatExpiryCopy(expiryDays: number) {
  if (!Number.isFinite(expiryDays) || expiryDays <= 0) {
    return "This secure link expires soon.";
  }
  return `This secure link expires in ${expiryDays} ${expiryDays === 1 ? "day" : "days"}.`;
}

function renderSimpleBullet(copy: string) {
  return `
    <tr>
      <td width="18" valign="top" style="width: 18px; padding: 2px 8px 8px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #006B4D;">&bull;</td>
      <td valign="top" style="padding: 0 0 8px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.55; color: #334155;">${escapeHtml(copy)}</td>
    </tr>
  `;
}

function renderSummaryRows(rows: { label: string; value: string }[]) {
  const visibleRows = rows.filter((row) => row.label && row.value);
  if (!visibleRows.length) return "";
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 22px 0 0; border-collapse: separate; border-spacing: 0; border: 1px solid #E2E8F0; border-radius: 8px; background: #F8FAFC;">
      <tr>
        <td style="padding: 16px 18px; font-family: Arial, Helvetica, sans-serif;">
          ${visibleRows.map((row, index) => `
            <p style="margin: ${index === 0 ? "0" : "8px"} 0 0; font-size: 13px; line-height: 1.5; color: #334155;">
              <strong style="color: #17233A;">${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}
            </p>
          `).join("")}
        </td>
      </tr>
    </table>
  `;
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
}) {
  const resolvedCtaLabel = pickSellerInvitationCta(ctaLabel);
  const resolvedPreheader = pickSellerInvitationPreheader(preheader, agencyName);
  const resolvedTitle = pickSellerInvitationTitle(title);
  const greetingName = pickText(sellerName, "there");
  const safeOnboardingUrl = escapeHtml(onboardingUrl);
  const expiryCopy = formatExpiryCopy(expiryDays);
  const questionContact = [agentEmail, agentPhone].map((item) => String(item || "").trim()).filter(Boolean).join(" | ");
  const summaryHtml = renderSummaryRows([
    {
      label: "Property",
      value: propertyLabel && !isGenericPropertyLabel(propertyLabel) ? propertyLabel : "",
    },
    { label: "Agent", value: agentName || "" },
    { label: "Reference", value: referenceLabel || "" },
  ]);

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Seller onboarding</title>
    <style>
      @media screen and (max-width: 480px) {
        .arch9-shell { width: 100% !important; max-width: 100% !important; }
        .arch9-outer { padding: 0 !important; }
        .arch9-header { height: 56px !important; padding-left: 20px !important; padding-right: 20px !important; }
        .arch9-padded { padding-left: 20px !important; padding-right: 20px !important; }
        .arch9-footer-col { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; text-align: left !important; }
        .arch9-cta-table { width: 100% !important; }
        .arch9-cta-link { display: block !important; min-width: 0 !important; width: auto !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #F6F8FA; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">
      ${escapeHtml(resolvedPreheader)}
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#F6F8FA" style="width: 100%; background: #F6F8FA; border-collapse: collapse;">
      <tr>
        <td align="center" class="arch9-outer" style="padding: 32px 12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="arch9-shell" style="width: 600px; max-width: 600px; border-collapse: separate; border-spacing: 0; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
            <tr>
              <td class="arch9-header" bgcolor="#071E1A" height="72" valign="middle" style="height: 72px; padding: 0 32px; background: #071E1A; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0; font-size: 20px; line-height: 1; letter-spacing: 0.52em; color: #FFFFFF; font-weight: 700;">ARCH9</p>
              </td>
            </tr>
            <tr>
              <td class="arch9-padded" style="padding: 36px 32px 0; background: #FFFFFF; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0 0 14px; font-size: 12px; line-height: 1.3; letter-spacing: 0.12em; color: #006B4D; font-weight: 700; text-transform: uppercase;">Seller information</p>
                <h1 style="margin: 0; font-size: 30px; line-height: 1.2; color: #17233A; font-weight: 700;">${escapeHtml(resolvedTitle)}</h1>
                <p style="margin: 22px 0 0; font-size: 16px; line-height: 1.65; color: #334155;">Hi ${escapeHtml(greetingName)},</p>
                <p style="margin: 10px 0 0; font-size: 16px; line-height: 1.65; color: #334155;">${escapeHtml(agencyName)} needs a few details from you before your property sale can move ahead.</p>
                <p style="margin: 10px 0 0; font-size: 16px; line-height: 1.65; color: #334155;">Please complete the secure form so your agent can verify the basics, prepare the right documents, and let you know if anything else is needed.</p>

                <div style="margin: 26px 0 0;">${renderSellerOnboardingCta(resolvedCtaLabel, onboardingUrl)}</div>
                <p style="margin: 12px 0 0; font-size: 12px; line-height: 1.55; color: #64748B;">If the button does not work, copy this secure link:<br /><a href="${safeOnboardingUrl}" style="color: #006B4D; text-decoration: underline; word-break: break-all;">${safeOnboardingUrl}</a></p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 26px 0 0; border-collapse: separate; border-spacing: 0; border: 1px solid #DCE7E2; border-radius: 8px; background: #F7FBF9;">
                  <tr>
                    <td style="padding: 18px; font-family: Arial, Helvetica, sans-serif;">
                      <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.5; color: #17233A; font-weight: 700;">This usually takes about 8-10 minutes.</p>
                      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">You can complete it on any device. Your information is stored securely in Arch9 and is only shared with authorised people working on your sale.</p>
                    </td>
                  </tr>
                </table>

                <h2 style="margin: 28px 0 12px; font-size: 18px; line-height: 1.35; color: #17233A; font-weight: 700;">What you will need</h2>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: collapse;">
                  ${renderSimpleBullet("Your contact and ownership details.")}
                  ${renderSimpleBullet("Basic property information.")}
                  ${renderSimpleBullet("Any property or identity documents you already have available.")}
                </table>

                <h2 style="margin: 20px 0 8px; font-size: 18px; line-height: 1.35; color: #17233A; font-weight: 700;">What happens after you submit</h2>
                <p style="margin: 0; font-size: 15px; line-height: 1.65; color: #334155;">Your agent will review your answers and contact you if anything needs to be added or corrected. After that, they can prepare the next step for your property sale.</p>
                <p style="margin: 14px 0 0; font-size: 13px; line-height: 1.55; color: #64748B;">${escapeHtml(expiryCopy)}</p>

                ${summaryHtml}

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 28px 0 0;">
                  <tr>
                    <td class="arch9-footer-col" width="52%" valign="top" style="width: 52%; padding: 0 20px 0 0; font-family: Arial, Helvetica, sans-serif;">
                      <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.4; color: #17233A; font-weight: 700;">Questions?</p>
                      <p style="margin: 0; font-size: 12px; line-height: 1.55; color: #334155;">Please contact your agent directly or reply to this email.</p>
                      ${questionContact ? `<p style="margin: 8px 0 0; font-size: 12px; line-height: 1.55; color: #64748B;">${escapeHtml(questionContact)}</p>` : ""}
                    </td>
                    <td class="arch9-footer-col" width="48%" valign="top" align="right" style="width: 48%; padding: 0 0 0 20px;">
                      ${renderAgencyLogo({ agencyName, agencyLogoUrl })}
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" align="center" style="padding: 26px 0 22px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5; color: #8A94A6;">
                      ${escapeHtml(agencyName)} &middot; Powered by Arch9
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  senderOrganisationName?: string;
  senderOrganisationLogoUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  expiryDays?: number | string;
  expiresAt?: string;
  emailKind?: string;
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
  const portalDocumentsMode = String(emailKind || "").trim().toLowerCase() === "portal_documents";

  if (!portalDocumentsMode) {
    return buildPremiumSellerOnboardingInvitationHtml({
      sellerName,
      agencyName: pickText(senderOrganisationName || organisationName, "Your agency"),
      agencyLogoUrl: senderOrganisationLogoUrl,
      onboardingUrl: onboardingLink,
      expiryDays: resolveExpiryDays(expiryDays, expiresAt),
      propertyLabel,
      agentName: agentName || "",
      referenceLabel,
      agentEmail: resolveFirstText(agentEmail, supportEmail),
      agentPhone: resolveFirstText(agentPhone, supportPhone),
      ctaLabel: templateOverrides?.ctaLabel,
      preheader: templateOverrides?.preheader,
      title: templateOverrides?.title,
    });
  }

  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    ...(portalDocumentsMode
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
    ...(portalDocumentsMode
      ? [
        "Open your secure seller portal and set your password before the document centre unlocks.",
        "Review the checklist created from your seller type and property details.",
        "Upload the requested FICA, proof of address, ownership or authority, rates, levy, bond, and property documents that apply to your sale.",
        "Your agent reviews the uploads, marks anything outstanding, and prepares the next mandate or listing step.",
        "Return to the same secure portal for updates and any follow-up document requests.",
      ]
      : [
        "Complete your seller information.",
        "Upload any available property documents.",
        "Your agent reviews everything and prepares the property for listing.",
        "We'll keep you updated as your sale progresses.",
      ]),
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, portalDocumentsMode ? "Set Password & Upload Documents" : "Complete Seller Information");
  const securityTitle = pickText(templateOverrides?.securityTitle, "Trust & Security");
  const securityBody = pickText(
    templateOverrides?.securityBody,
    portalDocumentsMode
      ? "Because this portal may contain identity, ownership, and property records, the document centre is password protected and only shared with authorised parties involved in your sale."
      : "Your information is securely stored and only shared with authorised parties involved in your property sale.",
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
       <p style="margin: 0; font-size: 16px; line-height: 1.4; color: #0f2f4f; font-weight: 700;">${portalDocumentsMode ? "2-5 Minutes" : "5-10 Minutes"}</p>
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
      portalDocumentsMode
        ? "Create your seller portal password first, then upload the documents needed for FICA, mandate preparation, and listing readiness."
        : "Your agent has invited you to complete seller information for your property.",
    ),
    title: pickText(templateOverrides?.title, portalDocumentsMode ? "Upload Seller Documents" : "Complete your seller information"),
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
  const portalDocumentsMode = String(emailKind || "").trim().toLowerCase() === "portal_documents";

  if (!portalDocumentsMode) {
    const agencyName = pickText(organisationName, "Your agency");
    const days = resolveExpiryDays(expiryDays, expiresAt);
    const resolvedCtaLabel = pickSellerInvitationCta(templateOverrides?.ctaLabel);
    const questionContact = [
      resolveFirstText(agentEmail, supportEmail),
      resolveFirstText(agentPhone, supportPhone),
    ].filter(Boolean).join(" | ");
    return [
      "SELLER INFORMATION",
      "",
      `Hi ${sellerName || "there"},`,
      "",
      `${agencyName} needs a few details from you before your property sale can move ahead.`,
      "Please complete the secure form so your agent can verify the basics, prepare the right documents, and let you know if anything else is needed.",
      "",
      `${resolvedCtaLabel}:`,
      onboardingLink,
      "",
      "This usually takes about 8-10 minutes. You can complete it on any device.",
      "",
      "What you will need:",
      "1. Your contact and ownership details.",
      "2. Basic property information.",
      "3. Any property or identity documents you already have available.",
      "",
      "What happens after you submit:",
      "Your agent will review your answers and contact you if anything needs to be added or corrected. After that, they can prepare the next step for your property sale.",
      "",
      "Security:",
      "Your information is stored securely in Arch9 and is only shared with authorised people working on your sale.",
      formatExpiryCopy(days),
      "",
      propertyLabel && !isGenericPropertyLabel(propertyLabel) ? `Property: ${propertyLabel}` : null,
      agentName ? `Agent: ${agentName}` : null,
      referenceLabel ? `Reference: ${referenceLabel}` : null,
      questionContact ? `Questions: ${questionContact}` : "Questions: Please contact your agent directly or reply to this email.",
      "",
      agencyName,
      "Powered by Arch9",
    ].filter(Boolean).join("\n");
  }

  const introParagraphs = pickLines(templateOverrides?.introParagraphs, [
    ...(portalDocumentsMode
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
    ...(portalDocumentsMode
      ? [
        "Open your secure seller portal and set your password before the document centre unlocks.",
        "Review the checklist created from your seller type and property details.",
        "Upload the requested FICA, proof of address, ownership or authority, rates, levy, bond, and property documents that apply to your sale.",
        "Your agent reviews the uploads, marks anything outstanding, and prepares the next mandate or listing step.",
        "Return to the same secure portal for updates and any follow-up document requests.",
      ]
      : [
        "Complete your seller information.",
        "Upload any available property documents.",
        "Your agent reviews everything and prepares the property for listing.",
        "We'll keep you updated as your sale progresses.",
      ]),
  ]);
  const ctaLabel = pickText(templateOverrides?.ctaLabel, portalDocumentsMode ? "Set Password & Upload Documents" : "Complete Seller Information");
  const securityBody = pickText(
    templateOverrides?.securityBody,
    portalDocumentsMode
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
    `Estimated Completion Time: ${portalDocumentsMode ? "2-5 Minutes" : "5-10 Minutes"}`,
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
