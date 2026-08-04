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
  link?: string;
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
      link: normalizeText(property?.link),
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
        <div style="margin: 0 0 10px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #f7fbff;">
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
        </div>
      `).join("")
  }
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
  branding,
}: {
  buyerName?: string;
  agentName?: string;
  properties?: ViewingAvailabilityRequestProperty[];
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
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
      "Please reply with the properties you would like to view and two or three time windows that suit you.",
      note ? `Agent note: ${note}` : "",
    ]),
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
}: {
  buyerName?: string;
  agentName?: string;
  properties?: ViewingAvailabilityRequestProperty[];
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
}) {
  const selectedProperties = normalizeProperties(properties);
  const propertyLines = selectedProperties.length
    ? selectedProperties.map((property, index) =>
      [
        `${index + 1}. ${property.title}`,
        property.price ? `   Price: ${property.price}` : "",
        property.area ? `   Area: ${property.area}` : "",
        property.match ? `   Match: ${property.match}` : "",
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
    "Please reply with the properties you would like to view and two or three time windows that suit you.",
    note ? `Agent note: ${note}` : null,
    "",
    propertyLines,
    "",
    "Please reply with:",
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
