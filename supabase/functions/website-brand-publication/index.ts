import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  extensionForWebsiteBrandAsset,
  isAllowedWebsiteBrandContentType,
  normalizedWebsiteBrandContentType,
  normalizeWebsiteBrandAction,
  parseProjectStorageUrl,
  sha256Hex,
  WEBSITE_BRAND_ASSET_BUCKET,
  WEBSITE_BRAND_ASSET_MAX_BYTES,
  websiteBrandAssetStoragePath,
  type WebsiteBrandVariant,
} from "../_shared/websiteBrandAssets.ts";

type JsonRecord = Record<string, unknown>;
type ServiceClient = ReturnType<typeof createClient<any, "public", any>>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SOURCE_BUCKETS = new Set(["organisation-branding", "documents"]);
const BRAND_KEYS = [
  "name",
  "logoLightUrl",
  "logoDarkUrl",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "phone",
  "email",
  "website",
  "whatsappNumber",
] as const;

class RequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

function bearerToken(req: Request) {
  return text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
}

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function publicError(error: unknown) {
  if (error instanceof RequestError) return error;
  const row = (error || {}) as { code?: string; message?: string };
  const message = text(row.message);
  if (row.code === "42501") {
    return new RequestError(403, "website_brand_access_denied", message);
  }
  if (["22023", "23514", "P0002", "55000"].includes(text(row.code))) {
    return new RequestError(422, "website_brand_invalid", message);
  }
  return new RequestError(
    500,
    "website_brand_sync_failed",
    message || "Website branding could not be synchronized.",
  );
}

function inferContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    svg: "image/svg+xml",
  } as Record<string, string>)[extension || ""] || "";
}

function isExistingObjectError(error: unknown) {
  const row = (error || {}) as {
    message?: string;
    statusCode?: number | string;
  };
  const message = text(row.message).toLowerCase();
  const status = Number(row.statusCode || 0);
  return status === 409 || message.includes("already exists") ||
    message.includes("duplicate");
}

function pickBrand(value: unknown): JsonRecord {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
  return Object.fromEntries(
    BRAND_KEYS.filter((key) => typeof source[key] === "string").map((key) => [
      key,
      text(source[key]),
    ]),
  );
}

function firstText(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function organisationBrand(
  organisation: JsonRecord,
  branding: JsonRecord,
): JsonRecord {
  const supportPhone = firstText(
    branding.support_phone,
    organisation.support_phone,
    organisation.company_phone,
    organisation.phone,
  );
  const secondary = firstText(
    branding.secondary_brand_color,
    organisation.secondary_colour,
    "#e7bc71",
  );
  const metadata = branding.metadata_json &&
      typeof branding.metadata_json === "object" &&
      !Array.isArray(branding.metadata_json)
    ? branding.metadata_json as JsonRecord
    : {};
  const lightLogo = firstText(
    branding.logo_light_url,
    organisation.logo_url,
  );
  return {
    name: firstText(
      branding.organisation_display_name,
      organisation.display_name,
      organisation.name,
      organisation.legal_name,
      "Property Agency",
    ),
    logoLightUrl: lightLogo,
    logoDarkUrl: firstText(
      branding.logo_dark_url,
      organisation.logo_dark_url,
      lightLogo,
    ),
    primaryColor: firstText(
      branding.primary_brand_color,
      organisation.primary_colour,
      "#125b50",
    ),
    secondaryColor: secondary,
    accentColor: firstText(branding.accent_brand_color, secondary),
    phone: supportPhone,
    email: firstText(
      branding.support_email,
      organisation.support_email,
      organisation.company_email,
      organisation.email,
    ).toLowerCase(),
    website: firstText(branding.support_website, organisation.website),
    whatsappNumber: firstText(
      metadata.whatsappNumber,
      metadata.whatsapp_number,
      metadata.whatsapp,
      supportPhone,
    ),
  };
}

async function loadDraftBrand(
  admin: ServiceClient,
  siteId: string,
  revisionId: string,
) {
  const result = await admin.from("website_site_revisions")
    .select("brand_json")
    .eq("id", revisionId)
    .eq("website_site_id", siteId)
    .eq("status", "draft")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new RequestError(
      404,
      "website_draft_not_found",
      "An editable website draft was not found.",
    );
  }
  return pickBrand(result.data.brand_json);
}

async function copyLogo(input: {
  admin: ServiceClient;
  supabaseUrl: string;
  organisationId: string;
  websiteSiteId: string;
  variant: WebsiteBrandVariant;
  sourceUrl: string;
}) {
  const source = parseProjectStorageUrl(input.sourceUrl, input.supabaseUrl);
  if (!source || !SOURCE_BUCKETS.has(source.bucket)) {
    throw new RequestError(
      422,
      "unsupported_brand_asset_source",
      "Website logos must be uploaded to this Arch9 workspace before saving.",
    );
  }

  const download = await input.admin.storage.from(source.bucket).download(
    source.path,
  );
  if (download.error || !download.data) {
    throw new RequestError(
      422,
      "brand_asset_download_failed",
      "One or more website logos could not be read from storage.",
    );
  }
  const bytes = await download.data.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > WEBSITE_BRAND_ASSET_MAX_BYTES) {
    throw new RequestError(
      422,
      "brand_asset_size_invalid",
      "Each website logo must be between 1 byte and 10 MB.",
    );
  }
  const contentType = normalizedWebsiteBrandContentType(download.data.type) ||
    inferContentType(source.path);
  if (!isAllowedWebsiteBrandContentType(contentType)) {
    throw new RequestError(
      422,
      "brand_asset_type_invalid",
      "Website logos must be PNG, JPG, WebP, or SVG files.",
    );
  }
  const fingerprint = await sha256Hex(bytes);
  const storagePath = websiteBrandAssetStoragePath({
    organisationId: input.organisationId,
    websiteSiteId: input.websiteSiteId,
    variant: input.variant,
    fingerprint,
    extension: extensionForWebsiteBrandAsset(contentType),
  });
  const upload = await input.admin.storage.from(WEBSITE_BRAND_ASSET_BUCKET)
    .upload(storagePath, new Uint8Array(bytes), {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });
  if (upload.error && !isExistingObjectError(upload.error)) {
    throw new RequestError(
      502,
      "brand_asset_upload_failed",
      "One or more durable website logos could not be stored.",
    );
  }
  const publicUrl = input.admin.storage.from(WEBSITE_BRAND_ASSET_BUCKET)
    .getPublicUrl(storagePath).data.publicUrl;
  return {
    variant: input.variant,
    source_bucket: source.bucket,
    source_path: source.path,
    source_fingerprint: fingerprint,
    storage_path: storagePath,
    public_url: publicUrl,
    content_type: contentType,
    byte_size: bytes.byteLength,
    created: !upload.error,
  };
}

async function removeNewUploads(admin: ServiceClient, assets: JsonRecord[]) {
  const paths = assets.filter((asset) => asset.created === true)
    .map((asset) => text(asset.storage_path)).filter(Boolean);
  if (paths.length) {
    await admin.storage.from(WEBSITE_BRAND_ASSET_BUCKET).remove(paths);
  }
}

async function cleanupRetiredAssets(
  admin: ServiceClient,
  siteId: string,
  retiredAssets: unknown = [],
) {
  const registered = await admin.from("website_brand_assets")
    .select("id, storage_path")
    .eq("website_site_id", siteId)
    .eq("status", "retired");
  if (registered.error) throw registered.error;
  const returned = Array.isArray(retiredAssets) ? retiredAssets : [];
  const rows = (registered.data || []) as Array<{
    id: string;
    storage_path: string;
  }>;
  const paths = [
    ...new Set([
      ...rows.map((row) => text(row.storage_path)),
      ...returned.map((row) => text((row as JsonRecord)?.storagePath)),
    ].filter(Boolean)),
  ];
  if (!paths.length) return { deleted: 0, pending: 0 };
  const removal = await admin.storage.from(WEBSITE_BRAND_ASSET_BUCKET).remove(
    paths,
  );
  if (removal.error) return { deleted: 0, pending: paths.length };
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length) {
    const marked = await admin.from("website_brand_assets")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (marked.error) return { deleted: paths.length, pending: ids.length };
  }
  return { deleted: paths.length, pending: 0 };
}

async function retireUnreferencedAssets(
  admin: ServiceClient,
  siteId: string,
) {
  const [revisionResult, assetResult] = await Promise.all([
    admin.from("website_site_revisions").select("brand_json")
      .eq("website_site_id", siteId),
    admin.from("website_brand_assets").select("id, public_url")
      .eq("website_site_id", siteId).eq("status", "active"),
  ]);
  if (revisionResult.error) throw revisionResult.error;
  if (assetResult.error) throw assetResult.error;
  const referenced = new Set<string>();
  for (const revision of (revisionResult.data || []) as JsonRecord[]) {
    const brand = revision.brand_json as JsonRecord || {};
    for (const key of ["logoLightUrl", "logoDarkUrl", "logoUrl"]) {
      const url = text(brand[key]);
      if (url) referenced.add(url);
    }
  }
  const ids = ((assetResult.data || []) as JsonRecord[])
    .filter((asset) => !referenced.has(text(asset.public_url)))
    .map((asset) => text(asset.id)).filter(Boolean);
  if (ids.length) {
    const retired = await admin.from("website_brand_assets").update({
      status: "retired",
      retired_at: new Date().toISOString(),
    }).in("id", ids);
    if (retired.error) throw retired.error;
  }
}

async function synchronizeBrand(input: {
  admin: ServiceClient;
  supabaseUrl: string;
  siteId: string;
  revisionId: string;
  actorId: string;
  actorEmail: string;
  brand: JsonRecord;
}) {
  const site = await input.admin.from("website_sites")
    .select("organisation_id")
    .eq("id", input.siteId)
    .maybeSingle();
  if (site.error) throw site.error;
  const organisationId = text(site.data?.organisation_id);
  if (!organisationId) {
    throw new RequestError(404, "website_not_found", "Website site not found.");
  }

  const brand = pickBrand(input.brand);
  const assets: JsonRecord[] = [];
  let committedResult: JsonRecord;
  try {
    for (
      const [key, variant] of [
        ["logoLightUrl", "light"],
        ["logoDarkUrl", "dark"],
      ] as Array<["logoLightUrl" | "logoDarkUrl", WebsiteBrandVariant]>
    ) {
      const sourceUrl = text(brand[key]);
      if (!sourceUrl) continue;
      const asset = await copyLogo({
        admin: input.admin,
        supabaseUrl: input.supabaseUrl,
        organisationId,
        websiteSiteId: input.siteId,
        variant,
        sourceUrl,
      });
      assets.push(asset);
      brand[key] = asset.public_url;
    }
    const committed = await input.admin.rpc("website_commit_draft_brand", {
      p_website_site_id: input.siteId,
      p_revision_id: input.revisionId,
      p_actor_id: input.actorId,
      p_actor_email: input.actorEmail,
      p_brand_patch: brand,
      p_assets: assets,
    });
    if (committed.error) throw committed.error;
    committedResult = committed.data as JsonRecord;
  } catch (error) {
    await removeNewUploads(input.admin, assets);
    throw error;
  }
  const cleanup = await cleanupRetiredAssets(
    input.admin,
    input.siteId,
    committedResult.retiredAssets,
  );
  return {
    brand: committedResult.brand,
    assets: { active: assets.length, ...cleanup },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed.",
      code: "method_not_allowed",
    });
  }

  try {
    const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
    const anonKey = text(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new RequestError(
        503,
        "website_brand_not_configured",
        "Website branding is not configured.",
      );
    }
    const token = bearerToken(req);
    if (!token) {
      throw new RequestError(
        401,
        "authentication_required",
        "Sign in before editing website branding.",
      );
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userResult = await admin.auth.getUser(token);
    if (userResult.error || !userResult.data.user?.id) {
      throw new RequestError(
        401,
        "invalid_session",
        "Your session could not be verified.",
      );
    }
    const actorId = userResult.data.user.id;
    const actorEmail = userResult.data.user.email || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const payload = await req.json().catch(() => ({})) as JsonRecord;
    const action = normalizeWebsiteBrandAction(payload.action);
    if (!action) {
      throw new RequestError(
        400,
        "invalid_request",
        "Choose a valid website branding action.",
      );
    }

    let siteId = text(payload.siteId || payload.websiteSiteId);
    let revisionId = text(payload.revisionId);
    let creation: JsonRecord | null = null;
    if (action === "create") {
      const organisationId = text(payload.organisationId);
      if (!isUuid(organisationId)) {
        throw new RequestError(
          400,
          "invalid_organisation",
          "Choose an organisation before creating its website.",
        );
      }
      const created = await userClient.rpc("website_create_site", {
        p_organisation_id: organisationId,
      });
      if (created.error) throw created.error;
      creation = created.data as JsonRecord;
      siteId = text(creation.siteId);
      revisionId = text(creation.revisionId);
    }
    if (!isUuid(siteId) || !isUuid(revisionId)) {
      throw new RequestError(
        400,
        "invalid_website_draft",
        "Choose a valid website draft.",
      );
    }

    if (action === "discard") {
      const discarded = await userClient.rpc("website_discard_draft_revision", {
        p_website_site_id: siteId,
        p_revision_id: revisionId,
      });
      if (discarded.error) throw discarded.error;
      await retireUnreferencedAssets(admin, siteId);
      const cleanup = await cleanupRetiredAssets(admin, siteId);
      return jsonResponse(200, {
        discardedRevisionId: discarded.data,
        assets: cleanup,
      });
    }

    let brand: JsonRecord;
    if (action === "reset") {
      const site = await admin.from("website_sites").select("organisation_id")
        .eq("id", siteId).maybeSingle();
      if (site.error) throw site.error;
      const organisationId = text(site.data?.organisation_id);
      if (!organisationId) {
        throw new RequestError(
          404,
          "website_not_found",
          "Website site not found.",
        );
      }
      const [organisation, branding] = await Promise.all([
        admin.from("organisations").select("*").eq("id", organisationId)
          .maybeSingle(),
        admin.from("organisation_branding").select("*")
          .eq("organisation_id", organisationId).maybeSingle(),
      ]);
      if (organisation.error) throw organisation.error;
      if (!organisation.data) {
        throw new RequestError(
          404,
          "organisation_not_found",
          "Organisation not found.",
        );
      }
      if (branding.error) throw branding.error;
      brand = organisationBrand(
        organisation.data as JsonRecord,
        (branding.data || {}) as JsonRecord,
      );
    } else if (action === "save") {
      brand = pickBrand(payload.brand);
    } else {
      brand = await loadDraftBrand(admin, siteId, revisionId);
    }

    const synchronized = await synchronizeBrand({
      admin,
      supabaseUrl,
      siteId,
      revisionId,
      actorId,
      actorEmail,
      brand,
    });
    if (action === "publish") {
      const published = await userClient.rpc("website_publish_revision", {
        p_website_site_id: siteId,
        p_revision_id: revisionId,
      });
      if (published.error) throw published.error;
      return jsonResponse(200, {
        publishedRevisionId: published.data,
        ...synchronized,
      });
    }
    return jsonResponse(200, {
      ...(creation || {}),
      websiteSiteId: siteId,
      revisionId,
      ...synchronized,
    });
  } catch (error) {
    const safe = publicError(error);
    return jsonResponse(safe.status, { error: safe.message, code: safe.code });
  }
});
