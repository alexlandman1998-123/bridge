export type JsonRecord = Record<string, unknown>;

export const PHASE3_SIGNATURE_EVIDENCE_CONTRACT =
  "phase3-visual-signature-evidence-v1";
export const PHASE3_SIGNATURE_EVIDENCE_MODE = "visual_and_audit";

export function normalizeFinalArtifactText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function lower(value: unknown) {
  return normalizeFinalArtifactText(value).toLowerCase();
}

function sameInstant(left: unknown, right: unknown) {
  const leftTime = Date.parse(normalizeFinalArtifactText(left));
  const rightTime = Date.parse(normalizeFinalArtifactText(right));
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) &&
    leftTime === rightTime;
}

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/i.test(normalizeFinalArtifactText(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return `{${
      Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(",")
    }}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function sameJson(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

export function isPhase3EvidenceExact({ packet, version, evidence, event }: {
  packet: JsonRecord;
  version: JsonRecord;
  evidence: JsonRecord;
  event: JsonRecord;
}) {
  const payload = asRecord(event.event_payload_json);
  const finalPath = normalizeFinalArtifactText(version.final_signed_file_path);
  const finalBucket = normalizeFinalArtifactText(
    version.final_signed_file_bucket,
  );
  const finalDocumentId = normalizeFinalArtifactText(
    version.final_signed_document_id,
  );
  const byteLength = Number(evidence.byte_length);

  return Boolean(
    normalizeFinalArtifactText(packet.id) &&
      normalizeFinalArtifactText(version.id) &&
      finalPath &&
      finalBucket &&
      finalDocumentId &&
      lower(packet.status) === "completed" &&
      Number(packet.current_version_number) ===
        Number(version.version_number) &&
      normalizeFinalArtifactText(packet.organisation_id) ===
        normalizeFinalArtifactText(version.organisation_id) &&
      normalizeFinalArtifactText(packet.organisation_id) ===
        normalizeFinalArtifactText(evidence.organisation_id) &&
      normalizeFinalArtifactText(evidence.packet_id) ===
        normalizeFinalArtifactText(packet.id) &&
      normalizeFinalArtifactText(evidence.packet_version_id) ===
        normalizeFinalArtifactText(version.id) &&
      normalizeFinalArtifactText(evidence.path) === finalPath &&
      normalizeFinalArtifactText(evidence.bucket) === finalBucket &&
      normalizeFinalArtifactText(evidence.file_name) ===
        normalizeFinalArtifactText(version.final_signed_file_name) &&
      lower(evidence.media_type) === "application/pdf" &&
      sameInstant(evidence.generated_at, version.finalised_at) &&
      isSha256(evidence.sha256) &&
      Number.isFinite(byteLength) &&
      byteLength > 0 &&
      normalizeFinalArtifactText(evidence.signature_evidence_contract) ===
        PHASE3_SIGNATURE_EVIDENCE_CONTRACT &&
      normalizeFinalArtifactText(evidence.signature_evidence_mode) ===
        PHASE3_SIGNATURE_EVIDENCE_MODE &&
      Number(evidence.embedded_signature_count) > 0 &&
      isSha256(evidence.signature_asset_evidence_sha256) &&
      Array.isArray(evidence.signature_asset_fingerprints_json) &&
      evidence.signature_asset_fingerprints_json.length ===
        Number(evidence.embedded_signature_count) &&
      normalizeFinalArtifactText(event.packet_id) ===
        normalizeFinalArtifactText(packet.id) &&
      normalizeFinalArtifactText(event.version_id) ===
        normalizeFinalArtifactText(version.id) &&
      normalizeFinalArtifactText(event.organisation_id) ===
        normalizeFinalArtifactText(packet.organisation_id) &&
      normalizeFinalArtifactText(event.event_type) ===
        "final_signed_document_generated" &&
      normalizeFinalArtifactText(payload.generatedFilePath) === finalPath &&
      normalizeFinalArtifactText(payload.generatedFileBucket) === finalBucket &&
      lower(payload.finalArtifactSha256) === lower(evidence.sha256) &&
      Number(payload.finalArtifactByteLength) === byteLength &&
      normalizeFinalArtifactText(payload.signatureEvidenceContract) ===
        PHASE3_SIGNATURE_EVIDENCE_CONTRACT &&
      normalizeFinalArtifactText(payload.signatureEvidenceMode) ===
        PHASE3_SIGNATURE_EVIDENCE_MODE &&
      Number(payload.embeddedSignatureCount) ===
        Number(evidence.embedded_signature_count) &&
      lower(payload.signatureAssetEvidenceSha256) ===
        lower(evidence.signature_asset_evidence_sha256) &&
      sameJson(
        payload.signatureAssetFingerprints,
        evidence.signature_asset_fingerprints_json,
      ),
  );
}

export function isPublishedFinalDocumentExact(
  { packet, version, evidence, document }: {
    packet: JsonRecord;
    version: JsonRecord;
    evidence: JsonRecord;
    document: JsonRecord;
  },
) {
  return Boolean(
    normalizeFinalArtifactText(document.id) &&
      normalizeFinalArtifactText(document.id) ===
        normalizeFinalArtifactText(version.final_signed_document_id) &&
      normalizeFinalArtifactText(document.transaction_id) ===
        normalizeFinalArtifactText(packet.transaction_id) &&
      normalizeFinalArtifactText(document.file_path) ===
        normalizeFinalArtifactText(evidence.path) &&
      normalizeFinalArtifactText(document.file_bucket) ===
        normalizeFinalArtifactText(evidence.bucket) &&
      normalizeFinalArtifactText(document.final_legal_packet_id) ===
        normalizeFinalArtifactText(packet.id) &&
      normalizeFinalArtifactText(document.final_legal_packet_version_id) ===
        normalizeFinalArtifactText(version.id) &&
      normalizeFinalArtifactText(document.final_artifact_bucket) ===
        normalizeFinalArtifactText(evidence.bucket) &&
      lower(document.final_artifact_media_type) ===
        lower(evidence.media_type) &&
      Number(document.final_artifact_byte_length) ===
        Number(evidence.byte_length) &&
      lower(document.final_artifact_sha256) === lower(evidence.sha256) &&
      lower(document.status) === "signed" &&
      lower(document.visibility_scope) === "shared" &&
      document.is_client_visible === true &&
      lower(document.stage_key) === "final_signed",
  );
}

export type FinalArtifactAccessResult = {
  state:
    | "not_ready"
    | "pending_evidence"
    | "pending_publication"
    | "published"
    | "unavailable";
  available: boolean;
  message: string;
  finalArtifact: JsonRecord | null;
};

const response = (
  state: FinalArtifactAccessResult["state"],
  message: string,
  finalArtifact: JsonRecord | null = null,
): FinalArtifactAccessResult => ({
  state,
  available: state === "published",
  message,
  finalArtifact,
});

/**
 * Server-only Phase 3 final-artifact fence. A signed URL is created only once
 * immutable F2 evidence, its canonical event, and the linked public Documents
 * row all bind to the exact same packet-version artifact.
 */
export async function resolvePublishedFinalSignedArtifact({
  supabase,
  packetId,
  packetVersionId,
  documentId = "",
  issueDownloadUrl = false,
  expiresInSeconds = 60,
}: {
  supabase: any;
  packetId: string;
  packetVersionId: string;
  documentId?: string;
  issueDownloadUrl?: boolean;
  expiresInSeconds?: number;
}): Promise<FinalArtifactAccessResult> {
  try {
    const [packetResult, versionResult, evidenceResult, eventResult] =
      await Promise.all([
        supabase
          .from("document_packets")
          .select(
            "id, organisation_id, packet_type, status, current_version_number, transaction_id",
          )
          .eq("id", packetId)
          .maybeSingle(),
        supabase
          .from("document_packet_versions")
          .select(
            "id, packet_id, organisation_id, version_number, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at",
          )
          .eq("id", packetVersionId)
          .eq("packet_id", packetId)
          .maybeSingle(),
        supabase
          .from("legal_final_artifact_evidence")
          .select(
            "organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, generated_at, signature_evidence_contract, signature_evidence_mode, embedded_signature_count, signature_asset_evidence_sha256, signature_asset_fingerprints_json",
          )
          .eq("packet_id", packetId)
          .eq("packet_version_id", packetVersionId)
          .maybeSingle(),
        supabase
          .from("document_packet_events")
          .select(
            "id, packet_id, version_id, organisation_id, event_type, event_payload_json, created_at",
          )
          .eq("packet_id", packetId)
          .eq("version_id", packetVersionId)
          .eq("event_type", "final_signed_document_generated")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (
      packetResult.error || versionResult.error || evidenceResult.error ||
      eventResult.error
    ) {
      return response(
        "unavailable",
        "The final signed document could not be verified right now.",
      );
    }

    const packet = asRecord(packetResult.data);
    const version = asRecord(versionResult.data);
    const evidence = asRecord(evidenceResult.data);
    const event = asRecord(eventResult.data);
    if (
      !normalizeFinalArtifactText(packet.id) ||
      !normalizeFinalArtifactText(version.id)
    ) {
      return response(
        "not_ready",
        "The final signed document is not ready yet.",
      );
    }
    if (!normalizeFinalArtifactText(version.final_signed_file_path)) {
      return response(
        "not_ready",
        "The final signed document is not ready yet.",
      );
    }
    if (!isPhase3EvidenceExact({ packet, version, evidence, event })) {
      return response(
        "pending_evidence",
        "The signed document is still completing its secure finalisation checks.",
      );
    }

    const finalDocumentId = normalizeFinalArtifactText(
      version.final_signed_document_id,
    );
    const expectedDocumentId = normalizeFinalArtifactText(documentId);
    if (expectedDocumentId && finalDocumentId !== expectedDocumentId) {
      return response(
        "unavailable",
        "The final signed document could not be verified right now.",
      );
    }
    const documentResult = await supabase
      .from("documents")
      .select(
        "id, transaction_id, file_path, file_bucket, name, status, visibility_scope, is_client_visible, stage_key, final_legal_packet_id, final_legal_packet_version_id, final_artifact_bucket, final_artifact_media_type, final_artifact_byte_length, final_artifact_sha256",
      )
      .eq("id", finalDocumentId)
      .maybeSingle();
    if (
      documentResult.error ||
      !isPublishedFinalDocumentExact({
        packet,
        version,
        evidence,
        document: asRecord(documentResult.data),
      })
    ) {
      return response(
        "pending_publication",
        "The signed document is safely recorded and is being published to the portal.",
      );
    }

    const document = asRecord(documentResult.data);
    const finalArtifact: JsonRecord = {
      documentId: normalizeFinalArtifactText(document.id) || null,
      fileName: normalizeFinalArtifactText(document.name) ||
        normalizeFinalArtifactText(evidence.file_name) || "signed-document.pdf",
      sha256: normalizeFinalArtifactText(evidence.sha256) || null,
      byteLength: Number(evidence.byte_length) || null,
    };
    if (issueDownloadUrl) {
      const downloadFileName =
        normalizeFinalArtifactText(finalArtifact.fileName) ||
        "signed-document.pdf";
      const signedUrlResult = await supabase.storage
        .from(normalizeFinalArtifactText(evidence.bucket))
        .createSignedUrl(
          normalizeFinalArtifactText(evidence.path),
          Math.max(30, Math.min(Number(expiresInSeconds) || 60, 300)),
          {
            download: downloadFileName,
          },
        );
      if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
        return response(
          "unavailable",
          "A fresh secure link could not be created. Please try again.",
        );
      }
      finalArtifact.downloadUrl = signedUrlResult.data.signedUrl;
    }
    return response(
      "published",
      "The final signed document is ready.",
      finalArtifact,
    );
  } catch (error) {
    console.error("final signed artifact access verification failed", error);
    return response(
      "unavailable",
      "The final signed document could not be verified right now.",
    );
  }
}
