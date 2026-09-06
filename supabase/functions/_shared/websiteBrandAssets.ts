import { parseProjectStorageUrl, sha256Hex } from "./websiteListingMedia.ts";

export const WEBSITE_BRAND_ASSET_BUCKET = "organisation-branding";
export const WEBSITE_BRAND_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export type WebsiteBrandVariant = "light" | "dark";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export { parseProjectStorageUrl, sha256Hex };

export function normalizedWebsiteBrandContentType(value: unknown): string {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

export function isAllowedWebsiteBrandContentType(value: unknown): boolean {
  return Boolean(
    CONTENT_TYPE_EXTENSIONS[normalizedWebsiteBrandContentType(value)],
  );
}

export function extensionForWebsiteBrandAsset(contentType: unknown): string {
  return CONTENT_TYPE_EXTENSIONS[
    normalizedWebsiteBrandContentType(contentType)
  ] ||
    "bin";
}

export function normalizeWebsiteBrandAction(
  value: unknown,
): "create" | "save" | "reset" | "publish" | "discard" | "" {
  const action = String(value || "").trim().toLowerCase();
  return ["create", "save", "reset", "publish", "discard"].includes(action)
    ? action as "create" | "save" | "reset" | "publish" | "discard"
    : "";
}

export function websiteBrandAssetStoragePath(input: {
  organisationId: string;
  websiteSiteId: string;
  variant: WebsiteBrandVariant;
  fingerprint: string;
  extension: string;
}): string {
  for (const id of [input.organisationId, input.websiteSiteId]) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(id)
    ) {
      throw new Error(
        "Website brand paths require canonical UUID identifiers.",
      );
    }
  }
  if (!/^(light|dark)$/.test(input.variant)) {
    throw new Error("Website brand paths require a light or dark variant.");
  }
  if (!/^[0-9a-f]{64}$/i.test(input.fingerprint)) {
    throw new Error("Website brand paths require a SHA-256 fingerprint.");
  }
  const extension = String(input.extension || "").trim().toLowerCase();
  if (!/^(jpg|png|webp|svg)$/.test(extension)) {
    throw new Error("Website brand paths require a supported image extension.");
  }
  return `organisations/${input.organisationId}/websites/${input.websiteSiteId}/branding/${input.variant}/${input.fingerprint}.${extension}`;
}
