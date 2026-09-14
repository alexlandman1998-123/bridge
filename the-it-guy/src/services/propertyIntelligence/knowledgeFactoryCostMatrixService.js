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
    throw new Error("Please sign in again before validating supplier costs.");
  const response = await fetch("/api/knowledge-factory/cost-matrix", {
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
        `Cost validation failed (HTTP ${response.status}).`,
    );
  return payload || {};
}

export function listKnowledgeFactoryCostMatrix({ organisationId } = {}) {
  return call({ action: "list", organisationId: text(organisationId) });
}
export function validateKnowledgeFactoryCostRecipe({
  organisationId,
  propertyId,
  recipeId,
  purpose,
} = {}) {
  return call({
    action: "validate",
    organisationId: text(organisationId),
    propertyId: text(propertyId),
    recipeId: text(recipeId),
    purpose: text(purpose),
  });
}
