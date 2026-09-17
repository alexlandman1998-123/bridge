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
    throw new Error("Please sign in again before managing report packages.");
  const response = await fetch("/api/knowledge-factory/report-products", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      text(payload?.error) ||
        `Report package request failed (HTTP ${response.status}).`,
    );
  return payload || {};
}

export function listKnowledgeFactoryReportProducts({ organisationId } = {}) {
  return call({ action: "list", organisationId: text(organisationId) });
}

export function saveKnowledgeFactoryReportProduct({
  organisationId,
  productId,
  customerPriceCents,
  markUatValidated = false,
} = {}) {
  return call({
    action: "save",
    organisationId: text(organisationId),
    productId: text(productId),
    customerPriceCents,
    markUatValidated,
  });
}
