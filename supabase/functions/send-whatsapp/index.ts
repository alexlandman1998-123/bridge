import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;

const META_GRAPH_VERSION = normalizeText(
  Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0",
);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrganizationConnection = {
  id: string;
  meta_access_token?: string | null;
  meta_access_token_secret_id?: string | null;
  phone_number_id: string;
  branch_id?: string | null;
  connection_status: string;
  verification_status?: string | null;
  display_phone_number?: string | null;
};

type TemplateDefinition = {
  id: string;
  internal_key: string;
  provider_template_name: string;
  language_code?: string | null;
  status?: string | null;
  is_default?: boolean | null;
};

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeUuid(value: unknown) {
  const normalized = normalizeLower(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(normalized)
    ? normalized
    : "";
}

function safeJson(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function toResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function textOrDefault(value: unknown, fallback = "") {
  return normalizeText(value, fallback);
}

function normalizeE164(value: unknown, defaultCountryCode = "27") {
  let normalized = normalizeText(value).replace(/[\s-().]/g, "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (!/^\d+$/.test(normalized)) {
    return "";
  }
  if (/^0\d{9,14}$/.test(normalized)) {
    return `${defaultCountryCode}${normalized.slice(1)}`;
  }
  if (/^\d{7,15}$/.test(normalized)) return normalized;
  return "";
}

function dedupe(value: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const candidate = normalizeText(item);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    output.push(candidate);
  }
  return output;
}

function normalizeTemplateVariables(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeText(item))
      .filter((value) => Boolean(value));
  }
  if (!raw || typeof raw !== "object") return [];
  const pairs = Object.entries(raw as Record<string, unknown>);
  return pairs.map(([, value]) => normalizeText(value));
}

function messageParameters(variables: string[]) {
  return variables
    .map((value) => ({ type: "text", text: value }))
    .filter((value) => value.text.length > 0);
}

function createServiceClient() {
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveRequestActorUserId(
  supabase: any,
  authorizationHeader: string,
) {
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const normalizedAuth = normalizeText(authorizationHeader);
  const token = normalizedAuth.replace(/^Bearer\s+/i, "");
  if (!token || !supabase) return "";
  if (serviceRoleKey && token === serviceRoleKey) return "service-role";
  const userResult = await supabase.auth.getUser(token);
  return normalizeUuid(userResult.data?.user?.id);
}

async function assertActorCanSendForOrganisation(
  supabase: any,
  actorUserId: string,
  organisationId: string,
) {
  if (!actorUserId || actorUserId === "service-role") return;
  const membership = await supabase
    .from("organisation_users")
    .select("id, organisation_id")
    .eq("organisation_id", organisationId)
    .eq("user_id", actorUserId)
    .maybeSingle();
  if (membership.error || !membership.data) {
    throw new Error("You do not have access to this organisation.");
  }
}

function templateLookupCandidates(payload: JsonRecord, templateKey: string) {
  const rawEventKey = normalizeText(
    payload.eventKey || payload.event_key || payload.templateKey || payload.template_key ||
      payload.notificationEventKey,
  );
  const candidates = dedupe([templateKey, rawEventKey]);
  return candidates.filter(Boolean);
}

async function resolveOrganisationConnection(
  supabase: any,
  organisationId: string,
  branchId = "",
) {
  if (!organisationId || !supabase) return null;
  if (branchId) {
    const branchConnection = await supabase
      .from("organisation_communication_channels")
      .select(
        "id, meta_access_token, meta_access_token_secret_id, phone_number_id, branch_id, connection_status, verification_status, display_phone_number",
      )
      .eq("organisation_id", organisationId)
      .eq("branch_id", branchId)
      .eq("provider", "meta")
      .eq("channel_type", "whatsapp")
      .eq("connection_status", "connected")
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!branchConnection.error && branchConnection.data) {
      return branchConnection.data as OrganizationConnection;
    }
  }

  const orgConnection = await supabase
    .from("organisation_communication_channels")
    .select(
      "id, meta_access_token, meta_access_token_secret_id, phone_number_id, branch_id, connection_status, verification_status, display_phone_number",
    )
    .eq("organisation_id", organisationId)
    .is("branch_id", null)
    .eq("provider", "meta")
    .eq("channel_type", "whatsapp")
    .eq("connection_status", "connected")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orgConnection.error) {
    throw new Error(orgConnection.error.message || "Unable to read WhatsApp connection.");
  }
  return orgConnection.data as OrganizationConnection | null;
}

async function resolveConnectionAccessToken(supabase: any, connection: OrganizationConnection | null) {
  if (!supabase || !connection) return "";
  const secretId = normalizeText(connection.meta_access_token_secret_id);
  const fallbackToken = normalizeText(connection.meta_access_token);
  if (!secretId && !fallbackToken) return "";
  const tokenResult = await supabase.rpc("bridge_resolve_whatsapp_access_token", {
    p_secret_id: secretId || null,
    p_fallback_token: fallbackToken || null,
  });
  if (tokenResult.error) {
    throw new Error(tokenResult.error.message || "Unable to resolve the WhatsApp access token.");
  }
  return normalizeText(tokenResult.data) || fallbackToken;
}

async function resolveTemplate(
  supabase: any,
  organisationId: string,
  templateKeys: string[],
) {
  if (!supabase || !organisationId || templateKeys.length === 0) return null;
  const normalizedKeys = templateKeys.map((value) => normalizeText(value)).filter(Boolean);
  for (const candidate of normalizedKeys) {
    const orgTemplate = await supabase
      .from("notification_templates")
      .select("id, internal_key, provider_template_name, language_code, status, is_default")
      .eq("organisation_id", organisationId)
      .eq("channel", "whatsapp")
      .eq("provider", "meta")
      .eq("status", "active")
      .or(`internal_key.eq.${candidate},event_key.eq.${candidate}`)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!orgTemplate.error && orgTemplate.data) {
      return orgTemplate.data as TemplateDefinition;
    }
  }

  for (const candidate of normalizedKeys) {
    const globalTemplate = await supabase
      .from("notification_templates")
      .select("id, internal_key, provider_template_name, language_code, status, is_default")
      .is("organisation_id", null)
      .eq("channel", "whatsapp")
      .eq("provider", "meta")
      .eq("status", "active")
      .or(`internal_key.eq.${candidate},event_key.eq.${candidate}`)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!globalTemplate.error && globalTemplate.data) {
      return globalTemplate.data as TemplateDefinition;
    }
  }

  return null;
}

async function createDeliveryRecord(
  supabase: any,
  payload: {
    organisationId: string;
    branchId?: string;
    leadId?: string;
    listingId?: string;
    transactionId?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    recipient: string;
    recipientRole?: string;
    templateKey?: string;
    eventKey?: string;
    automationKey?: string;
    provider?: string;
    requestId?: string;
    preparedBy?: string;
    notificationEventId?: string;
  },
) {
  if (!supabase || !payload.organisationId) return null;
  const insertPayload = {
    organisation_id: payload.organisationId,
    branch_id: normalizeUuid(payload.branchId) || null,
    lead_id: normalizeUuid(payload.leadId) || null,
    listing_id: normalizeUuid(payload.listingId) || null,
    transaction_id: normalizeUuid(payload.transactionId) || null,
    related_entity_type: normalizeText(payload.relatedEntityType),
    related_entity_id: normalizeUuid(payload.relatedEntityId),
    channel: "whatsapp",
    communication_type: "whatsapp_template",
    recipient: payload.recipient,
    recipient_phone: payload.recipient,
    recipient_role: normalizeText(payload.recipientRole),
    provider: payload.provider || "meta",
    event_key: normalizeText(payload.eventKey),
    template_key: normalizeText(payload.templateKey),
    status: "queued",
    automation_key: normalizeText(payload.automationKey),
    subject: normalizeText(payload.eventKey || payload.templateKey),
    message_preview: "",
    prepared_by: normalizeUuid(payload.preparedBy),
    sent_by: normalizeUuid(payload.preparedBy),
    notification_event_id: normalizeUuid(payload.notificationEventId),
    metadata_json: {
      source: "send-whatsapp",
      requestId: normalizeText(payload.requestId),
      relatedEntityType: normalizeText(payload.relatedEntityType),
      relatedEntityId: normalizeUuid(payload.relatedEntityId),
    },
  };
  const { data, error } = await supabase
    .from("communication_deliveries")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) return null;
  return data?.id as string | null;
}

async function markDeliverySent(
  supabase: any,
  deliveryId: string,
  providerMessageId: string,
) {
  if (!supabase || !deliveryId) return;
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("communication_deliveries")
    .update({
      status: "sent",
      provider_message_id: normalizeText(providerMessageId),
      sent_at: now,
      updated_at: now,
    })
    .eq("id", deliveryId)
    .select("id, notification_event_id")
    .single();
  const eventId = normalizeUuid((data as { notification_event_id?: string })?.notification_event_id);
  if (eventId) {
    await supabase
      .from("notification_events")
      .update({ status: "sent", sent_at: now, updated_at: now })
      .eq("id", eventId);
  }
}

async function markDeliveryFailed(
  supabase: any,
  deliveryId: string,
  message: string,
) {
  if (!supabase || !deliveryId) return;
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("communication_deliveries")
    .update({
      status: "failed",
      error_message: textOrDefault(message),
      failed_at: now,
      updated_at: now,
    })
    .eq("id", deliveryId)
    .select("id, notification_event_id")
    .single();
  const eventId = normalizeUuid((data as { notification_event_id?: string })?.notification_event_id);
  if (eventId) {
    await supabase
      .from("notification_events")
      .update({
        status: "failed",
        failed_at: now,
        error_message: textOrDefault(message),
        updated_at: now,
      })
      .eq("id", eventId);
  }
}

function buildTemplatePayload(
  template: TemplateDefinition,
  to: string,
  variables: string[],
) {
  const languageCode = normalizeText(template.language_code, "en_US");
  const parameters = messageParameters(variables);
  const components = parameters.length > 0
    ? [{ type: "body", parameters }]
    : [];
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.provider_template_name,
      language: { code: languageCode },
      components,
    },
  };
}

function buildTextPayload(to: string, message: string) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: message },
  };
}

async function sendMetaMessage(
  whatsappToken: string,
  phoneNumberId: string,
  body: JsonRecord,
) {
  const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const rawBody = await response.text();
  let responseBody = null as unknown;
  try {
    responseBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    responseBody = { raw: rawBody };
  }
  return { response, responseBody };
}

function mapDeliveryFailure(error: unknown) {
  if (!error) return "Meta API request failed.";
  if (typeof error === "string") return error;
  const body = safeJson(error);
  return normalizeText((body.error as { message?: string })?.message)
    || normalizeText(body.message)
    || normalizeText(body.error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return toResponse(405, { error: "Method not allowed." });
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody) return toResponse(400, { error: "Request body is required." });
  let payload: JsonRecord = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return toResponse(400, { error: "Invalid JSON body." });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return toResponse(500, {
      error: "Server configuration is incomplete. Missing Supabase credentials.",
    });
  }

  const actorAuthHeader = normalizeText(req.headers.get("authorization"));
  const actorUserId = await resolveRequestActorUserId(supabase, actorAuthHeader);
  const organisationId = normalizeUuid(payload.organisationId || payload.organisation_id);
  const branchId = normalizeUuid(payload.branchId || payload.branch_id);
  const relatedEntityType = normalizeText(
    payload.relatedEntityType || payload.related_entity_type,
  );
  const relatedEntityId = normalizeUuid(
    payload.relatedEntityId || payload.related_entity_id,
  );
  const to = normalizeE164(
    payload.to || payload.recipient || payload.phone || payload.recipientPhone ||
      payload.recipient_phone,
    normalizeText(payload.countryCode || payload.country_code || Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE"), "27"),
  );
  const templateKey = normalizeText(payload.templateKey || payload.template_key || payload.key);
  const eventKey = normalizeText(payload.eventKey || payload.event_key);
  const notificationEventId = normalizeUuid(payload.eventId || payload.notification_event_id);
  const requestId = normalizeUuid(payload.requestId || payload.request_id);
  const recipientRole = normalizeText(payload.recipientRole || payload.recipient_role);
  const legacyMessage = normalizeText(payload.message, "");

  if (!organisationId) return toResponse(400, { error: "organisationId is required." });
  if (!to) return toResponse(400, { error: "to/recipient/phone is required." });
  await assertActorCanSendForOrganisation(supabase, actorUserId, organisationId);
  const candidateKeys = templateLookupCandidates(payload, templateKey);
  const recipientId = `recipient-${to.slice(-6)}-${Date.now()}`;

  let connection = await resolveOrganisationConnection(
    supabase,
    organisationId,
    branchId,
  );
  if (!connection || connection.connection_status !== "connected") {
    const deliveryId = await createDeliveryRecord(supabase, {
      organisationId,
      branchId,
      leadId: relatedEntityType === "lead" ? relatedEntityId : "",
      listingId: relatedEntityType === "listing" ? relatedEntityId : "",
      transactionId: relatedEntityType === "transaction" ? relatedEntityId : "",
      relatedEntityType,
      relatedEntityId,
      recipient: to,
      templateKey,
      eventKey,
      requestId: recipientId,
      preparedBy: actorUserId,
      recipientRole,
      provider: "meta",
      ...(notificationEventId ? { notificationEventId } : {}),
    });
    if (deliveryId) {
      await markDeliveryFailed(supabase, deliveryId, "No connected WhatsApp sender found.");
    }
    return toResponse(400, {
      success: false,
      error: "No connected WhatsApp sender found for this organisation.",
      errorCode: "WHATSAPP_SENDER_NOT_FOUND",
    });
  }

  const deliveryId = await createDeliveryRecord(supabase, {
    organisationId,
    branchId,
    leadId: relatedEntityType === "lead" ? relatedEntityId : "",
    listingId: relatedEntityType === "listing" ? relatedEntityId : "",
    transactionId: relatedEntityType === "transaction" ? relatedEntityId : "",
    relatedEntityType,
    relatedEntityId,
    recipient: to,
    templateKey,
    eventKey,
    automationKey: eventKey,
    requestId: recipientId,
    preparedBy: actorUserId,
    recipientRole,
    ...(notificationEventId ? { notificationEventId } : {}),
  });

  const templateVariables = normalizeTemplateVariables(
    payload.variables || payload.templateVariables || payload.template_variables,
  );
  let providerMessage = null;
  let deliveryPayload: JsonRecord | null = null;
  const hasTemplateRequest = Boolean(templateKey || eventKey);
  const candidateTemplateKeys = candidateKeys.length > 0
    ? candidateKeys
    : hasTemplateRequest
    ? []
    : ["lead_created", "lead_enquiry_received"];
  const useTemplate = candidateTemplateKeys.length > 0 && !legacyMessage;
  if (useTemplate) {
    const template = await resolveTemplate(
      supabase,
      organisationId,
      candidateTemplateKeys,
    );
    if (!template) {
      if (deliveryId) {
        await markDeliveryFailed(
          supabase,
          deliveryId,
          `No active template mapping found for keys: ${candidateKeys.join(", ")}`,
        );
      }
      return toResponse(400, {
        success: false,
        error: "Template mapping was not found.",
        errorCode: "WHATSAPP_TEMPLATE_MISSING",
      });
    }
      deliveryPayload = buildTemplatePayload(
        template,
        to,
        templateVariables,
      );
    providerMessage = template.provider_template_name;
    if (deliveryId) {
      await supabase.from("communication_deliveries").update({
        template_key: template.internal_key,
      }).eq("id", deliveryId);
    }
  } else if (legacyMessage) {
    deliveryPayload = buildTextPayload(to, legacyMessage);
  } else {
    if (deliveryId) {
      await markDeliveryFailed(supabase, deliveryId, "No template or message content provided.");
    }
    return toResponse(400, {
      success: false,
      error: "Either templateKey/eventKey or message is required.",
      errorCode: "WHATSAPP_MESSAGE_NOT_DEFINED",
    });
  }

  const whatsappToken = await resolveConnectionAccessToken(supabase, connection);
  const phoneNumberId = normalizeText(connection.phone_number_id);
  if (!whatsappToken || !phoneNumberId) {
    if (deliveryId) {
      await markDeliveryFailed(supabase, deliveryId, "WhatsApp sender is missing token or phone number.");
    }
    return toResponse(400, {
      success: false,
      error: "Configured WhatsApp sender is missing token or phone id.",
      errorCode: "WHATSAPP_SENDER_MISCONFIGURED",
    });
  }

  try {
    const { response, responseBody } = await sendMetaMessage(
      whatsappToken,
      phoneNumberId,
      deliveryPayload,
    );
    if (!response.ok) {
      const reason = mapDeliveryFailure(responseBody || response);
      if (deliveryId) await markDeliveryFailed(supabase, deliveryId, reason);
      return toResponse(response.status, {
        success: false,
        error: reason,
        providerMessage: providerMessage || null,
        response: responseBody || null,
      });
    }
    const providerMessageId = normalizeText(
      safeJson(responseBody)?.messages?.[0]?.id ||
        safeJson(responseBody)?.messages?.[0]?.message_id,
    );
    if (deliveryId) {
      await markDeliverySent(supabase, deliveryId, providerMessageId);
    }
    return toResponse(200, {
      success: true,
      to,
      phoneNumberId,
      template: providerMessage,
      providerMessageId,
      deliveryId,
      recipient: {
        normalisedTo: to,
      },
    });
  } catch (error) {
    const reason = mapDeliveryFailure(error);
    if (deliveryId) {
      await markDeliveryFailed(supabase, deliveryId, reason);
    }
    return toResponse(500, { success: false, error: reason });
  }
});
