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
    throw new Error("Please sign in again before managing the package pilot.");
  const response = await fetch("/api/knowledge-factory/package-pilot", {
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
        `Package pilot request failed (HTTP ${response.status}).`,
    );
  return payload || {};
}

export function getKnowledgeFactoryPackagePilot({ organisationId } = {}) {
  return call({ action: "get", organisationId: text(organisationId) });
}

export function saveKnowledgeFactoryPackagePilot({
  organisationId,
  status,
  allowedUserIds,
  pilotReportCap,
  pilotCreditCap,
  pilotEndsAt,
} = {}) {
  return call({
    action: "save",
    organisationId: text(organisationId),
    status: text(status),
    allowedUserIds,
    pilotReportCap,
    pilotCreditCap,
    pilotEndsAt: text(pilotEndsAt),
  });
}
