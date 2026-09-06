export const WEBSITE_LISTING_MEDIA_BUCKET = "listing-media";
export const WEBSITE_LISTING_MEDIA_MAX_BYTES = 15 * 1024 * 1024;

export type WebsiteListingAction = "publish" | "update" | "unpublish";
export type WebsiteMediaType = "image" | "floor_plan";

export type ParsedStorageUrl = {
  access: "authenticated" | "public" | "sign";
  bucket: string;
  path: string;
};

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

export function normalizeWebsiteListingAction(
  value: unknown,
): WebsiteListingAction | "" {
  const action = String(value || "").trim().toLowerCase();
  return action === "publish" || action === "update" || action === "unpublish"
    ? action
    : "";
}

export function isCopyableWebsiteMediaType(
  value: unknown,
): value is WebsiteMediaType {
  return value === "image" || value === "floor_plan";
}

export function parseProjectStorageUrl(
  rawUrl: unknown,
  supabaseUrl: string,
): ParsedStorageUrl | null {
  try {
    const value = String(rawUrl || "").trim();
    if (!value || !supabaseUrl) return null;
    const source = new URL(value);
    const project = new URL(supabaseUrl);
    if (source.protocol !== "https:" || source.origin !== project.origin) {
      return null;
    }

    const match = source.pathname.match(
      /^\/storage\/v1\/object\/(authenticated|public|sign)\/([^/]+)\/(.+)$/i,
    );
    if (!match) return null;
    const path = match[3].split("/").map((segment) =>
      decodeURIComponent(segment)
    ).join("/");
    if (
      !path || path.includes("\0") ||
      path.split("/").some((segment) =>
        !segment || segment === "." || segment === ".."
      )
    ) return null;

    return {
      access: match[1].toLowerCase() as ParsedStorageUrl["access"],
      bucket: decodeURIComponent(match[2]),
      path,
    };
  } catch {
    return null;
  }
}

export function normalizedWebsiteMediaContentType(value: unknown): string {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

export function isAllowedWebsiteMediaContentType(
  mediaType: WebsiteMediaType,
  contentType: string,
): boolean {
  const normalized = normalizedWebsiteMediaContentType(contentType);
  if (
    normalized.startsWith("image/") &&
    Boolean(CONTENT_TYPE_EXTENSIONS[normalized])
  ) return true;
  return mediaType === "floor_plan" && normalized === "application/pdf";
}

export function extensionForWebsiteMedia(contentType: string): string {
  return CONTENT_TYPE_EXTENSIONS[
    normalizedWebsiteMediaContentType(contentType)
  ] || "bin";
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export function websiteListingMediaStoragePath(input: {
  organisationId: string;
  websiteSiteId: string;
  listingId: string;
  sourceMediaId: string;
  fingerprint: string;
  extension: string;
}): string {
  const ids = [
    input.organisationId,
    input.websiteSiteId,
    input.listingId,
    input.sourceMediaId,
  ];
  if (
    ids.some((value) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
  ) {
    throw new Error("Website media paths require canonical UUID identifiers.");
  }
  if (!/^[0-9a-f]{64}$/i.test(input.fingerprint)) {
    throw new Error("Website media paths require a SHA-256 fingerprint.");
  }
  const extension = String(input.extension || "").trim().toLowerCase();
  if (!/^[a-z0-9]{2,5}$/.test(extension)) {
    throw new Error("Website media paths require a safe extension.");
  }
  return `organisations/${input.organisationId}/websites/${input.websiteSiteId}/listings/${input.listingId}/${input.sourceMediaId}/${input.fingerprint}.${extension}`;
}
