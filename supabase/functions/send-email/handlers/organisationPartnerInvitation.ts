import { escapeHtml } from "../content/bridgeEmailLayout.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type { SendOrganisationPartnerInvitationPayload } from "../types.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function titleize(value: string) {
  return normalizeText(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveFirstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function resolvePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : fallback;
}

function resolveExpiryDays(payload: SendOrganisationPartnerInvitationPayload) {
  const explicit = resolvePositiveInteger(
    payload.expiryDays ?? payload.expiry_days,
    0,
  );
  if (explicit > 0) return explicit;

  const expiresAt = resolveFirstText(payload.expiresAt, payload.expires_at);
  const expiresTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(expiresTime)) {
    const days = Math.ceil((expiresTime - Date.now()) / 86400000);
    return Math.max(days, 0);
  }

  return 14;
}

function getInitial(value: string, fallback = "A") {
  const match = normalizeText(value).match(/[a-z0-9]/i);
  return (match?.[0] || fallback).toUpperCase();
}

function isAbsoluteImageUrl(value: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const isHttpImage = parsed.protocol === "https:" || parsed.protocol === "http:";
    return isHttpImage && !parsed.pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

function websiteHref(value: string) {
  const website = normalizeText(value);
  if (!website) return "";
  try {
    return new URL(website).toString();
  } catch {
    return `https://${website.replace(/^\/+/, "")}`;
  }
}

function renderOrganisationMark({
  name,
  logoUrl,
  fallback,
  background,
  color,
}: {
  name: string;
  logoUrl?: string;
  fallback: string;
  background: string;
  color: string;
}) {
  const safeName = escapeHtml(name);
  const safeLogoUrl = logoUrl && isAbsoluteImageUrl(logoUrl) ? escapeHtml(logoUrl) : "";
  if (safeLogoUrl) {
    return `
      <td width="48" valign="middle" style="width: 48px; padding: 0 12px 0 0;">
        <img src="${safeLogoUrl}" width="44" alt="${safeName} logo" style="display: block; width: 44px; max-width: 44px; height: auto; border: 0; outline: none; text-decoration: none;" />
      </td>
    `;
  }

  return `
    <td width="48" valign="middle" style="width: 48px; padding: 0 12px 0 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="44" style="width: 44px;">
        <tr>
          <td align="center" valign="middle" bgcolor="${background}" style="width: 44px; height: 44px; border: 1px solid ${color}; border-radius: 8px; font-family: Arial, Helvetica, sans-serif; font-size: 24px; line-height: 44px; color: ${color}; font-weight: 400;">
            ${escapeHtml(fallback)}
          </td>
        </tr>
      </table>
    </td>
  `;
}

function renderOrganisationCard({
  name,
  label,
  logoUrl,
  fallback,
  background = "#FFFFFF",
  color = "#006B4D",
}: {
  name: string;
  label: string;
  logoUrl?: string;
  fallback: string;
  background?: string;
  color?: string;
}) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: separate; border-spacing: 0; width: 100%; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px;">
      <tr>
        <td style="padding: 14px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              ${renderOrganisationMark({ name, logoUrl, fallback, background, color })}
              <td valign="middle" style="font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0; font-size: 18px; line-height: 1.2; color: #17233A; font-weight: 700;">${escapeHtml(name)}</p>
                <p style="margin: 3px 0 0; font-size: 12px; line-height: 1.35; letter-spacing: 0.12em; color: #64748B; text-transform: uppercase;">${escapeHtml(label)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderRelationshipVisual({
  invitingOrganisationName,
  invitingOrganisationLogoUrl,
  partnerName,
  partnerType,
  partnerLogoUrl,
}: {
  invitingOrganisationName: string;
  invitingOrganisationLogoUrl?: string;
  partnerName: string;
  partnerType: string;
  partnerLogoUrl?: string;
}) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" align="right" style="width: 100%;">
      <tr>
        <td align="center" style="padding: 0 0 10px;">
          ${renderOrganisationCard({
            name: invitingOrganisationName,
            label: "Inviting organisation",
            logoUrl: invitingOrganisationLogoUrl,
            fallback: getInitial(invitingOrganisationName, "K"),
            background: "#FFF8E6",
            color: "#D69E2E",
          })}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 2px 0 10px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td bgcolor="#F8FAFC" style="border: 1px solid #E2E8F0; border-radius: 4px; padding: 5px 10px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1; color: #17233A; font-weight: 700;">
                invites
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center">
          ${renderOrganisationCard({
            name: partnerName,
            label: partnerType,
            logoUrl: partnerLogoUrl,
            fallback: getInitial(partnerName, "A"),
            background: "#071E1A",
            color: "#FFFFFF",
          })}
        </td>
      </tr>
    </table>
  `;
}

function renderCta(inviteUrl: string) {
  const safeInviteUrl = escapeHtml(inviteUrl);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="arch9-cta-table" style="border-collapse: separate; border-spacing: 0;">
      <tr>
        <td align="center" bgcolor="#006B4D" style="border-radius: 6px; background: #006B4D;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeInviteUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="10%" stroke="f" fillcolor="#006B4D">
            <w:anchorlock/>
            <center style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Review invitation &rarr;</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${safeInviteUrl}" class="arch9-cta-link" style="display: inline-block; min-width: 204px; padding: 16px 18px; border-radius: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 16px; color: #FFFFFF; font-weight: 700; text-align: center; text-decoration: none; background: #006B4D;">
            Review invitation&nbsp;&nbsp;&rarr;
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;
}

function renderAboutSection() {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #E2E8F0; margin: 28px 0 0;">
      <tr>
        <td class="arch9-about-icon" width="104" valign="top" style="width: 104px; padding: 28px 24px 0 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td align="center" valign="middle" bgcolor="#ECF7F3" style="width: 56px; height: 56px; border-radius: 28px; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 56px; color: #006B4D; font-weight: 700;">
                A9
              </td>
            </tr>
          </table>
        </td>
        <td class="arch9-about-copy" valign="top" style="padding: 30px 0 0; font-family: Arial, Helvetica, sans-serif;">
          <h2 style="margin: 0 0 10px; font-size: 16px; line-height: 1.35; color: #17233A; font-weight: 700;">About Arch9</h2>
          <p style="margin: 0 0 18px; font-size: 14px; line-height: 1.65; color: #334155;">Arch9 is a secure property transaction platform that connects agencies, attorneys, bond originators, developers, buyers and sellers in one shared workspace.</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.65; color: #334155;">It helps each role player manage their part of the transaction while keeping permissions, documents and updates clearly separated.</p>
        </td>
      </tr>
    </table>
  `;
}

function renderInvitationDetails({
  invitingOrganisationName,
  partnerName,
  partnerType,
  relationshipType,
  scopeLabel,
}: {
  invitingOrganisationName: string;
  partnerName: string;
  partnerType: string;
  relationshipType: string;
  scopeLabel: string;
}) {
  const rows = [
    ["Invited by", invitingOrganisationName],
    ["Partner", partnerName],
    ["Partner type", partnerType],
    ["Relationship", relationshipType],
    ["Scope", scopeLabel],
  ];

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: separate; border-spacing: 0; margin: 28px 0 0; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px;">
      <tr>
        <td style="padding: 20px 22px 18px;">
          <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.2; letter-spacing: 0.16em; color: #006B4D; font-weight: 700; text-transform: uppercase;">Invitation details</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            ${rows.map(([label, value], index) => `
              <tr>
                <td class="arch9-details-label" width="42%" style="${index === 0 ? "" : "border-top: 1px solid #E2E8F0;"} padding: 10px 12px 10px 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; color: #475569;">
                  ${escapeHtml(label)}
                </td>
                <td style="${index === 0 ? "" : "border-top: 1px solid #E2E8F0;"} padding: 10px 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; color: #17233A; font-weight: 700;">
                  ${escapeHtml(value)}
                </td>
              </tr>
            `).join("")}
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderInformationCard({
  title,
  iconText,
  body,
}: {
  title: string;
  iconText: string;
  body: string[];
}) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: separate; border-spacing: 0; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px;">
      <tr>
        <td style="padding: 20px 20px 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td width="38" valign="middle" style="width: 38px; padding: 0 10px 0 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="32">
                  <tr>
                    <td align="center" valign="middle" bgcolor="#006B4D" style="width: 32px; height: 32px; border-radius: 16px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 32px; color: #FFFFFF; font-weight: 700;">
                      ${escapeHtml(iconText)}
                    </td>
                  </tr>
                </table>
              </td>
              <td valign="middle" style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.35; color: #17233A; font-weight: 700;">
                ${escapeHtml(title)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${body.map((paragraph, index) => `
        <tr>
          <td style="padding: ${index === 0 ? "10px" : "12px"} 20px 12px; ${index === 0 ? "" : "border-top: 1px solid #E2E8F0;"} font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">
            ${escapeHtml(paragraph)}
          </td>
        </tr>
      `).join("")}
    </table>
  `;
}

function renderHelpCard() {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: separate; border-spacing: 0; margin: 28px 0 0; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
      <tr>
        <td style="padding: 22px 24px; font-family: Arial, Helvetica, sans-serif;">
          <h2 style="margin: 0 0 8px; font-size: 16px; line-height: 1.35; color: #17233A; font-weight: 700;">Need help?</h2>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">If you were not expecting this invitation, please contact the organisation that sent it before accepting.</p>
        </td>
      </tr>
    </table>
  `;
}

function renderFooter({
  invitingOrganisationName,
  supportEmail,
  supportPhone,
  arch9Website,
}: {
  invitingOrganisationName: string;
  supportEmail: string;
  supportPhone: string;
  arch9Website: string;
}) {
  const supportEmailLink = supportEmail ? `mailto:${escapeHtml(supportEmail)}` : "";
  const siteHref = websiteHref(arch9Website);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 36px 0 0; border-top: 1px solid #E2E8F0;">
      <tr>
        <td style="padding: 28px 18px 12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td class="arch9-footer-col" width="50%" valign="top" style="width: 50%; padding: 0 28px 0 0; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0 0 6px; font-size: 15px; line-height: 1.4; color: #17233A; font-weight: 700;">Questions?</p>
                <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.5; color: #334155;">Contact our support team</p>
                ${supportEmail ? `<p style="margin: 0 0 6px; font-size: 14px; line-height: 1.5;"><a href="${supportEmailLink}" style="color: #006B4D; text-decoration: none; font-weight: 700;">${escapeHtml(supportEmail)}</a></p>` : ""}
                ${supportPhone ? `<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #334155;">${escapeHtml(supportPhone)}</p>` : ""}
              </td>
              <td class="arch9-footer-divider" width="1" style="width: 1px; background: #E2E8F0; font-size: 0; line-height: 0;">&nbsp;</td>
              <td class="arch9-footer-col" width="50%" valign="top" style="width: 50%; padding: 0 0 0 28px; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0 0 6px; font-size: 15px; line-height: 1.4; color: #17233A; font-weight: 700;">Arch9</p>
                <p style="margin: 0 0 6px; font-size: 14px; line-height: 1.5; color: #334155;">Property Transaction Platform</p>
                ${arch9Website ? `<p style="margin: 0; font-size: 14px; line-height: 1.5;"><a href="${escapeHtml(siteHref)}" style="color: #006B4D; text-decoration: none; font-weight: 700;">${escapeHtml(arch9Website)}</a></p>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding: 18px 18px 24px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.5; color: #8A94A6;">
          ${escapeHtml(invitingOrganisationName)} &middot; Powered by Arch9
        </td>
      </tr>
    </table>
  `;
}

type PartnerInvitationEmailTemplateInput = {
  preheader: string;
  invitingOrganisationName: string;
  invitingOrganisationLogoUrl?: string;
  partnerName: string;
  partnerType: string;
  relationshipType: string;
  scopeLabel: string;
  inviteUrl: string;
  expiryDays: number;
  supportEmail: string;
  supportPhone: string;
  arch9Website: string;
  partnerLogoUrl?: string;
  recipientName?: string;
};

export function renderOrganisationPartnerInvitationEmail({
  preheader,
  invitingOrganisationName,
  invitingOrganisationLogoUrl,
  partnerName,
  partnerType,
  relationshipType,
  scopeLabel,
  inviteUrl,
  expiryDays,
  supportEmail,
  supportPhone,
  arch9Website,
  partnerLogoUrl,
  recipientName,
}: PartnerInvitationEmailTemplateInput) {
  const safeInviteUrl = escapeHtml(inviteUrl);
  const recipientGreeting = recipientName ? `Hi ${escapeHtml(recipientName)}, ` : "";

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Partner invitation</title>
    <style>
      @media screen and (max-width: 480px) {
        .arch9-shell { width: 100% !important; max-width: 100% !important; }
        .arch9-outer { padding: 0 !important; }
        .arch9-header { height: 56px !important; padding-left: 20px !important; padding-right: 20px !important; }
        .arch9-padded { padding-left: 20px !important; padding-right: 20px !important; }
        .arch9-hero-copy { padding-right: 0 !important; }
        .arch9-column { display: block !important; width: 100% !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .arch9-relationship { padding-top: 22px !important; }
        .arch9-hero-cta { display: block !important; width: 100% !important; padding-top: 22px !important; }
        .arch9-cta-table { width: 100% !important; }
        .arch9-cta-link { display: block !important; min-width: 0 !important; width: auto !important; }
        .arch9-about-icon, .arch9-about-copy { display: block !important; width: 100% !important; padding-right: 0 !important; }
        .arch9-about-icon { padding-bottom: 0 !important; }
        .arch9-about-copy { padding-top: 18px !important; }
        .arch9-info-card { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .arch9-info-gap { display: block !important; height: 16px !important; width: 100% !important; }
        .arch9-footer-col { display: block !important; width: 100% !important; padding: 0 0 18px !important; }
        .arch9-footer-divider { display: none !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #F6F8FA; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#F6F8FA" style="width: 100%; background: #F6F8FA; border-collapse: collapse;">
      <tr>
        <td align="center" class="arch9-outer" style="padding: 32px 12px;">
          <!--[if mso]>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="660" align="center"><tr><td>
          <![endif]-->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="arch9-shell" style="width: 100%; max-width: 660px; border-collapse: separate; border-spacing: 0; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
            <tr>
              <td class="arch9-header" bgcolor="#071E1A" height="72" valign="middle" style="height: 72px; padding: 0 32px; background: #071E1A; font-family: Arial, Helvetica, sans-serif;">
                <p style="margin: 0; font-size: 20px; line-height: 1; letter-spacing: 0.52em; color: #FFFFFF; font-weight: 700;">ARCH9</p>
              </td>
            </tr>
            <tr>
              <td class="arch9-padded" style="padding: 40px 32px 0; background: #FFFFFF;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td class="arch9-column arch9-hero-copy" width="55%" valign="top" style="width: 55%; padding: 0 26px 0 0; font-family: Arial, Helvetica, sans-serif;">
                      <p style="margin: 0 0 20px; font-size: 12px; line-height: 1.2; letter-spacing: 0.14em; color: #006B4D; font-weight: 700; text-transform: uppercase;">Partner invitation</p>
                      <h1 style="margin: 0; font-size: 27px; line-height: 1.18; color: #17233A; font-weight: 700;">${escapeHtml(invitingOrganisationName)} has invited your organisation to connect on Arch9</h1>
                      <p style="margin: 22px 0 0; font-size: 15px; line-height: 1.6; color: #475569;">${recipientGreeting}you have been asked to review an organisation-level partner connection. Sign in as your company contact to connect your workspace and bring your team in when you are ready.</p>
                    </td>
                    <td class="arch9-column arch9-relationship" width="45%" valign="top" style="width: 45%; padding: 26px 0 0;">
                      ${renderRelationshipVisual({
                        invitingOrganisationName,
                        invitingOrganisationLogoUrl,
                        partnerName,
                        partnerType,
                        partnerLogoUrl,
                      })}
                    </td>
                  </tr>
                  <tr>
                    <td class="arch9-hero-cta" width="55%" valign="top" style="width: 55%; padding: 28px 26px 0 0; font-family: Arial, Helvetica, sans-serif;">
                      ${renderCta(inviteUrl)}
                      <p style="margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: #64748B;">This invitation expires in ${escapeHtml(String(expiryDays))} days.</p>
                      <p style="margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: #64748B;">Invitation URL:<br /><a href="${safeInviteUrl}" style="color: #006B4D; text-decoration: underline; word-break: break-all;">${safeInviteUrl}</a></p>
                    </td>
                    <td class="arch9-column" width="45%" style="width: 45%; padding: 0;">&nbsp;</td>
                  </tr>
                </table>

                ${renderAboutSection()}

                ${renderInvitationDetails({
                  invitingOrganisationName,
                  partnerName,
                  partnerType,
                  relationshipType,
                  scopeLabel,
                })}

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 28px 0 0;">
                  <tr>
                    <td class="arch9-info-card" width="50%" valign="top" style="width: 50%; padding: 0 9px 0 0;">
                      ${renderInformationCard({
                        title: "What accepting means",
                        iconText: "OK",
                        body: [
                          `Your organisation will be connected to ${invitingOrganisationName} as an approved partner.`,
                          "Their authorised users may route relevant property transactions to your organisation.",
                          "You can collaborate securely on shared transactions within Arch9.",
                          "You can manage or remove this partnership at any time.",
                        ],
                      })}
                    </td>
                    <td class="arch9-info-gap" width="18" style="width: 18px; font-size: 0; line-height: 0;">&nbsp;</td>
                    <td class="arch9-info-card" width="50%" valign="top" style="width: 50%; padding: 0 0 0 9px;">
                      ${renderInformationCard({
                        title: "Security and privacy",
                        iconText: "S",
                        body: [
                          "This invitation can only be accepted by an authorised user in the invited workspace.",
                          "No data is shared until the invitation is accepted.",
                          "All data and conversations remain secure within Arch9.",
                          "You can review the relationship scope before accepting.",
                        ],
                      })}
                    </td>
                  </tr>
                </table>

                ${renderHelpCard()}

                ${renderFooter({
                  invitingOrganisationName,
                  supportEmail,
                  supportPhone,
                  arch9Website,
                })}
              </td>
            </tr>
          </table>
          <!--[if mso]>
          </td></tr></table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function handleOrganisationPartnerInvitationEmail(
  payload: SendOrganisationPartnerInvitationPayload,
) {
  const recipientEmail = normalizeText(payload.to).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, { error: "Missing required field: to" });
  }

  const invitationLink = normalizeText(
    payload.inviteUrl ?? payload.invite_url ??
      payload.invitationLink ?? payload.invitation_link,
  );
  if (!invitationLink) {
    return jsonResponse(400, { error: "Missing required field: invitationLink" });
  }

  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const fromOrganisation = resolveFirstText(
    payload.invitingOrganisationName,
    payload.inviting_organisation_name,
    payload.invitedByOrganisation,
    payload.invited_by_organisation,
  ) || "An Arch9 workspace";
  const partnerOrganisation = resolveFirstText(
    payload.partnerName,
    payload.partner_name,
    payload.partnerOrganisationName,
    payload.partner_organisation_name,
  ) || "your organisation";
  const partnerType = titleize(payload.partnerType ?? payload.partner_type ?? "partner");
  const relationshipType = payload.preferred === true
    ? "Preferred"
    : titleize(payload.relationshipType ?? payload.relationship_type ?? "approved");
  const scopeType = titleize(payload.scopeType ?? payload.scope_type ?? "organisation");
  const scopeName = normalizeText(payload.scopeName ?? payload.scope_name);
  const scopeLabel = resolveFirstText(
    payload.scopeLabel,
    payload.scope_label,
    scopeName ? `${scopeType}: ${scopeName}` : scopeType,
  );
  const expiryDays = resolveExpiryDays(payload);
  const supportEmail = resolveFirstText(
    payload.supportEmail,
    payload.support_email,
    Deno.env.get("BRIDGE_SUPPORT_EMAIL"),
    Deno.env.get("ARCH9_SUPPORT_EMAIL"),
  ) || "support@arch9.co.za";
  const supportPhone = resolveFirstText(
    payload.supportPhone,
    payload.support_phone,
    Deno.env.get("BRIDGE_SUPPORT_PHONE"),
    Deno.env.get("ARCH9_SUPPORT_PHONE"),
  ) || "+27 10 109 1315";
  const arch9Website = resolveFirstText(
    payload.arch9Website,
    payload.arch9_website,
    Deno.env.get("ARCH9_WEBSITE"),
  ) || "www.arch9.co.za";
  const invitingOrganisationLogoUrl = resolveFirstText(
    payload.invitingOrganisationLogoUrl,
    payload.inviting_organisation_logo_url,
    payload.invitedByOrganisationLogoUrl,
    payload.invited_by_organisation_logo_url,
  );
  const partnerLogoUrl = resolveFirstText(
    payload.partnerLogoUrl,
    payload.partner_logo_url,
    payload.partnerOrganisationLogoUrl,
    payload.partner_organisation_logo_url,
  );
  const preferred = payload.preferred === true;
  const inviteMessage = normalizeText(payload.message);
  const recipientName = resolveFirstText(payload.recipientName, payload.recipient_name);
  const from = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <no-reply@arch9.co.za>";
  const subject = `${fromOrganisation} invited you to review a company connection on Arch9`;
  const summary = `${fromOrganisation} has invited your organisation to connect on Arch9.`;

  const html = renderOrganisationPartnerInvitationEmail({
    preheader: summary,
    invitingOrganisationName: fromOrganisation,
    invitingOrganisationLogoUrl,
    partnerName: partnerOrganisation,
    partnerType,
    relationshipType,
    scopeLabel,
    inviteUrl: invitationLink,
    expiryDays,
    supportEmail,
    supportPhone,
    arch9Website,
    partnerLogoUrl,
    recipientName,
  });

  const text = [
    "PARTNER INVITATION",
    "",
    recipientName ? `Hi ${recipientName},` : "",
    `${fromOrganisation} has invited your organisation to connect on Arch9.`,
    "You have been asked to review an organisation-level partner connection. Sign in as your company contact to connect your workspace and bring your team in when you are ready.",
    "",
    "Review invitation:",
    invitationLink,
    `This invitation expires in ${expiryDays} days.`,
    "",
    "About Arch9",
    "Arch9 is a secure property transaction platform that connects agencies, attorneys, bond originators, developers, buyers and sellers in one shared workspace.",
    "It helps each role player manage their part of the transaction while keeping permissions, documents and updates clearly separated.",
    "",
    "Invitation details",
    `Invited by: ${fromOrganisation}`,
    `Partner: ${partnerOrganisation}`,
    `Partner type: ${partnerType}`,
    `Relationship: ${relationshipType}`,
    `Scope: ${scopeLabel}`,
    "",
    "What accepting means",
    `Your organisation will be connected to ${fromOrganisation} as an approved partner.`,
    "Their authorised users may route relevant property transactions to your organisation.",
    "You can collaborate securely on shared transactions within Arch9.",
    "You can manage or remove this partnership at any time.",
    "",
    "Security and privacy",
    "This invitation can only be accepted by an authorised user in the invited workspace.",
    "No data is shared until the invitation is accepted.",
    "All data and conversations remain secure within Arch9.",
    "You can review the relationship scope before accepting.",
    "",
    "Need help?",
    "If you were not expecting this invitation, please contact the organisation that sent it before accepting.",
    inviteMessage ? `Message from ${fromOrganisation}: ${inviteMessage}` : "",
    "",
    "Questions?",
    `Contact our support team: ${supportEmail}${supportPhone ? ` | ${supportPhone}` : ""}`,
    `Arch9 Property Transaction Platform: ${arch9Website}`,
    `${fromOrganisation} | Powered by Arch9`,
  ].filter(Boolean).join("\n");

  const delivery = await prepareEmailDelivery(
    payload as Record<string, unknown>,
    {
      communicationType: "organisation_partner_invitation",
      recipient: recipientEmail,
      recipientRole: "partner",
      subject,
      messagePreview: text,
      context: {
        organisationId: normalizeText(
          payload.organisationId ?? payload.organisation_id,
        ),
        metadata: {
          partnerInvitationId: normalizeText(
            payload.invitationId ?? payload.invitation_id,
          ) || null,
          partnerType: normalizeText(
            payload.partnerType ?? payload.partner_type,
          ) || null,
          relationshipType,
          scopeType,
          scopeName: scopeName || null,
          scopeLabel,
          expiryDays,
        },
      },
    },
  );

  const sendResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from,
    to: recipientEmail,
    subject,
    html,
    text,
  });

  if (!sendResult.ok) {
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: sendResult.error?.message ||
        "Failed to send organisation partner invitation email.",
    });
    return jsonResponse(502, {
      error: "Resend rejected the organisation partner invitation email.",
      details: sendResult.error,
      status: sendResult.status,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: sendResult.data?.id || null,
  });

  return jsonResponse(200, {
    ok: true,
    type: "organisation_partner_invitation",
    sent: true,
    deliveryId: delivery?.id || null,
    recipientEmail,
    provider: "resend",
    providerResponse: sendResult.data,
  });
}
