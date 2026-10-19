import { verifyBoundaryReceipt } from '../../server/services/knowledgeFactoryBoundaryReceipt.js';
import { createClient } from "@supabase/supabase-js";
import { attemptKnowledgeFactorySellerFiling } from '../../server/services/knowledgeFactorySellerFiling.js';
import { packageReportQuery, packageReportQueryFingerprint, PACKAGE_COST_RECIPE_IDS } from "./package-report-recipes.js";
import { supplierProperty, currentSupplierTransfer, connectionItems } from "./supplier-contract.js";
import { isKnowledgeFactoryV1UatEndpoint } from "./supplier-endpoint.js";
import { reportEnvironment, reportSupplierRuntime } from "../../server/services/knowledgeFactoryReportRuntime.js";
import { currentReportApproval, reportAccounting } from "../../server/services/knowledgeFactoryReportAccounting.js";
import { supplierCosts as parseSupplierCosts, supplierBilling, usableSupplierCosts } from "./supplier-costs.js";
import { packageCostEnvelope, assertEnvelopeFitsQuote } from "./package-cost-envelope.js";

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
function runtime(env = process.env) {
  const url = text(env.SUPABASE_URL, 2_000);
  const key = text(env.SUPABASE_SERVICE_ROLE_KEY, 10_000);
  if (!url || !key) {
    const error = new Error(
      "Missing private server configuration for report confirmation.",
    );
    error.status = 503;
    throw error;
  }
  return { url, key };
}
function supplierRuntime(env = process.env) { return reportSupplierRuntime(env); }

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
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : null;
}
export function supplierCosts(payload) {
  return parseSupplierCosts(payload);
}
export function quoteFitsCommercialLimits(credits, preflight) {
  const quotedCredits = metric(credits);
  return quotedCredits !== null &&
    Number.isFinite(preflight?.packageCreditCap) &&
    Number.isFinite(preflight?.monthlyCreditCap) &&
    Number.isFinite(preflight?.monthCredits) &&
    quotedCredits <= preflight.packageCreditCap &&
    preflight.monthCredits + quotedCredits <= preflight.monthlyCreditCap;
}
function supplierError(_payload, fallback) {
  return fallback;
}

async function supplierToken(config) {
  if (supplierSession?.endpoint === config.endpoint && supplierSession?.email === config.email && supplierSession?.expiresAt > Date.now() + 10_000)
    return supplierSession.token;
  const response = await fetch(config.endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
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
    const error = new Error("Knowledge Factory could not authenticate the selected report environment.");
    error.status = 502;
    throw error;
  }
  supplierSession = { token, expiresAt, endpoint: config.endpoint, email: config.email };
  return token;
}
function reportQuery(productId) {
  return packageReportQuery(productId, "CanvassingReport");
}
export async function supplierReport(config, productId, propertyId, recordCharge = async () => {}) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await supplierToken(config)}`,
      "GraphQL-Cost": "report",
      "GraphQL-Billing": "report",
    },
    body: JSON.stringify({
      operationName: "CanvassingReport",
      query: reportQuery(productId),
      variables: { id: propertyId },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  await recordCharge({ costs: supplierCosts(payload), billing: supplierBilling(payload),
    vendorRequestId: text(response.headers.get("x-request-id"), 200) || null });
  if (!response.ok || payload?.errors?.length) {
    const error = new Error(
      supplierError(payload, "Knowledge Factory could not return this report"),
    );
    error.status = 502;
    throw error;
  }
  return {
    property: supplierProperty(payload, propertyId),
    costs: supplierCosts(payload),
    billing: supplierBilling(payload),
    vendorRequestId: text(response.headers.get("x-request-id"), 200) || null,
  };
}
export async function supplierQuote(config, productId, propertyId) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await supplierToken(config)}`,
      "GraphQL-Cost": "validate",
      "GraphQL-Billing": "report",
    },
    body: JSON.stringify({
      operationName: "CanvassingReportQuote",
      query: packageReportQuery(productId, "CanvassingReportQuote"),
      variables: { id: propertyId },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    const error = new Error(
      supplierError(payload, "Knowledge Factory could not quote this report"),
    );
    error.status = 502;
    throw error;
  }
  const estimate = packageCostEnvelope({ endpoint: config.endpoint, productId, query: packageReportQuery(productId, "CanvassingReportQuote"), payload, environment: config.environment || "uat" });
  return {
    estimate,
    costs: { fieldCost: estimate.fieldCost, typeCost: estimate.typeCost, surcharge: estimate.maximumSurcharge, credits: estimate.maximumCredits },
    vendorRequestId: text(response.headers.get("x-request-id"), 200) || null,
  };
}
export function reportData(property, productId) {
  if (!property) throw new Error("The supplier returned no property for this report.");
  const addresses = Array.isArray(property?.streetAddress)
    ? property.streetAddress
    : [];
  const street = addresses.find((item) => item?.isMaster) || addresses[0] || {};
  const suburb = property?.suburb || {};
  const currentTransfer = currentSupplierTransfer(property);
  const owners = connectionItems(currentTransfer?.buyers, true).map((buyer) => ({
    name: text(buyer?.buyerNameFix || buyer?.buyerName, 250) || null,
    type: typeof buyer?.buyerType === 'number' && Number.isFinite(buyer.buyerType)
      ? `Supplier type code ${buyer.buyerType}` : text(buyer?.buyerType, 80) || null,
    share: buyer?.share ?? null,
  }));
  const data = {
    property: {
      propertyId: property?.propertyId || null,
      deedsOfficeId: property?.deedsOfficeId ?? null,
      erf: property?.erf ?? null,
      portion: property?.portion ?? null,
      unit: property?.unit ?? null,
      schemeId: property?.schemeId ?? null,
      extent: property?.extent ?? null,
      type: text(property?.propertyType, 120) || null,
      name: text(property?.propertyName, 240) || null,
      number: text(property?.propertyNumber, 120) || null,
      year: property?.propertyYear ?? null,
      hasCad: typeof property?.hasCad === 'boolean' ? property.hasCad : null,
      hasDeeds: typeof property?.hasDeeds === 'boolean' ? property.hasDeeds : null,
      hasNad: typeof property?.hasNad === 'boolean' ? property.hasNad : null,
      hasTransfer: typeof property?.hasTransfer === 'boolean' ? property.hasTransfer : null,
      parentFarm: text(property?.parentFarm, 160) || null,
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
    ownership: { registeredAt: text(currentTransfer?.dateRegister, 80) || null },
  };
  if (productId === "full_canvassing_report") {
    data.municipalValuation = {
      value: property?.valuationValue ?? null,
      date: text(property?.valuationDate, 80) || null,
      municipality: text(property?.valuationMunicipality, 200) || null,
      reason: text(property?.valuationReason, 200) || null,
      zoning: text(property?.valuationZoning, 160) || null,
    };
    data.transactions = connectionItems(property?.transfers).slice(0, 5).map(
      (transfer) => ({
        purchasedAt: text(transfer?.datePurchase, 80) || null,
        registeredAt: text(transfer?.dateRegister, 80) || null,
        extent: transfer?.extent ?? null,
        purchaseAmount: transfer?.purchaseAmount ?? null,
        purchaseReference: text(transfer?.purchaseReference, 120) || null,
        isCurrentOwner: typeof transfer?.isCurrentOwner === 'boolean' ? transfer.isCurrentOwner : null,
      }),
    ).sort((left, right) => {
      const time = (item) => Number.isFinite(Date.parse(item.registeredAt || item.purchasedAt))
        ? Date.parse(item.registeredAt || item.purchasedAt) : -Infinity;
      return time(right) === time(left) ? 0 : time(right) - time(left);
    });
    data.transferHistory = { limit: 5, hasMore: property?.transfers?.pageInfo?.hasNextPage ?? null, order: 'registration_descending' };
    const currentBonds = connectionItems(currentTransfer?.bonds)
      .filter((bond) => bond?.isCurrentBond === true)
      .map((bond) => ({
        registeredAt: text(bond?.bondDateRegister, 80) || null,
        indicator: text(bond?.bondInd, 80) || null,
      }));
    data.finance = {
      hasCurrentBond: currentBonds.length > 0 ? true : typeof currentTransfer?.hasBond === 'boolean' ? currentTransfer.hasBond : null,
      currentBondCount: currentTransfer?.bonds && connectionItems(currentTransfer.bonds).every((bond) => typeof bond?.isCurrentBond === 'boolean') ? currentBonds.length : null,
      bondRecordLimit: 5,
      hasMoreBondRecords: currentTransfer?.bonds?.pageInfo?.hasNextPage ?? null,
      currentBonds,
    };
  }
  return data;
}
function reportDefinitionSnapshot(product) {
  return {
    productId: text(product?.product_id, 80) || null,
    name: text(product?.name, 200) || null,
    description: text(product?.description, 1_000) || null,
    definitionVersion: text(product?.definition_version, 80) || null,
    costValidationRecipeId: text(product?.cost_validation_recipe_id, 80) || null,
    includedFields: Array.isArray(product?.field_manifest)
      ? product.field_manifest
      : [],
    sections: Array.isArray(product?.report_sections)
      ? product.report_sections
      : [],
    excludedFields: Array.isArray(product?.excluded_field_manifest)
      ? product.excluded_field_manifest
      : [],
  };
}

export function opportunitySignals(data) {
  const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  const datedTransactions = transactions
    .map((transaction) => ({
      ...transaction,
      date: transaction?.registeredAt || transaction?.purchasedAt || null,
    }))
    .filter((transaction) => Number.isFinite(Date.parse(transaction.date)))
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const currentOwnership = datedTransactions.find(
    (transaction) => transaction?.isCurrentOwner,
  );
  const latestTransaction = datedTransactions[0] || null;
  const registeredAt = data?.ownership?.registeredAt || currentOwnership?.registeredAt || null;
  const tenureYears = registeredAt && Number.isFinite(Date.parse(registeredAt))
    ? Math.max(
        0,
        Math.floor((Date.now() - Date.parse(registeredAt)) / 31_556_952_000),
      )
    : null;
  const valuation = Number(data?.municipalValuation?.value);
  const latestPurchase = Number(latestTransaction?.purchaseAmount);
  const valuationComparison =
    Number.isFinite(valuation) && valuation > 0 &&
    Number.isFinite(latestPurchase) && latestPurchase > 0
      ? {
          difference: valuation - latestPurchase,
          percentageDifference: Math.round(
            ((valuation - latestPurchase) / latestPurchase) * 10_000,
          ) / 100,
        }
      : null;
  return {
    ownershipRegisteredAt: registeredAt,
    ownershipTenureYears: tenureYears,
    transferRecordsReviewed: transactions.length,
    latestTransferRegisteredAt: latestTransaction?.registeredAt || null,
    municipalValuationVsLatestPurchase: valuationComparison,
    currentFinanceRecorded: data?.finance?.hasCurrentBond ?? null,
    currentBondCount: data?.finance?.currentBondCount ?? null,
  };
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
  environment = reportEnvironment(),
) {
  const { data: policy, error: policyError } = await db
    .from("knowledge_factory_package_commercial_policies")
    .select(
      "allowed_product_ids, per_report_credit_cap, basic_report_credit_cap, full_report_credit_cap, monthly_credit_cap, monthly_report_cap, daily_report_cap_per_user, rollout_stage",
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

  const recipeId = text(product.cost_validation_recipe_id, 80);
  if (!recipeId || recipeId !== PACKAGE_COST_RECIPE_IDS[product.product_id])
    throw commercialFailure(
      "This package has no validated complete-query recipe yet.",
    );
  const approval = await currentReportApproval(db, { organisationId, productId: product.product_id,
    environment, querySha256: packageReportQueryFingerprint(product.product_id) });
  const estimatedCredits = Number(approval.maximum_credits);
  const packageCreditCap =
    product.product_id === "basic_owner_lookup"
      ? Number(policy.basic_report_credit_cap || policy.per_report_credit_cap || 0)
      : Number(policy.full_report_credit_cap || policy.per_report_credit_cap || 0);
  if (estimatedCredits > packageCreditCap)
    throw commercialFailure(
      "This package's validated supplier estimate exceeds its package credit cap.",
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
  return {
    estimatedCredits,
    monthCredits,
    packageCreditCap,
    monthlyCreditCap: Number(policy.monthly_credit_cap || 0),
    rolloutStage: policy.rollout_stage,
    costValidation: { kind: "reviewed_maximum", approvalId: approval.id, maximumCredits: estimatedCredits,
      supplierEnvironment: approval.supplier_environment, querySha256: approval.supplier_query_sha256 },
    approvalId: approval.id,
  };
}

async function assertPilotAccess(
  db,
  organisationId,
  actorId,
  rolloutStage,
  supplierEndpoint,
  estimatedCredits,
) {
  if (rolloutStage !== "pilot") return;
  if (process.env.KNOWLEDGE_FACTORY_PILOT_ENABLED !== "true")
    throw commercialFailure(
      "The private package-pilot gate is off. An administrator must enable it before the pilot can request supplier data.",
    );
  if (!isKnowledgeFactoryV1UatEndpoint(supplierEndpoint))
    throw commercialFailure(
      "The package pilot is restricted to the UAT supplier endpoint. Update the private endpoint before activating a live supplier rollout.",
    );
  const { data: pilot, error } = await db
    .from("knowledge_factory_package_pilot_enrolments")
    .select(
      "status, allowed_user_ids, activated_at, pilot_report_cap, pilot_credit_cap, pilot_ends_at",
    )
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
  if (!pilot.activated_at || Date.parse(pilot.pilot_ends_at) <= Date.now())
    throw commercialFailure(
      "This named package pilot has expired. A principal must pause it and complete a new controlled pilot review before extending access.",
      403,
    );
  const { data: results, error: usageError } = await db
    .from("knowledge_factory_report_results")
    .select("credits_consumed")
    .eq("organisation_id", organisationId)
    .gte("executed_at", pilot.activated_at)
    .limit(1_000);
  if (usageError) throw new Error("Package pilot usage could not be checked.");
  const reportCount = (results || []).length;
  const creditsConsumed = (results || []).reduce(
    (total, item) => total + (Number(item.credits_consumed) || 0),
    0,
  );
  if (reportCount >= Number(pilot.pilot_report_cap || 0))
    throw commercialFailure(
      "The named package pilot has reached its report cap. Pause it and review the recorded results before any further rollout.",
      429,
    );
  if (creditsConsumed + Number(estimatedCredits || 0) > Number(pilot.pilot_credit_cap || 0))
    throw commercialFailure(
      "The next report would exceed the named package pilot's supplier-credit cap. Pause it and review the recorded results before any further rollout.",
      429,
    );
}

export default async function handler(request, response, { createDb = createClient, env = process.env } = {}) {
  if (request.method !== "POST")
    return json(response, 405, { error: "Method not allowed." });
  try {
    const input = await body(request);
    const organisationId = text(input.organisationId, 100);
    const action = text(input.action, 40);
    if (
      !validUuid(organisationId) ||
      !["list_products", "quote", "confirm", "execute"].includes(action)
    )
      return json(response, 400, {
        error: "A valid organisation and action are required.",
      });
    const config = runtime(env);
    const db = createDb(config.url, config.key, {
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
      return json(response, 200, { products: (data || []).map(productView), supplierEnvironment: reportEnvironment(env) });
    }
    if (action === "quote") {
      const productId = text(input.productId, 80);
      const purpose = text(input.purpose, 500);
      const selectedPropertyId = propertyId(input.propertyId);
      if (purpose.length < 10)
        return json(response, 400, {
          error: "Provide a business purpose of at least 10 characters.",
        });
      const { data: product, error: productError } = await db
        .from("knowledge_factory_report_products")
        .select(
          "product_id, name, description, field_manifest, customer_price_cents, cost_validation_recipe_id, status",
        )
        .eq("organisation_id", organisationId)
        .eq("product_id", productId)
        .eq("status", "uat_validated")
        .maybeSingle();
      if (productError || !product)
        return json(response, 409, {
          error: "This report package is not yet approved for UAT use.",
        });
      const commercialPreflight = await assertPackageCommercialPolicy(db, organisationId, actorId, product, reportEnvironment(env));
      const supplierConfig = supplierRuntime(env);
      const boundarySnapshot = verifyBoundaryReceipt({receipt:input.boundaryReceipt,organisationId,actorId,propertyId:selectedPropertyId,environment:supplierConfig.environment,key:config.key});
      const targetSellerLeadId = input.sellerLeadId || null;
      if (targetSellerLeadId) {
        if (!validUuid(targetSellerLeadId)) return json(response,400,{error:'Select a valid seller lead.'});
        const target = await db.rpc('knowledge_factory_validate_seller_target',{p_org:organisationId,p_actor:actorId,p_property:selectedPropertyId,p_lead:targetSellerLeadId});
        if (target.error) return json(response,409,{error:'That seller lead cannot be linked to this property. Choose an available lead or use the existing property link.'});
      }
      if (supplierConfig.environment === "uat" && !isKnowledgeFactoryV1UatEndpoint(supplierConfig.endpoint)) {
        const error = new Error(
          "Cost-only report quotes are restricted to the UAT supplier endpoint.",
        );
        error.status = 409;
        throw error;
      }
      const quote = await supplierQuote(supplierConfig, product.product_id, selectedPropertyId);
      if (!usableSupplierCosts(quote.costs)) {
        const failure = new Error("The supplier did not return a validated credit cost. This report cannot be quoted yet.");
        failure.status = 502;
        throw failure;
      }
      if (quote.costs.credits > commercialPreflight.estimatedCredits || !quoteFitsCommercialLimits(quote.costs.credits, commercialPreflight))
        throw commercialFailure("The supplier quote exceeds the current report or monthly credit limit.");
      const quoteExpiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
      const { data, error } = await db
        .from("knowledge_factory_report_purchase_intents")
        .insert({
          organisation_id: organisationId,
          actor_id: actorId,
          supplier_environment: supplierConfig.environment,
          property_id: selectedPropertyId,
          product_id: product.product_id,
          product_name: product.name,
          included_fields: product.field_manifest,
          customer_price_cents: product.customer_price_cents,
          request_purpose: purpose,
          boundary_snapshot: boundarySnapshot,
          target_seller_lead_id: targetSellerLeadId,
          status: "quoted",
          quoted_supplier_credits: quote.costs.credits,
          quoted_field_cost: quote.costs.fieldCost,
          quoted_type_cost: quote.costs.typeCost,
          quoted_price_surcharge: quote.costs.surcharge,
          quote_expires_at: quoteExpiresAt,
        })
        .select(
          "id, supplier_environment, property_id, product_id, product_name, customer_price_cents, request_purpose, status, quoted_supplier_credits, quoted_field_cost, quoted_type_cost, quoted_price_surcharge, quote_expires_at, created_at, target_seller_lead_id",
        )
        .single();
      if (error || !data) throw new Error("Your report quote could not be saved.");
      const { error: auditError } = await db.from("knowledge_factory_audit_log").insert({
        organisation_id: organisationId, actor_id: actorId, operation: "property_report",
        request_purpose: purpose, property_reference: String(selectedPropertyId), outcome: "validated",
        request_metadata: { mode: "package_maximum_estimate", purchase_intent_id: data.id, estimate: quote.estimate },
      });
      if (auditError) throw new Error("Quote provenance could not be saved. This estimate cannot be executed.");
      return json(response, 201, {
        intent: data,
        boundary: {status:boundarySnapshot?.status || 'unavailable',reason:boundarySnapshot?.reason || null},
        estimate: quote.estimate,
        message:
          "Conservative maximum-cost estimate saved, not supplier-confirmed billing. No report has been requested or charged.",
      });
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
        .gt("quote_expires_at", new Date().toISOString())
        .select(
          "id, property_id, product_id, product_name, included_fields, customer_price_cents, request_purpose, quoted_supplier_credits, supplier_environment, boundary_snapshot, target_seller_lead_id",
        )
        .maybeSingle();
      if (intentError)
        throw new Error("The selected report could not be prepared.");
      if (!intent)
        return json(response, 409, {
          error:
            "This report selection is no longer available to execute. It may already have been processed.",
        });
      let reservationCreated = false;
      let supplierDispatched = false;
      try {
        const { data: product, error: productError } = await db
          .from("knowledge_factory_report_products")
          .select(
            "product_id, name, description, field_manifest, report_sections, excluded_field_manifest, definition_version, customer_price_cents, cost_validation_recipe_id, status",
          )
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
          reportEnvironment(env),
        );
        if (!quoteFitsCommercialLimits(intent.quoted_supplier_credits, commercialPreflight))
          throw commercialFailure("This quote no longer fits the current report or monthly credit limit. Request a new estimate.");
        const supplierConfig = supplierRuntime(env);
        if (intent.target_seller_lead_id) {
          const target = await db.rpc('knowledge_factory_validate_seller_target',{p_org:organisationId,p_actor:actorId,p_property:intent.property_id,p_lead:intent.target_seller_lead_id});
          if (target.error) throw new Error('The selected seller lead is no longer available for this property. No supplier report was requested.');
        }
        if (intent.supplier_environment !== supplierConfig.environment)
          throw new Error("The supplier environment changed. Request a new estimate.");
        // Refuse old/versionless quotes. Provenance uses the existing immutable
        // audit log; no schema migration or activation is needed for this fix.
        const { data: evidence, error: evidenceError } = await db.from("knowledge_factory_audit_log")
          .select("request_metadata, property_reference").eq("organisation_id", organisationId).eq("actor_id", actorId)
          .eq("operation", "property_report").eq("outcome", "validated")
          .contains("request_metadata", { mode: "package_maximum_estimate", purchase_intent_id: intent.id }).maybeSingle();
        const savedEstimate = evidence?.request_metadata?.estimate;
        if (evidenceError || !savedEstimate || savedEstimate.supplierApiVersion !== "v1" ||
            evidence.property_reference !== String(intent.property_id) ||
            savedEstimate.productId !== intent.product_id ||
            (savedEstimate.supplierEnvironment || "uat") !== supplierConfig.environment ||
            savedEstimate.supplierQuerySha256 !== packageReportQueryFingerprint(intent.product_id) ||
            savedEstimate.maximumCredits !== Number(intent.quoted_supplier_credits))
          throw new Error("This quote lacks current v1 maximum-cost provenance. Request a new estimate.");
        const freshQuote = await supplierQuote(supplierConfig, intent.product_id, Number(intent.property_id));
        if (freshQuote.estimate.scheduleVersion !== savedEstimate.scheduleVersion)
          throw new Error("The supplier fee schedule changed. Request a new estimate.");
        assertEnvelopeFitsQuote(freshQuote.estimate, intent.quoted_supplier_credits);
        if (!quoteFitsCommercialLimits(freshQuote.costs.credits, commercialPreflight))
          throw commercialFailure("The fresh maximum cost exceeds current spending limits.");
        await assertPilotAccess(
          db,
          organisationId,
          actorId,
          commercialPreflight.rolloutStage,
          supplierConfig.endpoint,
          Math.max(commercialPreflight.estimatedCredits, Number(intent.quoted_supplier_credits)),
        );
        await reportAccounting(db, "reserve_report_credits", {
          p_intent_id: intent.id, p_actor_id: actorId, p_maximum_credits: freshQuote.estimate.maximumCredits,
          p_environment: supplierConfig.environment, p_query_sha256: packageReportQueryFingerprint(intent.product_id),
          p_approval_id: commercialPreflight.approvalId,
        });
        reservationCreated = true;
        // Complete login before marking a potentially charged data request sent.
        await supplierToken(supplierConfig);
        await reportAccounting(db, "record_report_charge", { p_intent_id: intent.id, p_actor_id: actorId, p_action: "dispatch" });
        supplierDispatched = true;
        const result = await supplierReport(
          supplierConfig,
          intent.product_id,
          Number(intent.property_id),
          ({ costs, billing, vendorRequestId }) => reportAccounting(db, "record_report_charge", {
            p_intent_id: intent.id, p_actor_id: actorId, p_action: "charge",
            p_credits: Number.isSafeInteger(costs.credits) ? costs.credits : null,
            p_deducted: Number.isSafeInteger(billing.amountDeducted) ? billing.amountDeducted : null,
            p_vendor_request_id: vendorRequestId,
          }),
        );
        if (!usableSupplierCosts(result.costs) ||
            ![result.costs.fieldCost, result.costs.typeCost, result.costs.surcharge, result.costs.credits, result.billing.amountDeducted].every(Number.isSafeInteger) ||
            result.billing.rootSurcharge !== 0 || result.billing.rootFieldCount !== 1 ||
            result.billing.complexity !== result.costs.fieldCost + result.costs.typeCost ||
            result.billing.surcharge !== result.billing.fieldSurcharge ||
            result.costs.credits > freshQuote.estimate.maximumCredits ||
            result.billing.status?.toLowerCase() !== "charged" || result.billing.amountDeducted === null || result.billing.amountDeducted > freshQuote.estimate.maximumCredits) {
          await writeAudit(db, {
            organisation_id: organisationId, actor_id: actorId, operation: "property_report",
            request_purpose: intent.request_purpose, property_reference: String(intent.property_id),
            outcome: "failed", error_code: "execution_billing_outside_envelope",
            request_metadata: { mode: "package_execution_billing_review", purchase_intent_id: intent.id,
              supplier_billing: result.billing, maximum_cost_estimate: freshQuote.estimate },
            field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost,
            price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits,
          });
          throw new Error("The supplier executed the request but billing needs administrator review. Do not retry this report.");
        }
        const savedReportData = reportData(result.property, intent.product_id);
        if (intent.boundary_snapshot) savedReportData.boundary = intent.boundary_snapshot;
        if (currentSupplierTransfer(result.property)?.isCurrentOwner !== true || !savedReportData.owners.length ||
            savedReportData.owners.some(owner => !owner.name))
          throw new Error("The supplier returned incomplete current-owner data. The charge needs review; do not repeat this report.");
        const definitionSnapshot = reportDefinitionSnapshot(product);
        const requestContextSnapshot = {
          supplierApiVersion: "v1",
          supplierEnvironment: supplierConfig.environment,
          supplierQuerySha256: packageReportQueryFingerprint(intent.product_id),
          purchaseIntentId: intent.id,
          targetSellerLeadId: intent.target_seller_lead_id || null,
          productId: intent.product_id,
          productName: text(intent.product_name, 200) || null,
          requestPurpose: text(intent.request_purpose, 500) || null,
          customerPriceCents: Number(intent.customer_price_cents) || 0,
          supplierBilling: result.billing,
          maximumCostEstimate: freshQuote.estimate,
          executedAt: new Date().toISOString(),
        };
        const summary = {
          productId: intent.product_id,
          fields: intent.included_fields,
          completedAt: requestContextSnapshot.executedAt,
          reportSnapshotVersion: "canvassing-report-v1",
          definitionVersion: definitionSnapshot.definitionVersion,
        };
        const savedResult = await reportAccounting(db, "complete_report", {
          p_intent_id: intent.id, p_actor_id: actorId,
          p_request: { field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost,
            price_surcharge: result.costs.surcharge, report_summary: summary },
          p_result: { report_data: savedReportData, report_definition_snapshot: definitionSnapshot,
            cost_validation_snapshot: commercialPreflight.costValidation, request_context_snapshot: requestContextSnapshot,
            opportunity_signals: opportunitySignals(savedReportData) },
        });
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
            report_request_id: savedResult.report_request_id,
            commercial_preflight: commercialPreflight,
            supplier_billing: result.billing,
          },
          outcome: "completed",
          vendor_request_id: result.vendorRequestId,
          field_cost: result.costs.fieldCost,
          type_cost: result.costs.typeCost,
          price_surcharge: result.costs.surcharge,
          credits_consumed: result.costs.credits,
        });
        const sellerFiling = await attemptKnowledgeFactorySellerFiling({ db, report: savedResult, actorId });
        return json(response, 200, {
          report: {
            id: savedResult.id,
            data: savedResult.report_data,
            snapshotVersion: savedResult.report_snapshot_version,
            opportunitySignals: savedResult.opportunity_signals,
            creditsConsumed: savedResult.credits_consumed,
            executedAt: savedResult.executed_at,
            sellerFiling,
          },
        });
      } catch (error) {
        if (reservationCreated && !supplierDispatched) {
          await reportAccounting(db, "record_report_charge", { p_intent_id: intent.id, p_actor_id: actorId, p_action: "release" });
        }
        // Dispatch is irreversible: a timeout or malformed response can be charged.
        if (supplierDispatched) error.retryable = false;
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
    const intentId = text(input.intentId, 100);
    if (!validUuid(intentId) || input.attested !== true)
      return json(response, 400, {
        error:
          "Confirm the stated business purpose and authority before accepting this quote.",
      });
    const confirmedAt = new Date().toISOString();
    const { data, error } = await db
      .from("knowledge_factory_report_purchase_intents")
      .update({
        status: "confirmed_pending_execution",
        confirmation_attested_at: confirmedAt,
        confirmed_at: confirmedAt,
        updated_at: confirmedAt,
      })
      .eq("id", intentId)
      .eq("organisation_id", organisationId)
      .eq("actor_id", actorId)
      .eq("status", "quoted")
      .gt("quote_expires_at", confirmedAt)
      .select(
        "id, supplier_environment, property_id, product_id, product_name, customer_price_cents, request_purpose, status, quoted_supplier_credits, quoted_field_cost, quoted_type_cost, quoted_price_surcharge, quote_expires_at, confirmation_attested_at, confirmed_at, created_at, target_seller_lead_id",
      )
      .maybeSingle();
    if (error || !data)
      return json(response, 409, {
        error: "This quote is no longer available. Request a new estimate.",
      });
    return json(response, 201, {
      intent: data,
      message:
        "Report quote confirmed. No supplier report data has been requested yet.",
    });
  } catch (error) {
    json(response, Number(error?.status || 502), {
      error: error?.message || "The report confirmation could not be created.",
    });
  }
}
