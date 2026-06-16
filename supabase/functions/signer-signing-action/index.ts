import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { handleSellerMandateSentEmail } from "../send-email/handlers/sellerMandateSent.ts";
import { handleSellerMandateSignedEmail } from "../send-email/handlers/sellerMandateSigned.ts";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function valueIndicatesMarried(value: unknown) {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return false;
  if (/(^|_)(single|unmarried|divorced|widowed|not_married|never_married)($|_)/.test(normalized)) return false;
  return (
    normalized.includes("married") ||
    normalized.includes("community") ||
    normalized.includes("cop") ||
    normalized.includes("anc") ||
    normalized.includes("antenuptial")
  );
}

function hasMeaningfulSpouseValue(value: unknown) {
  const text = normalizeText(value);
  const lowered = text.toLowerCase();
  if (lowered.startsWith("[missing:") || lowered.startsWith("missing:")) return false;
  const normalized = normalizeText(value).toLowerCase().replace(/[\s._-]+/g, "_");
  if (!normalized) return false;
  return !["na", "n_a", "n/a", "none", "unknown", "tbc", "missing", "not_applicable", "not_provided", "no_spouse"].includes(normalized);
}

function mandateRequiresSpouseSignature(packet: Record<string, unknown>) {
  const sourceContext = packet?.source_context_json && typeof packet.source_context_json === "object"
    ? packet.source_context_json as Record<string, unknown>
    : {};
  const generatedSnapshot = sourceContext.generatedDataSnapshot && typeof sourceContext.generatedDataSnapshot === "object"
    ? sourceContext.generatedDataSnapshot as Record<string, unknown>
    : {};
  const placeholders = generatedSnapshot.placeholders && typeof generatedSnapshot.placeholders === "object"
    ? generatedSnapshot.placeholders as Record<string, unknown>
    : {};
  const nestedSource = generatedSnapshot.sourceContext && typeof generatedSnapshot.sourceContext === "object"
    ? generatedSnapshot.sourceContext as Record<string, unknown>
    : {};
  const sellerOnboarding = sourceContext.sellerOnboarding && typeof sourceContext.sellerOnboarding === "object"
    ? sourceContext.sellerOnboarding as Record<string, unknown>
    : {};
  const onboardingFormData = {
    ...((sellerOnboarding.formData && typeof sellerOnboarding.formData === "object") ? sellerOnboarding.formData as Record<string, unknown> : {}),
    ...((sourceContext.onboardingFormData && typeof sourceContext.onboardingFormData === "object") ? sourceContext.onboardingFormData as Record<string, unknown> : {}),
  };

  const spouseSignal = [
    placeholders.seller_spouse_name,
    placeholders.seller_spouse_email,
    placeholders.seller_spouse_id_number,
    sourceContext.spouseName,
    sourceContext.spouseEmail,
    nestedSource.spouseName,
    nestedSource.spouseEmail,
    onboardingFormData.spouseName,
    onboardingFormData.spouseEmail,
    onboardingFormData.spouseIdNumber,
  ].some(hasMeaningfulSpouseValue);
  if (spouseSignal) return true;

  return [
    placeholders.seller_marital_status,
    placeholders.seller_marital_regime,
    sourceContext.sellerMaritalStatus,
    sourceContext.seller_marital_status,
    sourceContext.sellerMaritalRegime,
    sourceContext.seller_marital_regime,
    sourceContext.ownershipType,
    sourceContext.ownership_structure,
    nestedSource.ownershipType,
    nestedSource.ownership_structure,
    onboardingFormData.ownershipType,
    onboardingFormData.ownership_structure,
    onboardingFormData.maritalStatus,
    onboardingFormData.marital_status,
    onboardingFormData.marriageRegime,
    onboardingFormData.maritalRegime,
  ].some(valueIndicatesMarried);
}

function filterMandateSignersForCompletion(
  signers: Record<string, unknown>[],
  packet: Record<string, unknown>,
  spouseRequiredOverride: boolean | null = null,
) {
  if (normalizeText(packet.packet_type).toLowerCase() !== "mandate") return signers;
  const requiresSpouse = spouseRequiredOverride === null ? mandateRequiresSpouseSignature(packet) : spouseRequiredOverride;
  return signers.filter((signer) => {
    const role = normalizeText(signer.signer_role).toLowerCase();
    if (role === "agent" || role === "seller") return true;
    if (role === "purchaser_2") return requiresSpouse;
    return false;
  });
}

async function resolveMandateSpouseRequiredForVersion({
  supabase,
  packet,
  packetId,
  packetVersionId,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  packetId: string;
  packetVersionId: string;
}) {
  if (normalizeText(packet.packet_type).toLowerCase() !== "mandate") return null;
  const fieldsResult = await supabase
    .from("document_signing_fields")
    .select("signer_role, required")
    .eq("packet_id", packetId)
    .eq("packet_version_id", packetVersionId);
  if (fieldsResult.error) throw fieldsResult.error;
  const spouseFields = ((fieldsResult.data || []) as Record<string, unknown>[])
    .filter((field) => normalizeText(field.signer_role).toLowerCase() === "purchaser_2");
  if (!spouseFields.length) return null;
  return spouseFields.some((field) => Boolean(field.required));
}

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function generateSecureSigningToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isMandateSeller(role: unknown) {
  return normalizeText(role).toLowerCase() === "seller";
}

function isMandateAgent(role: unknown) {
  return normalizeText(role).toLowerCase() === "agent";
}

function safeEmailPresent(value: unknown) {
  return Boolean(normalizeText(value));
}

function isUsableEmail(value: unknown) {
  const email = normalizeText(value).toLowerCase();
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith("@bridge.local"));
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function resolveSellerInviteSeed(
  packet: Record<string, unknown>,
  existingSourceContext: Record<string, unknown>,
  extraPlaceholders: Record<string, unknown> = {},
) {
  const generatedSnapshot = existingSourceContext.generatedDataSnapshot && typeof existingSourceContext.generatedDataSnapshot === "object"
    ? existingSourceContext.generatedDataSnapshot as Record<string, unknown>
    : {};
  const placeholders = generatedSnapshot.placeholders && typeof generatedSnapshot.placeholders === "object"
    ? generatedSnapshot.placeholders as Record<string, unknown>
    : {};
  const nestedSource = generatedSnapshot.sourceContext && typeof generatedSnapshot.sourceContext === "object"
    ? generatedSnapshot.sourceContext as Record<string, unknown>
    : {};
  const sellerOnboarding = existingSourceContext.sellerOnboarding && typeof existingSourceContext.sellerOnboarding === "object"
    ? existingSourceContext.sellerOnboarding as Record<string, unknown>
    : {};
  const onboardingFormData = sellerOnboarding.formData && typeof sellerOnboarding.formData === "object"
    ? sellerOnboarding.formData as Record<string, unknown>
    : {};

  const sellerName = firstNonEmpty(
    extraPlaceholders.seller_full_name,
    extraPlaceholders.sellerFullName,
    extraPlaceholders["seller.display_name"],
    extraPlaceholders["seller.name"],
    placeholders.seller_full_name,
    placeholders.sellerFullName,
    placeholders["seller.display_name"],
    placeholders["seller.name"],
    existingSourceContext.sellerName,
    existingSourceContext.seller_name,
    nestedSource.sellerName,
    nestedSource.seller_name,
    sellerOnboarding.sellerName,
    sellerOnboarding.seller_name,
    sellerOnboarding.fullName,
    onboardingFormData.sellerName,
    onboardingFormData.seller_name,
    onboardingFormData.fullName,
    onboardingFormData.name,
    normalizeText(packet.title).replace(/^Mandate\s*[-•]\s*/i, ""),
    "Seller",
  );
  const sellerEmail = firstNonEmpty(
    extraPlaceholders.seller_email,
    extraPlaceholders.sellerEmail,
    extraPlaceholders["seller.email"],
    placeholders.seller_email,
    placeholders.sellerEmail,
    placeholders["seller.email"],
    existingSourceContext.sellerEmail,
    existingSourceContext.seller_email,
    nestedSource.sellerEmail,
    nestedSource.seller_email,
    sellerOnboarding.email,
    sellerOnboarding.sellerEmail,
    sellerOnboarding.seller_email,
    onboardingFormData.email,
    onboardingFormData.sellerEmail,
    onboardingFormData.seller_email,
  ).toLowerCase();

  return {
    signerName: sellerName || "Seller",
    signerEmail: sellerEmail,
  };
}

function decodeDataUrl(dataUrl: string) {
  const normalized = normalizeText(dataUrl);
  const matched = normalized.match(/^data:(.+?);base64,(.+)$/);
  if (!matched) {
    throw new Error("Invalid signature payload format.");
  }
  const mimeType = matched[1] || "image/png";
  const base64Payload = matched[2] || "";
  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { mimeType, bytes };
}

async function loadSignerByToken({
  supabase,
  token,
}: {
  supabase: any;
  token: string;
}) {
  const signerQuery = await supabase
    .from("document_packet_signers")
    .select(
      "id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at",
    )
    .eq("signing_token", token)
    .maybeSingle();
  if (signerQuery.error) throw signerQuery.error;

  const signer = signerQuery.data as Record<string, unknown> | null;
  if (!signer) {
    return {
      signer: null,
      error: {
        status: 404,
        message: "This signing link is invalid.",
        errorCode: "INVALID_SIGNING_TOKEN",
      },
    };
  }

  const expiry = normalizeText(signer?.token_expires_at);
  if (expiry) {
    const expiryDate = new Date(expiry);
    if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
      if (normalizeText(signer.status).toLowerCase() !== "expired") {
        await supabase.from("document_packet_signers").update({ status: "expired" }).eq("id", String(signer.id));
      }
      return {
        signer: null,
        error: {
          status: 410,
          message: "This signing link has expired.",
          errorCode: "SIGNING_TOKEN_EXPIRED",
        },
      };
    }
  }

  return { signer, error: null };
}

function fieldBelongsToSigner(field: Record<string, unknown>, signer: Record<string, unknown>) {
  const roleMatches =
    normalizeText(field?.signer_role).toLowerCase() === normalizeText(signer?.signer_role).toLowerCase();
  if (!roleMatches) return false;

  const fieldEmail = normalizeText(field?.signer_email).toLowerCase();
  const signerEmail = normalizeText(signer?.signer_email).toLowerCase();
  if (!fieldEmail) return true;
  return fieldEmail === signerEmail;
}

async function resolveSignerAssetPath({
  supabase,
  packetId,
  signerId,
  assetType,
  requestedAssetPath,
  bucketCandidates,
}: {
  supabase: any;
  packetId: string;
  signerId: string;
  assetType: string;
  requestedAssetPath: string;
  bucketCandidates: string[];
}) {
  const normalizedRequested = normalizeText(requestedAssetPath);
  const expectedPrefix = `document-signatures/${packetId}/${signerId}/`;
  if (normalizedRequested && normalizedRequested.startsWith(expectedPrefix)) {
    return normalizedRequested;
  }

  const candidatePaths = [
    `document-signatures/${packetId}/${signerId}/${assetType}.png`,
    `document-signatures/${packetId}/${signerId}/${assetType}.jpg`,
    `document-signatures/${packetId}/${signerId}/${assetType}.jpeg`,
    `document-signatures/${packetId}/${signerId}/${assetType}.webp`,
  ];

  for (const path of candidatePaths) {
    for (const bucket of [...new Set(bucketCandidates)]) {
      const exists = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (!exists.error && exists.data?.signedUrl) {
        return path;
      }
    }
  }

  return "";
}

function choosePacketStatusFromSigners(signers: Record<string, unknown>[]) {
  const normalizedStatuses = signers.map((item) => normalizeText(item?.status).toLowerCase());
  const allSigned = normalizedStatuses.every((status) => status === "signed");
  return allSigned ? "completed" : "partially_signed";
}

function resolveSigningStatusFromSigners(signers: Record<string, unknown>[]) {
  const agent = signers.find((item) => isMandateAgent(item.signer_role));
  const seller = signers.find((item) => isMandateSeller(item.signer_role));
  if (seller && normalizeText(seller.status).toLowerCase() === "signed") return "seller_signed";
  if (seller && ["sent", "viewed"].includes(normalizeText(seller.status).toLowerCase())) return "sent_to_seller";
  if (agent && normalizeText(agent.status).toLowerCase() === "signed") return "agent_signed";
  if (agent && ["sent", "viewed"].includes(normalizeText(agent.status).toLowerCase())) return "sent_to_agent";
  return "draft";
}

async function invokeSendEmail({
  body,
}: {
  body: Record<string, unknown>;
}) {
  const type = normalizeText(body.type).toLowerCase();
  const response =
    type === "seller_mandate_sent"
      ? await handleSellerMandateSentEmail(body as never)
      : type === "seller_mandate_signed"
        ? await handleSellerMandateSignedEmail(body as never)
        : jsonResponse(400, { error: `Unsupported internal email type: ${type || "unknown"}.` });
  const responseBody = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body: responseBody as Record<string, unknown> };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function collectMandateLeadIds(packet: Record<string, unknown>, sourceContext: Record<string, unknown>) {
  const generatedSnapshot = sourceContext.generatedDataSnapshot && typeof sourceContext.generatedDataSnapshot === "object"
    ? sourceContext.generatedDataSnapshot as Record<string, unknown>
    : {};
  const lead = sourceContext.lead && typeof sourceContext.lead === "object"
    ? sourceContext.lead as Record<string, unknown>
    : {};
  const candidates = [
    packet.lead_id,
    sourceContext.leadId,
    sourceContext.lead_id,
    sourceContext.uiLeadId,
    sourceContext.ui_lead_id,
    lead.id,
    lead.lead_id,
    generatedSnapshot.leadId,
    generatedSnapshot.lead_id,
  ];
  return [...new Set(candidates.map((value) => normalizeText(value)).filter((value) => UUID_PATTERN.test(value)))];
}

async function syncSellerMandateCompletion({
  supabase,
  packet,
  packetId,
  organisationId,
  nowIso,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  nowIso: string;
}) {
  if (normalizeText(packet.packet_type).toLowerCase() !== "mandate") return;

  const sourceContext = packet.source_context_json && typeof packet.source_context_json === "object"
    ? packet.source_context_json as Record<string, unknown>
    : {};
  const leadIds = collectMandateLeadIds(packet, sourceContext);
  const syncedListingIds = new Set<string>();
  const syncedListingStatuses = new Map<string, { status: string; visibility: string; isActive: boolean }>();

  const listingPatch = {
    mandate_status: "signed",
    mandate_packet_id: packetId,
    updated_at: nowIso,
  };

  const collectListings = (rows: Record<string, unknown>[] | null | undefined) => {
    for (const row of rows || []) {
      const id = normalizeText(row?.id);
      if (id) syncedListingIds.add(id);
      if (id) {
        syncedListingStatuses.set(id, {
          status: lower(row?.listing_status),
          visibility: lower(row?.listing_visibility),
          isActive: Boolean(row?.is_active),
        });
      }
    }
  };

  const byPacket = await supabase
    .from("private_listings")
    .update(listingPatch)
    .eq("organisation_id", organisationId)
    .eq("mandate_packet_id", packetId)
    .select("id, listing_status, listing_visibility, is_active");
  if (byPacket.error) console.error("[mandate-signing] listing mandate packet sync failed", byPacket.error);
  else collectListings(byPacket.data as Record<string, unknown>[]);

  for (const leadId of leadIds) {
    const bySellerLead = await supabase
      .from("private_listings")
      .update(listingPatch)
      .eq("organisation_id", organisationId)
      .eq("seller_lead_id", leadId)
      .select("id, listing_status, listing_visibility, is_active");
    if (bySellerLead.error) console.error("[mandate-signing] listing seller lead sync failed", bySellerLead.error);
    else collectListings(bySellerLead.data as Record<string, unknown>[]);

    const byOriginatingLead = await supabase
      .from("private_listings")
      .update(listingPatch)
      .eq("organisation_id", organisationId)
      .eq("originating_crm_lead_id", leadId)
      .select("id, listing_status, listing_visibility, is_active");
    if (byOriginatingLead.error) console.error("[mandate-signing] listing originating lead sync failed", byOriginatingLead.error);
    else collectListings(byOriginatingLead.data as Record<string, unknown>[]);
  }

  if (leadIds.length) {
    const anyListingLive = Array.from(syncedListingStatuses.values()).some((listing) =>
      listing.status === "active" ||
      listing.status === "under_offer" ||
      listing.status === "transaction_created" ||
      listing.status === "sold" ||
      listing.visibility === "active_market" ||
      listing.isActive,
    );
    const leadUpdate = await supabase
      .from("leads")
      .update({
        stage: anyListingLive ? "Listing Live" : "Mandate Signed",
        status: anyListingLive ? "Live" : "Signed",
        mandate_packet_id: packetId,
        updated_at: nowIso,
      })
      .eq("organisation_id", organisationId)
      .in("lead_id", leadIds);
    if (leadUpdate.error) console.error("[mandate-signing] lead mandate signed sync failed", leadUpdate.error);

    const leadActivityRows = leadIds.map((leadId) => ({
      organisation_id: organisationId,
      lead_id: leadId,
      activity_type: "Mandate Signed",
      activity_note: "Mandate was fully signed by all required parties.",
      outcome: "Signed",
      activity_date: nowIso,
      created_at: nowIso,
    }));
    const activityInsert = await supabase.from("lead_activities").insert(leadActivityRows);
    if (activityInsert.error) console.error("[mandate-signing] lead activity sync failed", activityInsert.error);
  }

  if (!syncedListingIds.size) return;
}

async function maybeSendSellerMandateInvite({
  supabase,
  packet,
  existingSourceContext,
  allSigners,
  packetId,
  packetVersionId,
  organisationId,
  agentSigner,
  nowIso,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  existingSourceContext: Record<string, unknown>;
  allSigners: Record<string, unknown>[];
  packetId: string;
  packetVersionId: string;
  organisationId: string;
  agentSigner: Record<string, unknown>;
  nowIso: string;
}) {
  let workingSigners = allSigners;
  let sellerSigner = workingSigners.find((item) => isMandateSeller(item.signer_role));
  if (!sellerSigner?.id) {
    let sellerSeed = resolveSellerInviteSeed(packet, existingSourceContext);
    if (!isUsableEmail(sellerSeed.signerEmail)) {
      const versionPlaceholders = await supabase
        .from("document_packet_versions")
        .select("placeholders_resolved_json")
        .eq("id", packetVersionId)
        .eq("packet_id", packetId)
        .maybeSingle();
      if (versionPlaceholders.error) throw versionPlaceholders.error;
      const placeholders = versionPlaceholders.data?.placeholders_resolved_json && typeof versionPlaceholders.data.placeholders_resolved_json === "object"
        ? versionPlaceholders.data.placeholders_resolved_json as Record<string, unknown>
        : {};
      sellerSeed = resolveSellerInviteSeed(packet, existingSourceContext, placeholders);
    }
    if (isUsableEmail(sellerSeed.signerEmail)) {
      const maxSigningOrder = Math.max(
        1,
        ...workingSigners.map((item) => Number(item.signing_order || 0)).filter((value) => Number.isFinite(value)),
      );
      const createSeller = await supabase
        .from("document_packet_signers")
        .insert({
          organisation_id: organisationId,
          packet_id: packetId,
          packet_version_id: packetVersionId,
          signer_role: "seller",
          signer_name: sellerSeed.signerName,
          signer_email: sellerSeed.signerEmail,
          signing_order: Math.max(2, maxSigningOrder + 1),
          status: "ready_to_send",
        })
        .select("id, signer_role, signer_name, signer_email, signing_order, signing_token, token_expires_at, status, signed_at")
        .single();
      if (createSeller.error) throw createSeller.error;
      sellerSigner = createSeller.data as Record<string, unknown>;
      workingSigners = [...workingSigners, sellerSigner];
      await appendPacketEvent({
        supabase,
        packetId,
        organisationId,
        versionId: packetVersionId,
        eventType: "seller_signer_auto_created",
        payload: {
          signerId: sellerSigner.id,
          signerRole: "seller",
          recipientEmailPresent: true,
          createdAt: nowIso,
        },
      });
    }
  }
  const sellerStatus = normalizeText(sellerSigner?.status).toLowerCase();
  const sellerEmail = normalizeText(sellerSigner?.signer_email).toLowerCase();
  const sellerToken = normalizeText(sellerSigner?.signing_token);
  const sellerSentFlag = normalizeText(existingSourceContext.sellerSigningEmailSentAt);
  const sellerHasActiveInvite = Boolean(
    sellerStatus === "signed" ||
      (sellerToken && ["sent", "viewed"].includes(sellerStatus) && sellerSentFlag),
  );
  const alreadySentSellerInvite = sellerHasActiveInvite;
  console.log("[mandate-signing] seller invite check", {
    mandateId: packetId,
    recipientRole: "seller",
    recipientEmailPresent: safeEmailPresent(sellerEmail),
    sellerStatus: sellerStatus || null,
    sellerHasToken: Boolean(sellerToken),
    staleSentFlagPresent: Boolean(sellerSentFlag),
    alreadySentSellerInvite,
  });

  if (!sellerSigner?.id || !sellerEmail || alreadySentSellerInvite) {
    return {
      allSigners: workingSigners,
      sellerInviteSent: false,
    };
  }

  const expiresAt = new Date(Date.now() + 168 * 60 * 60 * 1000).toISOString();
  const nextToken = normalizeText(sellerSigner.signing_token) || generateSecureSigningToken();
  const sellerUpdate = await supabase
    .from("document_packet_signers")
    .update({
      signing_token: nextToken,
      token_expires_at: expiresAt,
      status: "sent",
    })
    .eq("id", String(sellerSigner.id))
    .select("id, signer_role, signer_name, signer_email, signing_order, signing_token, token_expires_at, status, signed_at")
    .single();
  if (sellerUpdate.error) throw sellerUpdate.error;

  const appBaseUrl = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("CLIENT_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || "https://app.bridgenine.co.za").replace(/\/$/, "");
  const emailResult = await invokeSendEmail({
    body: {
      type: "seller_mandate_sent",
      to: sellerEmail,
      organisationId,
      packetId,
      recipientRole: "seller",
      recipientName: sellerUpdate.data?.signer_name || "Seller",
      sellerName: sellerUpdate.data?.signer_name || "Seller",
      propertyTitle: normalizeText(packet.title) || "your property",
      mandateType: "Mandate",
      portalLink: `${appBaseUrl}/sign/${nextToken}`,
      agentName: agentSigner.signer_name || "Agent",
    },
  });
  console.log("[mandate-signing] seller invite send result", {
    mandateId: packetId,
    recipientRole: "seller",
    recipientEmailPresent: true,
    emailProviderStatus: emailResult.status,
  });
  if (!emailResult.ok) {
    console.error("[mandate-signing] seller invite email failed", {
      mandateId: packetId,
      recipientRole: "seller",
      recipientEmailPresent: true,
      emailProviderStatus: emailResult.status,
    });
    await supabase
      .from("document_packet_signers")
      .update({
        status: "ready_to_send",
      })
      .eq("id", String(sellerSigner.id));
    await appendPacketEvent({
      supabase,
      packetId,
      organisationId,
      versionId: packetVersionId,
      eventType: "seller_signing_email_failed",
      payload: {
        signerId: sellerUpdate.data?.id,
        signerRole: "seller",
        recipientEmailPresent: true,
        emailProviderStatus: emailResult.status,
        failedAt: nowIso,
      },
    });
    return {
      allSigners: workingSigners.map((item) =>
        normalizeText(item.id) === normalizeText(sellerUpdate.data?.id)
          ? { ...(sellerUpdate.data as Record<string, unknown>), status: "ready_to_send" }
          : item
      ),
      sellerInviteSent: false,
    };
  }

  const updatedSigners = workingSigners.map((item) =>
    normalizeText(item.id) === normalizeText(sellerUpdate.data?.id) ? sellerUpdate.data as Record<string, unknown> : item
  );
  await appendPacketEvent({
    supabase,
    packetId,
    organisationId,
    versionId: packetVersionId,
    eventType: "seller_signing_email_sent",
    payload: {
      signerId: sellerUpdate.data?.id,
      signerRole: "seller",
      recipientEmailPresent: true,
      sentAt: nowIso,
    },
  });

  return {
    allSigners: updatedSigners,
    sellerInviteSent: true,
  };
}

async function sendFinalSignedMandateEmails({
  supabase,
  packet,
  packetId,
  organisationId,
  allSigners,
  finalBody,
  nowIso,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  allSigners: Record<string, unknown>[];
  finalBody: Record<string, unknown>;
  nowIso: string;
}) {
  const artifact = finalBody?.finalArtifact && typeof finalBody.finalArtifact === "object"
    ? finalBody.finalArtifact as Record<string, unknown>
    : {};
  const artifactBucket = normalizeText(artifact.bucket);
  const artifactPath = normalizeText(artifact.path);
  const artifactUrl = normalizeText(artifact.url);
  const signedDocumentName = normalizeText(artifact.fileName) || "signed-mandate.pdf";
  let downloadLink = "";

  if (artifactBucket && artifactPath) {
    const signedUrlResult = await supabase.storage.from(artifactBucket).createSignedUrl(artifactPath, 60 * 60 * 24 * 7);
    downloadLink = normalizeText(signedUrlResult.data?.signedUrl);
  }
  if (!downloadLink) downloadLink = artifactUrl;

  const recipients = new Map<string, Record<string, unknown>>();
  for (const signer of allSigners || []) {
    const email = normalizeText(signer.signer_email).toLowerCase();
    if (!email || email.endsWith("@bridge.local")) continue;
    if (!recipients.has(email)) recipients.set(email, signer);
  }

  const sellerName = normalizeText((allSigners || []).find((item) => isMandateSeller(item.signer_role))?.signer_name) || "Seller";
  const propertyTitle = normalizeText(packet.title) || "your property";
  let sentCount = 0;
  for (const [email, signer] of recipients.entries()) {
    const emailResult = await invokeSendEmail({
      body: {
        type: "seller_mandate_signed",
        to: email,
        organisationId,
        packetId,
        recipientName: normalizeText(signer.signer_name) || "there",
        sellerName,
        propertyTitle,
        signedAt: nowIso,
        signedDocumentName,
        downloadLink,
      },
    });
    console.log("[mandate-signing] final signed email result", {
      mandateId: packetId,
      recipientRole: normalizeText(signer.signer_role) || null,
      recipientEmailPresent: true,
      emailProviderStatus: emailResult.status,
    });
    if (emailResult.ok) sentCount += 1;
  }

  await appendPacketEvent({
    supabase,
    packetId,
    organisationId,
    versionId: normalizeText(finalBody?.packetVersionId),
    eventType: "final_signed_mandate_email_sent",
    payload: {
      recipientCount: sentCount,
      attemptedRecipientCount: recipients.size,
      downloadLinkPresent: Boolean(downloadLink),
      sentAt: nowIso,
    },
  });
}

function humanizePacketEventMessage(eventType = "", payload: Record<string, unknown> = {}) {
  const type = normalizeText(eventType).toLowerCase();
  const signerName = normalizeText(payload.signerName || payload.signer_name);
  const signerLabel = signerName || "Seller";
  const messages: Record<string, string> = {
    signer_asset_saved: "Signer signature asset was saved.",
    signer_completed_signing: `${signerLabel} signed the mandate.`,
    all_signers_completed: "All required signers completed the mandate.",
    mandate_signed_by_seller: `${signerLabel} signed the mandate.`,
  };
  return messages[type] || normalizeText(payload.message) || eventType.replace(/_/g, " ");
}

async function appendPacketEvent({
  supabase,
  packetId,
  organisationId,
  versionId,
  eventType,
  payload,
}: {
  supabase: any;
  packetId: string;
  organisationId: string;
  versionId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const nowIso = new Date().toISOString();
  const eventPayload = {
    activity_type: normalizeText(payload.activity_type || payload.activityType || eventType),
    document_packet_id: packetId,
    document_packet_version_id: versionId,
    signer_id: normalizeText(payload.signerId || payload.signer_id) || null,
    actor_role: "seller",
    message: normalizeText(payload.message) || humanizePacketEventMessage(eventType, payload),
    visibility: "internal",
    created_at: nowIso,
    metadata: {},
    ...payload,
  };
  await supabase.from("document_packet_events").insert({
    packet_id: packetId,
    organisation_id: organisationId,
    version_id: versionId,
    event_type: eventType,
    event_payload_json: eventPayload,
    created_by: null,
    created_at: nowIso,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      });
    }
    const SUPABASE_FUNCTION_AUTH_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_FUNCTION_AUTH_KEY") ||
      Deno.env.get("FUNCTION_AUTH_KEY") ||
      Deno.env.get("VITE_SUPABASE_ANON_KEY") ||
      SUPABASE_SERVICE_ROLE_KEY;

    const payload = (await req.json()) as {
      action?: string;
      token?: string;
      assetType?: string;
      dataUrl?: string;
      fieldId?: string;
      assetPath?: string;
      completedByEmail?: string;
    };

    const action = normalizeText(payload.action).toLowerCase();
    const token = normalizeText(payload.token);
    if (!token) {
      return jsonResponse(400, {
        success: false,
        error: "Signing token is required.",
        errorCode: "INVALID_SIGNING_TOKEN",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const signerResult = await loadSignerByToken({ supabase, token });
    if (signerResult.error) {
      return jsonResponse(Number(signerResult.error.status || 400), {
        success: false,
        error: signerResult.error.message,
        errorCode: signerResult.error.errorCode,
      });
    }
    const signer = signerResult.signer as Record<string, unknown>;
    const signerId = String(signer.id || "");
    const packetId = String(signer.packet_id || "");
    const packetVersionId = String(signer.packet_version_id || "");
    const organisationId = String(signer.organisation_id || "");
    const nowIso = new Date().toISOString();

    if (action === "upsert_asset") {
      const assetType = normalizeText(payload.assetType).toLowerCase();
      if (!["initial", "signature"].includes(assetType)) {
        return jsonResponse(400, {
          success: false,
          error: "assetType must be initial or signature.",
          errorCode: "INVALID_ASSET_TYPE",
        });
      }

      const dataUrl = normalizeText(payload.dataUrl);
      if (!dataUrl) {
        return jsonResponse(400, {
          success: false,
          error: "Signature payload is required.",
          errorCode: "MISSING_SIGNATURE_PAYLOAD",
        });
      }

      const decoded = decodeDataUrl(dataUrl);
      const extension = decoded.mimeType.includes("jpeg") ? "jpg" : "png";
      const fileName = `${assetType}.${extension}`;
      const filePath = `document-signatures/${packetId}/${signerId}/${fileName}`;
      const bucketCandidates = parseBucketCandidates(
        Deno.env.get("SIGNATURES_BUCKET"),
        Deno.env.get("SUPABASE_SIGNATURES_BUCKET"),
        Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
        Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
        Deno.env.get("DOCUMENTS_BUCKET"),
        "document-signatures",
        "documents",
      );

      let uploadedBucket = "";
      let uploadError: unknown = null;
      for (const bucket of [...new Set(bucketCandidates)]) {
        const upload = await supabase.storage.from(bucket).upload(filePath, decoded.bytes, {
          contentType: decoded.mimeType,
          upsert: true,
        });
        if (!upload.error) {
          uploadedBucket = bucket;
          uploadError = null;
          break;
        }
        uploadError = upload.error;
      }

      if (!uploadedBucket) {
        return jsonResponse(500, {
          success: false,
          error: "Unable to store signature asset.",
          errorCode: "SIGNATURE_STORAGE_FAILED",
          details: String(uploadError),
        });
      }

      const signedUrlResult = await supabase.storage.from(uploadedBucket).createSignedUrl(filePath, 60 * 60);
      const assetUrl = signedUrlResult.data?.signedUrl || null;

      await appendPacketEvent({
        supabase,
        packetId,
        organisationId,
        versionId: packetVersionId,
        eventType: "signer_asset_saved",
        payload: {
          signerId,
          signerRole: signer.signer_role,
          assetType,
          filePath,
          savedAt: nowIso,
        },
      });

      return jsonResponse(200, {
        success: true,
        asset: {
          assetType,
          bucket: uploadedBucket,
          path: filePath,
          url: assetUrl,
        },
      });
    }

    if (action === "apply_field") {
      const fieldId = normalizeText(payload.fieldId);
      const assetType = normalizeText(payload.assetType).toLowerCase();
      if (!fieldId) {
        return jsonResponse(400, {
          success: false,
          error: "fieldId is required.",
          errorCode: "MISSING_FIELD_ID",
        });
      }
      if (!["initial", "signature"].includes(assetType)) {
        return jsonResponse(400, {
          success: false,
          error: "assetType must be initial or signature for field completion.",
          errorCode: "INVALID_ASSET_TYPE",
        });
      }

      const fieldResult = await supabase
        .from("document_signing_fields")
        .select(
          "id, packet_id, packet_version_id, signer_role, signer_email, field_type, required, status, signature_asset_path, signature_asset_url",
        )
        .eq("id", fieldId)
        .eq("packet_id", packetId)
        .eq("packet_version_id", packetVersionId)
        .maybeSingle();
      if (fieldResult.error) throw fieldResult.error;
      const field = fieldResult.data as Record<string, unknown> | null;
      if (!field || !fieldBelongsToSigner(field, signer)) {
        return jsonResponse(403, {
          success: false,
          error: "You cannot complete this field.",
          errorCode: "FIELD_SCOPE_DENIED",
        });
      }

      const fieldType = normalizeText(field.field_type).toLowerCase();
      if (fieldType !== assetType) {
        return jsonResponse(400, {
          success: false,
          error: "Field type does not match selected signature asset type.",
          errorCode: "FIELD_TYPE_MISMATCH",
        });
      }

      const bucketCandidates = parseBucketCandidates(
        Deno.env.get("SIGNATURES_BUCKET"),
        Deno.env.get("SUPABASE_SIGNATURES_BUCKET"),
        Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
        Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
        Deno.env.get("DOCUMENTS_BUCKET"),
        "document-signatures",
        "documents",
      );
      const assetPath = await resolveSignerAssetPath({
        supabase,
        packetId,
        signerId,
        assetType,
        requestedAssetPath: normalizeText(payload.assetPath),
        bucketCandidates,
      });
      if (!assetPath) {
        return jsonResponse(400, {
          success: false,
          error: `No saved ${assetType} asset was found for this signer.`,
          errorCode: "MISSING_SIGNATURE_ASSET",
        });
      }
      let signedAssetUrl: string | null = null;
      for (const bucket of [...new Set(bucketCandidates)]) {
        const result = await supabase.storage.from(bucket).createSignedUrl(assetPath, 60 * 60);
        if (!result.error && result.data?.signedUrl) {
          signedAssetUrl = result.data.signedUrl;
          break;
        }
      }

      const completedByEmail = normalizeText(payload.completedByEmail).toLowerCase() || normalizeText(signer.signer_email).toLowerCase();
      const updateField = await supabase
        .from("document_signing_fields")
        .update({
          status: "completed",
          completed_at: nowIso,
          completed_by_email: completedByEmail,
          signature_asset_path: assetPath,
          signature_asset_url: signedAssetUrl,
          signature_type: assetType,
        })
        .eq("id", fieldId)
        .select(
          "id, packet_id, packet_version_id, signer_role, signer_email, field_type, required, status, completed_at, completed_by_email, signature_asset_path, signature_asset_url, signature_type",
        )
        .single();
      if (updateField.error) throw updateField.error;

      const currentStatus = normalizeText(signer.status).toLowerCase();
      if (!["signed", "declined", "expired"].includes(currentStatus)) {
        await supabase
          .from("document_packet_signers")
          .update({
            status: "viewed",
            viewed_at: normalizeText(signer.viewed_at) ? signer.viewed_at : nowIso,
            token_used_at: nowIso,
          })
          .eq("id", signerId);
      }

      await appendPacketEvent({
        supabase,
        packetId,
        organisationId,
        versionId: packetVersionId,
        eventType: "signing_field_completed",
        payload: {
          signerId,
          fieldId,
          fieldType: assetType,
          completedByEmail,
          completedAt: nowIso,
        },
      });

      return jsonResponse(200, {
        success: true,
        field: updateField.data,
      });
    }

    if (action === "complete_signing") {
      if (normalizeText(signer.status).toLowerCase() === "signed") {
        const allSignersResult = await supabase
          .from("document_packet_signers")
          .select("id, signer_role, signer_name, signer_email, signing_order, signing_token, token_expires_at, status, signed_at")
          .eq("packet_id", packetId)
          .eq("packet_version_id", packetVersionId);
        if (allSignersResult.error) throw allSignersResult.error;
        const packetContextResult = await supabase
          .from("document_packets")
          .select("id, organisation_id, packet_type, title, lead_id, source_context_json")
          .eq("id", packetId)
          .maybeSingle();
        if (packetContextResult.error) throw packetContextResult.error;
        const packet = (packetContextResult.data || {}) as Record<string, unknown>;
        const existingSourceContext =
          packetContextResult.data?.source_context_json && typeof packetContextResult.data.source_context_json === "object"
            ? packetContextResult.data.source_context_json as Record<string, unknown>
            : {};
        let allSigners = (allSignersResult.data || []) as Record<string, unknown>[];
        let sellerInviteSent = false;

        if (normalizeText(packet.packet_type).toLowerCase() === "mandate" && isMandateAgent(signer.signer_role)) {
          const inviteResult = await maybeSendSellerMandateInvite({
            supabase,
            packet,
            existingSourceContext,
            allSigners,
            packetId,
            packetVersionId,
            organisationId,
            agentSigner: signer,
            nowIso,
          });
          allSigners = inviteResult.allSigners;
          sellerInviteSent = inviteResult.sellerInviteSent;
        }

        const spouseRequiredForVersion = await resolveMandateSpouseRequiredForVersion({
          supabase,
          packet,
          packetId,
          packetVersionId,
        });
        const completionSigners = filterMandateSignersForCompletion(allSigners, packet, spouseRequiredForVersion);
        const nextPacketStatus = choosePacketStatusFromSigners(completionSigners);
        const workflowSigningStatus = nextPacketStatus === "completed" ? "completed" : resolveSigningStatusFromSigners(completionSigners);

        await supabase
          .from("document_packets")
          .update({
            status: nextPacketStatus,
            completed_at: nextPacketStatus === "completed" ? existingSourceContext.signedAt || nowIso : null,
            source_context_json: {
              ...existingSourceContext,
              signing_method: existingSourceContext.signing_method || "digital",
              signingMethod: existingSourceContext.signingMethod || "digital",
              signing_status: workflowSigningStatus,
              signingStatus: workflowSigningStatus,
              mandateStatus: workflowSigningStatus,
              agentSignedAt: isMandateAgent(signer.signer_role) ? existingSourceContext.agentSignedAt || signer.signed_at || nowIso : existingSourceContext.agentSignedAt || null,
              sellerSignedAt: isMandateSeller(signer.signer_role) ? existingSourceContext.sellerSignedAt || signer.signed_at || nowIso : existingSourceContext.sellerSignedAt || null,
              sellerSigningEmailSentAt:
                sellerInviteSent || workflowSigningStatus === "sent_to_seller"
                  ? existingSourceContext.sellerSigningEmailSentAt || nowIso
                  : existingSourceContext.sellerSigningEmailSentAt || null,
              signedAt: nextPacketStatus === "completed" ? existingSourceContext.signedAt || nowIso : existingSourceContext.signedAt || null,
              lastSignerCompletedAt: existingSourceContext.lastSignerCompletedAt || signer.signed_at || nowIso,
            },
          })
          .eq("id", packetId);

        return jsonResponse(200, {
          success: true,
          signer,
          alreadyCompleted: true,
          packetStatus: nextPacketStatus,
          signingStatus: workflowSigningStatus,
          sellerInviteSent,
        });
      }
      const requiredFieldsQuery = await supabase
        .from("document_signing_fields")
        .select("id, status, required, signer_role, signer_email, field_type")
        .eq("packet_id", packetId)
        .eq("packet_version_id", packetVersionId)
        .eq("required", true)
        .order("created_at", { ascending: true });
      if (requiredFieldsQuery.error) throw requiredFieldsQuery.error;

      const relevantRequired = (requiredFieldsQuery.data || [])
        .filter((field: Record<string, unknown>) => normalizeText(field.field_type).toLowerCase() !== "initial")
        .filter((field: Record<string, unknown>) => fieldBelongsToSigner(field, signer));
      const remaining = relevantRequired.filter((field: Record<string, unknown>) => normalizeText(field.status).toLowerCase() !== "completed");
      if (remaining.length) {
        return jsonResponse(400, {
          success: false,
          error: "Complete all required fields before finishing signing.",
          errorCode: "REMAINING_REQUIRED_FIELDS",
          remainingCount: remaining.length,
        });
      }

      const signerUpdate = await supabase
        .from("document_packet_signers")
        .update({
          status: "signed",
          signed_at: nowIso,
          token_used_at: nowIso,
          viewed_at: normalizeText(signer.viewed_at) ? signer.viewed_at : nowIso,
        })
        .eq("id", signerId)
        .select(
          "id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, token_expires_at, token_used_at, viewed_at, signed_at",
        )
        .single();
      if (signerUpdate.error) throw signerUpdate.error;

      await appendPacketEvent({
        supabase,
        packetId,
        organisationId,
        versionId: packetVersionId,
        eventType: "signer_completed_signing",
        payload: {
          signerId,
          signerRole: signer.signer_role,
          signerName: signer.signer_name,
          signerEmail: signer.signer_email,
          signedAt: nowIso,
        },
      });

      const allSignersResult = await supabase
        .from("document_packet_signers")
        .select("id, signer_role, signer_name, signer_email, signing_order, signing_token, token_expires_at, status, signed_at")
        .eq("packet_id", packetId)
        .eq("packet_version_id", packetVersionId);
      if (allSignersResult.error) throw allSignersResult.error;
      const packetContextResult = await supabase
        .from("document_packets")
        .select("id, organisation_id, packet_type, title, lead_id, source_context_json")
        .eq("id", packetId)
        .maybeSingle();
      if (packetContextResult.error) throw packetContextResult.error;
      const packet = (packetContextResult.data || {}) as Record<string, unknown>;
      const existingSourceContext =
        packetContextResult.data?.source_context_json && typeof packetContextResult.data.source_context_json === "object"
          ? packetContextResult.data.source_context_json as Record<string, unknown>
          : {};
      let allSigners = (allSignersResult.data || []) as Record<string, unknown>[];
      let sellerInviteSent = false;

      if (normalizeText(packet.packet_type).toLowerCase() === "mandate" && isMandateAgent(signer.signer_role)) {
        const inviteResult = await maybeSendSellerMandateInvite({
          supabase,
          packet,
          existingSourceContext,
          allSigners,
          packetId,
          packetVersionId,
          organisationId,
          agentSigner: signerUpdate.data || signer,
          nowIso,
        });
        allSigners = inviteResult.allSigners;
        sellerInviteSent = inviteResult.sellerInviteSent;
      }

      const spouseRequiredForVersion = await resolveMandateSpouseRequiredForVersion({
        supabase,
        packet,
        packetId,
        packetVersionId,
      });
      const completionSigners = filterMandateSignersForCompletion(allSigners, packet, spouseRequiredForVersion);
      const nextPacketStatus = choosePacketStatusFromSigners(completionSigners);
      const workflowSigningStatus = nextPacketStatus === "completed" ? "completed" : resolveSigningStatusFromSigners(completionSigners);

      await supabase
        .from("document_packets")
        .update({
          status: nextPacketStatus,
          completed_at: nextPacketStatus === "completed" ? nowIso : null,
          source_context_json: {
            ...existingSourceContext,
            signing_method: existingSourceContext.signing_method || "digital",
            signingMethod: existingSourceContext.signingMethod || "digital",
            signing_status: workflowSigningStatus,
            signingStatus: workflowSigningStatus,
            mandateStatus: workflowSigningStatus,
            agentSignedAt: isMandateAgent(signer.signer_role) ? nowIso : existingSourceContext.agentSignedAt || null,
            sellerSignedAt: isMandateSeller(signer.signer_role) ? nowIso : existingSourceContext.sellerSignedAt || null,
            sellerSigningEmailSentAt:
              sellerInviteSent || workflowSigningStatus === "sent_to_seller"
                ? existingSourceContext.sellerSigningEmailSentAt || nowIso
                : existingSourceContext.sellerSigningEmailSentAt || null,
            signedAt: nextPacketStatus === "completed" ? nowIso : existingSourceContext.signedAt || null,
            lastSignerCompletedAt: nowIso,
          },
        })
        .eq("id", packetId);

      if (nextPacketStatus === "completed") {
        await appendPacketEvent({
          supabase,
          packetId,
          organisationId,
          versionId: packetVersionId,
          eventType: "all_signers_completed",
          payload: {
            signedAt: nowIso,
            packetStatus: "completed",
          },
        });
        await appendPacketEvent({
          supabase,
          packetId,
          organisationId,
          versionId: packetVersionId,
          eventType: "mandate_signed_by_seller",
          payload: {
            signerId,
            signerRole: signer.signer_role,
            signerName: signer.signer_name,
            signerEmail: signer.signer_email,
            signedAt: nowIso,
          },
        });
        const finalResponse = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/generate-final-signed-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_FUNCTION_AUTH_KEY,
            "Authorization": `Bearer ${SUPABASE_FUNCTION_AUTH_KEY}`,
          },
          body: JSON.stringify({
            packetId,
            packetVersionId,
            finalisedBy: null,
          }),
        });
        const finalBody = await finalResponse.json().catch(() => ({}));
        if (!finalResponse.ok || finalBody?.success === false) {
          console.error("[mandate-signing] final signed generation failed", {
            mandateId: packetId,
            status: finalResponse.status,
            errorCode: finalBody?.errorCode || null,
          });
        } else {
          await appendPacketEvent({
            supabase,
            packetId,
            organisationId,
            versionId: packetVersionId,
            eventType: "final_signed_generation_triggered",
            payload: {
              generatedAt: new Date().toISOString(),
              finalArtifactPath: finalBody?.finalArtifact?.path || null,
            },
          });
          try {
            await syncSellerMandateCompletion({
              supabase,
              packet,
              packetId,
              organisationId,
              nowIso,
            });
          } catch (syncError) {
            console.error("[mandate-signing] seller mandate completion sync failed", {
              mandateId: packetId,
              error: String(syncError),
            });
          }
          try {
            await sendFinalSignedMandateEmails({
              supabase,
              packet,
              packetId,
              organisationId,
              allSigners: completionSigners,
              finalBody,
              nowIso,
            });
          } catch (emailError) {
            console.error("[mandate-signing] final signed email delivery failed", {
              mandateId: packetId,
              error: String(emailError),
            });
          }
        }
      }

      return jsonResponse(200, {
        success: true,
        signer: signerUpdate.data,
        packetStatus: nextPacketStatus,
        signingStatus: workflowSigningStatus,
        sellerInviteSent,
      });
    }

    return jsonResponse(400, {
      success: false,
      error: "Unsupported signing action.",
      errorCode: "UNSUPPORTED_SIGNING_ACTION",
    });
  } catch (error) {
    console.error("signer-signing-action failed", error);
    return jsonResponse(500, {
      success: false,
      error: "The signing action could not be completed. Please try again or request a new signing link.",
      errorCode: "SIGNER_ACTION_FAILED",
    });
  }
});
