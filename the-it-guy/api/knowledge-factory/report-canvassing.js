import { createClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set([
  "principal",
  "owner",
  "director",
  "admin",
  "super_admin",
  "agency_admin",
]);

function text(value, max = 1_000) {
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
function normalizeRole(value) {
  const role = text(value).toLowerCase();
  if (role === "administrator") return "admin";
  if (role === "superadmin") return "super_admin";
  if (role === "principal / owner") return "principal";
  return role;
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
      "Missing private server configuration for report conversion.",
    );
    error.status = 503;
    throw error;
  }
  return { url, key };
}

async function actor(request, db, organisationId) {
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
  const { data: membership, error: membershipError } = await db
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
  if (membershipError || !membership || !active) {
    const error = new Error("An active organisation membership is required.");
    error.status = 403;
    throw error;
  }
  const [access, permission] = await Promise.all([
    db
      .from("knowledge_factory_organisation_access")
      .select("enabled, allowed_operations, suspended_at")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    db
      .from("knowledge_factory_user_permissions")
      .select("allowed_operations, revoked_at")
      .eq("organisation_id", organisationId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const allowed =
    access.data?.enabled === true &&
    !access.data.suspended_at &&
    access.data?.allowed_operations?.includes("property_report") &&
    !permission.data?.revoked_at &&
    permission.data?.allowed_operations?.includes("property_report");
  if (access.error || permission.error || !allowed) {
    const error = new Error(
      "Property-report access has not been granted for your user.",
    );
    error.status = 403;
    throw error;
  }
  const role = normalizeRole(
    membership.workspace_role ||
      membership.organization_role ||
      membership.organisation_role ||
      membership.role,
  );
  return { userId: user.id, isAdmin: ADMIN_ROLES.has(role) };
}

function prospectView(row = {}) {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    assignedAgentId: row.assigned_agent_id,
    assignedUserId: row.assigned_user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    prospectType: row.prospect_type,
    area: row.area,
    areaSuburb: row.area_suburb,
    streetAddress: row.street_address,
    formattedAddress: row.formatted_address,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    propertyType: row.property_type,
    source: row.source,
    canvassingMethod: row.canvassing_method,
    status: row.status,
    nextFollowUpDate: row.next_follow_up_date,
    followUpPriority: row.follow_up_priority,
    followUpNote: row.follow_up_note,
    estimatedValue: Number(row.estimated_value || 0) || 0,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST")
    return json(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 40);
    if (!validUuid(organisationId) || !["list", "convert"].includes(action))
      return json(response, 400, {
        error: "A valid organisation and action are required.",
      });
    const config = runtime();
    const db = createClient(config.url, config.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const currentActor = await actor(request, db, organisationId);
    if (action === "list") {
      const { data: results, error } = await db
        .from("knowledge_factory_report_results")
        .select(
          "id, actor_id, property_id, product_id, report_data, credits_consumed, executed_at, created_at",
        )
        .eq("organisation_id", organisationId)
        .order("executed_at", { ascending: false })
        .limit(100);
      if (error) throw new Error("Completed reports could not be loaded.");
      const visible = (results || []).filter(
        (item) => currentActor.isAdmin || item.actor_id === currentActor.userId,
      );
      const ids = visible.map((item) => item.id);
      const conversions = ids.length
        ? await db
            .from("knowledge_factory_report_canvassing_conversions")
            .select("report_result_id, prospect_id, status, converted_at")
            .in("report_result_id", ids)
        : { data: [], error: null };
      if (conversions.error)
        throw new Error("Report conversion status could not be loaded.");
      const byResult = new Map(
        (conversions.data || []).map((item) => [item.report_result_id, item]),
      );
      return json(response, 200, {
        items: visible.map((item) => ({
          ...item,
          conversion: byResult.get(item.id) || null,
        })),
      });
    }

    const reportResultId = text(input.reportResultId, 100);
    const firstName = text(input.firstName, 120);
    const lastName = text(input.lastName, 120);
    const phone = text(input.phone, 80);
    const email = text(input.email, 320).toLowerCase();
    const nextFollowUpDate = text(input.nextFollowUpDate, 20);
    const followUpPriority = text(input.followUpPriority, 20) || "Medium";
    const followUpNote = text(input.followUpNote, 1_000);
    if (!validUuid(reportResultId) || !firstName || !lastName)
      return json(response, 400, {
        error:
          "Select a completed report and enter the prospect’s first and last name.",
      });
    if (!["Low", "Medium", "High", "Urgent"].includes(followUpPriority))
      return json(response, 400, {
        error: "Select a valid follow-up priority.",
      });

    const { data: report, error: reportError } = await db
      .from("knowledge_factory_report_results")
      .select("id, actor_id, property_id, product_id, report_data")
      .eq("id", reportResultId)
      .eq("organisation_id", organisationId)
      .maybeSingle();
    if (reportError || !report)
      return json(response, 404, {
        error: "The completed report could not be found.",
      });
    if (!currentActor.isAdmin && report.actor_id !== currentActor.userId)
      return json(response, 403, {
        error: "You may only convert your own completed reports.",
      });

    const { data: existing, error: existingError } = await db
      .from("knowledge_factory_report_canvassing_conversions")
      .select("id, status, prospect_id")
      .eq("report_result_id", report.id)
      .maybeSingle();
    if (existingError)
      throw new Error("Report conversion status could not be checked.");
    let conversion = existing;
    if (!conversion) {
      const inserted = await db
        .from("knowledge_factory_report_canvassing_conversions")
        .insert({
          organisation_id: organisationId,
          report_result_id: report.id,
          created_by: currentActor.userId,
        })
        .select("id, status, prospect_id")
        .single();
      if (inserted.error || !inserted.data)
        return json(response, 409, {
          error:
            "This report is already being converted into a canvassing prospect.",
        });
      conversion = inserted.data;
    }
    if (conversion.status !== "ready")
      return json(response, 409, {
        error:
          conversion.status === "converted"
            ? "This report has already been converted into a canvassing prospect."
            : "This report conversion is not currently available. Please contact an administrator.",
      });
    const { data: claimed, error: claimError } = await db
      .from("knowledge_factory_report_canvassing_conversions")
      .update({ status: "converting", updated_at: new Date().toISOString() })
      .eq("id", conversion.id)
      .eq("status", "ready")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed)
      return json(response, 409, {
        error: "This report conversion is already being processed.",
      });

    const property = report.report_data?.property || {};
    try {
      const notes = [
        `Created from reviewed Knowledge Factory report result: ${report.id}`,
        `Property ID: ${report.property_id}`,
        "Supplier owner data was reviewed in the report and has not been copied into this prospect.",
      ].join("\n");
      const { data: prospect, error: prospectError } = await db
        .from("canvassing_prospects")
        .insert({
          organisation_id: organisationId,
          assigned_agent_id: currentActor.userId,
          assigned_user_id: currentActor.userId,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          email: email || null,
          prospect_type: "Seller Prospect",
          area: text(property.suburb, 160) || null,
          area_suburb: text(property.suburb, 160) || null,
          street_address: text(property.address, 500) || null,
          formatted_address: text(property.address, 500) || null,
          city: text(property.town, 160) || null,
          province: text(property.province, 160) || null,
          country: "South Africa",
          postal_code: text(property.postalCode, 30) || null,
          property_type: text(property.type, 120) || null,
          source: "Knowledge Factory Property Report",
          canvassing_method: "Area Farming",
          status: "New",
          next_follow_up_date: nextFollowUpDate || null,
          follow_up_priority: followUpPriority,
          follow_up_note: followUpNote || null,
          estimated_value:
            Number(report.report_data?.municipalValuation?.value) || null,
          property_occupancy: "Unknown",
          selling_intent: "Just Gathering Information",
          notes,
          created_by: currentActor.userId,
        })
        .select("*")
        .single();
      if (prospectError || !prospect)
        throw new Error("The canvassing prospect could not be created.");
      const { data: activity } = await db
        .from("canvassing_activities")
        .insert({
          organisation_id: organisationId,
          prospect_id: prospect.id,
          agent_id: currentActor.userId,
          activity_type: "Property Report Reviewed",
          activity_note: `Prospect created from completed property report ${report.id}.`,
          outcome: "Added to Canvassing",
          activity_date: new Date().toISOString(),
          created_by: currentActor.userId,
          demo_metadata: {
            source: "Knowledge Factory",
            reportResultId: report.id,
            propertyId: String(report.property_id),
          },
        })
        .select("*")
        .maybeSingle();
      const { error: completionError } = await db
        .from("knowledge_factory_report_canvassing_conversions")
        .update({
          status: "converted",
          prospect_id: prospect.id,
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversion.id)
        .eq("status", "converting");
      if (completionError)
        throw new Error("The report conversion record could not be completed.");
      return json(response, 201, {
        prospect: prospectView(prospect),
        activity: activity
          ? {
              id: activity.id,
              organisationId: activity.organisation_id,
              prospectId: activity.prospect_id,
              activityType: activity.activity_type,
              activityNote: activity.activity_note,
              outcome: activity.outcome,
              activityDate: activity.activity_date,
            }
          : null,
      });
    } catch (error) {
      await db
        .from("knowledge_factory_report_canvassing_conversions")
        .update({
          status: "failed",
          error_code: text(error?.message, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversion.id)
        .eq("status", "converting");
      throw error;
    }
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "The report conversion could not be completed.",
    });
  }
}
