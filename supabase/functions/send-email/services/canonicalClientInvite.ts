import { normalizeText } from "../utils/text.ts";

const CLIENT_INVITE_TYPE = "client_invite";

function normalizeEmail(value: unknown) {
  const email = normalizeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeClientRole(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "seller") return "seller";
  return "buyer";
}

function normalizeUuidText(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function resolveBaseUrl(appBaseUrl = "", legacyPortalLink = "") {
  const explicit = normalizeText(appBaseUrl).replace(/\/+$/, "");
  if (explicit) return explicit;
  try {
    const parsed = new URL(normalizeText(legacyPortalLink));
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function resolvePortalRedirectPath(legacyPortalLink = "", explicitPath = "") {
  const normalizedPath = normalizeText(explicitPath);
  if (normalizedPath.startsWith("/")) return normalizedPath;
  const legacy = normalizeText(legacyPortalLink);
  if (legacy.startsWith("/")) return legacy;
  try {
    const parsed = new URL(legacy);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "";
  }
}

export async function ensureCanonicalClientInvite(
  supabase: any,
  {
    email,
    clientRole = "buyer",
    transactionId = "",
    appBaseUrl = "",
    legacyPortalLink = "",
    portalRedirectPath = "",
    metadata = {},
  }: {
    email: unknown;
    clientRole?: unknown;
    transactionId?: unknown;
    appBaseUrl?: string;
    legacyPortalLink?: string;
    portalRedirectPath?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeClientRole(clientRole);
  const normalizedTransactionId = normalizeUuidText(transactionId);
  const baseUrl = resolveBaseUrl(appBaseUrl, legacyPortalLink);
  if (!supabase || !normalizedEmail || !baseUrl) {
    return { ok: false, reason: "missing_invite_context", inviteLink: "", legacyPortalLink };
  }

  const redirectPath = resolvePortalRedirectPath(legacyPortalLink, portalRedirectPath);
  const listingId = normalizeText(metadata.listing_id || metadata.listingId);
  const inviteMetadata = {
    source: normalizedRole === "seller" ? "seller_portal_activation" : "client_onboarding_submitted",
    client_role: normalizedRole,
    portal_redirect_path: redirectPath || null,
    legacy_portal_link: normalizeText(legacyPortalLink) || null,
    ...metadata,
  };

  let query = supabase
    .from("invites")
    .select("id, token, invite_type, status, metadata, created_at")
    .eq("invite_type", CLIENT_INVITE_TYPE)
    .eq("status", "pending")
    .eq("email", normalizedEmail)
    .eq("target_transaction_role", normalizedRole)
    .order("created_at", { ascending: false })
    .limit(1);

  query = normalizedTransactionId
    ? query.eq("target_transaction_id", normalizedTransactionId)
    : query.is("target_transaction_id", null);
  if (!normalizedTransactionId && listingId) {
    query = query.contains("metadata", { listing_id: listingId });
  }

  const existing = await query.maybeSingle();
  if (!existing.error && existing.data?.token) {
    const existingMetadata = existing.data.metadata && typeof existing.data.metadata === "object"
      ? existing.data.metadata
      : {};
    await supabase
      .from("invites")
      .update({
        metadata: {
          ...existingMetadata,
          ...inviteMetadata,
          canonical_invite_reused_at: new Date().toISOString(),
        },
      })
      .eq("id", existing.data.id);
    return {
      ok: true,
      reused: true,
      inviteId: existing.data.id,
      token: existing.data.token,
      inviteLink: `${baseUrl}/invite/${existing.data.token}`,
      legacyPortalLink,
    };
  }

  const insertPayload: Record<string, unknown> = {
    invite_type: CLIENT_INVITE_TYPE,
    status: "pending",
    target_transaction_role: normalizedRole,
    email: normalizedEmail,
    metadata: inviteMetadata,
  };
  if (normalizedTransactionId) insertPayload.target_transaction_id = normalizedTransactionId;

  const created = await supabase
    .from("invites")
    .insert(insertPayload)
    .select("id, token, invite_type, status")
    .single();

  if (created.error || !created.data?.token) {
    return {
      ok: false,
      reason: created.error?.message || "canonical_client_invite_create_failed",
      inviteLink: "",
      legacyPortalLink,
    };
  }

  return {
    ok: true,
    reused: false,
    inviteId: created.data.id,
    token: created.data.token,
    inviteLink: `${baseUrl}/invite/${created.data.token}`,
    legacyPortalLink,
  };
}
