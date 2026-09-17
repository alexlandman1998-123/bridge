import { supabase } from "../../lib/supabaseClient";

function text(value = "") {
  return String(value || "").trim();
}
async function call(body) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token)
    throw new Error("Please sign in again before confirming a report.");
  const response = await fetch(
    "/api/knowledge-factory/report-purchase-intents",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      text(payload?.error) ||
        `Report confirmation failed (HTTP ${response.status}).`,
    );
  return payload || {};
}
export function listKnowledgeFactoryPurchasableProducts({
  organisationId,
} = {}) {
  return call({
    action: "list_products",
    organisationId: text(organisationId),
  });
}
export function confirmKnowledgeFactoryReportPurchase({
  organisationId,
  propertyId,
  productId,
  purpose,
} = {}) {
  return call({
    action: "confirm",
    organisationId: text(organisationId),
    propertyId: text(propertyId),
    productId: text(productId),
    purpose: text(purpose),
  });
}
export function executeKnowledgeFactoryReportPurchase({
  organisationId,
  intentId,
} = {}) {
  return call({
    action: "execute",
    organisationId: text(organisationId),
    intentId: text(intentId),
  });
}
