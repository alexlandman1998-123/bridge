import { createClient } from "supabase";
import {
  buildOnboardingEmailHtml,
  buildOnboardingEmailText,
  buildOnboardingSubject,
} from "../content/onboarding.ts";
import {
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  prepareEmailDelivery,
} from "../services/communicationDeliveryLogging.ts";
import {
  formatEmailSender,
  resolveEmailBranding,
} from "../services/emailBranding.ts";
import { fetchOrganisationEmailTemplateOverride } from "../services/emailTemplateSettings.ts";
import { logOnboardingEmailSideEffects } from "../services/onboardingLogging.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type {
  SendClientOnboardingPayload,
  TransactionOnboardingRow,
} from "../types.ts";
import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText, pickMostRecentOnboardingRow } from "../utils/text.ts";
import { resolveAppBaseUrl } from "../utils/url.ts";

type BuyerParticipantTarget = {
  id?: string | null;
  buyer_party_id?: string | null;
  participant_name?: string | null;
  participant_email?: string | null;
  is_primary_buyer?: boolean | null;
  buyer_metadata?: Record<string, unknown> | null;
};

const BUYER_TARGETED_ONBOARDING_LINK_VERSION =
  "transaction_buyer_link_phase6_v1";

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function payloadBuyerTarget(payload: SendClientOnboardingPayload) {
  const participantId = normalizeText(payload.buyerParticipantId);
  const buyerPartyId = normalizeText(payload.buyerPartyId);
  const email = normalizeEmail(payload.buyerEmail);
  const name = normalizeText(payload.buyerName);
  return {
    participantId,
    buyerPartyId,
    email,
    name,
    hasTarget: Boolean(participantId || buyerPartyId || email),
  };
}

function matchesBuyerTarget(
  row: BuyerParticipantTarget,
  target: ReturnType<typeof payloadBuyerTarget>,
) {
  return Boolean(
    (target.participantId && normalizeText(row.id) === target.participantId) ||
      (target.buyerPartyId &&
        normalizeText(row.buyer_party_id) === target.buyerPartyId) ||
      (target.email &&
        normalizeEmail(row.participant_email) === target.email),
  );
}

async function loadBuyerParticipantTarget(
  supabase: any,
  transactionId: string,
  target: ReturnType<typeof payloadBuyerTarget>,
) {
  let participantQuery = await supabase
    .from("transaction_participants")
    .select(
      "id, buyer_party_id, participant_name, participant_email, is_primary_buyer, buyer_metadata, role_type, transaction_role, status",
    )
    .eq("transaction_id", transactionId)
    .or("role_type.eq.buyer,role_type.eq.client,transaction_role.eq.buyer");

  if (
    participantQuery.error &&
    (
      isMissingTableError(participantQuery.error, "transaction_participants") ||
      isMissingColumnError(participantQuery.error, "buyer_party_id") ||
      isMissingColumnError(participantQuery.error, "buyer_metadata") ||
      isMissingColumnError(participantQuery.error, "transaction_role") ||
      isMissingColumnError(participantQuery.error, "is_primary_buyer")
    )
  ) {
    participantQuery = await supabase
      .from("transaction_participants")
      .select("id, participant_name, participant_email, role_type, status")
      .eq("transaction_id", transactionId)
      .in("role_type", ["buyer", "client"]);
  }

  if (
    participantQuery.error &&
    (
      isMissingTableError(participantQuery.error, "transaction_participants") ||
      isMissingSchemaError(participantQuery.error)
    )
  ) {
    return { participant: null, missingTable: true };
  }

  if (participantQuery.error) {
    throw participantQuery.error;
  }

  const rows = Array.isArray(participantQuery.data)
    ? participantQuery.data as BuyerParticipantTarget[]
    : [];
  const activeRows = rows.filter((row) =>
    !["inactive", "removed", "archived", "deleted"].includes(
      normalizeText((row as Record<string, unknown>).status).toLowerCase(),
    )
  );
  const candidateRows = activeRows.length ? activeRows : rows;
  const participant = target.hasTarget
    ? candidateRows.find((row) => matchesBuyerTarget(row, target)) || null
    : candidateRows.find((row) => row.is_primary_buyer === true) ||
      candidateRows[0] ||
      null;

  return { participant, missingTable: false };
}

function buildBuyerTargetedOnboardingUrl(
  appBaseUrl: string,
  token: string,
  {
    participant,
    targetNonce = "",
    deliveryAction = "",
  }: {
    participant: BuyerParticipantTarget | null;
    targetNonce?: string;
    deliveryAction?: string;
  },
) {
  const baseUrl = `${appBaseUrl}/client/onboarding/${token}`;
  const participantId = normalizeText(participant?.id);
  const buyerPartyId = normalizeText(participant?.buyer_party_id);
  const params = new URLSearchParams();

  if (participantId) {
    params.set("buyerParticipantId", participantId);
    params.set("buyerTargetId", participantId);
  }
  if (buyerPartyId) {
    params.set("buyerPartyId", buyerPartyId);
  }
  if (targetNonce) {
    params.set("buyerTargetNonce", targetNonce);
  }
  if (deliveryAction) {
    params.set("buyerDeliveryAction", deliveryAction);
  }
  if (participantId || buyerPartyId || targetNonce || deliveryAction) {
    params.set("buyerTargetVersion", BUYER_TARGETED_ONBOARDING_LINK_VERSION);
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

async function persistBuyerOnboardingLinkTarget(
  supabase: any,
  {
    participant,
    transactionId,
    targetNonce,
    nowIso,
  }: {
    participant: BuyerParticipantTarget | null;
    transactionId: string;
    targetNonce: string;
    nowIso: string;
  },
) {
  if (!participant?.id || !targetNonce) return;
  const metadata = participant.buyer_metadata &&
      typeof participant.buyer_metadata === "object" &&
      !Array.isArray(participant.buyer_metadata)
    ? participant.buyer_metadata
    : {};
  const update = await supabase
    .from("transaction_participants")
    .update({
      buyer_metadata: {
        ...metadata,
        buyerOnboardingLinkVersion: BUYER_TARGETED_ONBOARDING_LINK_VERSION,
        lastBuyerOnboardingLinkNonce: targetNonce,
        lastBuyerOnboardingLinkTargetId: participant.id,
        lastBuyerOnboardingLinkGeneratedAt: nowIso,
      },
      updated_at: nowIso,
    })
    .eq("transaction_id", transactionId)
    .eq("id", participant.id);

  if (
    update.error &&
    !isMissingTableError(update.error, "transaction_participants") &&
    !isMissingColumnError(update.error, "buyer_metadata") &&
    !isMissingColumnError(update.error, "updated_at")
  ) {
    throw update.error;
  }
}

async function markBuyerParticipantDelivery(
  supabase: any,
  {
    participant,
    transactionId,
    payload,
    nowIso,
    targetNonce = "",
  }: {
    participant: BuyerParticipantTarget | null;
    transactionId: string;
    payload: SendClientOnboardingPayload;
    nowIso: string;
    targetNonce?: string;
  },
) {
  if (!participant?.id) return;

  const action = normalizeText(payload.buyerDeliveryAction);
  const isPortalSend = action === "send_portal_link" ||
    normalizeText(payload.source).toLowerCase().includes("client_portal");
  const existingMetadata = participant.buyer_metadata &&
      typeof participant.buyer_metadata === "object" &&
      !Array.isArray(participant.buyer_metadata)
    ? participant.buyer_metadata
    : {};
  const buyerMetadata = {
    ...existingMetadata,
    buyerOnboardingLinkVersion: BUYER_TARGETED_ONBOARDING_LINK_VERSION,
    ...(targetNonce
      ? {
        lastBuyerOnboardingLinkNonce: targetNonce,
        lastBuyerOnboardingLinkTargetId: participant.id,
        lastBuyerOnboardingLinkGeneratedAt: nowIso,
      }
      : {}),
  };
  let patch = isPortalSend
    ? {
      buyer_portal_invite_status: "sent",
      buyer_portal_invited_at: nowIso,
      buyer_portal_last_sent_at: nowIso,
      buyer_metadata: buyerMetadata,
      updated_at: nowIso,
    }
    : {
      buyer_profile_status: "invited",
      buyer_onboarding_status: "sent",
      buyer_metadata: buyerMetadata,
      updated_at: nowIso,
    };

  let update = await supabase
    .from("transaction_participants")
    .update(patch)
    .eq("transaction_id", transactionId)
    .eq("id", participant.id);

  if (update.error && isMissingColumnError(update.error, "buyer_metadata")) {
    patch = { ...patch };
    delete (patch as Record<string, unknown>).buyer_metadata;
    update = await supabase
      .from("transaction_participants")
      .update(patch)
      .eq("transaction_id", transactionId)
      .eq("id", participant.id);
  }

  if (
    update.error &&
    !isMissingTableError(update.error, "transaction_participants") &&
    !isMissingColumnError(update.error, "buyer_portal_invite_status") &&
    !isMissingColumnError(update.error, "buyer_portal_invited_at") &&
    !isMissingColumnError(update.error, "buyer_portal_last_sent_at") &&
    !isMissingColumnError(update.error, "buyer_profile_status") &&
    !isMissingColumnError(update.error, "buyer_onboarding_status") &&
    !isMissingColumnError(update.error, "buyer_metadata") &&
    !isMissingColumnError(update.error, "updated_at")
  ) {
    throw update.error;
  }
}

export async function handleClientOnboardingEmail(
  req: Request,
  payload: SendClientOnboardingPayload,
) {
  const transactionId = normalizeText(payload.transactionId);
  if (!transactionId) {
    return jsonResponse(400, {
      error: "Missing required field: transactionId",
    });
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
    });
  }

  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const appBaseUrl = resolveAppBaseUrl(req);
  if (!appBaseUrl) {
    return jsonResponse(500, {
      error:
        "Unable to resolve app URL. Set CLIENT_APP_URL (or PUBLIC_APP_URL) in function secrets.",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const onboardingSource = normalizeText(payload.source).toLowerCase();
  const acceptedOfferOnboarding = onboardingSource.includes("accepted_offer") ||
    onboardingSource === "seller_accepted_offer";

  console.log("Loading transaction", transactionId);

  let transactionQuery = await supabase
    .from("transactions")
    .select(
      "id, buyer_id, development_id, unit_id, listing_id, transaction_reference, purchase_price, sales_price, purchaser_type, organisation_id, assigned_agent, assigned_agent_email, accepted_offer_id, originating_buyer_lead_id",
    )
    .eq("id", transactionId)
    .maybeSingle();

  if (
    transactionQuery.error &&
    (
      isMissingColumnError(transactionQuery.error, "listing_id") ||
      isMissingColumnError(transactionQuery.error, "organisation_id") ||
      isMissingColumnError(transactionQuery.error, "accepted_offer_id") ||
      isMissingColumnError(
        transactionQuery.error,
        "originating_buyer_lead_id",
      ) ||
      isMissingColumnError(transactionQuery.error, "assigned_agent") ||
      isMissingColumnError(transactionQuery.error, "assigned_agent_email")
    )
  ) {
    transactionQuery = await supabase
      .from("transactions")
      .select(
        "id, buyer_id, development_id, unit_id, listing_id, transaction_reference, purchase_price, sales_price, purchaser_type, accepted_offer_id, originating_buyer_lead_id",
      )
      .eq("id", transactionId)
      .maybeSingle();
  }

  if (transactionQuery.error) {
    console.error("Transaction query failed", transactionQuery.error);
    return jsonResponse(500, {
      error: transactionQuery.error.message || "Failed to load transaction.",
      code: transactionQuery.error.code || null,
    });
  }

  const transaction = transactionQuery.data;
  if (!transaction) {
    return jsonResponse(404, { error: "Transaction not found." });
  }

  const defaultOrganisationName =
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
  const defaultSupportEmail =
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL")) ||
    "";
  const defaultSupportPhone =
    normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE")) ||
    "";
  const transactionData = transaction as Record<string, unknown>;
  const organisationId = normalizeText(transactionData?.organisation_id);
  const assignedAgentName = normalizeText(transactionData?.assigned_agent);
  const assignedAgentEmail = normalizeText(
    transactionData?.assigned_agent_email,
  );
  const agentName = assignedAgentName || assignedAgentEmail;
  const requestedBuyerTarget = payloadBuyerTarget(payload);

  let organisationName = defaultOrganisationName;
  let supportEmail = defaultSupportEmail;
  let supportPhone = defaultSupportPhone;
  let templateOverrides = null;

  if (organisationId) {
    const organisationQuery = await supabase
      .from("organisations")
      .select(
        "id, name, display_name, support_email, support_phone, company_email, company_phone",
      )
      .eq("id", organisationId)
      .maybeSingle();

    if (
      !organisationQuery.error ||
      isMissingTableError(organisationQuery.error, "organisations") ||
      isMissingSchemaError(organisationQuery.error)
    ) {
      organisationName = normalizeText(organisationQuery.data?.display_name) ||
        normalizeText(organisationQuery.data?.name) ||
        organisationName;
      supportEmail = normalizeText(organisationQuery.data?.support_email) ||
        normalizeText(organisationQuery.data?.company_email) ||
        supportEmail;
      supportPhone = normalizeText(organisationQuery.data?.support_phone) ||
        normalizeText(organisationQuery.data?.company_phone) ||
        supportPhone;
    }

    templateOverrides = await fetchOrganisationEmailTemplateOverride(
      supabase,
      organisationId,
      acceptedOfferOnboarding
        ? "client_onboarding_accepted_offer"
        : "client_onboarding",
    );
  }

  console.log("Loading onboarding row");

  const onboardingQuery = await supabase
    .from("transaction_onboarding")
    .select(
      "id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at",
    )
    .eq("transaction_id", transaction.id)
    .eq("is_active", true);

  if (onboardingQuery.error) {
    console.error("Onboarding query failed", onboardingQuery.error);
    return jsonResponse(500, {
      error: onboardingQuery.error.message ||
        "Failed to load onboarding record.",
      code: onboardingQuery.error.code || null,
    });
  }

  const onboardingRows = Array.isArray(onboardingQuery.data)
    ? (onboardingQuery.data as TransactionOnboardingRow[])
    : [];
  let onboarding = pickMostRecentOnboardingRow(onboardingRows);

  if (!onboarding) {
    console.log("No onboarding row found, creating one");

    const insertResult = await supabase
      .from("transaction_onboarding")
      .insert({
        transaction_id: transaction.id,
        token: `onb_${crypto.randomUUID().replaceAll("-", "")}`,
        status: "Not Started",
        purchaser_type: transaction.purchaser_type || "individual",
        is_active: true,
      })
      .select(
        "id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at",
      )
      .single();

    if (insertResult.error) {
      console.error("Onboarding insert failed", insertResult.error);
      return jsonResponse(500, {
        error: insertResult.error.message ||
          "Failed to create onboarding record.",
        code: insertResult.error.code || null,
      });
    }

    onboarding = insertResult.data;
  }
  const resolvedOnboarding = onboarding as TransactionOnboardingRow;

  let buyerName = "Client";
  let buyerEmail = "";
  let buyerParticipant: BuyerParticipantTarget | null = null;

  try {
    const participantTarget = await loadBuyerParticipantTarget(
      supabase,
      transaction.id,
      requestedBuyerTarget,
    );
    buyerParticipant = participantTarget.participant;
  } catch (error) {
    console.error("Buyer participant query failed", error);
    return jsonResponse(500, {
      error: (error as { message?: string })?.message ||
        "Failed to load buyer participant record.",
      code: (error as { code?: string })?.code || null,
    });
  }

  if (requestedBuyerTarget.hasTarget && !buyerParticipant) {
    return jsonResponse(404, {
      error:
        "Buyer recipient was not found on this transaction. Refresh the transaction and try again.",
      buyerTarget: {
        participantId: requestedBuyerTarget.participantId || null,
        buyerPartyId: requestedBuyerTarget.buyerPartyId || null,
        email: requestedBuyerTarget.email || null,
      },
    });
  }

  if (buyerParticipant) {
    buyerName = normalizeText(buyerParticipant.participant_name) ||
      requestedBuyerTarget.name ||
      buyerName;
    buyerEmail = normalizeEmail(buyerParticipant.participant_email) ||
      requestedBuyerTarget.email;
  }

  if (!buyerEmail && transaction.buyer_id) {
    console.log("Loading buyer", transaction.buyer_id);

    const buyerQuery = await supabase
      .from("buyers")
      .select("id, name, email")
      .eq("id", transaction.buyer_id)
      .maybeSingle();

    if (buyerQuery.error) {
      console.error("Buyer query failed", buyerQuery.error);
      return jsonResponse(500, {
        error: buyerQuery.error.message || "Failed to load buyer record.",
        code: buyerQuery.error.code || null,
      });
    }

    buyerName = normalizeText(buyerQuery.data?.name) || buyerName;
    buyerEmail = normalizeText(buyerQuery.data?.email).toLowerCase();
  }

  buyerName = requestedBuyerTarget.name || buyerName;
  if (!buyerParticipant) {
    buyerEmail = requestedBuyerTarget.email || buyerEmail;
  }

  let persistedDeliveryMode = "";
  const onboardingFormDataQuery = await supabase
    .from("onboarding_form_data")
    .select("form_data")
    .eq("transaction_id", transaction.id)
    .maybeSingle();

  if (
    !onboardingFormDataQuery.error ||
    isMissingTableError(onboardingFormDataQuery.error, "onboarding_form_data")
  ) {
    const formData = onboardingFormDataQuery.data?.form_data;
    if (formData && typeof formData === "object" && !Array.isArray(formData)) {
      persistedDeliveryMode = normalizeText(
        formData.bridge_client_intake_preference || formData.deliveryMode,
      ).toLowerCase();
    }
  }

  const requestedDeliveryMode = normalizeText(payload.deliveryMode)
    .toLowerCase();
  const deliveryMode = requestedDeliveryMode || persistedDeliveryMode ||
    "digital_portal";
  const manualHandoff = payload.skipEmail === true ||
    ["agent_assisted", "hard_copy"].includes(deliveryMode);

  const nextOnboardingStatus = resolvedOnboarding.status === "Not Started"
    ? "In Progress"
    : resolvedOnboarding.status;
  const buyerDeliveryAction = normalizeText(payload.buyerDeliveryAction);
  const buyerTargetNonce = buyerParticipant?.id
    ? crypto.randomUUID().replaceAll("-", "")
    : "";
  const onboardingUrl = buildBuyerTargetedOnboardingUrl(
    appBaseUrl,
    resolvedOnboarding.token,
    {
      participant: buyerParticipant,
      targetNonce: buyerTargetNonce,
      deliveryAction: buyerDeliveryAction,
    },
  );

  try {
    await persistBuyerOnboardingLinkTarget(supabase, {
      participant: buyerParticipant,
      transactionId: transaction.id,
      targetNonce: buyerTargetNonce,
      nowIso,
    });
  } catch (error) {
    console.error("Buyer targeted onboarding link metadata update failed", error);
    return jsonResponse(500, {
      error: (error as { message?: string })?.message ||
        "Failed to prepare buyer-targeted onboarding link.",
      code: (error as { code?: string })?.code || null,
    });
  }

  if (manualHandoff) {
    const onboardingUpdate = await supabase
      .from("transaction_onboarding")
      .update({
        status: nextOnboardingStatus,
        updated_at: nowIso,
      })
      .eq("id", resolvedOnboarding.id);

    if (onboardingUpdate.error) {
      console.error("Onboarding update failed", onboardingUpdate.error);
      return jsonResponse(500, {
        error: onboardingUpdate.error.message ||
          "Failed to update onboarding status after manual handoff.",
        code: onboardingUpdate.error.code || null,
      });
    }

    try {
      await markBuyerParticipantDelivery(supabase, {
        participant: buyerParticipant,
        transactionId: transaction.id,
        payload,
        nowIso,
        targetNonce: buyerTargetNonce,
      });
    } catch (error) {
      console.error("Buyer participant delivery update failed", error);
      return jsonResponse(500, {
        error: (error as { message?: string })?.message ||
          "Failed to update buyer delivery status after manual handoff.",
        code: (error as { code?: string })?.code || null,
      });
    }

    return jsonResponse(200, {
      ok: true,
      type: "client_onboarding",
      transactionId: transaction.id,
      buyerParticipantId: normalizeText(buyerParticipant?.id) || null,
      buyerPartyId: normalizeText(buyerParticipant?.buyer_party_id) || null,
      recipientEmail: buyerEmail,
      onboardingUrl,
      onboardingStatus: nextOnboardingStatus,
      deliveryMode,
      manualHandoff: true,
      emailSkipped: true,
    });
  }

  if (!buyerEmail) {
    return jsonResponse(400, {
      error:
        "Buyer email is missing. Capture buyer email before sending onboarding.",
    });
  }

  let developmentName = "";
  if (transaction.development_id) {
    const developmentQuery = await supabase
      .from("developments")
      .select("id, name")
      .eq("id", transaction.development_id)
      .maybeSingle();

    if (!developmentQuery.error) {
      developmentName = normalizeText(developmentQuery.data?.name);
    }
  }

  let unitLabel = "";
  if (transaction.unit_id) {
    const unitQuery = await supabase
      .from("units")
      .select("id, unit_number")
      .eq("id", transaction.unit_id)
      .maybeSingle();

    if (!unitQuery.error && unitQuery.data?.unit_number) {
      unitLabel = `Unit ${unitQuery.data.unit_number}`;
    }
  }

  const transactionReference = normalizeText(transaction.transaction_reference);
  const purchasePriceRaw = Number(
    transaction.purchase_price ?? transaction.sales_price ?? 0,
  );
  const purchasePrice =
    Number.isFinite(purchasePriceRaw) && purchasePriceRaw > 0
      ? new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      }).format(purchasePriceRaw)
      : "";
  const subject = normalizeText(templateOverrides?.subject) ||
    buildOnboardingSubject(transactionReference, acceptedOfferOnboarding);
  const branding = await resolveEmailBranding({
    supabase,
    organisationId,
    payload: {
      ...(payload as Record<string, unknown>),
      organisationName,
      supportEmail,
      supportPhone,
    },
    defaults: {
      organisationName: defaultOrganisationName,
      supportEmail: defaultSupportEmail,
      supportPhone: defaultSupportPhone,
    },
  });
  organisationName = branding.organisationName;
  supportEmail = branding.supportEmail || supportEmail;
  supportPhone = branding.supportPhone || supportPhone;
  const sender = formatEmailSender(
    normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
      "Arch9 <onboarding@resend.dev>",
    branding.fromName || branding.organisationName,
  );
  const html = buildOnboardingEmailHtml({
    buyerName,
    clientName: buyerName,
    developmentName,
    propertyName: [developmentName, unitLabel].filter(Boolean).join(" • "),
    unitLabel,
    unitNumber: normalizeText(unitLabel.replace(/^Unit\s+/i, "")),
    purchasePrice,
    transactionReference,
    onboardingUrl,
    agentName,
    organisationName,
    supportEmail,
    supportPhone,
    acceptedOffer: acceptedOfferOnboarding,
    templateOverrides: templateOverrides || undefined,
    branding,
  });
  const text = buildOnboardingEmailText({
    buyerName,
    clientName: buyerName,
    onboardingUrl,
    developmentName,
    propertyName: [developmentName, unitLabel].filter(Boolean).join(" • "),
    unitLabel,
    unitNumber: normalizeText(unitLabel.replace(/^Unit\s+/i, "")),
    purchasePrice,
    transactionReference,
    agentName,
    organisationName,
    supportEmail,
    supportPhone,
    acceptedOffer: acceptedOfferOnboarding,
    templateOverrides: templateOverrides || undefined,
  });

  console.log("Sending onboarding email", buyerEmail);

  const delivery = await prepareEmailDelivery(
    payload as Record<string, unknown>,
    {
      communicationType: "client_onboarding",
      recipient: buyerEmail,
      recipientRole: "buyer",
      subject,
      messagePreview: text,
      context: {
        organisationId,
        leadId: normalizeText(transactionData?.originating_buyer_lead_id),
        listingId: normalizeText(transactionData?.listing_id),
        transactionId: transaction.id,
        offerId: normalizeText(transactionData?.accepted_offer_id),
        metadata: {
          onboardingToken: resolvedOnboarding.token,
          deliveryMode,
          buyerDeliveryAction: normalizeText(payload.buyerDeliveryAction) ||
            null,
          buyerDeliveryVersion: normalizeText(payload.buyerDeliveryVersion) ||
            null,
          buyerParticipantId: normalizeText(buyerParticipant?.id) || null,
          buyerPartyId: normalizeText(buyerParticipant?.buyer_party_id) ||
            null,
          buyerTargetNonce: buyerTargetNonce || null,
        },
      },
    },
  );

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to: buyerEmail,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    console.error("Resend failed", emailResult.error);
    await markEmailDeliveryFailed(delivery?.id || "", {
      errorMessage: emailResult.error?.message ||
        "Failed to send onboarding email.",
    });
    return jsonResponse(500, {
      error: emailResult.error?.message || "Failed to send onboarding email.",
      details: emailResult.error,
    });
  }

  await markEmailDeliverySent(delivery?.id || "", {
    emailId: emailResult.data?.id || null,
  });

  const onboardingUpdate = await supabase
    .from("transaction_onboarding")
    .update({
      status: nextOnboardingStatus,
      updated_at: nowIso,
    })
    .eq("id", resolvedOnboarding.id);

  if (onboardingUpdate.error) {
    console.error("Onboarding update failed", onboardingUpdate.error);
    return jsonResponse(500, {
      error: onboardingUpdate.error.message ||
        "Failed to update onboarding status after send.",
      code: onboardingUpdate.error.code || null,
    });
  }

  try {
    await markBuyerParticipantDelivery(supabase, {
      participant: buyerParticipant,
        transactionId: transaction.id,
        payload,
        nowIso,
        targetNonce: buyerTargetNonce,
      });
  } catch (error) {
    console.error("Buyer participant delivery update failed", error);
    return jsonResponse(500, {
      error: (error as { message?: string })?.message ||
        "Failed to update buyer delivery status after send.",
      code: (error as { code?: string })?.code || null,
    });
  }

  await logOnboardingEmailSideEffects({
    supabase,
    transactionId: transaction.id,
    buyerEmail,
    buyerParticipantId: normalizeText(buyerParticipant?.id) || null,
    buyerPartyId: normalizeText(buyerParticipant?.buyer_party_id) || null,
    onboardingToken: resolvedOnboarding.token,
    emailId: emailResult.data?.id || null,
    resend: Boolean(payload.resend),
    nowIso,
  });

  return jsonResponse(200, {
    ok: true,
    type: "client_onboarding",
    transactionId: transaction.id,
    buyerParticipantId: normalizeText(buyerParticipant?.id) || null,
    buyerPartyId: normalizeText(buyerParticipant?.buyer_party_id) || null,
    recipientEmail: buyerEmail,
    onboardingUrl,
    onboardingStatus: nextOnboardingStatus,
    deliveryMode,
    emailId: emailResult.data?.id || null,
    deliveryId: delivery?.id || null,
  });
}
