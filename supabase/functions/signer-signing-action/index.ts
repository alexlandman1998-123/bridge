import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

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

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
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
  supabase: ReturnType<typeof createClient>;
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
  supabase: ReturnType<typeof createClient>;
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

async function appendPacketEvent({
  supabase,
  packetId,
  organisationId,
  versionId,
  eventType,
  payload,
}: {
  supabase: ReturnType<typeof createClient>;
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
      const requiredFieldsQuery = await supabase
        .from("document_signing_fields")
        .select("id, status, required, signer_role, signer_email")
        .eq("packet_id", packetId)
        .eq("packet_version_id", packetVersionId)
        .eq("required", true)
        .order("created_at", { ascending: true });
      if (requiredFieldsQuery.error) throw requiredFieldsQuery.error;

      const relevantRequired = (requiredFieldsQuery.data || []).filter((field) => fieldBelongsToSigner(field, signer));
      const remaining = relevantRequired.filter((field) => normalizeText(field.status).toLowerCase() !== "completed");
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
          signerEmail: signer.signer_email,
          signedAt: nowIso,
        },
      });

      const allSignersResult = await supabase
        .from("document_packet_signers")
        .select("id, status")
        .eq("packet_id", packetId)
        .eq("packet_version_id", packetVersionId);
      if (allSignersResult.error) throw allSignersResult.error;
      const allSigners = (allSignersResult.data || []) as Record<string, unknown>[];
      const nextPacketStatus = choosePacketStatusFromSigners(allSigners);

      await supabase
        .from("document_packets")
        .update({
          status: nextPacketStatus,
          completed_at: nextPacketStatus === "completed" ? nowIso : null,
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
      }

      return jsonResponse(200, {
        success: true,
        signer: signerUpdate.data,
        packetStatus: nextPacketStatus,
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
      error: String(error),
      errorCode: "SIGNER_ACTION_FAILED",
    });
  }
});
