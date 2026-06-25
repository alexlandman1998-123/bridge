export type BridgeEmailSummaryField = {
  label: string;
  value: string;
};

export function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBridgeIntroParagraphs(paragraphs: string[]) {
  return paragraphs
    .filter(Boolean)
    .map((paragraph) =>
      `<p style="margin: 0 0 12px; font-size: 15px; line-height: 1.65; color: #1f3347;">${escapeHtml(paragraph)}</p>`
    )
    .join("");
}

export function renderBridgeBullets(items: string[]) {
  const points = items.filter(Boolean);
  if (!points.length) return "";
  return `
    <ul style="margin: 0; padding: 0 0 0 18px; color: #1f3347;">
      ${points.map((item) => `<li style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

export function renderBridgeSteps(items: string[]) {
  const steps = items.filter(Boolean);
  if (!steps.length) return "";
  return `
    <ol style="margin: 0; padding: 0 0 0 18px; color: #1f3347;">
      ${steps.map((item) => `<li style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">${escapeHtml(item)}</li>`).join("")}
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
    <div style="margin: 16px 0; padding: 16px; border: 1px solid #dbe6f2; border-radius: 12px; background: #f7fbff;">
      <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">${escapeHtml(title)}</p>
      ${rows.map((field) =>
        `<p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: #1f3347;"><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(field.value)}</p>`
      ).join("")}
    </div>
  `;
}

export function renderBridgeCta(label: string, url: string) {
  if (!label || !url) return "";
  const safeUrl = escapeHtml(url);
  return `
    <p style="margin: 0 0 12px;">
      <a href="${safeUrl}" style="display: inline-block; padding: 14px 24px; background: #0f2f4f; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 700;">
        ${escapeHtml(label)}
      </a>
    </p>
    <p style="margin: 0 0 18px; font-size: 13px; line-height: 1.5; color: #5f7590;">
      If the button does not work, copy and paste this URL into your browser:<br />
      <a href="${safeUrl}" style="color: #0f4c81;">${safeUrl}</a>
    </p>
  `;
}

export function renderBridgeEmailLayout({
  preheader = "",
  title,
  greeting,
  contentHtml,
  securityTitle = "Security & Privacy",
  securityBody = "Your information and documents are handled securely through Arch9. Only authorised parties involved in your transaction can access your onboarding details.",
  helpBody = "Need help? Reply to this email or contact your property representative directly.",
  organisationName = "Arch9",
  senderOrganisationName = "",
  senderOrganisationLogoUrl = "",
  supportEmail = "",
  supportPhone = "",
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
}) {
  const safeSupportEmail = supportEmail ? escapeHtml(supportEmail) : "";
  const safeSupportPhone = supportPhone ? escapeHtml(supportPhone) : "";
  const resolvedOrganisationName = senderOrganisationName || organisationName || "Arch9";
  const safeOrganisationName = escapeHtml(resolvedOrganisationName);
  const safeOrganisationLogoUrl = senderOrganisationLogoUrl ? escapeHtml(senderOrganisationLogoUrl) : "";
  const supportLine = [safeSupportEmail, safeSupportPhone].filter(Boolean).join(" · ");
  const headerBrandHtml = safeOrganisationLogoUrl
    ? `<img src="${safeOrganisationLogoUrl}" alt="${safeOrganisationName}" style="display: block; max-height: 40px; max-width: 220px; width: auto; height: auto; object-fit: contain;" />`
    : `<p style="margin: 0; font-size: 17px; line-height: 1.2; color: #ffffff; font-weight: 700; letter-spacing: 0.01em;">${safeOrganisationName}</p>`;

  return `
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      ${escapeHtml(preheader)}
    </div>
    <div style="margin: 0; padding: 24px 12px; background: #eef3f8;">
      <div style="max-width: 660px; margin: 0 auto; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #142132;">
        <div style="background: #0b2743; border-radius: 16px 16px 0 0; padding: 24px;">
          <div style="margin: 0 0 18px;">${headerBrandHtml}</div>
          <h1 style="margin: 10px 0 0; font-size: 28px; line-height: 1.2; color: #ffffff;">${escapeHtml(title)}</h1>
        </div>
        <div style="background: #ffffff; border: 1px solid #d8e3ef; border-top: 0; border-radius: 0 0 16px 16px; padding: 28px;">
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #1f3347;">${escapeHtml(greeting)}</p>
          ${contentHtml}
          <div style="margin: 18px 0 16px; border: 1px solid #e2eaf4; border-radius: 12px; background: #f8fbff; padding: 14px;">
            <p style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #5f7590; font-weight: 700;">${escapeHtml(securityTitle)}</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #35506d;">${escapeHtml(securityBody)}</p>
          </div>
          <p style="margin: 0 0 6px; font-size: 13px; line-height: 1.6; color: #35506d;">${escapeHtml(helpBody)}</p>
          ${supportLine ? `<p style="margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #35506d;">Support: ${supportLine}</p>` : ""}
          <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #748aa2;">${safeOrganisationName} · Powered by Arch9</p>
        </div>
      </div>
    </div>
  `;
}
