import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set([
  "principal", "owner", "director", "admin", "super_admin", "agency_admin",
  "compliance_officer", "compliance_reviewer",
]);
const DOCUMENT_ITEMS = ["identity", "proof_of_address", "source_of_funds"];
const DOCUMENT_STATES = new Set([
  "not_requested", "requested", "received", "verified", "rejected",
]);

function text(value, max = 1_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function header(headers, name) {
  const value = headers?.[name] || headers?.[name.toLowerCase()];
  return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000);
}
function reply(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}
function validUuid(value) { return UUID.test(text(value, 100)); }
function normalizeRole(value) {
  const role = text(value).toLowerCase();
  if (role === "administrator") return "admin";
  if (role === "superadmin") return "super_admin";
  if (role === "principal / owner") return "principal";
  return role;
}
function checklist(value = {}) {
  return Object.fromEntries(DOCUMENT_ITEMS.map((key) => [
    key,
    DOCUMENT_STATES.has(text(value?.[key], 30)) ? text(value[key], 30) : "not_requested",
  ]));
}
function statusForChecklist(next) {
  const statuses = Object.values(next);
  if (statuses.every((status) => status === "received" || status === "verified"))
    return "review_required";
  if (statuses.some((status) => status !== "not_requested")) return "documents_requested";
  return "consent_captured";
}
async function body(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body))
    return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function runtime() {
  const url = text(process.env.SUPABASE_URL, 2_000);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000);
  if (!url || !key) {
    const error = new Error("Missing private server configuration for the FICA demo workflow.");
    error.status = 503;
    throw error;
  }
  return { url, key };
}
async function actor(request, db, organisationId) {
  const token = header(request.headers, "authorization").replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("Your browser did not provide an active sign-in token.");
    error.status = 401;
    throw error;
  }
  const { data: { user }, error: userError } = await db.auth.getUser(token);
  if (userError || !user?.id) {
    const error = new Error("Your sign-in token could not be verified. Please sign in again.");
    error.status = 401;
    throw error;
  }
  const { data: membership, error: membershipError } = await db
    .from("organisation_users")
    .select("status, membership_status, role, workspace_role, organization_role, organisation_role")
    .eq("organisation_id", organisationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const active = text(membership?.membership_status || membership?.status).toLowerCase() === "active";
  if (membershipError || !membership || !active) {
    const error = new Error("An active organisation membership is required.");
    error.status = 403;
    throw error;
  }
  const [access, permission] = await Promise.all([
    db.from("knowledge_factory_organisation_access").select("enabled, allowed_operations, suspended_at").eq("organisation_id", organisationId).maybeSingle(),
    db.from("knowledge_factory_user_permissions").select("allowed_operations, revoked_at").eq("organisation_id", organisationId).eq("user_id", user.id).maybeSingle(),
  ]);
  const permitted = access.data?.enabled === true && !access.data?.suspended_at &&
    access.data?.allowed_operations?.includes("fica_kyc") && !permission.data?.revoked_at &&
    permission.data?.allowed_operations?.includes("fica_kyc");
  if (access.error || permission.error || !permitted) {
    const error = new Error("FICA/KYC access has not been granted for your user.");
    error.status = 403;
    throw error;
  }
  const role = normalizeRole(membership.workspace_role || membership.organization_role || membership.organisation_role || membership.role);
  return { userId: user.id, isAdmin: ADMIN_ROLES.has(role) };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return reply(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 40);
    if (!validUuid(organisationId) || !["list", "create", "update_checklist"].includes(action))
      return reply(response, 400, { error: "A valid organisation and action are required." });
    const config = runtime();
    const db = createClient(config.url, config.key, { auth: { autoRefreshToken: false, persistSession: false } });
    const currentActor = await actor(request, db, organisationId);
    if (action === "list") {
      const { data, error } = await db.from("knowledge_factory_fica_cases")
        .select("*").eq("organisation_id", organisationId).order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("FICA cases could not be loaded.");
      return reply(response, 200, { items: (data || []).filter((item) => currentActor.isAdmin || item.created_by === currentActor.userId) });
    }
    if (action === "create") {
      const subjectName = text(input.subjectName, 200);
      const entityType = text(input.entityType, 30);
      const partyRole = text(input.partyRole, 30);
      if (subjectName.length < 2 || !["individual", "company", "trust"].includes(entityType) || !["buyer", "seller"].includes(partyRole) || input.consentCaptured !== true)
        return reply(response, 400, { error: "Enter the party, entity type and recorded FICA/KYC consent before opening a case." });
      const now = new Date().toISOString();
      const { data, error } = await db.from("knowledge_factory_fica_cases").insert({
        organisation_id: organisationId,
        created_by: currentActor.userId,
        subject_name: subjectName,
        entity_type: entityType,
        party_role: partyRole,
        status: "consent_captured",
        consent_captured_at: now,
        consent_captured_by: currentActor.userId,
        consent_version: "arch9_fica_kyc_demo_v1",
        document_checklist: checklist(),
        verification_provider_status: "not_configured",
      }).select("*").single();
      if (error || !data) throw new Error("FICA case could not be opened.");
      return reply(response, 201, { item: data });
    }
    const caseId = text(input.caseId, 100);
    if (!validUuid(caseId)) return reply(response, 400, { error: "Select a valid FICA case." });
    const { data: existing, error: existingError } = await db.from("knowledge_factory_fica_cases")
      .select("id, created_by, document_checklist, verification_provider_status")
      .eq("id", caseId).eq("organisation_id", organisationId).maybeSingle();
    if (existingError || !existing) return reply(response, 404, { error: "The FICA case could not be found." });
    if (!currentActor.isAdmin && existing.created_by !== currentActor.userId)
      return reply(response, 403, { error: "You may only update FICA cases you opened." });
    const nextChecklist = checklist(input.documentChecklist);
    const { data, error } = await db.from("knowledge_factory_fica_cases").update({
      document_checklist: nextChecklist,
      status: statusForChecklist(nextChecklist),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error("The FICA document checklist could not be updated.");
    return reply(response, 200, { item: data });
  } catch (error) {
    reply(response, Number(error?.status || 502), { error: error?.message || "The FICA demo workflow could not be completed." });
  }
}
