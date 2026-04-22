export function buildOnboardingSubject(transactionReference: string) {
  return transactionReference
    ? `Complete your Bridge onboarding (${transactionReference})`
    : "Complete your Bridge onboarding";
}

export function buildOnboardingEmailHtml({
  buyerName,
  developmentName,
  unitLabel,
  purchasePrice,
  onboardingUrl,
}: {
  buyerName: string;
  developmentName: string;
  unitLabel: string;
  purchasePrice: string;
  onboardingUrl: string;
}) {
  const subjectLine = [developmentName, unitLabel].filter(Boolean).join(" • ");

  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f8fafc; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe4ef; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f2f4f; color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">Bridge</p>
          <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Client Onboarding</h1>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 14px; font-size: 15px;">Hi ${buyerName || "there"},</p>
          <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6;">
            Your transaction has been created. Please complete your onboarding information so the team can continue with your purchase process.
          </p>
          ${
            subjectLine || purchasePrice
              ? `<div style="margin: 16px 0; padding: 14px; border: 1px solid #e3ebf4; border-radius: 12px; background: #f8fbff;">
                   ${subjectLine ? `<p style="margin: 0 0 6px; font-size: 14px; color: #334155;"><strong>Property:</strong> ${subjectLine}</p>` : ""}
                   ${purchasePrice ? `<p style="margin: 0; font-size: 14px; color: #334155;"><strong>Purchase Price:</strong> ${purchasePrice}</p>` : ""}
                 </div>`
              : ""
          }
          <p style="margin: 0 0 18px; font-size: 15px;">Use the link below to begin:</p>
          <p style="margin: 0 0 22px;">
            <a href="${onboardingUrl}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">
              Open Onboarding
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
            If the button does not work, copy and paste this URL into your browser:<br />
            <a href="${onboardingUrl}" style="color: #0f4c81;">${onboardingUrl}</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

export function buildOnboardingEmailText({
  buyerName,
  onboardingUrl,
  developmentName,
  unitLabel,
}: {
  buyerName: string;
  onboardingUrl: string;
  developmentName: string;
  unitLabel: string;
}) {
  const propertyLine = [developmentName, unitLabel].filter(Boolean).join(" • ");

  return [
    `Hi ${buyerName || "there"},`,
    "",
    "Your transaction has been created on Bridge.",
    propertyLine ? `Property: ${propertyLine}` : null,
    "",
    "Please complete your onboarding information using this link:",
    onboardingUrl,
    "",
    "Bridge",
  ]
    .filter(Boolean)
    .join("\n");
}
