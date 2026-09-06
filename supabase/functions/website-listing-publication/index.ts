import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  extensionForWebsiteMedia,
  isAllowedWebsiteMediaContentType,
  isCopyableWebsiteMediaType,
  normalizedWebsiteMediaContentType,
  normalizeWebsiteListingAction,
  parseProjectStorageUrl,
  sha256Hex,
  WEBSITE_LISTING_MEDIA_BUCKET,
  WEBSITE_LISTING_MEDIA_MAX_BYTES,
  websiteListingMediaStoragePath,
  type WebsiteMediaType,
} from "../_shared/websiteListingMedia.ts";

type JsonRecord = Record<string, unknown>;
type ServiceClient = ReturnType<typeof createClient<any, "public", any>>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_BUCKETS = new Set([
  "documents",
  "listing-media",
  "organisation-branding",
]);
const DURABLE_MEDIA_BLOCKER =
  "Prepare durable website copies for every listing image.";

class RequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bearerToken(req: Request) {
  return text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
}

function publicError(error: unknown) {
  if (error instanceof RequestError) return error;
  const message = text((error as { message?: string })?.message);
  return new RequestError(
    500,
    "website_media_sync_failed",
    message || "Website listing media could not be synchronized.",
  );
}

function inferContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    pdf: "application/pdf",
  } as Record<string, string>)[extension || ""] || "";
}

function isExistingObjectError(error: unknown) {
  const message = text((error as { message?: string })?.message).toLowerCase();
  const status = Number(
    (error as { statusCode?: number | string })?.statusCode || 0,
  );
  return status === 409 || message.includes("already exists") ||
    message.includes("duplicate");
}

async function copyMediaAsset(input: {
  admin: ServiceClient;
  supabaseUrl: string;
  organisationId: string;
  websiteSiteId: string;
  listingId: string;
  media: JsonRecord;
}) {
  const sourceMediaId = text(input.media.id);
  const mediaType = text(input.media.media_type);
  if (!sourceMediaId || !isCopyableWebsiteMediaType(mediaType)) {
    throw new RequestError(
      422,
      "invalid_listing_media",
      "The listing contains an invalid website media record.",
    );
  }

  const source = parseProjectStorageUrl(
    input.media.file_url,
    input.supabaseUrl,
  );
  if (!source || !SOURCE_BUCKETS.has(source.bucket)) {
    throw new RequestError(
      422,
      "unsupported_listing_media_source",
      "Website images must be stored in an approved bucket owned by this Supabase project.",
    );
  }

  const download = await input.admin.storage.from(source.bucket).download(
    source.path,
  );
  if (download.error || !download.data) {
    throw new RequestError(
      422,
      "listing_media_download_failed",
      "One or more listing images could not be read from private storage.",
    );
  }

  const bytes = await download.data.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > WEBSITE_LISTING_MEDIA_MAX_BYTES) {
    throw new RequestError(
      422,
      "listing_media_size_invalid",
      "Each website image must be between 1 byte and 15 MB.",
    );
  }

  const contentType = normalizedWebsiteMediaContentType(download.data.type) ||
    inferContentType(source.path);
  if (
    !isAllowedWebsiteMediaContentType(
      mediaType as WebsiteMediaType,
      contentType,
    )
  ) {
    throw new RequestError(
      422,
      "listing_media_type_invalid",
      "Website media must be a supported image or PDF floor plan.",
    );
  }

  const fingerprint = await sha256Hex(bytes);
  const storagePath = websiteListingMediaStoragePath({
    organisationId: input.organisationId,
    websiteSiteId: input.websiteSiteId,
    listingId: input.listingId,
    sourceMediaId,
    fingerprint,
    extension: extensionForWebsiteMedia(contentType),
  });

  const upload = await input.admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET)
    .upload(
      storagePath,
      new Uint8Array(bytes),
      { contentType, upsert: false, cacheControl: "31536000" },
    );
  if (upload.error && !isExistingObjectError(upload.error)) {
    throw new RequestError(
      502,
      "listing_media_upload_failed",
      "One or more durable website images could not be stored.",
    );
  }

  const publicUrl =
    input.admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET).getPublicUrl(
      storagePath,
    ).data.publicUrl;
  return {
    source_media_id: sourceMediaId,
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

async function removeNewUploads(
  admin: ServiceClient,
  assets: Array<JsonRecord>,
) {
  const paths = assets.filter((asset) => asset.created === true)
    .map((asset) => text(asset.storage_path)).filter(Boolean);
  if (paths.length) {
    await admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET).remove(paths);
  }
}

async function cleanupRetiredAssets(input: {
  admin: ServiceClient;
  listingId: string;
  additionalPaths?: string[];
}) {
  const retired = await input.admin
    .from("website_listing_media_assets")
    .select("id, storage_path")
    .eq("listing_id", input.listingId)
    .eq("status", "retired");
  if (retired.error) throw retired.error;

  const retiredRows = (retired.data || []) as Array<
    { id: string; storage_path: string }
  >;
  const paths = [
    ...new Set([
      ...retiredRows.map((row) => text(row.storage_path)),
      ...(input.additionalPaths || []).map(text),
    ].filter(Boolean)),
  ];
  if (!paths.length) return { deleted: 0, pending: 0 };

  const removal = await input.admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET)
    .remove(paths);
  if (removal.error) return { deleted: 0, pending: paths.length };

  const retiredIds = retiredRows.map((row) => row.id).filter(Boolean);
  if (retiredIds.length) {
    const marked = await input.admin
      .from("website_listing_media_assets")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .in("id", retiredIds);
    if (marked.error) {
      return { deleted: paths.length, pending: retiredIds.length };
    }
  }
  return { deleted: paths.length, pending: 0 };
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
        "website_media_not_configured",
        "Website media publishing is not configured.",
      );
    }

    const token = bearerToken(req);
    if (!token) {
      throw new RequestError(
        401,
        "authentication_required",
        "Sign in before publishing a website listing.",
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

    const payload = await req.json().catch(() => ({})) as JsonRecord;
    const listingId = text(payload.listingId || payload.listing_id);
    const action = normalizeWebsiteListingAction(payload.action);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        listingId,
      ) || !action
    ) {
      throw new RequestError(
        400,
        "invalid_request",
        "Choose a saved listing and a valid publication action.",
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const statusResult = await userClient.rpc(
      "website_get_listing_publication_status",
      { p_listing_id: listingId },
    );
    if (statusResult.error) {
      throw new RequestError(
        403,
        "listing_access_denied",
        statusResult.error.message,
      );
    }
    const currentStatus = (statusResult.data || {}) as JsonRecord;

    if (action === "unpublish") {
      const publicationResult = await admin.rpc(
        "website_commit_listing_publication",
        {
          p_listing_id: listingId,
          p_action: action,
          p_actor_id: userResult.data.user.id,
          p_actor_email: userResult.data.user.email || "",
        },
      );
      if (publicationResult.error) throw publicationResult.error;
      const cleanup = await cleanupRetiredAssets({ admin, listingId });
      const nextStatus = await userClient.rpc(
        "website_get_listing_publication_status",
        { p_listing_id: listingId },
      );
      if (nextStatus.error) throw nextStatus.error;
      return jsonResponse(200, {
        publication: nextStatus.data,
        media: { active: 0, ...cleanup },
      });
    }

    const blockers = Array.isArray(currentStatus.blockers)
      ? currentStatus.blockers.map(text).filter(Boolean)
      : [];
    const blocking = blockers.filter((blocker) =>
      blocker !== DURABLE_MEDIA_BLOCKER
    );
    if (blocking.length) {
      throw new RequestError(409, "listing_not_ready", blocking[0]);
    }

    const listing = await admin.from("private_listings").select(
      "id, organisation_id",
    ).eq("id", listingId).maybeSingle();
    if (listing.error || !listing.data?.organisation_id) {
      throw new RequestError(404, "listing_not_found", "Listing not found.");
    }
    const organisationId = text(listing.data.organisation_id);
    const websiteSiteId = text(currentStatus.websiteSiteId);
    if (!websiteSiteId) {
      throw new RequestError(
        409,
        "website_not_ready",
        "Create the organisation website before publishing listing media.",
      );
    }

    const existing = await admin
      .from("website_listing_media_assets")
      .select("source_media_id, storage_path, status")
      .eq("website_site_id", websiteSiteId)
      .eq("listing_id", listingId);
    if (existing.error) throw existing.error;

    const sourceMedia = await admin
      .from("listing_media")
      .select("id, media_type, file_url, caption, sort_order")
      .eq("listing_id", listingId)
      .in("media_type", ["image", "floor_plan"])
      .order("sort_order", { ascending: true });
    if (sourceMedia.error) throw sourceMedia.error;
    if (
      !(sourceMedia.data || []).some((row: JsonRecord) =>
        row.media_type === "image"
      )
    ) {
      throw new RequestError(
        422,
        "listing_image_required",
        "Add at least one listing image before publishing.",
      );
    }
    if ((sourceMedia.data || []).length > 50) {
      throw new RequestError(
        422,
        "listing_media_limit",
        "A website listing can publish at most 50 images and floor plans.",
      );
    }

    const assets: Array<JsonRecord> = [];
    try {
      for (const media of (sourceMedia.data || []) as JsonRecord[]) {
        assets.push(
          await copyMediaAsset({
            admin,
            supabaseUrl,
            organisationId,
            websiteSiteId,
            listingId,
            media,
          }),
        );
      }
    } catch (error) {
      await removeNewUploads(admin, assets);
      throw error;
    }

    const registration = await admin.rpc(
      "website_register_listing_media_assets",
      {
        p_listing_id: listingId,
        p_actor_id: userResult.data.user.id,
        p_actor_email: userResult.data.user.email || "",
        p_assets: assets,
      },
    );
    if (registration.error) {
      await removeNewUploads(admin, assets);
      throw registration.error;
    }

    const publicationResult = await admin.rpc(
      "website_commit_listing_publication",
      {
        p_listing_id: listingId,
        p_action: action,
        p_actor_id: userResult.data.user.id,
        p_actor_email: userResult.data.user.email || "",
      },
    );
    if (publicationResult.error) throw publicationResult.error;

    const activePaths = new Set(assets.map((asset) => asset.storage_path));
    const replacedPaths = ((existing.data || []) as JsonRecord[])
      .map((row) => text(row.storage_path))
      .filter((path) => path && !activePaths.has(path));
    const cleanup = await cleanupRetiredAssets({
      admin,
      listingId,
      additionalPaths: replacedPaths,
    });
    const nextStatus = await userClient.rpc(
      "website_get_listing_publication_status",
      { p_listing_id: listingId },
    );
    if (nextStatus.error) throw nextStatus.error;

    return jsonResponse(200, {
      publication: nextStatus.data,
      media: { active: assets.length, ...cleanup },
    });
  } catch (error) {
    const safe = publicError(error);
    return jsonResponse(safe.status, { error: safe.message, code: safe.code });
  }
});
