import { createClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set([
  "principal",
  "owner",
  "director",
  "admin",
  "super_admin",
  "agency_admin",
]);
const STATUSES = new Set(["candidate", "active", "paused", "completed"]);
const MAX_PILOT_USERS = 5;
const MAX_PILOT_DAYS = 30;

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
      "Missing private server configuration for the package pilot.",
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
      "Only a principal-level administrator can manage the package pilot.",
    );
    failure.status = 403;
    throw failure;
  }
  return user.id;
}
function activeMembership(row) {
  return text(row?.membership_status || row?.status).toLowerCase() === "active";
}
function positiveInteger(value, label, max = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    const error = new Error(
      `${label} must be a whole number between 1 and ${max}.`,
    );
    error.status = 400;
    throw error;
  }
  return parsed;
}
function pilotEndsAt(value) {
  const timestamp = Date.parse(text(value, 80));
  if (!Number.isFinite(timestamp)) {
    const error = new Error("Choose a valid pilot end date.");
    error.status = 400;
    throw error;
  }
  const now = Date.now();
  if (timestamp <= now) {
    const error = new Error("The pilot end date must be in the future.");
    error.status = 400;
    throw error;
  }
  if (timestamp > now + MAX_PILOT_DAYS * 24 * 60 * 60_000) {
    const error = new Error(
      `A named pilot may run for no more than ${MAX_PILOT_DAYS} days.`,
    );
    error.status = 400;
    throw error;
  }
  return new Date(timestamp).toISOString();
}
function pilotTimestamp(value) {
  const timestamp = Date.parse(text(value, 80));
  if (!Number.isFinite(timestamp)) {
    const error = new Error("Choose a valid pilot end date.");
    error.status = 400;
    throw error;
  }
  return new Date(timestamp).toISOString();
}
async function pilotUsage(db, organisationId, pilot) {
  const activatedAt = text(pilot?.activated_at, 80);
  if (!activatedAt)
    return { reportCount: 0, creditsConsumed: 0, activatedAt: null };
  const { data, error } = await db
    .from("knowledge_factory_report_results")
    .select("credits_consumed")
    .eq("organisation_id", organisationId)
    .gte("executed_at", activatedAt)
    .limit(1_000);
  if (error) throw new Error("Package pilot usage could not be calculated.");
  return {
    reportCount: (data || []).length,
    creditsConsumed: (data || []).reduce(
      (total, report) => total + (Number(report.credits_consumed) || 0),
      0,
    ),
    activatedAt,
  };
}
async function eligibleUsers(db, organisationId) {
  const [memberships, permissions] = await Promise.all([
    db
      .from("organisation_users")
      .select("user_id, email, status, membership_status")
      .eq("organisation_id", organisationId)
      .limit(100),
    db
      .from("knowledge_factory_user_permissions")
      .select("user_id, allowed_operations, revoked_at")
      .eq("organisation_id", organisationId)
      .limit(100),
  ]);
  if (memberships.error || permissions.error)
    throw new Error("Eligible package-pilot users could not be loaded.");
  const reportUsers = new Set(
    (permissions.data || [])
      .filter(
        (item) =>
          !item.revoked_at &&
          Array.isArray(item.allowed_operations) &&
          item.allowed_operations.includes("property_report"),
      )
      .map((item) => item.user_id),
  );
  return (memberships.data || [])
    .filter((item) => activeMembership(item) && reportUsers.has(item.user_id))
    .map((item) => ({
      userId: item.user_id,
      email: text(item.email, 200) || "Named user",
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}
async function preflightForActivation(db, organisationId, userIds, pilot) {
  const [policy, products] = await Promise.all([
    db
      .from("knowledge_factory_package_commercial_policies")
      .select("rollout_stage")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    db
      .from("knowledge_factory_report_products")
      .select("product_id")
      .eq("organisation_id", organisationId)
      .eq("status", "uat_validated")
      .limit(2),
  ]);
  if (policy.error || products.error)
    throw new Error("Package-pilot readiness could not be checked.");
  if (policy.data?.rollout_stage !== "pilot") {
    const error = new Error(
      "Set the Phase 5 package commercial controls to Pilot before activating this cohort.",
    );
    error.status = 409;
    throw error;
  }
  if (!products.data?.length) {
    const error = new Error(
      "At least one fixed report package must be UAT validated before a pilot can begin.",
    );
    error.status = 409;
    throw error;
  }
  if (!userIds.length) {
    const error = new Error("Choose at least one named pilot user.");
    error.status = 400;
    throw error;
  }
  if (process.env.KNOWLEDGE_FACTORY_PILOT_ENABLED !== "true") {
    const error = new Error(
      "The private pilot gate is off. Set KNOWLEDGE_FACTORY_PILOT_ENABLED=true only when the named cohort is ready to start.",
    );
    error.status = 409;
    throw error;
  }
  const usage = await pilotUsage(db, organisationId, pilot);
  if (usage.reportCount >= Number(pilot.pilot_report_cap || 0)) {
    const error = new Error(
      "This pilot's report cap has already been reached. Pause it or start a new controlled pilot after review.",
    );
    error.status = 409;
    throw error;
  }
  if (usage.creditsConsumed >= Number(pilot.pilot_credit_cap || 0)) {
    const error = new Error(
      "This pilot's supplier-credit cap has already been reached. Pause it or start a new controlled pilot after review.",
    );
    error.status = 409;
    throw error;
  }
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
    const candidates = await eligibleUsers(db, organisationId);
    const { data: existingPilot, error: existingPilotError } = await db
      .from("knowledge_factory_package_pilot_enrolments")
      .select(
        "status, allowed_user_ids, activated_at, pilot_report_cap, pilot_credit_cap, pilot_ends_at",
      )
      .eq("organisation_id", organisationId)
      .maybeSingle();
    if (existingPilotError)
      throw new Error("Package pilot status is unavailable.");
    if (action === "get") {
      const usage = await pilotUsage(db, organisationId, existingPilot);
      return json(response, 200, {
        pilot: existingPilot || {
          status: "candidate",
          allowed_user_ids: [],
          pilot_report_cap: 25,
          pilot_credit_cap: 250000,
          pilot_ends_at: null,
        },
        usage,
        candidates,
        maxPilotUsers: MAX_PILOT_USERS,
        privatePilotGateEnabled:
          process.env.KNOWLEDGE_FACTORY_PILOT_ENABLED === "true",
      });
    }
    const status = text(input.status, 40);
    if (!STATUSES.has(status))
      return json(response, 400, {
        error: "Choose a valid package-pilot status.",
      });
    const allowedUserIds = [
      ...new Set(
        (Array.isArray(input.allowedUserIds) ? input.allowedUserIds : [])
          .map((id) => text(id, 100))
          .filter(validUuid),
      ),
    ];
    if (allowedUserIds.length > MAX_PILOT_USERS)
      return json(response, 400, {
        error: `A package pilot may include at most ${MAX_PILOT_USERS} named users.`,
      });
    const candidateIds = new Set(
      candidates.map((candidate) => candidate.userId),
    );
    if (allowedUserIds.some((id) => !candidateIds.has(id)))
      return json(response, 400, {
        error:
          "Every pilot user must be an active named user with property-report permission.",
      });
    const timestamp = new Date().toISOString();
    const continuingActive =
      status === "active" && existingPilot?.status === "active";
    const activeAt = continuingActive ? existingPilot.activated_at : timestamp;
    const pilot = {
      activated_at: activeAt,
      pilot_report_cap: positiveInteger(
        input.pilotReportCap,
        "Pilot report cap",
        250,
      ),
      pilot_credit_cap: positiveInteger(
        input.pilotCreditCap,
        "Pilot supplier-credit cap",
      ),
      pilot_ends_at:
        status === "active"
          ? pilotEndsAt(input.pilotEndsAt)
          : pilotTimestamp(input.pilotEndsAt),
    };
    if (status === "active")
      await preflightForActivation(db, organisationId, allowedUserIds, pilot);
    const patch = {
      organisation_id: organisationId,
      status,
      allowed_user_ids: allowedUserIds,
      activated_by: status === "active" ? actorId : null,
      activated_at: status === "active" ? activeAt : null,
      paused_at: status === "paused" ? timestamp : null,
      completed_at: status === "completed" ? timestamp : null,
      pilot_report_cap: pilot.pilot_report_cap,
      pilot_credit_cap: pilot.pilot_credit_cap,
      pilot_ends_at: pilot.pilot_ends_at,
      updated_by: actorId,
      updated_at: timestamp,
    };
    const { data, error } = await db
      .from("knowledge_factory_package_pilot_enrolments")
      .upsert(patch, { onConflict: "organisation_id" })
      .select(
        "status, allowed_user_ids, activated_at, paused_at, completed_at, pilot_report_cap, pilot_credit_cap, pilot_ends_at, created_at, updated_at",
      )
      .single();
    if (error || !data) throw new Error("Package pilot could not be saved.");
    await db.from("knowledge_factory_audit_log").insert({
      organisation_id: organisationId,
      actor_id: actorId,
      operation: "commercial_policy",
      request_purpose: "Updated named package-report pilot cohort",
      request_metadata: {
        mode: "package_pilot",
        pilot_status: status,
        named_user_count: allowedUserIds.length,
        pilot_report_cap: pilot.pilot_report_cap,
        pilot_credit_cap: pilot.pilot_credit_cap,
        pilot_ends_at: pilot.pilot_ends_at,
      },
      outcome: "completed",
    });
    return json(response, 200, {
      pilot: data,
      usage: await pilotUsage(db, organisationId, data),
      candidates,
      maxPilotUsers: MAX_PILOT_USERS,
      privatePilotGateEnabled:
        process.env.KNOWLEDGE_FACTORY_PILOT_ENABLED === "true",
    });
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "Package pilot is unavailable.",
    });
  }
}
