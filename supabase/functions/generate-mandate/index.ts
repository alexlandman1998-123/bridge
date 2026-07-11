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

type SupabaseServiceClient = ReturnType<typeof createClient<any, "public", any>>;

type MandateSection = {
  key?: string;
  label?: string;
  required?: boolean;
  placeholders?: Array<[string, string]> | string[];
};

type StructuredTemplateRender = {
  html: string;
  documentModel: JsonRecord;
  renderable: boolean;
  blockingIssues: unknown[];
  warnings: unknown[];
  resolvedPlaceholderKeys: string[];
};

type StructuredTemplateInput = {
  packetType?: string;
  title?: string;
  template?: JsonRecord | null;
  sections?: MandateSection[];
  placeholders?: Record<string, string>;
  branding?: JsonRecord;
  assetBaseUrl?: string;
};

const renderNativeStructuredTemplate = renderStructuredTemplate as unknown as (
  input: StructuredTemplateInput,
) => StructuredTemplateRender;

type GenerateMandateRequest = {
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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
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

function inferOutputFileName({ leadId, packetId, renderMode }: { leadId: string | null; packetId: string; renderMode: string; }) {
  const base = sanitizePart(leadId || packetId || "mandate", "mandate");
  const extension = renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? "pdf" : "docx";
  return `${base}-mandate-${Date.now()}.${extension}`;
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
  supabase: SupabaseServiceClient;
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
}: {
  supabase: SupabaseServiceClient;
  transactionId: string | null;
  fileName: string;
  filePath: string;
  packetId: string;
  generatedByRole: string;
  generatedByUserId: string | null;
  clientVisible: boolean;
}) {
  const now = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    transaction_id: transactionId || null,
    name: fileName,
    file_path: filePath,
    category: "mandate_documents",
    document_type: "mandate_draft",
    visibility_scope: clientVisible ? "shared" : "internal",
    is_client_visible: clientVisible,
    uploaded_by_role: generatedByRole || null,
    uploaded_by_user_id: generatedByUserId,
    stage_key: "seller_mandate",
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
    const sectionManifest = (payload.sectionManifest || payload.section_manifest || []) as MandateSection[];
    const rawPlaceholders = asRecord(payload.placeholders);
    const branding = asRecord(payload.branding);
    const generationPayload = Object.keys(asRecord(payload.generationPayload)).length
      ? asRecord(payload.generationPayload)
      : asRecord(payload.generation_payload);
    const sourceContext = Object.keys(asRecord(payload.sourceContext)).length
      ? asRecord(payload.sourceContext)
      : asRecord(payload.source_context);

    const placeholderMap = createAliasMap(rawPlaceholders);
    const sectionSummary = buildSectionSummary(sectionManifest);
    if (!placeholderMap.packet_sections_summary) {
      placeholderMap.packet_sections_summary = sectionSummary;
    }
    if (!placeholderMap.packet_id) {
      placeholderMap.packet_id = packetId;
    }
    if (!placeholderMap.generated_date) {
      placeholderMap.generated_date = new Date().toISOString().slice(0, 10);
    }

    const bucketCandidates = parseBucketCandidates(
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_STORAGE_BUCKET"),
      "documents",
    );
    const outputBucketName = outputBucket || bucketCandidates[0] || "documents";
    const appBaseUrl = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || Deno.env.get("VITE_SITE_URL"));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let outputBytes: Uint8Array;
    let generatedFileName = inferOutputFileName({ leadId, packetId, renderMode });
    let filePath = `packet-${packetId}/mandate-documents/${generatedFileName}`;
    let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let nativeRender: StructuredTemplateRender | null = null;

    if (renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
      const templatePayload = asRecord(generationPayload.template);
      const nativeTemplate: JsonRecord = {
        packet_type: "mandate",
        render_mode: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED,
        template_label: normalizeText(templatePayload.label || templatePayload.template_label || templatePayload.templateLabel) || "Mandate Agreement",
        metadata_json: {
          render_mode: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED,
        },
        sections: sectionManifest,
      };

      nativeRender = renderNativeStructuredTemplate({
        packetType: "mandate",
        template: nativeTemplate,
        sections: sectionManifest,
        placeholders: placeholderMap,
        branding,
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
        outputBytes = await renderHtmlToPdfBytes(nativeRender.html, generatedFileName.replace(/\.docx$/i, ".pdf"));
        contentType = "application/pdf";
        generatedFileName = generatedFileName.replace(/\.docx$/i, ".pdf");
        filePath = requestedOutputPath || `packet-${packetId}/mandate-documents/${generatedFileName}`;
      } catch (error) {
        return jsonResponse(500, {
          success: false,
          error: "PDF render failed for the native mandate template.",
          errorCode: "PDF_RENDER_FAILED",
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

    return jsonResponse(200, {
      success: true,
      packetId,
      transactionId,
      leadId,
      output: {
        bucket: outputBucketName,
        filePath,
        fileName: generatedFileName,
        signedUrl: signedUrlResult.data?.signedUrl || null,
      },
      documentRecord: {
        table: inserted.sourceTable,
        data: inserted.record,
      },
      placeholdersUsed: placeholderMap,
      sectionSummary,
      renderMode,
      rendererVersion: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
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
    console.error("generate-mandate failed", error);
    const details = String(error);
    return jsonResponse(500, {
      success: false,
      error: details,
      errorCode: mapFailureCodeFromMessage(details),
    });
  }
});
