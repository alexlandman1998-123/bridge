import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Operation = "map_properties" | "property_summary" | "property_report" | "fica_kyc" | "credit_check";

const ALLOWED_ORIGINS = new Set([
  "https://app.arch9.co.za",
  "https://admin.arch9.co.za",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5177",
]);
const SOUTH_AFRICA = { west: 16.45, south: -34.833, east: 32.95, north: -22.125 };
const MAX_BOUNDS_WIDTH = 0.5;
const MAX_BOUNDS_HEIGHT = 0.5;
const MAP_PAGE_SIZE = 25;
const MAP_REQUESTS_PER_MINUTE = 12;
const REPORT_QUOTES_PER_MINUTE = 6;
const REPORT_REQUESTS_PER_HOUR = 8;
const REPORT_QUOTE_TTL_MS = 15 * 60_000;
const REPORT_TYPES = new Set(["property_summary", "municipal_valuation"]);

let supplierSession: { token: string; expiresAt: number } | null = null;

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function scalarText(value: unknown, max = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cors(request: Request): HeadersInit {
  const origin = text(request.headers.get("origin"));
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://app.arch9.co.za",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

function json(request: Request, status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(request), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function serviceClient() {
  const url = text(Deno.env.get("SUPABASE_URL"));
  const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !key) throw new Error("Supabase service credentials are unavailable.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normalizeRole(value: unknown): string {
  const role = text(value).toLowerCase();
  if (role === "administrator") return "admin";
  if (role === "superadmin") return "super_admin";
  if (role === "branch_admin" || role === "branch manager") return "branch_manager";
  if (role === "principal / owner") return "principal";
  return role;
}

function validateBounds(value: unknown): { west: number; east: number; south: number; north: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A map bounding box is required.");
  const record = value as Json;
  const west = number(record.west), east = number(record.east), south = number(record.south), north = number(record.north);
  if ([west, east, south, north].some((item) => item === null)) throw new Error("Map bounds must be finite numbers.");
  if (west! >= east! || south! >= north!) throw new Error("Map bounds are invalid.");
  if (west! < SOUTH_AFRICA.west || east! > SOUTH_AFRICA.east || south! < SOUTH_AFRICA.south || north! > SOUTH_AFRICA.north) throw new Error("Map searches must remain within South Africa.");
  if (east! - west! > MAX_BOUNDS_WIDTH || north! - south! > MAX_BOUNDS_HEIGHT) throw new Error("Zoom in before searching this area.");
  return { west: west!, east: east!, south: south!, north: north! };
}

async function authenticatedActor(request: Request, db: ReturnType<typeof serviceClient>, organisationId: string) {
  // A Supabase user JWT is commonly longer than the 500-character limit used
  // for ordinary user input. Never truncate it before server-side validation.
  const bearer = text(request.headers.get("authorization"), 12_000).replace(/^Bearer\s+/i, "");
  if (!bearer) throw new Error("Unauthenticated.");
  const { data: { user } } = await db.auth.getUser(bearer);
  if (!user) throw new Error("Unauthenticated.");

  const membership = await db
    .from("organisation_users")
    .select("user_id, status, membership_status, role, workspace_role, organization_role, organisation_role")
    .eq("organisation_id", organisationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership.error || !membership.data) throw new Error("You do not belong to this organisation.");
  const active = text(membership.data.membership_status || membership.data.status).toLowerCase() === "active";
  const role = normalizeRole(membership.data.workspace_role || membership.data.organization_role || membership.data.organisation_role || membership.data.role);
  if (!active || !role) throw new Error("An active organisation membership is required.");
  return { userId: user.id, role };
}

async function authorisation(db: ReturnType<typeof serviceClient>, organisationId: string, userId: string, operation: Operation) {
  const [access, permission] = await Promise.all([
    db.from("knowledge_factory_organisation_access").select("enabled, allowed_operations, suspended_at").eq("organisation_id", organisationId).maybeSingle(),
    db.from("knowledge_factory_user_permissions").select("allowed_operations, revoked_at").eq("organisation_id", organisationId).eq("user_id", userId).maybeSingle(),
  ]);
  if (access.error || permission.error) throw new Error("Knowledge Factory access could not be checked.");
  const orgAllowed = access.data?.enabled === true && !access.data.suspended_at && Array.isArray(access.data.allowed_operations) && access.data.allowed_operations.includes(operation);
  const userAllowed = !permission.data?.revoked_at && Array.isArray(permission.data?.allowed_operations) && permission.data.allowed_operations.includes(operation);
  return { orgAllowed, userAllowed };
}

async function writeAudit(db: ReturnType<typeof serviceClient>, event: Json) {
  const { error } = await db.from("knowledge_factory_audit_log").insert(event);
  if (error) console.error("Knowledge Factory audit write failed", error.code);
}

async function assertMapRateLimit(db: ReturnType<typeof serviceClient>, organisationId: string, userId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await db
    .from("knowledge_factory_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("actor_id", userId)
    .eq("operation", "map_properties")
    .gte("created_at", since);
  if (error) throw new Error("Knowledge Factory rate limit could not be checked.");
  if ((count || 0) >= MAP_REQUESTS_PER_MINUTE) throw new Error("Map lookup limit reached. Please wait a minute before searching again.");
}

async function assertReportRateLimit(db: ReturnType<typeof serviceClient>, organisationId: string, userId: string, mode: "quote" | "request") {
  const since = new Date(Date.now() - (mode === "quote" ? 60_000 : 60 * 60_000)).toISOString();
  const limit = mode === "quote" ? REPORT_QUOTES_PER_MINUTE : REPORT_REQUESTS_PER_HOUR;
  const query = db
    .from("knowledge_factory_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("actor_id", userId)
    .eq("operation", "property_report")
    .gte("created_at", since);
  if (mode === "request") query.eq("outcome", "completed");
  const { count, error } = await query;
  if (error) throw new Error("Knowledge Factory report limit could not be checked.");
  if ((count || 0) >= limit) throw new Error(mode === "quote"
    ? "Report quote limit reached. Please wait a minute before requesting another quote."
    : "Report request limit reached. Please contact an administrator if another report is required.");
}

async function supplierToken(): Promise<string> {
  if (supplierSession && supplierSession.expiresAt > Date.now() + 10_000) return supplierSession.token;
  const endpoint = text(Deno.env.get("KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT"), 2_000);
  const email = text(Deno.env.get("KNOWLEDGE_FACTORY_EMAIL"), 500);
  const password = Deno.env.get("KNOWLEDGE_FACTORY_PASSWORD") || "";
  if (!endpoint || !email || !password) throw new Error("Knowledge Factory is not configured.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationName: "KnowledgeFactoryLogin",
      // Match the vendor's supplied Google Maps demo. Its concrete error
      // fragments make the login mutation valid across their current schema.
      query: "mutation KnowledgeFactoryLogin($input: LoginInput!) { login(login: $input) { tokenPayload { expiresUtc token } errors { ... on ArgumentError { message paramName } ... on ArgumentNullError { message paramName } ... on Error { message } } } }",
      variables: { input: { email, password } },
    }),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    throw new Error(vendorError(body, `Knowledge Factory login request failed (HTTP ${response.status}).`));
  }
  const graphqlErrors = Array.isArray(body.errors) ? body.errors as Json[] : [];
  const graphqlMessage = text(graphqlErrors[0]?.message, 300);
  if (graphqlMessage) throw new Error(`Knowledge Factory login request failed: ${graphqlMessage}`);
  const login = (body.data as Json | undefined)?.login as Json | undefined;
  const payload = login?.tokenPayload as Json | undefined;
  const token = text(payload?.token, 10_000);
  const expiresAt = Date.parse(text(payload?.expiresUtc));
  if (!token || !Number.isFinite(expiresAt)) {
    const loginErrors = Array.isArray(login?.errors) ? login.errors as Json[] : [];
    const vendorMessage = text(loginErrors[0]?.message, 300);
    throw new Error(vendorMessage
      ? `Knowledge Factory login was rejected: ${vendorMessage}`
      : "Knowledge Factory login response did not include a usable token.");
  }
  supplierSession = { token, expiresAt };
  return token;
}

function metric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function costs(body: Json) {
  const root = body.extensions && typeof body.extensions === "object" ? body.extensions as Json : {};
  const cost = root.cost && typeof root.cost === "object" ? root.cost as Json : root;
  const fieldCost = metric(cost.fieldCost || cost.field_cost);
  const typeCost = metric(cost.typeCost || cost.type_cost);
  const surcharge = metric(cost.priceSurcharge || cost.price_surcharge);
  const credits = metric(cost.creditsConsumed || cost.credits_consumed);
  return { fieldCost, typeCost, surcharge, credits };
}

function vendorError(body: Json, fallback: string): string {
  const errors = Array.isArray(body.errors) ? body.errors as Json[] : [];
  const message = text(errors[0]?.message, 300);
  return message ? `${fallback}: ${message}` : fallback;
}

async function validateMapQuery(bounds: { west: number; east: number; south: number; north: number }) {
  const endpoint = text(Deno.env.get("KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT"), 2_000);
  if (!endpoint) throw new Error("Knowledge Factory is not configured.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${await supplierToken()}`, "GraphQL-Cost": "validate" },
    body: JSON.stringify({
      operationName: "ValidateMapProperties",
      query: "query ValidateMapProperties($minX: Decimal!, $maxX: Decimal!, $minY: Decimal!, $maxY: Decimal!) { properties(where: { x: { gt: $minX, lt: $maxX }, y: { gt: $minY, lt: $maxY } }, first: 25) { nodes { propertyId wkt } } }",
      variables: { minX: bounds.west, maxX: bounds.east, minY: bounds.south, maxY: bounds.north },
    }),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) {
    throw new Error(vendorError(body, "Knowledge Factory rejected the query validation."));
  }
  return costs(body);
}

function parseWktPolygon(value: unknown): Array<{ latitude: number; longitude: number }> {
  const wkt = text(value, 50_000);
  const match = /^POLYGON\s*\(\(\s*([^()]+?)\s*\)\)$/i.exec(wkt);
  if (!match) return [];
  return match[1].split(",").flatMap((pair) => {
    const [longitude, latitude] = pair.trim().split(/\s+/).map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
  }).slice(0, 500);
}

async function mapProperties(bounds: { west: number; east: number; south: number; north: number }) {
  const endpoint = text(Deno.env.get("KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT"), 2_000);
  if (!endpoint) throw new Error("Knowledge Factory is not configured.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${await supplierToken()}`, "GraphQL-Cost": "report" },
    body: JSON.stringify({
      operationName: "MapProperties",
      query: "query MapProperties($minX: Decimal!, $maxX: Decimal!, $minY: Decimal!, $maxY: Decimal!) { properties(where: { x: { gt: $minX, lt: $maxX }, y: { gt: $minY, lt: $maxY } }, first: 25) { nodes { propertyId wkt erf portion suburb { suburbId } } } }",
      variables: { minX: bounds.west, maxX: bounds.east, minY: bounds.south, maxY: bounds.north },
    }),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) {
    throw new Error(vendorError(body, "Knowledge Factory could not return map properties."));
  }
  const connection = ((body.data as Json | undefined)?.properties as Json | undefined) || {};
  const nodes = Array.isArray(connection.nodes) ? connection.nodes as Json[] : [];
  const items = nodes.flatMap((node) => {
    const propertyId = scalarText(node.propertyId, 100);
    const polygon = parseWktPolygon(node.wkt);
    if (!propertyId || polygon.length < 3) return [];
    const suburb = node.suburb && typeof node.suburb === "object" ? node.suburb as Json : {};
    return [{
      id: propertyId,
      propertyId,
      erf: number(node.erf),
      portion: number(node.portion),
      suburbId: scalarText(suburb.suburbId, 100) || null,
      polygon,
    }];
  });
  return { items, costs: costs(body), vendorRequestId: text(response.headers.get("x-request-id"), 200) || null };
}

function validatePropertyId(value: unknown): number {
  const id = scalarText(value, 30);
  if (!/^[1-9]\d{0,14}$/.test(id)) throw new Error("A valid property is required.");
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric)) throw new Error("A valid property is required.");
  return numeric;
}

function validateReportTypes(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const types = [...new Set(source.map((item) => text(item, 80)).filter(Boolean))];
  if (!types.length || types.some((type) => !REPORT_TYPES.has(type))) {
    throw new Error("Select one or more supported property report sections.");
  }
  return types;
}

function reportQuery() {
  return "query PropertyReport($id: Int!) { propertyById(id: $id) { propertyId erf extent propertyType propertyName propertyNumber propertyYear valuationDate valuationMunicipality valuationValue valuationZoning streetAddress { address isMaster streetName streetNumber streetType x y } suburb { postCode suburbId suburbName town province { provinceName } } } }";
}

async function supplierReport(propertyId: number, costMode: "validate" | "report") {
  const endpoint = text(Deno.env.get("KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT"), 2_000);
  if (!endpoint) throw new Error("Knowledge Factory is not configured.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${await supplierToken()}`, "GraphQL-Cost": costMode },
    body: JSON.stringify({ operationName: "PropertyReport", query: reportQuery(), variables: { id: propertyId } }),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) {
    throw new Error(vendorError(body, costMode === "validate" ? "Knowledge Factory could not validate this property report." : "Knowledge Factory could not return this property report."));
  }
  return { body, costs: costs(body), vendorRequestId: text(response.headers.get("x-request-id"), 200) || null };
}

function reportSummary(body: Json, requestedTypes: string[]) {
  const property = ((body.data as Json | undefined)?.propertyById as Json | undefined) || {};
  const streetAddresses = Array.isArray(property.streetAddress) ? property.streetAddress as Json[] : [];
  const street = streetAddresses.find((item) => item.isMaster === true) || streetAddresses[0] || {};
  const suburb = property.suburb && typeof property.suburb === "object" ? property.suburb as Json : {};
  const province = suburb.province && typeof suburb.province === "object" ? suburb.province as Json : {};
  const address = text(street.address, 500)
    || [text(street.streetNumber, 40), text(street.streetName, 200), text(street.streetType, 80)].filter(Boolean).join(" ");
  return {
    propertyId: scalarText(property.propertyId, 100),
    address: address || null,
    erf: number(property.erf),
    extent: number(property.extent),
    propertyType: text(property.propertyType, 120) || null,
    propertyName: text(property.propertyName, 250) || null,
    suburb: text(suburb.suburbName, 160) || null,
    town: text(suburb.town, 160) || null,
    province: text(province.provinceName, 160) || null,
    postalCode: text(suburb.postCode, 30) || null,
    municipalValuation: requestedTypes.includes("municipal_valuation") ? {
      value: number(property.valuationValue),
      date: text(property.valuationDate, 80) || null,
      municipality: text(property.valuationMunicipality, 200) || null,
      zoning: text(property.valuationZoning, 160) || null,
    } : null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return json(request, 405, { error: "Method not allowed." });
  let body: Json;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return json(request, 400, { error: "Invalid JSON." });
  }

  const organisationId = text(body.organisationId, 100);
  const action = text(body.action, 100);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organisationId)) return json(request, 400, { error: "A valid organisation is required." });

  try {
    const db = serviceClient();
    const actor = await authenticatedActor(request, db, organisationId);
    const [mapPermission, reportPermission] = await Promise.all([
      authorisation(db, organisationId, actor.userId, "map_properties"),
      authorisation(db, organisationId, actor.userId, "property_report"),
    ]);
    const supplierConfigured = Boolean(
      text(Deno.env.get("KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT"), 2_000)
      && text(Deno.env.get("KNOWLEDGE_FACTORY_EMAIL"), 500)
      && Deno.env.get("KNOWLEDGE_FACTORY_PASSWORD"),
    );
    if (action === "status") return json(request, 200, {
      phase: "reports",
      mapSearchEnabled: mapPermission.orgAllowed && mapPermission.userAllowed && supplierConfigured,
      livePropertySearchEnabled: mapPermission.orgAllowed && mapPermission.userAllowed && supplierConfigured,
      reportSearchEnabled: reportPermission.orgAllowed && reportPermission.userAllowed && supplierConfigured,
      message: mapPermission.orgAllowed && mapPermission.userAllowed && supplierConfigured
        ? "Map parcel search is available. Property reports require their own named-user permission."
        : "Map parcel search requires an approved organisation, named-user permission, and supplier configuration.",
    });
    if (["quote_property_report", "request_property_report", "list_property_reports"].includes(action)) {
      if (!reportPermission.orgAllowed || !reportPermission.userAllowed) {
        const purpose = text(body.purpose, 500) || "Property report access check";
        await writeAudit(db, {
          organisation_id: organisationId, actor_id: actor.userId, operation: "property_report", request_purpose: purpose,
          request_metadata: { mode: action }, outcome: "denied", error_code: "access_not_granted",
        });
        return json(request, 403, { error: "Knowledge Factory property report access has not been granted." });
      }
      if (action === "list_property_reports") {
        const { data, error } = await db
          .from("knowledge_factory_report_requests")
          .select("id, property_id, requested_report_types, request_purpose, status, quote_expires_at, confirmed_at, field_cost, type_cost, price_surcharge, credits_consumed, report_summary, error_code, created_at, updated_at")
          .eq("organisation_id", organisationId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw new Error("Property reports could not be loaded.");
        return json(request, 200, { items: data || [] });
      }

      const purpose = text(body.purpose, 500);
      if (purpose.length < 10) return json(request, 400, { error: "Provide a report purpose of at least 10 characters." });
      if (action === "quote_property_report") {
        const propertyId = validatePropertyId(body.propertyId);
        const reportTypes = validateReportTypes(body.reportTypes);
        await assertReportRateLimit(db, organisationId, actor.userId, "quote");
        try {
          const result = await supplierReport(propertyId, "validate");
          if (result.costs.credits === null) throw new Error("Knowledge Factory did not return a credit estimate. The report was not requested.");
          const expiresAt = new Date(Date.now() + REPORT_QUOTE_TTL_MS).toISOString();
          const { data, error } = await db.from("knowledge_factory_report_requests").insert({
            organisation_id: organisationId, actor_id: actor.userId, property_id: propertyId, requested_report_types: reportTypes,
            request_purpose: purpose, quote_expires_at: expiresAt, field_cost: result.costs.fieldCost,
            type_cost: result.costs.typeCost, price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits,
          }).select("id, property_id, requested_report_types, quote_expires_at, field_cost, type_cost, price_surcharge, credits_consumed").single();
          if (error || !data) throw new Error("The report quote could not be saved.");
          await writeAudit(db, {
            organisation_id: organisationId, actor_id: actor.userId, operation: "property_report", request_purpose: purpose,
            request_metadata: { mode: "quote", property_id: propertyId, report_types: reportTypes }, outcome: "validated",
            vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost,
            price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits,
          });
          return json(request, 200, { quote: data });
        } catch (error) {
          await writeAudit(db, {
            organisation_id: organisationId, actor_id: actor.userId, operation: "property_report", request_purpose: purpose,
            request_metadata: { mode: "quote", property_id: propertyId, report_types: reportTypes }, outcome: "failed", error_code: "supplier_report_quote_failed",
          });
          throw error;
        }
      }

      const quoteId = text(body.quoteId, 100);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quoteId)) return json(request, 400, { error: "A valid property report quote is required." });
      const { data: quote, error: quoteError } = await db
        .from("knowledge_factory_report_requests")
        .select("id, property_id, requested_report_types, request_purpose, status, quote_expires_at, credits_consumed")
        .eq("id", quoteId).eq("organisation_id", organisationId).eq("actor_id", actor.userId).maybeSingle();
      if (quoteError || !quote) return json(request, 404, { error: "The property report quote could not be found." });
      if (quote.status !== "quoted" || new Date(quote.quote_expires_at).getTime() < Date.now()) {
        await db.from("knowledge_factory_report_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", quote.id).eq("status", "quoted");
        return json(request, 409, { error: "This quote has expired. Request a new cost estimate." });
      }
      if (quote.request_purpose !== purpose) return json(request, 409, { error: "The confirmed purpose must match the quoted purpose." });
      if (!Number.isFinite(Number(quote.credits_consumed))) return json(request, 409, { error: "This quote has no confirmed credit estimate." });
      await assertReportRateLimit(db, organisationId, actor.userId, "request");
      const { error: submitError } = await db.from("knowledge_factory_report_requests")
        .update({ status: "submitted", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", quote.id).eq("status", "quoted");
      if (submitError) throw new Error("The property report could not be submitted.");
      try {
        const result = await supplierReport(Number(quote.property_id), "report");
        const summary = reportSummary(result.body, Array.isArray(quote.requested_report_types) ? quote.requested_report_types : []);
        const { error: readyError } = await db.from("knowledge_factory_report_requests").update({
          status: "ready", updated_at: new Date().toISOString(), report_summary: summary,
          vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost,
          price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits,
        }).eq("id", quote.id);
        if (readyError) throw new Error("The property report result could not be saved.");
        await writeAudit(db, {
          organisation_id: organisationId, actor_id: actor.userId, operation: "property_report", request_purpose: purpose,
          property_reference: String(quote.property_id), request_metadata: { mode: "report", report_request_id: quote.id, report_types: quote.requested_report_types }, outcome: "completed",
          vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost,
          price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits,
        });
        return json(request, 200, { report: { id: quote.id, status: "ready", propertyId: quote.property_id, requestedReportTypes: quote.requested_report_types, summary } });
      } catch (error) {
        await db.from("knowledge_factory_report_requests").update({ status: "failed", updated_at: new Date().toISOString(), error_code: "supplier_report_failed" }).eq("id", quote.id);
        await writeAudit(db, {
          organisation_id: organisationId, actor_id: actor.userId, operation: "property_report", request_purpose: purpose,
          property_reference: String(quote.property_id), request_metadata: { mode: "report", report_request_id: quote.id }, outcome: "failed", error_code: "supplier_report_failed",
        });
        throw error;
      }
    }
    if (!["validate_map_query", "map_properties"].includes(action)) return json(request, 400, { error: "Unsupported action." });
    const purpose = text(body.purpose, 500);
    if (purpose.length < 10) return json(request, 400, { error: "Provide a lookup purpose of at least 10 characters." });
    const bounds = validateBounds(body.bounds);
    if (!mapPermission.orgAllowed || !mapPermission.userAllowed) {
      await writeAudit(db, {
        organisation_id: organisationId, actor_id: actor.userId, operation: "map_properties", request_purpose: purpose,
        request_metadata: { mode: "validate", bounds }, outcome: "denied", error_code: "access_not_granted",
      });
      return json(request, 403, { error: "Knowledge Factory map access has not been granted." });
    }
    if (action === "map_properties") {
      await assertMapRateLimit(db, organisationId, actor.userId);
      try {
        const result = await mapProperties(bounds);
        await writeAudit(db, {
          organisation_id: organisationId, actor_id: actor.userId, operation: "map_properties", request_purpose: purpose,
          request_metadata: { mode: "map", bounds, page_size: MAP_PAGE_SIZE, returned_count: result.items.length }, outcome: "completed",
          vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost,
          price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits,
        });
        return json(request, 200, { items: result.items, count: result.items.length, pageSize: MAP_PAGE_SIZE, costs: result.costs });
      } catch (error) {
        const failureReason = error instanceof Error ? text(error.message, 300) : "Knowledge Factory map request failed.";
        await writeAudit(db, {
          organisation_id: organisationId, actor_id: actor.userId, operation: "map_properties", request_purpose: purpose,
          request_metadata: { mode: "map", bounds, page_size: MAP_PAGE_SIZE, failure_reason: failureReason }, outcome: "failed", error_code: "supplier_map_query_failed",
        });
        throw error;
      }
    }
    try {
      const cost = await validateMapQuery(bounds);
      await writeAudit(db, {
        organisation_id: organisationId, actor_id: actor.userId, operation: "map_properties", request_purpose: purpose,
        request_metadata: { mode: "validate", bounds, page_size: MAP_PAGE_SIZE }, outcome: "validated",
        field_cost: cost.fieldCost, type_cost: cost.typeCost, price_surcharge: cost.surcharge, credits_consumed: cost.credits,
      });
      return json(request, 200, { validated: true, pageSize: MAP_PAGE_SIZE, costs: cost, livePropertySearchEnabled: false });
    } catch (error) {
      await writeAudit(db, {
        organisation_id: organisationId, actor_id: actor.userId, operation: "map_properties", request_purpose: purpose,
        request_metadata: { mode: "validate", bounds, page_size: MAP_PAGE_SIZE }, outcome: "failed", error_code: "supplier_validation_failed",
      });
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge Factory request failed.";
    const status = /Unauthenticated|membership|required|belong/.test(message) ? 403 : 502;
    return json(request, status, { error: message });
  }
});
