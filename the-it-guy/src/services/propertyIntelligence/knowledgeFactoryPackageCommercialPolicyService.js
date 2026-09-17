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
    throw new Error(
      "Please sign in again before managing commercial controls.",
    );
  const response = await fetch(
    "/api/knowledge-factory/package-commercial-policy",
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
        `Commercial controls request failed (HTTP ${response.status}).`,
    );
  return payload || {};
}

export function getKnowledgeFactoryPackageCommercialPolicy({
  organisationId,
} = {}) {
  return call({ action: "get", organisationId: text(organisationId) });
}

export function saveKnowledgeFactoryPackageCommercialPolicy({
  organisationId,
  allowedProductIds,
  perReportCreditCap,
  monthlyCreditCap,
  monthlyReportCap,
  dailyReportCapPerUser,
  rolloutStage,
  supplierCreditsPerCent,
} = {}) {
  return call({
    action: "save",
    organisationId: text(organisationId),
    allowedProductIds,
    perReportCreditCap,
    monthlyCreditCap,
    monthlyReportCap,
    dailyReportCapPerUser,
    rolloutStage,
    supplierCreditsPerCent,
  });
}
