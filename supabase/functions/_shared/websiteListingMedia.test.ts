import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  extensionForWebsiteMedia,
  isAllowedWebsiteMediaContentType,
  normalizeWebsiteListingAction,
  parseProjectStorageUrl,
  sha256Hex,
  websiteListingMediaStoragePath,
} from "./websiteListingMedia.ts";

const projectUrl = "https://abcdefghijklmnopqrst.supabase.co";
const organisationId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";
const listingId = "33333333-3333-4333-8333-333333333333";
const mediaId = "44444444-4444-4444-8444-444444444444";

Deno.test("normalizes only supported listing actions", () => {
  assertEquals(normalizeWebsiteListingAction(" Publish "), "publish");
  assertEquals(normalizeWebsiteListingAction("UPDATE"), "update");
  assertEquals(normalizeWebsiteListingAction("delete"), "");
});

Deno.test("parses only storage URLs owned by the configured project", () => {
  assertEquals(
    parseProjectStorageUrl(
      `${projectUrl}/storage/v1/object/sign/documents/private-listings/${listingId}/photo%201.png?token=secret`,
      projectUrl,
    ),
    {
      access: "sign",
      bucket: "documents",
      path: `private-listings/${listingId}/photo 1.png`,
    },
  );
  assertEquals(
    parseProjectStorageUrl(
      `https://another-project.supabase.co/storage/v1/object/public/listing-media/photo.png`,
      projectUrl,
    ),
    null,
  );
  assertEquals(
    parseProjectStorageUrl("https://example.com/photo.png", projectUrl),
    null,
  );
});

Deno.test("allows public image types and PDF floor plans only", () => {
  assertEquals(
    isAllowedWebsiteMediaContentType("image", "image/jpeg; charset=binary"),
    true,
  );
  assertEquals(
    isAllowedWebsiteMediaContentType("image", "application/pdf"),
    false,
  );
  assertEquals(
    isAllowedWebsiteMediaContentType("floor_plan", "application/pdf"),
    true,
  );
  assertEquals(
    isAllowedWebsiteMediaContentType("image", "image/svg+xml"),
    false,
  );
  assertEquals(extensionForWebsiteMedia("image/jpeg"), "jpg");
});

Deno.test("creates immutable tenant-scoped content-addressed paths", () => {
  const fingerprint = "a".repeat(64);
  assertEquals(
    websiteListingMediaStoragePath({
      organisationId,
      websiteSiteId: siteId,
      listingId,
      sourceMediaId: mediaId,
      fingerprint,
      extension: "png",
    }),
    `organisations/${organisationId}/websites/${siteId}/listings/${listingId}/${mediaId}/${fingerprint}.png`,
  );
});

Deno.test("hashes content deterministically", async () => {
  const bytes = new TextEncoder().encode("kingstons-listing-photo").buffer;
  assertEquals(
    await sha256Hex(bytes),
    "524d3cd608be6eabdabd32453624714c261a870de606ac74c395f7b7f1d06078",
  );
});

Deno.test("rejects unsafe path identifiers", async () => {
  await assertRejects(
    async () =>
      websiteListingMediaStoragePath({
        organisationId: "../other-tenant",
        websiteSiteId: siteId,
        listingId,
        sourceMediaId: mediaId,
        fingerprint: "a".repeat(64),
        extension: "png",
      }),
    Error,
    "canonical UUID",
  );
});
