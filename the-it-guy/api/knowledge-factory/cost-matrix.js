import { createClient } from "@supabase/supabase-js";

const ADMIN_ROLES = new Set([
  "principal",
  "owner",
  "director",
  "admin",
  "super_admin",
  "agency_admin",
]);
const RECIPES = {
  snapshot_core: {
    label: "Minimal property snapshot",
    query:
      "query CostMatrix($id: Int!) { propertyById(id: $id) { propertyId erf portion extent propertyType propertyName propertyNumber propertyYear streetAddress { address isMaster streetName streetNumber streetType } suburb { postCode suburbId suburbName town province { provinceName } } } }",
  },
  snapshot_valuation: {
    label: "Property snapshot with municipal valuation",
    query:
      "query CostMatrix($id: Int!) { propertyById(id: $id) { propertyId erf portion extent propertyType streetAddress { address isMaster } suburb { suburbName town province { provinceName } } valuationDate valuationMunicipality valuationValue valuationZoning } }",
  },
  owner_current_transfer: {
    label: "Current-owner signal",
    query:
      "query CostMatrix($id: Int!) { propertyById(id: $id) { propertyId transfers(first: 5) { nodes { isCurrentOwner buyers { buyerName buyerNameFix buyerType share } } } } }",
  },
  transaction_history_recent: {
    label: "Three most recent transfers",
    query:
      "query CostMatrix($id: Int!) { propertyById(id: $id) { propertyId transfers(first: 3) { nodes { datePurchase dateRegister purchaseAmount titleDeedNoNew titleDeedNoOld isCurrentOwner buyers { buyerName buyerNameFix buyerType share } sellers { sellerName sellerNameFix sellerType } } } } }",
  },
  finance_current_bonds: {
    label: "Current-bond indicators",
    query:
      "query CostMatrix($id: Int!) { propertyById(id: $id) { propertyId transfers(first: 1) { nodes { hasBond bonds(first: 5) { nodes { bondAmount bondDateRegister bondHolder bondInd bondNumber isCurrentBond purchaseAmount } } } } } }",
  },
};
let supplierSession = null;

function text(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function scalarText(value, max = 1000) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, max)
    : "";
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
function metric(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
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

function config() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT",
    "KNOWLEDGE_FACTORY_EMAIL",
    "KNOWLEDGE_FACTORY_PASSWORD",
  ];
  const missing = required.filter((key) => !text(process.env[key], 10_000));
  if (missing.length) {
    const error = new Error(
      `Missing private server configuration: ${missing.join(", ")}.`,
    );
    error.status = 503;
    throw error;
  }
  return {
    url: text(process.env.SUPABASE_URL, 2_000),
    key: text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000),
    endpoint: text(process.env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT, 2_000),
    email: text(process.env.KNOWLEDGE_FACTORY_EMAIL, 500),
    password: process.env.KNOWLEDGE_FACTORY_PASSWORD,
  };
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
function propertyId(value) {
  const id = scalarText(value, 30);
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw new Error("Enter a valid UAT property ID.");
  return Number(id);
}
function costs(payload) {
  const extension =
    payload?.extensions && typeof payload.extensions === "object"
      ? payload.extensions
      : {};
  const cost =
    extension.cost && typeof extension.cost === "object"
      ? extension.cost
      : extension;
  return {
    fieldCost: metric(cost.fieldCost || cost.field_cost),
    typeCost: metric(cost.typeCost || cost.type_cost),
    surcharge: metric(cost.priceSurcharge || cost.price_surcharge),
    credits: metric(cost.creditsConsumed || cost.credits_consumed),
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
  const role = normalizeRole(
    membership?.workspace_role ||
      membership?.organization_role ||
      membership?.organisation_role ||
      membership?.role,
  ).toLowerCase();
  const active =
    text(membership?.membership_status || membership?.status).toLowerCase() ===
    "active";
  if (error || !membership || !active || !ADMIN_ROLES.has(role)) {
    const failure = new Error(
      "Only a principal-level administrator can validate the canvassing cost matrix.",
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

async function supplierToken(runtime) {
  if (supplierSession?.expiresAt > Date.now() + 10_000)
    return supplierSession.token;
  const response = await fetch(runtime.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query:
        "mutation ($input: LoginInput!) { login(login: $input) { tokenPayload { expiresUtc token } errors { ... on Error { message } } } }",
      variables: {
        input: { email: runtime.email, password: runtime.password },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const token = text(payload?.data?.login?.tokenPayload?.token, 10_000);
  const expiresAt = Date.parse(
    text(payload?.data?.login?.tokenPayload?.expiresUtc),
  );
  if (!response.ok || !token || !Number.isFinite(expiresAt))
    throw new Error(
      text(payload?.errors?.[0]?.message, 300) ||
        text(payload?.data?.login?.errors?.[0]?.message, 300) ||
        `Knowledge Factory login request failed (HTTP ${response.status}).`,
    );
  supplierSession = { token, expiresAt };
  return token;
}

async function validate(runtime, recipe, id) {
  const response = await fetch(runtime.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await supplierToken(runtime)}`,
      "GraphQL-Cost": "validate",
    },
    body: JSON.stringify({
      operationName: "CostMatrix",
      query: recipe.query,
      variables: { id },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length)
    throw new Error(
      text(payload?.errors?.[0]?.message, 300) ||
        `Knowledge Factory could not validate this recipe (HTTP ${response.status}).`,
    );
  return {
    costs: costs(payload),
    vendorRequestId: text(response.headers.get("x-request-id"), 200) || null,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST")
    return json(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 80);
    if (!validUuid(organisationId) || !["list", "validate"].includes(action))
      return json(response, 400, {
        error: "A valid organisation and action are required.",
      });
    const runtime = config();
    const db = createClient(runtime.url, runtime.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const actorId = await administrator(request, db, organisationId);
    if (action === "list") {
      const { data, error } = await db
        .from("knowledge_factory_cost_validations")
        .select(
          "id, property_id, recipe_id, request_purpose, field_cost, type_cost, price_surcharge, credits_consumed, outcome, error_code, created_at",
        )
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error("The canvassing cost matrix is unavailable.");
      return json(response, 200, {
        recipes: Object.entries(RECIPES).map(([id, item]) => ({
          id,
          label: item.label,
        })),
        items: data || [],
      });
    }
    const recipeId = text(input.recipeId, 80);
    const recipe = RECIPES[recipeId];
    const id = propertyId(input.propertyId);
    const purpose = text(input.purpose, 500);
    if (!recipe)
      return json(response, 400, { error: "Select a supported cost recipe." });
    if (purpose.length < 10)
      return json(response, 400, {
        error: "Provide a UAT purpose of at least 10 characters.",
      });
    const existing = await db
      .from("knowledge_factory_cost_validations")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("property_id", id)
      .eq("recipe_id", recipeId)
      .eq("outcome", "validated")
      .maybeSingle();
    if (existing.error)
      throw new Error("The cost-matrix history could not be checked.");
    if (existing.data)
      return json(response, 409, {
        error:
          "This recipe has already been validated for this property. Choose another UAT property to rerun it.",
      });
    try {
      const result = await validate(runtime, recipe, id);
      const { data, error } = await db
        .from("knowledge_factory_cost_validations")
        .insert({
          organisation_id: organisationId,
          actor_id: actorId,
          property_id: id,
          recipe_id: recipeId,
          request_purpose: purpose,
          field_cost: result.costs.fieldCost,
          type_cost: result.costs.typeCost,
          price_surcharge: result.costs.surcharge,
          credits_consumed: result.costs.credits,
          vendor_request_id: result.vendorRequestId,
          outcome: "validated",
        })
        .select(
          "id, property_id, recipe_id, request_purpose, field_cost, type_cost, price_surcharge, credits_consumed, outcome, created_at",
        )
        .single();
      if (error || !data)
        throw new Error("The supplier cost validation could not be recorded.");
      return json(response, 201, { item: data });
    } catch (error) {
      await db.from("knowledge_factory_cost_validations").insert({
        organisation_id: organisationId,
        actor_id: actorId,
        property_id: id,
        recipe_id: recipeId,
        request_purpose: purpose,
        outcome: "failed",
        error_code: text(error?.message, 300),
      });
      throw error;
    }
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "Canvassing cost validation failed.",
    });
  }
}
