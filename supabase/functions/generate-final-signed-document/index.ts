import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

type JsonRecord = Record<string, unknown>;

type GenerateFinalSignedPayload = {
  packetId?: string;
  packet_id?: string;
  packetVersionId?: string;
  packet_version_id?: string;
  finalisedBy?: string;
  finalised_by?: string;
  outputBucket?: string;
  output_bucket?: string;
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  return fieldType === "initial" || fieldType === "signature";
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

function wrapText(text: string, maxChars = 86) {
  const words = normalizeText(text).replace(/\s+/g, " ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function buildFallbackMandatePdfBytes({
  packet,
  version,
  fields,
}: {
  packet: Record<string, unknown>;
  version: Record<string, unknown>;
  fields: Record<string, unknown>[];
}) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const lineHeight = 14;
  const maxFieldPage = Math.max(1, ...fields.map((field) => Math.max(1, safeNumber(field.page_number, 1))));
  const placeholders = version?.placeholders_resolved_json && typeof version.placeholders_resolved_json === "object"
    ? version.placeholders_resolved_json as Record<string, unknown>
    : {};
  const sectionManifest = Array.isArray(version?.section_manifest_json) ? version.section_manifest_json as Record<string, unknown>[] : [];
  const pages = Array.from({ length: Math.max(3, maxFieldPage) }, () => pdf.addPage([pageWidth, pageHeight]));
  let pageIndex = 0;
  let page = pages[pageIndex];
  let y = pageHeight - margin;

  const drawLine = (text: string, options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const size = options.size || 10;
    if (y < margin + lineHeight) {
      pageIndex += 1;
      page = pages[pageIndex] || pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(text.slice(0, 110), {
      x: margin,
      y,
      size,
      font: options.bold ? boldFont : regularFont,
      color: options.color || rgb(0.12, 0.18, 0.25),
    });
    y -= lineHeight;
  };

  drawLine(normalizeText(packet.title) || "Mandate Agreement", { bold: true, size: 18 });
  drawLine(`Packet: ${normalizeText(packet.id)} | Version: ${normalizeText(version.version_number) || "1"}`, { size: 8, color: rgb(0.38, 0.46, 0.55) });
  y -= 10;

  if (sectionManifest.length) {
    for (const section of sectionManifest) {
      const label = normalizeText(section.sectionLabel || section.label || section.section_key || section.key || "Section");
      drawLine(label, { bold: true, size: 12 });
      const rows = Array.isArray(section.placeholders) ? section.placeholders : [];
      for (const row of rows) {
        const [key, rawLabel] = Array.isArray(row) ? row : [row?.key || row?.placeholderKey, row?.label || row?.placeholderLabel];
        const fieldLabel = normalizeText(rawLabel || key);
        const value = getPlaceholderValue(placeholders, key) || "Not provided";
        for (const line of wrapText(`${fieldLabel}: ${value}`, 92)) {
          drawLine(line, { size: 9 });
        }
      }
      y -= 8;
    }
  } else {
    const entries = Object.entries(placeholders).slice(0, 160);
    for (const [key, value] of entries) {
      for (const line of wrapText(`${key}: ${normalizeText(value) || "Not provided"}`, 92)) {
        drawLine(line, { size: 9 });
      }
    }
  }

  const signaturePage = pages[Math.min(pages.length - 1, Math.max(0, maxFieldPage - 1))];
  signaturePage.drawText("Signature record", {
    x: margin,
    y: pageHeight - margin,
    size: 13,
    font: boldFont,
    color: rgb(0.12, 0.18, 0.25),
  });

  return pdf.save();
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

    const payload = (await req.json()) as GenerateFinalSignedPayload;
    const packetId = normalizeText(payload.packetId || payload.packet_id);
    if (!packetId) {
      return jsonResponse(400, {
        success: false,
        error: "packetId is required.",
        errorCode: "MISSING_PACKET_ID",
      });
    }

    const requestedVersionId = normalizeText(payload.packetVersionId || payload.packet_version_id);
    const finalisedBy = normalizeText(payload.finalisedBy || payload.finalised_by) || null;
    const explicitOutputBucket = normalizeText(payload.outputBucket || payload.output_bucket);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const packetResult = await supabase
      .from("document_packets")
      .select("id, organisation_id, packet_type, title, status, current_version_number, transaction_id, lead_id, source_context_json")
      .eq("id", packetId)
      .maybeSingle();
    if (packetResult.error) throw packetResult.error;
    const packet = packetResult.data as Record<string, unknown> | null;
    if (!packet) {
      return jsonResponse(404, {
        success: false,
        error: "Packet not found.",
        errorCode: "PACKET_NOT_FOUND",
      });
    }

    let versionQuery = supabase
      .from("document_packet_versions")
      .select(
        "id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, final_signed_file_path, final_signed_file_url, final_signed_file_bucket, final_signed_document_id, final_signed_file_name, finalised_at, placeholders_resolved_json, section_manifest_json, validation_summary_json",
      )
      .eq("packet_id", packetId)
      .eq("render_status", "generated")
      .order("version_number", { ascending: false })
      .limit(1);

    if (requestedVersionId) {
      versionQuery = supabase
        .from("document_packet_versions")
        .select(
          "id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, final_signed_file_path, final_signed_file_url, final_signed_file_bucket, final_signed_document_id, final_signed_file_name, finalised_at, placeholders_resolved_json, section_manifest_json, validation_summary_json",
        )
        .eq("id", requestedVersionId)
        .eq("packet_id", packetId)
        .limit(1);
    }

    const versionResult = await versionQuery.maybeSingle();
    if (versionResult.error) throw versionResult.error;
    const version = versionResult.data as Record<string, unknown> | null;
    if (!version) {
      return jsonResponse(400, {
        success: false,
        error: "No generated packet version found.",
        errorCode: "NO_GENERATED_VERSION",
      });
    }

    const renderedFilePath = normalizeText(version.rendered_file_path);
    const existingFinalPath = normalizeText(version.final_signed_file_path);
    if (existingFinalPath) {
      const existingBucketCandidates = parseBucketCandidates(
        normalizeText(version.final_signed_file_bucket),
        Deno.env.get("SIGNED_DOCUMENTS_BUCKET"),
        Deno.env.get("SUPABASE_SIGNED_DOCUMENTS_BUCKET"),
        Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
        Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
        Deno.env.get("DOCUMENTS_BUCKET"),
        Deno.env.get("SUPABASE_STORAGE_BUCKET"),
        "documents",
      );
      let existingUrl: string | null = null;
      let existingBucket = normalizeText(version.final_signed_file_bucket);
      for (const bucket of [...new Set(existingBucketCandidates.filter(Boolean))]) {
        const signedUrlResult = await supabase.storage.from(bucket).createSignedUrl(existingFinalPath, 60 * 60);
        if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
          existingUrl = signedUrlResult.data.signedUrl;
          existingBucket = bucket;
          break;
        }
      }
      return jsonResponse(200, {
        success: true,
        packetId,
        packetVersionId: version.id,
        finalArtifact: {
          bucket: existingBucket || null,
          path: existingFinalPath,
          url: existingUrl || normalizeText(version.final_signed_file_url) || null,
          fileName: normalizeText(version.final_signed_file_name) || buildSignedFileName(normalizeText(packet.packet_type), safeNumber(version.version_number, 1)),
          documentId: normalizeText(version.final_signed_document_id) || null,
          finalisedAt: normalizeText(version.finalised_at) || null,
          finalisedBy: null,
        },
        version,
        sourceFormat: renderedFilePath ? (isPdfPath(renderedFilePath) ? "pdf" : "docx") : "existing_final",
        note: "Final signed document already exists for this packet version.",
      });
    }

    const fieldsResult = await supabase
      .from("document_signing_fields")
      .select(
        "id, signer_role, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, signature_asset_path, signature_asset_url",
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
      return jsonResponse(400, {
        success: false,
        error: "No signers configured for this packet version.",
        errorCode: "MISSING_SIGNERS",
      });
    }

    const incompleteSigners = signers.filter((signer) => lower(signer.status) !== "signed");
    if (incompleteSigners.length) {
      return jsonResponse(400, {
        success: false,
        error: "Required signers are incomplete.",
        errorCode: "SIGNERS_INCOMPLETE",
        details: { incompleteSignerCount: incompleteSigners.length },
      });
    }

    const fields = rawFields.filter((field) => mandateRoleIsRequired(packet, field.signer_role, spouseRequiredForVersion));

    const requiredFields = fields.filter((field) => Boolean(field.required));
    const incompleteFields = requiredFields.filter((field) => lower(field.status) !== "completed");
    if (incompleteFields.length) {
      return jsonResponse(400, {
        success: false,
        error: "Required signing fields are incomplete.",
        errorCode: "FIELDS_INCOMPLETE",
        details: { incompleteFieldCount: incompleteFields.length },
      });
    }

    const signatureFields = requiredFields.filter(fieldIsSignatureLike);
    const missingAssets = signatureFields.filter((field) => !normalizeText(field.signature_asset_path));
    if (missingAssets.length) {
      return jsonResponse(400, {
        success: false,
        error: "Required signing assets are missing.",
        errorCode: "MISSING_SIGNATURE_ASSETS",
        details: { missingAssetFieldCount: missingAssets.length },
      });
    }

    const sourceBucketCandidates = parseBucketCandidates(
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_STORAGE_BUCKET"),
      "documents",
    );

    const signatureBucketCandidates = parseBucketCandidates(
      Deno.env.get("SIGNATURES_BUCKET"),
      Deno.env.get("SUPABASE_SIGNATURES_BUCKET"),
      ...sourceBucketCandidates,
      "document-signatures",
      "documents",
    );

    let sourcePdfBytes: Uint8Array;
    const sourceIsPdf = isPdfPath(renderedFilePath);
    let sourceFormat = sourceIsPdf ? "pdf" : "docx";
    let fallbackSourceUsed = false;

    if (renderedFilePath) {
      const sourceDownload = await downloadFirstAvailable({
        supabase,
        path: renderedFilePath,
        buckets: sourceBucketCandidates,
      });
      sourcePdfBytes = sourceDownload.bytes;
    } else {
      fallbackSourceUsed = true;
      sourceFormat = "fallback_pdf";
      sourcePdfBytes = await buildFallbackMandatePdfBytes({
        packet,
        version,
        fields,
      });
    }

    if (!fallbackSourceUsed && !sourceIsPdf) {
      const conversion = await convertDocxToPdfBytes({
        docxBytes: sourcePdfBytes,
        sourcePath: renderedFilePath,
      });
      if (!conversion.success) {
        return jsonResponse(400, {
          success: false,
          error: conversion.error,
          errorCode: conversion.errorCode,
        });
      }
      sourcePdfBytes = conversion.bytes;
    }

    const pdf = await buildOverlayPdf({
      sourcePdfBytes,
    });
    const dateFont = await pdf.embedFont(StandardFonts.Helvetica);
    const signerSignedAtByRole = signers.reduce((accumulator, signer) => {
      const role = lower(signer.signer_role);
      if (role) accumulator[role] = normalizeText(signer.signed_at);
      return accumulator;
    }, {} as Record<string, string>);

    for (const field of signatureFields) {
      const pageNumber = Math.max(1, safeNumber(field.page_number, 1));
      const pages = pdf.getPages();
      if (pageNumber > pages.length) continue;
      const page = pages[pageNumber - 1];

      const assetPath = normalizeText(field.signature_asset_path);
      if (!assetPath) continue;
      const assetDownload = await readImageBytes({
        supabase,
        assetPath,
        buckets: signatureBucketCandidates,
      });
      if (!assetDownload?.bytes?.length) {
        return jsonResponse(400, {
          success: false,
          error: `Missing signature asset for field ${normalizeText(field.id)}.`,
          errorCode: "MISSING_SIGNATURE_ASSET_FILE",
        });
      }

      let embedded;
      if (assetPath.toLowerCase().endsWith(".jpg") || assetPath.toLowerCase().endsWith(".jpeg")) {
        embedded = await pdf.embedJpg(assetDownload.bytes);
      } else {
        embedded = await pdf.embedPng(assetDownload.bytes);
      }

      const width = Math.max(8, safeNumber(field.width, 120));
      const height = Math.max(8, safeNumber(field.height, 36));
      const x = Math.max(0, safeNumber(field.x_position, 0));
      const yFromTop = Math.max(0, safeNumber(field.y_position, 0));
      const y = Math.max(0, page.getHeight() - yFromTop - height);

      page.drawImage(embedded, {
        x,
        y,
        width,
        height,
      });

      if (lower(field.field_type) === "signature") {
        const signedAt = normalizeText(signerSignedAtByRole[lower(field.signer_role)]);
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
    }

    const finalPdfBytes = await pdf.save();
    const finalisedAt = new Date().toISOString();

    const outputBucketCandidates = parseBucketCandidates(
      explicitOutputBucket,
      Deno.env.get("SIGNED_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_SIGNED_DOCUMENTS_BUCKET"),
      ...sourceBucketCandidates,
      "documents",
    );

    const packetDocumentId = normalizeText(version.rendered_document_id);
    const signedFileName = buildSignedFileName(normalizeText(packet.packet_type), safeNumber(version.version_number, 1));
    const signedPath = `signed-documents/${packetId}/${packetDocumentId || normalizeText(version.id)}/${Date.now()}-${signedFileName}`;

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
      return jsonResponse(500, {
        success: false,
        error: "Unable to store final signed document.",
        errorCode: "FINAL_SIGNED_UPLOAD_FAILED",
        details: String(uploadError),
      });
    }

    const signedUrlResult = await supabase.storage.from(uploadedBucket).createSignedUrl(signedPath, 60 * 60);
    const finalSignedUrl = signedUrlResult.data?.signedUrl || null;

    const documentInsert = await supabase
      .from("documents")
      .insert({
        transaction_id: normalizeText(packet.transaction_id) || null,
        name: signedFileName,
        file_path: signedPath,
        category: "signed_documents",
        document_type: "final_signed_packet",
        visibility_scope: "shared",
        is_client_visible: true,
        uploaded_by_role: "system",
        uploaded_by_user_id: finalisedBy,
        stage_key: "final_signed",
        created_at: finalisedAt,
        updated_at: finalisedAt,
      })
      .select("id, name, file_path, category, document_type, created_at")
      .maybeSingle();

    const finalSignedDocumentId = documentInsert.error ? null : normalizeText(documentInsert.data?.id);

    const updateVersion = await supabase
      .from("document_packet_versions")
      .update({
        final_signed_file_path: signedPath,
        final_signed_file_url: null,
        final_signed_file_bucket: uploadedBucket,
        final_signed_file_name: signedFileName,
        final_signed_document_id: finalSignedDocumentId || null,
        finalised_at: finalisedAt,
        finalised_by: finalisedBy,
      })
      .eq("id", String(version.id || ""))
      .select(
        "id, packet_id, organisation_id, version_number, render_status, rendered_file_path, rendered_file_url, final_signed_file_path, final_signed_file_url, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at, finalised_by",
      )
      .single();
    if (updateVersion.error) throw updateVersion.error;

    await supabase
      .from("document_packets")
      .update({
        status: "completed",
        completed_at: finalisedAt,
      })
      .eq("id", packetId);

    await appendPacketEvent({
      supabase,
      packetId,
      organisationId: normalizeText(packet.organisation_id),
      versionId: normalizeText(version.id),
      eventType: "final_signed_document_generated",
      payload: {
        signerCount: signers.length,
        fieldCount: signatureFields.length,
        generatedFilePath: signedPath,
        generatedFileBucket: uploadedBucket,
        generatedAt: finalisedAt,
      },
    });

    return jsonResponse(200, {
      success: true,
      packetId,
      packetVersionId: version.id,
      finalArtifact: {
        bucket: uploadedBucket,
        path: signedPath,
        url: finalSignedUrl,
        fileName: signedFileName,
        documentId: finalSignedDocumentId,
        finalisedAt,
        finalisedBy,
      },
      version: updateVersion.data,
      sourceFormat,
      note: fallbackSourceUsed
        ? "Source packet had no rendered artifact, so a fallback mandate PDF was generated from stored packet data before overlaying signatures."
        : sourceIsPdf
        ? null
        : "Source packet was DOCX and converted through the configured DOCX→PDF converter before overlaying signatures.",
    });
  } catch (error) {
    console.error("generate-final-signed-document failed", error);
    return jsonResponse(500, {
      success: false,
      error: String(error),
      errorCode: "FINAL_SIGNED_GENERATION_FAILED",
    });
  }
});
