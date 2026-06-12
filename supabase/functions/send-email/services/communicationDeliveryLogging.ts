import { createClient } from "supabase";
import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { normalizeText } from "../utils/text.ts";

type DeliveryContext = {
  organisationId?: string;
  branchId?: string;
  assignedUserId?: string;
  leadId?: string;
  listingId?: string;
  transactionId?: string;
  offerId?: string;
  appointmentId?: string;
  portalSessionId?: string;
  sellerReviewSessionId?: string;
  recipientRole?: string;
  metadata?: Record<string, unknown>;
};

type PrepareEmailDeliveryInput = {
  communicationType: string;
  recipient: string;
  subject?: string;
  messagePreview?: string;
  recipientRole?: string;
  context?: DeliveryContext | null;
};

function normalizeUuid(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function clipPreview(value: unknown, limit = 320) {
  const normalized = normalizeText(value);
  return normalized.length > limit
    ? `${normalized.slice(0, Math.max(limit - 1, 1))}...`
    : normalized;
}

function safeJsonRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function coalesceText(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function parseTokenFromLink(input: unknown) {
  const raw = normalizeText(input);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    return normalizeText(parts[parts.length - 1]);
  } catch {
    const parts = raw.split("/").filter(Boolean);
    return normalizeText(parts[parts.length - 1]);
  }
}

function createServiceRoleClient() {
  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function safeInsertCommunicationDelivery(
  supabase: any,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("communication_deliveries")
    .insert(payload)
    .select("id, status, created_at")
    .single();

  if (error) {
    const missingSupport =
      isMissingSchemaError(error) ||
      isMissingTableError(error, "communication_deliveries") ||
      isMissingColumnError(error);
    if (!missingSupport) {
      console.error("[send-email] communication delivery insert failed", error);
    }
    return null;
  }

  return data || null;
}

async function safeUpdateCommunicationDelivery(
  supabase: any,
  deliveryId: string,
  patch: Record<string, unknown>,
) {
  if (!deliveryId) return null;
  const { data, error } = await supabase
    .from("communication_deliveries")
    .update(patch)
    .eq("id", deliveryId)
    .select("id, status, updated_at")
    .single();

  if (error) {
    const missingSupport =
      isMissingSchemaError(error) ||
      isMissingTableError(error, "communication_deliveries") ||
      isMissingColumnError(error);
    if (!missingSupport) {
      console.error("[send-email] communication delivery update failed", error);
    }
    return null;
  }

  return data || null;
}

async function resolveTransactionCommunicationContext(
  supabase: any,
  transactionId: string,
): Promise<DeliveryContext | null> {
  const normalizedTransactionId = normalizeUuid(transactionId);
  if (!normalizedTransactionId) return null;

  const query = await supabase
    .from("transactions")
    .select("id, organisation_id, listing_id, accepted_offer_id, originating_buyer_lead_id")
    .eq("id", normalizedTransactionId)
    .maybeSingle();

  if (query.error) {
    const missingSupport =
      isMissingSchemaError(query.error) ||
      isMissingTableError(query.error, "transactions") ||
      isMissingColumnError(query.error);
    if (!missingSupport) {
      console.error("[send-email] transaction delivery context lookup failed", query.error);
    }
    return null;
  }

  if (!query.data) return null;

  return {
    organisationId: normalizeUuid(query.data.organisation_id),
    leadId: normalizeUuid(query.data.originating_buyer_lead_id),
    listingId: normalizeUuid(query.data.listing_id),
    transactionId: normalizeUuid(query.data.id),
    offerId: normalizeUuid(query.data.accepted_offer_id),
  };
}

async function resolveBranchIdForContext(
  supabase: any,
  context: DeliveryContext = {},
) {
  const leadId = normalizeUuid(context.leadId);
  if (leadId) {
    const leadQuery = await supabase
      .from("leads")
      .select("branch_id")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!leadQuery.error && leadQuery.data?.branch_id) {
      return normalizeUuid(leadQuery.data.branch_id);
    }
  }

  const listingId = normalizeUuid(context.listingId);
  if (listingId) {
    const listingQuery = await supabase
      .from("private_listings")
      .select("branch_id")
      .eq("id", listingId)
      .maybeSingle();
    if (!listingQuery.error && listingQuery.data?.branch_id) {
      return normalizeUuid(listingQuery.data.branch_id);
    }
  }

  return "";
}

async function resolveAssignedUserIdForContext(
  supabase: any,
  context: DeliveryContext = {},
) {
  const leadId = normalizeUuid(context.leadId);
  if (leadId) {
    const leadQuery = await supabase
      .from("leads")
      .select("assigned_user_id")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!leadQuery.error && leadQuery.data?.assigned_user_id) {
      return normalizeUuid(leadQuery.data.assigned_user_id);
    }
  }

  const listingId = normalizeUuid(context.listingId);
  if (listingId) {
    const listingQuery = await supabase
      .from("private_listings")
      .select("assigned_agent_id")
      .eq("id", listingId)
      .maybeSingle();
    if (!listingQuery.error && listingQuery.data?.assigned_agent_id) {
      return normalizeUuid(listingQuery.data.assigned_agent_id);
    }
  }

  return "";
}

async function resolveOfferPortalCommunicationContext(
  supabase: any,
  link: string,
): Promise<DeliveryContext | null> {
  const token = parseTokenFromLink(link);
  if (!token) return null;

  const query = await supabase
    .from("offer_portal_sessions")
    .select("id, organisation_id, buyer_lead_id, appointment_id")
    .eq("token", token)
    .maybeSingle();

  if (query.error) {
    const missingSupport =
      isMissingSchemaError(query.error) ||
      isMissingTableError(query.error, "offer_portal_sessions") ||
      isMissingColumnError(query.error);
    if (!missingSupport) {
      console.error("[send-email] offer portal delivery context lookup failed", query.error);
    }
    return null;
  }

  if (!query.data) return null;

  return {
    organisationId: normalizeUuid(query.data.organisation_id),
    leadId: normalizeUuid(query.data.buyer_lead_id),
    appointmentId: normalizeUuid(query.data.appointment_id),
    portalSessionId: normalizeUuid(query.data.id),
    metadata: { offerPortalToken: token },
  };
}

async function resolveSellerReviewCommunicationContext(
  supabase: any,
  link: string,
): Promise<DeliveryContext | null> {
  const token = parseTokenFromLink(link);
  if (!token) return null;

  const sessionQuery = await supabase
    .from("offer_seller_review_sessions")
    .select("id, organisation_id, offer_id, listing_id")
    .eq("token", token)
    .maybeSingle();

  if (sessionQuery.error) {
    const missingSupport =
      isMissingSchemaError(sessionQuery.error) ||
      isMissingTableError(sessionQuery.error, "offer_seller_review_sessions") ||
      isMissingColumnError(sessionQuery.error);
    if (!missingSupport) {
      console.error("[send-email] seller review delivery session lookup failed", sessionQuery.error);
    }
    return null;
  }

  if (!sessionQuery.data) return null;

  const offerId = normalizeUuid(sessionQuery.data.offer_id);
  let offerLeadId = "";
  let transactionId = "";
  if (offerId) {
    const offerQuery = await supabase
      .from("offers")
      .select("id, buyer_lead_id, transaction_id")
      .eq("id", offerId)
      .maybeSingle();
    if (!offerQuery.error && offerQuery.data) {
      offerLeadId = normalizeUuid(offerQuery.data.buyer_lead_id);
      transactionId = normalizeUuid(offerQuery.data.transaction_id);
    }
  }

  return {
    organisationId: normalizeUuid(sessionQuery.data.organisation_id),
    leadId: offerLeadId,
    listingId: normalizeUuid(sessionQuery.data.listing_id),
    offerId,
    transactionId,
    sellerReviewSessionId: normalizeUuid(sessionQuery.data.id),
    metadata: { sellerReviewToken: token },
  };
}

async function resolveEmailDeliveryContext(
  supabase: any,
  communicationType: string,
  payload: Record<string, unknown>,
): Promise<DeliveryContext | null> {
  const explicitContext: DeliveryContext = {
    organisationId: normalizeUuid(payload.organisationId || payload.organisation_id),
    leadId: normalizeUuid(payload.leadId || payload.lead_id),
    listingId: normalizeUuid(payload.listingId || payload.listing_id),
    transactionId: normalizeUuid(payload.transactionId || payload.transaction_id),
    offerId: normalizeUuid(payload.offerId || payload.offer_id),
    appointmentId: normalizeUuid(payload.appointmentId || payload.appointment_id),
    portalSessionId: normalizeUuid(payload.portalSessionId || payload.portal_session_id),
    sellerReviewSessionId: normalizeUuid(payload.sellerReviewSessionId || payload.seller_review_session_id),
    recipientRole: normalizeText(payload.recipientRole || payload.recipient_role).toLowerCase(),
    metadata: safeJsonRecord(payload.deliveryMetadata || payload.delivery_metadata),
  };

  if (explicitContext.transactionId && !explicitContext.organisationId) {
    const transactionContext = await resolveTransactionCommunicationContext(
      supabase,
      explicitContext.transactionId,
    );
    if (transactionContext) {
      return {
        ...transactionContext,
        ...explicitContext,
        organisationId: explicitContext.organisationId || transactionContext.organisationId,
        leadId: explicitContext.leadId || transactionContext.leadId,
        listingId: explicitContext.listingId || transactionContext.listingId,
        offerId: explicitContext.offerId || transactionContext.offerId,
        metadata: {
          ...(transactionContext.metadata || {}),
          ...(explicitContext.metadata || {}),
        },
      };
    }
  }

  if (
    ["buyer_offer_link", "offer_link", "post_viewing_offer_link"].includes(
      communicationType,
    )
  ) {
    const portalContext = await resolveOfferPortalCommunicationContext(
      supabase,
      normalizeText(payload.offerLink || payload.offer_link),
    );
    if (portalContext) {
      return {
        ...portalContext,
        ...explicitContext,
        organisationId: explicitContext.organisationId || portalContext.organisationId,
        leadId: explicitContext.leadId || portalContext.leadId,
        appointmentId: explicitContext.appointmentId || portalContext.appointmentId,
        portalSessionId: explicitContext.portalSessionId || portalContext.portalSessionId,
        metadata: {
          ...(portalContext.metadata || {}),
          ...(explicitContext.metadata || {}),
        },
      };
    }
  }

  if (
    ["seller_offer_review", "offer_seller_review"].includes(communicationType)
  ) {
    const sellerContext = await resolveSellerReviewCommunicationContext(
      supabase,
      normalizeText(payload.reviewLink || payload.review_link),
    );
    if (sellerContext) {
      return {
        ...sellerContext,
        ...explicitContext,
        organisationId: explicitContext.organisationId || sellerContext.organisationId,
        leadId: explicitContext.leadId || sellerContext.leadId,
        listingId: explicitContext.listingId || sellerContext.listingId,
        offerId: explicitContext.offerId || sellerContext.offerId,
        transactionId: explicitContext.transactionId || sellerContext.transactionId,
        sellerReviewSessionId:
          explicitContext.sellerReviewSessionId ||
          sellerContext.sellerReviewSessionId,
        metadata: {
          ...(sellerContext.metadata || {}),
          ...(explicitContext.metadata || {}),
        },
      };
    }
  }

  if (
    explicitContext.organisationId &&
    (explicitContext.leadId ||
      explicitContext.listingId ||
      explicitContext.transactionId ||
      explicitContext.offerId)
  ) {
    return explicitContext;
  }

  return explicitContext.organisationId ? explicitContext : null;
}

export async function prepareEmailDelivery(
  payload: Record<string, unknown>,
  {
    communicationType,
    recipient,
    subject = "",
    messagePreview = "",
    recipientRole = "",
    context = null,
  }: PrepareEmailDeliveryInput,
) {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const derivedContext = await resolveEmailDeliveryContext(
    supabase,
    communicationType,
    payload,
  );
  const resolvedContext = {
    organisationId: coalesceText(context?.organisationId, derivedContext?.organisationId),
    branchId: coalesceText(context?.branchId, derivedContext?.branchId),
    assignedUserId: coalesceText(context?.assignedUserId, derivedContext?.assignedUserId),
    leadId: coalesceText(context?.leadId, derivedContext?.leadId),
    listingId: coalesceText(context?.listingId, derivedContext?.listingId),
    transactionId: coalesceText(context?.transactionId, derivedContext?.transactionId),
    offerId: coalesceText(context?.offerId, derivedContext?.offerId),
    appointmentId: coalesceText(context?.appointmentId, derivedContext?.appointmentId),
    portalSessionId: coalesceText(context?.portalSessionId, derivedContext?.portalSessionId),
    sellerReviewSessionId: coalesceText(
      context?.sellerReviewSessionId,
      derivedContext?.sellerReviewSessionId,
    ),
    recipientRole: coalesceText(context?.recipientRole, derivedContext?.recipientRole),
    metadata: {
      ...(safeJsonRecord(derivedContext?.metadata)),
      ...(safeJsonRecord(context?.metadata)),
    },
  };
  const organisationId = normalizeUuid(resolvedContext?.organisationId);
  if (!organisationId) return null;
  const branchId = normalizeUuid(resolvedContext?.branchId) ||
    await resolveBranchIdForContext(supabase, resolvedContext);
  const assignedUserId = normalizeUuid(resolvedContext?.assignedUserId) ||
    await resolveAssignedUserIdForContext(supabase, resolvedContext);

  const insertPayload: Record<string, unknown> = {
    organisation_id: organisationId,
    branch_id: branchId || null,
    lead_id: normalizeUuid(resolvedContext?.leadId) || null,
    listing_id: normalizeUuid(resolvedContext?.listingId) || null,
    transaction_id: normalizeUuid(resolvedContext?.transactionId) || null,
    offer_id: normalizeUuid(resolvedContext?.offerId) || null,
    appointment_id: normalizeUuid(resolvedContext?.appointmentId) || null,
    portal_session_id: normalizeUuid(resolvedContext?.portalSessionId) || null,
    seller_review_session_id:
      normalizeUuid(resolvedContext?.sellerReviewSessionId) || null,
    communication_type: communicationType,
    channel: "email",
    recipient: normalizeText(recipient).toLowerCase(),
    recipient_role: normalizeText(
      recipientRole || resolvedContext?.recipientRole,
    ).toLowerCase() || null,
    subject: normalizeText(subject) || null,
    message_preview: clipPreview(messagePreview) || null,
    status: "prepared",
    provider: "resend",
    prepared_by: assignedUserId || null,
    sent_by: assignedUserId || null,
    metadata_json: {
      source: "send-email",
      communicationType,
      ...(safeJsonRecord(resolvedContext?.metadata)),
    },
  };

  return await safeInsertCommunicationDelivery(supabase, insertPayload);
}

export async function markEmailDeliverySent(
  deliveryId: string,
  {
    emailId = "",
  }: {
    emailId?: string | null;
  } = {},
) {
  const supabase = createServiceRoleClient();
  if (!supabase || !deliveryId) return null;
  return await safeUpdateCommunicationDelivery(supabase, deliveryId, {
    status: "sent",
    provider_message_id: normalizeText(emailId) || null,
    sent_at: new Date().toISOString(),
  });
}

export async function markEmailDeliveryFailed(
  deliveryId: string,
  {
    errorMessage = "",
  }: {
    errorMessage?: string | null;
  } = {},
) {
  const supabase = createServiceRoleClient();
  if (!supabase || !deliveryId) return null;
  return await safeUpdateCommunicationDelivery(supabase, deliveryId, {
    status: "failed",
    error_message: normalizeText(errorMessage) || null,
    failed_at: new Date().toISOString(),
  });
}
