import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import {
  extensionForWebsiteMedia,
  isAllowedWebsiteMediaContentType,
  isCopyableWebsiteMediaType,
  normalizeWebsiteListingAction,
  normalizedWebsiteMediaContentType,
  parseProjectStorageUrl,
  sha256Hex,
  WEBSITE_LISTING_MEDIA_BUCKET,
  WEBSITE_LISTING_MEDIA_MAX_BYTES,
  WEBSITE_LISTING_MEDIA_MAX_ITEMS,
  websiteListingMediaStoragePath,
  type WebsiteMediaType,
} from "../_shared/websiteListingMedia.ts";

type RecordValue = Record<string, unknown>;
type Client = ReturnType<typeof createClient<any, "public", any>>;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const sourceBuckets = new Set(["documents", "listing-media", "organisation-branding"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function value(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function json(status: number, body: RecordValue) {
  return new Response(JSON.stringify(body), { status, headers });
}

function failure(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

function imageContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", pdf: "application/pdf" } as Record<string, string>)[extension || ""] || "";
}

async function copyMedia(admin: Client, supabaseUrl: string, media: RecordValue, sourceOrganisationId: string, siteId: string, listingId: string) {
  const mediaId = value(media.id);
  const mediaType = value(media.media_type);
  if (!uuid.test(mediaId) || !isCopyableWebsiteMediaType(mediaType)) failure(422, "The listing contains invalid website media.");
  const source = parseProjectStorageUrl(media.file_url, supabaseUrl);
  if (!source || !sourceBuckets.has(source.bucket)) failure(422, "Listing images must be stored in an approved Arch9 storage bucket.");
  const download = await admin.storage.from(source.bucket).download(source.path);
  if (download.error || !download.data) failure(422, "One or more listing images could not be read from storage.");
  const bytes = await download.data.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > WEBSITE_LISTING_MEDIA_MAX_BYTES) failure(422, "A listing image exceeds the website size limit.");
  const contentType = normalizedWebsiteMediaContentType(download.data.type) || imageContentType(source.path);
  if (!isAllowedWebsiteMediaContentType(mediaType as WebsiteMediaType, contentType)) failure(422, "A listing image or floor plan has an unsupported format.");
  const fingerprint = await sha256Hex(bytes);
  const storagePath = websiteListingMediaStoragePath({
    organisationId: sourceOrganisationId,
    websiteSiteId: siteId,
    listingId,
    sourceMediaId: mediaId,
    fingerprint,
    extension: extensionForWebsiteMedia(contentType),
  });
  const upload = await admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET).upload(storagePath, new Uint8Array(bytes), {
    contentType, upsert: false, cacheControl: "31536000",
  });
  const alreadyPresent = Number((upload.error as { statusCode?: number | string } | null)?.statusCode || 0) === 409 || /already exists|duplicate/i.test(value(upload.error?.message));
  if (upload.error && !alreadyPresent) failure(502, "A listing image could not be copied to public website storage.");
  return {
    source_media_id: mediaId,
    storage_path: storagePath,
    public_url: admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl,
    content_type: contentType,
    created: !upload.error,
  };
}

function mediaPaths(media: unknown): string[] {
  return Array.isArray(media) ? media.map((item) => value(item?.storage_path)).filter(Boolean) : [];
}

async function removePaths(admin: Client, paths: string[]) {
  if (!paths.length) return 0;
  const removed = await admin.storage.from(WEBSITE_LISTING_MEDIA_BUCKET).remove([...new Set(paths)]);
  return removed.error ? paths.length : 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const supabaseUrl = value(Deno.env.get("SUPABASE_URL"));
    const anonKey = value(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceKey = value(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !anonKey || !serviceKey) failure(503, "Website publishing is not configured.");
    const token = value(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    if (!token) failure(401, "Sign in before publishing a listing.");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const actor = await admin.auth.getUser(token);
    if (actor.error || !actor.data.user?.id) failure(401, "Your session could not be verified.");
    const body = await request.json().catch(() => ({})) as RecordValue;
    const listingId = value(body.listingId);
    const action = normalizeWebsiteListingAction(body.action);
    if (!uuid.test(listingId) || !action) failure(400, "Choose a saved listing and a valid website action.");

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const statusResult = await userClient.rpc("website_get_partner_listing_status", { p_listing_id: listingId });
    if (statusResult.error) failure(403, statusResult.error.message);
    const status = (statusResult.data || {}) as RecordValue;
    if (status.available !== true || !uuid.test(value(status.websiteSiteId))) failure(403, "Kingdom website publishing is unavailable for this listing.");
    const siteId = value(status.websiteSiteId);
    const existingResult = await admin.from("website_partner_listing_publications")
      .select("media_json,status").eq("website_site_id", siteId).eq("listing_id", listingId).maybeSingle();
    if (existingResult.error) throw existingResult.error;
    const oldPaths = mediaPaths(existingResult.data?.media_json);
    const listingResult = await admin.from("private_listings").select("organisation_id")
      .eq("id", listingId).maybeSingle();
    if (listingResult.error || !listingResult.data?.organisation_id) failure(404, "Listing not found.");

    if (action === "unpublish") {
      const commit = await admin.rpc("website_commit_partner_listing_publication", {
        p_listing_id: listingId, p_website_site_id: siteId, p_action: action,
        p_actor_id: actor.data.user.id, p_actor_email: actor.data.user.email || "", p_assets: [],
      });
      if (commit.error) throw commit.error;
      const mediaCleanupPending = await removePaths(admin, oldPaths);
      const next = await userClient.rpc("website_get_partner_listing_status", { p_listing_id: listingId });
      if (next.error) throw next.error;
      return json(200, { publication: next.data, mediaCleanupPending });
    }

    const blockers = Array.isArray(status.blockers) ? status.blockers.map(value).filter(Boolean) : [];
    if (blockers.length) failure(409, blockers[0]);
    const sourceMedia = await admin.from("listing_media").select("id,media_type,file_url")
      .eq("listing_id", listingId).in("media_type", ["image", "floor_plan"])
      .order("sort_order", { ascending: true });
    if (sourceMedia.error) throw sourceMedia.error;
    if (!sourceMedia.data?.some((media) => media.media_type === "image")) failure(422, "Add at least one listing image before publishing.");
    if (sourceMedia.data.length > WEBSITE_LISTING_MEDIA_MAX_ITEMS) failure(422, "This listing has too many images and floor plans for the website.");
    const assets: Array<Awaited<ReturnType<typeof copyMedia>>> = [];
    let committed = false;
    try {
      for (const media of sourceMedia.data) {
        assets.push(await copyMedia(admin, supabaseUrl, media, value(listingResult.data.organisation_id), siteId, listingId));
      }
      const commit = await admin.rpc("website_commit_partner_listing_publication", {
        p_listing_id: listingId, p_website_site_id: siteId, p_action: action,
        p_actor_id: actor.data.user.id, p_actor_email: actor.data.user.email || "", p_assets: assets,
      });
      if (commit.error) throw commit.error;
      committed = true;
      const activePaths = new Set(assets.map((asset) => asset.storage_path));
      const mediaCleanupPending = await removePaths(admin, oldPaths.filter((path) => !activePaths.has(path)));
      const next = await userClient.rpc("website_get_partner_listing_status", { p_listing_id: listingId });
      if (next.error) throw next.error;
      return json(200, { publication: next.data, mediaCleanupPending });
    } catch (error) {
      if (!committed) await removePaths(admin, assets.filter((asset) => asset.created).map((asset) => asset.storage_path));
      throw error;
    }
  } catch (error) {
    const safe = error as Error & { status?: number };
    return json(safe.status || 500, { error: value(safe.message) || "Website publication failed." });
  }
});
