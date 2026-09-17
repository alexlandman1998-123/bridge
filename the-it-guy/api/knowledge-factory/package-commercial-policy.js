import { createClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set([
  "principal",
  "owner",
  "director",
  "admin",
  "super_admin",
  "agency_admin",
]);
const PRODUCT_IDS = new Set(["basic_owner_lookup", "full_canvassing_report"]);
const STAGES = new Set(["controlled_uat", "pilot", "suspended"]);

function text(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function header(headers, name) {
  const value = headers?.[name] || headers?.[name.toLowerCase()];
  return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000);
}
function json(response, status, body) {
  response
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}
function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value, 100),
  );
}
async function body(request) {
  if (
    request.body &&
    typeof request.body === "object" &&
    !Buffer.isBuffer(request.body)
  )
    return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  const chunks = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function runtime() {
  const url = text(process.env.SUPABASE_URL, 2_000);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000);
  if (!url || !key) {
    const error = new Error(
      "Missing private server configuration for commercial controls.",
    );
    error.status = 503;
    throw error;
  }
  return { url, key };
}
function normalizeRole(value) {
  const role = text(value).toLowerCase();
  if (role === "administrator") return "admin";
  if (role === "superadmin") return "super_admin";
  if (role === "principal / owner") return "principal";
  return role;
}
function wholeNumber(value, label, { min = 1, max = 100_000_000 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    const error = new Error(
      `${label} must be a whole number between ${min} and ${max}.`,
    );
    error.status = 400;
    throw error;
  }
  return parsed;
}
function productIds(value) {
  const ids = [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => text(item, 80))
        .filter(Boolean),
    ),
  ];
  if (!ids.length || ids.some((item) => !PRODUCT_IDS.has(item))) {
    const error = new Error(
      "Select one or more supported fixed report packages.",
    );
    error.status = 400;
    throw error;
  }
  return ids;
}
function defaultPolicy() {
  return {
    allowed_product_ids: ["basic_owner_lookup", "full_canvassing_report"],
    per_report_credit_cap: 100_000,
    monthly_credit_cap: 1_000_000,
    monthly_report_cap: 100,
    daily_report_cap_per_user: 10,
    rollout_stage: "controlled_uat",
    supplier_credits_per_cent: 40,
    configured: false,
  };
}
async function administrator(request, db, organisationId) {
  const token = header(request.headers, "authorization").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) {
    const error = new Error(
      "Your browser did not provide an active sign-in token.",
    );
    error.status = 401;
    throw error;
  }
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser(token);
  if (userError || !user?.id) {
    const error = new Error(
      "Your sign-in token could not be verified. Please sign in again.",
    );
    error.status = 401;
    throw error;
  }
  const { data: membership, error } = await db
    .from("organisation_users")
    .select(
      "status, membership_status, role, workspace_role, organization_role, organisation_role",
    )
    .eq("organisation_id", organisationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const active =
    text(membership?.membership_status || membership?.status).toLowerCase() ===
    "active";
  const role = normalizeRole(
    membership?.workspace_role ||
      membership?.organization_role ||
      membership?.organisation_role ||
      membership?.role,
  );
  if (error || !membership || !active || !ADMIN_ROLES.has(role)) {
    const failure = new Error(
      "Only a principal-level administrator can manage package commercial controls.",
    );
    failure.status = 403;
    throw failure;
  }
  return user.id;
}
function monthStart() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}
function total(rows, field) {
  return (rows || []).reduce(
    (sum, row) => sum + (Number(row?.[field]) || 0),
    0,
  );
}
async function usage(db, organisationId) {
  const since = monthStart();
  const [resultsResponse, intentsResponse] = await Promise.all([
    db
      .from("knowledge_factory_report_results")
      .select("credits_consumed, executed_at")
      .eq("organisation_id", organisationId)
      .gte("executed_at", since)
      .limit(10_000),
    db
      .from("knowledge_factory_report_purchase_intents")
      .select("customer_price_cents, executed_at")
      .eq("organisation_id", organisationId)
      .eq("status", "executed")
      .gte("executed_at", since)
      .limit(10_000),
  ]);
  if (resultsResponse.error || intentsResponse.error)
    throw new Error("Commercial usage could not be calculated.");
  return {
    monthStartsAt: since,
    reportCount: (resultsResponse.data || []).length,
    creditsConsumed: total(resultsResponse.data, "credits_consumed"),
    customerRevenueCents: total(intentsResponse.data, "customer_price_cents"),
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST")
    return json(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 40);
    if (!validUuid(organisationId) || !["get", "save"].includes(action))
      return json(response, 400, {
        error: "A valid organisation and action are required.",
      });
    const config = runtime();
    const db = createClient(config.url, config.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const actorId = await administrator(request, db, organisationId);
    if (action === "get") {
      const { data, error } = await db
        .from("knowledge_factory_package_commercial_policies")
        .select(
          "allowed_product_ids, per_report_credit_cap, monthly_credit_cap, monthly_report_cap, daily_report_cap_per_user, rollout_stage, supplier_credits_per_cent, created_at, updated_at",
        )
        .eq("organisation_id", organisationId)
        .maybeSingle();
      if (error)
        throw new Error("Package commercial controls are unavailable.");
      return json(response, 200, {
        policy: data ? { ...data, configured: true } : defaultPolicy(),
        usage: await usage(db, organisationId),
      });
    }
    const rolloutStage = text(input.rolloutStage, 40);
    if (!STAGES.has(rolloutStage))
      return json(response, 400, {
        error: "Choose a supported rollout stage.",
      });
    const patch = {
      organisation_id: organisationId,
      allowed_product_ids: productIds(input.allowedProductIds),
      per_report_credit_cap: wholeNumber(
        input.perReportCreditCap,
        "Per-report credit cap",
      ),
      monthly_credit_cap: wholeNumber(
        input.monthlyCreditCap,
        "Monthly credit cap",
      ),
      monthly_report_cap: wholeNumber(
        input.monthlyReportCap,
        "Monthly report cap",
        { max: 100_000 },
      ),
      daily_report_cap_per_user: wholeNumber(
        input.dailyReportCapPerUser,
        "Daily report cap per user",
        { max: 10_000 },
      ),
      rollout_stage: rolloutStage,
      supplier_credits_per_cent: wholeNumber(
        input.supplierCreditsPerCent,
        "Supplier credits per cent",
        { max: 1_000_000 },
      ),
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db
      .from("knowledge_factory_package_commercial_policies")
      .upsert(patch, { onConflict: "organisation_id" })
      .select(
        "allowed_product_ids, per_report_credit_cap, monthly_credit_cap, monthly_report_cap, daily_report_cap_per_user, rollout_stage, supplier_credits_per_cent, created_at, updated_at",
      )
      .single();
    if (error || !data)
      throw new Error("Package commercial controls could not be saved.");
    await db.from("knowledge_factory_audit_log").insert({
      organisation_id: organisationId,
      actor_id: actorId,
      operation: "commercial_policy",
      request_purpose: "Updated package commercial controls",
      request_metadata: {
        mode: "package_commercial_controls",
        rollout_stage: rolloutStage,
        allowed_product_ids: patch.allowed_product_ids,
      },
      outcome: "completed",
    });
    return json(response, 200, {
      policy: { ...data, configured: true },
      usage: await usage(db, organisationId),
    });
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "Package commercial controls are unavailable.",
    });
  }
}
