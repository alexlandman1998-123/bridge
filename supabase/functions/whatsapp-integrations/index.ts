import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.9";

type JsonRecord = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WHATSAPP_GRAPH_VERSION = normalizeText(
  Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v26.0",
);
const WHATSAPP_APP_ID = normalizeText(
  Deno.env.get("WHATSAPP_APP_ID") ||
    Deno.env.get("META_WHATSAPP_APP_ID") ||
    "1010066162083846",
);
const WHATSAPP_APP_SECRET = normalizeText(
  Deno.env.get("WHATSAPP_APP_SECRET") ||
    Deno.env.get("META_WHATSAPP_APP_SECRET") ||
    Deno.env.get("META_APP_SECRET") ||
    Deno.env.get("WHATSAPP_WEBHOOK_APP_SECRET"),
);
const WHATSAPP_REDIRECT_URI = normalizeText(
  Deno.env.get("WHATSAPP_REDIRECT_URI") ||
    Deno.env.get("META_WHATSAPP_REDIRECT_URI"),
);

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeUuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : "";
}

function safeJson(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function errorMessage(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return normalizeText(record.message || record.error || record.msg, fallback);
  }
  return fallback;
}

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function createServiceClient() {
  const url = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeRole(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function canManageAllScopes(role: string) {
  return [
    "owner",
    "super_admin",
    "principal",
    "admin",
    "developer",
    "hq_manager",
    "regional_manager",
  ].includes(normalizeRole(role));
}

function canManageOwnBranch(role: string) {
  return [
    "branch_manager",
    "branch_admin",
    "manager",
    "team_lead",
    "team_manager",
  ].includes(normalizeRole(role));
}

function mapConnectionRow(row: JsonRecord) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    branchId: normalizeText(row.branch_id),
    provider: normalizeText(row.provider),
    channelType: normalizeText(row.channel_type),
    wabaId: normalizeText(row.waba_id),
    phoneNumberId: normalizeText(row.phone_number_id),
    metaBusinessId: normalizeText(row.meta_business_id),
    displayPhoneNumber: normalizeText(row.display_phone_number),
    businessDisplayName: normalizeText(row.business_display_name),
    connectionStatus: normalizeText(row.connection_status),
    verificationStatus: normalizeText(row.verification_status),
    isDefault: row.is_default === true,
    connectedAt: row.connected_at || null,
    disconnectedAt: row.disconnected_at || null,
    lastErrorMessage: normalizeText(row.last_error_message),
    lastCheckedAt: row.last_checked_at || null,
    createdBy: normalizeText(row.created_by),
    metadataJson: safeJson(row.metadata_json),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    metaAccessTokenSecretId: normalizeText(row.meta_access_token_secret_id),
  };
}

async function resolveActorContext(
  supabase: any,
  authorizationHeader: string,
  organisationId: string,
) {
  const token = normalizeText(authorizationHeader).replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Error("Missing authorization token.");
  }

  const userResult = await supabase.auth.getUser(token);
  const userId = normalizeUuid(userResult.data?.user?.id);
  if (!userId) {
    throw new Error("Unable to resolve the current user.");
  }

  const membership = await supabase
    .from("organisation_users")
    .select("id, organisation_id, role, workspace_role, branch_id, primary_branch_id, status")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membership.error || !membership.data) {
    throw new Error("You do not have access to this organisation.");
  }

  const role = normalizeRole(
    membership.data.workspace_role ||
      membership.data.role ||
      "",
  );
  const branchId = normalizeUuid(
    membership.data.primary_branch_id || membership.data.branch_id,
  );

  return {
    userId,
    role,
    branchId,
  };
}

function assertScopeAccess(
  actor: { role: string; branchId: string },
  requestedBranchId: string,
) {
  if (canManageAllScopes(actor.role)) return requestedBranchId;

  if (!canManageOwnBranch(actor.role)) {
    throw new Error("You do not have permission to manage WhatsApp integrations.");
  }

  if (!actor.branchId) {
    throw new Error("Your branch membership does not have a branch scope.");
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    throw new Error("You can only manage WhatsApp for your assigned branch.");
  }

  return actor.branchId;
}

async function callMetaApi(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const rawText = await response.text();
  let body: JsonRecord = {};
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = rawText ? { raw: rawText } : {};
  }
  return { response, body };
}

function buildGraphUrl(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${path.replace(/^\/+/, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (normalizeText(value)) {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

async function exchangeEmbeddedSignupCode(code: string) {
  if (!WHATSAPP_APP_ID || !WHATSAPP_APP_SECRET) {
    throw new Error("Missing WhatsApp app credentials.");
  }

  const url = buildGraphUrl("oauth/access_token", {
    client_id: WHATSAPP_APP_ID,
    client_secret: WHATSAPP_APP_SECRET,
    code,
    redirect_uri: WHATSAPP_REDIRECT_URI,
  });

  const { response, body } = await callMetaApi(url.toString());
  if (!response.ok) {
    throw new Error(
      errorMessage(body?.error, "WhatsApp code exchange failed."),
    );
  }

  const accessToken = normalizeText(body.access_token);
  if (!accessToken) {
    throw new Error("WhatsApp code exchange did not return an access token.");
  }

  return {
    accessToken,
    tokenType: normalizeText(body.token_type),
    expiresIn: Number(body.expires_in || 0) || null,
  };
}

async function subscribeAppToWaba(accessToken: string, wabaId: string) {
  const url = buildGraphUrl(`${WHATSAPP_GRAPH_VERSION}/${wabaId}/subscribed_apps`);
  url.searchParams.set("access_token", accessToken);

  const { response, body } = await callMetaApi(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      subscribed_fields: "messages",
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(
      errorMessage(body?.error, "Unable to subscribe the app to the WABA."),
    );
  }

  return body;
}

async function fetchPhoneNumberDetails(accessToken: string, phoneNumberId: string) {
  const url = buildGraphUrl(`${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}`, {
    fields: "display_phone_number,verified_name,quality_rating,status",
  });
  url.searchParams.set("access_token", accessToken);

  const { response, body } = await callMetaApi(url.toString());
  if (!response.ok) {
    return {
      data: null,
      error: errorMessage(body?.error, "Unable to fetch phone number details."),
    };
  }

  return { data: body, error: "" };
}

async function createOrUpdateSecret(
  supabase: any,
  secretId: string,
  accessToken: string,
  organisationId: string,
  branchId: string,
) {
  const secretName = `whatsapp:${organisationId}:${branchId || "agency"}`
  const secretDescription = "WhatsApp embedded signup access token";
  const result = await supabase.rpc("bridge_store_whatsapp_access_token_secret", {
    p_secret_id: secretId || null,
    p_access_token: accessToken,
    p_secret_name: secretName,
    p_secret_description: secretDescription,
  });
  if (result.error) {
    throw new Error(result.error.message || "Unable to store the WhatsApp access token.");
  }
  return normalizeUuid(result.data);
}

async function resolveExistingConnection(
  supabase: any,
  organisationId: string,
  branchId: string,
) {
  let query = supabase
    .from("organisation_communication_channels")
    .select(
      "id, organisation_id, branch_id, provider, channel_type, waba_id, phone_number_id, meta_business_id, display_phone_number, business_display_name, connection_status, verification_status, is_default, connected_at, disconnected_at, last_error_message, last_checked_at, created_by, metadata_json, created_at, updated_at, meta_access_token_secret_id",
    )
    .eq("organisation_id", organisationId)
    .eq("provider", "meta")
    .eq("channel_type", "whatsapp");

  if (branchId) {
    query = query.eq("branch_id", branchId);
  } else {
    query = query.is("branch_id", null);
  }

  const result = await query.maybeSingle();
  if (result.error) {
    throw new Error(result.error.message || "Unable to read the existing WhatsApp connection.");
  }
  return result.data || null;
}

async function persistConnectionRecord(
  supabase: any,
  params: {
    organisationId: string;
    branchId: string;
    actorUserId: string;
    existingRow: JsonRecord | null;
    secretId: string;
    payload: JsonRecord;
    phoneDetails: JsonRecord | null;
    connectionStatus: string;
    verificationStatus: string;
    lastErrorMessage: string;
    extraMetadata?: JsonRecord;
  },
) {
  const now = new Date().toISOString();
  const existingRow = params.existingRow || {};
  const metadataJson = {
    ...(safeJson(existingRow.metadata_json) || {}),
    ...(params.extraMetadata || {}),
    embeddedSignup: {
      codePresent: Boolean(params.payload.code),
      wabaId: params.payload.wabaId,
      phoneNumberId: params.payload.phoneNumberId,
      branchId: params.branchId || null,
      savedAt: now,
    },
    phoneDetails: params.phoneDetails || null,
  };

  const record = {
    organisation_id: params.organisationId,
    branch_id: params.branchId || null,
    provider: "meta",
    channel_type: "whatsapp",
    waba_id: normalizeText(params.payload.wabaId),
    phone_number_id: normalizeText(params.payload.phoneNumberId),
    meta_business_id: normalizeText(
      params.payload.metaBusinessId || params.phoneDetails?.business_id || params.phoneDetails?.businessId,
    ),
    display_phone_number: normalizeText(
      params.phoneDetails?.display_phone_number || params.payload.displayPhoneNumber,
    ),
    business_display_name: normalizeText(
      params.phoneDetails?.verified_name || params.payload.businessDisplayName,
    ),
    connection_status: params.connectionStatus,
    verification_status: params.verificationStatus || null,
    is_default: true,
    meta_access_token_secret_id: params.secretId || null,
    meta_access_token: null,
    connected_at: params.connectionStatus === "connected"
      ? (existingRow.connected_at || now)
      : existingRow.connected_at || null,
    disconnected_at: params.connectionStatus === "connected"
      ? null
      : existingRow.disconnected_at || null,
    last_error_message: params.lastErrorMessage || null,
    last_checked_at: now,
    created_by: existingRow.created_by || params.actorUserId,
    metadata_json: metadataJson,
  };

  if (existingRow.id) {
    const updateResult = await supabase
      .from("organisation_communication_channels")
      .update(record)
      .eq("id", existingRow.id)
      .select(
        "id, organisation_id, branch_id, provider, channel_type, waba_id, phone_number_id, meta_business_id, display_phone_number, business_display_name, connection_status, verification_status, is_default, connected_at, disconnected_at, last_error_message, last_checked_at, created_by, metadata_json, created_at, updated_at, meta_access_token_secret_id",
      )
      .single();
    if (updateResult.error) {
      throw new Error(updateResult.error.message || "Unable to update the WhatsApp connection.");
    }
    return updateResult.data;
  }

  const insertResult = await supabase
    .from("organisation_communication_channels")
    .insert(record)
    .select(
      "id, organisation_id, branch_id, provider, channel_type, waba_id, phone_number_id, meta_business_id, display_phone_number, business_display_name, connection_status, verification_status, is_default, connected_at, disconnected_at, last_error_message, last_checked_at, created_by, metadata_json, created_at, updated_at, meta_access_token_secret_id",
    )
    .single();
  if (insertResult.error) {
    throw new Error(insertResult.error.message || "Unable to create the WhatsApp connection.");
  }
  return insertResult.data;
}

async function listConnections(
  supabase: any,
  organisationId: string,
  actor: { role: string; branchId: string },
) {
  const result = await supabase
    .from("organisation_communication_channels")
    .select(
      "id, organisation_id, branch_id, provider, channel_type, waba_id, phone_number_id, meta_business_id, display_phone_number, business_display_name, connection_status, verification_status, is_default, connected_at, disconnected_at, last_error_message, last_checked_at, created_by, metadata_json, created_at, updated_at, meta_access_token_secret_id",
    )
    .eq("organisation_id", organisationId)
    .eq("provider", "meta")
    .eq("channel_type", "whatsapp")
    .order("updated_at", { ascending: false });

  if (result.error) {
    throw new Error(result.error.message || "Unable to list WhatsApp connections.");
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const scopedRows = canManageAllScopes(actor.role)
    ? rows
    : rows.filter((row: JsonRecord) => {
        const rowBranchId = normalizeUuid(row.branch_id);
        return !rowBranchId || rowBranchId === actor.branchId;
      });

  return scopedRows.map(mapConnectionRow);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const supabase = createServiceClient();
  if (!supabase) {
    return jsonResponse(500, { error: "Missing storage credentials." });
  }

  const rawBody = await req.text();
  let payload: JsonRecord = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload." });
  }

  const action = normalizeText(payload.action || "list").toLowerCase();
  const organisationId = normalizeUuid(payload.organisationId || payload.organisation_id);
  if (!organisationId) {
    return jsonResponse(400, { error: "An organisationId is required." });
  }

  let actor: { userId: string; role: string; branchId: string } | null = null;
  try {
    actor = await resolveActorContext(supabase, req.headers.get("authorization") || "", organisationId);
  } catch (error) {
    return jsonResponse(403, { error: errorMessage(error, "Access denied.") });
  }

  if (action === "list") {
    try {
      const connections = await listConnections(supabase, organisationId, actor);
      return jsonResponse(200, {
        ok: true,
        organisationId,
        connections,
      });
    } catch (error) {
      return jsonResponse(500, { error: errorMessage(error, "Unable to load WhatsApp connections.") });
    }
  }

  if (action === "disconnect") {
    const connectionId = normalizeUuid(payload.connectionId || payload.connection_id);
    if (!connectionId) {
      return jsonResponse(400, { error: "A connectionId is required." });
    }

    const existingResult = await supabase
      .from("organisation_communication_channels")
      .select(
        "id, organisation_id, branch_id, provider, channel_type, waba_id, phone_number_id, meta_business_id, display_phone_number, business_display_name, connection_status, verification_status, is_default, connected_at, disconnected_at, last_error_message, last_checked_at, created_by, metadata_json, created_at, updated_at, meta_access_token_secret_id",
      )
      .eq("id", connectionId)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (existingResult.error || !existingResult.data) {
      return jsonResponse(404, { error: "The WhatsApp connection could not be found." });
    }

    const existingRow = existingResult.data as JsonRecord;
    const branchId = normalizeUuid(existingRow.branch_id);
    assertScopeAccess(actor, branchId);

    const updateResult = await supabase
      .from("organisation_communication_channels")
      .update({
        connection_status: "disconnected",
        verification_status: existingRow.verification_status || null,
        is_default: false,
        meta_access_token_secret_id: null,
        meta_access_token: null,
        disconnected_at: new Date().toISOString(),
        last_error_message: null,
        last_checked_at: new Date().toISOString(),
        metadata_json: {
          ...(safeJson(existingRow.metadata_json) || {}),
          disconnectedAt: new Date().toISOString(),
          disconnectedBy: actor.userId,
        },
      })
      .eq("id", existingRow.id)
      .select(
        "id, organisation_id, branch_id, provider, channel_type, waba_id, phone_number_id, meta_business_id, display_phone_number, business_display_name, connection_status, verification_status, is_default, connected_at, disconnected_at, last_error_message, last_checked_at, created_by, metadata_json, created_at, updated_at, meta_access_token_secret_id",
      )
      .single();

    if (updateResult.error) {
      return jsonResponse(500, { error: updateResult.error.message || "Unable to disconnect the WhatsApp connection." });
    }

    return jsonResponse(200, {
      ok: true,
      connection: mapConnectionRow(updateResult.data),
    });
  }

  if (action !== "connect") {
    return jsonResponse(400, { error: `Unsupported action: ${action}` });
  }

  const code = normalizeText(payload.code);
  const wabaId = normalizeText(payload.wabaId || payload.waba_id);
  const phoneNumberId = normalizeText(payload.phoneNumberId || payload.phone_number_id);
  const requestedBranchId = normalizeUuid(payload.branchId || payload.branch_id);
  const branchId = assertScopeAccess(actor, requestedBranchId);
  const payloadDescriptor = {
    code,
    wabaId,
    phoneNumberId,
    metaBusinessId: normalizeText(payload.metaBusinessId || payload.business_id),
    displayPhoneNumber: normalizeText(payload.displayPhoneNumber || payload.display_phone_number),
    businessDisplayName: normalizeText(payload.businessDisplayName || payload.business_display_name),
    raw: safeJson(payload.raw),
  };

  if (!code || !wabaId || !phoneNumberId) {
    return jsonResponse(400, {
      error: "Embedded signup must include code, wabaId, and phoneNumberId.",
    });
  }

  const existingRow = await resolveExistingConnection(supabase, organisationId, branchId);

  let accessToken = "";
  let secretId = normalizeUuid(existingRow?.meta_access_token_secret_id);
  let phoneDetails: JsonRecord | null = null;
  let connectionStatus = "connecting";
  let verificationStatus = "";
  let lastErrorMessage = "";
  let extraMetadata: JsonRecord = {
    source: "embedded_signup_v4",
    graphApiVersion: WHATSAPP_GRAPH_VERSION,
    signupPayload: payloadDescriptor,
  };

  try {
    const exchangeResult = await exchangeEmbeddedSignupCode(code);
    accessToken = exchangeResult.accessToken;
    secretId = await createOrUpdateSecret(
      supabase,
      secretId,
      accessToken,
      organisationId,
      branchId,
    );
  } catch (error) {
    connectionStatus = "error";
    lastErrorMessage = errorMessage(error, "Unable to exchange the embedded signup code.");
    const savedConnection = await persistConnectionRecord(supabase, {
      organisationId,
      branchId,
      actorUserId: actor.userId,
      existingRow,
      secretId,
      payload: payloadDescriptor,
      phoneDetails,
      connectionStatus,
      verificationStatus,
      lastErrorMessage,
      extraMetadata: {
        ...extraMetadata,
        exchangeError: lastErrorMessage,
      },
    }).catch((saveError) => {
      throw new Error(saveError?.message || lastErrorMessage);
    });

    return jsonResponse(400, {
      ok: false,
      error: lastErrorMessage,
      connection: mapConnectionRow(savedConnection),
    });
  }

  try {
    await subscribeAppToWaba(accessToken, wabaId);
  } catch (error) {
    connectionStatus = "error";
    lastErrorMessage = errorMessage(error, "Unable to subscribe the app to the WABA.");
    const savedConnection = await persistConnectionRecord(supabase, {
      organisationId,
      branchId,
      actorUserId: actor.userId,
      existingRow,
      secretId,
      payload: payloadDescriptor,
      phoneDetails,
      connectionStatus,
      verificationStatus,
      lastErrorMessage,
      extraMetadata: {
        ...extraMetadata,
        subscribeError: lastErrorMessage,
      },
    });

    return jsonResponse(400, {
      ok: false,
      error: lastErrorMessage,
      connection: mapConnectionRow(savedConnection),
    });
  }

  const phoneDetailsResult = await fetchPhoneNumberDetails(accessToken, phoneNumberId);
  if (phoneDetailsResult.data) {
    phoneDetails = phoneDetailsResult.data;
    verificationStatus = normalizeText(
      phoneDetails.status || phoneDetails.verification_status || phoneDetails.verificationStatus,
    );
  }
  if (phoneDetailsResult.error) {
    extraMetadata = {
      ...extraMetadata,
      phoneDetailsError: phoneDetailsResult.error,
    };
  }

  connectionStatus = "connected";
  const savedConnection = await persistConnectionRecord(supabase, {
    organisationId,
    branchId,
    actorUserId: actor.userId,
    existingRow,
    secretId,
    payload: payloadDescriptor,
    phoneDetails,
    connectionStatus,
    verificationStatus,
    lastErrorMessage: "",
    extraMetadata,
  });

  return jsonResponse(200, {
    ok: true,
    connection: mapConnectionRow(savedConnection),
    phoneDetails,
  });
});
