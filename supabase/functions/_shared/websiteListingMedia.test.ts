import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  extensionForWebsiteMedia,
  isAllowedWebsiteMediaContentType,
  normalizeWebsiteListingAction,
  parseProjectStorageUrl,
  prepareWebsiteMediaAssets,
  sha256Hex,
  websiteListingMediaStoragePath,
  websiteMediaCopyIsUnchanged,
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

Deno.test("reuses only matching strong storage validators, sizes and content types", () => {
  const info = {
    etag: '"' + "a".repeat(32) + '"',
    size: 10,
    contentType: "image/png",
  };
  const expected = {
    byteSize: 10,
    contentType: "image/png",
    mediaType: "image" as const,
  };
  assertEquals(websiteMediaCopyIsUnchanged(info, info, expected), true);
  assertEquals(
    websiteMediaCopyIsUnchanged(
      { metadata: { eTag: info.etag, size: 10, mimetype: "image/png" } },
      info,
      expected,
    ),
    true,
  );
  for (
    const changed of [
      null,
      { ...info, etag: "b".repeat(32) },
      { ...info, etag: "" },
      { ...info, etag: `W/${info.etag}` },
      { ...info, size: 11 },
      { ...info, contentType: "image/jpeg" },
    ]
  ) {
    assertEquals(websiteMediaCopyIsUnchanged(changed, info, expected), false);
    assertEquals(websiteMediaCopyIsUnchanged(info, changed, expected), false);
  }
  assertEquals(
    websiteMediaCopyIsUnchanged(info, info, { ...expected, byteSize: 11 }),
    false,
  );
});

Deno.test("prepares 98 photos in bounded batches and retains their display order", async () => {
  const media = Array.from({ length: 98 }, (_, index) => index);
  const assets: number[] = [];
  let running = 0;
  let peak = 0;
  await prepareWebsiteMediaAssets(media, async (index) => {
    peak = Math.max(peak, ++running);
    await new Promise((resolve) =>
      setTimeout(resolve, index % 4 === 0 ? 3 : 1)
    );
    running--;
    return index;
  }, assets);
  assertEquals(peak, 4);
  assertEquals(running, 0);
  assertEquals(assets, media);
});

Deno.test("drains in-flight copies before rejecting so cleanup sees every new upload", async () => {
  const assets: number[] = [];
  const started: number[] = [];
  let finishSlowCopy!: () => void;
  const slowCopy = new Promise<void>((resolve) => {
    finishSlowCopy = resolve;
  });
  let finished = false;
  const preparation = prepareWebsiteMediaAssets(
    [0, 1, 2, 3, 4, 5],
    async (index) => {
      started.push(index);
      if (index === 0) throw new Error("copy failed");
      await slowCopy;
      return index;
    },
    assets,
  ).finally(() => {
    finished = true;
  });
  await Promise.resolve();
  assertEquals(finished, false);
  finishSlowCopy();
  await assertRejects(() => preparation, Error, "copy failed");
  assertEquals(started, [0, 1, 2, 3]);
  assertEquals(assets.filter(() => true), [1, 2, 3]);
});
