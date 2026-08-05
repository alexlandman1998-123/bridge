import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeBullets,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "./bridgeEmailLayout.ts";

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

function normalizeProperties(properties: ViewingAvailabilityRequestProperty[]) {
  return (Array.isArray(properties) ? properties : [])
    .map((property) => ({
      title: pickText(property?.title, "Selected property"),
      price: normalizeText(property?.price),
      area: normalizeText(property?.area),
      match: normalizeText(property?.match),
      imageUrl: normalizeText(property?.imageUrl),
      link: normalizeText(property?.link),
      sellerViewingAvailability: normalizeText(property?.sellerViewingAvailability) ||
        normalizeText(property?.sellerViewingAvailabilityWindows),
      sellerViewingNoticePeriod: normalizeText(property?.sellerViewingNoticePeriod),
      sellerViewingNoticeRequired: property?.sellerViewingNoticeRequired === true,
    }))
    .filter((property) => property.title);
}

function renderPropertyList(properties: ViewingAvailabilityRequestProperty[]) {
  const rows = normalizeProperties(properties);
  if (!rows.length) {
    return `
      <div style="margin: 16px 0; padding: 16px; border: 1px solid #dbe6f2; border-radius: 12px; background: #f7fbff;">
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1f3347;">The property you enquired about.</p>
      </div>
    `;
  }

  return `
    <div style="margin: 16px 0;">
      <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Viewing Options</p>
      ${
    rows.map((property, index) => `
        <div style="margin: 0 0 12px; padding: 0; overflow: hidden; border: 1px solid #dbe6f2; border-radius: 12px; background: #f7fbff;">
          ${
      property.imageUrl
        ? `<img src="${escapeHtml(property.imageUrl)}" alt="${escapeHtml(property.title)}" width="100%" style="display: block; width: 100%; max-height: 190px; object-fit: cover; border: 0;" />`
        : `<div style="height: 10px; background: #e7f0f8;"></div>`
    }
          <div style="padding: 14px;">
          <p style="margin: 0 0 6px; font-size: 15px; line-height: 1.35; color: #142132; font-weight: 800;">${
      index + 1
    }. ${escapeHtml(property.title)}</p>
          ${
      [
        property.price,
        property.area,
        property.match ? `${property.match} match` : "",
      ]
        .filter(Boolean)
        .map((detail) =>
          `<p style="margin: 0 0 4px; font-size: 13px; line-height: 1.45; color: #4b627a;">${
            escapeHtml(detail)
          }</p>`
        )
        .join("")
    }
          ${
      property.link
        ? `<p style="margin: 8px 0 0; font-size: 13px; line-height: 1.45;"><a href="${
          escapeHtml(property.link)
        }" style="color: #0f2f4f; text-decoration: none; font-weight: 700;">View property details</a></p>`
        : ""
    }
          ${
      property.sellerViewingAvailability
        ? `<div style="margin: 10px 0 0; padding: 10px 12px; border: 1px solid #dbe6f2; border-radius: 10px; background: #ffffff;">
          <p style="margin: 0 0 4px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: #6f8195; font-weight: 800;">Owner indicated availability</p>
          <p style="margin: 0; white-space: pre-line; font-size: 13px; line-height: 1.45; color: #29435d;">${escapeHtml(property.sellerViewingAvailability)}</p>
          ${property.sellerViewingNoticePeriod ? `<p style="margin: 6px 0 0; font-size: 12px; line-height: 1.4; color: #6f8195; font-weight: 700;">Notice: ${escapeHtml(property.sellerViewingNoticePeriod)}</p>` : ""}
        </div>`
        : ""
    }
          </div>
        </div>
      `).join("")
  }
    </div>
  `;
}

function renderActionButton(actionLink = "") {
  const link = normalizeText(actionLink);
  if (!link) return "";
  return `
    <div style="margin: 18px 0 20px;">
      <a href="${escapeHtml(link)}" style="display: inline-block; padding: 13px 18px; border-radius: 10px; background: #0f2f4f; color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none;">Confirm viewings</a>
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
  branding?: BridgeEmailLayoutBranding;
}) {
  const selectedProperties = normalizeProperties(properties);
  const propertyCount = selectedProperties.length || 1;
  const contentHtml = [
    renderBridgeIntroParagraphs([
      `${agentName} has prepared ${
        propertyCount === 1
          ? "a viewing option"
          : `${propertyCount} viewing options`
      } for you.`,
      actionLink
        ? "Use the button below to confirm which properties you would like to view and the times that suit you."
        : "Please reply with the properties you would like to view and two or three time windows that suit you.",
      note ? `Agent note: ${note}` : "",
    ]),
    renderActionButton(actionLink),
    renderPropertyList(selectedProperties),
    renderBridgeBullets([
      "Which property or properties you would like to view.",
      "Two or three time windows that work for you.",
      "Whether anyone else will be joining the viewing.",
    ]),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: "Please confirm your preferred viewing times.",
    title: "Viewing Availability Request",
    greeting: `Hi ${pickText(buyerName, "there")},`,
    contentHtml,
    securityTitle: "Viewing Coordination",
    securityBody:
      "Your viewing request is coordinated through Arch9 so your agent can keep the enquiry, properties, and appointments connected.",
    helpBody: "Need help? Reply to this email and your agent will assist you.",
    organisationName,
    supportEmail,
    supportPhone,
    branding,
  });
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
}: {
  buyerName?: string;
  agentName?: string;
  properties?: ViewingAvailabilityRequestProperty[];
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  actionLink?: string;
}) {
  const selectedProperties = normalizeProperties(properties);
  const propertyLines = selectedProperties.length
    ? selectedProperties.map((property, index) =>
      [
        `${index + 1}. ${property.title}`,
        property.price ? `   Price: ${property.price}` : "",
        property.area ? `   Area: ${property.area}` : "",
        property.match ? `   Match: ${property.match}` : "",
        property.sellerViewingAvailability ? `   Owner availability: ${property.sellerViewingAvailability}` : "",
        property.sellerViewingNoticePeriod ? `   Notice: ${property.sellerViewingNoticePeriod}` : "",
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
      ? "Confirm your preferred viewings here:"
      : "Please reply with the properties you would like to view and two or three time windows that suit you.",
    actionLink || null,
    note ? `Agent note: ${note}` : null,
    "",
    propertyLines,
    "",
    actionLink ? "Or reply with:" : "Please reply with:",
    "1. Which property or properties you would like to view.",
    "2. Two or three time windows that work for you.",
    "3. Whether anyone else will be joining the viewing.",
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
