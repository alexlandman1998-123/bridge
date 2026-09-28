import {
  type EmailBranding,
  normalizeBrandColor,
  normalizeEmailBranding,
} from "../services/emailBranding.ts";

export type BridgeEmailSummaryField = {
  label: string;
  value: string;
};

export type BridgeEmailLayoutBranding = Partial<EmailBranding>;

export function isHostedRasterImageUrl(value: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

export function firstEmailLogo(...values: (string | undefined)[]) {
  return values.find((value) => value && isHostedRasterImageUrl(value)) || "";
}

export function brandColorLuminance(value: string) {
  const hex = value.slice(1);
  const expanded = hex.length === 3
    ? hex.split("").map((part) => part + part).join("")
    : hex;
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(expanded.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBridgeIntroParagraphs(paragraphs: string[]) {
  return paragraphs
    .filter(Boolean)
    .map((paragraph) =>
      `<p style="margin: 0 0 12px; font-size: 15px; line-height: 1.65; color: #333333;">${
        escapeHtml(paragraph)
      }</p>`
    )
    .join("");
}

export function renderBridgeBullets(items: string[]) {
  const points = items.filter(Boolean);
  if (!points.length) return "";
  return `
    <ul style="margin: 0; padding: 0 0 0 18px; color: #333333;">
      ${
    points.map((item) =>
      `<li style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">${
        escapeHtml(item)
      }</li>`
    ).join("")
  }
    </ul>
  `;
}

export function renderBridgeSteps(items: string[]) {
  const steps = items.filter(Boolean);
  if (!steps.length) return "";
  return `
    <ol style="margin: 0; padding: 0 0 0 18px; color: #333333;">
      ${
    steps.map((item) =>
      `<li style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">${
        escapeHtml(item)
      }</li>`
    ).join("")
  }
    </ol>
  `;
}

export function renderBridgeSummaryCard(
  fields: BridgeEmailSummaryField[],
  title = "Property Summary",
) {
  const rows = fields.filter((field) => field?.label && field?.value);
  if (!rows.length) return "";
  return `
    <div style="margin: 20px 0; padding: 16px 18px; border: 1px solid #DDDDDA; background: #F7F7F5;">
      <p style="margin: 0 0 10px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #171717; font-weight: 700;">${
    escapeHtml(title)
  }</p>
      ${
    rows.map((field) =>
      `<p style="margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: #555555;"><strong style="color: #171717;">${
        escapeHtml(field.label)
      }:</strong> ${escapeHtml(field.value)}</p>`
    ).join("")
  }
    </div>
  `;
}

export function renderBridgeCta(
  label: string,
  url: string,
  options: { primaryColor?: string } = {},
) {
  if (!label || !url) return "";
  const safeUrl = escapeHtml(url);
  const primaryColor = normalizeBrandColor(options.primaryColor, "#07152f");
  const textColor = brandColorLuminance(primaryColor) > 0.18
    ? "#171717"
    : "#FFFFFF";
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 24px 0 0; width: 100%; border-collapse: collapse;">
      <tr><td align="center" bgcolor="${primaryColor}" style="background: ${primaryColor};">
        <a href="${safeUrl}" style="display: block; padding: 19px 20px; color: ${textColor}; background: ${primaryColor}; text-decoration: none; text-transform: uppercase; letter-spacing: 0.04em; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 18px; font-weight: 700;">${escapeHtml(label)}&nbsp;&nbsp;&rarr;</a>
      </td></tr>
    </table>
    <p style="margin: 12px 0 20px; font-size: 11px; line-height: 1.5; color: #686868;">
      If the button does not work, copy and paste this URL into your browser:<br />
      <a href="${safeUrl}" style="color: #333333; text-decoration: underline; word-break: break-all;">${safeUrl}</a>
    </p>
  `;
}

function getInitials(value: string) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join(
    "",
  ) || "A9";
}

export function renderBridgeBrandMark({
  organisationName,
  logoUrl,
  primaryColor,
  onDark = false,
}: {
  organisationName: string;
  logoUrl?: string;
  primaryColor: string;
  onDark?: boolean;
}) {
  const safeOrganisationName = escapeHtml(organisationName || "Arch9");
  const safeLogoUrl = firstEmailLogo(logoUrl) ? escapeHtml(logoUrl || "") : "";
  const safePrimaryColor = normalizeBrandColor(primaryColor, "#07152f");
  if (safeLogoUrl) {
    return `<img src="${safeLogoUrl}" alt="${safeOrganisationName} logo" width="240" style="display: block; max-height: 68px; max-width: 240px; width: auto; height: auto; margin: 0 auto; border: 0; outline: none; text-decoration: none;" />`;
  }

  if (onDark) {
    return `<span style="font-size: 22px; line-height: 1.2; color: #ffffff; font-weight: 800; letter-spacing: -0.02em;">${safeOrganisationName}</span>`;
  }

  return `<div style="width: 52px; height: 52px; border-radius: 14px; background: ${safePrimaryColor}; color: #ffffff; font-size: 18px; font-weight: 800; line-height: 52px; text-align: center;">${
    escapeHtml(getInitials(organisationName))
  }</div>`;
}

export function renderBridgeEmailLayout({
  preheader = "",
  title,
  greeting,
  contentHtml,
  securityTitle = "Security & Privacy",
  securityBody =
    "Your information and documents are handled securely through Arch9. Only authorised parties involved in your transaction can access your onboarding details.",
  helpBody =
    "Need help? Reply to this email or contact your property representative directly.",
  organisationName = "Arch9",
  senderOrganisationName = "",
  senderOrganisationLogoUrl = "",
  supportEmail = "",
  supportPhone = "",
  organisationTagline = "",
  supportWebsite = "",
  footerText = "",
  branding,
}: {
  preheader?: string;
  title: string;
  greeting: string;
  contentHtml: string;
  securityTitle?: string;
  securityBody?: string;
  helpBody?: string;
  organisationName?: string;
  senderOrganisationName?: string;
  senderOrganisationLogoUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  organisationTagline?: string;
  supportWebsite?: string;
  footerText?: string;
  branding?: BridgeEmailLayoutBranding;
}) {
  const resolvedBranding = normalizeEmailBranding({
    organisationName: senderOrganisationName || organisationName,
    logoUrl: senderOrganisationLogoUrl,
    tagline: organisationTagline,
    supportEmail,
    supportPhone,
    website: supportWebsite,
    ...(branding || {}),
  });
  const primaryColor = normalizeBrandColor(
    resolvedBranding.primaryColor,
    "#07152f",
  );
  const secondaryColor = normalizeBrandColor(
    resolvedBranding.secondaryColor,
    "#b48a42",
  );
  const accentColor = brandColorLuminance(secondaryColor) > 0.9
    ? (brandColorLuminance(primaryColor) > 0.9 ? "#171717" : primaryColor)
    : secondaryColor;
  const safeTagline = resolvedBranding.tagline
    ? escapeHtml(resolvedBranding.tagline)
    : "";
  const safeSupportEmail = resolvedBranding.supportEmail
    ? escapeHtml(resolvedBranding.supportEmail)
    : "";
  const safeSupportPhone = resolvedBranding.supportPhone
    ? escapeHtml(resolvedBranding.supportPhone)
    : "";
  const safeWebsite = resolvedBranding.website
    ? escapeHtml(resolvedBranding.website)
    : "";
  const supportParts = [
    safeSupportEmail
      ? `<a href="mailto:${safeSupportEmail}" style="color: ${primaryColor}; text-decoration: none;">${safeSupportEmail}</a>`
      : "",
    safeSupportPhone,
    safeWebsite
      ? `<a href="${safeWebsite}" style="color: ${primaryColor}; text-decoration: none;">${safeWebsite}</a>`
      : "",
  ].filter(Boolean);
  const supportLine = supportParts.join(" · ");
  const safeFooterText = escapeHtml(footerText || `${resolvedBranding.organisationName} · Powered by Arch9`);
  const lightBackgroundLogo = firstEmailLogo(resolvedBranding.logoLightUrl);
  const darkBackgroundLogo = firstEmailLogo(resolvedBranding.logoDarkUrl);
  const genericLogo = firstEmailLogo(
    resolvedBranding.logoUrl,
    resolvedBranding.logoIconUrl,
  );
  const useDarkHeader = !lightBackgroundLogo && !!darkBackgroundLogo &&
    (!genericLogo || genericLogo === darkBackgroundLogo);
  const headerColor = useDarkHeader
    ? (brandColorLuminance(primaryColor) < 0.18 ? primaryColor : "#171717")
    : "#FFFFFF";
  const headerLogoUrl = lightBackgroundLogo ||
    (useDarkHeader ? darkBackgroundLogo : genericLogo);
  const headerBrandHtml = headerLogoUrl
    ? renderBridgeBrandMark({
      organisationName: resolvedBranding.organisationName,
      logoUrl: headerLogoUrl,
      primaryColor,
      onDark: useDarkHeader,
    })
    : `<span style="font-size: 22px; line-height: 1.2; color: ${useDarkHeader ? "#FFFFFF" : "#171717"}; font-weight: 800; letter-spacing: -0.02em;">${escapeHtml(resolvedBranding.organisationName)}</span>`;

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(title)}</title>
    <style>
      @media screen and (max-width: 480px) {
        .arch9-shell { width: 100% !important; max-width: 100% !important; }
        .arch9-outer { padding: 0 !important; }
        .arch9-header { padding: 28px 20px !important; }
        .arch9-padded { padding-left: 20px !important; padding-right: 20px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #F4F4F2; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${escapeHtml(preheader)}</div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#F4F4F2" style="width: 100%; background: #F4F4F2; border-collapse: collapse;">
      <tr><td align="center" class="arch9-outer" style="padding: 32px 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="arch9-shell" style="width: 600px; max-width: 600px; border-collapse: collapse; background: #FFFFFF; border: 1px solid #DDDDDA;">
          <tr><td class="arch9-header" bgcolor="${headerColor}" align="center" valign="middle" style="padding: 32px; background: ${headerColor}; font-family: Arial, Helvetica, sans-serif; text-align: center;">${headerBrandHtml}${safeTagline ? `<p style="margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: ${useDarkHeader ? "#FFFFFF" : "#555555"};">${safeTagline}</p>` : ""}</td></tr>
          <tr><td bgcolor="${accentColor}" height="4" style="height: 4px; line-height: 4px; font-size: 0; background: ${accentColor};">&nbsp;</td></tr>
          <tr><td class="arch9-padded" style="padding: 36px 32px 32px; background: #FFFFFF; font-family: Arial, Helvetica, sans-serif;">
            <p style="margin: 0 0 14px; font-size: 11px; line-height: 1.3; letter-spacing: 0.15em; color: #171717; font-weight: 700; text-transform: uppercase;">From ${escapeHtml(resolvedBranding.organisationName)}</p>
            <h1 style="margin: 0 0 24px; font-size: 32px; line-height: 1.12; letter-spacing: -0.03em; color: #171717; font-weight: 800;">${escapeHtml(title)}</h1>
            <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #171717;">${escapeHtml(greeting)}</p>
            ${contentHtml}
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 26px 0 0; border-collapse: collapse; border-top: 1px solid #DDDDDA;">
              <tr><td style="padding: 22px 0 0; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0 0 5px; font-size: 14px; line-height: 1.4; color: #171717; font-weight: 700;">Support</p>
                <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #555555;">${escapeHtml(helpBody)}</p>
                ${supportLine ? `<p style="margin: 8px 0 0; font-size: 12px; line-height: 1.55; color: #555555;">${supportLine}</p>` : ""}
              </td></tr>
            </table>
            ${securityBody ? `<p style="margin: 18px 0 0; font-size: 12px; line-height: 1.55; color: #606060;"><strong>${escapeHtml(securityTitle)}.</strong> ${escapeHtml(securityBody)}</p>` : ""}
            <p style="margin: 30px 0 0; padding-top: 18px; border-top: 1px solid #DDDDDA; font-size: 11px; line-height: 1.5; letter-spacing: 0.04em; color: #686868; text-align: center;">${safeFooterText}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
