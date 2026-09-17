import { createClient } from "@supabase/supabase-js";

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
function propertyId(value) {
  const parsed = Number(String(value || "").trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error("Select a valid property before confirming a report.");
  return parsed;
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
      "Missing private server configuration for report confirmation.",
    );
    error.status = 503;
    throw error;
  }
  return { url, key };
}
function supplierRuntime() {
  const endpoint = text(process.env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT, 2_000);
  const email = text(process.env.KNOWLEDGE_FACTORY_EMAIL, 500);
  const password = process.env.KNOWLEDGE_FACTORY_PASSWORD;
  if (!endpoint || !email || !password) {
    const error = new Error(
      "Missing private server configuration for report execution.",
    );
    error.status = 503;
    throw error;
  }
  return { endpoint, email, password };
}

let supplierSession = null;

async function reportActor(request, db, organisationId) {
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
    .select("status, membership_status")
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
  return user.id;
}
function productView(row) {
  return {
    productId: row.product_id,
    name: row.name,
    description: row.description,
    fields: Array.isArray(row.field_manifest) ? row.field_manifest : [],
    customerPriceCents: row.customer_price_cents,
  };
}
function metric(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}
function supplierCosts(payload) {
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
function supplierError(payload, fallback) {
  const message = text(payload?.errors?.[0]?.message, 300);
  return message ? `${fallback}: ${message}` : fallback;
}
async function supplierToken(config) {
  if (supplierSession?.expiresAt > Date.now() + 10_000)
    return supplierSession.token;
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query:
        "mutation ($input: LoginInput!) { login(login: $input) { tokenPayload { expiresUtc token } errors { ... on Error { message } } } }",
      variables: { input: { email: config.email, password: config.password } },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const token = text(payload?.data?.login?.tokenPayload?.token, 10_000);
  const expiresAt = Date.parse(
    text(payload?.data?.login?.tokenPayload?.expiresUtc),
  );
  if (!response.ok || !token || !Number.isFinite(expiresAt)) {
    const error = new Error(
      text(payload?.errors?.[0]?.message, 300) ||
        text(payload?.data?.login?.errors?.[0]?.message, 300) ||
        `Knowledge Factory login request failed (HTTP ${response.status}).`,
    );
    error.status = 502;
    throw error;
  }
  supplierSession = { token, expiresAt };
  return token;
}
function reportQuery(productId) {
  const core =
    "propertyId erf portion extent propertyType propertyName propertyNumber streetAddress { address isMaster streetName streetNumber streetType } suburb { postCode suburbId suburbName town province { provinceName } }";
  const owner =
    "transfers(first: 5) { nodes { isCurrentOwner buyers { buyerName buyerNameFix buyerType share } } }";
  const full =
    "valuationDate valuationMunicipality valuationValue valuationZoning transfers(first: 5) { nodes { isCurrentOwner buyers { buyerName buyerNameFix buyerType share } hasBond bonds(first: 5) { nodes { bondAmount bondDateRegister bondHolder bondInd bondNumber isCurrentBond } } } }";
  return `query CanvassingReport($id: Int!) { propertyById(id: $id) { ${core} ${productId === "full_canvassing_report" ? full : owner} } }`;
}
async function supplierReport(config, productId, propertyId) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await supplierToken(config)}`,
      "GraphQL-Cost": "report",
    },
    body: JSON.stringify({
      operationName: "CanvassingReport",
      query: reportQuery(productId),
      variables: { id: propertyId },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    const error = new Error(
      supplierError(payload, "Knowledge Factory could not return this report"),
    );
    error.status = 502;
    throw error;
  }
  return {
    property: payload?.data?.propertyById || {},
    costs: supplierCosts(payload),
    vendorRequestId: text(response.headers.get("x-request-id"), 200) || null,
  };
}
function reportData(property, productId) {
  const addresses = Array.isArray(property?.streetAddress)
    ? property.streetAddress
    : [];
  const street = addresses.find((item) => item?.isMaster) || addresses[0] || {};
  const suburb = property?.suburb || {};
  const currentTransfer = (property?.transfers?.nodes || []).find(
    (item) => item?.isCurrentOwner,
  );
  const owners = (currentTransfer?.buyers || []).map((buyer) => ({
    name: text(buyer?.buyerNameFix || buyer?.buyerName, 250) || null,
    type: text(buyer?.buyerType, 80) || null,
    share: buyer?.share ?? null,
  }));
  const data = {
    property: {
      propertyId: property?.propertyId || null,
      erf: property?.erf ?? null,
      portion: property?.portion ?? null,
      extent: property?.extent ?? null,
      type: text(property?.propertyType, 120) || null,
      address:
        text(street?.address, 500) ||
        [street?.streetNumber, street?.streetName, street?.streetType]
          .map((item) => text(item, 200))
          .filter(Boolean)
          .join(" ") ||
        null,
      suburb: text(suburb?.suburbName, 160) || null,
      town: text(suburb?.town, 160) || null,
      province: text(suburb?.province?.provinceName, 160) || null,
      postalCode: text(suburb?.postCode, 30) || null,
    },
    owners,
  };
  if (productId === "full_canvassing_report") {
    data.municipalValuation = {
      value: property?.valuationValue ?? null,
      date: text(property?.valuationDate, 80) || null,
      municipality: text(property?.valuationMunicipality, 200) || null,
      zoning: text(property?.valuationZoning, 160) || null,
    };
    data.bonds = (currentTransfer?.bonds?.nodes || [])
      .filter((bond) => bond?.isCurrentBond !== false)
      .map((bond) => ({
        holder: text(bond?.bondHolder, 250) || null,
        amount: bond?.bondAmount ?? null,
        registeredAt: text(bond?.bondDateRegister, 80) || null,
        indicator: text(bond?.bondInd, 80) || null,
      }));
  }
  return data;
}
async function writeAudit(db, event) {
  const { error } = await db.from("knowledge_factory_audit_log").insert(event);
  if (error)
    console.error("Knowledge Factory execution audit write failed", error.code);
}
async function assertExecutionLimit(db, organisationId, actorId) {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count, error } = await db
    .from("knowledge_factory_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("actor_id", actorId)
    .eq("operation", "property_report")
    .eq("outcome", "completed")
    .gte("created_at", since);
  if (error) throw new Error("Report execution limits could not be checked.");
  if ((count || 0) >= 8) {
    const failure = new Error(
      "Report execution limit reached. Please wait before requesting another report.",
    );
    failure.status = 429;
    throw failure;
  }
}

function commercialFailure(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  // A policy/budget block has not requested supplier data. Keep the confirmed
  // intent reusable once an administrator adjusts the controls.
  error.retryable = true;
  return error;
}

function startOfUtcDay() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function startOfUtcMonth() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

async function assertPackageCommercialPolicy(
  db,
  organisationId,
  actorId,
  product,
) {
  const { data: policy, error: policyError } = await db
    .from("knowledge_factory_package_commercial_policies")
    .select(
      "allowed_product_ids, per_report_credit_cap, monthly_credit_cap, monthly_report_cap, daily_report_cap_per_user, rollout_stage",
    )
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (policyError)
    throw new Error("Package commercial controls could not be checked.");
  if (!policy)
    throw commercialFailure(
      "Package reports are not enabled yet. An administrator must save the Phase 5 commercial controls first.",
    );
  if (policy.rollout_stage === "suspended")
    throw commercialFailure("Package report execution is currently suspended.");
  if (
    !Array.isArray(policy.allowed_product_ids) ||
    !policy.allowed_product_ids.includes(product.product_id)
  )
    throw commercialFailure(
      "This package is not enabled in the current commercial rollout.",
      403,
    );

  const recipeIds = Array.isArray(product.included_recipe_ids)
    ? product.included_recipe_ids
    : [];
  const { data: validations, error: validationError } = await db
    .from("knowledge_factory_cost_validations")
    .select("recipe_id, credits_consumed, outcome, created_at")
    .eq("organisation_id", organisationId)
    .eq("outcome", "validated")
    .in("recipe_id", recipeIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (validationError)
    throw new Error("Package cost-validation evidence could not be checked.");
  const latestByRecipe = new Map();
  for (const validation of validations || []) {
    if (!latestByRecipe.has(validation.recipe_id))
      latestByRecipe.set(validation.recipe_id, validation);
  }
  if (latestByRecipe.size !== recipeIds.length)
    throw commercialFailure(
      "This package no longer has complete validated UAT cost evidence.",
    );
  const estimatedCredits = [...latestByRecipe.values()].reduce(
    (sum, validation) => sum + (Number(validation.credits_consumed) || 0),
    0,
  );
  if (estimatedCredits > Number(policy.per_report_credit_cap || 0))
    throw commercialFailure(
      "This package's validated supplier estimate exceeds the per-report credit cap.",
    );

  const month = startOfUtcMonth();
  const day = startOfUtcDay();
  const [monthResults, dailyResults] = await Promise.all([
    db
      .from("knowledge_factory_report_results")
      .select("credits_consumed, executed_at")
      .eq("organisation_id", organisationId)
      .gte("executed_at", month)
      .limit(10_000),
    db
      .from("knowledge_factory_report_results")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("actor_id", actorId)
      .gte("executed_at", day),
  ]);
  if (monthResults.error || dailyResults.error)
    throw new Error("Package commercial usage could not be checked.");
  const monthCredits = (monthResults.data || []).reduce(
    (sum, result) => sum + (Number(result.credits_consumed) || 0),
    0,
  );
  if (
    (monthResults.data || []).length >= Number(policy.monthly_report_cap || 0)
  )
    throw commercialFailure(
      "The monthly package-report limit has been reached.",
    );
  if (monthCredits + estimatedCredits > Number(policy.monthly_credit_cap || 0))
    throw commercialFailure(
      "The validated supplier estimate would exceed this month's credit limit.",
    );
  if (
    (dailyResults.count || 0) >= Number(policy.daily_report_cap_per_user || 0)
  )
    throw commercialFailure(
      "Your daily package-report limit has been reached. Please ask an administrator if more capacity is needed.",
      429,
    );
  return { estimatedCredits, monthCredits, rolloutStage: policy.rollout_stage };
}

async function assertPilotAccess(
  db,
  organisationId,
  actorId,
  rolloutStage,
  supplierEndpoint,
) {
  if (rolloutStage !== "pilot") return;
  if (process.env.KNOWLEDGE_FACTORY_PILOT_ENABLED !== "true")
    throw commercialFailure(
      "The private package-pilot gate is off. An administrator must enable it before the pilot can request supplier data.",
    );
  if (!/\/uat\/graphql\/?$/i.test(supplierEndpoint))
    throw commercialFailure(
      "The package pilot is restricted to the UAT supplier endpoint. Update the private endpoint before activating a live supplier rollout.",
    );
  const { data: pilot, error } = await db
    .from("knowledge_factory_package_pilot_enrolments")
    .select("status, allowed_user_ids")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .contains("allowed_user_ids", [actorId])
    .maybeSingle();
  if (error) throw new Error("Package pilot access could not be checked.");
  if (!pilot)
    throw commercialFailure(
      "You are not in this active named-user package pilot.",
      403,
    );
}

export default async function handler(request, response) {
  if (request.method !== "POST")
    return json(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 40);
    if (
      !validUuid(organisationId) ||
      !["list_products", "confirm", "execute"].includes(action)
    )
      return json(response, 400, {
        error: "A valid organisation and action are required.",
      });
    const config = runtime();
    const db = createClient(config.url, config.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const actorId = await reportActor(request, db, organisationId);
    if (action === "list_products") {
      const { data, error } = await db
        .from("knowledge_factory_report_products")
        .select(
          "product_id, name, description, field_manifest, customer_price_cents",
        )
        .eq("organisation_id", organisationId)
        .eq("status", "uat_validated")
        .order("customer_price_cents", { ascending: true });
      if (error) throw new Error("Approved report packages are unavailable.");
      return json(response, 200, { products: (data || []).map(productView) });
    }
    if (action === "execute") {
      const intentId = text(input.intentId, 100);
      if (!validUuid(intentId))
        return json(response, 400, {
          error: "A valid confirmed report selection is required.",
        });
      await assertExecutionLimit(db, organisationId, actorId);
      const { data: intent, error: intentError } = await db
        .from("knowledge_factory_report_purchase_intents")
        .update({ status: "executing", updated_at: new Date().toISOString() })
        .eq("id", intentId)
        .eq("organisation_id", organisationId)
        .eq("actor_id", actorId)
        .eq("status", "confirmed_pending_execution")
        .select(
          "id, property_id, product_id, product_name, included_fields, customer_price_cents, request_purpose",
        )
        .maybeSingle();
      if (intentError)
        throw new Error("The selected report could not be prepared.");
      if (!intent)
        return json(response, 409, {
          error:
            "This report selection is no longer available to execute. It may already have been processed.",
        });
      try {
        const { data: product, error: productError } = await db
          .from("knowledge_factory_report_products")
          .select("product_id, included_recipe_ids, status")
          .eq("organisation_id", organisationId)
          .eq("product_id", intent.product_id)
          .eq("status", "uat_validated")
          .maybeSingle();
        if (productError || !product) {
          const failure = new Error(
            "This report package is no longer approved for UAT execution.",
          );
          failure.status = 409;
          throw failure;
        }
        const commercialPreflight = await assertPackageCommercialPolicy(
          db,
          organisationId,
          actorId,
          product,
        );
        const supplierConfig = supplierRuntime();
        await assertPilotAccess(
          db,
          organisationId,
          actorId,
          commercialPreflight.rolloutStage,
          supplierConfig.endpoint,
        );
        const result = await supplierReport(
          supplierConfig,
          intent.product_id,
          Number(intent.property_id),
        );
        const summary = {
          productId: intent.product_id,
          fields: intent.included_fields,
          completedAt: new Date().toISOString(),
        };
        const { data: request, error: requestError } = await db
          .from("knowledge_factory_report_requests")
          .insert({
            organisation_id: organisationId,
            actor_id: actorId,
            property_id: intent.property_id,
            requested_report_types: [intent.product_id],
            request_purpose: intent.request_purpose,
            status: "ready",
            confirmed_at: new Date().toISOString(),
            quote_expires_at: new Date().toISOString(),
            field_cost: result.costs.fieldCost,
            type_cost: result.costs.typeCost,
            price_surcharge: result.costs.surcharge,
            credits_consumed: result.costs.credits,
            vendor_request_id: result.vendorRequestId,
            report_summary: summary,
          })
          .select("id")
          .single();
        if (requestError || !request)
          throw new Error("The report execution record could not be saved.");
        const { data: savedResult, error: resultError } = await db
          .from("knowledge_factory_report_results")
          .insert({
            organisation_id: organisationId,
            purchase_intent_id: intent.id,
            report_request_id: request.id,
            actor_id: actorId,
            product_id: intent.product_id,
            property_id: intent.property_id,
            report_data: reportData(result.property, intent.product_id),
            field_cost: result.costs.fieldCost,
            type_cost: result.costs.typeCost,
            price_surcharge: result.costs.surcharge,
            credits_consumed: result.costs.credits,
            vendor_request_id: result.vendorRequestId,
          })
          .select("id, report_data, credits_consumed, executed_at")
          .single();
        if (resultError || !savedResult)
          throw new Error("The report result could not be saved.");
        const { error: completionError } = await db
          .from("knowledge_factory_report_purchase_intents")
          .update({
            status: "executed",
            executed_at: new Date().toISOString(),
            report_request_id: request.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.id)
          .eq("status", "executing");
        if (completionError)
          throw new Error("The report execution could not be completed.");
        await writeAudit(db, {
          organisation_id: organisationId,
          actor_id: actorId,
          operation: "property_report",
          request_purpose: intent.request_purpose,
          property_reference: String(intent.property_id),
          request_metadata: {
            mode: "package_execution",
            purchase_intent_id: intent.id,
            product_id: intent.product_id,
            report_request_id: request.id,
            commercial_preflight: commercialPreflight,
          },
          outcome: "completed",
          vendor_request_id: result.vendorRequestId,
          field_cost: result.costs.fieldCost,
          type_cost: result.costs.typeCost,
          price_surcharge: result.costs.surcharge,
          credits_consumed: result.costs.credits,
        });
        return json(response, 200, {
          report: {
            id: savedResult.id,
            data: savedResult.report_data,
            creditsConsumed: savedResult.credits_consumed,
            executedAt: savedResult.executed_at,
          },
        });
      } catch (error) {
        await db
          .from("knowledge_factory_report_purchase_intents")
          .update({
            status: error?.retryable
              ? "confirmed_pending_execution"
              : "execution_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.id)
          .eq("status", "executing");
        await writeAudit(db, {
          organisation_id: organisationId,
          actor_id: actorId,
          operation: "property_report",
          request_purpose: intent.request_purpose,
          property_reference: String(intent.property_id),
          request_metadata: {
            mode: "package_execution",
            purchase_intent_id: intent.id,
            product_id: intent.product_id,
          },
          outcome: "failed",
          error_code: text(error?.message, 300),
        });
        throw error;
      }
    }
    const productId = text(input.productId, 80);
    const purpose = text(input.purpose, 500);
    if (purpose.length < 10)
      return json(response, 400, {
        error: "Provide a business purpose of at least 10 characters.",
      });
    const { data: product, error: productError } = await db
      .from("knowledge_factory_report_products")
      .select(
        "product_id, name, description, field_manifest, customer_price_cents",
      )
      .eq("organisation_id", organisationId)
      .eq("product_id", productId)
      .eq("status", "uat_validated")
      .maybeSingle();
    if (productError || !product)
      return json(response, 409, {
        error: "This report package is not yet approved for UAT use.",
      });
    const { data, error } = await db
      .from("knowledge_factory_report_purchase_intents")
      .insert({
        organisation_id: organisationId,
        actor_id: actorId,
        property_id: propertyId(input.propertyId),
        product_id: product.product_id,
        product_name: product.name,
        included_fields: product.field_manifest,
        customer_price_cents: product.customer_price_cents,
        request_purpose: purpose,
      })
      .select(
        "id, property_id, product_id, product_name, customer_price_cents, request_purpose, status, created_at",
      )
      .single();
    if (error || !data)
      throw new Error("Your report confirmation could not be saved.");
    return json(response, 201, {
      intent: data,
      message:
        "Report selection confirmed. No supplier data has been requested yet.",
    });
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "The report confirmation could not be created.",
    });
  }
}
