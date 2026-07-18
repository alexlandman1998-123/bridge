import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";

type JsonRecord = Record<string, unknown>;
type SupabaseStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
    };
  };
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

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function hasVersionPreviewAsset(version: Record<string, unknown> | null) {
  if (!version || typeof version !== "object") return false;
  return Boolean(normalizeText(version.rendered_file_url)) || Boolean(normalizeText(version.rendered_file_path));
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeSectionManifest(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const objectValue = normalizeJsonObject(value);
  if (Array.isArray(objectValue.sectionManifest)) return objectValue.sectionManifest;
  if (Array.isArray(objectValue.sections)) return objectValue.sections;
  if (Array.isArray(objectValue.items)) return objectValue.items;
  return [];
}

function resolveVersionPlaceholders(version: Record<string, unknown> | null): Record<string, unknown> {
  if (!version || typeof version !== "object") return {};
  const directPlaceholders = normalizeJsonObject(version.placeholders_resolved_json);
  if (Object.keys(directPlaceholders).length) return directPlaceholders;

  const validationSummary = normalizeJsonObject(version.validation_summary_json);
  const validationPlaceholders = normalizeJsonObject(
    validationSummary.placeholders ||
      validationSummary.resolvedPlaceholders ||
      validationSummary.placeholders_resolved_json,
  );
  if (Object.keys(validationPlaceholders).length) return validationPlaceholders;

  const generationPayload = normalizeJsonObject(validationSummary.generationPayload || validationSummary.generation_payload);
  const payloadPlaceholders = normalizeJsonObject(
    generationPayload.placeholders ||
      generationPayload.resolvedPlaceholders ||
      generationPayload.placeholders_resolved_json,
  );
  return payloadPlaceholders;
}

function resolveVersionPreviewHtml(version: Record<string, unknown> | null): string {
  if (!version || typeof version !== "object") return "";
  const validationSummary = normalizeJsonObject(version.validation_summary_json);
  return normalizeText(
    validationSummary.previewHtml ||
      validationSummary.preview_html ||
      validationSummary.htmlPreview ||
      validationSummary.html_preview,
  );
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
  const payload = normalizeJsonObject(source);
  assignBrandingValue(target, "organisationId", payload.organisationId || payload.organisation_id);
  assignBrandingValue(target, "organisationName", payload.organisationName || payload.organisation_display_name || payload.displayName || payload.name);
  assignBrandingValue(target, "logoLightUrl", payload.logoLightUrl || payload.logo_light_url || payload.logoLight || payload.logo_light || payload.logoUrl || payload.logo_url);
  assignBrandingValue(target, "logoDarkUrl", payload.logoDarkUrl || payload.logo_dark_url || payload.logoDark || payload.logo_dark);
  assignBrandingValue(target, "logoHighContrastUrl", payload.logoHighContrastUrl || payload.logo_high_contrast_url);
  assignBrandingValue(target, "organisationLogoUrl", payload.organisationLogoUrl || payload.organisation_logo_url || payload.logoUrl || payload.logo_url || payload.logoLight || payload.logo_light);
  assignBrandingValue(target, "organisationLogoDarkUrl", payload.organisationLogoDarkUrl || payload.organisation_logo_dark_url || payload.logoDark || payload.logo_dark);
  assignBrandingValue(target, "organisationLogoHighContrastUrl", payload.organisationLogoHighContrastUrl || payload.organisation_logo_high_contrast_url);
  assignBrandingValue(target, "primaryBrandColor", payload.primaryBrandColor || payload.primary_brand_color);
  assignBrandingValue(target, "secondaryBrandColor", payload.secondaryBrandColor || payload.secondary_brand_color);
  assignBrandingValue(target, "accentBrandColor", payload.accentBrandColor || payload.accent_brand_color);
  assignBrandingValue(target, "bridgeLogoLabel", payload.bridgeLogoLabel || payload.bridge_logo_label);
  assignBrandingValue(target, "bridgeLogoLightUrl", payload.bridgeLogoLightUrl || payload.bridge_logo_light_url);
  assignBrandingValue(target, "bridgeLogoDarkUrl", payload.bridgeLogoDarkUrl || payload.bridge_logo_dark_url);
  return target;
}

function escapeSvgText(value: unknown) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAgencyLogoDataUrl(organisationName: unknown) {
  const name = normalizeText(organisationName);
  if (!name) return "";
  const isSamlin = name.toLowerCase().includes("samlin");
  const primaryLabel = isSamlin ? "SAMLIN" : name.toUpperCase();
  const secondaryLabel = isSamlin ? "REAL ESTATE" : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="260" height="90" viewBox="0 0 260 90" role="img" aria-label="${escapeSvgText(name)}">
      <rect width="260" height="90" fill="white"/>
      <text x="0" y="${secondaryLabel ? "44" : "56"}" fill="#102236" font-family="Arial, Helvetica, sans-serif" font-size="${secondaryLabel ? "43" : "30"}" font-weight="800" letter-spacing="-1">${escapeSvgText(primaryLabel)}</text>
      ${secondaryLabel ? `<text x="4" y="72" fill="#102236" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="5">${escapeSvgText(secondaryLabel)}</text>` : ""}
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isGeneratedAgencyLogoDataUrl(value: unknown) {
  const normalized = normalizeText(value);
  if (normalized.toLowerCase().startsWith("data:image/svg+xml")) return true;
  const decoded = decodeURIComponent(normalized.split(",", 2)[1] || normalized).toLowerCase();
  return decoded.includes("<text") && decoded.includes("font-family=\"arial");
}

function ensureAgencyLogoFallback(branding: Record<string, unknown>) {
  return branding;
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

function preferLightSurfaceBranding(branding: Record<string, unknown>) {
  const copy = { ...branding };
  const lightLogo =
    normalizeText(copy.logoLightUrl) ||
    normalizeText(copy.organisationLogoUrl) ||
    normalizeText(copy.logoDarkUrl) ||
    normalizeText(copy.organisationLogoDarkUrl);
  if (lightLogo) {
    copy.logoLightUrl = lightLogo;
    copy.logoDarkUrl = lightLogo;
    copy.logoHighContrastUrl = lightLogo;
    copy.organisationLogoUrl = lightLogo;
    copy.organisationLogoDarkUrl = lightLogo;
    copy.organisationLogoHighContrastUrl = lightLogo;
  }
  return copy;
}

async function createSignedAssetUrl(supabase: SupabaseStorageClient, bucket: unknown, path: unknown, fallbackUrl: unknown = "") {
  const safeBucket = normalizeText(bucket);
  const safePath = normalizeText(path);
  const safeFallback = normalizeText(fallbackUrl);
  if (!safeBucket || !safePath) return safeFallback;
  const result = await supabase.storage.from(safeBucket).createSignedUrl(safePath, 60 * 60 * 24 * 30);
  if (!result.error && result.data?.signedUrl) return result.data.signedUrl;
  return safeFallback;
}

async function mergeOrganisationSettingsBranding(supabase: SupabaseStorageClient & { from: (table: string) => any }, branding: Record<string, unknown>, organisationId: string) {
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

  const logoLight = await createSignedAssetUrl(
    supabase,
    settingsBranding.logoLightBucket,
    settingsBranding.logoLightPath,
    settingsBranding.logoLight || settingsBranding.logoLightUrl || settingsBranding.logo_url,
  );
  const logoDark = await createSignedAssetUrl(
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
    primaryBrandColor: normalizeJsonObject(settingsBranding.brandColours).primary,
    secondaryBrandColor: normalizeJsonObject(settingsBranding.brandColours).secondary,
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
    mergeBrandingPayload(branding, brandingResult.data);
  }

  await mergeOrganisationSettingsBranding(supabase, branding, resolvedOrganisationId);

  return removeGeneratedAgencyLogoFallbacks(branding);
}

function collectSourceContextBucketHints(sourceContext: Record<string, unknown> = {}) {
  const generationPayload =
    sourceContext.generationPayload && typeof sourceContext.generationPayload === "object"
      ? sourceContext.generationPayload as Record<string, unknown>
      : {};
  const generationTemplate =
    generationPayload.template && typeof generationPayload.template === "object"
      ? generationPayload.template as Record<string, unknown>
      : {};

  return parseBucketCandidates(
    String(sourceContext.outputBucket || sourceContext.output_bucket || ""),
    String(sourceContext.template_output_bucket || sourceContext.templateOutputBucket || ""),
    String(generationPayload.outputBucket || generationPayload.output_bucket || ""),
    String(generationTemplate.outputBucket || generationTemplate.output_bucket || ""),
  );
}

function hasVersionPreviewData(version: Record<string, unknown> | null) {
  if (!version || typeof version !== "object") return false;
  const sectionManifest = normalizeSectionManifest(version.section_manifest_json);
  return sectionManifest.length > 0 || Boolean(resolveVersionPreviewHtml(version));
}

async function resolveSignedPreviewUrl({
  supabase,
  filePath,
  bucketCandidates,
}: {
  supabase: SupabaseStorageClient;
  filePath: string;
  bucketCandidates: string[];
}) {
  const path = normalizeText(filePath);
  if (!path) return null;
  if (isAbsoluteUrl(path)) return path;

  for (const bucket of [...new Set(bucketCandidates.filter(Boolean))]) {
    const normalizedBucket = normalizeText(bucket);
    const pathCandidates = [
      path,
      path.replace(/^\/+/, ""),
      path.startsWith(`${normalizedBucket}/`) ? path.slice(normalizedBucket.length + 1) : "",
      path.startsWith(`/${normalizedBucket}/`) ? path.slice(normalizedBucket.length + 2) : "",
    ].filter(Boolean);

    for (const candidatePath of [...new Set(pathCandidates)]) {
      const result = await supabase.storage.from(normalizedBucket).createSignedUrl(candidatePath, 60 * 60);
      if (!result.error && result.data?.signedUrl) {
        return result.data.signedUrl;
      }
    }
  }
  return null;
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
    };

    const action = normalizeText(payload?.action || "resolve").toLowerCase();
    if (action !== "resolve") {
      return jsonResponse(400, {
        success: false,
        error: "Unsupported action.",
        errorCode: "UNSUPPORTED_ACTION",
      });
    }

    const token = normalizeText(payload?.token);
    if (!token) {
      return jsonResponse(400, {
        success: false,
        error: "Signing token is required.",
        errorCode: "INVALID_SIGNING_TOKEN",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const signerQuery = await supabase
      .from("document_packet_signers")
      .select(
        "id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at",
      )
      .eq("signing_token", token)
      .maybeSingle();

    if (signerQuery.error) {
      throw signerQuery.error;
    }

    const signer = signerQuery.data as Record<string, unknown> | null;
    if (!signer) {
      return jsonResponse(404, {
        success: false,
        error: "This signing link is invalid.",
        errorCode: "INVALID_SIGNING_TOKEN",
      });
    }

    const nowIso = new Date().toISOString();
    const tokenExpiry = normalizeText(signer?.token_expires_at);
    if (!tokenExpiry) {
      return jsonResponse(410, {
        success: false,
        error: "This signing link is no longer active.",
        errorCode: "SIGNER_SESSION_INACTIVE",
      });
    }
    if (tokenExpiry) {
      const expiryDate = new Date(tokenExpiry);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()) {
        if (normalizeText(signer?.status).toLowerCase() !== "expired") {
          await supabase.from("document_packet_signers").update({ status: "expired" }).eq("id", String(signer.id));
        }
        return jsonResponse(410, {
          success: false,
          error: "This signing link has expired.",
          errorCode: "SIGNING_TOKEN_EXPIRED",
        });
      }
    }
    if (!["sent", "viewed"].includes(normalizeText(signer?.status).toLowerCase())) {
      return jsonResponse(409, {
        success: false,
        error: "This signing link is no longer active.",
        errorCode: "SIGNER_SESSION_INACTIVE",
      });
    }

    const packetQuery = await supabase
      .from("document_packets")
      .select("id, organisation_id, packet_type, title, status, current_version_number, source_context_json, branding_snapshot_json, created_at, updated_at")
      .eq("id", String(signer.packet_id || ""))
      .maybeSingle();
    if (packetQuery.error) throw packetQuery.error;
    if (!packetQuery.data) {
      return jsonResponse(404, {
        success: false,
        error: "Packet not found for this signing link.",
        errorCode: "SIGNING_PACKET_NOT_FOUND",
      });
    }
    const packet = packetQuery.data as Record<string, unknown>;

    const versionQuery = await supabase
      .from("document_packet_versions")
      .select(
        "id, packet_id, organisation_id, version_number, render_status, rendered_document_id, rendered_file_path, rendered_file_name, rendered_file_url, placeholders_resolved_json, section_manifest_json, validation_summary_json, created_at, updated_at",
      )
      .eq("id", String(signer.packet_version_id || ""))
      .eq("packet_id", String(packet.id || ""))
      .maybeSingle();
    if (versionQuery.error) throw versionQuery.error;
    if (!versionQuery.data) {
      return jsonResponse(404, {
        success: false,
        error: "Packet version not found for this signing link.",
        errorCode: "SIGNING_VERSION_NOT_FOUND",
      });
    }
    const version = versionQuery.data as Record<string, unknown>;
    const validation = version.validation_summary_json && typeof version.validation_summary_json === "object"
      ? version.validation_summary_json as Record<string, unknown>
      : {};
    const lock = validation.lock_snapshot && typeof validation.lock_snapshot === "object"
      ? validation.lock_snapshot as Record<string, unknown>
      : {};
    const runtimeBindingValid =
      normalizeText(packet.organisation_id) === normalizeText(signer.organisation_id) &&
      normalizeText(version.organisation_id) === normalizeText(signer.organisation_id) &&
      Number(packet.current_version_number) === Number(version.version_number) &&
      normalizeText(version.render_status).toLowerCase() === "generated" &&
      validation.content_locked === true &&
      normalizeText(validation.review_state).toLowerCase() === "locked" &&
      normalizeText(lock.lockDecision).toLowerCase() === "locked" &&
      normalizeText(lock.packetId) === normalizeText(packet.id) &&
      normalizeText(lock.versionId) === normalizeText(version.id);
    if (!runtimeBindingValid) {
      return jsonResponse(409, {
        success: false,
        error: "This signing session is not bound to the current locked document version.",
        errorCode: "SIGNER_SESSION_BINDING_INVALID",
      });
    }

    if (normalizeText(packet.packet_type).toLowerCase() === "mandate" && normalizeText(signer.signer_role).toLowerCase() === "seller") {
      const agentSignerQuery = await supabase
        .from("document_packet_signers")
        .select("id, status")
        .eq("packet_id", String(packet.id || ""))
        .eq("packet_version_id", String(version.id || ""))
        .eq("signer_role", "agent")
        .order("signing_order", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (agentSignerQuery.error) throw agentSignerQuery.error;
      const agentStatus = normalizeText((agentSignerQuery.data as Record<string, unknown> | null)?.status).toLowerCase();
      if (agentSignerQuery.data && agentStatus !== "signed") {
        return jsonResponse(403, {
          success: false,
          error: "The agency representative needs to sign this mandate before the seller can access it.",
          errorCode: "SELLER_WAITING_FOR_AGENT",
        });
      }
    }

    const documentPreviewVersion = version;
    const previewDataVersion = version;
    const linkedVersionHasPreviewAsset = hasVersionPreviewAsset(version);
    const linkedVersionHasPreviewData = hasVersionPreviewData(version);

    if (!linkedVersionHasPreviewAsset || !linkedVersionHasPreviewData) {
      return jsonResponse(409, {
        success: false,
        error: "The exact locked document version is not available for signing preview.",
        errorCode: "LOCKED_SIGNING_PREVIEW_UNAVAILABLE",
      });
    }

    const fieldsQuery = await supabase
      .from("document_signing_fields")
      .select(
        "id, packet_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status, completed_at, completed_by_email",
      )
      .eq("packet_id", String(packet.id || ""))
      .eq("packet_version_id", String(version.id || ""))
      .eq("signer_role", normalizeText(signer.signer_role))
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true });
    if (fieldsQuery.error) throw fieldsQuery.error;
    const allFields = (fieldsQuery.data || []) as Record<string, unknown>[];
    const signerEmail = normalizeText(signer.signer_email).toLowerCase();
    const fields = allFields.filter((field) => {
      const fieldEmail = normalizeText(field?.signer_email).toLowerCase();
      return !fieldEmail || fieldEmail === signerEmail;
    });
    if (!fields.length) {
      return jsonResponse(409, {
        success: false,
        error: "No prepared signing fields exist for this exact signer and locked version.",
        errorCode: "SIGNER_FIELDS_NOT_PREPARED",
      });
    }

    const requiredInitials = fields.filter((field) => field.required && normalizeText(field.field_type) === "initial").length;
    const requiredSignatures = fields.filter((field) => field.required && normalizeText(field.field_type) === "signature").length;
    const requiredCount = fields.filter((field) => field.required).length;

    const sourceContext = packet.source_context_json && typeof packet.source_context_json === "object"
      ? packet.source_context_json as Record<string, unknown>
      : {};
    const previewBranding = await fetchOrganisationBranding(supabase, String(packet.organisation_id || ""));
    mergeBrandingPayload(previewBranding, sourceContext.brandingSnapshot || sourceContext.branding_snapshot_json || sourceContext.branding);
    mergeBrandingPayload(previewBranding, packet.branding_snapshot_json);
    ensureAgencyLogoFallback(previewBranding);
    const documentPreviewBranding = preferLightSurfaceBranding(previewBranding);
    const validationSummary = documentPreviewVersion.validation_summary_json && typeof documentPreviewVersion.validation_summary_json === "object"
      ? documentPreviewVersion.validation_summary_json as Record<string, unknown>
      : {};
    const validationBucketHints = collectSourceContextBucketHints(validationSummary);
    const sourceContextBucketHints = collectSourceContextBucketHints(sourceContext);
    const packetType = normalizeText(packet.packet_type).toLowerCase();
    const packetTypeOutputBucket =
      packetType === "mandate"
        ? normalizeText(Deno.env.get("MANDATE_OUTPUT_BUCKET"))
        : packetType === "otp"
          ? normalizeText(Deno.env.get("OTP_OUTPUT_BUCKET"))
          : "";
    const bucketCandidates = parseBucketCandidates(
      packetTypeOutputBucket,
      Deno.env.get("MANDATE_OUTPUT_BUCKET"),
      Deno.env.get("OTP_OUTPUT_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_STORAGE_BUCKET"),
      Deno.env.get("SIGNED_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_SIGNED_DOCUMENTS_BUCKET"),
      ...sourceContextBucketHints,
      ...validationBucketHints,
      "document-packets",
      "signed-documents",
      "documents",
    );
    const freshSignedPreviewUrl = await resolveSignedPreviewUrl({
      supabase,
      filePath: normalizeText(documentPreviewVersion.rendered_file_path),
      bucketCandidates,
    });
    const documentPreviewUrl = freshSignedPreviewUrl || normalizeText(documentPreviewVersion.rendered_file_url);

    const nextStatus = ["pending", "ready_to_send", "sent"].includes(normalizeText(signer.status).toLowerCase())
      ? "viewed"
      : signer.status;
    const signerUpdatePayload: Record<string, unknown> = {
      status: nextStatus,
    };
    if (!normalizeText(signer.viewed_at)) signerUpdatePayload.viewed_at = nowIso;
    if (!normalizeText(signer.token_used_at)) signerUpdatePayload.token_used_at = nowIso;

    const updateResult = await supabase
      .from("document_packet_signers")
      .update(signerUpdatePayload)
      .eq("id", String(signer.id || ""))
      .select(
        "id, organisation_id, packet_id, packet_document_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, token_expires_at, token_used_at, viewed_at, signed_at",
      )
      .single();
    if (updateResult.error) throw updateResult.error;
    const updatedSigner = updateResult.data as Record<string, unknown>;
    if (!normalizeText(signer.viewed_at)) {
      await supabase.from("document_packet_events").insert({
        packet_id: String(packet.id || ""),
        organisation_id: String(packet.organisation_id || ""),
        version_id: String(version.id || ""),
        event_type: "signer_link_viewed",
        event_payload_json: {
          activity_type: "signer_link_viewed",
          lead_id: sourceContext.leadId || sourceContext.lead_id || null,
          transaction_id: sourceContext.transactionId || sourceContext.transaction_id || null,
          private_listing_id: sourceContext.privateListingId || sourceContext.private_listing_id || null,
          document_packet_id: String(packet.id || ""),
          document_packet_version_id: String(version.id || ""),
          signer_id: updatedSigner.id,
          actor_name: updatedSigner.signer_name || "Seller",
          actor_role: "seller",
          message: updatedSigner.signer_name
            ? `${updatedSigner.signer_name} viewed the mandate.`
            : "Seller viewed the mandate.",
          visibility: "internal",
          created_at: nowIso,
          metadata: {},
          signerId: updatedSigner.id,
          signerRole: updatedSigner.signer_role,
          signerName: updatedSigner.signer_name,
          signerEmail: updatedSigner.signer_email,
          viewedAt: nowIso,
        },
        created_by: null,
        created_at: nowIso,
      });
    }

    await supabase
      .from("document_packets")
      .update({
        source_context_json: {
          ...sourceContext,
          signing_status: "viewed",
          signingStatus: "viewed",
          mandateStatus: "viewed",
          viewedAt: sourceContext.viewedAt || nowIso,
          lastViewedAt: nowIso,
        },
      })
      .eq("id", String(packet.id || ""));

    return jsonResponse(200, {
      success: true,
      session: {
        signer: updatedSigner,
        packet: {
          id: packet.id,
          packet_type: packet.packet_type,
          title: packet.title,
          status: packet.status,
          current_version_number: packet.current_version_number,
        },
        version: {
          id: version.id,
          version_number: version.version_number,
          render_status: version.render_status,
          rendered_file_name: version.rendered_file_name,
        },
        previewVersion: {
          id: documentPreviewVersion.id,
          version_number: documentPreviewVersion.version_number,
          render_status: documentPreviewVersion.render_status,
          rendered_file_name: documentPreviewVersion.rendered_file_name,
          rendered_file_path: documentPreviewVersion.rendered_file_path,
          has_preview_url: Boolean(documentPreviewUrl),
        },
        previewData: {
          packetType: packet.packet_type,
          title: packet.title,
          previewHtml: resolveVersionPreviewHtml(previewDataVersion) || resolveVersionPreviewHtml(documentPreviewVersion) || "",
          placeholders: resolveVersionPlaceholders(previewDataVersion),
          sectionManifest: normalizeSectionManifest(previewDataVersion.section_manifest_json),
          branding: documentPreviewBranding,
        },
        fields,
        fieldSummary: {
          requiredCount,
          requiredInitials,
          requiredSignatures,
        },
        documentPreviewUrl: documentPreviewUrl || null,
      },
    });
  } catch (error) {
    console.error("resolve-signer-token failed", error);
    return jsonResponse(500, {
      success: false,
      error: "The signing session could not be loaded. Please try again or request a new signing link.",
      errorCode: "SIGNER_SESSION_FAILED",
    });
  }
});
