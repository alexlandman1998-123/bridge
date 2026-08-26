import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
} from "./bridgeEmailLayout.ts";
import { normalizeBrandColor } from "../services/emailBranding.ts";

export type ViewingAvailabilityRequestProperty = {
  title?: string;
  price?: string;
  area?: string;
  match?: string;
  imageUrl?: string;
  link?: string;
  sellerViewingAvailability?: string;
  sellerViewingAvailabilityWindows?: string;
  sellerViewingNoticePeriod?: string;
  sellerViewingNoticeRequired?: boolean;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function pickText(value: unknown, fallback = "") {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function getInitials(value: string) {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join(
    "",
  ) || "A";
}

function renderHeaderBrandMark(organisationName: string, primaryColor: string, accentColor: string) {
  return `
    <div style="display:inline-block; width:72px; height:72px; border:1px solid ${accentColor}; border-radius:18px; background:${primaryColor}; color:${accentColor}; font-size:34px; line-height:72px; font-weight:900; text-align:center;">${
    escapeHtml(getInitials(organisationName))
  }</div>
  `;
}

function getHeaderLogoUrl(branding?: BridgeEmailLayoutBranding) {
  return normalizeText(
    branding?.logoDarkUrl || branding?.logoUrl || branding?.logoLightUrl ||
      branding?.logoIconUrl,
  );
}

function normalizeProperties(properties: ViewingAvailabilityRequestProperty[]) {
  return (Array.isArray(properties) ? properties : [])
    .map((property) => ({
      title: pickText(property?.title, "Selected property"),
      price: normalizeText(property?.price),
      area: normalizeText(property?.area),
      match: normalizeText(property?.match),
      imageUrl: normalizeText(property?.imageUrl),
      link: normalizeText(property?.link),
      sellerViewingAvailability:
        normalizeText(property?.sellerViewingAvailability) ||
        normalizeText(property?.sellerViewingAvailabilityWindows),
      sellerViewingNoticePeriod: normalizeText(
        property?.sellerViewingNoticePeriod,
      ),
      sellerViewingNoticeRequired:
        property?.sellerViewingNoticeRequired === true,
    }))
    .filter((property) => property.title);
}

function renderPropertyCard(properties: ViewingAvailabilityRequestProperty[]) {
  const rows = normalizeProperties(properties);
  const property = rows[0];
  if (!rows.length) {
    return `
      <div style="margin: 0 0 22px;">
        <p style="margin: 0 0 14px; color: #00604f; font-size: 15px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Property requested</p>
        <div style="padding: 18px; border: 1px solid #e2e7eb; border-radius: 12px; background: #f7faf8;">
          <p style="margin: 0; color: #111827; font-size: 17px; line-height: 1.35; font-weight: 800;">The property you enquired about</p>
        </div>
      </div>
    `;
  }

  return `
    <div style="margin: 0 0 22px;">
      <p style="margin: 0 0 14px; color: #00604f; font-size: 15px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Property requested</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid #dfe7e6; border-radius: 14px; background: #ffffff;">
        <tr>
          <td style="padding:0; background:#07142e;">
            ${
    property.imageUrl
      ? `<img src="${
        escapeHtml(property.imageUrl)
      }" alt="${escapeHtml(property.title)}" width="538" style="display:block; width:100%; max-width:538px; height:190px; object-fit:cover; border:0;" />`
      : `<div style="height:190px; background:radial-gradient(circle at 76% 22%, rgba(255,255,255,0.22) 0, rgba(255,255,255,0) 36%), linear-gradient(145deg, #043734 0%, #07142e 70%); color:#ffffff;">
              <div style="padding:24px;">
                <div style="width: 42px; height: 42px; margin: 0 0 54px; border: 1px solid rgba(216,166,51,0.7); border-radius: 12px; color: #d8a633; font-size: 25px; line-height: 40px; font-weight: 900; text-align: center;">K</div>
                <p style="margin: 0; color: rgba(255,255,255,0.88); font-size: 12px; line-height: 1.35; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Viewing request</p>
              </div>
            </div>`
  }
          </td>
        </tr>
        <tr>
          <td valign="top" style="padding: 20px 20px 22px;">
            <span style="display: inline-block; margin:0 0 10px; padding: 7px 11px; border-radius: 999px; background: #eef7f3; color: #00604f; font-size: 12px; line-height: 1.2; font-weight: 800;">Viewing request</span>
            <p style="margin: 0 0 8px; color: #111827; font-size: 22px; line-height: 1.18; font-weight: 850;">${
    escapeHtml(property.title)
  }</p>
            ${
    [
      property.price,
      property.area,
      property.match ? `${property.match} match` : "",
    ]
      .filter(Boolean)
      .map((detail) =>
        `<p style="margin: 0 0 8px; color: #4f5d6f; font-size: 14px; line-height: 1.45;">${
          escapeHtml(detail)
        }</p>`
      )
      .join("")
  }
            ${
    property.link
      ? `<p style="margin: 14px 0 0; font-size: 13px; line-height: 1.45;"><a href="${
        escapeHtml(property.link)
      }" style="display:inline-block; padding:10px 14px; border-radius:8px; background:#0f2f4f; color:#ffffff; text-decoration:none; font-weight:800;">View property details</a></p>`
      : ""
  }
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderActionButton(
  actionLink = "",
  accent = "#d9a128",
  label = "Select 3 viewing times",
) {
  const link = normalizeText(actionLink);
  if (!link) return "";
  return `
    <div style="margin: 0;">
      <a href="${
    escapeHtml(link)
  }" style="display: block; padding: 16px 20px; border-radius: 8px; background: linear-gradient(135deg, ${accent} 0%, #e5b13c 48%, #c68615 100%); color: #ffffff; font-size: 18px; line-height: 1.2; font-weight: 800; text-align: center; text-decoration: none;">${
    escapeHtml(label)
  }</a>
    </div>
  `;
}

function renderAgentCard(agentName: string, agentCardUrl = "", agentAvatarUrl = "") {
  const cardUrl = normalizeText(agentCardUrl);
  const avatarUrl = normalizeText(agentAvatarUrl);
  const avatarHtml = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(agentName)}" width="76" height="76" style="display:block; width:76px; height:76px; border-radius:50%; object-fit:cover; border:0; background:#e6ecef;" />`
    : `<div style="width: 76px; height: 76px; border-radius: 50%; background: #06142f; color: #ffffff; font-size: 24px; line-height: 76px; font-weight: 800; text-align: center;">${
      escapeHtml(getInitials(agentName))
    }</div>`;
  return `
    <div style="margin: 0 0 22px;">
      <p style="margin: 0 0 14px; color: #00604f; font-size: 15px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Meet your agent</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: linear-gradient(90deg, #edf8f4 0%, #f5fbf8 100%); border-radius: 12px;">
        <tr>
          <td width="92" valign="top" style="padding: 20px 0 20px 20px;">
            ${avatarHtml}
          </td>
          <td valign="top" style="padding: 20px 20px 20px 0;">
            <p style="margin: 0 0 7px; color: #00604f; font-size: 12px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Your property professional</p>
            <p style="margin: 0 0 5px; color: #0f172a; font-size: 24px; line-height: 1.1; font-weight: 800;">${
    escapeHtml(agentName)
  }</p>
            <p style="margin: 0; color: #344154; font-size: 14px; line-height: 1.55;">${
    escapeHtml(agentName)
  } will help you arrange the viewing, answer property questions, and keep the seller coordination simple.</p>
            ${
    cardUrl
      ? `<p style="margin: 12px 0 0; font-size: 13px; line-height: 1.45;"><a href="${
        escapeHtml(cardUrl)
      }" style="display:inline-block; color:#00604f; text-decoration:none; font-weight:800;">View digital contact card</a></p>`
      : ""
  }
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderRequestedSlots() {
  return `
    <div style="margin: 0 0 22px;">
      <p style="margin: 0 0 14px; color: #00604f; font-size: 15px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">What we ask you to choose</p>
      <div style="padding: 20px; border: 1px solid #f0dfbd; border-radius: 12px; background: linear-gradient(90deg, #fffaf0 0%, #fff5de 100%);">
        ${
    [
      "First preferred viewing date and time",
      "Second option in case access is limited",
      "A flexible backup slot to speed up confirmation",
    ].map((label, index) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 ${
        index === 2 ? "0" : "10px"
      }; border-collapse: collapse; background: rgba(255,255,255,0.82); border-radius: 10px;">
          <tr>
            <td width="52" valign="middle" style="padding: 12px 0 12px 12px;"><div style="width: 30px; height: 30px; border-radius: 50%; background: #00604f; color: #ffffff; font-size: 13px; line-height: 30px; font-weight: 800; text-align: center;">${
        index + 1
      }</div></td>
            <td valign="middle" style="padding: 12px 12px 12px 0; color: #182230; font-size: 14px; line-height: 1.35; font-weight: 750;">${label}</td>
          </tr>
        </table>`
    ).join("")
  }
      </div>
    </div>
  `;
}

function renderNextSteps(agentName: string) {
  const rows = [
    {
      title: "You choose three times",
      body: "Your options are saved straight onto the viewing planner.",
    },
    {
      title: "Your agent reviews them",
      body:
        `${agentName} checks the times and prepares the seller confirmation.`,
    },
    {
      title: "The seller confirms access",
      body: "The seller chooses which proposed time can work for the property.",
    },
    {
      title: "You receive the confirmed viewing",
      body: "Once confirmed, we send the final appointment details.",
    },
  ];
  return `
    <div style="margin: 0 0 22px;">
      <p style="margin: 0 0 14px; color: #00604f; font-size: 15px; line-height: 1.2; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">What happens next</p>
      <div style="border: 1px solid #e4e9ec; border-radius: 12px; background: #ffffff; overflow: hidden;">
        ${
    rows.map((row, index) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;${
        index === rows.length - 1 ? "" : " border-bottom: 1px solid #edf0f2;"
      }">
          <tr>
            <td width="64" valign="top" style="padding: 15px 0 15px 18px;"><div style="width: 30px; height: 30px; border-radius: 50%; background: #f3eee6; color: #b88624; font-size: 13px; line-height: 30px; font-weight: 800; text-align: center;">0${
        index + 1
      }</div></td>
            <td valign="top" style="padding: 15px 18px 15px 0;">
              <p style="margin: 0 0 4px; color: #141922; font-size: 15px; line-height: 1.28; font-weight: 800;">${
        escapeHtml(row.title)
      }</p>
              <p style="margin: 0; color: #4d5b6d; font-size: 13px; line-height: 1.48;">${
        escapeHtml(row.body)
      }</p>
            </td>
          </tr>
        </table>`
    ).join("")
  }
      </div>
    </div>
  `;
}

export function buildBuyerViewingAvailabilityRequestEmailHtml({
  buyerName = "there",
  agentName = "your agent",
  properties = [],
  note = "",
  organisationName = "Arch9",
  supportEmail = "",
  supportPhone = "",
  actionLink = "",
  agentCardUrl = "",
  agentAvatarUrl = "",
  branding,
}: {
  buyerName?: string;
  agentName?: string;
  properties?: ViewingAvailabilityRequestProperty[];
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  actionLink?: string;
  agentCardUrl?: string;
  agentAvatarUrl?: string;
  branding?: BridgeEmailLayoutBranding;
}) {
  const selectedProperties = normalizeProperties(properties);
  const primaryColor = normalizeBrandColor(branding?.primaryColor, "#032b2b");
  const accentColor = normalizeBrandColor(branding?.secondaryColor, "#d9a128");
  const logoUrl = getHeaderLogoUrl(branding);
  const safeOrganisationName = escapeHtml(
    pickText(organisationName || branding?.organisationName, "Arch9"),
  );
  const greetingName = pickText(buyerName, "there").split(/\s+/)[0] ||
    "there";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Share your details and choose viewing times</title>
  </head>
  <body style="margin:0; padding:0; background:#f5f5f3; color:#101827;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">Share a few details and choose three viewing times that work for you.</div>
    <div style="margin:0; padding:18px 12px 32px; background:#f5f5f3;">
      <div style="max-width:600px; margin:0 auto; overflow:hidden; border:1px solid #e4e0d7; border-radius:14px; background:#ffffff; font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <div style="padding:24px 32px 20px; background:#ffffff; text-align:center;">
          ${
    logoUrl
      ? `<img src="${
        escapeHtml(logoUrl)
      }" alt="${safeOrganisationName}" width="286" style="display:inline-block; max-width:286px; width:100%; height:auto; border:0;" />`
      : renderHeaderBrandMark(pickText(organisationName || branding?.organisationName, "Arch9"), primaryColor, accentColor)
  }
        </div>
        <div style="padding:38px 38px 42px; background:radial-gradient(circle at 86% 38%, rgba(255,255,255,0.13) 0, rgba(255,255,255,0.06) 24%, rgba(255,255,255,0) 48%), linear-gradient(135deg, ${primaryColor} 0%, #05142d 100%); color:#ffffff;">
          <p style="margin:0 0 18px; color:${accentColor}; font-size:13px; line-height:1.2; font-weight:800; letter-spacing:0.09em; text-transform:uppercase;">Viewing request</p>
          <h1 style="margin:0; max-width:430px; color:#ffffff; font-size:38px; line-height:1.08; font-weight:800; letter-spacing:0;">Share a few details, then choose 3 viewing times.</h1>
          <p style="margin:18px 0 0; max-width:420px; color:rgba(255,255,255,0.9); font-size:17px; line-height:1.58;">If you have five minutes, answer a few quick buyer questions and then choose three times that work for you.</p>
        </div>
        <div style="padding:28px 30px 30px; background:#ffffff;">
          <div style="margin:0 0 26px; padding:24px; border:1px solid #eadfcd; border-radius:12px; background:#ffffff; box-shadow:0 16px 34px rgba(8,19,38,0.10); text-align:center;">
            <p style="margin:0 0 8px; color:#101827; font-size:20px; line-height:1.25; font-weight:800;">Hi ${
    escapeHtml(greetingName)
  }, your enquiry is in.</p>
            <p style="margin:0 0 18px; color:#455366; font-size:14px; line-height:1.55;">The quickest way to keep things moving is to share a few details and tell us when you are available. It takes less than five minutes.</p>
            ${renderActionButton(actionLink, accentColor, "Share details and 3 viewing times")}
            <p style="margin:12px 0 0; color:#687487; font-size:12px; line-height:1.45; font-weight:600;">Secure public link. No sign-in needed.</p>
          </div>
          ${renderPropertyCard(selectedProperties)}
          ${renderAgentCard(pickText(agentName, "your agent"), agentCardUrl, agentAvatarUrl)}
          ${renderRequestedSlots()}
          ${renderNextSteps(pickText(agentName, "your agent"))}
          ${
    note
      ? `<div style="margin:0 0 22px; padding:16px 18px; border:1px solid #f0dfbd; border-radius:12px; background:#fffaf0;"><p style="margin:0 0 4px; color:#b88624; font-size:13px; line-height:1.2; font-weight:800; letter-spacing:0.08em; text-transform:uppercase;">Agent note</p><p style="margin:0; color:#182230; font-size:14px; line-height:1.55;">${
        escapeHtml(note)
      }</p></div>`
      : ""
  }
          <div style="margin:22px 0 0; padding:18px 20px; border-radius:12px; background:#edf8f4;">
            <p style="margin:0 0 5px; color:#0f172a; font-size:16px; line-height:1.2; font-weight:800;">Your information is secure</p>
            <p style="margin:0; color:#435166; font-size:13px; line-height:1.5;">Arch9 manages this viewing request on behalf of ${safeOrganisationName} and only shares it with the property team coordinating your enquiry.</p>
          </div>
          <div style="margin-top:22px; padding-top:18px; border-top:1px solid #cfd6da; color:#607089; font-size:12px; line-height:1.55;">
            <p style="margin:0 0 6px;"><strong style="color:#111827;">Need help?</strong> Reply to this email and ${
    escapeHtml(pickText(agentName, "your agent"))
  } will assist.</p>
            ${
    supportEmail || supportPhone
      ? `<p style="margin:0 0 6px;">${
        escapeHtml([supportEmail, supportPhone].filter(Boolean).join(" | "))
      }</p>`
      : ""
  }
            <p style="margin:0;">${safeOrganisationName} &nbsp; | &nbsp; Powered by ARCH9</p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildBuyerViewingAvailabilityRequestEmailText({
  buyerName = "there",
  agentName = "your agent",
  properties = [],
  note = "",
  organisationName = "Arch9",
  supportEmail = "",
  supportPhone = "",
  actionLink = "",
  agentCardUrl = "",
  agentAvatarUrl = "",
}: {
  buyerName?: string;
  agentName?: string;
  properties?: ViewingAvailabilityRequestProperty[];
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  actionLink?: string;
  agentCardUrl?: string;
  agentAvatarUrl?: string;
}) {
  const selectedProperties = normalizeProperties(properties);
  const propertyLines = selectedProperties.length
    ? selectedProperties.map((property, index) =>
      [
        `${index + 1}. ${property.title}`,
        property.price ? `   Price: ${property.price}` : "",
        property.area ? `   Area: ${property.area}` : "",
        property.match ? `   Match: ${property.match}` : "",
        property.sellerViewingAvailability
          ? `   Owner availability: ${property.sellerViewingAvailability}`
          : "",
        property.sellerViewingNoticePeriod
          ? `   Notice: ${property.sellerViewingNoticePeriod}`
          : "",
        property.link ? `   Link: ${property.link}` : "",
      ].filter(Boolean).join("\n")
    ).join("\n\n")
    : "1. The property you enquired about";

  return [
    `Hi ${pickText(buyerName, "there")},`,
    "",
    `${agentName} has prepared ${
      selectedProperties.length === 1
        ? "a viewing option"
        : `${selectedProperties.length || 1} viewing options`
    } for you.`,
    actionLink
      ? "Share details and 3 viewing times here:"
      : "Please reply with exactly three time windows that suit you.",
    actionLink || null,
    agentAvatarUrl ? `Agent photo: ${agentAvatarUrl}` : null,
    agentCardUrl ? `Agent digital contact card: ${agentCardUrl}` : null,
    note ? `Agent note: ${note}` : null,
    "",
    propertyLines,
    "",
    actionLink ? "Or reply with:" : "Please reply with:",
    "1. Which property or properties you would like to view.",
    "2. Exactly three time windows that work for you.",
    "3. Exactly three time windows that work for you.",
    "4. Whether anyone else will be joining the viewing.",
    "",
    "Need help? Reply to this email and your agent will assist you.",
    "",
    supportEmail || supportPhone
      ? `Support: ${[supportEmail, supportPhone].filter(Boolean).join(" | ")}`
      : null,
    organisationName,
    "Powered by Arch9",
  ].filter(Boolean).join("\n");
}
