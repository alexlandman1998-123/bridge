import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  assertLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "../_shared/legalDocumentPilotRelease.ts";
import { assertLegalDocumentPilotLifecycleBinding } from "../_shared/legalDocumentPilotLifecycleTrace.ts";

type JsonRecord = Record<string, unknown>;
const FINALISER_CONTRACT = "h4-v1";
const PHASE3_SIGNATURE_EVIDENCE_CONTRACT = "phase3-visual-signature-evidence-v1";
const PHASE3_SIGNATURE_EVIDENCE_MODE = "visual_and_audit";
const MAX_SIGNATURE_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_SIGNATURE_IMAGE_DIMENSION = 12_000;

type SignatureAssetFingerprint = {
  fieldId: string;
  signerRole: string;
  fieldType: string;
  sha256: string;
  byteLength: number;
  imageFormat: "png" | "jpeg";
};

type InspectedSignatureImage = {
  imageFormat: "png" | "jpeg";
  hasTransparency: boolean;
};

type Phase3SignatureEvidence = {
  signatureEvidenceContract: typeof PHASE3_SIGNATURE_EVIDENCE_CONTRACT;
  signatureEvidenceMode: typeof PHASE3_SIGNATURE_EVIDENCE_MODE;
  embeddedSignatureCount: number;
  signatureAssetEvidenceSha256: string;
  signatureAssetFingerprints: SignatureAssetFingerprint[];
};

class SignatureAssetEmbedError extends Error {
  readonly errorCode = "SIGNATURE_ASSET_EMBED_FAILED";
  readonly reason: string;

  constructor(reason: string) {
    super("A required signature asset could not be embedded in the final PDF.");
    this.name = "SignatureAssetEmbedError";
    this.reason = reason;
  }
}

type GenerateFinalSignedPayload = {
  packetId?: string;
  packet_id?: string;
  packetVersionId?: string;
  packet_version_id?: string;
  finalisedBy?: string;
  finalised_by?: string;
  outputBucket?: string;
  output_bucket?: string;
  forceRegenerate?: boolean;
  force_regenerate?: boolean;
  replaceExisting?: boolean;
  replace_existing?: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "x-legal-finalizer-contract": FINALISER_CONTRACT },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * This is the only final-artifact shape allowed to leave the finaliser.
 * Storage coordinates and signed URLs stay server-side: browser callers must
 * ask the resolver to authorize and mint a short-lived download URL.
 */
function buildFinalArtifactAccessDescriptor({
  packetId,
  packetVersionId,
  documentId,
  fileName,
  sha256,
  byteLength,
  finalisedAt,
}: {
  packetId: unknown;
  packetVersionId: unknown;
  documentId: unknown;
  fileName: unknown;
  sha256: unknown;
  byteLength: unknown;
  finalisedAt: unknown;
}) {
  return {
    kind: "final_signed_document",
    resolver: "resolve-final-signed-document-access",
    ready: true,
    packetId: normalizeText(packetId) || null,
    packetVersionId: normalizeText(packetVersionId) || null,
    documentId: normalizeText(documentId) || null,
    fileName: normalizeText(fileName) || "signed-document.pdf",
    sha256: normalizeText(sha256) || null,
    byteLength: Number.isFinite(Number(byteLength)) && Number(byteLength) > 0 ? Number(byteLength) : null,
    finalisedAt: normalizeText(finalisedAt) || null,
  };
}

function buildFinalisationVersionDescriptor({
  packetId,
  version,
  documentId,
  fileName,
  sha256,
  byteLength,
  finalisedAt,
}: {
  packetId: string;
  version: Record<string, unknown> | null;
  documentId: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  finalisedAt: string | null;
}) {
  return {
    id: normalizeText(version?.id) || null,
    packetId: normalizeText(packetId) || null,
    number: Number(version?.version_number) || null,
    finalisedAt: normalizeText(finalisedAt || version?.finalised_at) || null,
    finalArtifact: buildFinalArtifactAccessDescriptor({
      packetId,
      packetVersionId: version?.id,
      documentId,
      fileName,
      sha256,
      byteLength,
      finalisedAt: finalisedAt || version?.finalised_at,
    }),
  };
}

function buildFinalDeliverySummary(value: unknown) {
  const delivery = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const allDelivered = delivery.allDelivered === true;
  const completed = delivery.success === true && allDelivered;
  return {
    status: completed ? "delivered" : "pending",
    allDelivered,
    portalSurface: normalizeText(delivery.portalSurface) || null,
    recipientCount: Number.isFinite(Number(delivery.recipientCount)) ? Number(delivery.recipientCount) : null,
    sentCount: Number.isFinite(Number(delivery.sentCount)) ? Number(delivery.sentCount) : null,
    errorCode: normalizeText(delivery.errorCode) || null,
  };
}

/**
 * Do not log signer names, emails, storage paths, or provider data from this
 * finaliser. Packet/version IDs and aggregate evidence are sufficient to
 * correlate a failure with its durable audit record.
 */
function logFinalisation(
  level: "info" | "error",
  event: string,
  details: {
    requestId: string;
    packetId?: string | null;
    packetVersionId?: string | null;
    packetType?: string | null;
    durationMs?: number;
    errorCode?: string | null;
    evidenceMode?: string | null;
    embeddedSignatureCount?: number;
    outputBytes?: number | null;
  },
) {
  const payload = JSON.stringify({
    level,
    event,
    function: "generate-final-signed-document",
    requestId: normalizeText(details.requestId),
    packetId: normalizeText(details.packetId),
    packetVersionId: normalizeText(details.packetVersionId),
    packetType: normalizeText(details.packetType),
    durationMs: Number.isFinite(Number(details.durationMs)) ? Number(details.durationMs) : null,
    errorCode: normalizeText(details.errorCode) || null,
    evidenceMode: normalizeText(details.evidenceMode) || null,
    embeddedSignatureCount: Number.isFinite(Number(details.embeddedSignatureCount)) ? Number(details.embeddedSignatureCount) : null,
    outputBytes: Number.isFinite(Number(details.outputBytes)) ? Number(details.outputBytes) : null,
  });
  if (level === "error") console.error(payload);
  else console.log(payload);
}

async function authorizeFinalisation(req: Request, serviceClient: any, serviceKey: string, packet: JsonRecord) {
  const bearer = normalizeText(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (bearer === serviceKey) return { service: true, userId: null };
  if (!bearer) return null;
  const userResult = await serviceClient.auth.getUser(bearer);
  const userId = normalizeText(userResult.data?.user?.id);
  if (userResult.error || !userId) return null;
  const membership = await serviceClient.from("organisation_users").select("role, workspace_role, organisation_role, app_role, status, membership_status").eq("organisation_id", normalizeText(packet.organisation_id)).eq("user_id", userId).limit(1).maybeSingle();
  if (membership.error || !membership.data || !["active", "accepted"].includes(normalizeText(membership.data.status || membership.data.membership_status).toLowerCase())) return null;
  const roles = [membership.data.role, membership.data.workspace_role, membership.data.organisation_role, membership.data.app_role].map((value) => normalizeText(value).toLowerCase());
  const admin = roles.some((role) => ["principal", "owner", "admin", "super_admin", "branch_manager", "manager", "agency_admin", "agent_admin"].includes(role));
  if (!admin && normalizeText(packet.assigned_agent_id) !== userId && normalizeText(packet.created_by) !== userId) return null;
  return { service: false, userId };
}

async function sha256Hex(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function dispatchFinalDelivery({ url, serviceKey, packetId, packetVersionId }: { url: string; serviceKey: string; packetId: string; packetVersionId: string }) {
  try {
    const result = await fetch(`${url.replace(/\/$/, "")}/functions/v1/dispatch-final-signed-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ packetId, packetVersionId }),
    });
    return await result.json().catch(() => ({ success: false, errorCode: `HTTP_${result.status}` }));
  } catch (_error) {
    return { success: false, errorCode: "FINAL_DELIVERY_REQUEST_FAILED" };
  }
}

/**
 * F2 is the authority for a final signed document. The supporting Documents
 * row is deliberately created as an internal provisional record before F2,
 * then promoted only after this check succeeds. This lookup lets a timeout
 * reuse an already-committed F2 result. An absent row is deliberately still
 * ambiguous: asynchronous database work may not be visible yet, so callers
 * must retain the private provisional artifact rather than clean it up.
 */
async function readCommittedFinalArtifact({
  supabase,
  packetId,
  packetVersionId,
  bucket,
  path,
  sha256,
  byteLength,
}: {
  supabase: any;
  packetId: string;
  packetVersionId: string;
  bucket: string;
  path: string;
  sha256: string;
  byteLength: number;
}) {
  const [versionResult, evidenceResult] = await Promise.all([
    supabase
      .from("document_packet_versions")
      .select("id, final_signed_file_path, final_signed_file_bucket, final_signed_document_id, final_signed_file_name, finalised_at")
      .eq("id", packetVersionId)
      .eq("packet_id", packetId)
      .maybeSingle(),
    supabase
      .from("legal_final_artifact_evidence")
      .select("packet_id, packet_version_id, bucket, path, sha256, byte_length")
      .eq("packet_id", packetId)
      .eq("packet_version_id", packetVersionId)
      .maybeSingle(),
  ]);
  if (versionResult.error || evidenceResult.error) return { committed: false, version: null };
  const version = versionResult.data as Record<string, unknown> | null;
  const evidence = evidenceResult.data as Record<string, unknown> | null;
  const committed = Boolean(
    version &&
    evidence &&
    normalizeText(version.final_signed_file_path) === path &&
    normalizeText(version.final_signed_file_bucket) === bucket &&
    normalizeText(evidence.packet_id) === packetId &&
    normalizeText(evidence.packet_version_id) === packetVersionId &&
    normalizeText(evidence.path) === path &&
    normalizeText(evidence.bucket) === bucket &&
    lower(evidence.sha256) === lower(sha256) &&
    Number(evidence.byte_length) === byteLength,
  );
  return { committed, version: committed ? version : null };
}

async function publishFinalSignedDocument({
  supabase,
  documentId,
  path,
}: {
  supabase: any;
  documentId: string;
  path: string;
}) {
  if (!documentId || !path) return false;
  const result = await supabase
    .from("documents")
    .update({
      visibility_scope: "shared",
      is_client_visible: true,
      stage_key: "final_signed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("file_path", path)
    .select("id")
    .maybeSingle();
  return !result.error && normalizeText(result.data?.id) === documentId;
}

async function createInternalFinalSignedDocument({
  supabase,
  transactionId,
  fileName,
  bucket,
  path,
  finalisedBy,
  createdAt,
}: {
  supabase: any;
  transactionId: string;
  fileName: string;
  bucket: string;
  path: string;
  finalisedBy: string | null;
  createdAt: string;
}) {
  const result = await supabase
    .from("documents")
    .insert({
      transaction_id: transactionId || null,
      name: fileName,
      file_path: path,
      file_bucket: bucket,
      category: "signed_documents",
      document_type: "final_signed_packet",
      visibility_scope: "internal",
      is_client_visible: false,
      uploaded_by_role: "system",
      uploaded_by_user_id: finalisedBy,
      stage_key: "final_signed_pending",
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("id")
    .maybeSingle();
  return result.error ? "" : normalizeText(result.data?.id);
}

async function linkFinalSignedDocumentToVersion({
  supabase,
  packetId,
  packetVersionId,
  documentId,
}: {
  supabase: any;
  packetId: string;
  packetVersionId: string;
  documentId: string;
}) {
  const update = await supabase
    .from("document_packet_versions")
    .update({ final_signed_document_id: documentId })
    .eq("id", packetVersionId)
    .eq("packet_id", packetId)
    .is("final_signed_document_id", null)
    .select("final_signed_document_id")
    .maybeSingle();
  if (!update.error && normalizeText(update.data?.final_signed_document_id)) {
    return normalizeText(update.data.final_signed_document_id);
  }
  const current = await supabase
    .from("document_packet_versions")
    .select("final_signed_document_id")
    .eq("id", packetVersionId)
    .eq("packet_id", packetId)
    .maybeSingle();
  return current.error ? "" : normalizeText(current.data?.final_signed_document_id);
}

async function cleanupUncommittedFinalisation({
  supabase,
  bucket,
  path,
  documentId,
}: {
  supabase: any;
  bucket: string;
  path: string;
  documentId: string;
}) {
  const [documentResult, storageResult] = await Promise.all([
    documentId
      ? supabase.from("documents").delete().eq("id", documentId)
      : Promise.resolve({ error: null }),
    bucket && path
      ? supabase.storage.from(bucket).remove([path])
      : Promise.resolve({ error: null }),
  ]);
  return {
    documentCleaned: !documentResult?.error,
    storageCleaned: !storageResult?.error,
  };
}

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
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

function mandateRoleIsRequired(packet: Record<string, unknown>, roleValue: unknown, spouseRequiredOverride: boolean | null = null) {
  if (lower(packet.packet_type) !== "mandate") return true;
  const role = lower(roleValue);
  if (role === "agent" || role === "seller") return true;
  if (role === "purchaser_2") return spouseRequiredOverride === null ? mandateRequiresSpouseSignature(packet) : spouseRequiredOverride;
  return false;
}

function resolveMandateSpouseRequiredForFields(packet: Record<string, unknown>, fields: Record<string, unknown>[]) {
  if (lower(packet.packet_type) !== "mandate") return null;
  const spouseFields = fields.filter((field) => lower(field.signer_role) === "purchaser_2");
  if (!spouseFields.length) return null;
  return spouseFields.some((field) => Boolean(field.required));
}

function safeNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function fieldIsSignatureLike(field: Record<string, unknown>) {
  const fieldType = lower(field?.field_type);
  return fieldType === "signature" || fieldType === "initial";
}

function isPdfPath(path: string) {
  return normalizeText(path).toLowerCase().endsWith(".pdf");
}

function inferDocxFileName(path: string) {
  const normalized = normalizeText(path);
  if (!normalized) return "document.docx";
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "document.docx";
}

async function convertDocxToPdfBytes({
  docxBytes,
  sourcePath,
}: {
  docxBytes: Uint8Array;
  sourcePath: string;
}) {
  const explicitConverterUrl = normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_URL"));
  const gotenbergBaseUrl = normalizeText(Deno.env.get("GOTENBERG_URL"));
  const converterUrl = explicitConverterUrl || (gotenbergBaseUrl ? `${gotenbergBaseUrl.replace(/\/$/, "")}/forms/libreoffice/convert` : "");
  if (!converterUrl) {
    return {
      success: false as const,
      errorCode: "DOCX_PDF_CONVERSION_UNAVAILABLE",
      error: "DOCX-to-PDF conversion service is not configured.",
    };
  }

  const formData = new FormData();
  formData.append(
    "files",
    new Blob([docxBytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    inferDocxFileName(sourcePath),
  );

  const headers: Record<string, string> = {};
  const bearer = normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_TOKEN"));
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  const response = await fetch(converterUrl, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    return {
      success: false as const,
      errorCode: "DOCX_PDF_CONVERSION_FAILED",
      error: `DOCX-to-PDF converter returned ${response.status}.`,
    };
  }

  const contentType = normalizeText(response.headers.get("content-type")).toLowerCase();
  if (contentType.includes("application/pdf")) {
    return {
      success: true as const,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as Record<string, unknown>;
    const base64Pdf = normalizeText(payload?.pdfBase64 || payload?.pdf_base64);
    const fileUrl = normalizeText(payload?.fileUrl || payload?.url || payload?.signedUrl || payload?.signed_url);
    if (base64Pdf) {
      const binary = atob(base64Pdf.includes(",") ? base64Pdf.split(",").pop() || "" : base64Pdf);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return { success: true as const, bytes };
    }
    if (fileUrl) {
      const urlResponse = await fetch(fileUrl);
      if (!urlResponse.ok) {
        return {
          success: false as const,
          errorCode: "DOCX_PDF_CONVERSION_FAILED",
          error: "Converter returned file URL but document download failed.",
        };
      }
      return {
        success: true as const,
        bytes: new Uint8Array(await urlResponse.arrayBuffer()),
      };
    }
  }

  return {
    success: false as const,
    errorCode: "DOCX_PDF_CONVERSION_FAILED",
    error: "Converter did not return a valid PDF payload.",
  };
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
  await supabase.from("document_packet_events").insert({
    packet_id: packetId,
    organisation_id: organisationId,
    version_id: versionId,
    event_type: eventType,
    event_payload_json: payload,
    created_by: null,
    created_at: new Date().toISOString(),
  });
}

async function downloadFirstAvailable({
  supabase,
  path,
  buckets,
}: {
  supabase: any;
  path: string;
  buckets: string[];
}) {
  const normalizedPath = normalizeText(path);
  if (!normalizedPath) {
    throw new Error("Missing file path for download.");
  }

  let lastError: unknown = null;
  for (const bucket of [...new Set(buckets.filter(Boolean))]) {
    const result = await supabase.storage.from(bucket).download(normalizedPath);
    if (!result.error && result.data) {
      return {
        bucket,
        bytes: new Uint8Array(await result.data.arrayBuffer()),
      };
    }
    lastError = result.error;
  }

  throw new Error(`Unable to download '${normalizedPath}' from configured buckets. ${lastError ? JSON.stringify(lastError) : ""}`.trim());
}

async function readImageBytes({
  supabase,
  assetPath,
  buckets,
}: {
  supabase: any;
  assetPath: string;
  buckets: string[];
}) {
  const normalizedPath = normalizeText(assetPath);
  if (!normalizedPath) {
    return null;
  }

  for (const bucket of [...new Set(buckets.filter(Boolean))]) {
    const result = await supabase.storage.from(bucket).download(normalizedPath);
    if (!result.error && result.data) {
      return {
        bucket,
        path: normalizedPath,
        bytes: new Uint8Array(await result.data.arrayBuffer()),
      };
    }
  }

  return null;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new SignatureAssetEmbedError("SIGNATURE_IMAGE_HEADER_TRUNCATED");
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function pngChunkType(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new SignatureAssetEmbedError("SIGNATURE_PNG_CHUNK_TRUNCATED");
  }
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function inspectPngSignatureImage(bytes: Uint8Array): InspectedSignatureImage {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)) {
    throw new SignatureAssetEmbedError("SIGNATURE_PNG_INVALID");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let sawHeader = false;
  let sawEnd = false;
  let hasTransparency = false;

  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BigEndian(bytes, offset);
    const chunkType = pngChunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd + 4 > bytes.length) {
      throw new SignatureAssetEmbedError("SIGNATURE_PNG_CHUNK_TRUNCATED");
    }

    if (!sawHeader) {
      if (chunkType !== "IHDR" || chunkLength !== 13) {
        throw new SignatureAssetEmbedError("SIGNATURE_PNG_HEADER_INVALID");
      }
      width = readUint32BigEndian(bytes, dataStart);
      height = readUint32BigEndian(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      const compression = bytes[dataStart + 10];
      const filter = bytes[dataStart + 11];
      const interlace = bytes[dataStart + 12];
      const allowedDepths = new Map<number, number[]>([
        [0, [1, 2, 4, 8, 16]],
        [2, [8, 16]],
        [3, [1, 2, 4, 8]],
        [4, [8, 16]],
        [6, [8, 16]],
      ]);
      if (
        !width ||
        !height ||
        width > MAX_SIGNATURE_IMAGE_DIMENSION ||
        height > MAX_SIGNATURE_IMAGE_DIMENSION ||
        !allowedDepths.get(colorType)?.includes(bitDepth) ||
        compression !== 0 ||
        filter !== 0 ||
        ![0, 1].includes(interlace)
      ) {
        throw new SignatureAssetEmbedError("SIGNATURE_PNG_UNSUPPORTED");
      }
      hasTransparency = colorType === 4 || colorType === 6;
      sawHeader = true;
    } else if (chunkType === "tRNS") {
      // Indexed, grayscale, and RGB PNGs can carry alpha through tRNS too.
      hasTransparency = true;
    } else if (chunkType === "IEND") {
      sawEnd = true;
      break;
    }

    offset = dataEnd + 4;
  }

  if (!sawHeader || !sawEnd) {
    throw new SignatureAssetEmbedError("SIGNATURE_PNG_INCOMPLETE");
  }

  return { imageFormat: "png", hasTransparency };
}

function inspectJpegSignatureImage(bytes: Uint8Array): InspectedSignatureImage {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new SignatureAssetEmbedError("SIGNATURE_JPEG_INVALID");
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0x00) continue;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) {
      throw new SignatureAssetEmbedError("SIGNATURE_JPEG_SEGMENT_TRUNCATED");
    }
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new SignatureAssetEmbedError("SIGNATURE_JPEG_SEGMENT_INVALID");
    }
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) {
        throw new SignatureAssetEmbedError("SIGNATURE_JPEG_FRAME_INVALID");
      }
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const components = bytes[offset + 7];
      if (!width || !height || width > MAX_SIGNATURE_IMAGE_DIMENSION || height > MAX_SIGNATURE_IMAGE_DIMENSION || !components) {
        throw new SignatureAssetEmbedError("SIGNATURE_JPEG_UNSUPPORTED");
      }
      return { imageFormat: "jpeg", hasTransparency: false };
    }
    offset += segmentLength;
  }

  throw new SignatureAssetEmbedError("SIGNATURE_JPEG_FRAME_MISSING");
}

function inspectSignatureImage(bytes: Uint8Array): InspectedSignatureImage {
  if (!bytes.length || bytes.length > MAX_SIGNATURE_ASSET_BYTES) {
    throw new SignatureAssetEmbedError("SIGNATURE_ASSET_SIZE_INVALID");
  }
  if (bytes[0] === 0x89) return inspectPngSignatureImage(bytes);
  if (bytes[0] === 0xff) return inspectJpegSignatureImage(bytes);
  throw new SignatureAssetEmbedError("SIGNATURE_IMAGE_FORMAT_UNSUPPORTED");
}

function canonicalSignatureAssetFingerprints(value: unknown): SignatureAssetFingerprint[] | null {
  if (!Array.isArray(value)) return null;
  const fingerprints = value.map((entry) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as JsonRecord : {};
    const fieldId = normalizeText(row.fieldId);
    const signerRole = lower(row.signerRole);
    const fieldType = lower(row.fieldType);
    const sha256 = lower(row.sha256);
    const byteLength = Number(row.byteLength);
    const imageFormat = lower(row.imageFormat);
    if (
      !fieldId ||
      !signerRole ||
      !["signature", "initial"].includes(fieldType) ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 1 ||
      byteLength > MAX_SIGNATURE_ASSET_BYTES ||
      !["png", "jpeg"].includes(imageFormat)
    ) {
      return null;
    }
    return {
      fieldId,
      signerRole,
      fieldType,
      sha256,
      byteLength,
      imageFormat: imageFormat as "png" | "jpeg",
    };
  });
  if (fingerprints.some((entry) => !entry)) return null;
  const canonical = (fingerprints as SignatureAssetFingerprint[]).sort((left, right) => (
    left.fieldId.localeCompare(right.fieldId) ||
    left.signerRole.localeCompare(right.signerRole) ||
    left.fieldType.localeCompare(right.fieldType) ||
    left.sha256.localeCompare(right.sha256)
  ));
  if (new Set(canonical.map((entry) => entry.fieldId)).size !== canonical.length) return null;
  return canonical;
}

async function signatureAssetEvidenceSha256(fingerprints: SignatureAssetFingerprint[]) {
  return sha256Hex(JSON.stringify(canonicalSignatureAssetFingerprints(fingerprints) || []));
}

async function readPhase3SignatureEvidence(
  payload: unknown,
  expectedFinalArtifactSha256: string,
  expectedFinalArtifactByteLength: number,
): Promise<Phase3SignatureEvidence | null> {
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as JsonRecord : {};
  const fingerprints = canonicalSignatureAssetFingerprints(record.signatureAssetFingerprints);
  const embeddedSignatureCount = Number(record.embeddedSignatureCount);
  const evidenceSha256 = lower(record.signatureAssetEvidenceSha256);
  if (
    normalizeText(record.signatureEvidenceContract) !== PHASE3_SIGNATURE_EVIDENCE_CONTRACT ||
    normalizeText(record.signatureEvidenceMode) !== PHASE3_SIGNATURE_EVIDENCE_MODE ||
    !fingerprints ||
    !Number.isSafeInteger(embeddedSignatureCount) ||
    embeddedSignatureCount < 1 ||
    fingerprints.length !== embeddedSignatureCount ||
    !/^[0-9a-f]{64}$/.test(evidenceSha256) ||
    lower(record.finalArtifactSha256) !== lower(expectedFinalArtifactSha256) ||
    Number(record.finalArtifactByteLength) !== expectedFinalArtifactByteLength
  ) {
    return null;
  }
  if (await signatureAssetEvidenceSha256(fingerprints) !== evidenceSha256) return null;
  return {
    signatureEvidenceContract: PHASE3_SIGNATURE_EVIDENCE_CONTRACT,
    signatureEvidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
    embeddedSignatureCount,
    signatureAssetEvidenceSha256: evidenceSha256,
    signatureAssetFingerprints: fingerprints,
  };
}

function phase3SignatureEvidenceMatches(
  left: Phase3SignatureEvidence,
  right: Phase3SignatureEvidence,
) {
  return (
    left.signatureEvidenceContract === right.signatureEvidenceContract &&
    left.signatureEvidenceMode === right.signatureEvidenceMode &&
    left.embeddedSignatureCount === right.embeddedSignatureCount &&
    left.signatureAssetEvidenceSha256 === right.signatureAssetEvidenceSha256 &&
    JSON.stringify(left.signatureAssetFingerprints) === JSON.stringify(right.signatureAssetFingerprints)
  );
}

function drawVisibleSignatureFingerprint({
  page,
  font,
  x,
  y,
  height,
  sha256,
  reserveForSignedDate = false,
}: {
  page: any;
  font: any;
  x: number;
  y: number;
  height: number;
  sha256: string;
  reserveForSignedDate?: boolean;
}) {
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const labelWidth = 184;
  const labelX = Math.max(4, Math.min(x, pageWidth - labelWidth));
  const belowY = y - (reserveForSignedDate ? 24 : 11);
  const above = belowY < 9;
  const firstLineY = above
    ? Math.min(pageHeight - 12, y + height + 8)
    : belowY;
  const secondLineY = above
    ? Math.min(pageHeight - 6, firstLineY + 5.5)
    : Math.max(3, firstLineY - 5.5);
  const safeSha256 = lower(sha256);
  page.drawText(`SHA-256: ${safeSha256.slice(0, 32)}`, {
    x: labelX,
    y: firstLineY,
    size: 4.8,
    font,
    color: rgb(0.22, 0.27, 0.34),
  });
  page.drawText(safeSha256.slice(32), {
    x: labelX,
    y: secondLineY,
    size: 4.8,
    font,
    color: rgb(0.22, 0.27, 0.34),
  });
}

function buildSignedFileName(packetType: string, versionNumber: number) {
  const safeType = normalizeText(packetType) || "packet";
  return `${safeType}-v${versionNumber}-final-signed.pdf`;
}

async function buildOverlayPdf({
  sourcePdfBytes,
}: {
  sourcePdfBytes: Uint8Array;
}) {
  return PDFDocument.load(sourcePdfBytes);
}

function getPlaceholderValue(placeholders: Record<string, unknown>, key: unknown) {
  const normalizedKey = normalizeText(key);
  if (!normalizedKey) return "";
  if (Object.prototype.hasOwnProperty.call(placeholders, normalizedKey)) {
    return normalizeText(placeholders[normalizedKey]);
  }
  const underscoreKey = normalizedKey.replace(/\./g, "_");
  if (Object.prototype.hasOwnProperty.call(placeholders, underscoreKey)) {
    return normalizeText(placeholders[underscoreKey]);
  }
  return "";
}

function pdfSafeText(value: unknown) {
  return normalizeText(value)
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveTemplateText(text: unknown, placeholders: Record<string, unknown>) {
  return pdfSafeText(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    return pdfSafeText(getPlaceholderValue(placeholders, key)) || "Not provided";
  });
}

function wrapPdfText(text: string, maxWidth: number, font: any, size: number) {
  const words = pdfSafeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function resolveSectionLabel(section: Record<string, unknown>, fallback = "Section") {
  return pdfSafeText(section.sectionLabel || section.label || section.section_key || section.key || fallback);
}

function normalizeSectionRows(section: Record<string, unknown>) {
  const rows = Array.isArray(section.placeholders) ? section.placeholders : [];
  return rows
    .map((row) => {
      if (Array.isArray(row)) return [row[0], row[1]] as [unknown, unknown];
      if (row && typeof row === "object") {
        const record = row as Record<string, unknown>;
        return [record.key || record.placeholderKey, record.label || record.placeholderLabel] as [unknown, unknown];
      }
      return [row, row] as [unknown, unknown];
    })
    .filter(([key]) => normalizeText(key));
}

function firstPdfText(...values: unknown[]) {
  return values.map((value) => pdfSafeText(value)).find(Boolean) || "";
}

function isEmptyPdfValue(value: unknown) {
  const normalized = pdfSafeText(value).toLowerCase().replace(/[\s._-]+/g, "_");
  return !normalized || ["na", "n_a", "n/a", "none", "unknown", "tbc", "missing", "not_applicable", "not_provided"].includes(normalized);
}

function firstMeaningfulPdfText(...values: unknown[]) {
  return values.map((value) => pdfSafeText(value)).find((value) => !isEmptyPdfValue(value)) || "";
}

function toPdfTitleCase(value: unknown) {
  return pdfSafeText(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatFallbackPlaceholderValue(key: unknown, value: unknown) {
  const text = pdfSafeText(value);
  if (!text) return "";
  const normalizedKey = lower(key);
  if (
    normalizedKey.includes("marital") ||
    normalizedKey.includes("entity_type") ||
    normalizedKey === "property_type" ||
    normalizedKey === "property_title_type" ||
    normalizedKey === "mandate_template_variant" ||
    normalizedKey === "mandate_clause_profile" ||
    normalizedKey === "seller_clause_profile" ||
    normalizedKey === "property_clause_profile" ||
    normalizedKey === "vat_handling"
  ) {
    return toPdfTitleCase(text);
  }
  return text;
}

function shouldSkipFallbackSectionRow(sectionKey: string, key: unknown, rawValue: unknown, placeholders: Record<string, unknown>) {
  if (sectionKey !== "property_details") return false;
  const normalizedKey = lower(key).replace(/\./g, "_");
  const optionalPropertyKeys = new Set([
    "property_unit_number",
    "unit_number",
    "property_section_number",
    "section_number",
    "sectional_title_number",
    "property_sectional_title_scheme",
    "property_complex_name",
    "property_estate_name",
    "property_estate_complex_name",
  ]);
  if (!optionalPropertyKeys.has(normalizedKey)) return false;
  const propertyType = lower(placeholders.property_title_type || placeholders["property.title_type_raw"] || placeholders.property_type || placeholders["property.type"]);
  const propertyLooksSectional =
    propertyType.includes("sectional") ||
    propertyType.includes("share_block") ||
    propertyType.includes("apartment") ||
    propertyType.includes("flat") ||
    propertyType.includes("unit");
  return !propertyLooksSectional && isEmptyPdfValue(rawValue);
}

function isBridgeAssetUrl(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return text.includes("/brand/bridge") || text.includes("bridge_9") || text.includes("bridge9");
}

function assignBrandingValue(target: Record<string, unknown>, key: string, value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return;
  if (["not provided", "not applicable", "n/a", "none"].includes(normalized.toLowerCase())) return;
  if (key === "organisationName" && normalized.toLowerCase() === "bridge workspace") return;
  const logoKeys = new Set([
    "logoLightUrl",
    "logoDarkUrl",
    "logoHighContrastUrl",
    "organisationLogoUrl",
    "organisationLogoDarkUrl",
    "organisationLogoHighContrastUrl",
  ]);
  if (logoKeys.has(key)) {
    if (isGeneratedAgencyLogoDataUrl(normalized)) return;
    const current = normalizeText(target[key]);
    if (current && isGeneratedAgencyLogoDataUrl(current) && !isGeneratedAgencyLogoDataUrl(normalized)) {
      target[key] = normalized;
      return;
    }
  }
  target[key] = normalized;
}

function mergeBrandingPayload(target: Record<string, unknown>, source: unknown) {
  const payload = source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : {};
  assignBrandingValue(target, "organisationId", payload.organisationId || payload.organisation_id);
  assignBrandingValue(target, "organisationName", payload.organisationName || payload.organisation_display_name || payload.displayName || payload.name);
  assignBrandingValue(target, "logoLightUrl", payload.logoLightUrl || payload.logo_light_url || payload.logoLight || payload.logo_light || payload.logoUrl || payload.logo_url);
  assignBrandingValue(target, "logoDarkUrl", payload.logoDarkUrl || payload.logo_dark_url || payload.logoDark || payload.logo_dark);
  assignBrandingValue(target, "logoHighContrastUrl", payload.logoHighContrastUrl || payload.logo_high_contrast_url);
  assignBrandingValue(target, "organisationLogoUrl", payload.organisationLogoUrl || payload.organisation_logo_url || payload.logoUrl || payload.logo_url || payload.logoLight || payload.logo_light);
  assignBrandingValue(target, "organisationLogoDarkUrl", payload.organisationLogoDarkUrl || payload.organisation_logo_dark_url || payload.logoDark || payload.logo_dark);
  assignBrandingValue(target, "organisationLogoHighContrastUrl", payload.organisationLogoHighContrastUrl || payload.organisation_logo_high_contrast_url);
  assignBrandingValue(target, "bridgeLogoLightUrl", payload.bridgeLogoLightUrl || payload.bridge_logo_light_url);
  assignBrandingValue(target, "bridgeLogoDarkUrl", payload.bridgeLogoDarkUrl || payload.bridge_logo_dark_url);
  assignBrandingValue(target, "bridgeLogoLabel", payload.bridgeLogoLabel || payload.bridge_logo_label);
  return target;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isGeneratedAgencyLogoDataUrl(value: unknown) {
  const normalized = normalizeText(value);
  if (normalized.toLowerCase().startsWith("data:image/svg+xml")) return true;
  const decoded = decodeURIComponent(normalized.split(",", 2)[1] || normalized).toLowerCase();
  return decoded.includes("<text") && decoded.includes("font-family=\"arial");
}

function removeGeneratedAgencyLogoFallbacks(branding: Record<string, unknown>) {
  for (const key of [
    "logoLightUrl",
    "logoDarkUrl",
    "logoHighContrastUrl",
    "organisationLogoUrl",
    "organisationLogoDarkUrl",
    "organisationLogoHighContrastUrl",
  ]) {
    if (isGeneratedAgencyLogoDataUrl(branding[key])) delete branding[key];
  }
  return branding;
}

async function createDocumentSignedUrl(supabase: any, path: string) {
  const normalizedPath = normalizeText(path);
  if (!normalizedPath || /^(https?:|data:|\/)/i.test(normalizedPath)) return normalizedPath;
  const bucketCandidates = parseBucketCandidates(
    Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
    Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
    Deno.env.get("DOCUMENTS_BUCKET"),
    Deno.env.get("SUPABASE_STORAGE_BUCKET"),
    "documents",
  );
  for (const bucket of [...new Set(bucketCandidates.filter(Boolean))]) {
    const result = await supabase.storage.from(bucket).createSignedUrl(normalizedPath, 60 * 60);
    if (!result.error && result.data?.signedUrl) return result.data.signedUrl;
  }
  return normalizedPath;
}

async function createSignedBrandingUrl(supabase: any, bucket: unknown, path: unknown, fallbackUrl: unknown = "") {
  const safeBucket = normalizeText(bucket);
  const safePath = normalizeText(path);
  const safeFallback = normalizeText(fallbackUrl);
  if (!safeBucket || !safePath) return safeFallback;
  const result = await supabase.storage.from(safeBucket).createSignedUrl(safePath, 60 * 60 * 24 * 30);
  if (!result.error && result.data?.signedUrl) return result.data.signedUrl;
  return safeFallback;
}

async function mergeOrganisationSettingsBranding(supabase: any, branding: Record<string, unknown>, organisationId: string) {
  const settingsResult = await supabase
    .from("organisation_settings")
    .select("settings_json")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (settingsResult.error || !settingsResult.data) return;
  const settings = normalizeJsonObject(settingsResult.data.settings_json);
  const agencyOnboarding = normalizeJsonObject(settings.agencyOnboarding || settings.agency_onboarding);
  const settingsBranding = normalizeJsonObject(agencyOnboarding.branding || settings.branding);
  if (!Object.keys(settingsBranding).length) return;
  const brandColours = normalizeJsonObject(settingsBranding.brandColours || settingsBranding.brand_colours);
  const logoLight = await createSignedBrandingUrl(
    supabase,
    settingsBranding.logoLightBucket,
    settingsBranding.logoLightPath,
    settingsBranding.logoLight || settingsBranding.logoLightUrl || settingsBranding.logo_url,
  );
  const logoDark = await createSignedBrandingUrl(
    supabase,
    settingsBranding.logoDarkBucket,
    settingsBranding.logoDarkPath,
    settingsBranding.logoDark || settingsBranding.logoDarkUrl,
  );
  mergeBrandingPayload(branding, {
    logoLightUrl: logoLight,
    logoDarkUrl: logoDark,
    organisationLogoUrl: logoLight,
    organisationLogoDarkUrl: logoDark,
    primaryBrandColor: brandColours.primary,
    secondaryBrandColor: brandColours.secondary,
  });
}

async function fetchOrganisationBranding(supabase: any, organisationId: string) {
  const resolvedOrganisationId = normalizeText(organisationId);
  if (!resolvedOrganisationId) return {};

  const branding: Record<string, unknown> = {};
  const orgResult = await supabase
    .from("organisations")
    .select("id, name, display_name, logo_url")
    .eq("id", resolvedOrganisationId)
    .maybeSingle();
  if (!orgResult.error && orgResult.data) {
    mergeBrandingPayload(branding, {
      organisationId: orgResult.data.id,
      organisationName: orgResult.data.display_name || orgResult.data.name,
      logoUrl: orgResult.data.logo_url,
    });
  }

  const brandingResult = await supabase
    .from("organisation_branding")
    .select("organisation_id, organisation_display_name, logo_light_url, logo_dark_url, logo_high_contrast_url, primary_brand_color, secondary_brand_color, accent_brand_color")
    .eq("organisation_id", resolvedOrganisationId)
    .maybeSingle();
  if (!brandingResult.error && brandingResult.data) {
    const data = { ...brandingResult.data } as Record<string, unknown>;
    data.logo_light_url = await createDocumentSignedUrl(supabase, normalizeText(data.logo_light_url));
    data.logo_dark_url = await createDocumentSignedUrl(supabase, normalizeText(data.logo_dark_url));
    data.logo_high_contrast_url = await createDocumentSignedUrl(supabase, normalizeText(data.logo_high_contrast_url));
    mergeBrandingPayload(branding, data);
  }

  await mergeOrganisationSettingsBranding(supabase, branding, resolvedOrganisationId);

  return removeGeneratedAgencyLogoFallbacks(branding);
}

function resolveAssetUrl(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (/^(https?:|data:)/i.test(raw)) return raw;
  const base = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || Deno.env.get("VITE_SITE_URL")) || "https://app.arch9.co.za";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base.replace(/\/+$/, "")}${path}`;
}

function decodeDataUrlBytes(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
  if (!match) return null;
  const mimeType = normalizeText(match[1]).toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  if (mimeType.includes("svg")) return null;
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType };
}

async function fetchImageAsset(source: string) {
  const resolved = resolveAssetUrl(source);
  if (!resolved) return null;
  if (resolved.startsWith("data:")) return decodeDataUrlBytes(resolved);

  try {
    const response = await fetch(resolved);
    if (!response.ok) return null;
    const contentType = normalizeText(response.headers.get("content-type")).toLowerCase();
    if (contentType.includes("svg")) return null;
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: contentType,
    };
  } catch (_error) {
    return null;
  }
}

async function embedImageAsset(pdf: PDFDocument, source: string) {
  const asset = await fetchImageAsset(source);
  if (!asset?.bytes?.length) return null;
  const mimeType = asset.mimeType;
  try {
    if (mimeType.includes("jpeg") || mimeType.includes("jpg") || source.toLowerCase().match(/\.jpe?g(\?|$)/)) {
      return await pdf.embedJpg(asset.bytes);
    }
    return await pdf.embedPng(asset.bytes);
  } catch (_error) {
    return null;
  }
}

function drawContainedImage({
  page,
  image,
  x,
  y,
  maxWidth,
  maxHeight,
}: {
  page: any;
  image: any;
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
}) {
  if (!image) return false;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x,
    y: y + (maxHeight - height) / 2,
    width,
    height,
  });
  return true;
}

function resolveStructuredFallbackSignatureSlot({
  field,
  index,
  pageWidth,
  pageHeight,
}: {
  field: Record<string, unknown>;
  index: number;
  pageWidth: number;
  pageHeight: number;
}) {
  const marginX = 90;
  const columnGap = 52;
  const slotWidth = (pageWidth - marginX * 2 - columnGap) / 2;
  const rowHeight = 138;
  const row = Math.floor(index / 2);
  const column = index % 2;
  const x = marginX + column * (slotWidth + columnGap);
  const lineY = pageHeight - 705 - row * rowHeight;
  const width = slotWidth;
  const height = 58;
  const y = lineY + 12;
  const role = lower(field.signer_role);
  const roleLabel = role === "agent" ? "Agent / Agency Representative" : role === "seller" ? "Seller" : pdfSafeText(role.replace(/_/g, " "));
  return {
    x,
    y,
    width,
    height,
    lineY,
    roleLabel,
  };
}

function normalizeNullableUuid(value: unknown) {
  const normalized = normalizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[^0-9.,-]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function createListingReference() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `PL-${day}-${suffix}`;
}

function firstValue(...values: unknown[]) {
  return values.map((value) => normalizeText(value)).find(Boolean) || "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstMissingText(current: unknown, ...fallbacks: unknown[]) {
  return normalizeText(current) || firstValue(...fallbacks) || null;
}

function firstMissingNumber(current: unknown, fallback: unknown) {
  const existing = normalizeNumber(current);
  return existing === null ? normalizeNumber(fallback) : existing;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = lower(value).replace(/[\s-]+/g, "_");
  return ["true", "yes", "y", "1", "on", "enabled"].includes(normalized);
}

function normalizeFeatureKey(value: unknown) {
  return lower(value).replace(/[\s-]+/g, "_");
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = normalizeNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function addPublicationFeature(features: Set<string>, key: string, enabled: boolean) {
  const normalized = normalizeFeatureKey(key);
  if (enabled && normalized) features.add(normalized);
}

function resolveParkingBays(formData: Record<string, unknown>) {
  const explicit = firstNumber(formData.parkingBays, formData.parking_bays);
  if (explicit !== null) return explicit;
  const covered = firstNumber(formData.parkingCovered, formData.coveredParking, formData.garages);
  const open = firstNumber(formData.parkingOpen, formData.openParking);
  if (covered === null && open === null) return null;
  return (covered || 0) + (open || 0);
}

function resolvePublicationDescription(formData: Record<string, unknown>) {
  const notes = firstValue(formData.propertyDescription, formData.description, formData.propertyNotes, formData.listingPreviewDescription);
  if (notes) return notes;
  const conditionParts = [
    firstValue(formData.propertyCondition),
    firstValue(formData.kitchenCondition),
    firstValue(formData.bathroomCondition),
  ].filter(Boolean);
  return conditionParts.length ? `Condition: ${conditionParts.join(", ")}` : "";
}

function buildPublicationDraftFromSellerOnboarding({
  listing,
  formData,
}: {
  listing: Record<string, unknown>;
  formData: Record<string, unknown>;
}) {
  const canonicalFacts = asRecord(formData.canonicalSellerFacts || formData.canonicalFacts);
  const propertyFacts = asRecord(canonicalFacts.property);
  const transactionFacts = asRecord(canonicalFacts.transaction);
  const complianceFacts = asRecord(canonicalFacts.compliance);
  const features = new Set<string>(
    Array.isArray(formData.features) ? formData.features.map(normalizeFeatureKey).filter(Boolean) : [],
  );

  addPublicationFeature(features, "pool", normalizeBoolean(formData.pool) || normalizeBoolean(formData.swimmingPool) || normalizeBoolean(complianceFacts.swimming_pool));
  addPublicationFeature(features, "electric_fence", normalizeBoolean(formData.electricFence) || normalizeBoolean(complianceFacts.electric_fence));
  addPublicationFeature(features, "solar", normalizeBoolean(formData.solarInstallation) || normalizeBoolean(complianceFacts.solar_installation));
  addPublicationFeature(features, "borehole", normalizeBoolean(formData.borehole) || normalizeBoolean(complianceFacts.borehole));
  addPublicationFeature(features, "gas_installation", normalizeBoolean(formData.gasInstallation) || normalizeBoolean(complianceFacts.gas_installation));
  addPublicationFeature(features, "estate_or_hoa", normalizeBoolean(formData.estateOrHoa) || normalizeBoolean(propertyFacts.estate_or_hoa));
  addPublicationFeature(features, "sectional_title", normalizeBoolean(formData.sectionalTitle) || normalizeBoolean(propertyFacts.sectional_title));

  return {
    title: firstValue(formData.listingTitle, formData.propertyAddress, propertyFacts.address, listing.title, listing.address_line_1),
    address: firstValue(formData.propertyAddress, propertyFacts.address, listing.address_line_1, listing.title),
    suburb: firstValue(formData.suburb, propertyFacts.suburb, listing.suburb),
    province: firstValue(formData.province, propertyFacts.province, listing.province),
    property_type: firstValue(formData.propertyType, propertyFacts.property_type, listing.property_type),
    listing_type: "Sale",
    asking_price: firstNumber(formData.askingPrice, transactionFacts.asking_price, listing.asking_price, listing.estimated_value),
    bedrooms: firstNumber(formData.bedrooms),
    bathrooms: firstNumber(formData.bathrooms),
    garages: firstNumber(formData.garages),
    parking_bays: resolveParkingBays(formData),
    floor_size: firstNumber(formData.floorSize, propertyFacts.floor_size),
    erf_size: firstNumber(formData.erfSize, propertyFacts.erf_size),
    rates_taxes: firstNumber(formData.ratesTaxes, propertyFacts.rates_taxes),
    levies: firstNumber(formData.levies, propertyFacts.levies),
    description: resolvePublicationDescription(formData),
    features: Array.from(features),
    amenities: [],
    status: "Draft",
  };
}

function mergePublicationDraft(existing: Record<string, unknown>, draft: Record<string, unknown>) {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    const current = existing[key];
    if (Array.isArray(value)) {
      merged[key] = Array.isArray(current) && current.length ? current : value;
    } else if (typeof value === "number") {
      merged[key] = normalizeNumber(current) === null ? value : normalizeNumber(current);
    } else {
      merged[key] = normalizeText(current) || value || null;
    }
  }
  merged.status = normalizeText(existing.status) || normalizeText(draft.status) || "Draft";
  return merged;
}

async function syncListingPublicationDraftFromSellerOnboarding({
  supabase,
  listingId,
  listing,
  formData,
}: {
  supabase: any;
  listingId: string;
  listing: Record<string, unknown>;
  formData: Record<string, unknown>;
}) {
  if (!listingId || !Object.keys(formData || {}).length) return null;
  const draft = buildPublicationDraftFromSellerOnboarding({ listing, formData });
  const existing = await supabase
    .from("listing_publication_data")
    .select("title, address, suburb, province, property_type, listing_type, asking_price, bedrooms, bathrooms, garages, parking_bays, floor_size, erf_size, rates_taxes, levies, description, features, amenities, status")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (existing.error) {
    console.error("[final-signed] publication draft lookup failed", { listingId, error: String(existing.error?.message || existing.error) });
    return null;
  }

  const merged = mergePublicationDraft(asRecord(existing.data), draft);
  const result = await supabase
    .from("listing_publication_data")
    .upsert({ listing_id: listingId, ...merged }, { onConflict: "listing_id" })
    .select("id, listing_id, status")
    .maybeSingle();
  if (result.error) {
    console.error("[final-signed] publication draft sync failed", { listingId, error: String(result.error?.message || result.error) });
    return null;
  }
  return result.data || null;
}

function resolveSignedMandateListingStatus(current: unknown) {
  const status = lower(current);
  if (["active", "under_offer", "transaction_created", "sold", "withdrawn"].includes(status)) return status;
  return "active";
}

function listingAlreadyOwnsOperationalFields(status: unknown) {
  return ["mandate_signed", "active", "under_offer", "transaction_created", "sold", "withdrawn"].includes(lower(status));
}

const SIGNED_MANDATE_LISTING_SELECT =
  "id, assigned_agent_id, seller_lead_id, originating_crm_lead_id, listing_status, listing_visibility, mandate_status, seller_onboarding_status, is_active, title, address_line_1, property_type, suburb, city, province, asking_price, estimated_value";

function isUniqueViolation(error: unknown) {
  const details = asRecord(error);
  return normalizeText(details.code) === "23505" || lower(details.message).includes("duplicate key");
}

async function fetchSignedMandateListingById({
  supabase,
  organisationId,
  listingId,
}: {
  supabase: any;
  organisationId: string;
  listingId: string;
}) {
  if (!normalizeNullableUuid(listingId)) return null;
  const query = await supabase
    .from("private_listings")
    .select(SIGNED_MANDATE_LISTING_SELECT)
    .eq("organisation_id", organisationId)
    .eq("id", listingId)
    .maybeSingle();
  if (!query.error && query.data) return query.data as Record<string, unknown>;
  return null;
}

async function fetchSignedMandateListingByLeadColumn({
  supabase,
  organisationId,
  leadId,
  column,
}: {
  supabase: any;
  organisationId: string;
  leadId: string;
  column: "originating_crm_lead_id" | "seller_lead_id";
}) {
  if (!leadId) return null;
  const query = await supabase
    .from("private_listings")
    .select(SIGNED_MANDATE_LISTING_SELECT)
    .eq("organisation_id", organisationId)
    .eq(column, leadId)
    .neq("listing_status", "withdrawn")
    .neq("listing_visibility", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!query.error && query.data) return query.data as Record<string, unknown>;
  return null;
}

async function findExistingSignedMandateListing({
  supabase,
  organisationId,
  linkedListingId,
  leadId,
}: {
  supabase: any;
  organisationId: string;
  linkedListingId: string;
  leadId: string;
}) {
  return await fetchSignedMandateListingById({
    supabase,
    organisationId,
    listingId: linkedListingId,
  }) ||
    await fetchSignedMandateListingByLeadColumn({
      supabase,
      organisationId,
      leadId,
      column: "originating_crm_lead_id",
    }) ||
    await fetchSignedMandateListingByLeadColumn({
      supabase,
      organisationId,
      leadId,
      column: "seller_lead_id",
    });
}

function resolveSellerOnboardingSnapshot({
  sourceContext,
  generatedSnapshot,
  sourceLead,
  lead,
}: {
  sourceContext: Record<string, unknown>;
  generatedSnapshot: Record<string, unknown>;
  sourceLead: Record<string, unknown>;
  lead: Record<string, unknown> | null;
}) {
  const sourceContextSellerOnboarding = asRecord(sourceContext.sellerOnboarding || sourceContext.seller_onboarding);
  const sourceLeadSellerOnboarding = asRecord(sourceLead.sellerOnboarding || sourceLead.seller_onboarding);
  const generatedOnboarding = asRecord(generatedSnapshot.onboarding);
  const sourceContextOnboardingFormData = asRecord(sourceContext.onboardingFormData || sourceContext.onboarding_form_data);
  const sourceContextSellerFormData = asRecord(sourceContextSellerOnboarding.formData || sourceContextSellerOnboarding.form_data);
  const sourceLeadSellerFormData = asRecord(sourceLeadSellerOnboarding.formData || sourceLeadSellerOnboarding.form_data);
  const sourceSnapshot = asRecord(generatedSnapshot.sourceSnapshot || generatedSnapshot.source_snapshot);
  const propertyDisclosureAnnexure = asRecord(
    sourceContext.propertyDisclosureAnnexure ||
      sourceContext.property_disclosure_annexure ||
      generatedSnapshot.propertyDisclosureAnnexure ||
      generatedSnapshot.property_disclosure_annexure ||
      sourceSnapshot.propertyDisclosureAnnexure ||
      sourceSnapshot.property_disclosure_annexure,
  );

  const formData = {
    ...sourceContextOnboardingFormData,
    ...sourceContextSellerFormData,
    ...generatedOnboarding,
    ...sourceLeadSellerFormData,
  };
  const status = firstValue(
    sourceLeadSellerOnboarding.status,
    sourceLead.sellerOnboardingStatus,
    sourceLead.seller_onboarding_status,
    sourceContextSellerOnboarding.status,
    lead?.seller_onboarding_status,
  ) || (Object.keys(formData).length ? "completed" : "not_started");

  return {
    formData,
    status,
    token: firstValue(
      sourceLeadSellerOnboarding.token,
      sourceContextSellerOnboarding.token,
      sourceContext.sellerOnboardingToken,
      sourceContext.seller_onboarding_token,
      lead?.seller_onboarding_token,
    ),
    submittedAt: firstValue(
      sourceLeadSellerOnboarding.submittedAt,
      sourceLeadSellerOnboarding.submitted_at,
      sourceLeadSellerOnboarding.completedAt,
      sourceLeadSellerOnboarding.completed_at,
    ),
    sellerType: firstValue(generatedOnboarding.ownershipType, generatedOnboarding.sellerType, formData.ownershipType, formData.sellerType),
    ownershipStructure: firstValue(generatedOnboarding.ownershipType, formData.ownershipType),
    maritalRegime: firstValue(generatedOnboarding.maritalRegime, generatedOnboarding.marriageRegime, formData.maritalRegime, formData.marriageRegime),
    propertyDisclosureAnnexure,
  };
}

async function ensureSellerOnboardingSnapshotForListing({
  supabase,
  listingId,
  snapshot,
  lockContext = {},
}: {
  supabase: any;
  listingId: string;
  snapshot: ReturnType<typeof resolveSellerOnboardingSnapshot>;
  lockContext?: Record<string, unknown>;
}) {
  if (!listingId || !snapshot || (!Object.keys(snapshot.formData || {}).length && !snapshot.token)) return null;

  const existing = await supabase
    .from("private_listing_seller_onboarding")
    .select("id, private_listing_id, token, status, seller_type, ownership_structure, marital_regime, form_data, submitted_at")
    .eq("private_listing_id", listingId)
    .maybeSingle();

  if (existing.error) {
    console.error("[final-signed] seller onboarding snapshot lookup failed", {
      listingId,
      error: String(existing.error?.message || existing.error),
    });
    return null;
  }

  const existingFormData = asRecord(existing.data?.form_data);
  const nextFormData = {
    ...(snapshot.formData || {}),
    ...existingFormData,
  };
  const disclosure = asRecord(nextFormData.propertyDisclosure || nextFormData.property_disclosure);
  const annexureSnapshot = asRecord(snapshot.propertyDisclosureAnnexure);
  if (Object.keys(disclosure).length || Object.keys(annexureSnapshot).length) {
    const existingLock = asRecord(disclosure.lockedSnapshot || disclosure.locked_snapshot);
    const lockedSnapshot = Object.keys(existingLock).length
      ? existingLock
      : {
        ...annexureSnapshot,
        sourceDisclosure: disclosure,
        immutable: true,
        readOnly: true,
        lockedAt: firstValue(lockContext.lockedAt) || new Date().toISOString(),
        lockedByPacketId: firstValue(lockContext.packetId),
        lockedByPacketVersionId: firstValue(lockContext.packetVersionId),
        finalSignedFilePath: firstValue(lockContext.finalArtifactPath),
        lockReason: "mandate_final_signed",
        lockSource: "generate-final-signed-document",
      };
    const normalizedDisclosure = {
      ...disclosure,
      locked: true,
      lockStatus: "locked",
      lockedSnapshot,
      locked_snapshot: lockedSnapshot,
    };
    nextFormData.propertyDisclosure = normalizedDisclosure;
    nextFormData.property_disclosure = normalizedDisclosure;
  }
  const status = lower(snapshot.status) === "completed" || lower(existing.data?.status) === "completed"
    ? "completed"
    : firstValue(existing.data?.status, snapshot.status) || "not_started";
  const token = firstValue(existing.data?.token, snapshot.token) || `seller-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const submittedAt = firstValue(existing.data?.submitted_at, snapshot.submittedAt) || (status === "completed" ? new Date().toISOString() : null);

  const payload = {
    private_listing_id: listingId,
    token,
    status,
    seller_type: firstValue(existing.data?.seller_type, snapshot.sellerType) || null,
    ownership_structure: firstValue(existing.data?.ownership_structure, snapshot.ownershipStructure) || null,
    marital_regime: firstValue(existing.data?.marital_regime, snapshot.maritalRegime) || null,
    form_data: nextFormData,
    submitted_at: submittedAt,
  };

  const result = existing.data?.id
    ? await supabase
      .from("private_listing_seller_onboarding")
      .update(payload)
      .eq("id", existing.data.id)
      .select("id, private_listing_id, token, status")
      .maybeSingle()
    : await supabase
      .from("private_listing_seller_onboarding")
      .insert(payload)
      .select("id, private_listing_id, token, status")
      .maybeSingle();

  if (result.error) {
    console.error("[final-signed] seller onboarding snapshot sync failed", {
      listingId,
      error: String(result.error?.message || result.error),
    });
    return null;
  }
  return result.data || null;
}

async function updateLeadConversionLink({
  supabase,
  organisationId,
  leadId,
  listingId,
  packetId,
}: {
  supabase: any;
  organisationId: string;
  leadId: string;
  listingId: string;
  packetId: string;
}) {
  if (!organisationId || !leadId || !listingId) return false;
  const fullPayload = {
    stage: "Listing Live",
    status: "Live",
    listing_id: listingId,
    mandate_packet_id: packetId || null,
    updated_at: new Date().toISOString(),
  };
  let result = await supabase
    .from("leads")
    .update(fullPayload)
    .eq("organisation_id", organisationId)
    .eq("lead_id", leadId)
    .select("lead_id")
    .maybeSingle();
  if (!result.error) return Boolean(result.data);

  result = await supabase
    .from("leads")
    .update({
      stage: "Listing Live",
      status: "Live",
      updated_at: fullPayload.updated_at,
    })
    .eq("organisation_id", organisationId)
    .eq("lead_id", leadId)
    .select("lead_id")
    .maybeSingle();
  return !result.error && Boolean(result.data);
}

async function ensureListingFromSignedMandate({
  supabase,
  packet,
  version,
  finalArtifactPath,
}: {
  supabase: any;
  packet: Record<string, unknown>;
  version: Record<string, unknown>;
  finalArtifactPath: string;
}) {
  if (lower(packet.packet_type) !== "mandate") return null;
  const organisationId = normalizeText(packet.organisation_id);
  if (!organisationId) return null;
  const sourceContext = packet.source_context_json && typeof packet.source_context_json === "object"
    ? packet.source_context_json as Record<string, unknown>
    : {};
  const validationSummary = version.validation_summary_json && typeof version.validation_summary_json === "object"
    ? version.validation_summary_json as Record<string, unknown>
    : {};
  const versionGeneratedSnapshot = validationSummary.generatedDataSnapshot && typeof validationSummary.generatedDataSnapshot === "object"
    ? validationSummary.generatedDataSnapshot as Record<string, unknown>
    : {};
  const generatedSnapshot = sourceContext.generatedDataSnapshot && typeof sourceContext.generatedDataSnapshot === "object"
    ? sourceContext.generatedDataSnapshot as Record<string, unknown>
    : versionGeneratedSnapshot;
  const sourceSnapshot = generatedSnapshot.sourceSnapshot && typeof generatedSnapshot.sourceSnapshot === "object"
    ? generatedSnapshot.sourceSnapshot as Record<string, unknown>
    : {};
  const sourceLead = sourceSnapshot.lead && typeof sourceSnapshot.lead === "object"
    ? sourceSnapshot.lead as Record<string, unknown>
    : {};
  const placeholders = version?.placeholders_resolved_json && typeof version.placeholders_resolved_json === "object"
    ? version.placeholders_resolved_json as Record<string, unknown>
    : generatedSnapshot.placeholders && typeof generatedSnapshot.placeholders === "object"
      ? generatedSnapshot.placeholders as Record<string, unknown>
      : {};
  const leadId = normalizeText(
    packet.lead_id ||
      sourceContext.leadId ||
      sourceContext.lead_id ||
      sourceLead.lead_id ||
      sourceLead.id,
  );
  const existingListingId = normalizeText(sourceContext.privateListingId || sourceContext.private_listing_id || sourceContext.listingId || sourceContext.listing_id);

  let lead: Record<string, unknown> | null = null;
  if (leadId) {
    const leadQuery = await supabase
      .from("leads")
      .select("lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, stage, status, budget, area_interest, property_interest, seller_property_address, estimated_value, seller_onboarding_token, seller_onboarding_status, listing_id")
      .eq("organisation_id", organisationId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!leadQuery.error && leadQuery.data) {
      lead = leadQuery.data as Record<string, unknown>;
    }
  }

  const linkedListingId = normalizeText(existingListingId || lead?.listing_id);
  let listing: Record<string, unknown> | null = await findExistingSignedMandateListing({
    supabase,
    organisationId,
    linkedListingId,
    leadId,
  });

  const title = firstValue(
    placeholders.property_address,
    placeholders["property.address"],
    lead?.property_interest,
    lead?.seller_property_address,
    packet.title,
  );
  const address = firstValue(
    placeholders.property_address,
    placeholders["property.address"],
    lead?.seller_property_address,
    title,
  );
  const askingPrice = normalizeNumber(
    placeholders.property_asking_price ||
      placeholders.asking_price ||
      placeholders.listing_price ||
      lead?.estimated_value ||
      lead?.budget,
  );
  const sellerOnboardingSnapshot = resolveSellerOnboardingSnapshot({
    sourceContext,
    generatedSnapshot,
    sourceLead,
    lead,
  });
  const sellerOnboardingStatus = normalizeText(lead?.seller_onboarding_status).toLowerCase() === "completed"
    || normalizeText(sourceLead.sellerOnboardingStatus || sourceLead.seller_onboarding_status).toLowerCase() === "completed"
    || normalizeText(sellerOnboardingSnapshot.status).toLowerCase() === "completed"
    || Object.keys(asRecord(sellerOnboardingSnapshot.formData)).length > 0
    ? "completed"
    : "not_started";
  let existingListingFound = Boolean(listing?.id);

  if (listing?.id) {
    const existingSellerOnboardingStatus = lower(listing.seller_onboarding_status);
    const nextListingStatus = resolveSignedMandateListingStatus(listing.listing_status);
    const autoActivated = nextListingStatus === "active";
    const listingOwnsOperationalFields = listingAlreadyOwnsOperationalFields(listing.listing_status);
    const listingUpdatePayload = {
      // Once a listing has entered mandate-signed or later, acquisition data
      // may only sync lifecycle/linkage fields. Listing-owned operational
      // fields must not be backfilled from a later-edited lead.
      assigned_agent_id: listingOwnsOperationalFields
        ? normalizeNullableUuid(listing.assigned_agent_id)
        : normalizeNullableUuid(listing.assigned_agent_id || lead?.assigned_agent_id || sourceContext.assignedAgentId || sourceContext.assigned_agent_id || sourceLead.assignedAgentId || sourceLead.assigned_agent_id),
      seller_lead_id: normalizeText(listing.seller_lead_id) || leadId || null,
      originating_crm_lead_id: normalizeText(listing.originating_crm_lead_id) || leadId || null,
      listing_status: nextListingStatus,
      listing_visibility: autoActivated
        ? normalizeText(listing.listing_visibility) || "active_market"
        : normalizeText(listing.listing_visibility) || "internal",
      mandate_status: "signed",
      mandate_packet_id: normalizeText(packet.id) || null,
      seller_onboarding_status: sellerOnboardingStatus === "completed" || !existingSellerOnboardingStatus || existingSellerOnboardingStatus === "not_started"
        ? sellerOnboardingStatus
        : existingSellerOnboardingStatus,
      is_active: autoActivated ? true : Boolean(listing.is_active),
      title: listingOwnsOperationalFields ? normalizeText(listing.title) || null : firstMissingText(listing.title, title),
      address_line_1: listingOwnsOperationalFields ? normalizeText(listing.address_line_1) || null : firstMissingText(listing.address_line_1, address),
      property_type: listingOwnsOperationalFields ? normalizeText(listing.property_type) || null : firstMissingText(listing.property_type, placeholders.property_type, placeholders["property.property_type"]),
      suburb: listingOwnsOperationalFields ? normalizeText(listing.suburb) || null : firstMissingText(listing.suburb, placeholders.property_suburb, placeholders["property.suburb"], lead?.area_interest),
      city: listingOwnsOperationalFields ? normalizeText(listing.city) || null : firstMissingText(listing.city, placeholders.property_city, placeholders["property.city"]),
      province: listingOwnsOperationalFields ? normalizeText(listing.province) || null : firstMissingText(listing.province, placeholders.property_province, placeholders["property.province"]),
      asking_price: listingOwnsOperationalFields ? normalizeNumber(listing.asking_price) : firstMissingNumber(listing.asking_price, askingPrice),
      estimated_value: listingOwnsOperationalFields ? normalizeNumber(listing.estimated_value) : firstMissingNumber(listing.estimated_value, askingPrice),
      updated_at: new Date().toISOString(),
    };
    await supabase
      .from("private_listings")
      .update(listingUpdatePayload)
      .eq("id", String(listing.id));
    listing = { ...listing, ...listingUpdatePayload };
  } else {
    const insertPayload = {
      organisation_id: organisationId,
      assigned_agent_id: normalizeNullableUuid(lead?.assigned_agent_id || sourceContext.assignedAgentId || sourceContext.assigned_agent_id || sourceLead.assignedAgentId || sourceLead.assigned_agent_id),
      seller_lead_id: leadId || null,
      originating_crm_lead_id: leadId || null,
      listing_reference: createListingReference(),
      listing_status: "active",
      listing_visibility: "active_market",
      property_type: firstValue(placeholders.property_type, placeholders["property.property_type"]) || null,
      listing_category: "private_sale",
      title: title || null,
      description: null,
      asking_price: askingPrice,
      estimated_value: askingPrice,
      address_line_1: address || null,
      suburb: firstValue(placeholders.property_suburb, placeholders["property.suburb"], lead?.area_interest) || null,
      city: firstValue(placeholders.property_city, placeholders["property.city"]) || null,
      province: firstValue(placeholders.property_province, placeholders["property.province"]) || null,
      seller_type: firstValue(placeholders.seller_entity_type, placeholders["seller.entity_type"]) || null,
      mandate_type: firstValue(placeholders.mandate_type, placeholders["mandate.type"]) || "sole",
      mandate_status: "signed",
      mandate_packet_id: normalizeText(packet.id) || null,
      seller_onboarding_status: sellerOnboardingStatus,
      is_active: true,
      created_by: null,
    };
    const insert = await supabase
      .from("private_listings")
      .insert(insertPayload)
      .select("id, listing_status, mandate_status")
      .single();
    if (insert.error) {
      if (!isUniqueViolation(insert.error)) throw insert.error;
      listing = await findExistingSignedMandateListing({
        supabase,
        organisationId,
        linkedListingId,
        leadId,
      });
      if (!listing?.id) throw insert.error;
      existingListingFound = true;
    } else {
      listing = insert.data as Record<string, unknown>;
    }
  }

  const listingId = normalizeText(listing?.id);
  if (!listingId) return null;

  const onboardingSnapshotSync = await ensureSellerOnboardingSnapshotForListing({
    supabase,
    listingId,
    snapshot: sellerOnboardingSnapshot,
    lockContext: {
      packetId: normalizeText(packet.id),
      packetVersionId: normalizeText(version.id),
      finalArtifactPath: finalArtifactPath || null,
      lockedAt: new Date().toISOString(),
    },
  });

  await syncListingPublicationDraftFromSellerOnboarding({
    supabase,
    listingId,
    listing: {
      ...(listing || {}),
      title,
      address_line_1: address,
      property_type: firstValue((listing || {}).property_type, placeholders.property_type, placeholders["property.property_type"]),
      suburb: firstValue((listing || {}).suburb, placeholders.property_suburb, placeholders["property.suburb"], lead?.area_interest),
      city: firstValue((listing || {}).city, placeholders.property_city, placeholders["property.city"]),
      province: firstValue((listing || {}).province, placeholders.property_province, placeholders["property.province"]),
      asking_price: firstNumber((listing || {}).asking_price, askingPrice),
      estimated_value: firstNumber((listing || {}).estimated_value, askingPrice),
    },
    formData: asRecord(sellerOnboardingSnapshot.formData),
  }).catch((error) => {
    console.error("[final-signed] publication draft sync skipped", { listingId, error: String(error?.message || error) });
    return null;
  });

  await updateLeadConversionLink({
    supabase,
    organisationId,
    leadId,
    listingId,
    packetId: normalizeText(packet.id),
  }).catch((error) => {
    console.error("[final-signed] lead conversion linkage failed", { packetId: packet.id, leadId, listingId, error: String(error) });
  });

  try {
    await supabase.from("private_listing_activity").insert({
      private_listing_id: listingId,
      activity_type: "mandate_signed",
      activity_title: "Mandate signed",
      activity_description: "All required mandate signers completed. The linked listing was created or promoted to live automatically.",
      performed_by: null,
      visibility: "client_visible",
      metadata: {
        source: "signed_mandate_auto_conversion",
        leadId: leadId || null,
        packetId: normalizeText(packet.id),
        packetVersionId: normalizeText(version.id),
        finalArtifactPath: finalArtifactPath || null,
      },
      created_at: new Date().toISOString(),
    });
  } catch (_error) {
    // Activity logging is best-effort; the signed record and listing conversion are the source of truth.
  }

  try {
    await supabase
      .from("document_packets")
      .update({
        source_context_json: {
          ...sourceContext,
          listingId,
          listing_id: listingId,
          privateListingId: listingId,
          private_listing_id: listingId,
          leadConvertedToListingAt: new Date().toISOString(),
        },
      })
      .eq("id", normalizeText(packet.id));
  } catch (_error) {
    // Conversion should never block access to the signed legal record.
  }

  return {
    listingId,
    leadId: leadId || null,
    existing: existingListingFound,
    onboardingSnapshotSynced: Boolean(onboardingSnapshotSync?.id),
    onboardingFieldCount: Object.keys(sellerOnboardingSnapshot.formData || {}).length,
  };
}

async function buildFallbackMandatePdfBytes({
  packet,
  version,
  fields,
  branding = {},
}: {
  packet: Record<string, unknown>;
  version: Record<string, unknown>;
  fields: Record<string, unknown>[];
  branding?: Record<string, unknown>;
}) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 842;
  const pageHeight = 1191;
  const marginX = 90;
  const marginBottom = 82;
  const placeholders = version?.placeholders_resolved_json && typeof version.placeholders_resolved_json === "object"
    ? version.placeholders_resolved_json as Record<string, unknown>
    : {};
  const sectionManifest = Array.isArray(version?.section_manifest_json) ? version.section_manifest_json as Record<string, unknown>[] : [];
  const pages: any[] = [];
  const navy = rgb(0.07, 0.13, 0.22);
  const muted = rgb(0.35, 0.42, 0.50);
  const rule = rgb(0.82, 0.84, 0.86);
  const orgName = firstPdfText(
    branding.organisationName,
    branding.organisation_name,
    placeholders.organisation_display_name ||
      placeholders.organisation_name ||
      placeholders.agency_name ||
      placeholders.agency ||
      "Agency",
  );
  const agencyLogoCandidates = [
    { value: branding.logoLightUrl, needsDarkPlate: false },
    { value: branding.organisationLogoUrl, needsDarkPlate: false },
    { value: placeholders.organisation_logo_url, needsDarkPlate: true },
    { value: placeholders["organisation.logo_url"], needsDarkPlate: true },
    { value: placeholders.logoLightUrl, needsDarkPlate: true },
    { value: placeholders.organisationLogoUrl, needsDarkPlate: true },
    { value: placeholders.agency_logo_url, needsDarkPlate: true },
    { value: placeholders["agency.logo_url"], needsDarkPlate: true },
    { value: branding.logoHighContrastUrl, needsDarkPlate: false },
    { value: branding.logoDarkUrl, needsDarkPlate: false },
    { value: branding.organisationLogoHighContrastUrl, needsDarkPlate: false },
    { value: branding.organisationLogoDarkUrl, needsDarkPlate: false },
  ];
  const agencyLogoChoice = agencyLogoCandidates
    .map((candidate) => ({ ...candidate, value: normalizeText(candidate.value) }))
    .find((candidate) => candidate.value && !isBridgeAssetUrl(candidate.value)) || { value: "", needsDarkPlate: false };
  const agencyLogoUrl = agencyLogoChoice.value;
  const agencyLogo = await embedImageAsset(pdf, agencyLogoUrl);
  const agencyRegistrationNumber = firstMeaningfulPdfText(placeholders.agency_registration_number);
  const agencyVatNumber = firstMeaningfulPdfText(placeholders.agency_vat_number);
  const agencyFspNumber = firstMeaningfulPdfText(placeholders.agency_fsp_number);
  const companyDetailLines = [
    firstMeaningfulPdfText(placeholders.agency_legal_name, placeholders.organisation_legal_name, orgName),
    agencyRegistrationNumber ? `Reg: ${agencyRegistrationNumber}` : "",
    agencyVatNumber ? `VAT: ${agencyVatNumber}` : "",
    agencyFspNumber ? `FSP: ${agencyFspNumber}` : "",
    firstMeaningfulPdfText(placeholders.agency_address, placeholders.organisation_physical_address, placeholders["organisation.physical_address"]),
  ].filter((line) => !isEmptyPdfValue(line));
  const documentReference =
    firstPdfText(placeholders.document_reference, placeholders.transaction_reference) ||
    firstPdfText(packet.title) ||
    "Mandate Agreement";

  const drawRightAlignedLine = ({
    page,
    text,
    y,
    size,
    font,
    color,
    maxWidth,
  }: {
    page: any;
    text: string;
    y: number;
    size: number;
    font: any;
    color: ReturnType<typeof rgb>;
    maxWidth: number;
  }) => {
    const line = pdfSafeText(text);
    if (!line) return;
    const x = pageWidth - marginX - Math.min(font.widthOfTextAtSize(line, size), maxWidth);
    page.drawText(line, { x, y, size, font, color });
  };

  const drawCompanyDetails = (page: any) => {
    const maxWidth = 285;
    let detailY = pageHeight - 82;
    const lines = companyDetailLines.length ? companyDetailLines : [orgName];
    for (const [index, line] of lines.entries()) {
      const font = index === 0 ? boldFont : regularFont;
      const size = index === 0 ? 10.5 : 9.2;
      for (const wrappedLine of wrapPdfText(line, maxWidth, font, size).slice(0, index === lines.length - 1 ? 2 : 1)) {
        drawRightAlignedLine({
          page,
          text: wrappedLine,
          y: detailY,
          size,
          font,
          color: index === 0 ? navy : muted,
          maxWidth,
        });
        detailY -= index === 0 ? 13 : 11.5;
      }
      if (detailY < pageHeight - 142) break;
    }
  };

  const drawBrandHeader = (page: any) => {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    });
    const agencyLogoBox = {
      x: marginX,
      y: pageHeight - 136,
      width: agencyLogoChoice.needsDarkPlate ? 174 : 150,
      height: agencyLogoChoice.needsDarkPlate ? 74 : 62,
    };
    if (agencyLogo && agencyLogoChoice.needsDarkPlate) {
      page.drawRectangle({
        x: agencyLogoBox.x - 10,
        y: agencyLogoBox.y - 7,
        width: agencyLogoBox.width,
        height: agencyLogoBox.height,
        color: navy,
      });
    }
    const drewAgencyLogo = drawContainedImage({
      page,
      image: agencyLogo,
      x: agencyLogoChoice.needsDarkPlate ? agencyLogoBox.x : marginX,
      y: agencyLogoChoice.needsDarkPlate ? agencyLogoBox.y : pageHeight - 130,
      maxWidth: agencyLogoChoice.needsDarkPlate ? 154 : 150,
      maxHeight: agencyLogoChoice.needsDarkPlate ? 60 : 62,
    });
    if (!drewAgencyLogo) {
      page.drawText(orgName.toLowerCase().includes("samlin") ? "SAMLIN" : orgName.toUpperCase(), {
        x: marginX,
        y: pageHeight - 95,
        size: orgName.length > 18 ? 22 : 30,
        font: boldFont,
        color: navy,
      });
      if (orgName.toLowerCase().includes("samlin")) {
        page.drawText("REAL ESTATE", {
          x: marginX + 2,
          y: pageHeight - 123,
          size: 13,
          font: boldFont,
          color: navy,
        });
      }
    }
    drawCompanyDetails(page);
    page.drawLine({
      start: { x: marginX, y: pageHeight - 155 },
      end: { x: pageWidth - marginX, y: pageHeight - 155 },
      thickness: 1,
      color: rule,
    });
  };

  const drawPageFooter = (page: any, pageNumber: number, pageCount: number) => {
    page.drawText(`Page ${pageNumber} of ${pages.length}`, {
      x: pageWidth / 2 - 32,
      y: 42,
      size: 9,
      font: regularFont,
      color: muted,
    });
  };

  const addPage = () => {
    const nextPage = pdf.addPage([pageWidth, pageHeight]);
    pages.push(nextPage);
    drawBrandHeader(nextPage);
    return nextPage;
  };

  const firstPage = addPage();
  firstPage.drawText("MANDATE AGREEMENT", {
    x: pageWidth / 2 - boldFont.widthOfTextAtSize("MANDATE AGREEMENT", 28) / 2,
    y: pageHeight - 225,
    size: 28,
    font: boldFont,
    color: navy,
  });
  firstPage.drawText(`Document reference: ${documentReference}`, {
    x: pageWidth / 2 - regularFont.widthOfTextAtSize(`Document reference: ${documentReference}`, 12) / 2,
    y: pageHeight - 252,
    size: 12,
    font: regularFont,
    color: muted,
  });
  firstPage.drawLine({
    start: { x: marginX, y: pageHeight - 290 },
    end: { x: pageWidth - marginX, y: pageHeight - 290 },
    thickness: 1,
    color: rule,
  });

  let pageIndex = 0;
  let page = pages[pageIndex];
  let y = pageHeight - 350;

  const moveToNextContentPage = () => {
    pageIndex += 1;
    page = pages[pageIndex] || addPage();
    y = pageHeight - 205;
    return true;
  };

  const ensureSpace = (height: number) => {
    if (y - height >= marginBottom) return;
    moveToNextContentPage();
  };

  const drawWrapped = ({
    text,
    x,
    width,
    size = 12,
    font = regularFont,
    color = navy,
    lineHeight = size * 1.48,
  }: {
    text: string;
    x: number;
    width: number;
    size?: number;
    font?: any;
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
  }) => {
    const lines = wrapPdfText(text, width, font, size);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
    }
  };

  const drawSectionHeading = (index: number, label: string) => {
    ensureSpace(34);
    const heading = `${index}.  ${label.toUpperCase()}`;
    page.drawText(heading, { x: marginX, y, size: 15, font: boldFont, color: navy });
    y -= 18;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1,
      color: rule,
    });
    y -= 18;
  };

  const nonSignatureSections = sectionManifest.filter((section) => lower(section.key || section.section_key) !== "signature_pages");
  const signatureSectionIndex = Math.max(1, sectionManifest.findIndex((section) => lower(section.key || section.section_key) === "signature_pages") + 1);
  const sectionsToRender = nonSignatureSections.length ? nonSignatureSections : [];

  sectionsToRender.forEach((section, index) => {
    drawSectionHeading(index + 1, resolveSectionLabel(section, `Section ${index + 1}`));
    const sectionKey = lower(section.key || section.section_key);
    if (sectionKey === "introduction_purpose") {
      const intro =
        resolveTemplateText(section.legalText || section.legal_text, placeholders) ||
        getPlaceholderValue(placeholders, "mandate_introduction_purpose") ||
        getPlaceholderValue(placeholders, "introduction_purpose") ||
        "";
      drawWrapped({ text: intro || "Not provided", x: marginX, width: pageWidth - marginX * 2, size: 12.5, lineHeight: 18 });
      y -= 14;
      return;
    }

    const rows = normalizeSectionRows(section);
    let renderedRowIndex = 0;
    for (const [key, rawLabel] of rows) {
      const rawValue = getPlaceholderValue(placeholders, key);
      if (shouldSkipFallbackSectionRow(sectionKey, key, rawValue, placeholders)) continue;
      renderedRowIndex += 1;
      const label = pdfSafeText(rawLabel || key);
      const value = formatFallbackPlaceholderValue(key, rawValue) || "Not provided";
      const valueLines = wrapPdfText(value, 400, regularFont, 11.5);
      const rowHeight = Math.max(24, valueLines.length * 15);
      ensureSpace(rowHeight + 5);
      page.drawText(`${index + 1}.${renderedRowIndex}`, {
        x: marginX,
        y,
        size: 10.5,
        font: boldFont,
        color: muted,
      });
      page.drawText(label, {
        x: marginX + 50,
        y,
        size: 10.5,
        font: boldFont,
        color: rgb(0.24, 0.29, 0.34),
      });
      let rowY = y;
      for (const line of valueLines) {
        page.drawText(line, {
          x: marginX + 270,
          y: rowY,
          size: 11.5,
          font: regularFont,
          color: navy,
        });
        rowY -= 15;
      }
      y -= rowHeight;
    }
    y -= 10;
  });

  if (y < 505) moveToNextContentPage();
  const signaturePage = page;
  const signaturePageNumber = pageIndex + 1;
  signaturePage.drawText(`${signatureSectionIndex}.  SIGNATURE PAGES`, {
    x: marginX,
    y,
    size: 16,
    font: boldFont,
    color: navy,
  });
  y -= 20;
  signaturePage.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 1,
    color: rule,
  });

  const signatureFields = fields.filter((field) => lower(field.field_type) === "signature");
  for (const [index, field] of signatureFields.entries()) {
    const slot = resolveStructuredFallbackSignatureSlot({ field, index, pageWidth, pageHeight });
    const role = lower(field.signer_role);
    const name = pdfSafeText(field.signer_name || getPlaceholderValue(placeholders, `${role}_full_name`) || getPlaceholderValue(placeholders, `${role}.display_name`) || slot.roleLabel);
    signaturePage.drawLine({
      start: { x: slot.x, y: slot.lineY },
      end: { x: slot.x + slot.width, y: slot.lineY },
      thickness: 1,
      color: navy,
    });
    signaturePage.drawText(slot.roleLabel, {
      x: slot.x,
      y: slot.lineY - 25,
      size: 11,
      font: boldFont,
      color: navy,
    });
    signaturePage.drawText(name, {
      x: slot.x,
      y: slot.lineY - 47,
      size: 10,
      font: regularFont,
      color: navy,
    });
  }

  pages.forEach((footerPage, index) => drawPageFooter(footerPage, index + 1, pages.length));

  return pdf.save();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  const finalisationStartedAt = Date.now();
  const finalisationRequestId = crypto.randomUUID();
  let observedPacketId = "";
  let observedPacketVersionId = "";
  let observedPacketType = "";
  let observedEmbeddedSignatureCount = 0;
  let observedEvidenceMode = "";
  let observedOutputBytes: number | null = null;
  let finalisationSupabase: any = null;
  let provisionalFinalBucket = "";
  let provisionalFinalPath = "";
  let provisionalFinalDocumentId = "";
  let provisionalFinalSha256 = "";
  let provisionalFinalByteLength = 0;
  let f2FinalArtifactAttempted = false;
  let f2FinalArtifactRecorded = false;
  const finalisationFailureResponse = (statusCode: number, body: JsonRecord) => {
    logFinalisation("error", "final_signed_finalisation_failed", {
      requestId: finalisationRequestId,
      packetId: observedPacketId || null,
      packetVersionId: observedPacketVersionId || null,
      packetType: observedPacketType || null,
      durationMs: Date.now() - finalisationStartedAt,
      errorCode: normalizeText(body.errorCode) || "FINAL_SIGNED_GENERATION_FAILED",
      evidenceMode: observedEvidenceMode || null,
      embeddedSignatureCount: observedEmbeddedSignatureCount,
      outputBytes: observedOutputBytes,
    });
    return jsonResponse(statusCode, body);
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const payload = (await req.json()) as GenerateFinalSignedPayload;
    const packetId = normalizeText(payload.packetId || payload.packet_id);
    observedPacketId = packetId;
    if (!packetId) {
      return jsonResponse(400, {
        success: false,
        error: "packetId is required.",
        errorCode: "MISSING_PACKET_ID",
      });
    }

    const requestedVersionId = normalizeText(payload.packetVersionId || payload.packet_version_id);
    observedPacketVersionId = requestedVersionId;
    if (!requestedVersionId) {
      return jsonResponse(400, {
        success: false,
        error: "packetVersionId is required for exact-version finalisation.",
        errorCode: "FINAL_VERSION_ID_REQUIRED",
      });
    }
    let finalisedBy = normalizeText(payload.finalisedBy || payload.finalised_by) || null;
    const explicitOutputBucket = normalizeText(payload.outputBucket || payload.output_bucket);
    const forceRegenerate = Boolean(payload.forceRegenerate || payload.force_regenerate || payload.replaceExisting || payload.replace_existing);

    logFinalisation("info", "final_signed_finalisation_started", {
      requestId: finalisationRequestId,
      packetId,
      packetVersionId: requestedVersionId,
      evidenceMode: "pending",
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    finalisationSupabase = supabase;

    const packetResult = await supabase
      .from("document_packets")
      .select("id, organisation_id, packet_type, title, assigned_agent_id, created_by, status, current_version_number, transaction_id, lead_id, source_context_json, branding_snapshot_json")
      .eq("id", packetId)
      .maybeSingle();
    if (packetResult.error) throw packetResult.error;
    const packet = packetResult.data as Record<string, unknown> | null;
    if (!packet) {
      return finalisationFailureResponse(404, {
        success: false,
        error: "Packet not found.",
        errorCode: "PACKET_NOT_FOUND",
      });
    }
    observedPacketType = lower(packet.packet_type);
    const authority = await authorizeFinalisation(req, supabase, SUPABASE_SERVICE_ROLE_KEY, packet);
    if (!authority) return finalisationFailureResponse(403, { success: false, error: "You are not allowed to finalise this mandate.", errorCode: "FINALISATION_FORBIDDEN" });
    if (!authority.service) finalisedBy = authority.userId;
    const versionQuery = supabase
      .from("document_packet_versions")
      .select(
        "id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_bucket, rendered_file_path, rendered_file_name, rendered_file_url, rendered_media_type, rendered_byte_length, rendered_sha256, render_input_verified, transaction_pdf_persisted, native_pdf_verified, final_signed_file_path, final_signed_file_url, final_signed_file_bucket, final_signed_document_id, final_signed_file_name, finalised_at, placeholders_resolved_json, section_manifest_json, validation_summary_json",
      )
      .eq("id", requestedVersionId)
      .eq("packet_id", packetId)
      .limit(1);

    const versionResult = await versionQuery.maybeSingle();
    if (versionResult.error) throw versionResult.error;
    const version = versionResult.data as Record<string, unknown> | null;
    if (!version) {
      return finalisationFailureResponse(400, {
        success: false,
        error: "No generated packet version found.",
        errorCode: "NO_GENERATED_VERSION",
      });
    }

    const finalVersionBindingValid =
      normalizeText(version.organisation_id) === normalizeText(packet.organisation_id) &&
      Number(version.version_number) === Number(packet.current_version_number) &&
      lower(version.render_status) === "generated" &&
      ["sent", "partially_signed", "completed"].includes(lower(packet.status));
    if (!finalVersionBindingValid) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "Finalisation is not bound to the exact current generated document version.",
        errorCode: "FINAL_VERSION_BINDING_INVALID",
      });
    }

    const renderedFilePath = normalizeText(version.rendered_file_path);
    const renderedDocumentId = normalizeText(version.rendered_document_id);
    const renderedFileBucket = normalizeText(version.rendered_file_bucket);
    const renderedMediaType = lower(version.rendered_media_type);
    const renderedByteLength = Number(version.rendered_byte_length);
    const renderedSha256 = lower(version.rendered_sha256);
    const sourcePdfCertified =
      Boolean(version.render_input_verified) &&
      Boolean(version.transaction_pdf_persisted) &&
      Boolean(version.native_pdf_verified) &&
      renderedMediaType === "application/pdf" &&
      /^sha256:[0-9a-f]{64}$/.test(renderedSha256) &&
      Number.isFinite(renderedByteLength) &&
      renderedByteLength > 0;
    if (!renderedDocumentId || !renderedFileBucket || !renderedFilePath || !isPdfPath(renderedFilePath) || !sourcePdfCertified) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "Finalisation requires the exact certified, persisted source PDF for this packet version.",
        errorCode: "FINAL_SOURCE_PDF_REQUIRED",
      });
    }

    const sourceDocumentResult = await supabase
      .from("documents")
      .select("id, legal_packet_id, legal_packet_version_id, generated_artifact_bucket, generated_artifact_sha256, file_path")
      .eq("id", renderedDocumentId)
      .maybeSingle();
    if (sourceDocumentResult.error) throw sourceDocumentResult.error;
    const sourceDocument = sourceDocumentResult.data as Record<string, unknown> | null;
    if (
      !sourceDocument ||
      normalizeText(sourceDocument.legal_packet_id) !== packetId ||
      normalizeText(sourceDocument.legal_packet_version_id) !== normalizeText(version.id) ||
      normalizeText(sourceDocument.generated_artifact_bucket) !== renderedFileBucket ||
      normalizeText(sourceDocument.file_path) !== renderedFilePath ||
      lower(sourceDocument.generated_artifact_sha256) !== renderedSha256
    ) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "The certified source PDF document link is missing or has changed.",
        errorCode: "FINAL_SOURCE_PDF_LINK_INVALID",
      });
    }

    // Finalisation creates the F2 artifact and can promote it to shared
    // documents, transaction/portal surfaces, and mandate-listing state. Do
    // not permit any of those writes merely because an older generated
    // artifact has a binding: its immutable binding must name the exact plan
    // currently active in the server release guard. Historical completed
    // artifacts remain available only through the signer-bound resolver,
    // which is intentionally read-only under a later release hold.
    try {
      const activeRelease = assertLegalDocumentPilotRelease({
        organisationId: packet.organisation_id,
        operation: "final_delivery",
      });
      await assertLegalDocumentPilotLifecycleBinding({
        supabase,
        packetId,
        packetVersionId: normalizeText(version.id),
        activeRelease,
      });
    } catch (error) {
      const typed = error as { code?: unknown; status?: unknown; message?: unknown };
      const status = Number(typed.status);
      return finalisationFailureResponse(Number.isFinite(status) ? status : 403, {
        success: false,
        error: normalizeText(typed.message) || "Legal-document finalisation is not enabled for this packet organisation.",
        errorCode: normalizeText(typed.code) || "LEGAL_DOCUMENT_PILOT_RELEASE_BLOCKED",
        pilotReleaseContract: LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
      });
    }

    const sourceDownload = await supabase.storage.from(renderedFileBucket).download(renderedFilePath);
    if (sourceDownload.error || !sourceDownload.data) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "The exact source PDF cannot be read from controlled storage.",
        errorCode: "FINAL_SOURCE_PDF_UNREADABLE",
      });
    }
    const sourcePdfBytes = new Uint8Array(await sourceDownload.data.arrayBuffer());
    if (new TextDecoder().decode(sourcePdfBytes.subarray(0, 4)) !== "%PDF") {
      return finalisationFailureResponse(422, {
        success: false,
        error: "The persisted source artifact is not a valid PDF.",
        errorCode: "FINAL_SOURCE_PDF_INVALID",
      });
    }
    if (
      sourcePdfBytes.length !== renderedByteLength ||
      `sha256:${await sha256Hex(sourcePdfBytes)}` !== renderedSha256
    ) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "The persisted source PDF bytes do not match its certified record.",
        errorCode: "FINAL_SOURCE_PDF_INTEGRITY_MISMATCH",
      });
    }
    const sourceFormat = "pdf";
    const existingFinalPath = normalizeText(version.final_signed_file_path);
    if (existingFinalPath && forceRegenerate) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "The F2 final signed artifact is immutable and cannot be replaced.",
        errorCode: "FINAL_SIGNED_ARTIFACT_IMMUTABLE",
      });
    }
    if (existingFinalPath && !forceRegenerate) {
      const existingEvidenceResult = await supabase
        .from("legal_final_artifact_evidence")
        .select("bucket, path, file_name, media_type, sha256, byte_length, generated_at, signature_evidence_contract, signature_evidence_mode, embedded_signature_count, signature_asset_evidence_sha256, signature_asset_fingerprints_json")
        .eq("packet_version_id", requestedVersionId)
        .maybeSingle();
      if (existingEvidenceResult.error) throw existingEvidenceResult.error;
      const existingEvidence = existingEvidenceResult.data as Record<string, unknown> | null;
      if (!existingEvidence || normalizeText(existingEvidence.path) !== existingFinalPath) {
        return finalisationFailureResponse(409, { success: false, error: "Existing final artifact has no matching F2 evidence.", errorCode: "FINAL_ARTIFACT_EVIDENCE_MISSING" });
      }
      const existingDownload = await supabase.storage.from(normalizeText(existingEvidence.bucket)).download(existingFinalPath);
      if (existingDownload.error || !existingDownload.data) return finalisationFailureResponse(409, { success: false, error: "Existing final artifact cannot be read.", errorCode: "FINAL_ARTIFACT_UNREADABLE" });
      const existingBytes = new Uint8Array(await existingDownload.data.arrayBuffer());
      if (await sha256Hex(existingBytes) !== normalizeText(existingEvidence.sha256) || existingBytes.length !== Number(existingEvidence.byte_length)) {
        return finalisationFailureResponse(409, { success: false, error: "Existing final artifact bytes do not match F2 evidence.", errorCode: "FINAL_ARTIFACT_INTEGRITY_MISMATCH" });
      }
      let existingPhase3Evidence: Phase3SignatureEvidence | null = null;
      {
        const existingEventResult = await supabase
          .from("document_packet_events")
          .select("event_payload_json, created_at")
          .eq("packet_id", packetId)
          .eq("version_id", requestedVersionId)
          .eq("event_type", "final_signed_document_generated")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingEventResult.error) throw existingEventResult.error;
        const expectedArtifactSha256 = normalizeText(existingEvidence.sha256);
        const expectedArtifactByteLength = Number(existingEvidence.byte_length);
        const existingEventPhase3Evidence = await readPhase3SignatureEvidence(
          existingEventResult.data?.event_payload_json,
          expectedArtifactSha256,
          expectedArtifactByteLength,
        );
        const existingPersistedPhase3Evidence = await readPhase3SignatureEvidence(
          {
            signatureEvidenceContract: existingEvidence.signature_evidence_contract,
            signatureEvidenceMode: existingEvidence.signature_evidence_mode,
            embeddedSignatureCount: existingEvidence.embedded_signature_count,
            signatureAssetEvidenceSha256: existingEvidence.signature_asset_evidence_sha256,
            signatureAssetFingerprints: existingEvidence.signature_asset_fingerprints_json,
            finalArtifactSha256: expectedArtifactSha256,
            finalArtifactByteLength: expectedArtifactByteLength,
          },
          expectedArtifactSha256,
          expectedArtifactByteLength,
        );
        if (
          !existingEventPhase3Evidence ||
          !existingPersistedPhase3Evidence ||
          !phase3SignatureEvidenceMatches(existingEventPhase3Evidence, existingPersistedPhase3Evidence)
        ) {
          return finalisationFailureResponse(409, {
            success: false,
            error: "The existing final document does not contain the required visual signature evidence and cannot be delivered or downloaded.",
            errorCode: "FINAL_SIGNATURE_EVIDENCE_REQUIRED",
            retryable: false,
            requiredAction: "REISSUE_CANONICAL_SIGNED_PDF",
          });
        }
        existingPhase3Evidence = existingEventPhase3Evidence;
        observedEvidenceMode = existingPhase3Evidence.signatureEvidenceMode;
        observedEmbeddedSignatureCount = existingPhase3Evidence.embeddedSignatureCount;
        observedOutputBytes = existingBytes.length;
      }
      let existingFinalDocumentId = normalizeText(version.final_signed_document_id);
      if (!existingFinalDocumentId) {
        const repairDocumentId = await createInternalFinalSignedDocument({
          supabase,
          transactionId: normalizeText(packet.transaction_id),
          fileName: normalizeText(existingEvidence.file_name) || buildSignedFileName(normalizeText(packet.packet_type), safeNumber(version.version_number, 1)),
          bucket: normalizeText(existingEvidence.bucket),
          path: existingFinalPath,
          finalisedBy: null,
          createdAt: normalizeText(version.finalised_at) || new Date().toISOString(),
        });
        if (repairDocumentId) {
          const linkedDocumentId = await linkFinalSignedDocumentToVersion({
            supabase,
            packetId,
            packetVersionId: normalizeText(version.id),
            documentId: repairDocumentId,
          });
          if (linkedDocumentId !== repairDocumentId) {
            await supabase.from("documents").delete().eq("id", repairDocumentId);
          }
          existingFinalDocumentId = linkedDocumentId;
        }
      }
      if (!existingFinalDocumentId || !(await publishFinalSignedDocument({
        supabase,
        documentId: existingFinalDocumentId,
        path: existingFinalPath,
      }))) {
        logFinalisation("error", "final_signed_document_publication_pending", {
          requestId: finalisationRequestId,
          packetId,
          packetVersionId: normalizeText(version.id),
          packetType: observedPacketType,
          durationMs: Date.now() - finalisationStartedAt,
          errorCode: "FINAL_SIGNED_DOCUMENT_PUBLICATION_PENDING",
          evidenceMode: observedEvidenceMode || null,
          embeddedSignatureCount: observedEmbeddedSignatureCount,
          outputBytes: existingBytes.length,
        });
        return finalisationFailureResponse(503, {
          success: false,
          error: "The final signed PDF is safely recorded, but its client document publication is pending. Retry finalisation to complete publication.",
          errorCode: "FINAL_SIGNED_DOCUMENT_PUBLICATION_PENDING",
          retryable: true,
        });
      }
      const finalisedVersion = {
        ...version,
        final_signed_document_id: existingFinalDocumentId,
      };
      const listingConversion = await ensureListingFromSignedMandate({
        supabase,
        packet,
        version: finalisedVersion,
        finalArtifactPath: existingFinalPath,
      }).catch((error) => {
        logFinalisation("error", "final_signed_listing_conversion_failed", {
          requestId: finalisationRequestId,
          packetId,
          packetVersionId: normalizeText(version.id),
          packetType: observedPacketType,
          durationMs: Date.now() - finalisationStartedAt,
          errorCode: normalizeText(error?.code) || "LISTING_CONVERSION_FAILED",
          evidenceMode: observedEvidenceMode || null,
          embeddedSignatureCount: observedEmbeddedSignatureCount,
          outputBytes: existingBytes.length,
        });
        return {
          success: false,
          error: "Listing conversion could not be completed.",
          errorCode: normalizeText(error?.code) || "LISTING_CONVERSION_FAILED",
        };
      });
      const finalDelivery = await dispatchFinalDelivery({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY, packetId, packetVersionId: requestedVersionId });
      logFinalisation("info", "final_signed_finalisation_reused", {
        requestId: finalisationRequestId,
        packetId,
        packetVersionId: normalizeText(version.id),
        packetType: observedPacketType,
        durationMs: Date.now() - finalisationStartedAt,
        evidenceMode: observedEvidenceMode || null,
        embeddedSignatureCount: observedEmbeddedSignatureCount,
        outputBytes: existingBytes.length,
      });
      return jsonResponse(200, {
        success: true,
        packetId,
        packetVersionId: version.id,
        finalArtifact: buildFinalArtifactAccessDescriptor({
          packetId,
          packetVersionId: version.id,
          documentId: existingFinalDocumentId,
          fileName: normalizeText(version.final_signed_file_name) || buildSignedFileName(normalizeText(packet.packet_type), safeNumber(version.version_number, 1)),
          sha256: normalizeText(existingEvidence.sha256),
          byteLength: Number(existingEvidence.byte_length),
          finalisedAt: normalizeText(version.finalised_at) || null,
        }),
        version: buildFinalisationVersionDescriptor({
          packetId,
          version: finalisedVersion,
          documentId: existingFinalDocumentId,
          fileName: normalizeText(version.final_signed_file_name) || buildSignedFileName(normalizeText(packet.packet_type), safeNumber(version.version_number, 1)),
          sha256: normalizeText(existingEvidence.sha256),
          byteLength: Number(existingEvidence.byte_length),
          finalisedAt: normalizeText(version.finalised_at) || null,
        }),
        listingConversion,
        finalDelivery: buildFinalDeliverySummary(finalDelivery),
        sourceFormat,
        note: "Final signed document already exists for this packet version.",
      });
    }

    const fieldsResult = await supabase
      .from("document_signing_fields")
      .select(
        "id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, signature_asset_path, signature_asset_url",
      )
      .eq("packet_id", packetId)
      .eq("packet_version_id", String(version.id || ""))
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (fieldsResult.error) throw fieldsResult.error;
    const rawFields = (fieldsResult.data || []) as Record<string, unknown>[];
    const spouseRequiredForVersion = resolveMandateSpouseRequiredForFields(packet, rawFields);

    const signersResult = await supabase
      .from("document_packet_signers")
      .select("id, signer_role, signer_email, signer_name, status, signed_at")
      .eq("packet_id", packetId)
      .eq("packet_version_id", String(version.id || ""));
    if (signersResult.error) throw signersResult.error;
    const signers = ((signersResult.data || []) as Record<string, unknown>[])
      .filter((signer) => mandateRoleIsRequired(packet, signer.signer_role, spouseRequiredForVersion));
    if (!signers.length) {
      return finalisationFailureResponse(400, {
        success: false,
        error: "No signers configured for this packet version.",
        errorCode: "MISSING_SIGNERS",
      });
    }

    const incompleteSigners = signers.filter((signer) => lower(signer.status) !== "signed");
    if (incompleteSigners.length) {
      return finalisationFailureResponse(400, {
        success: false,
        error: "Required signers are incomplete.",
        errorCode: "SIGNERS_INCOMPLETE",
        details: { incompleteSignerCount: incompleteSigners.length },
      });
    }

    const fields = rawFields
      .filter((field) => mandateRoleIsRequired(packet, field.signer_role, spouseRequiredForVersion));

    const requiredFields = fields.filter((field) => Boolean(field.required));
    const incompleteFields = requiredFields.filter((field) => lower(field.status) !== "completed");
    if (incompleteFields.length) {
      return finalisationFailureResponse(400, {
        success: false,
        error: "Required signing fields are incomplete.",
        errorCode: "FIELDS_INCOMPLETE",
        details: { incompleteFieldCount: incompleteFields.length },
      });
    }

    const signatureFields = requiredFields.filter(fieldIsSignatureLike);
    if (!signatureFields.length) {
      return finalisationFailureResponse(409, {
        success: false,
        error: "At least one required signature or initial field is required before finalisation.",
        errorCode: "SIGNATURE_EVIDENCE_FIELDS_REQUIRED",
      });
    }
    const allRequiredSignatureFields = rawFields.filter((field) => Boolean(field.required) && fieldIsSignatureLike(field));
    const embeddedFieldIds = new Set(signatureFields.map((field) => normalizeText(field.id)).filter(Boolean));
    const allRequiredFieldIds = new Set(allRequiredSignatureFields.map((field) => normalizeText(field.id)).filter(Boolean));
    const signatureEvidenceScopeMatches =
      embeddedFieldIds.size === signatureFields.length &&
      allRequiredFieldIds.size === allRequiredSignatureFields.length &&
      embeddedFieldIds.size === allRequiredFieldIds.size &&
      [...allRequiredFieldIds].every((fieldId) => embeddedFieldIds.has(fieldId));
    if (!signatureEvidenceScopeMatches) {
      observedEmbeddedSignatureCount = embeddedFieldIds.size;
      return finalisationFailureResponse(409, {
        success: false,
        error: "Every database-required signature and initial field must be included in the final visual evidence set.",
        errorCode: "SIGNATURE_EVIDENCE_FIELD_SCOPE_MISMATCH",
        details: {
          requiredSignatureFieldCount: allRequiredFieldIds.size,
          eligibleSignatureFieldCount: embeddedFieldIds.size,
        },
      });
    }
    const missingAssets = signatureFields.filter((field) => !normalizeText(field.signature_asset_path));
    if (missingAssets.length) {
      throw new SignatureAssetEmbedError("SIGNATURE_ASSET_PATH_MISSING");
    }
    const misScopedAssets = signatureFields.filter((field) => {
      const fieldRole = lower(field.signer_role);
      const fieldEmail = lower(field.signer_email);
      const matchingSigner = signers.find((signer) => lower(signer.signer_role) === fieldRole && (!fieldEmail || lower(signer.signer_email) === fieldEmail));
      return !matchingSigner || !normalizeText(field.signature_asset_path).startsWith(`document-signatures/${packetId}/${normalizeText(matchingSigner.id)}/`);
    });
    if (misScopedAssets.length) {
      return finalisationFailureResponse(403, {
        success: false,
        error: "A required signing asset is outside its signer-owned storage namespace.",
        errorCode: "SIGNATURE_ASSET_SCOPE_INVALID",
        details: { invalidAssetFieldCount: misScopedAssets.length },
      });
    }

    const signatureBucketCandidates = parseBucketCandidates(
      Deno.env.get("SIGNATURES_BUCKET"),
      Deno.env.get("SUPABASE_SIGNATURES_BUCKET"),
      renderedFileBucket,
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      "document-signatures",
      "documents",
    );
    const pdf = await buildOverlayPdf({
      sourcePdfBytes,
    });
    const dateFont = await pdf.embedFont(StandardFonts.Helvetica);
    const signerSignedAtByRole = signers.reduce((accumulator, signer) => {
      const role = lower(signer.signer_role);
      if (role) accumulator[role] = normalizeText(signer.signed_at);
      return accumulator;
    }, {} as Record<string, string>);
    const signatureAssetFingerprints: SignatureAssetFingerprint[] = [];

    for (const field of signatureFields) {
      const pages = pdf.getPages();
      const pageNumber = Math.max(1, safeNumber(field.page_number, 1));
      if (pageNumber > pages.length) {
        return finalisationFailureResponse(422, {
          success: false,
          error: `Signing field ${normalizeText(field.id)} targets a page outside the final PDF.`,
          errorCode: "SIGNATURE_FIELD_PAGE_INVALID",
        });
      }
      const page = pages[pageNumber - 1];

      const assetPath = normalizeText(field.signature_asset_path);
      if (!assetPath) continue;
      const assetDownload = await readImageBytes({
        supabase,
        assetPath,
        buckets: signatureBucketCandidates,
      });
      if (!assetDownload?.bytes?.length) {
        throw new SignatureAssetEmbedError("SIGNATURE_ASSET_FILE_UNREADABLE");
      }

      try {
        const inspectedImage = inspectSignatureImage(assetDownload.bytes);
        const assetSha256 = await sha256Hex(assetDownload.bytes);
        const fieldId = normalizeText(field.id);
        const signerRole = lower(field.signer_role);
        const fieldType = lower(field.field_type);
        if (!fieldId || !signerRole || !["signature", "initial"].includes(fieldType)) {
          throw new SignatureAssetEmbedError("SIGNATURE_EVIDENCE_FIELD_INVALID");
        }

        const embedded = inspectedImage.imageFormat === "jpeg"
          ? await pdf.embedJpg(assetDownload.bytes)
          : await pdf.embedPng(assetDownload.bytes);
        const width = Math.max(8, safeNumber(field.width, 120));
        const height = Math.max(8, safeNumber(field.height, 36));
        const x = Math.max(0, safeNumber(field.x_position, 0));
        const yFromTop = Math.max(0, safeNumber(field.y_position, 0));
        const y = Math.max(0, page.getHeight() - yFromTop - height);

        // White-back transparent PNGs on the PDF canvas. This preserves the
        // exact certified source PDF and makes the final visible mark stable
        // even when an image asset contains an alpha channel.
        if (inspectedImage.hasTransparency) {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(1, 1, 1),
          });
        }
        page.drawImage(embedded, { x, y, width, height });

        const isSignatureField = fieldType === "signature";
        if (isSignatureField) {
          const signedAt = normalizeText(signerSignedAtByRole[signerRole]);
          const signedDate = signedAt ? new Date(signedAt) : null;
          const signedDateText =
            signedDate && !Number.isNaN(signedDate.getTime())
              ? `Signed: ${signedDate.toISOString().slice(0, 10)}`
              : "";
          if (signedDateText) {
            page.drawText(signedDateText, {
              x,
              y: Math.max(0, y - 12),
              size: 8,
              font: dateFont,
              color: rgb(0.18, 0.24, 0.32),
            });
          }
        }
        // The full digest is visibly rendered beside the embedded mark, while
        // the canonical structured copy is retained in the F2 event payload.
        drawVisibleSignatureFingerprint({
          page,
          font: dateFont,
          x,
          y,
          height,
          sha256: assetSha256,
          reserveForSignedDate: isSignatureField,
        });
        signatureAssetFingerprints.push({
          fieldId,
          signerRole,
          fieldType,
          sha256: assetSha256,
          byteLength: assetDownload.bytes.length,
          imageFormat: inspectedImage.imageFormat,
        });
      } catch (error) {
        if (error instanceof SignatureAssetEmbedError) throw error;
        throw new SignatureAssetEmbedError("SIGNATURE_ASSET_EMBED_OPERATION_FAILED");
      }
    }

    const canonicalSignatureFingerprints = canonicalSignatureAssetFingerprints(signatureAssetFingerprints);
    if (!canonicalSignatureFingerprints || canonicalSignatureFingerprints.length !== signatureFields.length) {
      throw new SignatureAssetEmbedError("SIGNATURE_EVIDENCE_FINGERPRINT_INCOMPLETE");
    }
    const signatureAssetEvidenceDigest = await signatureAssetEvidenceSha256(canonicalSignatureFingerprints);
    observedEvidenceMode = PHASE3_SIGNATURE_EVIDENCE_MODE;
    observedEmbeddedSignatureCount = canonicalSignatureFingerprints.length;
    const finalPdfBytes = await pdf.save();
    observedOutputBytes = finalPdfBytes.length;
    const finalisedAt = new Date().toISOString();
    const finalArtifactSha256 = await sha256Hex(finalPdfBytes);
    const signerEvidenceSha256 = await sha256Hex(JSON.stringify(signers.map((signer) => ({ id: normalizeText(signer.id), role: lower(signer.signer_role), email: lower(signer.signer_email), status: lower(signer.status), signedAt: normalizeText(signer.signed_at) })).sort((a, b) => a.id.localeCompare(b.id))));
    const fieldEvidenceSha256 = await sha256Hex(JSON.stringify(requiredFields.map((field) => ({ id: normalizeText(field.id), role: lower(field.signer_role), email: lower(field.signer_email), type: lower(field.field_type), status: lower(field.status), assetPath: normalizeText(field.signature_asset_path) })).sort((a, b) => a.id.localeCompare(b.id))));

    const outputBucketCandidates = parseBucketCandidates(
      explicitOutputBucket,
      Deno.env.get("SIGNED_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_SIGNED_DOCUMENTS_BUCKET"),
      renderedFileBucket,
      "documents",
    );

    const packetDocumentId = renderedDocumentId;
    const signedFileName = buildSignedFileName(normalizeText(packet.packet_type), safeNumber(version.version_number, 1));
    const signedPath = `signed-documents/${packetId}/${packetDocumentId || normalizeText(version.id)}/${crypto.randomUUID()}-${signedFileName}`;

    let uploadedBucket = "";
    let uploadError: unknown = null;
    for (const bucket of [...new Set(outputBucketCandidates.filter(Boolean))]) {
      const upload = await supabase.storage.from(bucket).upload(signedPath, finalPdfBytes, {
        contentType: "application/pdf",
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
      return finalisationFailureResponse(500, {
        success: false,
        error: "Unable to store final signed document.",
        errorCode: "FINAL_SIGNED_UPLOAD_FAILED",
      });
    }
    provisionalFinalBucket = uploadedBucket;
    provisionalFinalPath = signedPath;
    provisionalFinalSha256 = finalArtifactSha256;
    provisionalFinalByteLength = finalPdfBytes.length;

    // This row is intentionally private until the F2 RPC has atomically
    // recorded the exact artifact, evidence, packet completion, and event.
    const finalSignedDocumentId = await createInternalFinalSignedDocument({
      supabase,
      transactionId: normalizeText(packet.transaction_id),
      fileName: signedFileName,
      bucket: uploadedBucket,
      path: signedPath,
      finalisedBy,
      createdAt: finalisedAt,
    });
    provisionalFinalDocumentId = finalSignedDocumentId;
    if (!finalSignedDocumentId) {
      const cleanup = await cleanupUncommittedFinalisation({
        supabase,
        bucket: provisionalFinalBucket,
        path: provisionalFinalPath,
        documentId: provisionalFinalDocumentId,
      });
      if (!cleanup.documentCleaned || !cleanup.storageCleaned) {
        logFinalisation("error", "final_signed_uncommitted_cleanup_failed", {
          requestId: finalisationRequestId,
          packetId,
          packetVersionId: normalizeText(version.id),
          packetType: observedPacketType,
          durationMs: Date.now() - finalisationStartedAt,
          errorCode: "FINAL_SIGNED_DOCUMENT_RECORD_FAILED",
          evidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
          embeddedSignatureCount: canonicalSignatureFingerprints.length,
          outputBytes: finalPdfBytes.length,
        });
      }
      return finalisationFailureResponse(500, {
        success: false,
        error: "The final signed document could not be recorded safely.",
        errorCode: "FINAL_SIGNED_DOCUMENT_RECORD_FAILED",
      });
    }

    f2FinalArtifactAttempted = true;
    const updateVersionResult = await supabase.rpc("bridge_record_final_artifact_f2", {
      p_organisation_id: normalizeText(packet.organisation_id),
      p_packet_id: packetId,
      p_packet_version_id: normalizeText(version.id),
      p_bucket: uploadedBucket,
      p_path: signedPath,
      p_file_name: signedFileName,
      p_sha256: finalArtifactSha256,
      p_byte_length: finalPdfBytes.length,
      p_signer_evidence_sha256: signerEvidenceSha256,
      p_field_evidence_sha256: fieldEvidenceSha256,
      p_generated_at: finalisedAt,
      p_event_type: "final_signed_document_generated",
      p_event_payload: {
        signerCount: signers.length,
        fieldCount: signatureFields.length,
        generatedFilePath: signedPath,
        generatedFileBucket: uploadedBucket,
        finalArtifactSha256,
        finalArtifactByteLength: finalPdfBytes.length,
        signerEvidenceSha256,
        fieldEvidenceSha256,
        signatureEvidenceContract: PHASE3_SIGNATURE_EVIDENCE_CONTRACT,
        signatureEvidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
        embeddedSignatureCount: canonicalSignatureFingerprints.length,
        signatureAssetEvidenceSha256: signatureAssetEvidenceDigest,
        signatureAssetFingerprints: canonicalSignatureFingerprints,
        generatedAt: finalisedAt,
      },
      p_finalised_by: finalisedBy,
      p_final_signed_document_id: finalSignedDocumentId,
    });
    let updateVersionData = updateVersionResult.data as Record<string, unknown> | null;
    if (updateVersionResult.error) {
      const committed = await readCommittedFinalArtifact({
        supabase,
        packetId,
        packetVersionId: normalizeText(version.id),
        bucket: uploadedBucket,
        path: signedPath,
        sha256: finalArtifactSha256,
        byteLength: finalPdfBytes.length,
      });
      if (!committed.committed) {
        // The RPC can time out while PostgreSQL is still committing. Absence
        // from an immediate read is not proof that F2 failed, so retain the
        // internal row and storage object for a safe retry/reconciliation.
        logFinalisation("error", "final_signed_uncommitted_cleanup_deferred", {
          requestId: finalisationRequestId,
          packetId,
          packetVersionId: normalizeText(version.id),
          packetType: observedPacketType,
          durationMs: Date.now() - finalisationStartedAt,
          errorCode: "FINAL_SIGNED_F2_RECORDING_UNCONFIRMED",
          evidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
          embeddedSignatureCount: canonicalSignatureFingerprints.length,
          outputBytes: finalPdfBytes.length,
        });
        return finalisationFailureResponse(503, {
          success: false,
          error: "The final signed document is awaiting a safe finalisation check. Retry finalisation shortly.",
          errorCode: "FINAL_SIGNED_F2_RECORDING_UNCONFIRMED",
          retryable: true,
        });
      }
      updateVersionData = committed.version;
    }
    f2FinalArtifactRecorded = true;
    const recordedFinalDocumentId = normalizeText(updateVersionData?.final_signed_document_id) || finalSignedDocumentId;
    if (!(await publishFinalSignedDocument({
      supabase,
      documentId: recordedFinalDocumentId,
      path: signedPath,
    }))) {
      logFinalisation("error", "final_signed_document_publication_pending", {
        requestId: finalisationRequestId,
        packetId,
        packetVersionId: normalizeText(version.id),
        packetType: observedPacketType,
        durationMs: Date.now() - finalisationStartedAt,
        errorCode: "FINAL_SIGNED_DOCUMENT_PUBLICATION_PENDING",
        evidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
        embeddedSignatureCount: canonicalSignatureFingerprints.length,
        outputBytes: finalPdfBytes.length,
      });
      return finalisationFailureResponse(503, {
        success: false,
        error: "The final signed PDF is safely recorded, but its client document publication is pending. Retry finalisation to complete publication.",
        errorCode: "FINAL_SIGNED_DOCUMENT_PUBLICATION_PENDING",
        retryable: true,
      });
    }

    const listingConversion = await ensureListingFromSignedMandate({
      supabase,
      packet,
      version: {
        ...version,
        ...(updateVersionData || {}),
      },
      finalArtifactPath: signedPath,
    }).catch((error) => {
      logFinalisation("error", "final_signed_listing_conversion_failed", {
        requestId: finalisationRequestId,
        packetId,
        packetVersionId: normalizeText(version.id),
        packetType: observedPacketType,
        durationMs: Date.now() - finalisationStartedAt,
        errorCode: normalizeText(error?.code) || "LISTING_CONVERSION_FAILED",
        evidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
        embeddedSignatureCount: canonicalSignatureFingerprints.length,
        outputBytes: finalPdfBytes.length,
      });
      return {
        success: false,
        error: "Listing conversion could not be completed.",
        errorCode: normalizeText(error?.code) || "LISTING_CONVERSION_FAILED",
      };
    });
    const finalDelivery = await dispatchFinalDelivery({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY, packetId, packetVersionId: normalizeText(version.id) });
    logFinalisation("info", "final_signed_finalisation_completed", {
      requestId: finalisationRequestId,
      packetId,
      packetVersionId: normalizeText(version.id),
      packetType: observedPacketType,
      durationMs: Date.now() - finalisationStartedAt,
      evidenceMode: PHASE3_SIGNATURE_EVIDENCE_MODE,
      embeddedSignatureCount: canonicalSignatureFingerprints.length,
      outputBytes: finalPdfBytes.length,
    });

    return jsonResponse(200, {
      success: true,
      packetId,
      packetVersionId: version.id,
      finalArtifact: buildFinalArtifactAccessDescriptor({
        packetId,
        packetVersionId: version.id,
        documentId: recordedFinalDocumentId,
        fileName: signedFileName,
        sha256: finalArtifactSha256,
        byteLength: finalPdfBytes.length,
        finalisedAt,
      }),
      version: buildFinalisationVersionDescriptor({
        packetId,
        version: { ...version, ...(updateVersionData || {}) },
        documentId: recordedFinalDocumentId,
        fileName: signedFileName,
        sha256: finalArtifactSha256,
        byteLength: finalPdfBytes.length,
        finalisedAt,
      }),
      listingConversion,
      finalDelivery: buildFinalDeliverySummary(finalDelivery),
      sourceFormat,
      note: null,
    });
  } catch (error) {
    if (
      !f2FinalArtifactRecorded &&
      finalisationSupabase &&
      provisionalFinalBucket &&
      provisionalFinalPath &&
      provisionalFinalSha256 &&
      provisionalFinalByteLength > 0
    ) {
      if (f2FinalArtifactAttempted) {
        // Once the RPC has been invoked, a timeout/retry race must never
        // delete the only potentially committed canonical artifact.
        logFinalisation("error", "final_signed_uncommitted_cleanup_deferred", {
          requestId: finalisationRequestId,
          packetId: observedPacketId || null,
          packetVersionId: observedPacketVersionId || null,
          packetType: observedPacketType || null,
          durationMs: Date.now() - finalisationStartedAt,
          errorCode: "FINAL_SIGNED_UNCOMMITTED_STATE_UNKNOWN",
          evidenceMode: observedEvidenceMode || null,
          embeddedSignatureCount: observedEmbeddedSignatureCount,
          outputBytes: observedOutputBytes,
        });
      } else {
        try {
          const cleanup = await cleanupUncommittedFinalisation({
            supabase: finalisationSupabase,
            bucket: provisionalFinalBucket,
            path: provisionalFinalPath,
            documentId: provisionalFinalDocumentId,
          });
          if (!cleanup.documentCleaned || !cleanup.storageCleaned) {
            logFinalisation("error", "final_signed_uncommitted_cleanup_failed", {
              requestId: finalisationRequestId,
              packetId: observedPacketId || null,
              packetVersionId: observedPacketVersionId || null,
              packetType: observedPacketType || null,
              durationMs: Date.now() - finalisationStartedAt,
              errorCode: "FINAL_SIGNED_UNCOMMITTED_CLEANUP_FAILED",
              evidenceMode: observedEvidenceMode || null,
              embeddedSignatureCount: observedEmbeddedSignatureCount,
              outputBytes: observedOutputBytes,
            });
          }
        } catch {
          logFinalisation("error", "final_signed_uncommitted_cleanup_deferred", {
            requestId: finalisationRequestId,
            packetId: observedPacketId || null,
            packetVersionId: observedPacketVersionId || null,
            packetType: observedPacketType || null,
            durationMs: Date.now() - finalisationStartedAt,
            errorCode: "FINAL_SIGNED_UNCOMMITTED_STATE_UNKNOWN",
            evidenceMode: observedEvidenceMode || null,
            embeddedSignatureCount: observedEmbeddedSignatureCount,
            outputBytes: observedOutputBytes,
          });
        }
      }
    }
    const isSignatureAssetFailure = error instanceof SignatureAssetEmbedError;
    const errorCode = isSignatureAssetFailure
      ? error.errorCode
      : "FINAL_SIGNED_GENERATION_FAILED";
    const logDetails = {
      requestId: finalisationRequestId,
      packetId: observedPacketId || null,
      packetVersionId: observedPacketVersionId || null,
      packetType: observedPacketType || null,
      durationMs: Date.now() - finalisationStartedAt,
      errorCode,
      evidenceMode: observedEvidenceMode || null,
      embeddedSignatureCount: observedEmbeddedSignatureCount,
      outputBytes: observedOutputBytes,
    };
    if (isSignatureAssetFailure) {
      logFinalisation("error", "final_signed_signature_asset_embedding_failed", logDetails);
    }
    logFinalisation("error", "final_signed_finalisation_failed", logDetails);
    return jsonResponse(isSignatureAssetFailure ? 422 : 500, {
      success: false,
      error: isSignatureAssetFailure
        ? "Every required signature asset must be readable, valid, and embeddable before finalisation."
        : "The final signed document could not be generated safely.",
      errorCode,
    });
  }
});
