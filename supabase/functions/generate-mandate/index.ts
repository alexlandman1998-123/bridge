import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {
  NATIVE_RENDERER_VERSION,
  TEMPLATE_RENDER_MODES,
  renderStructuredTemplate,
} from "../../../the-it-guy/src/core/documents/structuredTemplateRenderer.js";

type JsonRecord = Record<string, unknown>;

type MandateSection = {
  key?: string;
  label?: string;
  content?: string;
  legalText?: string;
  legal_text?: string;
  required?: boolean;
  placeholders?: Array<[string, string]> | string[];
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

async function requireCaller(supabase: any, req: Request) {
  const authorization = normalizeText(req.headers.get("authorization"));
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw Object.assign(new Error("Authentication is required."), { code: "AUTH_REQUIRED", status: 401 });
  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    throw Object.assign(new Error("The authenticated user could not be verified."), { code: "AUTH_INVALID", status: 401 });
  }
  return userResult.data.user;
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

async function requireApprovedMandateTemplate({ supabase, packetId, requestedTemplateId, templatePath, templateBucket, templateBase64, renderMode }: {
  supabase: any;
  packetId: string;
  requestedTemplateId: string;
  templatePath: string;
  templateBucket: string;
  templateBase64: string;
  renderMode: string;
}) {
  const packetResult = await supabase
    .from("document_packets")
    .select("id, template_id, packet_type, organisation_id")
    .eq("id", packetId)
    .maybeSingle();
  if (packetResult.error) throw packetResult.error;
  const packetTemplateId = normalizeText(packetResult.data?.template_id);
  if (!packetResult.data || !packetTemplateId || (requestedTemplateId && requestedTemplateId !== packetTemplateId)) {
    throw Object.assign(new Error("The packet is not linked to the selected approved mandate template."), { code: "LEGAL_TEMPLATE_SOURCE_MISMATCH", status: 422 });
  }
  const templateResult = await supabase
    .from("document_packet_templates")
    .select("id, packet_type, template_key, status, is_active, template_storage_bucket, template_storage_path, metadata_json")
    .eq("id", packetTemplateId)
    .maybeSingle();
  if (templateResult.error) throw templateResult.error;
  if (!templateResult.data) throw Object.assign(new Error("The selected document template was not found."), { code: "TEMPLATE_NOT_FOUND", status: 422 });
  if (templateResult.data.is_active === false) throw Object.assign(new Error("The selected document template is inactive."), { code: "TEMPLATE_INACTIVE", status: 422 });
  const packetType = normalizeText(packetResult.data.packet_type).toLowerCase() || "mandate";
  if (renderMode !== TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
    const approvedPath = normalizeText(templateResult.data.template_storage_path);
    const approvedBucket = normalizeText(templateResult.data.template_storage_bucket);
    if (templateBase64 || !approvedPath || templatePath !== approvedPath || (approvedBucket && templateBucket !== approvedBucket)) {
      throw Object.assign(new Error("Mandate generation must use the exact approved template source."), { code: "LEGAL_TEMPLATE_SOURCE_MISMATCH", status: 422 });
    }
  }
  return { templateId: templateResult.data.id, packetType };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function sectionContent(section: MandateSection = {}) {
  return String(section.content ?? section.legalText ?? section.legal_text ?? "");
}

async function resolveFrozenNativeRenderInputD2({ supabase, packetId, generationPayload, requestedSections, requestedPlaceholders }: {
  supabase: any;
  packetId: string;
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
    .select("id, packet_id, version_number, edit_sequence, render_freeze_id, render_freeze_status, render_frozen_at, render_content_fingerprint, editable_content_json, section_manifest_json, placeholders_resolved_json")
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

function safePdfText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function escapePdfString(value: unknown) {
  return safePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function resolveNativePdfText(value: unknown, placeholders: Record<string, unknown> = {}) {
  return safePdfText(value).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => {
    const key = normalizeText(token);
    return safePdfText((placeholders as Record<string, unknown>)[key] ?? "");
  });
}

function wrapPdfLine(value: string, maxLength = 92) {
  const words = safePdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buildFallbackPdfLines({ packetType, sections, placeholders }: {
  packetType: string;
  sections: MandateSection[];
  placeholders: Record<string, unknown>;
}) {
  const title = packetType === "otp" ? "OFFER TO PURCHASE" : "MANDATE AGREEMENT";
  const lines: string[] = [
    title,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];
  for (const [index, section] of (sections || []).entries()) {
    const label = safePdfText(section.label || section.key || `Section ${index + 1}`);
    lines.push(`${index + 1}. ${label.toUpperCase()}`, "");
    const content = resolveNativePdfText(sectionContent(section), placeholders);
    for (const paragraph of content.split(/\r?\n+/)) {
      for (const wrapped of wrapPdfLine(paragraph)) lines.push(wrapped);
      lines.push("");
    }
  }
  lines.push("Certification note: Generated from the frozen native structured document revision.");
  return lines;
}

function buildSimplePdfBytes(lines: string[]) {
  const encoder = new TextEncoder();
  const pageLineLimit = 58;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += pageLineLimit) {
    pages.push(lines.slice(index, index + pageLineLimit));
  }
  if (!pages.length) pages.push(["Generated document"]);

  const fontObjectId = 3;
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const contentObjectIds = pages.map((_, index) => 5 + index * 2);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  for (let index = 0; index < pages.length; index += 1) {
    const content = [
      "BT",
      "/F1 10 Tf",
      "42 804 Td",
      "13 TL",
      ...pages[index].map((line) => `(${escapePdfString(line)}) Tj T*`),
      "ET",
    ].join("\n");
    const contentBytes = encoder.encode(content).length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`);
    objects.push(`<< /Length ${contentBytes} >>\nstream\n${content}\nendstream`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = encoder.encode(pdf).length;
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}

function renderFallbackNativePdfBytes({ packetType, sectionManifest, placeholders }: {
  packetType: string;
  sectionManifest: MandateSection[];
  placeholders: Record<string, unknown>;
}) {
  return buildSimplePdfBytes(buildFallbackPdfLines({ packetType, sections: sectionManifest, placeholders }));
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

async function renderNativeStructuredPdfBytes({ html, fileName, packetType, sectionManifest, placeholders }: {
  html: string;
  fileName: string;
  packetType: string;
  sectionManifest: MandateSection[];
  placeholders: Record<string, unknown>;
}) {
  if (buildPdfConverterUrl()) {
    return renderHtmlToPdfBytes(html, fileName);
  }
  return renderFallbackNativePdfBytes({ packetType, sectionManifest, placeholders });
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
  packetType: string;
}) {
  const now = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    transaction_id: transactionId || null,
    name: fileName,
    file_path: filePath,
    category: packetType === "otp" ? "sales_documents" : "mandate_documents",
    document_type: packetType === "otp" ? "otp_draft" : "mandate_draft",
    visibility_scope: clientVisible ? "shared" : "internal",
    is_client_visible: clientVisible,
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

    const renderMode = normalizeText(payload.renderMode || payload.render_mode) || TEMPLATE_RENDER_MODES.LEGACY_DOCX;
    const templatePath = normalizeText(payload.templatePath || payload.template_path || Deno.env.get("MANDATE_TEMPLATE_PATH"));
    const templateBucket = normalizeText(payload.templateBucket || payload.template_bucket || Deno.env.get("MANDATE_TEMPLATE_BUCKET"));
    const templateBase64 = normalizeText(payload.templateBase64 || payload.template_base64);
    const templateFilename = normalizeText(payload.templateFilename || payload.template_filename || inferTemplateFileName(templatePath));
    const outputBucket = normalizeText(payload.outputBucket || payload.output_bucket || Deno.env.get("MANDATE_OUTPUT_BUCKET"));
    const requestedOutputPath = normalizeText(payload.outputPath || payload.output_path);
    const generatedByRole = normalizeText(payload.generatedByRole || payload.generated_by_role) || "agent";
    const generatedByUserId = normalizeText(payload.generatedByUserId || payload.generated_by_user_id) || null;
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
    const outputBucketName = outputBucket || bucketCandidates[0] || "documents";
    const appBaseUrl = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || Deno.env.get("VITE_SITE_URL"));

    const supabase: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const requestedTemplateId = normalizeText((generationPayload as Record<string, unknown>)?.template && ((generationPayload as Record<string, unknown>).template as Record<string, unknown>)?.id);
    const caller = capacityProbe ? { id: null } : await requireCaller(supabase, req);
    const approval = await requireApprovedMandateTemplate({ supabase, packetId, requestedTemplateId, templatePath, templateBucket, templateBase64, renderMode });
    const preRenderFence = capacityProbe ? null : await assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_render");
    const packetType = approval.packetType === "otp" ? "otp" : "mandate";
    const frozenInput = renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
      ? await resolveFrozenNativeRenderInputD2({
          supabase,
          packetId,
          generationPayload: generationPayload as JsonRecord,
          requestedSections: sectionManifest,
          requestedPlaceholders: rawPlaceholders as JsonRecord,
        })
      : { sections: sectionManifest, placeholders: rawPlaceholders as JsonRecord, attestation: null };
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
        outputBytes = await renderNativeStructuredPdfBytes({
          html: nativeRender.html,
          fileName: generatedFileName.replace(/\.docx$/i, ".pdf"),
          packetType,
          sectionManifest,
          placeholders: placeholderMap,
        });
        assertValidPdfBytes(outputBytes);
        contentType = "application/pdf";
        generatedFileName = generatedFileName.replace(/\.docx$/i, ".pdf");
        filePath = requestedOutputPath || `packet-${packetId}/${packetType}-documents/${generatedFileName}`;
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
        transactionId,
        fileName: generatedFileName,
        filePath,
        packetId,
        packetType,
        generatedByRole,
        generatedByUserId,
        clientVisible,
      });
    } catch (error) {
      return jsonResponse(500, {
        success: false,
        error: "Generated file could not be linked to a document record.",
        errorCode: "DOCUMENT_RECORD_CREATE_FAILED",
        details: String(error),
      });
    }

    const signedUrlResult = await supabase.storage
      .from(outputBucketName)
      .createSignedUrl(filePath, 60 * 60);

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
        }
      : null;
    return jsonResponse(200, {
      success: true,
      templateSource: { verified: true, templateId: approval.templateId },
      packetId,
      transactionId,
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
    const typed = error as { code?: string; status?: number; message?: string; details?: unknown };
    console.error(JSON.stringify({ level: "error", event: "legal_document_generation_failed", requestId, packetType: "mandate", errorCode: typed.code || "MANDATE_GENERATION_FAILED", durationMs: Date.now() - startedAt, error: typed.message || String(error) }));
    const details = typed.message || String(error);
    return jsonResponse(typed.status || (typed.code === "LEGAL_TEMPLATE_APPROVAL_REQUIRED" ? 422 : 500), {
      success: false,
      error: details,
      errorCode: typed.code || mapFailureCodeFromMessage(details),
      details: typed.details || null,
    });
  }
});
