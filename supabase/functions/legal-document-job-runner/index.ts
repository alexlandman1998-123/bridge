import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
  "Content-Type": "application/json",
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set(["succeeded", "cancelled"]);
const SUPPORTED_JOB_TYPES = new Set([
  "generate_packet_version",
  "send_for_signature",
  "generate_and_send_for_signature",
]);
const SEND_EMAIL_TIMEOUT_MS = 18_000;
const GENERATE_MANDATE_TIMEOUT_MS = 120_000;
const WATCHDOG_DEFAULT_BATCH_LIMIT = 5;
const WATCHDOG_MAX_BATCH_LIMIT = 10;
const WATCHDOG_QUEUED_STALE_MS = 30_000;
const WATCHDOG_RUNNING_STALE_MS = 180_000;
const WATCHDOG_FAILED_RETRY_DELAY_MS = 60_000;
const WATCHDOG_GENERATION_LEASE_TTL_SECONDS = 600;
const RETRYABLE_GENERATION_ERROR_CODES = new Set([
  "EDGE_INVOCATION_FAILED",
  "GENERATION_LEASE_FENCE_REJECTED",
  "GENERATION_TIMEOUT",
  "LEGAL_DOCUMENT_JOB_GENERATION_FAILED",
]);
const PRIVILEGED_PACKET_ROLES = new Set([
  "principal",
  "owner",
  "admin",
  "super_admin",
  "branch_manager",
  "manager",
  "agency_admin",
  "agent_admin",
]);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase().replaceAll("-", "_");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function booleanFlag(value: unknown) {
  return value === true || normalizeText(value).toLowerCase() === "true";
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateValue(value: unknown) {
  const timestamp = Date.parse(normalizeText(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearerToken(req: Request) {
  return normalizeText(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
}

async function sha256Text(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateSecureSigningToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function queueBackgroundTask(taskFactory: () => Promise<void>) {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: {
      waitUntil?: (promise: Promise<unknown>) => void;
    };
  };
  const guardedTask = Promise.resolve()
    .then(taskFactory)
    .catch((error) => {
      console.error("[legal-document-job-runner] background job failed", error);
    });
  if (typeof runtime.EdgeRuntime?.waitUntil === "function") {
    runtime.EdgeRuntime.waitUntil(guardedTask);
    return "edge_wait_until";
  }
  void guardedTask;
  return "detached_promise";
}

function versionHasCertifiedPdf(version: JsonRecord) {
  const path = normalizeText(version.rendered_file_path);
  const sha256 = normalizeText(version.rendered_sha256).toLowerCase();
  const byteLength = Number(version.rendered_byte_length);
  return Boolean(
    normalizeText(version.id) &&
      normalizeText(version.rendered_document_id) &&
      normalizeText(version.rendered_file_bucket) &&
      path &&
      path.toLowerCase().endsWith(".pdf") &&
      booleanFlag(version.render_input_verified) &&
      booleanFlag(version.transaction_pdf_persisted) &&
      booleanFlag(version.native_pdf_verified) &&
      normalizeText(version.rendered_media_type).toLowerCase() === "application/pdf" &&
      /^sha256:[0-9a-f]{64}$/.test(sha256) &&
      Number.isFinite(byteLength) &&
      byteLength > 0,
  );
}

function buildGeneratedArtifact(result: JsonRecord) {
  const output = asRecord(result.output);
  const storage = asRecord(result.storage);
  const documentRecord = asRecord(asRecord(result.documentRecord).data || result.documentRecord);
  const document = asRecord(result.document);
  return {
    renderedDocumentId: normalizeText(documentRecord.id || document.id || result.documentId),
    renderedFilePath: normalizeText(output.filePath || storage.path || result.path || result.renderedFilePath),
    renderedFileName: normalizeText(
      output.fileName || storage.fileName || documentRecord.name || document.name || result.fileName,
    ),
    renderedFileUrl: normalizeText(
      output.signedUrl || storage.publicUrl || documentRecord.url || document.url || result.url ||
        result.renderedFileUrl,
    ),
    renderedFileBucket: normalizeText(output.bucket || storage.bucket),
    renderedMediaType: normalizeText(output.mediaType || output.contentType),
    renderedByteLength: Number(output.byteLength || 0),
    renderedSha256: normalizeText(output.sha256),
    renderAttestation: Object.keys(asRecord(result.renderAttestation)).length ? asRecord(result.renderAttestation) : null,
    nativePdfLayout: Object.keys(asRecord(result.nativePdfLayout)).length
      ? asRecord(result.nativePdfLayout)
      : Object.keys(asRecord(asRecord(result.renderAttestation).nativePdfLayout)).length
      ? asRecord(asRecord(result.renderAttestation).nativePdfLayout)
      : null,
  };
}

function buildArtifactProvenance(artifact: ReturnType<typeof buildGeneratedArtifact>) {
  return {
    bucket: artifact.renderedFileBucket || null,
    path: artifact.renderedFilePath || null,
    fileName: artifact.renderedFileName || null,
    signedUrl: artifact.renderedFileUrl || null,
    documentId: artifact.renderedDocumentId || null,
    mediaType: artifact.renderedMediaType || null,
    byteLength: Number.isFinite(artifact.renderedByteLength) ? artifact.renderedByteLength : 0,
    sha256: artifact.renderedSha256 || null,
  };
}

function assertGeneratedPdfArtifact(artifact: ReturnType<typeof buildGeneratedArtifact>) {
  if (
    !UUID_PATTERN.test(artifact.renderedDocumentId) ||
    !artifact.renderedFilePath ||
    !artifact.renderedFilePath.toLowerCase().endsWith(".pdf") ||
    artifact.renderedMediaType.toLowerCase() !== "application/pdf" ||
    !/^sha256:[0-9a-f]{64}$/.test(artifact.renderedSha256.toLowerCase()) ||
    !Number.isFinite(artifact.renderedByteLength) ||
    artifact.renderedByteLength <= 0
  ) {
    throw new Error("Generated mandate artifact did not include a certified PDF candidate.");
  }
}

function extractSigningToken(portalLink: unknown) {
  const raw = normalizeText(portalLink);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://invalid.local");
    const segments = parsed.pathname.split("/").filter(Boolean);
    const signIndex = segments.findIndex((segment) => segment.toLowerCase() === "sign");
    const token = signIndex >= 0 ? decodeURIComponent(segments[signIndex + 1] || "") : "";
    return /^[A-Za-z0-9._~-]{16,512}$/.test(token) ? token : "";
  } catch {
    return "";
  }
}

function membershipIsActive(membership: JsonRecord | null) {
  const status = normalizeKey(membership?.membership_status || membership?.status);
  return status === "active" || status === "accepted";
}

function membershipIsPrivileged(membership: JsonRecord | null) {
  return [
    membership?.role,
    membership?.workspace_role,
    membership?.organisation_role,
    membership?.app_role,
  ].some((role) => PRIVILEGED_PACKET_ROLES.has(normalizeKey(role)));
}

function canManagePacket({
  authority,
  membership,
  packet,
}: {
  authority: { kind: "none" | "service" | "user"; userId: string };
  membership: JsonRecord | null;
  packet: JsonRecord;
}) {
  if (authority.kind === "service") return true;
  if (authority.kind !== "user" || !membershipIsActive(membership)) return false;
  if (membershipIsPrivileged(membership)) return true;
  return authority.userId === normalizeText(packet.assigned_agent_id) ||
    authority.userId === normalizeText(packet.created_by);
}

async function resolveInvocationAuthority({
  req,
  client,
  serviceRoleKey,
}: {
  req: Request;
  client: any;
  serviceRoleKey: string;
}) {
  const token = bearerToken(req);
  if (!token) return { kind: "none" as const, userId: "" };
  if (token === serviceRoleKey) return { kind: "service" as const, userId: "" };
  const userResult = await client.auth.getUser(token);
  const userId = normalizeText(userResult.data?.user?.id);
  if (userResult.error || !userId) return { kind: "none" as const, userId: "" };
  return { kind: "user" as const, userId };
}

async function authorizeServiceCredential(url: string, credential: string) {
  if (!credential) return false;
  const verifier: any = createClient(url, credential, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await verifier.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !result.error;
}

async function updateJobStatus({
  client,
  jobId,
  status,
  result = null,
  error = null,
  metadata = {},
  packetVersionId = null,
  generationAttemptId = null,
  dispatchId = null,
}: {
  client: any;
  jobId: string;
  status: string;
  result?: JsonRecord | null;
  error?: JsonRecord | null;
  metadata?: JsonRecord;
  packetVersionId?: string | null;
  generationAttemptId?: string | null;
  dispatchId?: string | null;
}) {
  const rpcResult = await client.rpc("bridge_update_legal_document_job_phase1", {
    p_job_id: jobId,
    p_status: status,
    p_result_json: result,
    p_error_json: error,
    p_packet_version_id: packetVersionId,
    p_generation_attempt_id: generationAttemptId,
    p_dispatch_id: dispatchId,
    p_metadata_json: metadata,
  });
  if (rpcResult.error) throw rpcResult.error;
  return asRecord(rpcResult.data);
}

async function fetchJob(client: any, jobId: string) {
  const jobResult = await client
    .from("legal_document_jobs")
    .select("id, organisation_id, packet_id, packet_version_id, job_type, status, idempotency_key, generation_attempt_id, dispatch_id, target_signer_role, request_payload_json, result_json, error_json, metadata_json, attempt_count, max_attempts, available_at, next_retry_at, claimed_at, started_at, last_heartbeat_at, completed_at, failed_at, cancelled_at, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobResult.error) throw jobResult.error;
  return asRecord(jobResult.data);
}

async function fetchPacketAndVersion(client: any, packetId: string) {
  const [packetResult, versionResult] = await Promise.all([
    client
      .from("document_packets")
      .select("id, organisation_id, packet_type, status, current_version_number, template_id, transaction_id, assigned_agent_id, created_by")
      .eq("id", packetId)
      .maybeSingle(),
    client
      .from("document_packet_versions")
      .select("id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_bucket, rendered_file_path, rendered_media_type, rendered_byte_length, rendered_sha256, render_input_verified, transaction_pdf_persisted, native_pdf_verified")
      .eq("packet_id", packetId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (packetResult.error) throw packetResult.error;
  if (versionResult.error) throw versionResult.error;
  return {
    packet: asRecord(packetResult.data),
    version: asRecord(versionResult.data),
  };
}

async function runDryRunJob({
  client,
  jobId,
  requestId,
}: {
  client: any;
  jobId: string;
  requestId: string;
}) {
  const startedAt = Date.now();
  const job = await fetchJob(client, jobId);
  if (!normalizeText(job.id)) {
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "Legal document job was not found.",
        errorCode: "LEGAL_DOCUMENT_JOB_NOT_FOUND",
        requestId,
      },
    };
  }

  const currentStatus = normalizeKey(job.status);
  const jobType = normalizeKey(job.job_type);
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Terminal legal document jobs cannot be dry-run again.",
        errorCode: "LEGAL_DOCUMENT_JOB_TERMINAL",
        requestId,
        jobId,
        currentStatus,
      },
    };
  }
  if (!SUPPORTED_JOB_TYPES.has(jobType)) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_TYPE_UNSUPPORTED",
        jobType,
        dryRunOnly: true,
      },
      metadata: { dryRunRequestId: requestId },
    });
    return {
      ok: false,
      status: 422,
      body: {
        success: false,
        error: "Legal document job type is unsupported.",
        errorCode: "LEGAL_DOCUMENT_JOB_TYPE_UNSUPPORTED",
        requestId,
        jobId,
        jobType,
      },
    };
  }

  const { packet } = await fetchPacketAndVersion(client, normalizeText(job.packet_id));
  if (!normalizeText(packet.id)) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_FOUND",
        dryRunOnly: true,
      },
      metadata: { dryRunRequestId: requestId },
    });
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "The legal document packet for this job was not found.",
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_FOUND",
        requestId,
        jobId,
      },
    };
  }

  await updateJobStatus({
    client,
    jobId,
    status: "running",
    metadata: {
      dryRunRequestId: requestId,
      dryRunStartedAt: new Date(startedAt).toISOString(),
      dryRunOnly: true,
    },
  });

  let result: JsonRecord;
  try {
    result = await updateJobStatus({
      client,
      jobId,
      status: "succeeded",
      result: {
        contract: "legal-document-job-runner-phase2-dry-run-v1",
        dryRunOnly: true,
        jobId,
        jobType,
        packetId: normalizeText(packet.id),
        packetType: normalizeKey(packet.packet_type),
        packetStatus: normalizeKey(packet.status),
        wouldGenerate: jobType === "generate_packet_version" || jobType === "generate_and_send_for_signature",
        wouldSend: jobType === "send_for_signature" || jobType === "generate_and_send_for_signature",
        emailSent: false,
        documentGenerated: false,
        durationMs: Date.now() - startedAt,
      },
      metadata: {
        dryRunCompletedAt: new Date().toISOString(),
        dryRunRequestId: requestId,
        dryRunOnly: true,
      },
    });
  } catch (error) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_DRY_RUN_STATUS_WRITE_FAILED",
        message: normalizeText((error as { message?: unknown })?.message) || String(error),
        dryRunOnly: true,
      },
      metadata: {
        dryRunFailedAt: new Date().toISOString(),
        dryRunRequestId: requestId,
        dryRunOnly: true,
      },
    }).catch((statusError) => {
      console.error("[legal-document-job-runner] failed to record dry-run failure", statusError);
    });
    throw error;
  }

  console.log(JSON.stringify({
    level: "info",
    event: "legal_document_job_dry_run_completed",
    requestId,
    jobId,
    jobType,
    packetId: normalizeText(packet.id),
    durationMs: Date.now() - startedAt,
  }));

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      requestId,
      dryRun: true,
      job: result,
    },
  };
}

async function callSigningEmailFunction({
  supabaseUrl,
  serviceRoleKey,
  requestId,
  payload,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  requestId: string;
  payload: JsonRecord;
}) {
  const timeout = timeoutSignal(SEND_EMAIL_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-mandate-signing-email`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
    const body = asRecord(await response.json().catch(() => ({})));
    return {
      ok: response.ok && body.success !== false,
      status: response.status,
      body,
    };
  } finally {
    timeout.clear();
  }
}

async function callGenerateMandateFunction({
  supabaseUrl,
  serviceRoleKey,
  requestId,
  payload,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  requestId: string;
  payload: JsonRecord;
}) {
  const timeout = timeoutSignal(GENERATE_MANDATE_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-mandate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
    const body = asRecord(await response.json().catch(() => ({})));
    return {
      ok: response.ok && body.success !== false,
      status: response.status,
      body,
    };
  } finally {
    timeout.clear();
  }
}

async function prepareSigningLinkForSendJob({
  client,
  packet,
  version,
  payload,
}: {
  client: any;
  packet: JsonRecord;
  version: JsonRecord;
  payload: JsonRecord;
}) {
  if (normalizeKey(packet.packet_type) !== "mandate") {
    throw Object.assign(new Error("Background signing preparation is currently available for mandate packets only."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_MANDATE_ONLY",
    });
  }

  const targetSignerRole = normalizeKey(payload.targetSignerRole || payload.target_signer_role || payload.recipientRole);
  if (!["agent", "seller"].includes(targetSignerRole)) {
    throw Object.assign(new Error("A mandate send job must target the agent or seller signer."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_TARGET_REQUIRED",
    });
  }

  const signersResult = await client
    .from("document_packet_signers")
    .select("id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at")
    .eq("packet_id", normalizeText(packet.id))
    .eq("packet_version_id", normalizeText(version.id))
    .order("signing_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (signersResult.error) throw signersResult.error;
  const signers: JsonRecord[] = Array.isArray(signersResult.data) ? signersResult.data.map(asRecord) : [];
  if (!signers.length) {
    throw Object.assign(new Error("No packet signers are available for background signing preparation."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_SIGNERS_MISSING",
    });
  }

  const agentSigner = signers.find((signer) => normalizeKey(signer.signer_role) === "agent") || null;
  const targetSigner = signers.find((signer) => normalizeKey(signer.signer_role) === targetSignerRole) || null;
  if (!targetSigner) {
    throw Object.assign(new Error("The requested mandate signer is not configured on this packet."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_TARGET_MISSING",
    });
  }
  if (targetSignerRole === "seller" && normalizeKey(agentSigner?.status) !== "signed") {
    throw Object.assign(new Error("The agent must sign the mandate before seller-side signing links can be sent."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_AGENT_NOT_SIGNED",
    });
  }

  const signerStatus = normalizeKey(targetSigner.status);
  if (["signed", "declined"].includes(signerStatus)) {
    throw Object.assign(new Error("The requested mandate signer has already completed signing or declined."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_TARGET_COMPLETE",
    });
  }

  const dispatchResult = await client.rpc("bridge_authorize_applied_envelope_dispatch_e4", {
    p_packet_id: normalizeText(packet.id),
    p_version_id: normalizeText(version.id),
    p_regenerate: booleanFlag(payload.resend),
    p_target_signer_role: targetSignerRole,
  });
  if (dispatchResult.error) {
    const error = Object.assign(new Error(normalizeText(dispatchResult.error.message) || "Signing dispatch could not be authorized."), {
      code: normalizeText(dispatchResult.error.details) || normalizeText(dispatchResult.error.code) || "LEGAL_DOCUMENT_JOB_PREPARE_DISPATCH_FAILED",
      details: dispatchResult.error,
    });
    throw error;
  }
  const dispatch = asRecord(dispatchResult.data);
  const dispatchId = normalizeText(dispatch.dispatchId || dispatch.dispatch_id);
  if (!dispatchId) {
    throw Object.assign(new Error("Signing dispatch authorization did not return a dispatch ID."), {
      code: "LEGAL_DOCUMENT_JOB_PREPARE_DISPATCH_ID_MISSING",
    });
  }

  const expiryHours = Math.min(168, Math.max(1, numberValue(payload.expiresInHours || payload.expires_in_hours, 168)));
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(issuedAt) + expiryHours * 60 * 60 * 1000).toISOString();
  const existingToken = normalizeText(targetSigner.signing_token);
  const tokenExpiry = dateValue(targetSigner.token_expires_at);
  const shouldRefresh = booleanFlag(payload.resend) || !existingToken || !tokenExpiry || tokenExpiry <= Date.now() ||
    Boolean(normalizeText(targetSigner.token_used_at));
  const nextToken = shouldRefresh ? generateSecureSigningToken() : existingToken;
  const activeDeliveryStatus = ["sent", "viewed"].includes(signerStatus);
  const updateResult = await client
    .from("document_packet_signers")
    .update({
      signing_token: nextToken,
      token_expires_at: expiresAt,
      token_used_at: shouldRefresh ? null : targetSigner.token_used_at || null,
      viewed_at: shouldRefresh ? null : targetSigner.viewed_at || null,
      status: activeDeliveryStatus ? targetSigner.status : "ready_to_send",
    })
    .eq("id", normalizeText(targetSigner.id))
    .select("id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at, created_at, updated_at")
    .single();
  if (updateResult.error) throw updateResult.error;
  const updatedSigner = asRecord(updateResult.data);
  const baseUrl = normalizeText(payload.baseUrl || payload.base_url).replace(/\/$/, "") || "https://app.arch9.co.za";
  const portalLink = `${baseUrl}/sign/${nextToken}`;

  await client.from("document_packet_events").insert({
    packet_id: normalizeText(packet.id),
    organisation_id: normalizeText(packet.organisation_id),
    version_id: normalizeText(version.id),
    event_type: "signer_links_generated",
    event_payload_json: {
      signerCount: 1,
      packetVersionId: normalizeText(version.id),
      expiresAt,
      regenerate: booleanFlag(payload.resend),
      targetSignerRole,
      dispatchReference: `background-signing-dispatch:${normalizeText(packet.id)}:${normalizeText(version.id)}:${issuedAt}`,
      dispatchId,
      issuedAt,
      backgroundPrepared: true,
    },
  });

  return {
    portalLink,
    dispatchId,
    dispatchAlreadyDelivered: dispatch.alreadyDelivered === true,
    recipientRole: targetSignerRole,
    recipientEmail: normalizeText(updatedSigner.signer_email).toLowerCase(),
    recipientName: normalizeText(updatedSigner.signer_name),
    expiresAt,
    issuedAt,
  };
}

async function releaseGenerationLease({
  client,
  packetId,
  generationAttemptId,
}: {
  client: any;
  packetId: string;
  generationAttemptId: string;
}) {
  if (!UUID_PATTERN.test(packetId) || !UUID_PATTERN.test(generationAttemptId)) return false;
  const releaseResult = await client.rpc("bridge_release_generation_lease_i3", {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
  });
  if (releaseResult.error) {
    console.warn("[legal-document-job-runner] generation lease release failed", releaseResult.error);
    return false;
  }
  return releaseResult.data === true;
}

async function claimGenerationLease({
  client,
  packetId,
  generationAttemptId,
  ttlSeconds = WATCHDOG_GENERATION_LEASE_TTL_SECONDS,
}: {
  client: any;
  packetId: string;
  generationAttemptId: string;
  ttlSeconds?: number;
}) {
  if (!UUID_PATTERN.test(packetId) || !UUID_PATTERN.test(generationAttemptId)) return false;
  const claimResult = await client.rpc("bridge_claim_generation_lease_i3", {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
    p_ttl_seconds: ttlSeconds,
  });
  if (claimResult.error) {
    console.warn("[legal-document-job-runner] generation lease claim failed", claimResult.error);
    return false;
  }
  return claimResult.data === true;
}

function generationAttemptIdForJob(job: JsonRecord) {
  const requestPayload = asRecord(job.request_payload_json);
  const rendererRequest = asRecord(requestPayload.rendererRequest || requestPayload.renderer_request);
  const generationPayload = asRecord(rendererRequest.generationPayload || rendererRequest.generation_payload);
  return normalizeText(
    job.generation_attempt_id ||
      requestPayload.generationAttemptId ||
      requestPayload.generation_attempt_id ||
      generationPayload.generationAttemptId ||
      generationPayload.generation_attempt_id,
  );
}

function retryableGenerationFailure(job: JsonRecord) {
  const error = asRecord(job.error_json);
  const errorCode = normalizeText(error.errorCode || error.error_code || error.code).toUpperCase();
  const status = numberValue(error.status, 0);
  return (
    RETRYABLE_GENERATION_ERROR_CODES.has(errorCode) ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function watchdogRetryDecision(job: JsonRecord, now: number) {
  const status = normalizeKey(job.status);
  const attempts = numberValue(job.attempt_count, 0);
  const maxAttempts = Math.max(1, numberValue(job.max_attempts, 1));
  const createdAt = dateValue(job.created_at);
  const availableAt = dateValue(job.available_at);
  const nextRetryAt = dateValue(job.next_retry_at);
  const failedAt = dateValue(job.failed_at || job.updated_at);
  const heartbeatAt = dateValue(job.last_heartbeat_at || job.started_at || job.updated_at);
  const generationAttemptId = generationAttemptIdForJob(job);

  if (normalizeKey(job.job_type) !== "generate_packet_version") {
    return { retry: false, reason: "unsupported_job_type", generationAttemptId };
  }
  if (!UUID_PATTERN.test(normalizeText(job.packet_id)) || !UUID_PATTERN.test(generationAttemptId)) {
    return { retry: false, reason: "invalid_generation_job", generationAttemptId };
  }
  if (attempts >= maxAttempts) {
    return { retry: false, reason: "max_attempts_exhausted", generationAttemptId };
  }
  if (availableAt && availableAt > now) {
    return { retry: false, reason: "not_available_yet", generationAttemptId };
  }

  if (status === "queued") {
    return {
      retry: !createdAt || now - createdAt >= WATCHDOG_QUEUED_STALE_MS,
      reason: "queued_stale",
      generationAttemptId,
    };
  }
  if (status === "running" || status === "claimed") {
    return {
      retry: !heartbeatAt || now - heartbeatAt >= WATCHDOG_RUNNING_STALE_MS,
      reason: "running_stale",
      generationAttemptId,
    };
  }
  if (status === "failed") {
    if (nextRetryAt && nextRetryAt > now) {
      return { retry: false, reason: "retry_not_due", generationAttemptId };
    }
    if (!retryableGenerationFailure(job)) {
      return { retry: false, reason: "non_retryable_failure", generationAttemptId };
    }
    return {
      retry: !failedAt || now - failedAt >= WATCHDOG_FAILED_RETRY_DELAY_MS,
      reason: "failed_retry_due",
      generationAttemptId,
    };
  }
  return { retry: false, reason: "status_not_retryable", generationAttemptId };
}

async function reconcileGeneratedJobIfCertified({
  client,
  job,
  requestId,
}: {
  client: any;
  job: JsonRecord;
  requestId: string;
}) {
  const packetId = normalizeText(job.packet_id);
  const { packet, version } = await fetchPacketAndVersion(client, packetId);
  const versionIsCurrent =
    normalizeText(version.organisation_id) === normalizeText(packet.organisation_id) &&
    Number(version.version_number) === Number(packet.current_version_number) &&
    normalizeKey(version.render_status) === "generated";
  if (!normalizeText(packet.id) || !normalizeText(version.id) || !versionIsCurrent || !versionHasCertifiedPdf(version)) {
    return null;
  }

  return updateJobStatus({
    client,
    jobId: normalizeText(job.id),
    status: "succeeded",
    result: {
      contract: "legal-document-job-runner-phase6-watchdog-reconciled-v1",
      phase6WatchdogRetry: true,
      reconciled: true,
      jobId: normalizeText(job.id),
      packetId,
      packetVersionId: normalizeText(version.id),
      generationAttemptId: generationAttemptIdForJob(job) || null,
      documentGenerated: true,
      emailSent: false,
    },
    packetVersionId: normalizeText(version.id),
    generationAttemptId: UUID_PATTERN.test(generationAttemptIdForJob(job)) ? generationAttemptIdForJob(job) : null,
    metadata: {
      phase6WatchdogReconciledAt: new Date().toISOString(),
      phase6WatchdogRequestId: requestId,
      phase6WatchdogRetry: true,
    },
  });
}

async function fetchWatchdogCandidateJobs({
  client,
  scanLimit,
}: {
  client: any;
  scanLimit: number;
}) {
  const candidateResult = await client
    .from("legal_document_jobs")
    .select("id, organisation_id, packet_id, packet_version_id, job_type, status, idempotency_key, generation_attempt_id, dispatch_id, target_signer_role, request_payload_json, result_json, error_json, metadata_json, attempt_count, max_attempts, available_at, next_retry_at, claimed_at, started_at, last_heartbeat_at, completed_at, failed_at, cancelled_at, created_at, updated_at")
    .eq("job_type", "generate_packet_version")
    .in("status", ["queued", "claimed", "running", "failed"])
    .order("created_at", { ascending: true })
    .limit(scanLimit);
  if (candidateResult.error) throw candidateResult.error;
  return Array.isArray(candidateResult.data) ? candidateResult.data.map(asRecord) : [];
}

async function runWatchdogRetry({
  client,
  requestId,
  supabaseUrl,
  serviceRoleKey,
  batchLimit = WATCHDOG_DEFAULT_BATCH_LIMIT,
  dryRun = false,
}: {
  client: any;
  requestId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  batchLimit?: number;
  dryRun?: boolean;
}) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(1, Math.floor(batchLimit || WATCHDOG_DEFAULT_BATCH_LIMIT)), WATCHDOG_MAX_BATCH_LIMIT);
  const candidates = await fetchWatchdogCandidateJobs({ client, scanLimit: limit * 4 });
  const retried: JsonRecord[] = [];
  const reconciled: JsonRecord[] = [];
  const skipped: JsonRecord[] = [];
  const failed: JsonRecord[] = [];
  const now = Date.now();

  for (const job of candidates) {
    if (retried.length + reconciled.length >= limit) break;
    const jobId = normalizeText(job.id);
    const decision = watchdogRetryDecision(job, now);
    if (!decision.retry) {
      skipped.push({ jobId, reason: decision.reason });
      continue;
    }

    try {
      const recovered = await reconcileGeneratedJobIfCertified({ client, job, requestId });
      if (recovered) {
        reconciled.push({ jobId, packetVersionId: normalizeText(recovered.packetVersionId || recovered.packet_version_id) || null });
        continue;
      }

      if (dryRun) {
        retried.push({ jobId, dryRun: true, reason: decision.reason });
        continue;
      }

      if (normalizeKey(job.status) === "running" || normalizeKey(job.status) === "claimed") {
        await updateJobStatus({
          client,
          jobId,
          status: "failed",
          error: {
            errorCode: "LEGAL_DOCUMENT_JOB_WATCHDOG_STALE_RUNNING",
            phase6WatchdogRetry: true,
            previousStatus: normalizeKey(job.status),
          },
          generationAttemptId: UUID_PATTERN.test(decision.generationAttemptId) ? decision.generationAttemptId : null,
          metadata: {
            phase6WatchdogStaleAt: new Date().toISOString(),
            phase6WatchdogRequestId: requestId,
            phase6WatchdogRetry: true,
          },
        });
      }

      const leaseClaimed = await claimGenerationLease({
        client,
        packetId: normalizeText(job.packet_id),
        generationAttemptId: decision.generationAttemptId,
        ttlSeconds: WATCHDOG_GENERATION_LEASE_TTL_SECONDS,
      });
      if (!leaseClaimed) {
        skipped.push({ jobId, reason: "generation_lease_busy" });
        continue;
      }

      const result = await runGeneratePacketVersionJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey });
      if (result.ok) {
        retried.push({ jobId, reason: decision.reason, status: result.status });
      } else {
        failed.push({ jobId, reason: decision.reason, status: result.status, errorCode: normalizeText(result.body.errorCode) || null });
      }
    } catch (error) {
      failed.push({
        jobId,
        reason: decision.reason,
        errorCode: normalizeText((error as { code?: unknown })?.code) || "LEGAL_DOCUMENT_WATCHDOG_RETRY_FAILED",
        error: normalizeText((error as { message?: unknown })?.message) || String(error),
      });
    }
  }

  const body = {
    success: true,
    requestId,
    contract: "legal-document-job-runner-phase6-watchdog-retry-v1",
    phase6WatchdogRetry: true,
    dryRun,
    scanned: candidates.length,
    retried,
    reconciled,
    skipped,
    failed,
    durationMs: Date.now() - startedAt,
  };

  console.log(JSON.stringify({
    level: "info",
    event: "legal_document_job_watchdog_retry_completed",
    requestId,
    dryRun,
    scanned: body.scanned,
    retried: retried.length,
    reconciled: reconciled.length,
    skipped: skipped.length,
    failed: failed.length,
    durationMs: body.durationMs,
  }));

  return {
    ok: failed.length === 0,
    status: failed.length ? 207 : 200,
    body,
  };
}

async function runGeneratePacketVersionJob({
  client,
  jobId,
  requestId,
  supabaseUrl,
  serviceRoleKey,
}: {
  client: any;
  jobId: string;
  requestId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const startedAt = Date.now();
  const job = await fetchJob(client, jobId);
  if (!normalizeText(job.id)) {
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "Legal document job was not found.",
        errorCode: "LEGAL_DOCUMENT_JOB_NOT_FOUND",
        requestId,
      },
    };
  }

  const currentStatus = normalizeKey(job.status);
  const jobType = normalizeKey(job.job_type);
  const packetId = normalizeText(job.packet_id);
  const requestPayload = asRecord(job.request_payload_json);
  const rendererRequest = asRecord(requestPayload.rendererRequest || requestPayload.renderer_request);
  const versionInput = asRecord(requestPayload.versionInput || requestPayload.version_input);
  const packetUpdate = asRecord(requestPayload.packetUpdate || requestPayload.packet_update);
  const generationPayload = asRecord(rendererRequest.generationPayload || rendererRequest.generation_payload);
  const generationAttemptId = normalizeText(
    requestPayload.generationAttemptId || requestPayload.generation_attempt_id ||
      generationPayload.generationAttemptId || generationPayload.generation_attempt_id,
  );

  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Terminal legal document jobs cannot be generated again.",
        errorCode: "LEGAL_DOCUMENT_JOB_TERMINAL",
        requestId,
        jobId,
        currentStatus,
      },
    };
  }
  if (jobType !== "generate_packet_version") {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_PHASE5_GENERATE_ONLY",
        jobType,
      },
      metadata: { phase5RequestId: requestId, phase5BackgroundGeneration: true },
    });
    return {
      ok: false,
      status: 422,
      body: {
        success: false,
        error: "Phase 5 only supports generate_packet_version jobs.",
        errorCode: "LEGAL_DOCUMENT_JOB_PHASE5_GENERATE_ONLY",
        requestId,
        jobId,
        jobType,
      },
    };
  }

  const { packet } = await fetchPacketAndVersion(client, packetId);
  if (!normalizeText(packet.id)) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: { errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_FOUND", phase5BackgroundGeneration: true },
      metadata: { phase5RequestId: requestId },
    });
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "The legal document packet for this generation job was not found.",
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_FOUND",
        requestId,
        jobId,
      },
    };
  }
  if (normalizeKey(packet.packet_type) !== "mandate") {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_PHASE5_MANDATE_ONLY",
        packetType: normalizeKey(packet.packet_type),
        phase5BackgroundGeneration: true,
      },
      metadata: { phase5RequestId: requestId },
    });
    return {
      ok: false,
      status: 422,
      body: {
        success: false,
        error: "Phase 5 background generation is enabled for mandate packets only.",
        errorCode: "LEGAL_DOCUMENT_JOB_PHASE5_MANDATE_ONLY",
        requestId,
        jobId,
      },
    };
  }
  if (normalizeText(rendererRequest.packetId || rendererRequest.packet_id) !== packetId) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: { errorCode: "LEGAL_DOCUMENT_JOB_RENDER_PAYLOAD_INVALID", phase5BackgroundGeneration: true },
      metadata: { phase5RequestId: requestId },
    });
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Background generation requires a packet-bound renderer payload.",
        errorCode: "LEGAL_DOCUMENT_JOB_RENDER_PAYLOAD_INVALID",
        requestId,
        jobId,
      },
    };
  }

  await updateJobStatus({
    client,
    jobId,
    status: "running",
    generationAttemptId: UUID_PATTERN.test(generationAttemptId) ? generationAttemptId : null,
    metadata: {
      phase5RequestId: requestId,
      phase5StartedAt: new Date(startedAt).toISOString(),
      phase5BackgroundGeneration: true,
    },
  });

  try {
    const generateResult = await callGenerateMandateFunction({
      supabaseUrl,
      serviceRoleKey,
      requestId,
      payload: rendererRequest,
    });
    if (!generateResult.ok) {
      const errorBody = generateResult.body;
      throw Object.assign(new Error(normalizeText(errorBody.error) || "Mandate generation failed."), {
        code: normalizeText(errorBody.errorCode) || "LEGAL_DOCUMENT_JOB_GENERATION_FAILED",
        status: generateResult.status,
        details: errorBody,
      });
    }

    const artifact = buildGeneratedArtifact(generateResult.body);
    assertGeneratedPdfArtifact(artifact);
    const artifactProvenance = buildArtifactProvenance(artifact);
    const validationSummary = {
      ...asRecord(versionInput.validationSummaryJson || versionInput.validation_summary_json),
      generationStatus: "generated",
      previewOnly: false,
      previewOnlyReason: null,
      generationAttemptId: generationAttemptId || null,
      artifact_provenance: artifactProvenance,
      native_render_attestation: artifact.renderAttestation,
      native_pdf_layout: artifact.nativePdfLayout,
    };
    const versionResult = await client.rpc("bridge_create_document_packet_version_i1", {
      p_packet_id: packetId,
      p_render_status: "generated",
      p_rendered_document_id: artifact.renderedDocumentId,
      p_rendered_file_path: artifact.renderedFilePath,
      p_rendered_file_name: artifact.renderedFileName || null,
      p_rendered_file_url: artifact.renderedFileUrl || null,
      p_placeholders_resolved_json: asRecord(versionInput.placeholdersResolvedJson || versionInput.placeholders_resolved_json),
      p_placeholders_missing_json: Array.isArray(versionInput.placeholdersMissingJson)
        ? versionInput.placeholdersMissingJson
        : Array.isArray(versionInput.placeholders_missing_json)
        ? versionInput.placeholders_missing_json
        : [],
      p_section_manifest_json: Array.isArray(versionInput.sectionManifestJson)
        ? versionInput.sectionManifestJson
        : Array.isArray(versionInput.section_manifest_json)
        ? versionInput.section_manifest_json
        : [],
      p_validation_summary_json: validationSummary,
      p_generated_by: UUID_PATTERN.test(normalizeText(versionInput.generatedBy || versionInput.generated_by))
        ? normalizeText(versionInput.generatedBy || versionInput.generated_by)
        : null,
      p_generated_at: normalizeText(versionInput.generatedAt || versionInput.generated_at) || new Date().toISOString(),
      p_dry_run: false,
    });
    if (versionResult.error) throw versionResult.error;
    const version = asRecord(asRecord(versionResult.data).version);
    const versionId = normalizeText(version.id);
    if (!UUID_PATTERN.test(versionId)) {
      throw new Error("The generated packet version was not created.");
    }

    const certificationResult = await client.rpc("bridge_certify_native_structured_legal_pdf", {
      p_packet_id: packetId,
      p_generated_version_id: versionId,
    });
    if (certificationResult.error) throw certificationResult.error;
    const certification = asRecord(certificationResult.data);

    const sourceContextJson = {
      ...asRecord(packetUpdate.sourceContextJson || packetUpdate.source_context_json),
      lastGeneratedVersion: Number(version.version_number) || null,
      artifactProvenance,
    };
    const packetUpdateResult = await client
      .from("document_packets")
      .update({
        status: "generated",
        source_context_json: sourceContextJson,
        branding_snapshot_json: asRecord(packetUpdate.brandingSnapshotJson || packetUpdate.branding_snapshot_json),
        updated_at: new Date().toISOString(),
      })
      .eq("id", packetId);
    if (packetUpdateResult.error) {
      console.warn("[legal-document-job-runner] generated mandate packet metadata update skipped", packetUpdateResult.error);
    }

    await client.from("document_packet_events").insert([
      {
        packet_id: packetId,
        organisation_id: normalizeText(packet.organisation_id),
        version_id: versionId,
        event_type: Number(version.version_number) > 1 ? "packet_regenerated" : "version_generated",
        event_payload_json: {
          ...asRecord(requestPayload.successEventPayload || requestPayload.success_event_payload),
          activity_type: "mandate_generated",
          versionNumber: Number(version.version_number) || null,
          generationAttemptId: generationAttemptId || null,
          renderStatus: "generated",
          renderedDocumentId: artifact.renderedDocumentId,
          renderedFilePath: artifact.renderedFilePath,
          message: "Mandate was generated successfully.",
        },
      },
      {
        packet_id: packetId,
        organisation_id: normalizeText(packet.organisation_id),
        version_id: versionId,
        event_type: "mandate_pdf_created",
        event_payload_json: {
          ...asRecord(requestPayload.pdfCreatedEventPayload || requestPayload.pdf_created_event_payload),
          activity_type: "mandate_pdf_created",
          renderedFilePath: artifact.renderedFilePath,
          renderedFileName: artifact.renderedFileName || null,
          message: "Mandate PDF was created.",
        },
      },
    ]).then((eventResult: { error?: unknown }) => {
      if (eventResult.error) {
        console.warn("[legal-document-job-runner] generated mandate audit events skipped", eventResult.error);
      }
    }).catch((eventError: unknown) => {
      console.warn("[legal-document-job-runner] generated mandate audit events skipped", eventError);
    });

    const result = await updateJobStatus({
      client,
      jobId,
      status: "succeeded",
      result: {
        contract: "legal-document-job-runner-phase5-background-generation-v1",
        phase5BackgroundGeneration: true,
        jobId,
        packetId,
        packetVersionId: versionId,
        generationAttemptId: generationAttemptId || null,
        certification,
        emailSent: false,
        documentGenerated: true,
        durationMs: Date.now() - startedAt,
      },
      packetVersionId: versionId,
      generationAttemptId: UUID_PATTERN.test(generationAttemptId) ? generationAttemptId : null,
      metadata: {
        phase5CompletedAt: new Date().toISOString(),
        phase5RequestId: requestId,
        phase5BackgroundGeneration: true,
      },
    });

    console.log(JSON.stringify({
      level: "info",
      event: "legal_document_job_generation_completed",
      requestId,
      jobId,
      packetId,
      packetVersionId: versionId,
      durationMs: Date.now() - startedAt,
    }));

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        requestId,
        dryRun: false,
        job: result,
      },
    };
  } catch (error) {
    if (generationAttemptId) {
      await releaseGenerationLease({ client, packetId, generationAttemptId }).catch(() => false);
    }
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: normalizeText((error as { code?: unknown })?.code) || "LEGAL_DOCUMENT_JOB_GENERATION_FAILED",
        error: normalizeText((error as { message?: unknown })?.message) || "Mandate generation failed.",
        status: Number((error as { status?: unknown })?.status) || null,
        phase5BackgroundGeneration: true,
      },
      generationAttemptId: UUID_PATTERN.test(generationAttemptId) ? generationAttemptId : null,
      metadata: {
        phase5FailedAt: new Date().toISOString(),
        phase5RequestId: requestId,
        phase5BackgroundGeneration: true,
      },
    }).catch((statusError) => {
      console.error("[legal-document-job-runner] failed to record generation failure", statusError);
    });
    return {
      ok: false,
      status: Number((error as { status?: unknown })?.status) || 500,
      body: {
        success: false,
        error: normalizeText((error as { message?: unknown })?.message) || "Mandate generation failed.",
        errorCode: normalizeText((error as { code?: unknown })?.code) || "LEGAL_DOCUMENT_JOB_GENERATION_FAILED",
        requestId,
        jobId,
      },
    };
  }
}

async function runSendForSignatureJob({
  client,
  jobId,
  requestId,
  supabaseUrl,
  serviceRoleKey,
}: {
  client: any;
  jobId: string;
  requestId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const startedAt = Date.now();
  const job = await fetchJob(client, jobId);
  if (!normalizeText(job.id)) {
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "Legal document job was not found.",
        errorCode: "LEGAL_DOCUMENT_JOB_NOT_FOUND",
        requestId,
      },
    };
  }

  const currentStatus = normalizeKey(job.status);
  const jobType = normalizeKey(job.job_type);
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Terminal legal document jobs cannot be sent again.",
        errorCode: "LEGAL_DOCUMENT_JOB_TERMINAL",
        requestId,
        jobId,
        currentStatus,
      },
    };
  }
  if (jobType !== "send_for_signature") {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_PHASE3_SEND_ONLY",
        jobType,
      },
      metadata: {
        phase3RequestId: requestId,
        phase3SendOnly: true,
      },
    });
    return {
      ok: false,
      status: 422,
      body: {
        success: false,
        error: "Phase 3 only supports send_for_signature jobs for already-generated packets.",
        errorCode: "LEGAL_DOCUMENT_JOB_PHASE3_SEND_ONLY",
        requestId,
        jobId,
        jobType,
      },
    };
  }

  const { packet, version } = await fetchPacketAndVersion(client, normalizeText(job.packet_id));
  if (!normalizeText(packet.id) || !normalizeText(version.id)) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_FOUND",
        phase3SendOnly: true,
      },
      metadata: { phase3RequestId: requestId },
    });
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "The legal document packet for this send job was not found.",
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_FOUND",
        requestId,
        jobId,
      },
    };
  }

  const versionIsCurrent =
    normalizeText(version.organisation_id) === normalizeText(packet.organisation_id) &&
    Number(version.version_number) === Number(packet.current_version_number) &&
    normalizeKey(version.render_status) === "generated";
  if (!versionIsCurrent || !versionHasCertifiedPdf(version)) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_CERTIFIED",
        packetId: normalizeText(packet.id),
        packetVersionId: normalizeText(version.id) || null,
        phase3SendOnly: true,
      },
      metadata: { phase3RequestId: requestId },
    });
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Phase 3 send requires an already-generated, current certified PDF packet.",
        errorCode: "LEGAL_DOCUMENT_JOB_PACKET_NOT_CERTIFIED",
        requestId,
        jobId,
        packetId: normalizeText(packet.id),
        packetVersionId: normalizeText(version.id) || null,
      },
    };
  }

  const requestPayload = asRecord(job.request_payload_json);
  const emailPayload: JsonRecord = {
    ...requestPayload,
    packetId: normalizeText(packet.id),
    packet_id: normalizeText(packet.id),
    organisationId: normalizeText(packet.organisation_id),
    organisation_id: normalizeText(packet.organisation_id),
    packetVersionId: normalizeText(requestPayload.packetVersionId || requestPayload.packet_version_id) ||
      normalizeText(version.id),
    packet_version_id: normalizeText(requestPayload.packetVersionId || requestPayload.packet_version_id) ||
      normalizeText(version.id),
    dispatchId: normalizeText(requestPayload.dispatchId || requestPayload.dispatch_id || job.dispatch_id) || undefined,
    dispatch_id: normalizeText(requestPayload.dispatchId || requestPayload.dispatch_id || job.dispatch_id) || undefined,
  };
  const emailType = normalizeKey(emailPayload.type);
  let portalLink = normalizeText(emailPayload.portalLink || emailPayload.portal_link);
  let preparedSigningLink: JsonRecord | null = null;
  if (!extractSigningToken(portalLink) && booleanFlag(emailPayload.prepareSigningLink || emailPayload.prepare_signing_link)) {
    try {
      preparedSigningLink = await prepareSigningLinkForSendJob({
        client,
        packet,
        version,
        payload: {
          ...emailPayload,
          targetSignerRole: normalizeText(emailPayload.targetSignerRole || emailPayload.target_signer_role || emailPayload.recipientRole || job.target_signer_role),
        },
      });
      portalLink = normalizeText(preparedSigningLink.portalLink);
      emailPayload.portalLink = portalLink;
      emailPayload.portal_link = portalLink;
      emailPayload.dispatchId = normalizeText(preparedSigningLink.dispatchId);
      emailPayload.dispatch_id = normalizeText(preparedSigningLink.dispatchId);
      emailPayload.recipientRole = normalizeText(preparedSigningLink.recipientRole) || normalizeText(emailPayload.recipientRole);
      emailPayload.recipient_role = normalizeText(preparedSigningLink.recipientRole) || normalizeText(emailPayload.recipient_role);
      emailPayload.to = normalizeText(emailPayload.to) || normalizeText(preparedSigningLink.recipientEmail);
      emailPayload.recipientName = normalizeText(emailPayload.recipientName) || normalizeText(preparedSigningLink.recipientName) || "Signer";
    } catch (error) {
      await updateJobStatus({
        client,
        jobId,
        status: "failed",
        error: {
          errorCode: normalizeText((error as { code?: unknown })?.code) || "LEGAL_DOCUMENT_JOB_PREPARE_SIGNING_LINK_FAILED",
          error: normalizeText((error as { message?: unknown })?.message) || "Signing link preparation failed.",
          phase7BackgroundPrepareSend: true,
        },
        packetVersionId: normalizeText(version.id),
        metadata: {
          phase7FailedAt: new Date().toISOString(),
          phase7RequestId: requestId,
          phase7BackgroundPrepareSend: true,
        },
      });
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          error: normalizeText((error as { message?: unknown })?.message) || "Signing link preparation failed.",
          errorCode: normalizeText((error as { code?: unknown })?.code) || "LEGAL_DOCUMENT_JOB_PREPARE_SIGNING_LINK_FAILED",
          requestId,
          jobId,
          retryable: true,
        },
      };
    }
  }
  if (!["seller_mandate_sent", "seller_mandate", "otp_signing"].includes(emailType) || !extractSigningToken(portalLink)) {
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: "LEGAL_DOCUMENT_JOB_SEND_PAYLOAD_INVALID",
        phase3SendOnly: true,
        phase7BackgroundPrepareSend: booleanFlag(emailPayload.prepareSigningLink || emailPayload.prepare_signing_link),
      },
      packetVersionId: normalizeText(version.id),
      dispatchId: normalizeText(emailPayload.dispatchId || emailPayload.dispatch_id) || null,
      metadata: { phase3RequestId: requestId },
    });
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "The send job payload must include a supported email type and packet-bound signing link.",
        errorCode: "LEGAL_DOCUMENT_JOB_SEND_PAYLOAD_INVALID",
        requestId,
        jobId,
      },
    };
  }

  await updateJobStatus({
    client,
    jobId,
    status: "running",
    packetVersionId: normalizeText(version.id),
    dispatchId: normalizeText(emailPayload.dispatchId || emailPayload.dispatch_id) || null,
    metadata: {
      phase3RequestId: requestId,
      phase3StartedAt: new Date(startedAt).toISOString(),
      phase3SendOnly: true,
    },
  });

  const emailResult = await callSigningEmailFunction({
    supabaseUrl,
    serviceRoleKey,
    requestId,
    payload: emailPayload,
  });
  if (!emailResult.ok) {
    const errorBody = emailResult.body;
    await updateJobStatus({
      client,
      jobId,
      status: "failed",
      error: {
        errorCode: normalizeText(errorBody.errorCode) || "LEGAL_DOCUMENT_JOB_SEND_FAILED",
        error: normalizeText(errorBody.error) || "Signing email delivery failed.",
        status: emailResult.status,
        retryable: errorBody.retryable === true,
        phase3SendOnly: true,
      },
      packetVersionId: normalizeText(version.id),
      dispatchId: normalizeText(emailPayload.dispatchId || emailPayload.dispatch_id) || null,
      metadata: {
        phase3FailedAt: new Date().toISOString(),
        phase3RequestId: requestId,
        phase3SendOnly: true,
      },
    });
    return {
      ok: false,
      status: emailResult.status,
      body: {
        success: false,
        error: normalizeText(errorBody.error) || "Signing email delivery failed.",
        errorCode: normalizeText(errorBody.errorCode) || "LEGAL_DOCUMENT_JOB_SEND_FAILED",
        requestId,
        jobId,
        retryable: errorBody.retryable === true,
      },
    };
  }

  const delivery = asRecord(emailResult.body.delivery);
  const emailConfirmed = emailResult.body.emailConfirmed === true || Boolean(normalizeText(emailResult.body.emailId));
  const result = await updateJobStatus({
    client,
    jobId,
    status: "succeeded",
    result: {
      contract: "legal-document-job-runner-phase3-send-v1",
      sendOnly: true,
      preparedSigningLink: Boolean(preparedSigningLink),
      jobId,
      packetId: normalizeText(packet.id),
      packetVersionId: normalizeText(version.id),
      delivery,
      emailConfirmed,
      emailId: normalizeText(emailResult.body.emailId) || null,
      recipientRole: normalizeText(emailResult.body.recipientRole) || null,
      emailSent: emailConfirmed,
      documentGenerated: false,
      durationMs: Date.now() - startedAt,
    },
    packetVersionId: normalizeText(version.id),
    dispatchId: normalizeText(emailPayload.dispatchId || emailPayload.dispatch_id) ||
      normalizeText(delivery.dispatchId || delivery.dispatch_id) ||
      null,
    metadata: {
      phase3CompletedAt: new Date().toISOString(),
      phase3RequestId: requestId,
      phase3SendOnly: true,
      phase7BackgroundPrepareSend: Boolean(preparedSigningLink),
    },
  });

  console.log(JSON.stringify({
    level: "info",
    event: "legal_document_job_send_completed",
    requestId,
    jobId,
    packetId: normalizeText(packet.id),
    packetVersionId: normalizeText(version.id),
    emailConfirmed,
    durationMs: Date.now() - startedAt,
  }));

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      requestId,
      dryRun: false,
      job: result,
    },
  };
}

async function createSendReadyJobAndRun({
  client,
  payload,
  authority,
  requestId,
  supabaseUrl,
  serviceRoleKey,
  background,
}: {
  client: any;
  payload: JsonRecord;
  authority: { kind: "none" | "service" | "user"; userId: string };
  requestId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  background: boolean;
}) {
  const packetId = normalizeText(payload.packetId || payload.packet_id);
  if (!UUID_PATTERN.test(packetId)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "A valid packet ID is required before a server send job can be created.",
        errorCode: "LEGAL_DOCUMENT_SERVER_SEND_PACKET_REQUIRED",
        requestId,
      },
    };
  }

  const { packet, version } = await fetchPacketAndVersion(client, packetId);
  if (!normalizeText(packet.id) || !normalizeText(version.id)) {
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "The legal document packet is not ready for server send.",
        errorCode: "LEGAL_DOCUMENT_SERVER_SEND_PACKET_NOT_FOUND",
        requestId,
      },
    };
  }

  const requestedOrganisationId = normalizeText(payload.organisationId || payload.organisation_id);
  const versionIsCurrent =
    normalizeText(version.organisation_id) === normalizeText(packet.organisation_id) &&
    Number(version.version_number) === Number(packet.current_version_number) &&
    normalizeKey(version.render_status) === "generated";
  if (
    (requestedOrganisationId && requestedOrganisationId !== normalizeText(packet.organisation_id)) ||
    !versionIsCurrent ||
    !versionHasCertifiedPdf(version)
  ) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Server send requires the current packet to already have a certified generated PDF.",
        errorCode: "LEGAL_DOCUMENT_SERVER_SEND_PACKET_NOT_CERTIFIED",
        requestId,
        packetId,
        packetVersionId: normalizeText(version.id) || null,
      },
    };
  }

  let membership: JsonRecord | null = null;
  if (authority.kind === "user") {
    const membershipResult = await client
      .from("organisation_users")
      .select("role, workspace_role, organisation_role, app_role, status, membership_status")
      .eq("organisation_id", normalizeText(packet.organisation_id))
      .eq("user_id", authority.userId)
      .limit(1)
      .maybeSingle();
    if (membershipResult.error) throw membershipResult.error;
    membership = asRecord(membershipResult.data);
  }
  if (!canManagePacket({ authority, membership, packet })) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "You are not allowed to send this legal document packet.",
        errorCode: "LEGAL_DOCUMENT_SERVER_SEND_FORBIDDEN",
        requestId,
      },
    };
  }

  const emailPayload: JsonRecord = {
    ...asRecord(payload.emailPayload || payload.email_payload),
    ...payload,
    action: undefined,
    background: undefined,
    dryRun: undefined,
    dry_run: undefined,
    packetId,
    packet_id: packetId,
    organisationId: normalizeText(packet.organisation_id),
    organisation_id: normalizeText(packet.organisation_id),
    packetVersionId: normalizeText(payload.packetVersionId || payload.packet_version_id) || normalizeText(version.id),
    packet_version_id: normalizeText(payload.packetVersionId || payload.packet_version_id) || normalizeText(version.id),
  };
  const portalLink = normalizeText(emailPayload.portalLink || emailPayload.portal_link);
  const dispatchId = normalizeText(emailPayload.dispatchId || emailPayload.dispatch_id || payload.dispatchId || payload.dispatch_id);
  const emailType = normalizeKey(emailPayload.type);
  const prepareSigningLink = booleanFlag(payload.prepareSigningLink || payload.prepare_signing_link);
  if (!["seller_mandate_sent", "seller_mandate", "otp_signing"].includes(emailType) || (!extractSigningToken(portalLink) && !prepareSigningLink)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: prepareSigningLink
          ? "Server prepare-and-send requires a supported email type."
          : "Server send requires a supported email type and packet-bound signing link.",
        errorCode: "LEGAL_DOCUMENT_SERVER_SEND_PAYLOAD_INVALID",
        requestId,
      },
    };
  }

  const targetSignerRole = normalizeKey(emailPayload.recipientRole || emailPayload.recipient_role || payload.targetSignerRole);
  const recipientDigest = await sha256Text([
    packetId,
    normalizeText(version.id),
    dispatchId,
    targetSignerRole,
    extractSigningToken(portalLink) || "server-prepared-link",
    normalizeText(emailPayload.to).toLowerCase(),
  ].join(":"));
  const idempotencyKey = normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
    `${prepareSigningLink ? "phase7-prepare-send" : "phase4-send"}:${packetId}:${recipientDigest.slice(0, 40)}`;
  const createResult = await client.rpc("bridge_create_legal_document_job_phase1", {
    p_packet_id: packetId,
    p_job_type: "send_for_signature",
    p_idempotency_key: idempotencyKey,
    p_request_payload_json: {
      ...emailPayload,
      prepareSigningLink,
      prepare_signing_link: prepareSigningLink,
      baseUrl: normalizeText(payload.baseUrl || payload.base_url || emailPayload.baseUrl || emailPayload.base_url) || undefined,
      expiresInHours: numberValue(payload.expiresInHours || payload.expires_in_hours || emailPayload.expiresInHours || emailPayload.expires_in_hours, 168),
    },
    p_target_signer_role: targetSignerRole || null,
    p_metadata_json: {
      phase4UiServerSend: true,
      phase7BackgroundPrepareSend: prepareSigningLink,
      requestedByUserId: authority.kind === "user" ? authority.userId : null,
      requestId,
    },
  });
  if (createResult.error) throw createResult.error;
  const createdJob = asRecord(createResult.data);
  const jobId = normalizeText(createdJob.jobId || createdJob.job_id);
  if (!UUID_PATTERN.test(jobId)) {
    throw new Error("The server send job was not created.");
  }

  if (background) {
    const scheduler = queueBackgroundTask(async () => {
      const result = await runSendForSignatureJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey });
      if (!result.ok) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "legal_document_server_send_job_rejected",
          requestId,
          jobId,
          status: result.status,
          body: result.body,
        }));
      }
    });
    return {
      ok: true,
      status: 202,
      body: {
        success: true,
        accepted: true,
        background: true,
        scheduler,
        requestId,
        job: createdJob,
      },
    };
  }

  return runSendForSignatureJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey });
}

async function createGenerateReadyJobAndRun({
  client,
  payload,
  authority,
  requestId,
  supabaseUrl,
  serviceRoleKey,
}: {
  client: any;
  payload: JsonRecord;
  authority: { kind: "none" | "service" | "user"; userId: string };
  requestId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const packetId = normalizeText(payload.packetId || payload.packet_id);
  if (!UUID_PATTERN.test(packetId)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "A valid packet ID is required before a background generation job can be created.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_PACKET_REQUIRED",
        requestId,
      },
    };
  }

  const { packet } = await fetchPacketAndVersion(client, packetId);
  if (!normalizeText(packet.id)) {
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        error: "The legal document packet is not ready for background generation.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_PACKET_NOT_FOUND",
        requestId,
      },
    };
  }
  if (normalizeKey(packet.packet_type) !== "mandate") {
    return {
      ok: false,
      status: 422,
      body: {
        success: false,
        error: "Background generation is currently enabled for mandate packets only.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_MANDATE_ONLY",
        requestId,
      },
    };
  }

  const requestedOrganisationId = normalizeText(payload.organisationId || payload.organisation_id);
  if (requestedOrganisationId && requestedOrganisationId !== normalizeText(packet.organisation_id)) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        error: "Background generation request does not match the packet organisation.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_ORG_MISMATCH",
        requestId,
      },
    };
  }

  let membership: JsonRecord | null = null;
  if (authority.kind === "user") {
    const membershipResult = await client
      .from("organisation_users")
      .select("role, workspace_role, organisation_role, app_role, status, membership_status")
      .eq("organisation_id", normalizeText(packet.organisation_id))
      .eq("user_id", authority.userId)
      .limit(1)
      .maybeSingle();
    if (membershipResult.error) throw membershipResult.error;
    membership = asRecord(membershipResult.data);
  }
  if (!canManagePacket({ authority, membership, packet })) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "You are not allowed to generate this legal document packet.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_FORBIDDEN",
        requestId,
      },
    };
  }

  const rendererRequest = asRecord(payload.rendererRequest || payload.renderer_request);
  const versionInput = asRecord(payload.versionInput || payload.version_input);
  const generationPayload = asRecord(rendererRequest.generationPayload || rendererRequest.generation_payload);
  const generationAttemptId = normalizeText(
    payload.generationAttemptId || payload.generation_attempt_id ||
      generationPayload.generationAttemptId || generationPayload.generation_attempt_id,
  );
  if (normalizeText(rendererRequest.packetId || rendererRequest.packet_id) !== packetId || !UUID_PATTERN.test(generationAttemptId)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Background generation requires a packet-bound renderer payload and generation attempt.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_PAYLOAD_INVALID",
        requestId,
      },
    };
  }
  if (!Object.keys(versionInput).length) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: "Background generation requires packet-version persistence metadata.",
        errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_VERSION_INPUT_REQUIRED",
        requestId,
      },
    };
  }

  const digest = await sha256Text([
    packetId,
    generationAttemptId,
    normalizeText(rendererRequest.outputPath || rendererRequest.output_path),
  ].join(":"));
  const idempotencyKey = normalizeText(payload.idempotencyKey || payload.idempotency_key) ||
    `phase5-generate:${packetId}:${digest.slice(0, 40)}`;
  const createResult = await client.rpc("bridge_create_legal_document_job_phase1", {
    p_packet_id: packetId,
    p_job_type: "generate_packet_version",
    p_idempotency_key: idempotencyKey,
    p_request_payload_json: {
      ...payload,
      action: undefined,
      background: undefined,
      dryRun: undefined,
      dry_run: undefined,
      packetId,
      packet_id: packetId,
      organisationId: normalizeText(packet.organisation_id),
      organisation_id: normalizeText(packet.organisation_id),
      generationAttemptId,
      generation_attempt_id: generationAttemptId,
      rendererRequest,
      versionInput,
    },
    p_target_signer_role: null,
    p_metadata_json: {
      phase5UiBackgroundGeneration: true,
      requestedByUserId: authority.kind === "user" ? authority.userId : null,
      requestId,
    },
  });
  if (createResult.error) throw createResult.error;
  const createdJob = asRecord(createResult.data);
  const jobId = normalizeText(createdJob.jobId || createdJob.job_id);
  if (!UUID_PATTERN.test(jobId)) {
    throw new Error("The background generation job was not created.");
  }

  const scheduler = queueBackgroundTask(async () => {
    const result = await runGeneratePacketVersionJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey });
    if (!result.ok) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "legal_document_background_generation_job_rejected",
        requestId,
        jobId,
        status: result.status,
        body: result.body,
      }));
    }
  });
  return {
    ok: true,
    status: 202,
    body: {
      success: true,
      accepted: true,
      background: true,
      scheduler,
      requestId,
      job: createdJob,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, {
      success: false,
      error: "Method not allowed.",
      errorCode: "METHOD_NOT_ALLOWED",
    });
  }

  const requestId = normalizeText(req.headers.get("x-request-id")) || crypto.randomUUID();
  try {
    const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
    const serviceRoleKey = normalizeText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, {
        success: false,
        error: "Legal document job runner is not configured.",
        errorCode: "LEGAL_DOCUMENT_JOB_RUNNER_NOT_CONFIGURED",
        requestId,
      });
    }

    const payload = asRecord(await req.json().catch(() => ({})));
    const action = normalizeKey(payload.action);
    const dryRun = booleanFlag(payload.dryRun ?? payload.dry_run);
    const background = booleanFlag(payload.background);
    const jobId = normalizeText(payload.jobId || payload.job_id);
    const client: any = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "send_ready_packet") {
      const authority = await resolveInvocationAuthority({ req, client, serviceRoleKey });
      if (authority.kind === "none") {
        return jsonResponse(401, {
          success: false,
          error: "Authenticated server-send authority is required.",
          errorCode: "LEGAL_DOCUMENT_SERVER_SEND_AUTH_REQUIRED",
          requestId,
        });
      }
      const result = await createSendReadyJobAndRun({
        client,
        payload,
        authority,
        requestId,
        supabaseUrl,
        serviceRoleKey,
        background,
      });
      return jsonResponse(result.status, result.body);
    }

    if (action === "prepare_and_send_ready_packet") {
      const authority = await resolveInvocationAuthority({ req, client, serviceRoleKey });
      if (authority.kind === "none") {
        return jsonResponse(401, {
          success: false,
          error: "Authenticated server-send authority is required.",
          errorCode: "LEGAL_DOCUMENT_SERVER_SEND_AUTH_REQUIRED",
          requestId,
        });
      }
      const result = await createSendReadyJobAndRun({
        client,
        payload: {
          ...payload,
          prepareSigningLink: true,
          prepare_signing_link: true,
          background: payload.background ?? true,
        },
        authority,
        requestId,
        supabaseUrl,
        serviceRoleKey,
        background: true,
      });
      return jsonResponse(result.status, result.body);
    }

    if (action === "generate_ready_packet") {
      const authority = await resolveInvocationAuthority({ req, client, serviceRoleKey });
      if (authority.kind === "none") {
        return jsonResponse(401, {
          success: false,
          error: "Authenticated background-generation authority is required.",
          errorCode: "LEGAL_DOCUMENT_BACKGROUND_GENERATION_AUTH_REQUIRED",
          requestId,
        });
      }
      const result = await createGenerateReadyJobAndRun({
        client,
        payload,
        authority,
        requestId,
        supabaseUrl,
        serviceRoleKey,
      });
      return jsonResponse(result.status, result.body);
    }

    if (action === "watchdog_retry") {
      const token = bearerToken(req);
      const hasWatchdogAuthority = token === serviceRoleKey || await authorizeServiceCredential(supabaseUrl, token);
      if (!hasWatchdogAuthority) {
        return jsonResponse(401, {
          success: false,
          error: "Service-role watchdog authority is required.",
          errorCode: "LEGAL_DOCUMENT_WATCHDOG_AUTH_REQUIRED",
          requestId,
        });
      }
      const batchLimit = numberValue(payload.batchLimit || payload.batch_limit, WATCHDOG_DEFAULT_BATCH_LIMIT);
      if (background) {
        const scheduler = queueBackgroundTask(async () => {
          const result = await runWatchdogRetry({
            client,
            requestId,
            supabaseUrl,
            serviceRoleKey,
            batchLimit,
            dryRun,
          });
          if (!result.ok) {
            console.warn(JSON.stringify({
              level: "warn",
              event: "legal_document_job_watchdog_retry_partial_failure",
              requestId,
              status: result.status,
              body: result.body,
            }));
          }
        });
        return jsonResponse(202, {
          success: true,
          accepted: true,
          dryRun,
          background: true,
          scheduler,
          requestId,
          contract: "legal-document-job-runner-phase6-watchdog-retry-v1",
        });
      }
      const result = await runWatchdogRetry({
        client,
        requestId,
        supabaseUrl,
        serviceRoleKey,
        batchLimit,
        dryRun,
      });
      return jsonResponse(result.status, result.body);
    }

    if (bearerToken(req) !== serviceRoleKey) {
      return jsonResponse(401, {
        success: false,
        error: "Service-role job runner authority is required.",
        errorCode: "LEGAL_DOCUMENT_JOB_RUNNER_AUTH_REQUIRED",
        requestId,
      });
    }
    if (!UUID_PATTERN.test(jobId)) {
      return jsonResponse(400, {
        success: false,
        error: "A valid legal document job ID is required.",
        errorCode: "LEGAL_DOCUMENT_JOB_ID_REQUIRED",
        requestId,
      });
    }

    if (background) {
      const scheduler = queueBackgroundTask(async () => {
        const job = await fetchJob(client, jobId);
        const jobType = normalizeKey(job.job_type);
        const result = dryRun
          ? await runDryRunJob({ client, jobId, requestId })
          : jobType === "generate_packet_version"
          ? await runGeneratePacketVersionJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey })
          : await runSendForSignatureJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey });
        if (!result.ok) {
          console.warn(JSON.stringify({
            level: "warn",
            event: dryRun
              ? "legal_document_job_dry_run_rejected"
              : jobType === "generate_packet_version"
              ? "legal_document_job_generation_rejected"
              : "legal_document_job_send_rejected",
            requestId,
            jobId,
            status: result.status,
            body: result.body,
          }));
        }
      });
      return jsonResponse(202, {
        success: true,
        accepted: true,
        dryRun,
        background: true,
        scheduler,
        requestId,
        jobId,
      });
    }

    const job = await fetchJob(client, jobId);
    const jobType = normalizeKey(job.job_type);
    const result = dryRun
      ? await runDryRunJob({ client, jobId, requestId })
      : jobType === "generate_packet_version"
      ? await runGeneratePacketVersionJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey })
      : await runSendForSignatureJob({ client, jobId, requestId, supabaseUrl, serviceRoleKey });
    return jsonResponse(result.status, result.body);
  } catch (error) {
    console.error("[legal-document-job-runner] failed", error);
    return jsonResponse(500, {
      success: false,
      error: "Legal document job runner failed.",
      errorCode: "LEGAL_DOCUMENT_JOB_RUNNER_FAILED",
      details: normalizeText((error as { message?: unknown })?.message) || String(error),
      requestId,
    });
  }
});
