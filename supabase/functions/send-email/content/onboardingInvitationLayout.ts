import { normalizeBrandColor } from "../services/emailBranding.ts";
import {
  brandColorLuminance,
  type BridgeEmailLayoutBranding,
  escapeHtml,
  firstEmailLogo,
} from "./bridgeEmailLayout.ts";

type InvitationStep = { title: string; detail: string };
type InvitationSummaryRow = { label: string; value: string };

type OnboardingInvitationInput = {
  organisationName: string;
  organisationLogoUrl?: string;
  branding?: BridgeEmailLayoutBranding;
  preheader: string;
  eyebrow: string;
  title: string;
  recipientName: string;
  introParagraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  timingText?: string;
  steps: InvitationStep[];
  summaryRows?: InvitationSummaryRow[];
  note?: string;
  helpBody: string;
  contactLine?: string;
  securityTitle?: string;
  securityBody?: string;
};

function renderCta(label: string, url: string, color: string) {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  const textColor = brandColorLuminance(color) > 0.18 ? "#171717" : "#FFFFFF";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="arch9-cta-table" style="width: 100%; border-collapse: collapse;">
    <tr><td align="center" bgcolor="${color}" style="background: ${color};">
      <!--[if mso]>
      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:56px;v-text-anchor:middle;width:536px;" stroke="f" fillcolor="${color}">
        <w:anchorlock/><center style="color:${textColor};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${safeLabel} &rarr;</center>
      </v:rect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${safeUrl}" class="arch9-cta-link" style="display: block; padding: 19px 20px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 18px; letter-spacing: 0.04em; color: ${textColor}; font-weight: 700; text-align: center; text-decoration: none; text-transform: uppercase; background: ${color};">${safeLabel}&nbsp;&nbsp;&rarr;</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;
}

function renderSteps(steps: InvitationStep[], primaryColor: string) {
  if (!steps.length) return "";
  const stepColor = brandColorLuminance(primaryColor) < 0.18
    ? primaryColor
    : "#171717";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 28px 0 0; border-collapse: collapse; border-top: 1px solid #DDDDDA;">
    <tr><td style="padding: 24px 0 0; font-family: Arial, Helvetica, sans-serif;">
      <p style="margin: 0 0 14px; font-size: 11px; line-height: 1.3; letter-spacing: 0.14em; color: #171717; font-weight: 700; text-transform: uppercase;">What happens next</p>
      ${steps.map((step, index) => `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: collapse;${index ? " border-top: 1px solid #E5E5E2;" : ""}">
        <tr>
          <td width="42" valign="top" style="width: 42px; padding: ${index ? "13px" : "0"} 12px 0 0; color: ${stepColor}; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 800; line-height: 1.4;">${String(index + 1).padStart(2, "0")}</td>
          <td valign="top" style="padding: ${index ? "13px" : "0"} 0 13px; font-family: Arial, Helvetica, sans-serif;">
            <p style="margin: 0; font-size: 14px; line-height: 1.4; color: #171717; font-weight: 700;">${escapeHtml(step.title)}</p>
            ${step.detail ? `<p style="margin: 2px 0 0; font-size: 13px; line-height: 1.5; color: #555555;">${escapeHtml(step.detail)}</p>` : ""}
          </td>
        </tr>
      </table>`).join("")}
    </td></tr>
  </table>`;
}

function renderSummary(rows: InvitationSummaryRow[]) {
  const visibleRows = rows.filter((row) => row.label && row.value);
  if (!visibleRows.length) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 22px 0 0; border-collapse: collapse; border: 1px solid #DDDDDA; background: #F7F7F5;">
    <tr><td style="padding: 16px 18px; font-family: Arial, Helvetica, sans-serif;">
      ${visibleRows.map((row, index) => `<p style="margin: ${index ? "8px" : "0"} 0 0; font-size: 13px; line-height: 1.5; color: #555555;"><strong style="color: #171717;">${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</p>`).join("")}
    </td></tr>
  </table>`;
}

export function renderOnboardingInvitation(input: OnboardingInvitationInput) {
  const agencyName = input.organisationName || "Your agency";
  const primaryColor = normalizeBrandColor(input.branding?.primaryColor, "#171717");
  const requestedAccentColor = normalizeBrandColor(input.branding?.secondaryColor, primaryColor);
  const accentColor = brandColorLuminance(requestedAccentColor) > 0.9
    ? (brandColorLuminance(primaryColor) > 0.9 ? "#171717" : primaryColor)
    : requestedAccentColor;

  // A light-surface variant takes priority; a dark-only logo keeps a dark header.
  const lightBackgroundLogo = firstEmailLogo(input.branding?.logoLightUrl);
  const darkBackgroundLogo = firstEmailLogo(input.branding?.logoDarkUrl);
  const genericLogo = firstEmailLogo(input.branding?.logoUrl, input.organisationLogoUrl, input.branding?.logoIconUrl);
  const useDarkHeader = !lightBackgroundLogo && !!darkBackgroundLogo &&
    (!genericLogo || genericLogo === darkBackgroundLogo);
  const logoUrl = lightBackgroundLogo || (useDarkHeader ? darkBackgroundLogo : genericLogo);
  const headerColor = useDarkHeader
    ? (brandColorLuminance(primaryColor) < 0.18 ? primaryColor : "#171717")
    : "#FFFFFF";
  const headerTextColor = useDarkHeader ? "#FFFFFF" : "#171717";
  const headerBrandHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(agencyName)} logo" width="240" style="display: block; width: auto; max-width: 240px; max-height: 68px; height: auto; margin: 0 auto; border: 0; outline: none; text-decoration: none;" />`
    : `<span style="font-size: 22px; line-height: 1.2; color: ${headerTextColor}; font-weight: 800; letter-spacing: -0.02em;">${escapeHtml(agencyName)}</span>`;
  const contactHtml = input.contactLine
    ? `<p style="margin: 8px 0 0; font-size: 12px; line-height: 1.55; color: #555555;">${escapeHtml(input.contactLine)}</p>`
    : "";
  const securityHtml = input.securityBody
    ? `<p style="margin: 18px 0 0; font-size: 12px; line-height: 1.55; color: #606060;">${input.securityTitle ? `<strong>${escapeHtml(input.securityTitle)}.</strong> ` : ""}${escapeHtml(input.securityBody)}</p>`
    : "";
  const noteHtml = input.note
    ? `<p style="margin: 22px 0 0; font-size: 12px; line-height: 1.55; color: #606060;">${escapeHtml(input.note)}</p>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.eyebrow)}</title>
    <style>
      @media screen and (max-width: 480px) {
        .arch9-shell { width: 100% !important; max-width: 100% !important; }
        .arch9-outer { padding: 0 !important; }
        .arch9-header { padding: 28px 20px !important; }
        .arch9-padded { padding-left: 20px !important; padding-right: 20px !important; }
        .arch9-cta-table { width: 100% !important; }
        .arch9-cta-link { display: block !important; width: auto !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #F4F4F2; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#F4F4F2" style="width: 100%; background: #F4F4F2; border-collapse: collapse;">
      <tr><td align="center" class="arch9-outer" style="padding: 32px 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="arch9-shell" style="width: 600px; max-width: 600px; border-collapse: collapse; background: #FFFFFF; border: 1px solid #DDDDDA;">
          <tr><td class="arch9-header" bgcolor="${headerColor}" align="center" valign="middle" style="padding: 32px; background: ${headerColor}; font-family: Arial, Helvetica, sans-serif; text-align: center;">${headerBrandHtml}</td></tr>
          <tr><td bgcolor="${accentColor}" height="4" style="height: 4px; line-height: 4px; font-size: 0; background: ${accentColor};">&nbsp;</td></tr>
          <tr><td class="arch9-padded" style="padding: 36px 32px 32px; background: #FFFFFF; font-family: Arial, Helvetica, sans-serif;">
            <p style="margin: 0 0 14px; font-size: 11px; line-height: 1.3; letter-spacing: 0.15em; color: #171717; font-weight: 700; text-transform: uppercase;">${escapeHtml(input.eyebrow)}</p>
            <h1 style="margin: 0; font-size: 32px; line-height: 1.12; letter-spacing: -0.03em; color: #171717; font-weight: 800; text-transform: uppercase;">${escapeHtml(input.title)}</h1>
            <p style="margin: 26px 0 0; font-size: 16px; line-height: 1.6; color: #171717;">Hi ${escapeHtml(input.recipientName || "there")},</p>
            ${input.introParagraphs.filter(Boolean).map((paragraph) => `<p style="margin: 10px 0 0; font-size: 15px; line-height: 1.65; color: #333333;">${escapeHtml(paragraph)}</p>`).join("")}
            <div style="margin: 28px 0 0;">${renderCta(input.ctaLabel, input.ctaUrl, primaryColor)}</div>
            ${input.timingText ? `<p style="margin: 12px 0 0; font-size: 12px; line-height: 1.55; color: #606060; text-align: center;">${escapeHtml(input.timingText)}</p>` : ""}
            ${renderSteps(input.steps, primaryColor)}
            ${renderSummary(input.summaryRows || [])}
            ${noteHtml}
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 25px 0 0; border-collapse: collapse; border-top: 1px solid #DDDDDA;">
              <tr><td style="padding: 22px 0 0; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0 0 5px; font-size: 14px; line-height: 1.4; color: #171717; font-weight: 700;">Need a hand?</p>
                <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #555555;">${escapeHtml(input.helpBody)}</p>
                ${contactHtml}
              </td></tr>
            </table>
            ${securityHtml}
            <p style="margin: 22px 0 0; font-size: 11px; line-height: 1.5; color: #686868;">If the button does not work, copy this secure link:<br /><a href="${escapeHtml(input.ctaUrl)}" style="color: #333333; text-decoration: underline; word-break: break-all;">${escapeHtml(input.ctaUrl)}</a></p>
            <p style="margin: 30px 0 0; padding-top: 18px; border-top: 1px solid #DDDDDA; font-size: 11px; line-height: 1.5; letter-spacing: 0.04em; color: #686868; text-align: center;">${escapeHtml(agencyName)} &middot; Powered by Arch9</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
