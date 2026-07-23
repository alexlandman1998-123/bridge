/**
 * The generic email endpoint has no authoritative packet/version context.
 * Final signed legal documents therefore must never be delivered through it:
 * the canonical dispatcher validates F2/F3/F4 and creates the short-lived
 * artifact URL only after those checks pass.
 */
export const FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED =
  "FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED";

const RETIRED_FINAL_SIGNED_LEGAL_DOCUMENT_EMAIL_TYPES = new Set([
  "seller_mandate_signed",
  "final_signed_document",
  "final_signed_legal_document",
  "final_signed_mandate",
  "final_signed_otp",
]);

export function isRetiredFinalSignedLegalDocumentEmailType(type: unknown) {
  return typeof type === "string" &&
    RETIRED_FINAL_SIGNED_LEGAL_DOCUMENT_EMAIL_TYPES.has(
      type.trim().toLowerCase().replaceAll("-", "_"),
    );
}
