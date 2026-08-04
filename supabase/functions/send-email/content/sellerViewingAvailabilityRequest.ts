import {
  type BridgeEmailLayoutBranding,
  escapeHtml,
  renderBridgeBullets,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
} from "./bridgeEmailLayout.ts";

export type SellerViewingAvailabilityRequestProperty = {
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

function normalizeProperties(
  properties: SellerViewingAvailabilityRequestProperty[],
) {
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

function renderPropertyList(
  properties: SellerViewingAvailabilityRequestProperty[],
) {
  const rows = normalizeProperties(properties);
  if (!rows.length) {
    return `
      <div style="margin: 16px 0; padding: 16px; border: 1px solid #dbe6f2; border-radius: 12px; background: #f7fbff;">
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1f3347;">The listed property linked to this buyer enquiry.</p>
      </div>
    `;
  }

  return `
    <div style="margin: 16px 0;">
      <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Properties To Confirm</p>
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
        }" style="color: #0f2f4f; text-decoration: none; font-weight: 700;">View listing details</a></p>`
        : ""
    }
        </div>
      `).join("")
  }
    </div>
  `;
}

export function buildSellerViewingAvailabilityRequestEmailHtml({
  sellerName = "there",
  buyerName = "the buyer",
  agentName = "your agent",
  properties = [],
  availabilityWindows = "",
  coordinationNotes = "",
  organisationName = "Arch9",
  supportEmail = "",
  supportPhone = "",
  branding,
}: {
  sellerName?: string;
  buyerName?: string;
  agentName?: string;
  properties?: SellerViewingAvailabilityRequestProperty[];
  availabilityWindows?: string;
  coordinationNotes?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  branding?: BridgeEmailLayoutBranding;
}) {
  const selectedProperties = normalizeProperties(properties);
  const propertyCount = selectedProperties.length || 1;
  const contentHtml = [
    renderBridgeIntroParagraphs([
      `${agentName} is coordinating ${
        propertyCount === 1
          ? "a buyer viewing"
          : `${propertyCount} buyer viewings`
      } for ${pickText(buyerName, "the buyer")}.`,
      "Please confirm which of the buyer's proposed time windows will work for property access.",
      coordinationNotes ? `Agent note: ${coordinationNotes}` : "",
    ]),
    renderPropertyList(selectedProperties),
    renderBridgeBullets([
      "Which proposed time windows work for access.",
      "Whether keys, access codes, pets, alarms, or tenant arrangements apply.",
      "Any time windows that should be avoided.",
    ]),
    renderBridgeIntroParagraphs([
      availabilityWindows
        ? `Buyer availability: ${availabilityWindows}`
        : "Buyer availability will be confirmed before the appointment is booked.",
    ]),
  ].join("");

  return renderBridgeEmailLayout({
    preheader: "Please confirm seller access for this viewing request.",
    title: "Seller Viewing Availability",
    greeting: `Hi ${pickText(sellerName, "there")},`,
    contentHtml,
    securityTitle: "Viewing Coordination",
    securityBody:
      "This request is coordinated through Arch9 so the buyer enquiry, seller access, and appointment record stay connected.",
    helpBody: "Need help? Reply to this email and your agent will assist you.",
    organisationName,
    supportEmail,
    supportPhone,
    branding,
  });
}

export function buildSellerViewingAvailabilityRequestEmailText({
  sellerName = "there",
  buyerName = "the buyer",
  agentName = "your agent",
  properties = [],
  availabilityWindows = "",
  coordinationNotes = "",
  organisationName = "Arch9",
  supportEmail = "",
  supportPhone = "",
}: {
  sellerName?: string;
  buyerName?: string;
  agentName?: string;
  properties?: SellerViewingAvailabilityRequestProperty[];
  availabilityWindows?: string;
  coordinationNotes?: string;
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
    : "1. The listed property linked to this buyer enquiry";

  return [
    `Hi ${pickText(sellerName, "there")},`,
    "",
    `${agentName} is coordinating ${
      selectedProperties.length === 1
        ? "a buyer viewing"
        : `${selectedProperties.length || 1} buyer viewings`
    } for ${pickText(buyerName, "the buyer")}.`,
    "Please confirm which of the buyer's proposed time windows will work for property access.",
    coordinationNotes ? `Agent note: ${coordinationNotes}` : null,
    "",
    propertyLines,
    "",
    "Buyer availability:",
    availabilityWindows || "Availability still needs to be confirmed.",
    "",
    "Please reply with:",
    "1. Which proposed time windows work for access.",
    "2. Whether keys, access codes, pets, alarms, or tenant arrangements apply.",
    "3. Any time windows that should be avoided.",
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
