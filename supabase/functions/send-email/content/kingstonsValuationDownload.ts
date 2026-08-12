import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
} from "./bridgeEmailLayout.ts";
import { normalizeBrandColor } from "../services/emailBranding.ts";

function pickText(value: unknown, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function getHeaderBrandLogoUrl(branding?: BridgeEmailLayoutBranding) {
  return pickText(
    branding?.logoDarkUrl ||
      branding?.logoUrl ||
      branding?.logoLightUrl ||
      branding?.logoIconUrl,
  );
}

function getInitials(value: unknown) {
  return pickText(value, "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "A";
}

function renderValueRow({
  icon,
  title,
  body,
  accentColor,
}: {
  icon: string;
  title: string;
  body: string;
  accentColor: string;
}) {
  return `<tr>
    <td width="58" valign="top" style="padding: 0 18px 18px 0;">
      <div style="width: 42px; height: 42px; border-radius: 15px; border: 1px solid #d8e4df; color: #06433c; font-size: 20px; line-height: 42px; text-align: center; font-weight: 700;">${
    escapeHtml(icon)
  }</div>
    </td>
    <td valign="top" style="padding: 0 0 18px; border-bottom: 1px solid #dfe6e3;">
      <p style="margin: 0 0 5px; color: #111827; font-size: 15px; line-height: 1.35; font-weight: 750;">${
    escapeHtml(title)
  }</p>
      <p style="margin: 0; color: #394555; font-size: 14px; line-height: 1.55; font-weight: 400;">${
    escapeHtml(body)
  }</p>
    </td>
    <td width="1" style="padding: 0 0 18px 0;">
      <div style="width: 1px; height: 42px; background: ${accentColor}; opacity: 0.55;"></div>
    </td>
  </tr>`;
}

export type KingstonsValuationDownloadEmailInput = {
  recipientName?: string;
  propertyLabel?: string;
  agentName?: string;
  agentRole?: string;
  valuationDownloadUrl: string;
  valuationFileName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  branding?: BridgeEmailLayoutBranding;
};

export function buildKingstonsValuationDownloadSubject() {
  return "Your Kingstons valuation is ready";
}

export function buildKingstonsValuationDownloadEmailHtml(
  input: KingstonsValuationDownloadEmailInput,
) {
  const branding = input.branding || {};
  const primaryColor = normalizeBrandColor(branding.primaryColor, "#052b2b");
  const goldColor = normalizeBrandColor(branding.secondaryColor, "#d49a18");
  const logoUrl = getHeaderBrandLogoUrl(branding);
  const organisationName = pickText(
    input.organisationName || branding.organisationName,
    "Kingstons Real Estate",
  );
  const recipientName = pickText(input.recipientName, "there");
  const propertyLabel = pickText(input.propertyLabel, "Your property");
  const agentName = pickText(input.agentName, "Your Kingstons agent");
  const agentRole = pickText(input.agentRole, "Agent");
  const fileName = pickText(input.valuationFileName, "Property valuation");
  const safeDownloadUrl = escapeHtml(input.valuationDownloadUrl);

  return `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">Your property valuation is ready to download.</div>
  <div style="margin: 0; padding: 18px 12px 32px; background: #f5f5f3;">
    <div style="max-width: 640px; margin: 0 auto; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a;">
      <div style="border-radius: 10px 10px 0 0; overflow: hidden; background: ${primaryColor};">
        <div style="min-height: 298px; padding: 26px 34px 54px; background: radial-gradient(circle at 84% 44%, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 42%), linear-gradient(135deg, #001f20 0%, ${primaryColor} 54%, #031414 100%);">
          <div style="text-align: center; margin: 0 0 34px;">
            ${
    logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${
        escapeHtml(organisationName)
      }" style="display: inline-block; max-height: 52px; max-width: 220px; width: auto; height: auto; border: 0; object-fit: contain;" />`
      : ""
  }
          </div>
          <div style="max-width: 420px;">
            <h1 style="margin: 0; color: #ffffff; font-size: 30px; line-height: 1.16; font-weight: 750; letter-spacing: 0;">Your valuation is ready</h1>
            <div style="width: 68px; height: 3px; background: ${goldColor}; margin: 22px 0 20px;"></div>
            <p style="margin: 0 0 8px; color: #ffffff; font-size: 16px; line-height: 1.4; font-weight: 650;">Hi ${
    escapeHtml(recipientName)
  },</p>
            <p style="margin: 0; color: rgba(255,255,255,0.92); font-size: 15px; line-height: 1.6; font-weight: 400;">We have prepared your property valuation and it is ready for you to download.</p>
          </div>
        </div>
      </div>

      <div style="background: #ffffff; padding: 0 28px 28px;">
        <div style="margin: -42px 0 22px; padding: 30px 34px 28px; background: #ffffff; border: 1px solid #e9e2d8; border-radius: 14px; box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td width="128" valign="middle" style="padding: 0 28px 0 0; border-right: 1px solid #e1e5e8;">
                <div style="width: 104px; height: 104px; border-radius: 50%; background: #f2f6f3; color: #06433c; font-size: 36px; line-height: 104px; text-align: center; font-weight: 750;">PDF</div>
              </td>
              <td valign="middle" style="padding: 0 0 0 28px;">
                <p style="margin: 0 0 8px; color: #060915; font-size: 22px; line-height: 1.25; font-weight: 750;">Property Valuation Report</p>
                <p style="margin: 0 0 10px; color: #263241; font-size: 15px; line-height: 1.45;">${
    escapeHtml(propertyLabel)
  }</p>
                <p style="margin: 0 0 6px; color: #394555; font-size: 14px; line-height: 1.45;">Prepared by <strong style="color: #111827;">${
    escapeHtml(agentName)
  }</strong>${agentRole ? `, ${escapeHtml(agentRole)}` : ""}</p>
                <p style="margin: 0 0 14px; color: #5f6b78; font-size: 13px; line-height: 1.45;">${
    escapeHtml(fileName)
  }</p>
                <span style="display: inline-block; padding: 7px 12px; border-radius: 999px; background: #eef0ee; color: #2f3741; font-size: 12px; line-height: 1.2; font-weight: 650;">PDF valuation</span>
              </td>
            </tr>
          </table>
          <a href="${safeDownloadUrl}" style="display: block; margin: 26px 0 12px; padding: 16px 24px; border-radius: 8px; background: linear-gradient(135deg, ${goldColor} 0%, #e2a821 50%, #c9840f 100%); color: #ffffff; font-size: 18px; line-height: 1.2; font-weight: 750; text-align: center; text-decoration: none;">Download valuation</a>
          <p style="margin: 0; color: #5f6b78; font-size: 13px; line-height: 1.45; text-align: center;">Public download link &middot; no sign-in needed</p>
        </div>

        <p style="margin: 0 20px 24px; padding-top: 18px; border-top: 1px solid ${goldColor}; color: #17202c; font-size: 16px; line-height: 1.55; text-align: center;">This is the first step toward a confident, well-positioned sale.</p>

        <div style="margin: 0 0 18px; padding: 26px 30px 8px; background: linear-gradient(90deg, #f4f8f5 0%, #eef5f2 100%); border: 1px solid #eef1ec; border-radius: 12px;">
          <p style="margin: 0 0 24px; color: #005e4e; font-size: 16px; line-height: 1.2; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; text-align: center;">How Kingstons helps from here</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            ${
    [
      {
        icon: "M",
        title: "Market exposure",
        body:
          "We position your property across leading external platforms and our internal buyer database.",
      },
      {
        icon: "S",
        title: "Smart process",
        body:
          "Our technology keeps documents, updates, and next steps smooth and secure.",
      },
      {
        icon: getInitials(agentName),
        title: "Human guidance",
        body:
          "Your agent stays close from valuation through launch, offers, and transfer.",
      },
    ].map((row) => renderValueRow({ ...row, accentColor: goldColor })).join("")
  }
          </table>
        </div>

        <div style="margin: 0 0 22px; padding: 22px 24px; background: linear-gradient(90deg, #fff9ef 0%, #fbf0dc 100%); border-radius: 12px; border: 1px solid #f4e4c5;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td width="68" valign="top"><div style="width: 48px; height: 48px; border-radius: 50%; background: #fff3d6; color: ${goldColor}; font-size: 18px; line-height: 48px; text-align: center; font-weight: 750;">&rarr;</div></td>
              <td valign="top">
                <p style="margin: 0 0 8px; color: ${goldColor}; font-size: 17px; line-height: 1.2; font-weight: 750; text-transform: uppercase;">What to do next</p>
                <p style="margin: 0; color: #141922; font-size: 15px; line-height: 1.55;">Download your valuation, review the recommendation, and reply with any questions. We will guide the next step when you are ready.</p>
              </td>
            </tr>
          </table>
        </div>

        <div style="border-top: 1px solid #cfd4d9; padding: 18px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td valign="top" style="padding-right: 18px;">
                <p style="margin: 0 0 4px; color: #111827; font-size: 13px; line-height: 1.3; font-weight: 750;">Your information is secure</p>
                <p style="margin: 0; color: #263241; font-size: 12px; line-height: 1.45;">Arch9 securely manages your valuation information on behalf of ${
    escapeHtml(organisationName)
  }.</p>
                ${
    input.supportEmail || input.supportPhone
      ? `<p style="margin: 10px 0 0; color: #4b5563; font-size: 12px; line-height: 1.45;">${
        escapeHtml(
          [input.supportEmail, input.supportPhone].filter(Boolean).join(" - "),
        )
      }</p>`
      : ""
  }
              </td>
              <td width="116" valign="top" align="right">
                <p style="margin: 0 0 4px; color: #4b5563; font-size: 12px; line-height: 1.2;">Powered by</p>
                <p style="margin: 0; color: #111827; font-size: 18px; line-height: 1; font-weight: 900; letter-spacing: 0.02em;">ARCH9</p>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

export function buildKingstonsValuationDownloadEmailText(
  input: KingstonsValuationDownloadEmailInput,
) {
  const organisationName = pickText(
    input.organisationName,
    "Kingstons Real Estate",
  );
  return [
    `Hi ${pickText(input.recipientName, "there")},`,
    "",
    "Your valuation is ready",
    "",
    "We have prepared your property valuation and it is ready for you to download.",
    "",
    `Property: ${pickText(input.propertyLabel, "Your property")}`,
    `Prepared by: ${pickText(input.agentName, "Your Kingstons agent")}`,
    input.valuationFileName ? `File: ${input.valuationFileName}` : null,
    "",
    `Download valuation: ${input.valuationDownloadUrl}`,
    "Public download link - no sign-in needed.",
    "",
    "This is the first step toward a confident, well-positioned sale.",
    "",
    "How Kingstons helps from here",
    "- Market exposure: We position your property across leading external platforms and our internal buyer database.",
    "- Smart process: Our technology keeps documents, updates, and next steps smooth and secure.",
    "- Human guidance: Your agent stays close from valuation through launch, offers, and transfer.",
    "",
    "What to do next",
    "Download your valuation, review the recommendation, and reply with any questions. We will guide the next step when you are ready.",
    "",
    organisationName,
    "Powered by Arch9",
  ]
    .filter(Boolean)
    .join("\n");
}
