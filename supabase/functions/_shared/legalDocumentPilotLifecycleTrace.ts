import {
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
  type LegalDocumentPilotReleaseDecision,
} from "./legalDocumentPilotRelease.ts";

export const LEGAL_DOCUMENT_PILOT_LIFECYCLE_TRACE_CONTRACT =
  "legal-document-pilot-lifecycle-trace-v1";

export type LegalDocumentPilotLifecycleStage =
  | "signing_invite_delivered"
  | "final_delivery_completed"
  | "final_access_authorized";

export type LegalDocumentPilotFinalAccessContext =
  | "client_portal"
  | "seller_portal"
  | "workspace"
  | "signer";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rpcError(error: any, fallbackCode: string) {
  const detail = text(error?.details);
  const message = text(error?.message);
  const code = /^PHASE5_RELEASE_TRACE_[A-Z_]+$/.test(detail)
    ? detail
    : text(error?.code) || fallbackCode;
  return Object.assign(
    new Error(
      message ||
        "The release-bound legal-document lifecycle trace could not be recorded.",
    ),
    { code, details: detail || null, status: 409 },
  );
}

function releaseIdentityError(message: string) {
  return Object.assign(new Error(message), {
    code: "PHASE5_RELEASE_TRACE_ACTIVE_RELEASE_MISMATCH",
    details: null,
    status: 409,
  });
}

function normalisedDigest(value: unknown) {
  return text(value).toLowerCase();
}

function sameIdentifier(left: unknown, right: unknown) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

/**
 * A release binding is evidence for one immutable generated artifact, while
 * the runtime release decision is the authority for the request happening
 * now. Customer-facing writes need both, and their plan identities must be
 * identical. The RPC already verifies the stored release contract; this
 * helper verifies that its returned binding belongs to the active runtime
 * contract and plan rather than merely to some earlier pilot activation.
 */
function assertBindingMatchesActiveRelease({
  binding,
  activeRelease,
  packetId,
  packetVersionId,
}: {
  binding: Record<string, unknown>;
  activeRelease: LegalDocumentPilotReleaseDecision;
  packetId: string;
  packetVersionId: string;
}) {
  const activePlanDigest = normalisedDigest(activeRelease?.planDigest);
  const bindingPlanDigest = normalisedDigest(binding.activationPlanDigest);
  if (
    activeRelease?.allowed !== true ||
    activeRelease?.contract !== LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT ||
    !/^sha256:[a-f0-9]{64}$/.test(activePlanDigest) ||
    bindingPlanDigest !== activePlanDigest ||
    !sameIdentifier(binding.packetId, packetId) ||
    !sameIdentifier(binding.packetVersionId, packetVersionId)
  ) {
    throw releaseIdentityError(
      "The packet's immutable pilot release binding does not match the active customer-release plan.",
    );
  }
}

/**
 * Persist the Phase 4 activation-plan digest on the generated, packet-owned
 * document before any signing or delivery route is allowed to use it. The
 * digest comes only from the server release guard, never from a request.
 */
export async function bindLegalDocumentPilotReleaseTrace({
  supabase,
  packetId,
  documentId,
  activationPlanDigest,
  generatedArtifactSha256,
}: {
  supabase: any;
  packetId: string;
  documentId: string;
  activationPlanDigest: string;
  generatedArtifactSha256: string;
}) {
  const result = await supabase.rpc(
    "bridge_bind_legal_document_pilot_release_phase5",
    {
      p_packet_id: packetId,
      p_document_id: documentId,
      p_activation_plan_digest: activationPlanDigest,
      p_generated_artifact_sha256: generatedArtifactSha256,
      p_observed_at: new Date().toISOString(),
    },
  );
  if (
    result.error ||
    result.data?.contract !== LEGAL_DOCUMENT_PILOT_LIFECYCLE_TRACE_CONTRACT
  ) {
    throw rpcError(result.error, "PHASE5_RELEASE_TRACE_BINDING_REQUIRED");
  }
  return result.data;
}

/**
 * Assert that a server-owned release binding exists for the exact current
 * packet version. The signing/final-delivery functions use this before they
 * create a new customer-facing message; a missing trace therefore fails
 * closed while already-completed documents remain usable.
 */
export async function assertLegalDocumentPilotLifecycleBinding({
  supabase,
  packetId,
  packetVersionId,
  activeRelease,
}: {
  supabase: any;
  packetId: string;
  packetVersionId: string;
  activeRelease: LegalDocumentPilotReleaseDecision;
}) {
  const result = await supabase.rpc(
    "bridge_assert_legal_document_pilot_release_binding_phase5",
    {
      p_packet_id: packetId,
      p_packet_version_id: packetVersionId,
    },
  );
  if (
    result.error ||
    result.data?.contract !== LEGAL_DOCUMENT_PILOT_LIFECYCLE_TRACE_CONTRACT
  ) {
    throw rpcError(result.error, "PHASE5_RELEASE_TRACE_BINDING_REQUIRED");
  }
  assertBindingMatchesActiveRelease({
    binding: result.data as Record<string, unknown>,
    activeRelease,
    packetId,
    packetVersionId,
  });
  return result.data;
}

export async function recordLegalDocumentPilotLifecycleTrace({
  supabase,
  packetId,
  packetVersionId,
  stage,
  accessContext = null,
}: {
  supabase: any;
  packetId: string;
  packetVersionId: string;
  stage: LegalDocumentPilotLifecycleStage;
  accessContext?: LegalDocumentPilotFinalAccessContext | null;
}) {
  const result = await supabase.rpc(
    "bridge_record_legal_document_pilot_lifecycle_trace_phase5",
    {
      p_packet_id: packetId,
      p_packet_version_id: packetVersionId,
      p_stage: stage,
      p_access_context: accessContext,
      p_observed_at: new Date().toISOString(),
    },
  );
  if (
    result.error ||
    result.data?.contract !== LEGAL_DOCUMENT_PILOT_LIFECYCLE_TRACE_CONTRACT
  ) {
    throw rpcError(result.error, "PHASE5_RELEASE_TRACE_RECORD_REQUIRED");
  }
  return result.data;
}
