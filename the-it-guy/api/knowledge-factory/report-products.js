import { createClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set([
  "principal",
  "owner",
  "director",
  "admin",
  "super_admin",
  "agency_admin",
]);

const PRODUCTS = {
  basic_owner_lookup: {
    name: "Basic property lookup",
    description:
      "Property address and current-owner details for focused canvassing.",
    recipeIds: ["snapshot_core", "owner_current_transfer"],
    fields: [
      "Property address",
      "Suburb and town",
      "Current owner name",
      "Owner type",
    ],
    priceCents: 500,
  },
  full_canvassing_report: {
    name: "Full canvassing report",
    description:
      "Property, municipal, ownership and current bond information for a qualified opportunity.",
    recipeIds: [
      "snapshot_core",
      "snapshot_valuation",
      "owner_current_transfer",
      "finance_current_bonds",
    ],
    fields: [
      "Property address and parcel details",
      "Municipal valuation and zoning",
      "Current owner details",
      "Current bond indicators",
    ],
    priceCents: 2500,
  },
};

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
function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value, 100),
  );
}
function priceCents(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 100_000)
    throw new Error("Enter a valid selling price.");
  return amount;
}
function normalizeRole(value) {
  const role = text(value).toLowerCase();
  if (role === "administrator") return "admin";
  if (role === "superadmin") return "super_admin";
  if (role === "principal / owner") return "principal";
  return role;
}
function runtime() {
  const url = text(process.env.SUPABASE_URL, 2_000);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000);
  if (!url || !key) {
    const error = new Error(
      "Missing private server configuration for report packages.",
    );
    error.status = 503;
    throw error;
  }
  return { url, key };
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
  const role = normalizeRole(
    membership?.workspace_role ||
      membership?.organization_role ||
      membership?.organisation_role ||
      membership?.role,
  );
  const active =
    text(membership?.membership_status || membership?.status).toLowerCase() ===
    "active";
  if (error || !membership || !active || !ADMIN_ROLES.has(role)) {
    const failure = new Error(
      "Only a principal-level administrator can define canvassing report packages.",
    );
    failure.status = 403;
    throw failure;
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
    const failure = new Error(
      "An approved property-report entitlement and named-user permission are required.",
    );
    failure.status = 403;
    throw failure;
  }
  return user.id;
}
function mergeProducts(rows, validations) {
  const saved = new Map((rows || []).map((row) => [row.product_id, row]));
  const latestCost = new Map();
  for (const item of validations || []) {
    if (item.outcome === "validated" && !latestCost.has(item.recipe_id))
      latestCost.set(item.recipe_id, item);
  }
  return Object.entries(PRODUCTS).map(([productId, template]) => {
    const row = saved.get(productId);
    const evidence = template.recipeIds
      .map((recipeId) => latestCost.get(recipeId))
      .filter(Boolean);
    return {
      productId,
      name: row?.name || template.name,
      description: row?.description || template.description,
      fields: template.fields,
      recipeIds: template.recipeIds,
      customerPriceCents: row?.customer_price_cents ?? template.priceCents,
      status: row?.status || "draft",
      saved: Boolean(row),
      validationCount: evidence.length,
      validationRequired: template.recipeIds.length,
      validatedSupplierCredits: evidence.reduce(
        (sum, item) => sum + Number(item.credits_consumed || 0),
        0,
      ),
      canMarkUatValidated: evidence.length === template.recipeIds.length,
      updatedAt: row?.updated_at || null,
    };
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST")
    return json(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 40);
    if (!validUuid(organisationId) || !["list", "save"].includes(action))
      return json(response, 400, {
        error: "A valid organisation and action are required.",
      });
    const config = runtime();
    const db = createClient(config.url, config.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const actorId = await administrator(request, db, organisationId);
    const [
      { data: products, error: productError },
      { data: validations, error: validationError },
    ] = await Promise.all([
      db
        .from("knowledge_factory_report_products")
        .select(
          "product_id, name, description, customer_price_cents, status, updated_at",
        )
        .eq("organisation_id", organisationId),
      db
        .from("knowledge_factory_cost_validations")
        .select("recipe_id, credits_consumed, outcome, created_at")
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (productError || validationError)
      throw new Error("The Phase 1 report-package workspace is unavailable.");
    if (action === "list")
      return json(response, 200, {
        products: mergeProducts(products, validations),
      });
    const productId = text(input.productId, 80);
    const template = PRODUCTS[productId];
    if (!template)
      return json(response, 400, {
        error: "Choose a supported report package.",
      });
    const allProducts = mergeProducts(products, validations);
    const current = allProducts.find((item) => item.productId === productId);
    const status =
      input.markUatValidated === true && current?.canMarkUatValidated
        ? "uat_validated"
        : "draft";
    if (input.markUatValidated === true && !current?.canMarkUatValidated)
      return json(response, 400, {
        error:
          "Validate every included report component in UAT before marking this package ready.",
      });
    const { error: saveError } = await db
      .from("knowledge_factory_report_products")
      .upsert(
        {
          organisation_id: organisationId,
          product_id: productId,
          name: template.name,
          description: template.description,
          included_recipe_ids: template.recipeIds,
          field_manifest: template.fields,
          customer_price_cents: priceCents(input.customerPriceCents),
          status,
          created_by: actorId,
          updated_by: actorId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,product_id" },
      );
    if (saveError) throw new Error("The report package could not be saved.");
    const { data: nextProducts, error: reloadError } = await db
      .from("knowledge_factory_report_products")
      .select(
        "product_id, name, description, customer_price_cents, status, updated_at",
      )
      .eq("organisation_id", organisationId);
    if (reloadError)
      throw new Error("The saved report package could not be reloaded.");
    return json(response, 200, {
      products: mergeProducts(nextProducts, validations),
    });
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "The report package could not be updated.",
    });
  }
}
