import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeBrandMark,
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "./bridgeEmailLayout.ts";
import { normalizeBrandColor } from "../services/emailBranding.ts";

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
      ? `<p style="margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: #5f7590;">${
        escapeHtml(document.description)
      }</p>`
      : "";
    const badge = document.isReplacement
      ? `<span style="display: inline-block; margin-left: 8px; padding: 2px 7px; border-radius: 999px; background: #fff4e5; color: #9a5a00; font-size: 11px; font-weight: 700;">Replacement needed</span>`
      : "";
    return `<li style="margin: 0 0 10px; padding: 0;">
      <p style="margin: 0; font-size: 15px; line-height: 1.35; color: #0f2f4f; font-weight: 700;">${title}${badge}</p>
      ${description}
    </li>`;
  }).join("");
  const suffix = remainingCount
    ? `<p style="margin: 8px 0 0; font-size: 13px; line-height: 1.45; color: #5f7590;">Plus ${remainingCount} more item${
      remainingCount === 1 ? "" : "s"
    } in your portal checklist.</p>`
    : "";
  return `<div style="margin: 0 0 16px; padding: 16px; border: 1px solid #dbe6f2; border-radius: 14px; background: #ffffff;">
    <p style="margin: 0 0 6px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Documents requested</p>
    <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.45; color: #3f5369;">${
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

function getInitial(value: string, fallback = "A") {
  const match = String(value || "").trim().match(/[a-z0-9]/i);
  return (match?.[0] || fallback).toUpperCase();
}

function isHostedRasterImageUrl(value: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const isHttpImage = parsed.protocol === "https:" ||
      parsed.protocol === "http:";
    return isHttpImage && !parsed.pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

function renderSellerOnboardingCta(
  label: string,
  url: string,
  primaryColor = "#006B4D",
) {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  const buttonColor = normalizeBrandColor(primaryColor, "#006B4D");
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="arch9-cta-table" style="border-collapse: separate; border-spacing: 0;">
      <tr>
        <td align="center" bgcolor="${buttonColor}" style="border-radius: 6px; background: ${buttonColor};">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="10%" stroke="f" fillcolor="${buttonColor}">
            <w:anchorlock/>
            <center style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${safeLabel} &rarr;</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${safeUrl}" class="arch9-cta-link" style="display: inline-block; min-width: 236px; padding: 16px 18px; border-radius: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 16px; color: #FFFFFF; font-weight: 700; text-align: center; text-decoration: none; background: ${buttonColor};">
            ${safeLabel}&nbsp;&nbsp;&rarr;
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;
}

function renderAgencyLogo(
  {
    agencyName,
    agencyLogoUrl,
    primaryColor = "#D69E2E",
  }: { agencyName: string; agencyLogoUrl?: string; primaryColor?: string },
) {
  const safeAgencyName = escapeHtml(agencyName);
  const accentColor = normalizeBrandColor(primaryColor, "#D69E2E");
  const safeLogoUrl = agencyLogoUrl && isHostedRasterImageUrl(agencyLogoUrl)
    ? escapeHtml(agencyLogoUrl)
    : "";
  if (safeLogoUrl) {
    return `<img src="${safeLogoUrl}" alt="${safeAgencyName} logo" width="150" style="display: block; width: 150px; max-width: 150px; height: auto; border: 0; outline: none; text-decoration: none;" />`;
  }

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="right" style="border-collapse: collapse;">
      <tr>
        <td width="44" valign="middle" style="width: 44px; padding: 0 10px 0 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="40" style="border-collapse: separate; border-spacing: 0;">
            <tr>
              <td align="center" valign="middle" bgcolor="#FFF8E6" style="width: 40px; height: 40px; border: 1px solid ${accentColor}; border-radius: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 22px; line-height: 40px; color: ${accentColor};">
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
    return "Complete your seller profile";
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
    return "Start seller onboarding";
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

function renderSimpleBullet(copy: string, primaryColor = "#006B4D") {
  const bulletColor = normalizeBrandColor(primaryColor, "#006B4D");
  return `
    <tr>
      <td width="18" valign="top" style="width: 18px; padding: 2px 8px 8px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: ${bulletColor};">&bull;</td>
      <td valign="top" style="padding: 0 0 8px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.55; color: #334155;">${
    escapeHtml(copy)
  }</td>
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
          ${
    visibleRows.map((row, index) => `
            <p style="margin: ${
      index === 0 ? "0" : "8px"
    } 0 0; font-size: 13px; line-height: 1.5; color: #334155;">
              <strong style="color: #17233A;">${
      escapeHtml(row.label)
    }:</strong> ${escapeHtml(row.value)}
            </p>
          `).join("")
  }
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
  const resolvedCtaLabel = pickSellerInvitationCta(ctaLabel);
  const resolvedPreheader = pickSellerInvitationPreheader(
    preheader,
    agencyName,
  );
  const resolvedTitle = pickSellerInvitationTitle(title);
  const greetingName = pickText(sellerName, "there");
  const safeOnboardingUrl = escapeHtml(onboardingUrl);
  const primaryColor = normalizeBrandColor(branding?.primaryColor, "#071E1A");
  const secondaryColor = normalizeBrandColor(
    branding?.secondaryColor,
    "#006B4D",
  );
  const logoUrl = agencyLogoUrl || branding?.logoUrl || branding?.logoIconUrl;
  const expiryCopy = formatExpiryCopy(expiryDays);
  const questionContact = [agentEmail, agentPhone].map((item) =>
    String(item || "").trim()
  ).filter(Boolean).join(" | ");
  const summaryHtml = renderSummaryRows([
    {
      label: "Property",
      value: propertyLabel && !isGenericPropertyLabel(propertyLabel)
        ? propertyLabel
        : "",
    },
    { label: "Agent", value: agentName || "" },
    { label: "Reference", value: referenceLabel || "" },
  ]);
  const headerBrandHtml = renderBridgeBrandMark({
    organisationName: agencyName,
    logoUrl,
    primaryColor,
    onDark: true,
  });

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
              <td class="arch9-header" bgcolor="${primaryColor}" height="72" valign="middle" style="height: 72px; padding: 0 32px; background: ${primaryColor}; font-family: Arial, Helvetica, sans-serif;">
                ${headerBrandHtml}
              </td>
            </tr>
            <tr>
              <td class="arch9-padded" style="padding: 36px 32px 0; background: #FFFFFF; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0 0 14px; font-size: 12px; line-height: 1.3; letter-spacing: 0.12em; color: ${secondaryColor}; font-weight: 700; text-transform: uppercase;">Seller information</p>
                <h1 style="margin: 0; font-size: 30px; line-height: 1.2; color: #17233A; font-weight: 700;">${
    escapeHtml(resolvedTitle)
  }</h1>
                <p style="margin: 22px 0 0; font-size: 16px; line-height: 1.65; color: #334155;">Hi ${
    escapeHtml(greetingName)
  },</p>
                <p style="margin: 10px 0 0; font-size: 16px; line-height: 1.65; color: #334155;">${
    escapeHtml(agencyName)
  } has prepared a secure seller intake for your property sale.</p>
                <p style="margin: 10px 0 0; font-size: 16px; line-height: 1.65; color: #334155;">Please complete your seller profile so your agent can confirm ownership details, property facts, and the documents needed for mandate and listing readiness.</p>

                <div style="margin: 26px 0 0;">${
    renderSellerOnboardingCta(resolvedCtaLabel, onboardingUrl, primaryColor)
  }</div>
                <p style="margin: 12px 0 0; font-size: 12px; line-height: 1.55; color: #64748B;">If the button does not work, copy this secure link:<br /><a href="${safeOnboardingUrl}" style="color: ${primaryColor}; text-decoration: underline; word-break: break-all;">${safeOnboardingUrl}</a></p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 26px 0 0; border-collapse: separate; border-spacing: 0; border: 1px solid #DCE7E2; border-radius: 8px; background: #F7FBF9;">
                  <tr>
                    <td style="padding: 18px; font-family: Arial, Helvetica, sans-serif;">
                      <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.5; color: #17233A; font-weight: 700;">This usually takes about 8 minutes.</p>
                      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">You can complete it on any device. Your information is stored securely in Arch9 and is shared only with authorised people working on your sale.</p>
                    </td>
                  </tr>
                </table>

                <h2 style="margin: 28px 0 12px; font-size: 18px; line-height: 1.35; color: #17233A; font-weight: 700;">What you will need</h2>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: collapse;">
                  ${
    renderSimpleBullet(
      "Your contact, FICA, and ownership details.",
      primaryColor,
    )
  }
                  ${
    renderSimpleBullet(
      "Core property information for the sale record.",
      primaryColor,
    )
  }
                  ${
    renderSimpleBullet(
      "Any mandate, rates, levy, bond, or property documents you already have available.",
      primaryColor,
    )
  }
                </table>

                <h2 style="margin: 20px 0 8px; font-size: 18px; line-height: 1.35; color: #17233A; font-weight: 700;">What happens after you submit</h2>
                <p style="margin: 0; font-size: 15px; line-height: 1.65; color: #334155;">Your agent will review your answers, confirm anything outstanding, and prepare the next step in the mandate and listing workflow.</p>
                <p style="margin: 14px 0 0; font-size: 13px; line-height: 1.55; color: #64748B;">${
    escapeHtml(expiryCopy)
  }</p>

                ${summaryHtml}

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 28px 0 0;">
                  <tr>
                    <td class="arch9-footer-col" width="52%" valign="top" style="width: 52%; padding: 0 20px 0 0; font-family: Arial, Helvetica, sans-serif;">
                      <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.4; color: #17233A; font-weight: 700;">Questions?</p>
                      <p style="margin: 0; font-size: 12px; line-height: 1.55; color: #334155;">Please contact your agent directly or reply to this email.</p>
                      ${
    questionContact
      ? `<p style="margin: 8px 0 0; font-size: 12px; line-height: 1.55; color: #64748B;">${
        escapeHtml(questionContact)
      }</p>`
      : ""
  }
                    </td>
                    <td class="arch9-footer-col" width="48%" valign="top" align="right" style="width: 48%; padding: 0 0 0 20px;">
                      ${
    renderAgencyLogo({ agencyName, agencyLogoUrl: logoUrl, primaryColor })
  }
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
      ctaLabel: templateOverrides?.ctaLabel,
      preheader: templateOverrides?.preheader,
      title: templateOverrides?.title,
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
        "Follow offers, sale progress, and transfer updates as they become available.",
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
    `<div style="margin: 0 0 16px; padding: 16px; border: 1px solid #dbe6f2; border-radius: 14px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps(processSteps)}
     </div>`,
    portalDocumentsMode && !existingListingMode
      ? renderRequiredDocumentsHtml(requiredDocuments, sellerStructure)
      : "",
    `<div style="margin: 0 0 16px; padding: 14px 16px; border: 1px solid #e3eaf1; border-radius: 12px; background: #f6f8fb;">
       <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #6d8096; font-weight: 700;">Estimated Completion Time</p>
       <p style="margin: 0; font-size: 16px; line-height: 1.4; color: #0f2f4f; font-weight: 700;">${
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
    renderBridgeCta(ctaLabel, onboardingLink, {
      primaryColor: branding?.primaryColor,
    }),
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
        "Follow offers, sale progress, and transfer updates as they become available.",
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
