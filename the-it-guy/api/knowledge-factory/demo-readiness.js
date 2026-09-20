import { createClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set(["principal", "owner", "director", "admin", "super_admin", "agency_admin"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASIC_OPERATIONS = ["property_by_id", "owners"];
const FULL_OPERATIONS = ["property_by_id", "owners", "municipal_valuation", "transfers", "bonds"];

function text(value, max = 1_000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validUuid(value) { return UUID.test(text(value, 100)); }
function reply(response, status, body) { response.status(status).setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(body)); }
function header(headers, name) { const value = headers?.[name] || headers?.[name.toLowerCase()]; return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000); }
function role(value) { const normalized = text(value).toLowerCase(); return normalized === "administrator" ? "admin" : normalized === "superadmin" ? "super_admin" : normalized === "principal / owner" ? "principal" : normalized; }
async function body(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function runtime() {
  const url = text(process.env.SUPABASE_URL, 2_000);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000);
  if (!url || !key) { const error = new Error("Missing private server configuration for demo readiness."); error.status = 503; throw error; }
  return { url, key };
}
async function administrator(request, db, organisationId) {
  const token = header(request.headers, "authorization").replace(/^Bearer\s+/i, "");
  if (!token) { const error = new Error("Your browser did not provide an active sign-in token."); error.status = 401; throw error; }
  const { data: { user }, error: userError } = await db.auth.getUser(token);
  if (userError || !user?.id) { const error = new Error("Your sign-in token could not be verified. Please sign in again."); error.status = 401; throw error; }
  const { data: membership, error } = await db.from("organisation_users").select("status, membership_status, role, workspace_role, organization_role, organisation_role").eq("organisation_id", organisationId).eq("user_id", user.id).maybeSingle();
  const active = text(membership?.membership_status || membership?.status).toLowerCase() === "active";
  if (error || !membership || !active || !ADMIN_ROLES.has(role(membership.workspace_role || membership.organization_role || membership.organisation_role || membership.role))) {
    const failure = new Error("Only a principal-level administrator can view UAT demo readiness."); failure.status = 403; throw failure;
  }
}
function passedOperations(rows = []) {
  return new Set(rows.filter((row) => row.status === "passed").map((row) => row.operation_key));
}
function hasAll(set, operations) { return operations.every((operation) => set.has(operation)); }

export default async function handler(request, response) {
  if (request.method !== "POST") return reply(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    if (!validUuid(organisationId)) return reply(response, 400, { error: "A valid organisation is required." });
    const config = runtime();
    const db = createClient(config.url, config.key, { auth: { autoRefreshToken: false, persistSession: false } });
    await administrator(request, db, organisationId);
    const [access, permissions, checks, products, commercialPolicy, pilot, intents, results, ficaCases] = await Promise.all([
      db.from("knowledge_factory_organisation_access").select("enabled, suspended_at").eq("organisation_id", organisationId).maybeSingle(),
      db.from("knowledge_factory_user_permissions").select("allowed_operations, revoked_at").eq("organisation_id", organisationId).limit(100),
      db.from("knowledge_factory_uat_contract_checks").select("operation_key, status").eq("organisation_id", organisationId).limit(100),
      db.from("knowledge_factory_report_products").select("product_id, status").eq("organisation_id", organisationId).limit(20),
      db.from("knowledge_factory_package_commercial_policies").select("allowed_product_ids, rollout_stage, monthly_credit_cap, monthly_report_cap").eq("organisation_id", organisationId).maybeSingle(),
      db.from("knowledge_factory_package_pilot_enrolments").select("status, pilot_ends_at, allowed_user_ids").eq("organisation_id", organisationId).maybeSingle(),
      db.from("knowledge_factory_report_purchase_intents").select("status").eq("organisation_id", organisationId).limit(100),
      db.from("knowledge_factory_report_results").select("id").eq("organisation_id", organisationId).limit(100),
      db.from("knowledge_factory_fica_cases").select("status, verification_provider_status").eq("organisation_id", organisationId).limit(100),
    ]);
    const failure = [access.error, permissions.error, checks.error, products.error, commercialPolicy.error, pilot.error, intents.error, results.error, ficaCases.error].find(Boolean);
    if (failure) throw new Error("Demo readiness could not be calculated.");
    const passed = passedOperations(checks.data || []);
    const activePermissions = (permissions.data || []).filter((row) => !row.revoked_at);
    const namedUsers = (operation) => activePermissions.filter((row) => row.allowed_operations?.includes(operation)).length;
    const productStatus = new Map((products.data || []).map((row) => [row.product_id, row.status]));
    const activePilot = pilot.data?.status === "active" && Date.parse(pilot.data?.pilot_ends_at || "") > Date.now();
    const noProviderSubmission = (ficaCases.data || []).every((row) => !["submitted", "completed"].includes(row.verification_provider_status));
    const checksOut = [
      { key: "controlled_access", label: "Controlled UAT access and named users", passed: access.data?.enabled === true && !access.data?.suspended_at && namedUsers("map_properties") > 0 && namedUsers("property_report") > 0, detail: `${namedUsers("map_properties")} map user(s), ${namedUsers("property_report")} report user(s)` },
      { key: "basic_contract", label: "Basic report contract is evidenced", passed: hasAll(passed, BASIC_OPERATIONS), detail: BASIC_OPERATIONS.filter((item) => !passed.has(item)).length ? `Still required: ${BASIC_OPERATIONS.filter((item) => !passed.has(item)).join(", ")}` : "Property and owner operations passed" },
      { key: "full_contract", label: "Full report contract is evidenced", passed: hasAll(passed, FULL_OPERATIONS), detail: FULL_OPERATIONS.filter((item) => !passed.has(item)).length ? `Still required: ${FULL_OPERATIONS.filter((item) => !passed.has(item)).join(", ")}` : "Property, owner, valuation, transfer and bond operations passed" },
      { key: "packages", label: "Report packages are UAT ready", passed: productStatus.get("basic_owner_lookup") === "uat_validated" && productStatus.get("full_canvassing_report") === "uat_validated", detail: `${productStatus.get("basic_owner_lookup") || "Basic not ready"}; ${productStatus.get("full_canvassing_report") || "Full not ready"}` },
      { key: "commercial_controls", label: "Commercial limits and named pilot are active", passed: Boolean(commercialPolicy.data?.allowed_product_ids?.length) && activePilot, detail: activePilot ? "Named pilot is active within its expiry" : "Set commercial controls and activate an unexpired named pilot" },
      { key: "quote_flow", label: "Quote and confirmation flow has evidence", passed: (intents.data || []).some((row) => ["confirmed_pending_execution", "executing", "executed"].includes(row.status)), detail: `${(intents.data || []).length} quote/confirmation record(s); ${(results.data || []).length} saved report(s)` },
      { key: "fica_boundary", label: "FICA/KYC remains a controlled demo boundary", passed: noProviderSubmission, detail: `${(ficaCases.data || []).length} FICA case(s); external provider execution remains unavailable` },
    ];
    return reply(response, 200, { checks: checksOut, summary: { ready: checksOut.every((check) => check.passed), passed: checksOut.filter((check) => check.passed).length, total: checksOut.length, reportResults: (results.data || []).length, ficaCases: (ficaCases.data || []).length } });
  } catch (error) {
    reply(response, Number(error?.status || 502), { error: error?.message || "Demo readiness is unavailable." });
  }
}
