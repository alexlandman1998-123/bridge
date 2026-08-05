import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MAX_REQUEST_BYTES = 96 * 1024;
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const NOTE_START = "[Buyer viewing plan]";
const NOTE_END = "[/Buyer viewing plan]";

function normalizeText(value: unknown, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Request-ID": crypto.randomUUID(),
    },
  });
}

async function parseRequest(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) throw new Error("request_too_large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("request_too_large");
  }
  const parsed = raw ? JSON.parse(raw) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_request");
  }
  return parsed as JsonRecord;
}

function bytesToBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256UrlSafe(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function safeOrigin(value: unknown) {
  const raw = normalizeText(value, 500).replace(/\/+$/, "");
  if (!raw) {
    return normalizeText(Deno.env.get("PUBLIC_APP_URL"), 500).replace(/\/+$/, "") ||
      normalizeText(Deno.env.get("CLIENT_APP_URL"), 500).replace(/\/+$/, "") ||
      normalizeText(Deno.env.get("SITE_URL"), 500).replace(/\/+$/, "") ||
      "https://app.arch9.co.za";
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid_origin");
    return parsed.origin;
  } catch {
    return "https://app.arch9.co.za";
  }
}

function normalizeUuid(value: unknown) {
  const raw = normalizeText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(raw)
    ? raw
    : "";
}

function normalizeProperties(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 25)
    .map((item) => {
      const row = item as JsonRecord;
      return {
        id: normalizeText(row.id, 120),
        title: normalizeText(row.title || row.name || row.address, 180) || "Selected property",
        price: normalizeText(row.price || row.priceLabel, 120),
        area: normalizeText(row.area || row.suburb || row.location, 180),
        match: normalizeText(row.match || row.matchLabel, 60),
        imageUrl: normalizeText(row.imageUrl || row.image_url || row.image || row.thumbnailUrl || row.thumbnail_url, 1000),
        link: normalizeText(row.link || row.url, 1000),
        sellerViewingAvailability: normalizeText(row.sellerViewingAvailability || row.seller_viewing_availability, 1200),
        sellerViewingAvailabilityWindows: normalizeText(row.sellerViewingAvailabilityWindows || row.seller_viewing_availability_windows, 1200),
        sellerViewingAccessInstructions: normalizeText(row.sellerViewingAccessInstructions || row.seller_viewing_access_instructions, 1200),
        sellerViewingNoticePeriod: normalizeText(row.sellerViewingNoticePeriod || row.seller_viewing_notice_period, 180),
        sellerViewingNoticeRequired: row.sellerViewingNoticeRequired === true || row.seller_viewing_notice_required === true,
      };
    });
}

function normalizePropertyResponses(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as JsonRecord;
      const propertyId = normalizeText(row.propertyId || row.property_id || row.id, 120);
      if (!propertyId || (allowedIds.size && !allowedIds.has(propertyId))) return null;
      const wantsToView = row.wantsToView === true || normalizeText(row.wantsToView).toLowerCase() === "yes";
      return { propertyId, wantsToView };
    })
    .filter(Boolean) as Array<{ propertyId: string; wantsToView: boolean }>;
}

function normalizeWindows(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item, 160)).filter(Boolean).slice(0, 5);
  }
  return normalizeText(value, 800)
    .split(/\r?\n/)
    .map((line) => normalizeText(line, 160))
    .filter(Boolean)
    .slice(0, 5);
}

function parseNoteBlock(notes = "") {
  const startIndex = notes.indexOf(NOTE_START);
  const endIndex = notes.indexOf(NOTE_END, startIndex);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return {};
  const labelToKey: Record<string, string> = {
    "Status": "status",
    "Selected property ids": "selectedPropertyIds",
    "Confirmed property ids": "confirmedPropertyIds",
    "Buyer availability windows": "availabilityWindows",
    "Buyer response notes": "responseNotes",
    "Seller recipients": "sellerRecipientEmails",
    "Seller coordination notes": "sellerCoordinationNotes",
    "Booked property ids": "bookedPropertyIds",
    "Booked appointment ids": "bookedAppointmentIds",
    "Buyer availability requested at": "requestedAt",
    "Buyer responded at": "respondedAt",
    "Seller availability requested at": "sellerRequestedAt",
    "Viewing appointments booked at": "bookedAt",
    "Buyer email": "recipientEmail",
    "Buyer email delivery status": "buyerEmailDeliveryStatus",
    "Buyer email delivery id": "buyerEmailDeliveryId",
    "Buyer email provider message id": "buyerEmailProviderMessageId",
    "Buyer email delivery failure": "buyerEmailDeliveryFailure",
    "Seller email delivery status": "sellerEmailDeliveryStatus",
    "Seller email delivery ids": "sellerEmailDeliveryIds",
    "Seller email provider message ids": "sellerEmailProviderMessageIds",
    "Seller email delivery failure": "sellerEmailDeliveryFailure",
    "Updated at": "updatedAt",
  };
  const parsed: JsonRecord = {};
  let activeKey = "";
  notes
    .slice(startIndex + NOTE_START.length, endIndex)
    .trim()
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      const key = match ? labelToKey[normalizeText(match[1], 120)] : "";
      if (key) {
        activeKey = key;
        parsed[key] = normalizeText(match?.[2], 5000);
      } else if (activeKey && normalizeText(line)) {
        parsed[activeKey] = [parsed[activeKey], normalizeText(line)].filter(Boolean).join("\n");
      }
    });
  return parsed;
}

function commaList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item, 120)).filter(Boolean).join(", ")
    : normalizeText(value, 1000);
}

function buildNoteBlock(plan: JsonRecord) {
  return [
    NOTE_START,
    `Status: ${normalizeText(plan.status, 80) || "draft"}`,
    `Selected property ids: ${commaList(plan.selectedPropertyIds)}`,
    `Confirmed property ids: ${commaList(plan.confirmedPropertyIds)}`,
    `Buyer availability windows: ${normalizeText(plan.availabilityWindows, 1000)}`,
    `Buyer response notes: ${normalizeText(plan.responseNotes, 1200)}`,
    `Seller recipients: ${normalizeText(plan.sellerRecipientEmails, 1000)}`,
    `Seller coordination notes: ${normalizeText(plan.sellerCoordinationNotes, 1200)}`,
    `Booked property ids: ${commaList(plan.bookedPropertyIds)}`,
    `Booked appointment ids: ${commaList(plan.bookedAppointmentIds)}`,
    `Buyer availability requested at: ${normalizeText(plan.requestedAt, 80)}`,
    `Buyer responded at: ${normalizeText(plan.respondedAt, 80)}`,
    `Seller availability requested at: ${normalizeText(plan.sellerRequestedAt, 80)}`,
    `Viewing appointments booked at: ${normalizeText(plan.bookedAt, 80)}`,
    `Buyer email: ${normalizeText(plan.recipientEmail, 320)}`,
    `Buyer email delivery status: ${normalizeText(plan.buyerEmailDeliveryStatus, 80)}`,
    `Buyer email delivery id: ${normalizeText(plan.buyerEmailDeliveryId, 120)}`,
    `Buyer email provider message id: ${normalizeText(plan.buyerEmailProviderMessageId, 120)}`,
    `Buyer email delivery failure: ${normalizeText(plan.buyerEmailDeliveryFailure, 800)}`,
    `Seller email delivery status: ${normalizeText(plan.sellerEmailDeliveryStatus, 80)}`,
    `Seller email delivery ids: ${normalizeText(plan.sellerEmailDeliveryIds, 1000)}`,
    `Seller email provider message ids: ${normalizeText(plan.sellerEmailProviderMessageIds, 1000)}`,
    `Seller email delivery failure: ${normalizeText(plan.sellerEmailDeliveryFailure, 800)}`,
    `Updated at: ${normalizeText(plan.updatedAt, 80)}`,
    NOTE_END,
  ].join("\n");
}

function replaceNoteBlock(notes = "", plan: JsonRecord) {
  const block = buildNoteBlock(plan);
  const startIndex = notes.indexOf(NOTE_START);
  const endIndex = notes.indexOf(NOTE_END, startIndex);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return [notes.trim(), block].filter(Boolean).join("\n\n");
  }
  return [
    notes.slice(0, startIndex).trim(),
    block,
    notes.slice(endIndex + NOTE_END.length).trim(),
  ].filter(Boolean).join("\n\n");
}

async function getAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = normalizeText(req.headers.get("authorization"), 3000);
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token === anonKey) return null;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed.", code: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, { error: "Viewing preferences are temporarily unavailable.", code: "service_unavailable" });
  }

  let body: JsonRecord;
  try {
    body = await parseRequest(req);
  } catch (error) {
    const tooLarge = normalizeText((error as Error)?.message) === "request_too_large";
    return jsonResponse(tooLarge ? 413 : 400, {
      error: tooLarge ? "The request was too large." : "The request body was invalid.",
      code: tooLarge ? "request_too_large" : "invalid_request",
    });
  }

  const action = normalizeText(body.action, 30).toLowerCase();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "create") {
    const organisationId = normalizeUuid(body.organisationId || body.organisation_id);
    const leadId = normalizeUuid(body.leadId || body.lead_id);
    const user = await getAuthenticatedUser(req, supabaseUrl, anonKey);
    if (!user?.id) return jsonResponse(401, { error: "Sign in before creating a viewing link.", code: "not_authenticated" });
    if (!organisationId || !leadId) return jsonResponse(400, { error: "A valid organisation and lead are required.", code: "invalid_context" });

    const membership = await supabase
      .from("organisation_users")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("user_id", user.id)
      .in("status", ["active", "accepted"])
      .limit(1)
      .maybeSingle();
    if (membership.error) {
      console.error("[buyer-viewing-preferences] membership lookup failed", { code: membership.error.code, message: membership.error.message });
      return jsonResponse(500, { error: "We could not verify workspace access.", code: "membership_lookup_failed" });
    }
    if (!membership.data) return jsonResponse(403, { error: "You do not have access to this workspace.", code: "workspace_forbidden" });

    const properties = normalizeProperties(body.properties);
    const selectedPropertyIds = (Array.isArray(body.selectedPropertyIds) ? body.selectedPropertyIds : [])
      .map((item) => normalizeText(item, 120))
      .filter(Boolean);
    const resolvedPropertyIds = selectedPropertyIds.length
      ? selectedPropertyIds
      : properties.map((property) => property.id).filter(Boolean);
    if (!resolvedPropertyIds.length) return jsonResponse(400, { error: "Select at least one property.", code: "properties_required" });

    const token = randomToken();
    const tokenHash = await sha256UrlSafe(token);
    const origin = safeOrigin(body.origin);
    const expiresInDays = Math.min(Math.max(Number(body.expiresInDays || body.expires_in_days || 14), 1), 45);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const insert = await supabase
      .from("buyer_viewing_preference_links")
      .insert({
        organisation_id: organisationId,
        lead_id: leadId,
        contact_email: normalizeText(body.buyerEmail || body.contactEmail || body.to, 320).toLowerCase() || null,
        organisation_name: normalizeText(body.organisationName || body.organisation_name, 180) || null,
        buyer_name: normalizeText(body.buyerName || body.recipientName, 180) || null,
        agent_name: normalizeText(body.agentName, 180) || null,
        agent_email: normalizeText(body.agentEmail, 320).toLowerCase() || null,
        token_hash: tokenHash,
        selected_property_ids: resolvedPropertyIds,
        properties,
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (insert.error) {
      console.error("[buyer-viewing-preferences] create failed", { code: insert.error.code, message: insert.error.message });
      return jsonResponse(500, { error: "We could not create the viewing link.", code: "create_failed" });
    }

    return jsonResponse(200, {
      ok: true,
      linkId: insert.data?.id || null,
      preferenceLink: `${origin}/viewing-preferences/${encodeURIComponent(token)}`,
      expiresAt: insert.data?.expires_at || expiresAt,
    });
  }

  const token = normalizeText(body.token, 140);
  if (!LINK_TOKEN_PATTERN.test(token)) {
    return jsonResponse(404, { error: "This viewing link is unavailable.", code: "link_unavailable" });
  }
  const tokenHash = await sha256UrlSafe(token);
  const linkResult = await supabase
    .from("buyer_viewing_preference_links")
    .select("id, organisation_id, lead_id, created_by, contact_email, organisation_name, buyer_name, agent_name, agent_email, status, selected_property_ids, properties, response, created_at, last_sent_at, expires_at, submitted_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (linkResult.error) {
    console.error("[buyer-viewing-preferences] resolve failed", { code: linkResult.error.code, message: linkResult.error.message });
    return jsonResponse(500, { error: "We could not load this viewing link.", code: "resolve_failed" });
  }
  const link = linkResult.data as JsonRecord | null;
  if (!link) return jsonResponse(404, { error: "This viewing link is unavailable.", code: "link_unavailable" });
  const expired = new Date(normalizeText(link.expires_at)).getTime() < Date.now();
  if (expired && link.status === "pending") {
    await supabase.from("buyer_viewing_preference_links").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", link.id);
  }

  const publicSession = {
    id: link.id,
    organisationName: link.organisation_name || "",
    buyerName: link.buyer_name || "",
    agentName: link.agent_name || "",
    agentEmail: link.agent_email || "",
    status: expired ? "expired" : link.status,
    properties: Array.isArray(link.properties) ? link.properties : [],
    response: asRecord(link.response),
    expiresAt: link.expires_at,
    submittedAt: link.submitted_at,
  };

  if (action === "resolve") return jsonResponse(200, { ok: true, session: publicSession });
  if (action !== "submit") return jsonResponse(400, { error: "The requested action is invalid.", code: "invalid_action" });
  if (expired || link.status !== "pending") {
    return jsonResponse(409, { error: "This viewing link is no longer accepting responses.", code: "link_closed", session: publicSession });
  }

  const properties = Array.isArray(link.properties) ? link.properties as JsonRecord[] : [];
  const allowedIds = new Set((Array.isArray(link.selected_property_ids) ? link.selected_property_ids : []).map((item) => normalizeText(item, 120)).filter(Boolean));
  const propertyResponses = normalizePropertyResponses(body.propertyResponses || body.property_responses, allowedIds);
  const confirmedPropertyIds = propertyResponses.filter((item) => item.wantsToView).map((item) => item.propertyId);
  const availabilityWindows = normalizeWindows(body.availabilityWindows || body.availability_windows);
  const attendeeNotes = normalizeText(body.attendeeNotes || body.attendee_notes, 1000);
  const responseNotes = normalizeText(body.responseNotes || body.response_notes, 1200);
  if (!confirmedPropertyIds.length) {
    return jsonResponse(400, { error: "Choose at least one property you would like to view.", code: "properties_required" });
  }
  if (!availabilityWindows.length) {
    return jsonResponse(400, { error: "Add at least one preferred viewing time.", code: "availability_required" });
  }

  const now = new Date().toISOString();
  const response = { propertyResponses, confirmedPropertyIds, availabilityWindows, attendeeNotes, responseNotes, submittedAt: now };
  const update = await supabase
    .from("buyer_viewing_preference_links")
    .update({ status: "submitted", response, submitted_at: now, updated_at: now })
    .eq("id", link.id)
    .eq("status", "pending")
    .select("id")
    .single();
  if (update.error) {
    console.error("[buyer-viewing-preferences] submit failed", { code: update.error.code, message: update.error.message });
    return jsonResponse(500, { error: "We could not save your viewing preferences.", code: "submit_failed" });
  }

  const leadId = normalizeUuid(link.lead_id);
  const organisationId = normalizeUuid(link.organisation_id);
  const selectedPropertyIds = Array.from(allowedIds);
  const availabilityText = availabilityWindows.join("\n");
  const combinedNotes = [responseNotes, attendeeNotes ? `Attendees: ${attendeeNotes}` : ""].filter(Boolean).join("\n");
  if (leadId && organisationId) {
    const leadQuery = await supabase
      .from("leads")
      .select("notes")
      .eq("organisation_id", organisationId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!leadQuery.error) {
      const existingNotes = normalizeText(leadQuery.data?.notes, 20000);
      const existingPlan = parseNoteBlock(existingNotes);
      const nextNotes = replaceNoteBlock(existingNotes, {
        ...existingPlan,
        status: "buyer_confirmed",
        selectedPropertyIds: selectedPropertyIds.length ? selectedPropertyIds : confirmedPropertyIds,
        confirmedPropertyIds,
        availabilityWindows: availabilityText,
        responseNotes: combinedNotes,
        requestedAt: existingPlan.requestedAt || link.last_sent_at || link.created_at,
        respondedAt: now,
        recipientEmail: existingPlan.recipientEmail || link.contact_email,
        updatedAt: now,
      });
      await supabase
        .from("leads")
        .update({ notes: nextNotes, updated_at: now })
        .eq("organisation_id", organisationId)
        .eq("lead_id", leadId);
    }

    const confirmedTitles = properties
      .filter((property) => confirmedPropertyIds.includes(normalizeText(property.id, 120)))
      .map((property) => normalizeText(property.title, 180))
      .filter(Boolean)
      .join(", ");
    const activity = await supabase.from("lead_activities").insert({
      activity_id: crypto.randomUUID(),
      organisation_id: organisationId,
      lead_id: leadId,
      agent_id: normalizeUuid(link.created_by),
      activity_type: "Buyer Viewing Response Captured",
      activity_note: [
        `${confirmedPropertyIds.length} viewing${confirmedPropertyIds.length === 1 ? "" : "s"} requested${confirmedTitles ? `: ${confirmedTitles}` : ""}.`,
        `Preferred times: ${availabilityText}`,
        combinedNotes ? `Notes: ${combinedNotes}` : "",
      ].filter(Boolean).join("\n"),
      activity_date: now,
      outcome: "Buyer confirmed",
    });
    if (activity.error) {
      console.error("[buyer-viewing-preferences] lead activity insert failed", { code: activity.error.code, message: activity.error.message });
    }
  }

  return jsonResponse(200, { ok: true, session: { ...publicSession, status: "submitted", response, submittedAt: now } });
});
