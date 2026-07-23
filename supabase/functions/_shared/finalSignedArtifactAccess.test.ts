import {
  isPhase3EvidenceExact,
  isPublishedFinalDocumentExact,
} from "./finalSignedArtifactAccess.ts";

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const packet = {
  id: "packet-1",
  organisation_id: "organisation-1",
  transaction_id: "transaction-1",
  status: "completed",
  current_version_number: 3,
};
const version = {
  id: "version-1",
  organisation_id: "organisation-1",
  version_number: 3,
  final_signed_file_path: "final/packet-1/version-1.pdf",
  final_signed_file_bucket: "document-packets",
  final_signed_file_name: "signed-mandate.pdf",
  final_signed_document_id: "document-1",
  finalised_at: "2026-07-22T10:00:00.000Z",
};
const evidence = {
  organisation_id: "organisation-1",
  packet_id: "packet-1",
  packet_version_id: "version-1",
  bucket: "document-packets",
  path: "final/packet-1/version-1.pdf",
  file_name: "signed-mandate.pdf",
  media_type: "application/pdf",
  sha256: "a".repeat(64),
  byte_length: 1234,
  generated_at: "2026-07-22T10:00:00.000Z",
  signature_evidence_contract: "phase3-visual-signature-evidence-v1",
  signature_evidence_mode: "visual_and_audit",
  embedded_signature_count: 1,
  signature_asset_evidence_sha256: "b".repeat(64),
  signature_asset_fingerprints_json: [{
    fieldId: "field-1",
    sha256: "c".repeat(64),
  }],
};
const event = {
  packet_id: "packet-1",
  version_id: "version-1",
  organisation_id: "organisation-1",
  event_type: "final_signed_document_generated",
  event_payload_json: {
    generatedFilePath: "final/packet-1/version-1.pdf",
    generatedFileBucket: "document-packets",
    finalArtifactSha256: "a".repeat(64),
    finalArtifactByteLength: 1234,
    signatureEvidenceContract: "phase3-visual-signature-evidence-v1",
    signatureEvidenceMode: "visual_and_audit",
    embeddedSignatureCount: 1,
    signatureAssetEvidenceSha256: "b".repeat(64),
    signatureAssetFingerprints: [{
      fieldId: "field-1",
      sha256: "c".repeat(64),
    }],
  },
};
const document = {
  id: "document-1",
  transaction_id: "transaction-1",
  file_path: "final/packet-1/version-1.pdf",
  file_bucket: "document-packets",
  status: "signed",
  visibility_scope: "shared",
  is_client_visible: true,
  stage_key: "final_signed",
  final_legal_packet_id: "packet-1",
  final_legal_packet_version_id: "version-1",
  final_artifact_bucket: "document-packets",
  final_artifact_media_type: "application/pdf",
  final_artifact_byte_length: 1234,
  final_artifact_sha256: "a".repeat(64),
};

Deno.test("canonical final artifact requires the exact F2 event/evidence tuple", () => {
  expect(
    isPhase3EvidenceExact({ packet, version, evidence, event }),
    "the exact F2 tuple should be accepted",
  );
  expect(
    !isPhase3EvidenceExact({
      packet,
      version,
      evidence: { ...evidence, bucket: "wrong-bucket" },
      event,
    }),
    "a bucket mismatch must be rejected",
  );
  expect(
    !isPhase3EvidenceExact({
      packet,
      version,
      evidence,
      event: {
        ...event,
        event_payload_json: {
          ...event.event_payload_json,
          finalArtifactByteLength: 1,
        },
      },
    }),
    "an event byte-length mismatch must be rejected",
  );
  expect(
    !isPhase3EvidenceExact({
      packet,
      version,
      evidence,
      event: { ...event, organisation_id: "other-organisation" },
    }),
    "an event ownership mismatch must be rejected",
  );
});

Deno.test("published final document must remain bound to the exact artifact and transaction", () => {
  expect(
    isPublishedFinalDocumentExact({ packet, version, evidence, document }),
    "the exact published document should be accepted",
  );
  expect(
    !isPublishedFinalDocumentExact({
      packet,
      version,
      evidence,
      document: { ...document, is_client_visible: false },
    }),
    "an unpublished document must be rejected",
  );
  expect(
    !isPublishedFinalDocumentExact({
      packet,
      version,
      evidence,
      document: { ...document, final_artifact_sha256: "d".repeat(64) },
    }),
    "a document hash mismatch must be rejected",
  );
  expect(
    !isPublishedFinalDocumentExact({
      packet,
      version,
      evidence,
      document: { ...document, transaction_id: "other-transaction" },
    }),
    "a transaction mismatch must be rejected",
  );
});
