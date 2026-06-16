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
  return fieldType === "signature";
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
  const base = normalizeText(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("VITE_PUBLIC_APP_URL") || Deno.env.get("VITE_SITE_URL")) || "https://app.bridgenine.co.za";
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
  };
}

async function ensureSellerOnboardingSnapshotForListing({
  supabase,
  listingId,
  snapshot,
}: {
  supabase: any;
  listingId: string;
  snapshot: ReturnType<typeof resolveSellerOnboardingSnapshot>;
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
  const bridgeLogoUrl = firstPdfText(
    branding.bridgeLogoLightUrl,
    placeholders.bridgeLogoLightUrl,
    placeholders["bridge.logo_light_url"],
    placeholders.bridge_legal_logo_light_url,
    placeholders["bridge_legal_logo_light_url"],
    "/brand/bridge_9_white_background.png",
  );
  const agencyLogo = await embedImageAsset(pdf, agencyLogoUrl);
  const bridgeLogo = await embedImageAsset(pdf, bridgeLogoUrl);
  const documentReference =
    firstPdfText(placeholders.document_reference, placeholders.transaction_reference) ||
    firstPdfText(packet.title) ||
    "Mandate Agreement";

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
    const drewBridgeLogo = drawContainedImage({
      page,
      image: bridgeLogo,
      x: pageWidth - marginX - 150,
      y: pageHeight - 126,
      maxWidth: 150,
      maxHeight: 54,
    });
    if (!drewBridgeLogo) {
      page.drawText("bridge", {
        x: pageWidth - marginX - 118,
        y: pageHeight - 105,
        size: 30,
        font: boldFont,
        color: rgb(0.10, 0.22, 0.30),
      });
      page.drawText("9", {
        x: pageWidth - marginX - 22,
        y: pageHeight - 105,
        size: 30,
        font: boldFont,
        color: rgb(0.20, 0.78, 0.52),
      });
    }
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
    for (const [rowIndex, [key, rawLabel]] of rows.entries()) {
      const label = pdfSafeText(rawLabel || key);
      const value = pdfSafeText(getPlaceholderValue(placeholders, key) || "Not provided");
      const valueLines = wrapPdfText(value, 400, regularFont, 11.5);
      const rowHeight = Math.max(24, valueLines.length * 15);
      ensureSpace(rowHeight + 5);
      page.drawText(`${index + 1}.${rowIndex + 1}`, {
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
    const forceRegenerate = Boolean(payload.forceRegenerate || payload.force_regenerate || payload.replaceExisting || payload.replace_existing);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const packetResult = await supabase
      .from("document_packets")
      .select("id, organisation_id, packet_type, title, status, current_version_number, transaction_id, lead_id, source_context_json, branding_snapshot_json")
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
    const packetSourceContext = packet.source_context_json && typeof packet.source_context_json === "object"
      ? packet.source_context_json as Record<string, unknown>
      : {};
    const fallbackBranding = await fetchOrganisationBranding(supabase, String(packet.organisation_id || ""));
    mergeBrandingPayload(fallbackBranding, packetSourceContext.brandingSnapshot || packetSourceContext.branding_snapshot_json || packetSourceContext.branding);
    mergeBrandingPayload(fallbackBranding, packet.branding_snapshot_json);

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
    if (existingFinalPath && !forceRegenerate) {
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
      const listingConversion = await ensureListingFromSignedMandate({
        supabase,
        packet,
        version,
        finalArtifactPath: existingFinalPath,
      }).catch((error) => {
        console.error("[final-signed] listing conversion failed for existing artifact", {
          packetId,
          error: String(error),
        });
        return {
          success: false,
          error: String(error?.message || error),
          errorCode: normalizeText(error?.code) || null,
        };
      });
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
        listingConversion,
        sourceFormat: renderedFilePath ? (isPdfPath(renderedFilePath) ? "pdf" : "docx") : "existing_final",
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

    const fields = rawFields
      .filter((field) => lower(field.field_type) !== "initial")
      .filter((field) => mandateRoleIsRequired(packet, field.signer_role, spouseRequiredForVersion));

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
    let structuredFallbackSourceUsed = false;

    if (renderedFilePath) {
      const sourceDownload = await downloadFirstAvailable({
        supabase,
        path: renderedFilePath,
        buckets: sourceBucketCandidates,
      });
      sourcePdfBytes = sourceDownload.bytes;
    } else {
      fallbackSourceUsed = true;
      structuredFallbackSourceUsed = true;
      sourceFormat = "structured_fallback_pdf";
      sourcePdfBytes = await buildFallbackMandatePdfBytes({
        packet,
        version,
        fields,
        branding: fallbackBranding,
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

    for (const [signatureIndex, field] of signatureFields.entries()) {
      const pages = pdf.getPages();
      const pageNumber = structuredFallbackSourceUsed
        ? pages.length
        : Math.max(1, safeNumber(field.page_number, 1));
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

      const fallbackSlot = structuredFallbackSourceUsed
        ? resolveStructuredFallbackSignatureSlot({
          field,
          index: signatureIndex,
          pageWidth: page.getWidth(),
          pageHeight: page.getHeight(),
        })
        : null;
      const width = Math.max(8, fallbackSlot?.width || safeNumber(field.width, 120));
      const height = Math.max(8, fallbackSlot?.height || safeNumber(field.height, 36));
      const x = Math.max(0, fallbackSlot?.x || safeNumber(field.x_position, 0));
      const yFromTop = Math.max(0, safeNumber(field.y_position, 0));
      const y = fallbackSlot
        ? fallbackSlot.y
        : Math.max(0, page.getHeight() - yFromTop - height);

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
            y: Math.max(0, fallbackSlot ? fallbackSlot.lineY - 64 : y - 12),
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

    const listingConversion = await ensureListingFromSignedMandate({
      supabase,
      packet,
      version: {
        ...version,
        ...updateVersion.data,
      },
      finalArtifactPath: signedPath,
    }).catch((error) => {
      console.error("[final-signed] listing conversion failed", {
        packetId,
        error: String(error),
      });
      return {
        success: false,
        error: String(error?.message || error),
        errorCode: normalizeText(error?.code) || null,
      };
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
      listingConversion,
      sourceFormat,
      note: fallbackSourceUsed
        ? "Source packet had no rendered artifact, so a structured mandate PDF was generated from stored packet data before overlaying signatures."
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
