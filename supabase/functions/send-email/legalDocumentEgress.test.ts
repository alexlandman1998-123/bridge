import {
  FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED,
  isRetiredFinalSignedLegalDocumentEmailType,
} from "./legalDocumentEgress.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("generic email rejects every final-signed legal-document alias", () => {
  for (const type of [
    "seller_mandate_signed",
    "seller-mandate-signed",
    "final_signed_document",
    "final_signed_legal_document",
    "final_signed_mandate",
    "final_signed_otp",
  ]) {
    assert(
      isRetiredFinalSignedLegalDocumentEmailType(type),
      `Expected ${type} to require the canonical final-delivery dispatcher.`,
    );
  }
  assert(
    !isRetiredFinalSignedLegalDocumentEmailType("seller_onboarding"),
    "Non-document email types must remain available to the generic router.",
  );
  assert(
    FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED ===
      "FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED",
    "The retired-route error code must remain stable for callers and monitoring.",
  );
});
