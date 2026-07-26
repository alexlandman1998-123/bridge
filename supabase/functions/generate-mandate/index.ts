import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import Docxtemplater from "docxtemplater";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import {
  NATIVE_RENDERER_VERSION,
  TEMPLATE_RENDER_MODES,
  renderStructuredTemplate,
} from "../../../the-it-guy/src/core/documents/structuredTemplateRenderer.js";
import {
  assertLegalDocumentPilotRelease,
  LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT,
} from "../_shared/legalDocumentPilotRelease.ts";
import { bindLegalDocumentPilotReleaseTrace } from "../_shared/legalDocumentPilotLifecycleTrace.ts";

type JsonRecord = Record<string, unknown>;

type MandateSection = {
  key?: string;
  label?: string;
  content?: string;
  legalText?: string;
  legal_text?: string;
  required?: boolean;
  placeholders?: Array<[string, string]> | string[];
  metadata?: Record<string, unknown>;
  metadata_json?: Record<string, unknown>;
};

type PlannedSigningField = {
  signerRole: string;
  fieldType: "signature";
  pageNumber: number;
  xPosition: number;
  yPosition: number;
  width: number;
  height: number;
  required: boolean;
  label: string;
};

type StructuredPdfRenderResult = {
  bytes: Uint8Array;
  pageCount: number;
  plannedSigningFields: PlannedSigningField[];
  layoutContract: string;
};

type GenerateMandateRequest = {
  capacityProbe?: boolean;
  capacity_probe?: boolean;
  packetId?: string;
  packet_id?: string;
  transactionId?: string;
  transaction_id?: string;
  leadId?: string;
  lead_id?: string;
  renderMode?: string;
  render_mode?: string;
  templatePath?: string;
  template_path?: string;
  templateBucket?: string;
  template_bucket?: string;
  templateBase64?: string;
  template_base64?: string;
  templateFilename?: string;
  template_filename?: string;
  outputBucket?: string;
  output_bucket?: string;
  outputPath?: string;
  output_path?: string;
  generatedByUserId?: string;
  generated_by_user_id?: string;
  generatedByRole?: string;
  generated_by_role?: string;
  clientVisible?: boolean;
  client_visible?: boolean;
  placeholders?: Record<string, unknown>;
  sectionManifest?: MandateSection[];
  section_manifest?: MandateSection[];
  generationPayload?: Record<string, unknown>;
  generation_payload?: Record<string, unknown>;
  sourceContext?: Record<string, unknown>;
  source_context?: Record<string, unknown>;
  branding?: Record<string, unknown>;
  templateVersion?: string;
  template_version?: string;
};

const RENDERER_CONTRACT = "i2-v1";
const PHASE4_TEMPLATE_RELEASE_CONTRACT = "phase4-server-template-release-v1";
const PHASE4_B3_RELEASE_CONTRACT = "phase4-b3-integrity-v1";

type GenerationBlockAuditContext = {
  packetId: string;
  organisationId: string;
  packetType: string;
  templateId: string;
  errorCode: string;
};

const TEMPLATE_RELEASE_BLOCK_CODES = new Set([
  "TEMPLATE_NOT_PUBLISHED",
  "TEMPLATE_INACTIVE",
  "LEGAL_TEMPLATE_APPROVAL_REQUIRED",
  "LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED",
  "LEGAL_DOCUMENT_PILOT_DISABLED",
  "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_REQUIRED",
  "LEGAL_DOCUMENT_PILOT_PLAN_DIGEST_INVALID",
  "LEGAL_DOCUMENT_PILOT_COHORT_INVALID",
  "LEGAL_DOCUMENT_PILOT_ORGANISATION_NOT_ALLOWLISTED",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "x-legal-renderer-contract": RENDERER_CONTRACT },
  });
}

function mapFailureCodeFromMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  if (!normalized) return "MANDATE_GENERATION_FAILED";
  if (normalized.includes("template source missing")) return "MISSING_TEMPLATE_FILE";
  if (normalized.includes("unable to download mandate template")) return "MISSING_TEMPLATE_FILE";
  if (normalized.includes("not renderable")) return "NATIVE_TEMPLATE_NOT_RENDERABLE";
  if (normalized.includes("html render")) return "HTML_RENDER_FAILED";
  if (normalized.includes("pdf render") || normalized.includes("gotenberg")) return "PDF_RENDER_FAILED";
  if (normalized.includes("not a valid .docx")) return "INVALID_TEMPLATE_FILE";
  if (normalized.includes("render failed") || normalized.includes("placeholder")) return "DOCX_RENDER_FAILED";
  if (normalized.includes("upload")) return "STORAGE_UPLOAD_FAILED";
  if (normalized.includes("document")) return "DOCUMENT_RECORD_CREATE_FAILED";
  return "MANDATE_GENERATION_FAILED";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function sha256Hex(bytes: Uint8Array) {
  const input = Uint8Array.from(bytes).buffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function requireCaller(req: Request) {
  const authorization = normalizeText(req.headers.get("authorization"));
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw Object.assign(new Error("Authentication is required."), { code: "AUTH_REQUIRED", status: 401 });

  // This function is deployed with verify_jwt enabled, so the gateway has already
  // verified the signature before this handler runs. Avoid a second remote Auth
  // request here: it can stall an otherwise completed document render when Auth is
  // degraded, while adding no extra assurance.
  try {
    const payloadPart = token.split(".")[1] || "";
    const base64Payload = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = base64Payload.padEnd(base64Payload.length + ((4 - (base64Payload.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(paddedPayload)) as { sub?: unknown };
    const id = normalizeText(payload.sub);
    if (!id) throw new Error("JWT subject missing");
    return { id };
  } catch (_error) {
    throw Object.assign(new Error("The authenticated user could not be verified."), { code: "AUTH_INVALID", status: 401 });
  }
}

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

function membershipIsActive(membership: JsonRecord | null) {
  const status = normalizeText(membership?.membership_status || membership?.status).toLowerCase();
  return status === "active" || status === "accepted";
}

function membershipIsPrivileged(membership: JsonRecord | null) {
  return [
    membership?.role,
    membership?.workspace_role,
    membership?.organisation_role,
    membership?.app_role,
  ].some((role) => PRIVILEGED_PACKET_ROLES.has(normalizeText(role).toLowerCase()));
}

async function assertPacketGenerationAuthority({
  supabase,
  packet,
  caller,
}: {
  supabase: any;
  packet: JsonRecord;
  caller: { id?: string | null; service?: boolean };
}) {
  if (caller.service) return;
  const userId = normalizeText(caller.id);
  if (!userId) {
    throw Object.assign(new Error("Authenticated packet generation authority is required."), {
      code: "PACKET_GENERATION_FORBIDDEN",
      status: 403,
    });
  }
  const membershipResult = await supabase
    .from("organisation_users")
    .select("role, workspace_role, organisation_role, app_role, status, membership_status")
    .eq("organisation_id", normalizeText(packet.organisation_id))
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  const membership = membershipResult.data as JsonRecord | null;
  const mayGenerate = membershipIsActive(membership) && (
    membershipIsPrivileged(membership) ||
    userId === normalizeText(packet.assigned_agent_id) ||
    userId === normalizeText(packet.created_by)
  );
  if (!mayGenerate) {
    throw Object.assign(new Error("You are not allowed to generate this legal packet."), {
      code: "PACKET_GENERATION_FORBIDDEN",
      status: 403,
    });
  }
}

async function assertGenerationLeaseFenceI5(supabase: any, packetId: string, generationAttemptId: string, stage: "pre_render" | "pre_persist") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationAttemptId)) {
    throw Object.assign(new Error("A valid generation attempt is required before rendering."), { code: "GENERATION_LEASE_FENCE_REJECTED", status: 409 });
  }
  const result = await supabase.rpc("bridge_assert_generation_lease_i5", {
    p_packet_id: packetId,
    p_generation_attempt_id: generationAttemptId,
    p_stage: stage,
  });
  if (result.error || result.data?.contract !== "i5-generator-v1" || result.data?.fenced !== true) {
    throw Object.assign(new Error("This generation attempt is no longer active. Refresh before trying again."), {
      code: "GENERATION_LEASE_FENCE_REJECTED",
      status: 409,
      details: result.error?.message || null,
    });
  }
  return result.data;
}

async function requireApprovedMandateTemplate({ supabase, packetId, requestedTemplateId, templatePath, templateBucket, templateBase64, renderMode, caller, enforceReleaseGate }: {
  supabase: any;
  packetId: string;
  requestedTemplateId: string;
  templatePath: string;
  templateBucket: string;
  templateBase64: string;
  renderMode: string;
  caller: { id?: string | null; service?: boolean };
  enforceReleaseGate?: boolean;
}) {
  const packetResult = await supabase
    .from("document_packets")
    .select("id, template_id, packet_type, organisation_id, transaction_id, assigned_agent_id, created_by, status, current_version_number, source_context_json")
    .eq("id", packetId)
    .maybeSingle();
  if (packetResult.error) throw packetResult.error;
  const packet = packetResult.data as JsonRecord | null;
  // Do this before inspecting the packet's template linkage or fetching any
  // template row. Otherwise an authenticated user outside the organisation
  // could learn limited release state through distinct validation failures.
  if (packet && enforceReleaseGate) {
    await assertPacketGenerationAuthority({ supabase, packet, caller });
  }
  const packetTemplateId = normalizeText(packet?.template_id);
  const packetType = normalizeText(packet?.packet_type).toLowerCase() || "mandate";
  // This endpoint also renders non-legal commercial packet types. Phase 4's
  // counsel/B3/pilot boundary is deliberately limited to the two governed
  // legal flows; source binding and caller authority remain mandatory for
  // every packet type.
  const isPhase4LegalPacket = packetType === "otp" || packetType === "mandate";
  const packetAudit = {
    packetId,
    organisationId: normalizeText(packet?.organisation_id),
    packetType,
    templateId: packetTemplateId,
  };
  if (!packet || !packetTemplateId || (requestedTemplateId && requestedTemplateId !== packetTemplateId)) {
    throw Object.assign(new Error("The packet is not linked to the selected approved mandate template."), {
      code: "LEGAL_TEMPLATE_SOURCE_MISMATCH",
      status: 422,
      auditContext: { ...packetAudit, errorCode: "LEGAL_TEMPLATE_SOURCE_MISMATCH" },
    });
  }
  const templateResult = await supabase
    .from("document_packet_templates")
    .select("id, packet_type, template_key, template_format, status, is_active, template_storage_bucket, template_storage_path, metadata_json")
    .eq("id", packetTemplateId)
    .maybeSingle();
  if (templateResult.error) throw templateResult.error;
  if (!templateResult.data) throw Object.assign(new Error("The selected document template was not found."), { code: "TEMPLATE_NOT_FOUND", status: 422, auditContext: packetAudit });
  const template = templateResult.data as JsonRecord;
  const templatePacketType = normalizeText(template.packet_type).toLowerCase();
  if (enforceReleaseGate && templatePacketType !== packetType) {
    throw Object.assign(new Error("The selected template does not match this packet type."), {
      code: "LEGAL_TEMPLATE_SOURCE_MISMATCH",
      status: 422,
      auditContext: { ...packetAudit, templateId: normalizeText(template.id) || packetTemplateId },
    });
  }
  if (template.is_active === false) throw Object.assign(new Error("The selected document template is inactive."), {
    code: "TEMPLATE_INACTIVE",
    status: 422,
    auditContext: { ...packetAudit, templateId: normalizeText(template.id) || packetTemplateId },
  });
  if (enforceReleaseGate && isPhase4LegalPacket) {
    await assertTemplateReleaseApproved({
      supabase,
      template,
      packetAudit: { ...packetAudit, templateId: normalizeText(template.id) || packetTemplateId },
    });
  }
  if (packetType === "otp") {
    const metadata = asRecord(template.metadata_json);
    const templateFormat = normalizeText(template.template_format).toLowerCase();
    const approvedRenderMode = normalizeText(metadata.render_mode || metadata.renderMode);
    if (!['structured', 'json'].includes(templateFormat) || approvedRenderMode !== TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
      throw Object.assign(new Error("OTP packets require a published structured template approved for native PDF rendering."), {
        code: "OTP_CANONICAL_TEMPLATE_REQUIRED",
        status: 422,
      });
    }
  }
  if (renderMode !== TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
    const approvedPath = normalizeText(template.template_storage_path);
    const approvedBucket = normalizeText(template.template_storage_bucket);
    if (templateBase64 || !approvedPath || templatePath !== approvedPath || (approvedBucket && templateBucket !== approvedBucket)) {
      throw Object.assign(new Error("Mandate generation must use the exact approved template source."), { code: "LEGAL_TEMPLATE_SOURCE_MISMATCH", status: 422 });
    }
  }
  return { templateId: normalizeText(template.id), packetType, packet, isPhase4LegalPacket };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readTemplateLegalApproval(template: JsonRecord) {
  const metadata = asRecord(template.metadata_json);
  const nested = asRecord(metadata.legal_review || metadata.legalReview);
  return {
    status: normalizeText(metadata.legal_review_status || metadata.legalApprovalStatus || nested.status).toLowerCase(),
    approvedAt: normalizeText(metadata.legal_approved_at || metadata.legalApprovedAt || nested.approvedAt),
    reference: normalizeText(metadata.legal_approval_reference || metadata.legalApprovalReference || nested.reference),
    contentDigest: normalizeText(metadata.legal_approval_content_digest || metadata.legalApprovalContentDigest || nested.contentDigest),
    reviewEvidenceDigest: normalizeText(metadata.legal_counsel_review_evidence_digest || metadata.legalCounselReviewEvidenceDigest || nested.reviewEvidenceDigest),
    revokedAt: normalizeText(metadata.legal_revoked_at || metadata.legalRevokedAt || nested.revokedAt),
    b1ManifestDigest: normalizeText(metadata.legal_b1_manifest_digest || metadata.legalB1ManifestDigest),
    b3AppliedAt: normalizeText(metadata.legal_b3_applied_at || metadata.legalB3AppliedAt),
    b3AppliedBy: normalizeText(metadata.legal_b3_applied_by || metadata.legalB3AppliedBy),
    b3ApplicationReference: normalizeText(metadata.legal_b3_application_reference || metadata.legalB3ApplicationReference),
    phase4B3ReleaseContract: normalizeText(metadata.legal_phase4_b3_release_contract || metadata.legalPhase4B3ReleaseContract),
  };
}

function sameApprovalInstant(left: unknown, right: unknown) {
  const leftTime = Date.parse(normalizeText(left));
  const rightTime = Date.parse(normalizeText(right));
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function runtimeApprovalRequired(packetAudit: Omit<GenerationBlockAuditContext, "errorCode">, message: string) {
  return Object.assign(new Error(message), {
    code: "LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED",
    status: 422,
    auditContext: { ...packetAudit, errorCode: "LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED" },
  });
}

async function assertTemplateReleaseApproved({ supabase, template, packetAudit }: { supabase: any; template: JsonRecord; packetAudit: Omit<GenerationBlockAuditContext, "errorCode"> }) {
  const approval = readTemplateLegalApproval(template);
  const approvedAt = Date.parse(approval.approvedAt);
  const b3AppliedAt = Date.parse(approval.b3AppliedAt);
  if (normalizeText(template.status).toLowerCase() !== "published") {
    throw Object.assign(new Error("The exact packet template must be published before generation."), {
      code: "TEMPLATE_NOT_PUBLISHED",
      status: 422,
      auditContext: { ...packetAudit, errorCode: "TEMPLATE_NOT_PUBLISHED" },
    });
  }
  if (template.is_active !== true) {
    throw Object.assign(new Error("The exact packet template must be active before generation."), {
      code: "TEMPLATE_INACTIVE",
      status: 422,
      auditContext: { ...packetAudit, errorCode: "TEMPLATE_INACTIVE" },
    });
  }
  if (
    approval.status !== "approved" ||
    !approval.approvedAt ||
    !Number.isFinite(approvedAt) ||
    approvedAt > Date.now() + 5 * 60 * 1000 ||
    !approval.reference ||
    !approval.contentDigest ||
    !approval.reviewEvidenceDigest ||
    Boolean(approval.revokedAt)
  ) {
    throw Object.assign(new Error("Generation is locked until the exact packet template has a current, independently supplied legal approval."), {
      code: "LEGAL_TEMPLATE_APPROVAL_REQUIRED",
      status: 422,
      auditContext: { ...packetAudit, errorCode: "LEGAL_TEMPLATE_APPROVAL_REQUIRED" },
    });
  }
  if (
    !approval.b1ManifestDigest ||
    !approval.b3AppliedAt ||
    !Number.isFinite(b3AppliedAt) ||
    b3AppliedAt > Date.now() + 5 * 60 * 1000 ||
    !approval.b3AppliedBy ||
    !approval.b3ApplicationReference ||
    approval.phase4B3ReleaseContract !== PHASE4_B3_RELEASE_CONTRACT
  ) {
    throw runtimeApprovalRequired(packetAudit, "Generation is locked until the exact packet template has been promoted through the B3 runtime approval flow.");
  }

  // Metadata is only a cache of the service-owned B3 transition. Bind it to
  // the matching append-only B3 audit event so a direct template edit cannot
  // impersonate legal approval.
  const provenanceResult = await supabase
    .from("document_packet_template_release_provenance_phase4")
    .select("audit_event_id, content_digest, review_evidence_digest, b1_manifest_digest, review_reference, reviewed_by, reviewed_at, b3_applied_at, b3_applied_by, b3_application_reference, release_contract")
    .eq("template_id", normalizeText(template.id))
    .eq("content_digest", approval.contentDigest)
    .eq("review_evidence_digest", approval.reviewEvidenceDigest)
    .eq("b1_manifest_digest", approval.b1ManifestDigest)
    .eq("review_reference", approval.reference)
    .eq("b3_applied_by", approval.b3AppliedBy)
    .eq("b3_application_reference", approval.b3ApplicationReference)
    .eq("release_contract", PHASE4_B3_RELEASE_CONTRACT);
  if (provenanceResult.error) {
    throw runtimeApprovalRequired(packetAudit, "Generation is locked until the template's protected B3 provenance can be verified.");
  }
  const matchingProvenanceAuditIds = new Set((provenanceResult.data || [])
    .filter((row: JsonRecord) => (
      normalizeText(row.content_digest) === approval.contentDigest &&
      normalizeText(row.review_evidence_digest) === approval.reviewEvidenceDigest &&
      normalizeText(row.b1_manifest_digest) === approval.b1ManifestDigest &&
      normalizeText(row.review_reference) === approval.reference &&
      sameApprovalInstant(row.reviewed_at, approval.approvedAt) &&
      normalizeText(row.b3_applied_by) === approval.b3AppliedBy &&
      normalizeText(row.b3_application_reference) === approval.b3ApplicationReference &&
      sameApprovalInstant(row.b3_applied_at, approval.b3AppliedAt) &&
      normalizeText(row.release_contract) === approval.phase4B3ReleaseContract
    ))
    .map((row: JsonRecord) => normalizeText(row.audit_event_id))
    .filter(Boolean));
  if (!matchingProvenanceAuditIds.size) {
    throw runtimeApprovalRequired(packetAudit, "Generation is locked until the template's protected B3 provenance matches its current legal evidence.");
  }
  const auditResult = await supabase
    .from("document_packet_template_audit")
    .select("id, event_payload_json, created_at")
    .in("id", [...matchingProvenanceAuditIds])
    .eq("template_id", normalizeText(template.id))
    .eq("event_type", "legal_counsel_approval_applied");
  if (auditResult.error) {
    throw runtimeApprovalRequired(packetAudit, "Generation is locked until the template's B3 runtime approval record can be verified.");
  }
  const matchingAudit = (auditResult.data || []).some((row: JsonRecord) => {
    const payload = asRecord(row.event_payload_json);
    return (
      matchingProvenanceAuditIds.has(normalizeText(row.id)) &&
      normalizeText(payload.contentDigest) === approval.contentDigest &&
      normalizeText(payload.reviewEvidenceDigest) === approval.reviewEvidenceDigest &&
      normalizeText(payload.b1ManifestDigest) === approval.b1ManifestDigest &&
      normalizeText(payload.reviewReference) === approval.reference &&
      normalizeText(payload.b3AppliedBy) === approval.b3AppliedBy &&
      normalizeText(payload.b3ApplicationReference) === approval.b3ApplicationReference &&
      normalizeText(payload.phase4B3ReleaseContract) === approval.phase4B3ReleaseContract &&
      sameApprovalInstant(payload.reviewedAt, approval.approvedAt) &&
      sameApprovalInstant(row.created_at, approval.b3AppliedAt)
    );
  });
  if (!matchingAudit) {
    throw runtimeApprovalRequired(packetAudit, "Generation is locked until the template's B3 runtime approval record matches its current legal evidence.");
  }
}

function assertDocumentPilotAllowed(packet: JsonRecord, templateId: string) {
  const packetId = normalizeText(packet.id);
  const organisationId = normalizeText(packet.organisation_id).toLowerCase();
  const packetType = normalizeText(packet.packet_type).toLowerCase() || "mandate";
  const auditBase = { packetId, organisationId, packetType, templateId };
  try {
    return assertLegalDocumentPilotRelease({
      organisationId,
      operation: "canonical_generation",
    });
  } catch (error) {
    const typed = error as { code?: unknown; status?: unknown; message?: unknown };
    const errorCode = normalizeText(typed.code) || "LEGAL_DOCUMENT_PILOT_RELEASE_BLOCKED";
    const errorStatus = Number(typed.status);
    throw Object.assign(
      error instanceof Error ? error : new Error(normalizeText(typed.message) || "Legal-document generation is not enabled for this packet organisation."),
      {
        code: errorCode,
        status: Number.isFinite(errorStatus) ? errorStatus : 403,
        auditContext: { ...auditBase, errorCode },
      },
    );
  }
}

async function recordGenerationReleaseBlock({
  supabase,
  requestId,
  context,
}: {
  supabase: any;
  requestId: string;
  context: GenerationBlockAuditContext;
}) {
  if (!TEMPLATE_RELEASE_BLOCK_CODES.has(context.errorCode) || !context.packetId || !context.organisationId) return;
  const eventType = context.errorCode.startsWith("LEGAL_DOCUMENT_PILOT_")
    ? "legal_document_pilot_blocked"
    : "legal_template_approval_blocked";
  const eventPayload = {
    contract: PHASE4_TEMPLATE_RELEASE_CONTRACT,
    pilotReleaseContract: context.errorCode.startsWith("LEGAL_DOCUMENT_PILOT_")
      ? LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT
      : null,
    errorCode: context.errorCode,
    templateId: context.templateId || null,
    packetType: context.packetType || null,
    blockedAt: new Date().toISOString(),
  };
  console.warn(JSON.stringify({
    level: "warn",
    event: "legal_document_generation_blocked",
    contract: PHASE4_TEMPLATE_RELEASE_CONTRACT,
    requestId,
    packetId: context.packetId,
    packetType: context.packetType || null,
    templateId: context.templateId || null,
    errorCode: context.errorCode,
  }));
  try {
    await supabase.from("document_packet_events").insert({
      packet_id: context.packetId,
      organisation_id: context.organisationId,
      event_type: eventType,
      event_payload_json: eventPayload,
      created_by: null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Blocking generation must not become fail-open when optional audit-event
    // recording is unavailable. The structured non-PII runtime log remains.
  }
}

function sectionContent(section: MandateSection = {}) {
  return String(section.content ?? section.legalText ?? section.legal_text ?? "");
}

async function resolveFrozenNativeRenderInputD2({ supabase, packetId, templateId, generationPayload, requestedSections, requestedPlaceholders }: {
  supabase: any;
  packetId: string;
  templateId?: string;
  generationPayload: JsonRecord;
  requestedSections: MandateSection[];
  requestedPlaceholders: JsonRecord;
}) {
  const freeze = asRecord(generationPayload.editableRenderFreeze);
  const freezeId = normalizeText(freeze.freezeId);
  if (!freezeId) {
    return { sections: requestedSections, placeholders: requestedPlaceholders, attestation: null };
  }
  if (normalizeText(freeze.contract) !== "c4-v1") {
    throw Object.assign(new Error("The editable render freeze contract is unsupported."), { code: "D2_FROZEN_RENDER_INPUT_INVALID", status: 422 });
  }

  const sourceResult = await supabase
    .from("document_packet_versions")
    .select("id, packet_id, version_number, edit_sequence, source_template_revision_id, render_freeze_id, render_freeze_status, render_frozen_at, render_content_fingerprint, editable_content_json, section_manifest_json, placeholders_resolved_json")
    .eq("packet_id", packetId)
    .eq("render_freeze_id", freezeId)
    .maybeSingle();
  if (sourceResult.error) throw sourceResult.error;
  const source = sourceResult.data;
  if (!source || normalizeText(source.render_freeze_status) !== "frozen") {
    throw Object.assign(new Error("The frozen editable revision is unavailable or is no longer renderable."), { code: "D2_FROZEN_RENDER_INPUT_NOT_FOUND", status: 422 });
  }
  if (normalizeText(freeze.sourceVersionId) !== normalizeText(source.id) ||
      normalizeText(freeze.contentFingerprint) !== normalizeText(source.render_content_fingerprint)) {
    throw Object.assign(new Error("The requested render source does not match the database freeze."), { code: "D2_FROZEN_RENDER_SOURCE_MISMATCH", status: 422 });
  }
  if (templateId && normalizeText(source.source_template_revision_id) !== normalizeText(templateId)) {
    throw Object.assign(new Error("The frozen editable revision is not derived from this packet's approved template."), {
      code: "LEGAL_TEMPLATE_SOURCE_MISMATCH",
      status: 422,
    });
  }

  const editableSections = Array.isArray(source.editable_content_json?.sections) ? source.editable_content_json.sections as MandateSection[] : [];
  const frozenManifest = Array.isArray(source.section_manifest_json) ? source.section_manifest_json as MandateSection[] : [];
  if (!editableSections.length || editableSections.length !== frozenManifest.length) {
    throw Object.assign(new Error("The frozen editable revision has an invalid section manifest."), { code: "D2_FROZEN_RENDER_INPUT_INVALID", status: 422 });
  }
  const editableByKey = new Map(editableSections.map((section) => [normalizeText(section.key), section]));
  const sections = frozenManifest.map((section, index) => {
    const key = normalizeText(section.key) || `section_${index + 1}`;
    const editable = editableByKey.get(key);
    if (!editable || sectionContent(editable) !== sectionContent(section)) {
      throw Object.assign(new Error(`Frozen section '${key}' does not match its editable revision.`), { code: "D2_FROZEN_RENDER_INPUT_INVALID", status: 422 });
    }
    return { ...section, key, content: sectionContent(section), legalText: sectionContent(section) };
  });

  return {
    sections,
    placeholders: asRecord(source.placeholders_resolved_json),
    attestation: {
      contract: "d2-v1",
      inputAuthority: "database_frozen_revision",
      freezeId,
      sourceVersionId: normalizeText(source.id),
      sourceVersionNumber: Number(source.version_number || 0) || null,
      editSequence: Number(source.edit_sequence || 0),
      contentFingerprint: normalizeText(source.render_content_fingerprint),
      frozenAt: normalizeText(source.render_frozen_at) || null,
      sectionCount: sections.length,
    },
  };
}

function decodeBase64ToBytes(base64Value: string) {
  const normalized = base64Value.includes(",") ? base64Value.split(",").pop() || "" : base64Value;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function buildPdfConverterUrl() {
  const gotenbergBaseUrl = normalizeText(Deno.env.get("GOTENBERG_URL"));
  if (!gotenbergBaseUrl) return "";
  return `${gotenbergBaseUrl.replace(/\/$/, "")}/forms/chromium/convert/html`;
}

function sanitizePart(value: unknown, fallback: string) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferTemplateFileName(path: string) {
  const normalized = normalizeText(path);
  if (!normalized) return "mandate-template.docx";
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "mandate-template.docx";
}

function inferOutputFileName({ leadId, packetId, packetType, renderMode }: { leadId: string | null; packetId: string; packetType: string; renderMode: string; }) {
  const base = sanitizePart(leadId || packetId || packetType, packetType);
  const extension = renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? "pdf" : "docx";
  return `${base}-${packetType}-${Date.now()}.${extension}`;
}

function safePlaceholderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((entry) => safePlaceholderValue(entry)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createAliasMap(placeholders: Record<string, unknown> = {}) {
  const aliasMap: Record<string, string> = {};

  for (const [key, value] of Object.entries(placeholders || {})) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) continue;
    const safeValue = safePlaceholderValue(value);
    aliasMap[normalizedKey] = safeValue;

    const snake = normalizedKey.replace(/[.\s-]+/g, "_");
    if (!aliasMap[snake]) aliasMap[snake] = safeValue;

    const lastSegment = normalizedKey.includes(".") ? normalizedKey.split(".").slice(-1)[0] : normalizedKey;
    if (lastSegment && !aliasMap[lastSegment]) aliasMap[lastSegment] = safeValue;
  }

  return aliasMap;
}

async function renderHtmlToPdfBytes(html: string, fileName = "mandate.pdf") {
  const converterUrl = buildPdfConverterUrl();
  if (!converterUrl) {
    throw new Error("PDF render converter is not configured. Set GOTENBERG_URL before enabling native mandate rendering.");
  }

  const formData = new FormData();
  formData.append("files", new Blob([html], { type: "text/html" }), "index.html");
  formData.append("paperWidth", "8.27");
  formData.append("paperHeight", "11.69");
  formData.append("marginTop", "0.4");
  formData.append("marginBottom", "0.5");
  formData.append("marginLeft", "0.4");
  formData.append("marginRight", "0.4");
  formData.append("printBackground", "true");

  const response = await fetch(converterUrl, {
    method: "POST",
    body: formData,
    headers: {
      ...(normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_TOKEN"))
        ? { Authorization: `Bearer ${normalizeText(Deno.env.get("DOCX_PDF_CONVERTER_TOKEN"))}` }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`PDF render failed via Gotenberg (${response.status}) for ${fileName}.`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function normalizePdfText(value: unknown) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function replacePlaceholdersForPdf(value: unknown, placeholders: Record<string, string>) {
  return normalizePdfText(value).replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const direct = placeholders[normalizeText(key)];
    const snake = placeholders[normalizeText(key).replace(/[.\s-]+/g, "_")];
    return normalizePdfText(direct || snake || "");
  });
}

function wrapPdfLine(text: string, font: any, fontSize: number, maxWidth: number) {
  const words = normalizePdfText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function getPdfPlaceholder(placeholders: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const normalizedKey = normalizeText(key);
    const variants = [
      normalizedKey,
      normalizedKey.replace(/[.\s-]+/g, "_"),
      normalizedKey.replace(/[_\s-]+/g, "."),
    ];
    for (const variant of variants) {
      const value = normalizePdfText(placeholders[variant]);
      if (value) return value;
    }
  }
  return "";
}

function firstPdfValue(...values: unknown[]) {
  return values.map((value) => normalizePdfText(value)).find(Boolean) || "";
}

function isMissingPdfValue(value: string) {
  const normalized = normalizePdfText(value).trim().toLowerCase().replace(/[\s._-]+/g, "_");
  return !normalized || ["missing", "na", "n_a", "n/a", "none", "unknown", "tbc", "not_applicable", "not_provided", "no_spouse"].includes(normalized);
}

function sectionMatchesMandateRoute(section: MandateSection, placeholders: Record<string, string>) {
  const labelKey = normalizeText(`${section?.key || ""} ${section?.label || ""}`).toLowerCase();
  const sellerType = getPdfPlaceholder(
    placeholders,
    "seller_entity_type",
    "seller.entity_type",
    "seller_type",
    "seller.capacity",
    "entity_type",
  ).toLowerCase();
  const propertyType = getPdfPlaceholder(
    placeholders,
    "property_type",
    "property.property_type",
    "title_type",
    "property_title_type",
    "mandate_property_route",
    "legal_route",
  ).toLowerCase();
  const maritalStatus = getPdfPlaceholder(
    placeholders,
    "seller_marital_status",
    "seller.marital_status",
    "seller_marital_regime",
    "seller.marital_regime",
  ).toLowerCase();
  const spouseSignal = firstPdfValue(
    getPdfPlaceholder(placeholders, "seller_spouse_name", "spouse_name", "seller.spouse_name"),
    getPdfPlaceholder(placeholders, "seller_spouse_email", "spouse_email", "seller.spouse_email"),
    getPdfPlaceholder(placeholders, "spouse_id_number", "seller_spouse_id_number"),
  );
  const isCompany = /\b(company|close corporation|cc|pty|proprietary)\b/.test(sellerType);
  const isTrust = /\btrust\b/.test(sellerType);
  const isSectional = /\b(sectional|section|scheme|unit)\b/.test(propertyType);
  const isFullTitle = /\b(full[-\s]?title|freehold|house|erf)\b/.test(propertyType) || (!isSectional && propertyType);
  const needsSpouse = !isMissingPdfValue(spouseSignal) || /\b(married|community|accrual|anc|cop)\b/.test(maritalStatus);

  if (labelKey.includes("company") || labelKey.includes("close corporation")) return isCompany;
  if (labelKey.includes("trust authority") || labelKey.includes("seller trust")) return isTrust;
  if (labelKey.includes("individual") && (isCompany || isTrust)) return false;
  if (labelKey.includes("spouse consent") || labelKey.includes("seller spouse")) return needsSpouse;
  if (labelKey.includes("sectional title")) return isSectional;
  if (labelKey.includes("full title")) return isFullTitle || !isSectional;
  return true;
}

async function embedPdfLogo(pdf: any, logoUrl: string) {
  const url = normalizeText(logoUrl);
  if (!/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = normalizeText(response.headers.get("content-type")).toLowerCase();
    if (contentType.includes("png") || /\.png($|\?)/i.test(url)) return await pdf.embedPng(bytes);
    if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.jpe?g($|\?)/i.test(url)) return await pdf.embedJpg(bytes);
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

async function renderStructuredSectionsToPdfBytes({
  sectionManifest,
  placeholders,
  title,
  packetType,
  branding,
  packetId,
}: {
  sectionManifest: MandateSection[];
  placeholders: Record<string, string>;
  title: string;
  packetType: string;
  branding?: Record<string, unknown>;
  packetId?: string;
}): Promise<StructuredPdfRenderResult> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const maxWidth = pageWidth - margin * 2;
  const headerTop = pageHeight - 38;
  const contentTop = pageHeight - 164;
  const footerY = 34;
  const headingSize = 13;
  const bodySize = 9.6;
  const lineHeight = 13.2;
  const dark = rgb(0.07, 0.11, 0.18);
  const muted = rgb(0.35, 0.43, 0.54);
  const lineColor = rgb(0.82, 0.86, 0.91);
  const fillSoft = rgb(0.97, 0.98, 1);
  const orgName = firstPdfValue(
    branding?.organisationName,
    branding?.organisation_name,
    branding?.agencyName,
    branding?.agency_name,
    getPdfPlaceholder(placeholders, "organisation_name", "agency_name", "organisation.name"),
    "Organisation",
  );
  const logoUrl = firstPdfValue(
    branding?.logoLightUrl,
    branding?.organisationLogoUrl,
    branding?.logoUrl,
    branding?.logo_light_url,
    branding?.organisation_logo_url,
    branding?.logo_url,
    getPdfPlaceholder(placeholders, "organisation_logo_url", "agency_logo_url", "organisation.logo_url"),
  );
  const logoImage = await embedPdfLogo(pdf, logoUrl);
  const documentReference = getPdfPlaceholder(placeholders, "document_reference", "packet_reference", "transaction_reference", "packet_id") || packetId || title;
  const normalizedPacketType = normalizeText(packetType).toLowerCase();
  const safeTitle = normalizedPacketType === "mandate"
    ? "Mandate Agreement"
    : normalizedPacketType === "otp"
      ? "Offer to Purchase"
      : normalizePdfText(title || "Document");
  const agencyDetailLines = [
    orgName,
    firstPdfValue(branding?.registrationNumber, branding?.registration_number, branding?.companyRegistrationNumber, branding?.company_registration_number, getPdfPlaceholder(placeholders, "agency_registration_number", "organisation_registration_number", "organisation.registration_number")),
    firstPdfValue(branding?.vatNumber, branding?.vat_number, branding?.organisationVatNumber, branding?.organisation_vat_number, getPdfPlaceholder(placeholders, "agency_vat_number", "organisation_vat_number", "organisation.vat_number")),
    firstPdfValue(branding?.fspNumber, branding?.fsp_number, branding?.organisationFspNumber, branding?.organisation_fsp_number, getPdfPlaceholder(placeholders, "agency_fsp_number", "organisation_fsp_number", "organisation.fsp_number")),
    firstPdfValue(branding?.physicalAddress, branding?.physical_address, branding?.organisationPhysicalAddress, branding?.organisation_physical_address, branding?.address, getPdfPlaceholder(placeholders, "agency_address", "organisation_physical_address", "organisation.physical_address")),
    firstPdfValue(branding?.email, branding?.organisationEmail, branding?.organisation_email, branding?.contactEmail, getPdfPlaceholder(placeholders, "agency_email", "organisation_email", "organisation.email")),
    firstPdfValue(branding?.telephone, branding?.phoneNumber, branding?.phone_number, branding?.phone, branding?.organisationPhone, branding?.organisation_phone, getPdfPlaceholder(placeholders, "agency_phone", "organisation_phone", "organisation.phone")),
    firstPdfValue(branding?.website, branding?.organisationWebsite, branding?.organisation_website, getPdfPlaceholder(placeholders, "agency_website", "organisation_website", "organisation.website")),
  ]
    .map((value, index) => {
      const text = normalizePdfText(value);
      if (!text) return "";
      if (index === 1) return `Reg: ${text}`;
      if (index === 2) return `VAT: ${text}`;
      if (index === 3) return `FSP: ${text}`;
      return text;
    })
    .filter(Boolean)
    .slice(0, 7);
  const agencyEmail = firstPdfValue(
    branding?.email,
    branding?.organisationEmail,
    branding?.organisation_email,
    branding?.contactEmail,
    getPdfPlaceholder(placeholders, "agency_email", "organisation_email", "organisation.email"),
  );
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = contentTop;
  const plannedSigningFields: PlannedSigningField[] = [];

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = contentTop;
    drawChrome(page);
  };
  const ensureSpace = (height: number) => {
    if (y - height < 84) addPage();
  };
  const drawCentered = (targetPage: any, text: string, targetY: number, font: any, size: number, color: any = dark) => {
    const safeText = normalizePdfText(text);
    targetPage.drawText(safeText, {
      x: Math.max(margin, (pageWidth - font.widthOfTextAtSize(safeText, size)) / 2),
      y: targetY,
      size,
      font,
      color,
    });
  };
  const drawChrome = (targetPage: any) => {
    const logoMaxWidth = 150;
    const logoMaxHeight = 42;
    if (logoImage) {
      const logoSize = logoImage.scale(1);
      const logoScale = Math.min(logoMaxWidth / logoSize.width, logoMaxHeight / logoSize.height, 1);
      const logoWidth = logoSize.width * logoScale;
      const logoHeight = logoSize.height * logoScale;
      targetPage.drawImage(logoImage, {
        x: margin,
        y: headerTop - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    } else {
      const fallbackLines = wrapPdfLine(orgName, bold, 13, logoMaxWidth).slice(0, 2);
      fallbackLines.forEach((line, index) => {
        targetPage.drawText(line, { x: margin, y: headerTop - 12 - index * 13, size: 13, font: bold, color: dark });
      });
    }
    let detailY = headerTop - 2;
    for (const [index, rawLine] of agencyDetailLines.entries()) {
      const font = index === 0 ? bold : regular;
      const size = index === 0 ? 8.5 : 7.2;
      const lines = wrapPdfLine(rawLine, font, size, 176).slice(0, index === 0 ? 2 : 1);
      for (const line of lines) {
        const lineWidth = font.widthOfTextAtSize(line, size);
        targetPage.drawText(line, {
          x: pageWidth - margin - lineWidth,
          y: detailY,
          size,
          font,
          color: index === 0 ? dark : muted,
        });
        detailY -= index === 0 ? 10 : 8;
      }
    }
    drawCentered(targetPage, safeTitle.toUpperCase(), pageHeight - 108, bold, 17, dark);
    drawCentered(targetPage, documentReference, pageHeight - 127, regular, 8.5, muted);
    targetPage.drawLine({ start: { x: margin, y: pageHeight - 140 }, end: { x: pageWidth - margin, y: pageHeight - 140 }, thickness: 0.6, color: lineColor });
    targetPage.drawLine({ start: { x: margin, y: 58 }, end: { x: pageWidth - margin, y: 58 }, thickness: 0.6, color: lineColor });
  };
  const drawFooter = (targetPage: any, index: number, total: number) => {
    const footerLeft = orgName.length > 34 ? `${orgName.slice(0, 31)}...` : orgName;
    targetPage.drawText(footerLeft, { x: margin, y: footerY, size: 7.5, font: bold, color: muted });
    drawCentered(targetPage, `Page ${index + 1} of ${total}`, footerY, regular, 7.5, muted);
    const footerRightSource = normalizePdfText(agencyEmail) || documentReference;
    const footerRight = footerRightSource.length > 40 ? `${footerRightSource.slice(0, 37)}...` : footerRightSource;
    targetPage.drawText(footerRight, { x: pageWidth - margin - regular.widthOfTextAtSize(footerRight, 7.5), y: footerY, size: 7.5, font: regular, color: muted });
  };
  drawChrome(page);

  const drawLine = (line: string, options: { font?: any; size?: number; color?: any; indent?: number } = {}) => {
    const size = options.size || bodySize;
    ensureSpace(size + 6);
    page.drawText(normalizePdfText(line), {
      x: margin + (options.indent || 0),
      y,
      size,
      font: options.font || regular,
      color: options.color || dark,
    });
    y -= lineHeight;
  };
  const drawWrapped = (text: string, options: { font?: any; size?: number; indent?: number } = {}) => {
    const size = options.size || bodySize;
    const font = options.font || regular;
    const indent = options.indent || 0;
    for (const paragraph of normalizePdfText(text).split(/\n{2,}/)) {
      const lines = normalizePdfText(paragraph).split(/\n/);
      for (const line of lines) {
        for (const wrapped of wrapPdfLine(line, font, size, maxWidth - indent)) {
          drawLine(wrapped, { ...options, font, size, indent });
        }
      }
      y -= 8;
    }
  };
  const drawDetailPanel = () => {
    const panelTop = y;
    const panelHeight = 98;
    const columnWidth = (maxWidth - 16) / 2;
    const leftX = margin + 12;
    const rightX = margin + 12 + columnWidth + 16;
    page.drawRectangle({ x: margin, y: panelTop - panelHeight, width: maxWidth, height: panelHeight, color: fillSoft, borderColor: lineColor, borderWidth: 0.8 });
    const details = [
      ["Seller", getPdfPlaceholder(placeholders, "seller_display_name", "seller_name", "seller.full_name")],
      ["Property", getPdfPlaceholder(placeholders, "property_address", "property.display_address", "property_address_line")],
      ["Agency", getPdfPlaceholder(placeholders, "agency_name", "organisation_name", "organisation.name")],
      ["Agent", getPdfPlaceholder(placeholders, "agent_name", "agent.full_name", "signing_agent_name")],
      ["Mandate Type", getPdfPlaceholder(placeholders, "mandate_type", "mandate.mandate_type")],
      ["Mandate Dates", [
        getPdfPlaceholder(placeholders, "mandate_start_date", "start_date"),
        getPdfPlaceholder(placeholders, "mandate_end_date", "end_date"),
      ].filter(Boolean).join(" to ")],
    ];
    details.forEach(([label, value], index) => {
      const colX = index % 2 === 0 ? leftX : rightX;
      const rowY = panelTop - 22 - Math.floor(index / 2) * 29;
      page.drawText(label, { x: colX, y: rowY, size: 7.5, font: bold, color: muted });
      const resolved = normalizePdfText(value) || "-";
      const lines = wrapPdfLine(resolved, regular, 9.2, columnWidth - 8).slice(0, 2);
      lines.forEach((line, lineIndex) => {
        page.drawText(line, { x: colX, y: rowY - 13 - lineIndex * 11, size: 9.2, font: regular, color: dark });
      });
    });
    y -= panelHeight + 32;
  };

  const drawSignaturePanel = (targetPage: any, options: { title: string; name: string; role: string; panelTop: number; x: number; signerRole: string }) => {
    const panelWidth = 222;
    const panelHeight = 132;
    const panelY = pageHeight - options.panelTop - panelHeight;
    const fieldTop = options.panelTop + 40;
    targetPage.drawRectangle({ x: options.x, y: panelY, width: panelWidth, height: panelHeight, color: rgb(1, 1, 1), borderColor: lineColor, borderWidth: 0.9 });
    targetPage.drawText(options.title, { x: options.x + 12, y: panelY + panelHeight - 22, size: 9.5, font: bold, color: dark });
    targetPage.drawRectangle({ x: options.x + 12, y: pageHeight - fieldTop - 52, width: 198, height: 52, borderColor: rgb(0.55, 0.62, 0.72), borderWidth: 0.8 });
    targetPage.drawText("Signature", { x: options.x + 12, y: panelY + 39, size: 7.5, font: regular, color: muted });
    targetPage.drawText(normalizePdfText(options.name) || options.role, { x: options.x + 12, y: panelY + 23, size: 8.5, font: bold, color: dark });
    plannedSigningFields.push({
      signerRole: options.signerRole,
      fieldType: "signature",
      pageNumber: pdf.getPageCount(),
      xPosition: options.x + 12,
      yPosition: fieldTop,
      width: 198,
      height: 52,
      required: true,
      label: `${options.title} signature`,
    });
  };

  drawDetailPanel();

  const visibleSections = (sectionManifest || []).filter((section) => {
    return normalizedPacketType !== "mandate" || sectionMatchesMandateRoute(section, placeholders);
  });
  for (const [index, section] of visibleSections.entries()) {
    const label = normalizeText(section?.label || section?.key) || `Section ${index + 1}`;
    const content = replacePlaceholdersForPdf(section?.content || section?.legalText || section?.legal_text, placeholders);
    if (!content.trim()) continue;
    ensureSpace(headingSize + lineHeight * 2);
    drawWrapped(label.toUpperCase(), { font: bold, size: headingSize });
    drawWrapped(content, { font: regular, size: bodySize });
    y -= 14;
  }

  if (normalizedPacketType === "mandate") {
    addPage();
    drawCentered(page, "SIGNATURES", pageHeight - 188, bold, 15, dark);
    drawCentered(page, "The parties sign this mandate using the reserved execution blocks below.", pageHeight - 209, regular, 9.5, muted);
    const agentName = getPdfPlaceholder(placeholders, "agent_name", "agent.full_name", "signing_agent_name") || "Agent";
    const sellerName = getPdfPlaceholder(placeholders, "seller_display_name", "seller_name", "seller.full_name") || "Seller";
    drawSignaturePanel(page, { title: "Agent signer", name: agentName, role: "Agent", panelTop: 255, x: margin, signerRole: "agent" });
    drawSignaturePanel(page, { title: "Seller signer", name: sellerName, role: "Seller", panelTop: 255, x: pageWidth - margin - 222, signerRole: "seller" });
    const spouseName = firstPdfValue(
      getPdfPlaceholder(placeholders, "seller_spouse_name", "spouse_name", "seller.spouse_name"),
      getPdfPlaceholder(placeholders, "purchaser_2_name"),
    );
    if (!isMissingPdfValue(spouseName)) {
      drawSignaturePanel(page, { title: "Seller spouse signer", name: spouseName, role: "Seller spouse", panelTop: 412, x: margin, signerRole: "purchaser_2" });
    }
  }

  const pages = pdf.getPages();
  pages.forEach((targetPage: any, index: number) => {
    drawFooter(targetPage, index, pages.length);
  });

  return {
    bytes: new Uint8Array(await pdf.save()),
    pageCount: pages.length,
    plannedSigningFields,
    layoutContract: "arch9-mandate-branded-signature-layout-v1",
  };
}

function assertValidPdfBytes(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  const trailer = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  if (bytes.length < 100 || header !== "%PDF-" || !trailer.includes("%%EOF")) {
    throw Object.assign(new Error("The PDF converter returned an invalid PDF artifact."), { code: "D2_PDF_ARTIFACT_INVALID", status: 502 });
  }
}

function buildSectionSummary(sectionManifest: MandateSection[] = []) {
  if (!Array.isArray(sectionManifest) || !sectionManifest.length) return "";
  return sectionManifest
    .map((section, index) => {
      const label = normalizeText(section?.label || section?.key) || `Section ${index + 1}`;
      const requirement = section?.required ? "required" : "optional";
      return `${index + 1}. ${label} (${requirement})`;
    })
    .join("\n");
}

async function downloadTemplateBytes({
  supabase,
  templateBase64,
  templateBucket,
  templatePath,
  bucketCandidates,
}: {
  supabase: ReturnType<typeof createClient>;
  templateBase64: string;
  templateBucket: string;
  templatePath: string;
  bucketCandidates: string[];
}) {
  if (templateBase64) {
    return decodeBase64ToBytes(templateBase64);
  }

  const path = normalizeText(templatePath);
  if (!path) {
    throw new Error("Mandate template source missing. Provide templatePath/template_bucket or templateBase64.");
  }

  const candidates = templateBucket ? [templateBucket, ...bucketCandidates] : bucketCandidates;
  let lastError: unknown = null;

  for (const bucket of [...new Set(candidates.filter(Boolean))]) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (!error && data) {
      const bytes = new Uint8Array(await data.arrayBuffer());
      return bytes;
    }
    lastError = error;
  }

  throw new Error(`Unable to download mandate template '${path}'. ${lastError ? JSON.stringify(lastError) : ""}`.trim());
}

async function insertMandateDocumentRecord({
  supabase,
  transactionId,
  fileName,
  filePath,
  packetId,
  generatedByRole,
  generatedByUserId,
  clientVisible,
  internalOnly = false,
  packetType,
}: {
  supabase: ReturnType<typeof createClient>;
  transactionId: string | null;
  fileName: string;
  filePath: string;
  packetId: string;
  generatedByRole: string;
  generatedByUserId: string | null;
  clientVisible: boolean;
  internalOnly?: boolean;
  packetType: string;
}) {
  const now = new Date().toISOString();
  // Legal drafts are never a client-facing artifact. Only the F2/F3 workflow
  // may publish the exact final signed PDF; do not trust a renderer request
  // to broaden draft visibility.
  const documentClientVisible = internalOnly ? false : clientVisible;

  const insertPayload: Record<string, unknown> = {
    transaction_id: transactionId || null,
    // The initial generated-document row is the first durable legal artifact.
    // Bind governed packets here so the Phase 4 write-time release fence can
    // serialize C3 against this insert rather than relying on pre-render state.
    legal_packet_id: ["otp", "mandate"].includes(normalizeText(packetType).toLowerCase()) ? packetId : null,
    name: fileName,
    file_path: filePath,
    category: packetType === "otp" ? "sales_documents" : "mandate_documents",
    document_type: packetType === "otp" ? "otp_draft" : "mandate_draft",
    visibility_scope: documentClientVisible ? "shared" : "internal",
    is_client_visible: documentClientVisible,
    uploaded_by_role: generatedByRole || null,
    uploaded_by_user_id: generatedByUserId,
    stage_key: packetType === "otp" ? "offer_to_purchase" : "seller_mandate",
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("documents")
    .insert(insertPayload)
    .select("id, transaction_id, name, file_path, category, document_type, is_client_visible, created_at")
    .single();

  if (error) throw error;

  return {
    sourceTable: "documents",
    record: {
      ...data,
      packet_id: packetId,
    },
  };
}

function asJsonObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

async function createAndSealCanonicalOtpVersion({
  supabase,
  packet,
  freezeId,
  documentId,
  output,
  placeholders,
  sectionManifest,
  generationAttemptId,
  renderAttestation,
  generatedBy,
}: {
  supabase: any;
  packet: JsonRecord;
  freezeId: string;
  documentId: string;
  output: { bucket: string; filePath: string; fileName: string; mediaType: string; byteLength: number; sha256: string };
  placeholders: JsonRecord;
  sectionManifest: MandateSection[];
  generationAttemptId: string;
  renderAttestation: JsonRecord;
  generatedBy: string | null;
}) {
  const packetId = normalizeText(packet.id);
  const sourceVersionId = normalizeText(renderAttestation.sourceVersionId);
  const contentFingerprint = normalizeText(renderAttestation.contentFingerprint);
  if (!packetId || !freezeId || !documentId || !sourceVersionId || !contentFingerprint) {
    throw Object.assign(new Error("Canonical OTP render evidence is incomplete."), {
      code: "OTP_CANONICAL_RENDER_EVIDENCE_INVALID",
      status: 422,
    });
  }

  const artifactProvenance = {
    bucket: output.bucket,
    path: output.filePath,
    fileName: output.fileName,
    mediaType: output.mediaType,
    byteLength: output.byteLength,
    sha256: output.sha256,
  };
  const validationSummary = {
    generationStatus: "generated",
    previewOnly: false,
    generationAttemptId,
    canonicalOtpPdf: true,
    canonicalOtpContract: "phase2-canonical-otp-pdf-v1",
    render_provenance: {
      packetType: "otp",
      renderMode: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED,
      rendererVersion: NATIVE_RENDERER_VERSION,
      generationAttemptId,
      frozenInputContract: "d1-v1",
      editableRenderFreezeId: freezeId,
      editableSourceVersionId: sourceVersionId,
      editableSourceFingerprint: contentFingerprint,
    },
    artifact_provenance: artifactProvenance,
    native_render_attestation: renderAttestation,
  };

  // I1 and the certification chain must be one database transaction.  If a
  // verification step fails, the generated version and packet pointer roll
  // back together, leaving the frozen editable source safe to retry.
  const sealResult = await supabase.rpc("bridge_create_and_seal_canonical_otp_pdf_phase2", {
    p_packet_id: packetId,
    p_freeze_id: freezeId,
    p_rendered_document_id: documentId,
    p_rendered_file_path: output.filePath,
    p_rendered_file_name: output.fileName,
    p_rendered_file_url: null,
    p_placeholders_resolved_json: placeholders,
    p_placeholders_missing_json: [],
    p_section_manifest_json: sectionManifest,
    p_validation_summary_json: validationSummary,
    p_generated_by: generatedBy,
    p_generated_at: new Date().toISOString(),
  });
  let seal = sealResult.data;
  let recoveredVersion: JsonRecord | null = null;
  if (sealResult.error || sealResult.data?.sealed !== true) {
    // A transport failure can occur after PostgreSQL commits the atomic RPC.
    // Resolve the exact artifact before declaring a failed seal; otherwise a
    // valid current version could be displaced by a browser failure record.
    const recoveryResult = await supabase
      .from("document_packet_versions")
      .select("id, packet_id, version_number, rendered_document_id, rendered_file_bucket, rendered_file_path, rendered_sha256, render_input_verified, native_pdf_verified, transaction_pdf_persisted, render_source_version_id, render_source_fingerprint")
      .eq("packet_id", packetId)
      .eq("rendered_document_id", documentId)
      .eq("rendered_file_path", output.filePath)
      .eq("render_input_verified", true)
      .eq("native_pdf_verified", true)
      .eq("transaction_pdf_persisted", true)
      .maybeSingle();
    if (recoveryResult.error) {
      throw Object.assign(new Error("The OTP PDF seal response could not be reconciled. Refresh the packet before retrying."), {
        code: "OTP_CANONICAL_PDF_RECONCILIATION_REQUIRED",
        status: 409,
        details: recoveryResult.error.message,
      });
    }
    const candidate = asJsonObject(recoveryResult.data);
    if (
      candidate.id &&
      normalizeText(candidate.rendered_file_bucket) === output.bucket &&
      normalizeText(candidate.rendered_sha256).toLowerCase() === output.sha256.toLowerCase() &&
      normalizeText(candidate.render_source_version_id) === sourceVersionId &&
      normalizeText(candidate.render_source_fingerprint) === contentFingerprint
    ) {
      recoveredVersion = candidate;
      seal = {
        contract: "phase2-canonical-otp-pdf-v1",
        sealed: true,
        recoveredAfterResponseLoss: true,
      };
    } else if (!normalizeText(sealResult.error?.code)) {
      throw Object.assign(new Error("The OTP PDF seal response is ambiguous. Refresh the packet before retrying."), {
        code: "OTP_CANONICAL_PDF_RECONCILIATION_REQUIRED",
        status: 409,
        details: sealResult.error?.message || null,
      });
    } else {
      throw Object.assign(new Error("The generated OTP PDF could not be certified and persisted."), {
        code: "OTP_CANONICAL_PDF_SEAL_FAILED",
        status: 409,
        details: sealResult.error?.message || sealResult.data || null,
      });
    }
  }
  const createdVersion = recoveredVersion || asJsonObject(sealResult.data?.version);
  const generatedVersionId = normalizeText(createdVersion.id);
  if (!generatedVersionId) {
    throw Object.assign(new Error("The canonical OTP version was not created."), {
      code: "OTP_CANONICAL_VERSION_CREATE_FAILED",
      status: 500,
    });
  }

  const [packetResult, finalVersionResult] = await Promise.all([
    supabase
      .from("document_packets")
      .update({ status: "generated", updated_at: new Date().toISOString() })
      .eq("id", packetId)
      .select("id, organisation_id, packet_type, transaction_id, status, current_version_number, title, source_context_json")
      .single(),
    supabase
      .from("document_packet_versions")
      .select("id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_bucket, rendered_file_path, rendered_file_name, rendered_media_type, rendered_byte_length, rendered_sha256, render_input_verified, native_pdf_verified, transaction_pdf_persisted, validation_summary_json, render_source_version_id, render_source_fingerprint")
      .eq("id", generatedVersionId)
      .eq("packet_id", packetId)
      .single(),
  ]);
  if (packetResult.error || finalVersionResult.error) {
    // The database seal has already committed at this point. A read failure
    // must be reconciled from the canonical packet rather than converted into
    // a browser-owned failed version that could displace a valid sealed PDF.
    throw Object.assign(new Error("The OTP PDF was sealed, but its final record could not be confirmed. Refresh the packet before retrying."), {
      code: "OTP_CANONICAL_PDF_RECONCILIATION_REQUIRED",
      status: 409,
      details: packetResult.error?.message || finalVersionResult.error?.message || null,
    });
  }
  const version = asJsonObject(finalVersionResult.data);
  if (
    !version.render_input_verified ||
    !version.native_pdf_verified ||
    !version.transaction_pdf_persisted ||
    normalizeText(version.rendered_document_id) !== documentId ||
    normalizeText(version.rendered_file_bucket) !== output.bucket ||
    normalizeText(version.rendered_file_path) !== output.filePath ||
    normalizeText(version.rendered_sha256).toLowerCase() !== output.sha256.toLowerCase()
  ) {
    throw Object.assign(new Error("The OTP PDF seal needs reconciliation before it can be used for signing."), {
      code: "OTP_CANONICAL_PDF_RECONCILIATION_REQUIRED",
      status: 409,
    });
  }

  return {
    packet: packetResult.data,
    version: finalVersionResult.data,
    seal: recoveredVersion ? seal : sealResult.data?.seal || sealResult.data,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  const startedAt = Date.now();
  const requestId = normalizeText(req.headers.get("x-request-id")) || crypto.randomUUID();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const payload = (await req.json()) as GenerateMandateRequest;
    const capacityProbe = Boolean(payload.capacityProbe || payload.capacity_probe);
    const bearer = normalizeText(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    if (capacityProbe && bearer !== SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(403, { success: false, error: "Service-role renderer capacity authority is required.", errorCode: "RENDER_CAPACITY_FORBIDDEN" });
    }
    const packetId = normalizeText(payload.packetId || payload.packet_id);
    if (!packetId) {
      return jsonResponse(400, { success: false, error: "packetId is required." });
    }

    let renderMode = normalizeText(payload.renderMode || payload.render_mode) || TEMPLATE_RENDER_MODES.LEGACY_DOCX;
    const templatePath = normalizeText(payload.templatePath || payload.template_path || Deno.env.get("MANDATE_TEMPLATE_PATH"));
    const templateBucket = normalizeText(payload.templateBucket || payload.template_bucket || Deno.env.get("MANDATE_TEMPLATE_BUCKET"));
    const templateBase64 = normalizeText(payload.templateBase64 || payload.template_base64);
    const templateFilename = normalizeText(payload.templateFilename || payload.template_filename || inferTemplateFileName(templatePath));
    const outputBucket = normalizeText(payload.outputBucket || payload.output_bucket || Deno.env.get("MANDATE_OUTPUT_BUCKET"));
    const requestedOutputPath = normalizeText(payload.outputPath || payload.output_path);
    const clientVisible = Boolean(payload.clientVisible ?? payload.client_visible ?? false);
    const transactionId = normalizeText(payload.transactionId || payload.transaction_id) || null;
    const leadId = normalizeText(payload.leadId || payload.lead_id) || null;
    let sectionManifest = (payload.sectionManifest || payload.section_manifest || []) as MandateSection[];
    let rawPlaceholders = payload.placeholders && typeof payload.placeholders === "object" ? payload.placeholders : {};
    const branding = payload.branding && typeof payload.branding === "object" ? payload.branding : {};
    const generationPayload = payload.generationPayload && typeof payload.generationPayload === "object"
      ? payload.generationPayload
      : payload.generation_payload && typeof payload.generation_payload === "object"
        ? payload.generation_payload
        : {};
    const generationAttemptId = normalizeText((generationPayload as Record<string, unknown>).generationAttemptId);
    const sourceContext = payload.sourceContext && typeof payload.sourceContext === "object"
      ? payload.sourceContext
      : payload.source_context && typeof payload.source_context === "object"
        ? payload.source_context
        : {};

    const bucketCandidates = parseBucketCandidates(
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_STORAGE_BUCKET"),
      "documents",
    );
    let outputBucketName = outputBucket || bucketCandidates[0] || "documents";
    const appBaseUrl = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || Deno.env.get("VITE_SITE_URL"));

    const supabase: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const requestedTemplateId = normalizeText((generationPayload as Record<string, unknown>)?.template && ((generationPayload as Record<string, unknown>).template as Record<string, unknown>)?.id);
    const caller = capacityProbe
      ? { id: null, service: true }
      : bearer === SUPABASE_SERVICE_ROLE_KEY
        ? { id: null, service: true }
        : { ...requireCaller(req), service: false };
    let approval: { templateId: string; packetType: string; packet: JsonRecord; isPhase4LegalPacket: boolean };
    let pilotReleaseDecision: { planDigest?: string | null } | null = null;
    try {
      approval = await requireApprovedMandateTemplate({
        supabase,
        packetId,
        requestedTemplateId,
        templatePath,
        templateBucket,
        templateBase64,
        renderMode,
        caller,
        // Capacity probes are service-only, non-persisting renderer checks.
        // They intentionally retain their pre-release-gate behaviour so they
        // can measure renderer capacity without opening real generation.
        enforceReleaseGate: !capacityProbe,
      });
      if (!capacityProbe && approval.isPhase4LegalPacket) {
        pilotReleaseDecision = assertDocumentPilotAllowed(approval.packet, normalizeText(approval.templateId));
      }
    } catch (error) {
      const typed = error as { auditContext?: GenerationBlockAuditContext };
      if (!capacityProbe && typed.auditContext) {
        await recordGenerationReleaseBlock({ supabase, requestId, context: typed.auditContext });
      }
      throw error;
    }
    const packetType = approval.packetType === "otp" ? "otp" : "mandate";
    const packetTransactionId = normalizeText(approval.packet.transaction_id);
    // A browser may describe the context of a render, but it cannot choose a
    // legal packet's transaction, attribution, or visibility. Those values
    // are bound to the authorised packet/caller before the first write.
    if (
      approval.isPhase4LegalPacket
      && packetTransactionId
      && transactionId
      && packetTransactionId !== transactionId
    ) {
      return jsonResponse(409, {
        success: false,
        error: "Legal document generation must be bound to the packet's persisted transaction.",
        errorCode: "PACKET_TRANSACTION_BINDING_REQUIRED",
      });
    }
    const persistedTransactionId = approval.isPhase4LegalPacket
      ? packetTransactionId || null
      : transactionId;
    const persistedGeneratedByUserId = caller.service
      ? null
      : normalizeText(caller.id) || null;
    const persistedGeneratedByRole = caller.service ? "system" : "authenticated_user";
    if (packetType === "otp") {
      if (renderMode !== TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
        return jsonResponse(409, {
          success: false,
          error: "OTP generation requires the canonical native PDF renderer.",
          errorCode: "OTP_CANONICAL_RENDERER_REQUIRED",
          requiredAction: "CREATE_OR_REISSUE_CANONICAL_OTP_PDF",
        });
      }
      if (!packetTransactionId || !transactionId || packetTransactionId !== transactionId) {
        return jsonResponse(409, {
          success: false,
          error: "OTP generation must be bound to the packet's persisted transaction.",
          errorCode: "OTP_TRANSACTION_BINDING_REQUIRED",
        });
      }
      // A signable OTP is always stored in the packet-controlled documents bucket.
      outputBucketName = bucketCandidates[0] || "documents";
    }
    const preRenderFence = capacityProbe ? null : await assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_render");
    const frozenInput = renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
      ? await resolveFrozenNativeRenderInputD2({
          supabase,
          packetId,
          templateId: approval.isPhase4LegalPacket ? approval.templateId : "",
          generationPayload: generationPayload as JsonRecord,
          requestedSections: sectionManifest,
          requestedPlaceholders: rawPlaceholders as JsonRecord,
        })
      : { sections: sectionManifest, placeholders: rawPlaceholders as JsonRecord, attestation: null };
    if (packetType === "otp" && !frozenInput.attestation) {
      return jsonResponse(409, {
        success: false,
        error: "OTP generation requires a frozen editable revision from the canonical packet.",
        errorCode: "OTP_EDITABLE_RENDER_FREEZE_REQUIRED",
        requiredAction: "SAVE_AND_FREEZE_CURRENT_OTP_REVISION",
      });
    }
    sectionManifest = frozenInput.sections;
    rawPlaceholders = frozenInput.placeholders;
    const placeholderMap = createAliasMap(rawPlaceholders);
    const sectionSummary = buildSectionSummary(sectionManifest);
    if (!placeholderMap.packet_sections_summary) placeholderMap.packet_sections_summary = sectionSummary;
    if (!placeholderMap.packet_id) placeholderMap.packet_id = packetId;
    if (!placeholderMap.generated_date) placeholderMap.generated_date = new Date().toISOString().slice(0, 10);
    console.log(JSON.stringify({ level: "info", event: "legal_document_generation_started", requestId, packetType, templateId: approval.templateId, packetId, userId: caller.id }));
    let outputBytes: Uint8Array;
    let generatedFileName = inferOutputFileName({ leadId, packetId, packetType, renderMode });
    let filePath = `packet-${packetId}/${packetType}-documents/${generatedFileName}`;
    let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let nativeRender: any = null;
    let nativePdfLayout: JsonRecord | null = null;

    if (renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
      const generationTemplate = ((generationPayload as Record<string, unknown>).template || {}) as Record<string, unknown>;
      nativeRender = (renderStructuredTemplate as any)({
        packetType,
        template: {
          packet_type: packetType,
          render_mode: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED,
          template_label: normalizeText(generationTemplate.label || (packetType === "otp" ? "Offer to Purchase" : "Mandate Agreement")),
          metadata_json: {
            render_mode: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED,
          },
          sections: sectionManifest,
        },
        sections: sectionManifest,
        placeholders: placeholderMap,
        branding,
        mode: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED,
        assetBaseUrl: appBaseUrl,
      });

      if (!nativeRender.renderable) {
        return jsonResponse(400, {
          success: false,
          error: "Native structured template is not renderable yet.",
          errorCode: "NATIVE_TEMPLATE_NOT_RENDERABLE",
          blockingIssues: nativeRender.blockingIssues || [],
          warnings: nativeRender.warnings || [],
        });
      }

      try {
        if (buildPdfConverterUrl()) {
          outputBytes = await renderHtmlToPdfBytes(nativeRender.html, generatedFileName.replace(/\.docx$/i, ".pdf"));
        } else {
          const nativePdf = await renderStructuredSectionsToPdfBytes({
              sectionManifest,
              placeholders: placeholderMap,
              title: normalizeText(generationTemplate.label || (packetType === "otp" ? "Offer to Purchase" : "Mandate Agreement")),
              packetType,
              branding,
              packetId,
            });
          outputBytes = nativePdf.bytes;
          nativePdfLayout = {
            contract: nativePdf.layoutContract,
            pageCount: nativePdf.pageCount,
            plannedSigningFields: nativePdf.plannedSigningFields,
          };
        }
        assertValidPdfBytes(outputBytes);
        contentType = "application/pdf";
        generatedFileName = generatedFileName.replace(/\.docx$/i, ".pdf");
        filePath = packetType === "otp"
          ? `packet-${packetId}/otp-documents/${generatedFileName}`
          : requestedOutputPath || `packet-${packetId}/${packetType}-documents/${generatedFileName}`;
      } catch (error) {
        const typed = error as { code?: string; status?: number };
        return jsonResponse(typed.status || 500, {
          success: false,
          error: typed.code === "D2_PDF_ARTIFACT_INVALID"
            ? "The PDF converter returned an invalid document. Nothing was stored."
            : "PDF render failed for the native legal template.",
          errorCode: typed.code || "PDF_RENDER_FAILED",
          details: String(error),
        });
      }
    } else {
      let templateBytes: Uint8Array;
      try {
        templateBytes = await downloadTemplateBytes({
          supabase,
          templateBase64,
          templateBucket,
          templatePath,
          bucketCandidates,
        });
      } catch (error) {
        const details = String(error);
        return jsonResponse(400, {
          success: false,
          error: "Missing template file. Upload a mandate template or configure a valid template path.",
          errorCode: "MISSING_TEMPLATE_FILE",
          details,
        });
      }

      let zip: PizZip;
      try {
        zip = new PizZip(templateBytes);
      } catch (_error) {
        return jsonResponse(400, {
          success: false,
          error:
            "Template is not a valid .docx (zip) file. Convert the Word template to .docx and retry.",
        });
      }

      const doc = new Docxtemplater(zip, {
        delimiters: { start: "{", end: "}" },
        paragraphLoop: true,
        linebreaks: true,
      });

      try {
        doc.render(placeholderMap);
      } catch (error) {
        console.error("Mandate template render failed", error);
        return jsonResponse(400, {
          success: false,
          error: "Template render failed. Check mandate placeholders and provided data.",
          details: String(error),
        });
      }

      outputBytes = doc.getZip().generate({ type: "uint8array" });
      const fileNameBase = sanitizePart(
        placeholderMap.seller_display_name || placeholderMap["seller.display_name"] || leadId || "seller",
        "seller",
      );
      generatedFileName = `${fileNameBase}-mandate-${Date.now()}.docx`;
      filePath = `packet-${packetId}/mandate-documents/${generatedFileName}`;
    }

    if (capacityProbe) {
      const outputSha256 = await sha256Hex(outputBytes);
      return jsonResponse(200, {
        success: true,
        capacityProbe: true,
        contract: RENDERER_CONTRACT,
        generatorContract: "i2-generator-v1",
        packetType,
        frozenInput: frozenInput.attestation
          ? {
              contract: frozenInput.attestation.contract,
              inputAuthority: frozenInput.attestation.inputAuthority,
              freezeId: frozenInput.attestation.freezeId,
              sourceVersionId: frozenInput.attestation.sourceVersionId,
              contentFingerprint: frozenInput.attestation.contentFingerprint,
              sectionCount: frozenInput.attestation.sectionCount,
            }
          : null,
        output: {
          mediaType: contentType,
          byteLength: outputBytes.length,
          sha256: `sha256:${outputSha256}`,
        },
        durationMs: Date.now() - startedAt,
        mutatedData: false,
      });
    }

    const prePersistFence = await assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_persist");
    const uploadResult = await supabase.storage
      .from(outputBucketName)
      .upload(filePath, outputBytes, {
        contentType,
        upsert: false,
      });

    if (uploadResult.error) {
      return jsonResponse(500, {
        success: false,
        error: "Storage upload failed. Unable to save the generated mandate file.",
        errorCode: "STORAGE_UPLOAD_FAILED",
        details: String(uploadResult.error?.message || uploadResult.error),
      });
    }

    let inserted: Awaited<ReturnType<typeof insertMandateDocumentRecord>>;
    try {
      inserted = await insertMandateDocumentRecord({
        supabase,
        transactionId: persistedTransactionId,
        fileName: generatedFileName,
        filePath,
        packetId,
        packetType,
        generatedByRole: persistedGeneratedByRole,
        generatedByUserId: persistedGeneratedByUserId,
        clientVisible,
        internalOnly: approval.isPhase4LegalPacket,
      });
    } catch (error) {
      const persistenceFailure = error as { message?: unknown; details?: unknown; code?: unknown };
      const persistenceDetail = [
        normalizeText(persistenceFailure?.code),
        normalizeText(persistenceFailure?.details),
        normalizeText(persistenceFailure?.message),
      ].join(" ");
      if (persistenceDetail.includes("PHASE4_LEGAL_RELEASE_PERSISTENCE_FENCE_REJECTED")) {
        return jsonResponse(409, {
          success: false,
          error: "The legal template approval changed while this document was being generated. Refresh and regenerate from the current approved template.",
          errorCode: "LEGAL_TEMPLATE_RELEASE_REVOKED_DURING_GENERATION",
        });
      }
      return jsonResponse(500, {
        success: false,
        error: "Generated file could not be linked to a document record.",
        errorCode: "DOCUMENT_RECORD_CREATE_FAILED",
        details: String(error),
      });
    }

    console.log(JSON.stringify({ level: "info", event: "legal_document_generation_completed", requestId, packetType, templateId: approval.templateId, packetId, durationMs: Date.now() - startedAt, outputBytes: outputBytes.length }));
    const outputSha256 = await sha256Hex(outputBytes);
    const renderAttestation = frozenInput.attestation
      ? {
          ...frozenInput.attestation,
          rendererContract: RENDERER_CONTRACT,
          rendererVersion: NATIVE_RENDERER_VERSION,
          mediaType: contentType,
          byteLength: outputBytes.length,
          sha256: `sha256:${outputSha256}`,
          nativePdfLayout,
        }
      : null;
    let canonicalOtp = null;
    if (packetType === "otp") {
      canonicalOtp = await createAndSealCanonicalOtpVersion({
        supabase,
        packet: approval.packet,
        freezeId: normalizeText(frozenInput.attestation?.freezeId),
        documentId: normalizeText(inserted.record.id),
        output: {
          bucket: outputBucketName,
          filePath,
          fileName: generatedFileName,
          mediaType: contentType,
          byteLength: outputBytes.length,
          sha256: `sha256:${outputSha256}`,
        },
        placeholders: placeholderMap,
        sectionManifest,
        generationAttemptId,
        renderAttestation: asJsonObject(renderAttestation),
        generatedBy: normalizeText(caller.id) || null,
      });
    }
    if (approval.isPhase4LegalPacket) {
      const activationPlanDigest = normalizeText(pilotReleaseDecision?.planDigest).toLowerCase();
      if (!/^sha256:[0-9a-f]{64}$/.test(activationPlanDigest)) {
        throw Object.assign(new Error("The approved pilot release did not provide a valid activation-plan digest."), {
          code: "PHASE5_RELEASE_TRACE_PLAN_DIGEST_REQUIRED",
          status: 409,
        });
      }
      await bindLegalDocumentPilotReleaseTrace({
        supabase,
        packetId,
        documentId: normalizeText(inserted.record.id),
        activationPlanDigest,
        generatedArtifactSha256: `sha256:${outputSha256}`,
      });
    }
    const signedUrlResult = await supabase.storage
      .from(outputBucketName)
      .createSignedUrl(filePath, 60 * 60);
    return jsonResponse(200, {
      success: true,
      templateSource: { verified: true, templateId: approval.templateId },
      packetId,
      transactionId: persistedTransactionId,
      leadId,
      output: {
        bucket: outputBucketName,
        filePath,
        fileName: generatedFileName,
        signedUrl: signedUrlResult.data?.signedUrl || null,
        mediaType: contentType,
        byteLength: outputBytes.length,
        sha256: `sha256:${outputSha256}`,
      },
      documentRecord: {
        table: inserted.sourceTable,
        data: inserted.record,
      },
      placeholdersUsed: placeholderMap,
      sectionSummary,
      renderMode,
      rendererVersion: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
      generationFence: {
        contract: "i5-generator-v1",
        preRender: preRenderFence?.fenced === true,
        prePersist: prePersistFence?.fenced === true,
      },
      renderAttestation,
      nativePdfLayout,
      canonicalOtp: canonicalOtp
        ? {
            contract: "phase2-canonical-otp-pdf-v1",
            sealed: true,
            packet: canonicalOtp.packet,
            version: canonicalOtp.version,
            seal: canonicalOtp.seal,
          }
        : null,
      nativeRender: nativeRender
        ? {
            renderable: nativeRender.renderable,
            blockingIssues: nativeRender.blockingIssues,
            warnings: nativeRender.warnings,
            resolvedPlaceholderKeys: nativeRender.resolvedPlaceholderKeys,
          }
        : null,
      template: {
        templatePath: templatePath || null,
        templateBucket: templateBucket || null,
        templateFilename: templateFilename || null,
      },
    });
  } catch (error) {
    const typed = error as { code?: string; status?: number; message?: string; details?: unknown; auditContext?: GenerationBlockAuditContext };
    const errorCode = typed.code || "MANDATE_GENERATION_FAILED";
    const isReleaseBlock = TEMPLATE_RELEASE_BLOCK_CODES.has(errorCode);
    console.error(JSON.stringify({
      level: "error",
      event: "legal_document_generation_failed",
      requestId,
      packetType: "mandate",
      errorCode,
      durationMs: Date.now() - startedAt,
      // Release blocks have already emitted an intentionally non-PII audit
      // record. Do not repeat their raw error text in operational logs.
      ...(isReleaseBlock ? {} : { error: typed.message || String(error) }),
    }));
    const details = typed.message || String(error);
    return jsonResponse(typed.status || (typed.code === "LEGAL_TEMPLATE_APPROVAL_REQUIRED" ? 422 : 500), {
      success: false,
      error: details,
      errorCode: typed.code || mapFailureCodeFromMessage(details),
      details: typed.details || null,
    });
  }
});
