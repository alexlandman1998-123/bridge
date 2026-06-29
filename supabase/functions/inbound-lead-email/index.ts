import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;
type SupabaseClientLike = {
  from: (table: string) => any;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-arch9-inbound-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPTIONAL_LEAD_COLUMNS = [
  "branch_id",
  "assigned_user_id",
  "created_by",
  "assigned_agent_email",
  "listing_id",
  "source_reference_id",
  "raw_enquiry_payload",
];

const OPTIONAL_LOG_COLUMNS = [
  "listing_id",
  "assigned_agent_id",
  "review_status",
  "processed_at",
  "duplicate_of_log_id",
];

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeEmail(value: unknown) {
  const text = normalizeText(value);
  const bracketMatch = text.match(/<([^>]+)>/);
  return normalizeLower(bracketMatch?.[1] || text).replace(/^mailto:/, "");
}

function isUuidLike(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value));
}

function createUuid() {
  return crypto.randomUUID();
}

function isMissingColumnError(error: unknown) {
  const code = normalizeText((error as { code?: string })?.code).toUpperCase();
  const message = normalizeLower((error as { message?: string; details?: string })?.message || (error as { details?: string })?.details);
  return code === "42703" || code === "PGRST204" || message.includes("column") && message.includes("does not exist");
}

function stripHtml(value: unknown) {
  return normalizeText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function readPath(source: JsonRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    return (value as JsonRecord)[key];
  }, source);
}

function pickFirst(source: JsonRecord, paths: string[]) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (Array.isArray(value) && value.length) return value[0];
    if (normalizeText(value)) return value;
  }
  return "";
}

function parseAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseAddressList(item));
  }
  return normalizeText(value)
    .split(/[,;]/)
    .map(normalizeEmail)
    .filter((item) => item.includes("@"));
}

function pickFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return "";
}

function normalizeBodyText(value: unknown) {
  return normalizeText(value)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function readLabelValue(text: string, labels: string[]) {
  const safeLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!safeLabels.length) return "";
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${safeLabels.join("|")})\\s*[:\\-]\\s*([^\\n\\r]+)`, "i");
  return normalizeText(text.match(pattern)?.[1] || "");
}

function extractEmailAddress(text: string) {
  return normalizeEmail(readLabelValue(text, ["email address", "email", "e-mail"]) || pickFirstMatch(text, [
    /(?:email|e-mail)\s*[:\-]\s*([^\s<>,;]+@[^\s<>,;]+)/i,
    /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]));
}

function extractPhone(text: string) {
  const labelled = readLabelValue(text, ["phone", "mobile", "cell", "cellphone", "telephone", "contact number"]);
  const fallback = labelled || pickFirstMatch(text, [
    /(\+?27[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/i,
    /(\b0\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b)/i,
  ]);
  return fallback.replace(/[^\d+]/g, "");
}

function extractName(text: string, fromName = "") {
  return normalizeText(readLabelValue(text, ["name", "full name", "contact name", "customer", "customer name", "enquirer", "sender"]) || fromName).replace(/\s*<[^>]+>\s*/g, "");
}

function extractListingReference(text: string) {
  return readLabelValue(text, [
    "listing reference",
    "listing ref",
    "listing id",
    "listing number",
    "property reference",
    "property ref",
    "property id",
    "property number",
    "web reference",
    "web ref",
    "web id",
    "property24 reference",
    "property24 listing id",
    "private property reference",
    "private property listing id",
  ]) || pickFirstMatch(text, [
    /(?:listing|property|web)\s*(?:id|ref|reference|number)\s*[:#\-]\s*([a-z0-9/_-]+)/i,
    /(?:property24|private property)\s*(?:id|ref|reference)\s*[:#\-]\s*([a-z0-9/_-]+)/i,
    /property24\.com\/(?:[^/\s]+\/)*(\d{5,})/i,
    /privateproperty\.co\.za\/(?:[^/\s]+\/)*([a-z0-9-]*\d{5,}[a-z0-9-]*)/i,
  ]);
}

function extractMessage(text: string) {
  const labelled = readLabelValue(text, ["message", "comments", "comment", "enquiry", "enquiry message", "buyer message", "notes"]);
  if (labelled) return labelled;
  const lines = normalizeBodyText(text).split("\n").map((line) => normalizeText(line)).filter(Boolean);
  const messageStart = lines.findIndex((line) => /^(message|comments|comment|enquiry|notes)\s*[:\-]?$/i.test(line));
  if (messageStart >= 0) return lines.slice(messageStart + 1, messageStart + 4).join("\n");
  return "";
}

function extractBudget(text: string) {
  const raw = readLabelValue(text, ["budget", "max budget", "price", "asking price"]);
  const amount = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizeLeadSource(value: unknown) {
  const key = normalizeLower(value).replace(/[^a-z0-9]+/g, "");
  if (key === "property24" || key === "p24") return "Property24";
  if (key === "privateproperty" || key === "privatepropertysa") return "Private Property";
  if (key === "website" || key === "web") return "Website";
  if (key === "facebook") return "Facebook";
  if (key === "whatsapp") return "WhatsApp";
  if (key === "referral") return "Referral";
  return "Other";
}

function inferSource(alias: JsonRecord, fromEmail: string, subject: string, body: string) {
  const aliasSource = normalizeText(alias.source);
  if (aliasSource && aliasSource !== "General") return normalizeLeadSource(aliasSource);
  const haystack = `${fromEmail} ${subject} ${body}`.toLowerCase();
  if (haystack.includes("property24") || haystack.includes("property 24")) return "Property24";
  if (haystack.includes("privateproperty") || haystack.includes("private property")) return "Private Property";
  if (haystack.includes("facebook")) return "Facebook";
  if (haystack.includes("website") || haystack.includes("web enquiry")) return "Website";
  return "Other";
}

function calculateParseConfidence(fields: JsonRecord, warnings: string[]) {
  let score = 0;
  if (fields.source && fields.source !== "Other") score += 0.15;
  if (fields.name) score += 0.15;
  if (fields.email) score += 0.2;
  if (fields.phone) score += 0.2;
  if (fields.listingReference || fields.listingId) score += 0.15;
  if (fields.message) score += 0.1;
  if (fields.parserName && fields.parserName !== "generic_email") score += 0.05;
  score -= Math.min(warnings.length * 0.08, 0.24);
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function buildParseResult({
  parserName = "generic_email",
  source = "Other",
  subject = "",
  body = "",
  fromName = "",
  fromEmail = "",
  alias = {},
  input = {},
  fields = {},
}: {
  parserName?: string;
  source?: string;
  subject?: string;
  body?: string;
  fromName?: string;
  fromEmail?: string;
  alias?: JsonRecord;
  input?: JsonRecord;
  fields?: JsonRecord;
}) {
  const base = {
    name: extractName(body, fromName),
    email: extractEmailAddress(body) || fromEmail,
    phone: extractPhone(body),
    listingReference: extractListingReference(`${subject}\n${body}`),
    message: extractMessage(body) || body || subject,
    budget: extractBudget(body),
    areaInterest: readLabelValue(body, ["area", "suburb", "location"]),
    propertyInterest: readLabelValue(body, ["property type", "property interest"]),
  };
  const cleanFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => {
    if (typeof value === "number") return value > 0;
    return normalizeText(value);
  }));
  const matchedFields = { ...base, ...cleanFields, parserName, source };
  const warnings = [];
  if (!matchedFields.email && !matchedFields.phone) warnings.push("missing_contact_details");
  if (!matchedFields.name) warnings.push("missing_contact_name");
  if (!matchedFields.listingReference && !alias.listing_id) warnings.push("missing_listing_reference");
  return {
    parserName,
    source,
    fields: matchedFields,
    confidence: calculateParseConfidence(matchedFields, warnings),
    warnings,
    raw: input,
  };
}

function parseLeadEmailBySource(context: {
  alias: JsonRecord;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  source: string;
  input: JsonRecord;
}) {
  const source = normalizeLeadSource(context.source || inferSource(context.alias, context.fromEmail, context.subject, context.body));
  const common = {
    ...context,
    source,
  };
  if (source === "Property24") {
    return buildParseResult({
      ...common,
      parserName: "property24_email",
      source: "Property24",
      fields: {
        name: readLabelValue(context.body, ["name", "contact name", "customer name"]) || extractName(context.body, context.fromName),
        email: normalizeEmail(readLabelValue(context.body, ["email", "email address"])),
        phone: (readLabelValue(context.body, ["telephone", "phone", "mobile", "contact number"]) || extractPhone(context.body)).replace(/[^\d+]/g, ""),
        listingReference: extractListingReference(`${context.subject}\n${context.body}`),
        message: readLabelValue(context.body, ["message", "comments", "enquiry"]) || extractMessage(context.body),
        areaInterest: readLabelValue(context.body, ["suburb", "area"]),
        propertyInterest: readLabelValue(context.body, ["property type"]),
        budget: extractBudget(context.body),
      },
    });
  }
  if (source === "Private Property") {
    return buildParseResult({
      ...common,
      parserName: "private_property_email",
      source: "Private Property",
      fields: {
        name: readLabelValue(context.body, ["name", "contact name", "customer name", "enquirer"]) || extractName(context.body, context.fromName),
        email: normalizeEmail(readLabelValue(context.body, ["email", "email address"])),
        phone: (readLabelValue(context.body, ["cellphone", "cell", "phone", "mobile", "contact number"]) || extractPhone(context.body)).replace(/[^\d+]/g, ""),
        listingReference: extractListingReference(`${context.subject}\n${context.body}`),
        message: readLabelValue(context.body, ["message", "enquiry", "comment"]) || extractMessage(context.body),
        areaInterest: readLabelValue(context.body, ["suburb", "area"]),
        propertyInterest: readLabelValue(context.body, ["property type"]),
        budget: extractBudget(context.body),
      },
    });
  }
  if (source === "Website") {
    const firstName = readLabelValue(context.body, ["first name"]);
    const lastName = readLabelValue(context.body, ["last name", "surname"]);
    return buildParseResult({
      ...common,
      parserName: "website_email",
      source: "Website",
      fields: {
        name: [firstName, lastName].filter(Boolean).join(" ") || extractName(context.body, context.fromName),
        email: normalizeEmail(readLabelValue(context.body, ["email", "email address"])),
        phone: (readLabelValue(context.body, ["phone", "mobile", "cell", "contact number"]) || extractPhone(context.body)).replace(/[^\d+]/g, ""),
        listingReference: extractListingReference(`${context.subject}\n${context.body}`),
        message: readLabelValue(context.body, ["message", "comments", "enquiry", "notes"]) || extractMessage(context.body),
        areaInterest: readLabelValue(context.body, ["area", "suburb", "location"]),
        propertyInterest: readLabelValue(context.body, ["property type", "property interest"]),
        budget: extractBudget(context.body),
      },
    });
  }
  return buildParseResult({ ...common, parserName: "generic_email", source });
}

async function parseRequestPayload(req: Request) {
  const contentType = normalizeLower(req.headers.get("content-type"));
  if (contentType.includes("application/json")) return await req.json() as JsonRecord;
  if (contentType.includes("form")) {
    const form = await req.formData();
    const payload: JsonRecord = {};
    for (const [key, value] of form.entries()) {
      payload[key] = typeof value === "string" ? value : value.name;
    }
    return payload;
  }
  return { raw: await req.text() };
}

function normalizeInboundPayload(payload: JsonRecord) {
  const toAddresses = parseAddressList(pickFirst(payload, [
    "to",
    "To",
    "recipient",
    "Recipient",
    "Recipients",
    "envelope.to",
    "Envelope.To",
  ]));
  const ccAddresses = parseAddressList(pickFirst(payload, ["cc", "Cc"]));
  const fromRaw = pickFirst(payload, ["from", "From", "sender", "Sender"]);
  const fromEmail = normalizeEmail(pickFirst(payload, ["from_email", "fromEmail", "sender.email"]) || fromRaw);
  const fromName = normalizeText(pickFirst(payload, ["from_name", "fromName", "sender.name"]));
  const subject = normalizeText(pickFirst(payload, ["subject", "Subject"]));
  const textBody = normalizeText(pickFirst(payload, ["text", "TextBody", "text_body", "textBody", "body", "stripped-text"]));
  const htmlBody = normalizeText(pickFirst(payload, ["html", "HtmlBody", "html_body", "htmlBody", "body-html", "stripped-html"]));
  const providerMessageId = normalizeText(pickFirst(payload, [
    "message_id",
    "messageId",
    "MessageID",
    "Message-Id",
    "MessageID",
    "id",
  ]));

  return {
    provider: normalizeText(payload.provider) || "inbound-email",
    providerMessageId: providerMessageId || createUuid(),
    fromEmail,
    fromName,
    replyToEmail: normalizeEmail(pickFirst(payload, ["reply_to", "replyTo", "Reply-To"])),
    toAddresses,
    ccAddresses,
    subject,
    textBody,
    htmlBody,
    receivedAt: normalizeText(pickFirst(payload, ["received_at", "receivedAt", "Date", "date"])) || new Date().toISOString(),
  };
}

function buildCanonicalPayload(inbound: ReturnType<typeof normalizeInboundPayload>, alias: JsonRecord) {
  const body = normalizeBodyText(inbound.textBody || stripHtml(inbound.htmlBody));
  const source = inferSource(alias, inbound.fromEmail, inbound.subject, body);
  const parseResult = parseLeadEmailBySource({
    alias,
    fromEmail: inbound.fromEmail,
    fromName: inbound.fromName,
    subject: inbound.subject,
    body,
    source,
    input: inbound as unknown as JsonRecord,
  });
  const parsedFields = parseResult.fields || {};
  return {
    organisationId: normalizeText(alias.organisation_id),
    source: normalizeText(parseResult.source) || source,
    externalReference: inbound.providerMessageId,
    name: normalizeText(parsedFields.name),
    email: normalizeEmail(parsedFields.email || inbound.replyToEmail || inbound.fromEmail),
    phone: normalizeText(parsedFields.phone),
    message: normalizeText(parsedFields.message) || body || inbound.subject,
    listingId: normalizeText(alias.listing_id),
    listingReference: normalizeText(parsedFields.listingReference),
    budget: Number(parsedFields.budget || 0) || 0,
    areaInterest: normalizeText(parsedFields.areaInterest),
    propertyInterest: normalizeText(parsedFields.propertyInterest),
    assignedAgentId: normalizeText(alias.agent_user_id),
    branchId: normalizeText(alias.branch_id),
    parserName: parseResult.parserName,
    parseConfidence: parseResult.confidence,
    parseWarnings: parseResult.warnings,
    matchedFields: parsedFields,
    rawPayload: {
      inboundEmail: inbound,
      captureAlias: alias,
      parser: {
        name: parseResult.parserName,
        confidence: parseResult.confidence,
        warnings: parseResult.warnings,
        matchedFields: parsedFields,
      },
    },
  };
}

async function insertWithColumnFallback(client: SupabaseClientLike, table: string, payload: JsonRecord, optionalColumns: string[]) {
  const workingPayload = { ...payload };
  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const result = await client.from(table).insert(workingPayload).select("*").single();
    if (!result.error) return result.data as JsonRecord;
    if (!isMissingColumnError(result.error) || attempt === optionalColumns.length) throw result.error;
    delete workingPayload[optionalColumns[attempt]];
  }
  throw new Error(`Unable to insert ${table}.`);
}

async function findExistingContact(client: SupabaseClientLike, organisationId: string, email: string, phone: string) {
  if (email) {
    const { data, error } = await client
      .from("contacts")
      .select("contact_id, email, phone")
      .eq("organisation_id", organisationId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as JsonRecord;
  }
  if (phone) {
    const { data, error } = await client
      .from("contacts")
      .select("contact_id, email, phone")
      .eq("organisation_id", organisationId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as JsonRecord;
  }
  return null;
}

async function createLeadFromEmail(client: SupabaseClientLike, canonical: JsonRecord) {
  const organisationId = normalizeText(canonical.organisationId);
  const email = normalizeEmail(canonical.email);
  const phone = normalizeText(canonical.phone);
  const nameParts = normalizeText(canonical.name).split(/\s+/).filter(Boolean);
  if (!organisationId || !isUuidLike(organisationId)) throw new Error("A valid organisation id is required.");
  if (!email && !phone) throw new Error("Lead email capture needs a customer email or phone number.");

  const existingLog = await client
    .from("lead_ingestion_logs")
    .select("*")
    .eq("organisation_id", organisationId)
    .ilike("source", normalizeText(canonical.source) || "Other")
    .eq("external_reference", normalizeText(canonical.externalReference))
    .limit(1)
    .maybeSingle();
  if (existingLog.error) throw existingLog.error;
  if (existingLog.data?.lead_id) {
    return { status: "duplicate", leadId: existingLog.data.lead_id, contactId: existingLog.data.contact_id };
  }

  const existingContact = await findExistingContact(client, organisationId, email, phone);
  const contactId = normalizeText(existingContact?.contact_id) || createUuid();
  if (!existingContact) {
    const contactPayload = {
      contact_id: contactId,
      organisation_id: organisationId,
      assigned_agent_id: isUuidLike(canonical.assignedAgentId) ? canonical.assignedAgentId : null,
      first_name: nameParts[0] || "Lead",
      last_name: nameParts.slice(1).join(" "),
      phone: phone || null,
      email: email || null,
      contact_type: "Lead",
      notes: null,
      updated_at: new Date().toISOString(),
    };
    const contactResult = await client.from("contacts").insert(contactPayload);
    if (contactResult.error) throw contactResult.error;
  }

  const leadId = createUuid();
  const now = new Date().toISOString();
  const leadPayload = {
    lead_id: leadId,
    organisation_id: organisationId,
    branch_id: isUuidLike(canonical.branchId) ? canonical.branchId : null,
    assigned_user_id: isUuidLike(canonical.assignedAgentId) ? canonical.assignedAgentId : null,
    created_by: isUuidLike(canonical.assignedAgentId) ? canonical.assignedAgentId : null,
    assigned_agent_id: isUuidLike(canonical.assignedAgentId) ? canonical.assignedAgentId : null,
    assigned_agent_email: null,
    contact_id: contactId,
    lead_category: "buyer",
    lead_direction: "Inbound",
    lead_source: normalizeText(canonical.source) || "Other",
    stage: "New Lead",
    status: "New Lead",
    priority: "High",
    budget: Number(canonical.budget || 0) || 0,
    area_interest: normalizeText(canonical.areaInterest) || null,
    property_interest: normalizeText(canonical.propertyInterest) || null,
    listing_id: isUuidLike(canonical.listingId) ? canonical.listingId : null,
    source_reference_id: normalizeText(canonical.externalReference) || null,
    raw_enquiry_payload: canonical.rawPayload || {},
    notes: normalizeText(canonical.message) || null,
    updated_at: now,
  };
  await insertWithColumnFallback(client, "leads", leadPayload, OPTIONAL_LEAD_COLUMNS);

  const logPayload = {
    log_id: createUuid(),
    organisation_id: organisationId,
    source: normalizeText(canonical.source) || "Other",
    external_reference: normalizeText(canonical.externalReference) || null,
    payload: canonical.rawPayload || {},
    status: "processed",
    lead_id: leadId,
    contact_id: contactId,
    listing_id: isUuidLike(canonical.listingId) ? canonical.listingId : null,
    assigned_agent_id: isUuidLike(canonical.assignedAgentId) ? canonical.assignedAgentId : null,
    review_status: (Number(canonical.parseConfidence || 0) < 0.65 || canonical.listingReference && !canonical.listingId) ? "needs_review" : null,
    processed_at: now,
    error: [
      canonical.listingReference && !canonical.listingId ? "Unknown listing: original enquiry listing could not be resolved." : "",
      Number(canonical.parseConfidence || 0) < 0.65 ? "Low parser confidence." : "",
    ].filter(Boolean).join(" ") || null,
  };
  await insertWithColumnFallback(client, "lead_ingestion_logs", logPayload, OPTIONAL_LOG_COLUMNS);

  return { status: "processed", leadId, contactId };
}

async function recordFailure(client: SupabaseClientLike, patch: JsonRecord) {
  await client.from("lead_parse_failures").insert({
    inbound_email_id: patch.inboundEmailId || null,
    organisation_id: patch.organisationId || null,
    capture_alias_id: patch.captureAliasId || null,
    source: patch.source || null,
    reason: normalizeText(patch.reason) || "Inbound lead email failed.",
    status: "open",
    payload: patch.payload || {},
    parser_name: patch.parserName || null,
    parse_confidence: patch.parseConfidence || null,
    parse_warnings: Array.isArray(patch.parseWarnings) ? patch.parseWarnings : [],
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { success: false, error: "Method not allowed." });

  const configuredSecret = normalizeText(Deno.env.get("INBOUND_LEAD_EMAIL_WEBHOOK_SECRET"));
  const providedSecret = normalizeText(req.headers.get("x-arch9-inbound-secret") || new URL(req.url).searchParams.get("secret"));
  if (configuredSecret && configuredSecret !== providedSecret) {
    return jsonResponse(401, { success: false, error: "Invalid inbound email webhook secret." });
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Supabase service credentials are not configured." });
  }

  const client = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await parseRequestPayload(req);
    const inbound = normalizeInboundPayload(payload);
    const recipient = inbound.toAddresses.find((address) => address.includes("@")) || "";
    const aliasResult = await client
      .from("lead_capture_aliases")
      .select("*")
      .ilike("email_address", recipient)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (aliasResult.error) throw aliasResult.error;

    const alias = (aliasResult.data || null) as JsonRecord | null;
    const rawEmailPayload = {
      organisation_id: alias?.organisation_id || null,
      capture_alias_id: alias?.alias_id || null,
      provider: inbound.provider,
      provider_message_id: inbound.providerMessageId,
      from_email: inbound.fromEmail || null,
      from_name: inbound.fromName || null,
      reply_to_email: inbound.replyToEmail || null,
      to_addresses: inbound.toAddresses,
      cc_addresses: inbound.ccAddresses,
      subject: inbound.subject || null,
      text_body: inbound.textBody || null,
      html_body: inbound.htmlBody || null,
      source: alias?.source || null,
      external_reference: inbound.providerMessageId,
      status: alias ? "received" : "unmatched",
      raw_payload: payload,
      received_at: inbound.receivedAt,
    };
    const rawEmailResult = await client.from("inbound_lead_emails").insert(rawEmailPayload).select("*").single();
    if (rawEmailResult.error) throw rawEmailResult.error;
    const inboundEmail = rawEmailResult.data as JsonRecord;

    if (!alias) {
      await recordFailure(client, {
        inboundEmailId: inboundEmail.email_id,
        reason: `No active lead capture alias matched recipient ${recipient || "(none)"}.`,
        payload,
      });
      return jsonResponse(202, { success: false, status: "unmatched", inboundEmailId: inboundEmail.email_id });
    }

    const canonical = buildCanonicalPayload(inbound, alias);
    try {
      const result = await createLeadFromEmail(client, canonical);
      await client
        .from("inbound_lead_emails")
        .update({
          status: result.status,
          source: canonical.source,
          lead_id: result.leadId,
          contact_id: result.contactId,
          parser_name: canonical.parserName,
          parse_confidence: canonical.parseConfidence,
          parse_warnings: Array.isArray(canonical.parseWarnings) ? canonical.parseWarnings : [],
          matched_fields: canonical.matchedFields || {},
          parsed_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        })
        .eq("email_id", inboundEmail.email_id);

      return jsonResponse(200, {
        success: true,
        status: result.status,
        inboundEmailId: inboundEmail.email_id,
        leadId: result.leadId,
        contactId: result.contactId,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Inbound lead email failed.";
      await client
        .from("inbound_lead_emails")
        .update({
          status: "failed",
          error: reason,
          parser_name: canonical.parserName,
          parse_confidence: canonical.parseConfidence,
          parse_warnings: Array.isArray(canonical.parseWarnings) ? canonical.parseWarnings : [],
          matched_fields: canonical.matchedFields || {},
          parsed_at: new Date().toISOString(),
        })
        .eq("email_id", inboundEmail.email_id);
      await recordFailure(client, {
        inboundEmailId: inboundEmail.email_id,
        organisationId: alias.organisation_id,
        captureAliasId: alias.alias_id,
        source: canonical.source,
        parserName: canonical.parserName,
        parseConfidence: canonical.parseConfidence,
        parseWarnings: canonical.parseWarnings,
        reason,
        payload: canonical,
      });
      return jsonResponse(422, { success: false, status: "failed", error: reason, inboundEmailId: inboundEmail.email_id });
    }
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Inbound lead email webhook failed.",
    });
  }
});
