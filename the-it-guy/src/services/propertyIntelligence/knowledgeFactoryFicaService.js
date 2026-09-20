import { supabase } from "../../lib/supabaseClient";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEMS = ["identity", "proof_of_address", "source_of_funds"];

function text(value = "") { return String(value || "").trim(); }
function validOrganisation(value) {
  if (!UUID.test(text(value))) throw new Error("Select a valid organisation workspace.");
  return text(value);
}
function checklist(value = {}) {
  return Object.fromEntries(ITEMS.map((key) => [
    key,
    ["not_requested", "requested", "received", "verified", "rejected"].includes(text(value[key]))
      ? text(value[key]) : "not_requested",
  ]));
}
function map(row = {}) {
  return {
    ...row,
    documentChecklist: checklist(row.document_checklist),
    consentCapturedAt: row.consent_captured_at,
    verificationProviderStatus: text(row.verification_provider_status) || "not_configured",
    documentReadiness: row.document_readiness || {},
    providerCheckStatuses: row.provider_check_statuses || {},
    providerOverallStatus: row.provider_overall_status,
    providerResultExpiresAt: row.provider_result_expires_at,
    staffApprovalStatus: row.staff_approval_status || "not_ready",
    certificateDocumentId: row.certificate_document_id,
    certificateSupersededAt: row.certificate_superseded_at,
  };
}
async function call(body) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("Please sign in again before using FICA/KYC.");
  const response = await fetch("/api/knowledge-factory/fica-demo", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(payload?.error) || `FICA demo request failed (HTTP ${response.status}).`);
  return payload || {};
}

export async function listKnowledgeFactoryFicaCases({ organisationId } = {}) {
  const result = await call({ action: "list", organisationId: validOrganisation(organisationId) });
  return (result.items || []).map(map);
}

export async function createKnowledgeFactoryFicaCase({ organisationId, subjectName, entityType = "individual", partyRole = "seller", consentCaptured = false } = {}) {
  const result = await call({
    action: "create",
    organisationId: validOrganisation(organisationId),
    subjectName: text(subjectName),
    entityType: text(entityType),
    partyRole: text(partyRole),
    consentCaptured: consentCaptured === true,
  });
  return map(result.item);
}

export async function updateKnowledgeFactoryFicaChecklist({ organisationId, id, documentChecklist } = {}) {
  if (!UUID.test(text(id))) throw new Error("A valid FICA case is required.");
  const result = await call({
    action: "update_checklist",
    organisationId: validOrganisation(organisationId),
    caseId: text(id),
    documentChecklist: checklist(documentChecklist),
  });
  return map(result.item);
}
