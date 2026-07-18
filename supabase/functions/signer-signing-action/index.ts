import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { handleSellerMandateSentEmail } from "../send-email/handlers/sellerMandateSent.ts";
import { handleSellerMandateSignedEmail } from "../send-email/handlers/sellerMandateSigned.ts";
import { handleSellerOnboardingEmail } from "../send-email/handlers/sellerOnboarding.ts";

type JsonRecord = Record<string, unknown>;

const SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT = "seller_portal_invite_ready_after_mandate_signed";
const SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT = "seller_portal_invite_sent_after_mandate_signed";
const SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SKIPPED_EVENT = "seller_portal_invite_skipped_after_mandate_signed";
const SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_FAILED_EVENT = "seller_portal_invite_failed_after_mandate_signed";

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
  if (!expiry) {
    return {
      signer: null,
      error: {
        status: 410,
        message: "This signing link is no longer active.",
        errorCode: "SIGNER_SESSION_INACTIVE",
      },
    };
  }
  if (expiry) {
    const expiryDate = new Date(expiry);
    if (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()) {
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
        : type === "seller_portal_link"
          ? await handleSellerOnboardingEmail({
            ...(body as Record<string, unknown>),
            type: "seller_portal_link",
            emailKind: "portal_documents",
          } as never)
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = typeof value === "number" ? value : Number(normalizeText(value).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function uuidOrNull(value: unknown) {
  const text = normalizeText(value);
  return UUID_PATTERN.test(text) ? text : null;
}

function createListingReference() {
  return `PL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function missingColumnName(error: Record<string, unknown> | null | undefined) {
  const message = `${normalizeText(error?.message)} ${normalizeText(error?.details)}`;
  return message.match(/column\s+"([^"]+)"/i)?.[1] || message.match(/'([a-z0-9_]+)'\s+column/i)?.[1] || "";
}

async function insertPrivateListingWithFallback(supabase: any, payload: Record<string, unknown>) {
  let nextPayload = { ...payload };
  const removableColumns = new Set([
    "branch_id",
    "seller_lead_id",
    "assigned_agent_email",
    "property_category",
    "listing_source",
    "property_structure_type",
    "property24_status",
    "private_property_status",
    "bridge_listing_status",
    "mandate_packet_id",
  ]);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const insert = await supabase
      .from("private_listings")
      .insert(nextPayload)
      .select("id, listing_status, listing_visibility, is_active")
      .single();

    if (!insert.error) return insert;

    const missingColumn = missingColumnName(insert.error as Record<string, unknown>);
    if (!missingColumn || !removableColumns.has(missingColumn) || !(missingColumn in nextPayload)) return insert;
    const { [missingColumn]: _removed, ...rest } = nextPayload;
    nextPayload = rest;
  }

  return {
    data: null,
    error: { message: "Private listing insert fallback exceeded safe retry limit." },
  };
}

async function findExistingPrivateListingForLead({
  supabase,
  organisationId,
  leadId,
}: {
  supabase: any;
  organisationId: string;
  leadId: string;
}) {
  const byOriginating = await supabase
    .from("private_listings")
    .select("id, listing_status, listing_visibility, is_active")
    .eq("organisation_id", organisationId)
    .eq("originating_crm_lead_id", leadId)
    .neq("listing_status", "withdrawn")
    .neq("listing_visibility", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!byOriginating.error && byOriginating.data?.id) return byOriginating.data as Record<string, unknown>;

  const bySeller = await supabase
    .from("private_listings")
    .select("id, listing_status, listing_visibility, is_active")
    .eq("organisation_id", organisationId)
    .eq("seller_lead_id", leadId)
    .neq("listing_status", "withdrawn")
    .neq("listing_visibility", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bySeller.error && bySeller.data?.id) return bySeller.data as Record<string, unknown>;

  return null;
}

function buildSignedMandateListingPayload({
  lead,
  sourceContext,
  packetId,
  organisationId,
  nowIso,
}: {
  lead: Record<string, unknown>;
  sourceContext: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  nowIso: string;
}) {
  const generatedSnapshot = asRecord(sourceContext.generatedDataSnapshot);
  const nestedSource = asRecord(generatedSnapshot.sourceContext);
  const placeholders = asRecord(generatedSnapshot.placeholders);
  const sourceLead = asRecord(sourceContext.lead);
  const sellerOnboarding = {
    ...asRecord(nestedSource.sellerOnboarding),
    ...asRecord(generatedSnapshot.sellerOnboarding),
    ...asRecord(sourceLead.sellerOnboarding),
    ...asRecord(sourceContext.sellerOnboarding),
  };
  const onboardingFormData = {
    ...asRecord(nestedSource.onboardingFormData),
    ...asRecord(generatedSnapshot.onboardingFormData),
    ...asRecord(sourceContext.onboardingFormData),
    ...asRecord(sellerOnboarding.formData),
    ...asRecord(sellerOnboarding.form_data),
  };

  const leadId = firstText(lead.lead_id, lead.leadId, sourceContext.leadId, sourceContext.lead_id);
  const propertyAddress = firstText(
    onboardingFormData.propertyAddress,
    onboardingFormData.propertyAddressSearch,
    onboardingFormData.propertyAddressLine1,
    placeholders.property_address,
    sourceContext.propertyAddress,
    nestedSource.propertyAddress,
    sourceLead.sellerPropertyAddress,
    lead.seller_property_address,
    lead.property_interest,
    lead.area_interest,
  );
  const title = firstText(
    sourceContext.propertyTitle,
    nestedSource.propertyTitle,
    onboardingFormData.listingTitle,
    onboardingFormData.propertyTitle,
    placeholders.property_address,
    propertyAddress,
    lead.property_interest,
    "Signed mandate listing",
  );
  const assignedAgentId = uuidOrNull(firstText(
    lead.assigned_agent_id,
    lead.assignedAgentId,
    sourceContext.assignedAgentId,
    nestedSource.assignedAgentId,
  ));

  return {
    organisation_id: organisationId,
    assigned_agent_id: assignedAgentId,
    assigned_agent_email: firstText(lead.assigned_agent_email, sourceContext.assignedAgentEmail, nestedSource.assignedAgentEmail).toLowerCase() || null,
    seller_lead_id: leadId || null,
    originating_crm_lead_id: leadId || null,
    listing_reference: createListingReference(),
    listing_status: "active",
    listing_visibility: "active_market",
    property_category: "residential",
    listing_source: "private_listing",
    property_structure_type: "other",
    property_type: firstText(onboardingFormData.propertyType, sourceContext.propertyType, nestedSource.propertyType, lead.property_type),
    listing_category: "private_sale",
    title,
    description: firstText(onboardingFormData.propertyNotes, onboardingFormData.description, lead.notes),
    asking_price: firstNumber(onboardingFormData.askingPrice, sourceContext.askingPrice, nestedSource.askingPrice, lead.estimated_value, lead.budget),
    estimated_value: firstNumber(onboardingFormData.estimatedValue, onboardingFormData.askingPrice, lead.estimated_value, lead.budget),
    address_line_1: propertyAddress,
    address_line_2: firstText(onboardingFormData.propertyAddressLine2),
    suburb: firstText(onboardingFormData.suburb, lead.area_interest),
    city: firstText(onboardingFormData.city),
    province: firstText(onboardingFormData.province),
    postal_code: firstText(onboardingFormData.postalCode, onboardingFormData.postal_code),
    seller_type: firstText(onboardingFormData.sellerType, sellerOnboarding.seller_type),
    finance_context: firstText(onboardingFormData.financeContext),
    mandate_type: firstText(onboardingFormData.mandateType, sourceContext.mandateType, "sole"),
    mandate_status: "signed",
    mandate_packet_id: packetId,
    seller_onboarding_status: firstText(lead.seller_onboarding_status, sellerOnboarding.status, sourceContext.sellerOnboardingStatus, "completed").toLowerCase().includes("complete") ? "completed" : firstText(lead.seller_onboarding_status, sellerOnboarding.status, sourceContext.sellerOnboardingStatus, "completed"),
    is_active: true,
    created_by: assignedAgentId,
    property24_status: "not_published",
    private_property_status: "not_published",
    bridge_listing_status: "not_published",
    internal_listing_notes: `Auto-created from signed mandate packet ${packetId}`,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

async function createPrivateListingForSignedMandate({
  supabase,
  lead,
  sourceContext,
  packetId,
  organisationId,
  nowIso,
}: {
  supabase: any;
  lead: Record<string, unknown>;
  sourceContext: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  nowIso: string;
}) {
  const leadId = firstText(lead.lead_id, lead.leadId);
  if (!leadId) return null;

  const existing = await findExistingPrivateListingForLead({ supabase, organisationId, leadId });
  if (existing?.id) return existing;

  const payload = buildSignedMandateListingPayload({ lead, sourceContext, packetId, organisationId, nowIso });
  const insert = await insertPrivateListingWithFallback(supabase, payload);
  if (insert.error) {
    const code = normalizeText(insert.error.code);
    if (code === "23505") {
      const retriedExisting = await findExistingPrivateListingForLead({ supabase, organisationId, leadId });
      if (retriedExisting?.id) return retriedExisting;
    }
    console.error("[mandate-signing] auto listing creation failed", insert.error);
    return null;
  }

  const listing = insert.data as Record<string, unknown>;
  await supabase.from("private_listing_activity").insert({
    private_listing_id: listing.id,
    activity_type: "listing_created_after_mandate",
    activity_title: "Listing auto-created from signed mandate",
    activity_description: "The mandate was fully signed, so Arch9 created and linked the private listing shell.",
    performed_by: payload.created_by,
    visibility: "internal",
    metadata: {
      leadId,
      packetId,
      source: "mandate_signature_completion",
    },
    created_at: nowIso,
  }).catch((activityError: unknown) => {
    console.error("[mandate-signing] auto listing activity failed", activityError);
  });

  return listing;
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
  const listingIdByLeadId = new Map<string, string>();
  const syncedListingStatuses = new Map<string, { status: string; visibility: string; isActive: boolean }>();

  const listingPatch = {
    listing_status: "active",
    listing_visibility: "active_market",
    is_active: true,
    mandate_status: "signed",
    mandate_packet_id: packetId,
    updated_at: nowIso,
  };

  const collectListings = (rows: Record<string, unknown>[] | null | undefined, leadId = "") => {
    for (const row of rows || []) {
      const id = normalizeText(row?.id);
      if (id) syncedListingIds.add(id);
      if (id && leadId) listingIdByLeadId.set(leadId, id);
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
  if (leadIds.length === 1 && syncedListingIds.size === 1) {
    listingIdByLeadId.set(leadIds[0], Array.from(syncedListingIds)[0]);
  }

  for (const leadId of leadIds) {
    const bySellerLead = await supabase
      .from("private_listings")
      .update(listingPatch)
      .eq("organisation_id", organisationId)
      .eq("seller_lead_id", leadId)
      .select("id, listing_status, listing_visibility, is_active");
    if (bySellerLead.error) console.error("[mandate-signing] listing seller lead sync failed", bySellerLead.error);
    else collectListings(bySellerLead.data as Record<string, unknown>[], leadId);

    const byOriginatingLead = await supabase
      .from("private_listings")
      .update(listingPatch)
      .eq("organisation_id", organisationId)
      .eq("originating_crm_lead_id", leadId)
      .select("id, listing_status, listing_visibility, is_active");
    if (byOriginatingLead.error) console.error("[mandate-signing] listing originating lead sync failed", byOriginatingLead.error);
    else collectListings(byOriginatingLead.data as Record<string, unknown>[], leadId);
  }

  if (!syncedListingIds.size && leadIds.length) {
    const leadsQuery = await supabase
      .from("leads")
      .select("*")
      .eq("organisation_id", organisationId)
      .in("lead_id", leadIds);
    if (leadsQuery.error) {
      console.error("[mandate-signing] lead fetch for auto listing failed", leadsQuery.error);
    } else {
      for (const lead of (leadsQuery.data || []) as Record<string, unknown>[]) {
        const leadId = normalizeText(lead.lead_id || lead.leadId);
        const listing = await createPrivateListingForSignedMandate({
          supabase,
          lead,
          sourceContext,
          packetId,
          organisationId,
          nowIso,
        });
        if (listing?.id) {
          collectListings([listing], leadId);
        }
      }
    }
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
    for (const leadId of leadIds) {
      const listingId = listingIdByLeadId.get(leadId) || (syncedListingIds.size === 1 ? Array.from(syncedListingIds)[0] : "");
      const updatePayload: Record<string, unknown> = {
        stage: anyListingLive ? "Listing Live" : listingId ? "Converted To Listing" : "Mandate Signed",
        status: anyListingLive ? "Live" : listingId ? "Converted To Listing" : "Signed",
        mandate_packet_id: packetId,
        updated_at: nowIso,
      };
      if (listingId) updatePayload.listing_id = listingId;
      const leadUpdate = await supabase
        .from("leads")
        .update(updatePayload)
        .eq("organisation_id", organisationId)
        .eq("lead_id", leadId);
      if (leadUpdate.error) console.error("[mandate-signing] lead mandate signed sync failed", leadUpdate.error);
    }

    const leadActivityRows = leadIds.map((leadId) => ({
      organisation_id: organisationId,
      lead_id: leadId,
      activity_type: listingIdByLeadId.get(leadId) ? "Listing Created" : "Mandate Signed",
      activity_note: listingIdByLeadId.get(leadId)
        ? "Mandate was fully signed and the listing was created and linked."
        : "Mandate was fully signed by all required parties.",
      outcome: listingIdByLeadId.get(leadId) ? "Converted To Listing" : "Signed",
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

  const appBaseUrl = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("CLIENT_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || "https://app.arch9.co.za").replace(/\/$/, "");
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
        signing_token: null,
        token_expires_at: null,
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
  if (finalBody?.finalDelivery && typeof finalBody.finalDelivery === "object") return;
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

async function appendSellerPortalInviteAfterMandateSignedTrigger({
  supabase,
  packet,
  packetId,
  organisationId,
  versionId,
  finalBody,
  nowIso,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  versionId: string;
  finalBody: Record<string, unknown>;
  nowIso: string;
}) {
  if (lower(packet.packet_type) !== "mandate") return;

  const artifact = finalBody?.finalArtifact && typeof finalBody.finalArtifact === "object"
    ? finalBody.finalArtifact as Record<string, unknown>
    : {};
  const finalArtifactPath = normalizeText(artifact.path);
  const finalArtifactUrl = normalizeText(artifact.url);

  await appendPacketEvent({
    supabase,
    packetId,
    organisationId,
    versionId,
    eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT,
    payload: {
      triggerSource: "signer_signing_action",
      triggerReason: "mandate_signed",
      portalInviteStatus: "ready",
      readyForSellerPortalPasswordInvite: true,
      requiresPasswordSetup: true,
      signedAt: nowIso,
      finalizedAt: nowIso,
      packetStatus: "completed",
      finalArtifactPath: finalArtifactPath || null,
      finalArtifactUrlPresent: Boolean(finalArtifactUrl),
    },
  });
}

function resolveAppBaseUrl() {
  return (normalizeText(
    Deno.env.get("PUBLIC_APP_URL") ||
      Deno.env.get("CLIENT_APP_URL") ||
      Deno.env.get("VITE_PUBLIC_APP_URL") ||
      Deno.env.get("VITE_SITE_URL"),
  ) || "https://app.arch9.co.za").replace(/\/$/, "");
}

function buildSellerClientPortalLink(token: string) {
  return token ? `${resolveAppBaseUrl()}/client/${encodeURIComponent(token)}/selling` : "";
}

function resolveSellerPortalSourceContext(packet: Record<string, unknown>) {
  const sourceContext = asRecord(packet.source_context_json);
  const generatedSnapshot = asRecord(sourceContext.generatedDataSnapshot);
  const nestedSource = asRecord(generatedSnapshot.sourceContext);
  const sourceLead = asRecord(sourceContext.lead);
  const sellerOnboarding = {
    ...asRecord(nestedSource.sellerOnboarding),
    ...asRecord(generatedSnapshot.sellerOnboarding),
    ...asRecord(sourceLead.sellerOnboarding),
    ...asRecord(sourceContext.sellerOnboarding),
  };
  const formData = {
    ...asRecord(nestedSource.onboardingFormData),
    ...asRecord(generatedSnapshot.onboardingFormData),
    ...asRecord(sourceContext.onboardingFormData),
    ...asRecord(sellerOnboarding.formData),
    ...asRecord(sellerOnboarding.form_data),
  };
  const placeholders = asRecord(generatedSnapshot.placeholders);
  return { sourceContext, generatedSnapshot, nestedSource, sourceLead, sellerOnboarding, formData, placeholders };
}

async function sellerPortalMandateInviteAlreadySent({
  supabase,
  packetId,
}: {
  supabase: any;
  packetId: string;
}) {
  const existing = await supabase
    .from("document_packet_events")
    .select("id")
    .eq("packet_id", packetId)
    .eq("event_type", SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT)
    .limit(1);
  if (existing.error) {
    console.error("[mandate-signing] seller portal invite dedupe lookup failed", existing.error);
    return false;
  }
  return Boolean((existing.data || []).length);
}

async function appendSellerPortalMandateInviteOutcome({
  supabase,
  packetId,
  organisationId,
  versionId,
  eventType,
  listingId = "",
  token = "",
  finalBody = {},
  payload = {},
}: {
  supabase: any;
  packetId: string;
  organisationId: string;
  versionId: string;
  eventType: string;
  listingId?: string;
  token?: string;
  finalBody?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}) {
  const artifact = asRecord(finalBody.finalArtifact);
  await appendPacketEvent({
    supabase,
    packetId,
    organisationId,
    versionId,
    eventType,
    payload: {
      triggerSource: "signer_signing_action",
      triggerReason: "mandate_signed",
      listingId: uuidOrNull(listingId),
      sellerWorkspaceTokenPresent: Boolean(token),
      finalArtifactPath: normalizeText(artifact.path) || null,
      finalArtifactUrlPresent: Boolean(normalizeText(artifact.url)),
      ...payload,
    },
  });
}

async function resolveSellerPortalInviteListing({
  supabase,
  packet,
  packetId,
  organisationId,
  finalBody,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  finalBody: Record<string, unknown>;
}) {
  const { sourceContext, nestedSource } = resolveSellerPortalSourceContext(packet);
  const listingConversion = asRecord(finalBody.listingConversion);
  const candidateIds = [
    listingConversion.listingId,
    listingConversion.listing_id,
    sourceContext.privateListingId,
    sourceContext.private_listing_id,
    sourceContext.listingId,
    sourceContext.listing_id,
    nestedSource.privateListingId,
    nestedSource.private_listing_id,
    nestedSource.listingId,
    nestedSource.listing_id,
  ].map(uuidOrNull).filter(Boolean) as string[];

  for (const listingId of [...new Set(candidateIds)]) {
    const byId = await supabase
      .from("private_listings")
      .select("id, organisation_id, assigned_agent_id, assigned_agent_email, seller_lead_id, originating_crm_lead_id, listing_reference, title, address_line_1, address_line_2, property_type, mandate_packet_id")
      .eq("organisation_id", organisationId)
      .eq("id", listingId)
      .maybeSingle();
    if (!byId.error && byId.data?.id) return byId.data as Record<string, unknown>;
    if (byId.error) console.error("[mandate-signing] seller portal invite listing lookup by id failed", byId.error);
  }

  const byPacket = await supabase
    .from("private_listings")
    .select("id, organisation_id, assigned_agent_id, assigned_agent_email, seller_lead_id, originating_crm_lead_id, listing_reference, title, address_line_1, address_line_2, property_type, mandate_packet_id")
    .eq("organisation_id", organisationId)
    .eq("mandate_packet_id", packetId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!byPacket.error && byPacket.data?.id) return byPacket.data as Record<string, unknown>;
  if (byPacket.error) console.error("[mandate-signing] seller portal invite listing lookup by packet failed", byPacket.error);
  return null;
}

async function resolveSellerPortalInviteOnboarding({
  supabase,
  listing,
  packet,
}: {
  supabase: any;
  listing: Record<string, unknown> | null;
  packet: Record<string, unknown>;
}) {
  const { sourceContext, sourceLead, sellerOnboarding } = resolveSellerPortalSourceContext(packet);
  const listingId = normalizeText(listing?.id);
  if (listingId) {
    const byListing = await supabase
      .from("private_listing_seller_onboarding")
      .select("id, private_listing_id, token, token_expires_at, seller_type, ownership_structure, marital_regime, form_data, status, submitted_at, created_at, updated_at")
      .eq("private_listing_id", listingId)
      .maybeSingle();
    if (!byListing.error && byListing.data?.id) return byListing.data as Record<string, unknown>;
    if (byListing.error) console.error("[mandate-signing] seller portal invite onboarding lookup by listing failed", byListing.error);
  }

  const token = firstText(
    sellerOnboarding.token,
    sellerOnboarding.sellerWorkspaceToken,
    sourceContext.sellerOnboardingToken,
    sourceContext.seller_onboarding_token,
    sourceContext.sellerWorkspaceToken,
    sourceContext.seller_workspace_token,
    sourceLead.sellerOnboardingToken,
    sourceLead.seller_onboarding_token,
  );
  if (!token) return null;

  const byToken = await supabase
    .from("private_listing_seller_onboarding")
    .select("id, private_listing_id, token, token_expires_at, seller_type, ownership_structure, marital_regime, form_data, status, submitted_at, created_at, updated_at")
    .eq("token", token)
    .maybeSingle();
  if (!byToken.error && byToken.data?.id) return byToken.data as Record<string, unknown>;
  if (byToken.error) console.error("[mandate-signing] seller portal invite onboarding lookup by token failed", byToken.error);
  return null;
}

function buildSellerPortalInviteEmailPayload({
  packet,
  listing,
  onboarding,
  allSigners,
  organisationId,
}: {
  packet: Record<string, unknown>;
  listing: Record<string, unknown>;
  onboarding: Record<string, unknown>;
  allSigners: Record<string, unknown>[];
  organisationId: string;
}) {
  const { sourceContext, nestedSource, sourceLead, formData, placeholders } = resolveSellerPortalSourceContext(packet);
  const onboardingFormData = {
    ...formData,
    ...asRecord(onboarding.form_data),
    ...asRecord(onboarding.formData),
  };
  const sellerSigner = (allSigners || []).find((item) => isMandateSeller(item.signer_role)) || {};
  const token = firstText(
    onboarding.token,
    sourceContext.sellerWorkspaceToken,
    sourceContext.seller_workspace_token,
    sourceContext.sellerOnboardingToken,
    sourceContext.seller_onboarding_token,
  );
  const portalLink = buildSellerClientPortalLink(token);
  const sellerEmail = firstText(
    onboardingFormData.sellerEmail,
    onboardingFormData.seller_email,
    onboardingFormData.email,
    onboardingFormData.contactEmail,
    sourceContext.sellerEmail,
    sourceContext.seller_email,
    nestedSource.sellerEmail,
    nestedSource.seller_email,
    sourceLead.email,
    sourceLead.sellerEmail,
    sourceLead.seller_email,
    sellerSigner.signer_email,
  ).toLowerCase();
  const sellerName = firstText(
    onboardingFormData.sellerName,
    onboardingFormData.seller_name,
    onboardingFormData.fullName,
    [onboardingFormData.sellerFirstName, onboardingFormData.sellerSurname].map(normalizeText).filter(Boolean).join(" "),
    sourceContext.sellerName,
    sourceContext.seller_name,
    nestedSource.sellerName,
    nestedSource.seller_name,
    sellerSigner.signer_name,
    "Seller",
  );
  const propertyTitle = firstText(
    listing.title,
    [listing.address_line_1, listing.address_line_2].map(normalizeText).filter(Boolean).join(", "),
    sourceContext.propertyTitle,
    nestedSource.propertyTitle,
    onboardingFormData.propertyTitle,
    onboardingFormData.listingTitle,
    onboardingFormData.propertyAddress,
    placeholders.property_address,
    packet.title,
    "your property",
  );

  if (!portalLink || !isUsableEmail(sellerEmail)) {
    return {
      payload: null,
      reason: !portalLink ? "seller_portal_token_missing" : "seller_email_missing",
      token,
    };
  }

  return {
    payload: {
      type: "seller_portal_link",
      emailKind: "portal_documents",
      to: sellerEmail,
      organisationId,
      leadId: firstText(listing.seller_lead_id, listing.originating_crm_lead_id, sourceContext.leadId, sourceContext.lead_id, sourceLead.lead_id, sourceLead.leadId),
      listingId: normalizeText(listing.id),
      recipientRole: "seller",
      recipientName: sellerName,
      sellerName,
      propertyTitle,
      propertyType: firstText(listing.property_type, sourceContext.propertyType, nestedSource.propertyType, onboardingFormData.propertyType),
      onboardingLink: portalLink,
      portalLink,
      transactionReference: firstText(listing.listing_reference, sourceContext.transactionReference, sourceContext.transaction_reference),
      agentName: firstText(sourceContext.assignedAgentName, nestedSource.assignedAgentName, "Your agent"),
      supportEmail: firstText(listing.assigned_agent_email, sourceContext.assignedAgentEmail, nestedSource.assignedAgentEmail).toLowerCase(),
    },
    reason: "",
    token,
  };
}

async function syncSellerPortalInviteContext({
  supabase,
  packetId,
  organisationId,
  listing,
  onboarding,
  email,
  nowIso,
}: {
  supabase: any;
  packetId: string;
  organisationId: string;
  listing: Record<string, unknown>;
  onboarding: Record<string, unknown>;
  email: string;
  nowIso: string;
}) {
  const token = normalizeText(onboarding.token);
  const listingId = normalizeText(listing.id);
  if (!token || !listingId) return;

  const payload = {
    organisation_id: uuidOrNull(organisationId),
    client_email: isUsableEmail(email) ? email : null,
    client_contact_id: null,
    context_type: "selling",
    transaction_id: null,
    seller_lead_id: uuidOrNull(firstText(listing.seller_lead_id, listing.originating_crm_lead_id)),
    listing_id: listingId,
    mandate_packet_id: uuidOrNull(packetId),
    seller_workspace_token: token,
    status: "active",
    updated_at: nowIso,
  };

  const existing = await supabase
    .from("client_portal_contexts")
    .select("id")
    .eq("seller_workspace_token", token)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    console.error("[mandate-signing] seller portal context lookup failed", existing.error);
    return;
  }

  const result = existing.data?.id
    ? await supabase.from("client_portal_contexts").update(payload).eq("id", existing.data.id)
    : await supabase.from("client_portal_contexts").insert({
      ...payload,
      created_at: nowIso,
    });
  if (result.error) console.error("[mandate-signing] seller portal context sync failed", result.error);
}

async function sendSellerPortalInviteAfterMandateSigned({
  supabase,
  packet,
  packetId,
  organisationId,
  versionId,
  finalBody,
  allSigners,
  nowIso,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  packetId: string;
  organisationId: string;
  versionId: string;
  finalBody: Record<string, unknown>;
  allSigners: Record<string, unknown>[];
  nowIso: string;
}) {
  if (lower(packet.packet_type) !== "mandate") return { skipped: true, reason: "not_mandate" };
  if (await sellerPortalMandateInviteAlreadySent({ supabase, packetId })) {
    return { skipped: true, reason: "already_sent" };
  }

  const listing = await resolveSellerPortalInviteListing({ supabase, packet, packetId, organisationId, finalBody });
  if (!listing?.id) {
    await appendSellerPortalMandateInviteOutcome({
      supabase,
      packetId,
      organisationId,
      versionId,
      eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SKIPPED_EVENT,
      finalBody,
      payload: {
        portalInviteStatus: "skipped",
        skipReason: "listing_missing",
      },
    });
    return { skipped: true, reason: "listing_missing" };
  }

  const onboarding = await resolveSellerPortalInviteOnboarding({ supabase, listing, packet });
  if (!onboarding?.id) {
    await appendSellerPortalMandateInviteOutcome({
      supabase,
      packetId,
      organisationId,
      versionId,
      eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SKIPPED_EVENT,
      listingId: normalizeText(listing.id),
      finalBody,
      payload: {
        portalInviteStatus: "skipped",
        skipReason: "seller_onboarding_missing",
      },
    });
    return { skipped: true, reason: "seller_onboarding_missing" };
  }
  const { payload, reason, token } = buildSellerPortalInviteEmailPayload({
    packet,
    listing,
    onboarding,
    allSigners,
    organisationId,
  });

  if (!payload) {
    await appendSellerPortalMandateInviteOutcome({
      supabase,
      packetId,
      organisationId,
      versionId,
      eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SKIPPED_EVENT,
      listingId: normalizeText(listing.id),
      token,
      finalBody,
      payload: {
        portalInviteStatus: "skipped",
        skipReason: reason || "email_or_portal_link_missing",
      },
    });
    return { skipped: true, reason: reason || "email_or_portal_link_missing" };
  }

  await syncSellerPortalInviteContext({
    supabase,
    packetId,
    organisationId,
    listing,
    onboarding: { ...onboarding, token },
    email: normalizeText(payload.to).toLowerCase(),
    nowIso,
  });

  const emailResult = await invokeSendEmail({ body: payload });
  if (!emailResult.ok) {
    await appendSellerPortalMandateInviteOutcome({
      supabase,
      packetId,
      organisationId,
      versionId,
      eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_FAILED_EVENT,
      listingId: normalizeText(listing.id),
      token,
      finalBody,
      payload: {
        portalInviteStatus: "failed",
        failedAt: nowIso,
        recipientEmailPresent: true,
        emailProviderStatus: emailResult.status,
        errorMessage: normalizeText(emailResult.body?.error) || "Seller portal email could not be sent.",
      },
    });
    return { sent: false, failed: true, status: emailResult.status };
  }

  await appendSellerPortalMandateInviteOutcome({
    supabase,
    packetId,
    organisationId,
    versionId,
    eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT,
    listingId: normalizeText(listing.id),
    token,
    finalBody,
    payload: {
      portalInviteStatus: "sent",
      sentAt: nowIso,
      recipientEmailPresent: true,
      deliveryId: normalizeText(emailResult.body?.deliveryId) || null,
      canonicalInviteId: normalizeText(emailResult.body?.canonicalInviteId) || null,
    },
  });

  return {
    sent: true,
    deliveryId: normalizeText(emailResult.body?.deliveryId) || null,
    canonicalInviteId: normalizeText(emailResult.body?.canonicalInviteId) || null,
  };
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
    [SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT]: "Seller portal password setup invite is ready after mandate signature.",
    [SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT]: "Seller portal password setup invite was sent after mandate signature.",
    [SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SKIPPED_EVENT]: "Seller portal password setup invite was skipped after mandate signature.",
    [SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_FAILED_EVENT]: "Seller portal password setup invite failed after mandate signature.",
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
    const [runtimePacketResult, runtimeVersionResult] = await Promise.all([
      supabase.from("document_packets")
        .select("id, organisation_id, current_version_number")
        .eq("id", packetId)
        .maybeSingle(),
      supabase.from("document_packet_versions")
        .select("id, packet_id, organisation_id, version_number, render_status, validation_summary_json")
        .eq("id", packetVersionId)
        .eq("packet_id", packetId)
        .maybeSingle(),
    ]);
    if (runtimePacketResult.error) throw runtimePacketResult.error;
    if (runtimeVersionResult.error) throw runtimeVersionResult.error;
    const runtimePacket = runtimePacketResult.data as Record<string, unknown> | null;
    const runtimeVersion = runtimeVersionResult.data as Record<string, unknown> | null;
    const runtimeValidation = runtimeVersion?.validation_summary_json && typeof runtimeVersion.validation_summary_json === "object"
      ? runtimeVersion.validation_summary_json as Record<string, unknown>
      : {};
    const runtimeLock = runtimeValidation.lock_snapshot && typeof runtimeValidation.lock_snapshot === "object"
      ? runtimeValidation.lock_snapshot as Record<string, unknown>
      : {};
    const runtimeBindingValid = Boolean(runtimePacket && runtimeVersion) &&
      normalizeText(runtimePacket?.organisation_id) === organisationId &&
      normalizeText(runtimeVersion?.organisation_id) === organisationId &&
      Number(runtimePacket?.current_version_number) === Number(runtimeVersion?.version_number) &&
      normalizeText(runtimeVersion?.render_status).toLowerCase() === "generated" &&
      runtimeValidation.content_locked === true &&
      normalizeText(runtimeValidation.review_state).toLowerCase() === "locked" &&
      normalizeText(runtimeLock.lockDecision).toLowerCase() === "locked" &&
      normalizeText(runtimeLock.packetId) === packetId &&
      normalizeText(runtimeLock.versionId) === packetVersionId;
    if (!runtimeBindingValid) {
      return jsonResponse(409, {
        success: false,
        error: "This signer action is not bound to the current locked document version.",
        errorCode: "SIGNER_SESSION_BINDING_INVALID",
      });
    }
    const signerStatus = normalizeText(signer.status).toLowerCase();
    const signerSessionActive = ["sent", "viewed"].includes(signerStatus) || (signerStatus === "signed" && action === "complete_signing");
    if (!signerSessionActive) {
      return jsonResponse(409, {
        success: false,
        error: "This signer session is no longer active.",
        errorCode: "SIGNER_SESSION_INACTIVE",
      });
    }

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
        const [retryPacketResult, retryVersionResult] = await Promise.all([
          supabase.from("document_packets").select("packet_type").eq("id", packetId).maybeSingle(),
          supabase.from("document_packet_versions").select("final_signed_file_path").eq("id", packetVersionId).eq("packet_id", packetId).maybeSingle(),
        ]);
        if (retryPacketResult.error) throw retryPacketResult.error;
        if (retryVersionResult.error) throw retryVersionResult.error;
        if (!normalizeText(retryVersionResult.data?.final_signed_file_path)) {
          const retryFinaliser = normalizeText(retryPacketResult.data?.packet_type).toLowerCase() === "otp"
            ? "generate-final-signed-otp"
            : "generate-final-signed-document";
          const retryResponse = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${retryFinaliser}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": SUPABASE_FUNCTION_AUTH_KEY,
              "Authorization": `Bearer ${SUPABASE_FUNCTION_AUTH_KEY}`,
            },
            body: JSON.stringify({ packetId, packetVersionId, finalisedBy: null }),
          });
          const retryBody = await retryResponse.json().catch(() => ({}));
          if (!retryResponse.ok || retryBody?.success === false) {
            return jsonResponse(502, {
              success: false,
              error: "Your signature is safe, but final document generation still needs to be retried.",
              errorCode: retryBody?.errorCode || "FINAL_SIGNED_GENERATION_FAILED",
              signerCompleted: true,
              retryable: true,
            });
          }
          return jsonResponse(200, {
            success: true,
            signer,
            alreadyCompleted: true,
            packetStatus: "completed",
            signingStatus: "completed",
            finalArtifact: retryBody?.finalArtifact || null,
            finalisationRetried: true,
          });
        }
      }
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
      const progressSigningStatus = nextPacketStatus === "completed" ? "finalising" : workflowSigningStatus;

      const preFinalPacketStatus = nextPacketStatus === "completed" ? "partially_signed" : nextPacketStatus;
      const packetProgressUpdate = await supabase
        .from("document_packets")
        .update({
          status: preFinalPacketStatus,
          completed_at: null,
          source_context_json: {
            ...existingSourceContext,
            signing_method: existingSourceContext.signing_method || "digital",
            signingMethod: existingSourceContext.signingMethod || "digital",
            signing_status: progressSigningStatus,
            signingStatus: progressSigningStatus,
            mandateStatus: progressSigningStatus,
            agentSignedAt: isMandateAgent(signer.signer_role) ? nowIso : existingSourceContext.agentSignedAt || null,
            sellerSignedAt: isMandateSeller(signer.signer_role) ? nowIso : existingSourceContext.sellerSignedAt || null,
            sellerSigningEmailSentAt:
              sellerInviteSent || progressSigningStatus === "sent_to_seller"
                ? existingSourceContext.sellerSigningEmailSentAt || nowIso
                : existingSourceContext.sellerSigningEmailSentAt || null,
            signedAt: nextPacketStatus === "completed" ? nowIso : existingSourceContext.signedAt || null,
            lastSignerCompletedAt: nowIso,
          },
        })
        .eq("id", packetId);
      if (packetProgressUpdate.error) throw packetProgressUpdate.error;

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
        const finaliserFunction = normalizeText(packet.packet_type).toLowerCase() === "otp"
          ? "generate-final-signed-otp"
          : "generate-final-signed-document";
        const finalResponse = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${finaliserFunction}`, {
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
          return jsonResponse(502, {
            success: false,
            error: "Your signature was saved, but the final signed document could not be generated. It is safe to retry finalisation.",
            errorCode: finalBody?.errorCode || "FINAL_SIGNED_GENERATION_FAILED",
            signerCompleted: true,
            retryable: true,
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
            await appendSellerPortalInviteAfterMandateSignedTrigger({
              supabase,
              packet,
              packetId,
              organisationId,
              versionId: packetVersionId,
              finalBody,
              nowIso,
            });
          } catch (triggerError) {
            console.error("[mandate-signing] seller portal invite trigger marker failed", {
              mandateId: packetId,
              error: String(triggerError),
            });
          }
          try {
            const portalInviteResult = await sendSellerPortalInviteAfterMandateSigned({
              supabase,
              packet,
              packetId,
              organisationId,
              versionId: packetVersionId,
              finalBody,
              allSigners: completionSigners,
              nowIso,
            });
            console.log("[mandate-signing] seller portal invite after mandate signed result", {
              mandateId: packetId,
              sent: Boolean(portalInviteResult?.sent),
              skipped: Boolean(portalInviteResult?.skipped),
              failed: Boolean(portalInviteResult?.failed),
              reason: normalizeText(portalInviteResult?.reason) || null,
            });
          } catch (portalInviteError) {
            console.error("[mandate-signing] seller portal invite after mandate signed failed", {
              mandateId: packetId,
              error: String(portalInviteError),
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
