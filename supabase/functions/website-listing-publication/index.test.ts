import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  sha256Hex,
  websiteListingMediaStoragePath,
} from "../_shared/websiteListingMedia.ts";

// Import the actual copy implementation without starting an HTTP server.
const originalServe = Deno.serve;
let copyMediaAsset: typeof import("./index.ts").copyMediaAsset;
try {
  Deno.serve = (() => ({})) as unknown as typeof Deno.serve;
  ({ copyMediaAsset } = await import("./index.ts"));
} finally {
  Deno.serve = originalServe;
}

const organisationId = "11111111-1111-4111-8111-111111111111";
const websiteSiteId = "22222222-2222-4222-8222-222222222222";
const listingId = "33333333-3333-4333-8333-333333333333";
const sourceMediaId = "44444444-4444-4444-8444-444444444444";
const supabaseUrl = "https://abcdefghijklmnopqrst.supabase.co";
const sourcePath = `private-listings/${listingId}/photo.png`;
const fingerprint = "a".repeat(64);
const storagePath = websiteListingMediaStoragePath({
  organisationId,
  websiteSiteId,
  listingId,
  sourceMediaId,
  fingerprint,
  extension: "png",
});

function fixture() {
  const calls = { info: 0, download: 0, upload: 0 };
  const info = {
    etag: '"' + "b".repeat(32) + '"',
    size: 5,
    contentType: "image/png",
  };
  const state = {
    source: info as typeof info | null,
    destination: info as typeof info | null,
  };
  const input = {
    organisationId,
    websiteSiteId,
    listingId,
    supabaseUrl,
    media: {
      id: sourceMediaId,
      media_type: "image",
      file_url:
        `${supabaseUrl}/storage/v1/object/sign/documents/${sourcePath}?token=changed`,
    },
    existingAsset: {
      source_media_id: sourceMediaId,
      source_bucket: "documents",
      source_path: sourcePath,
      source_fingerprint: fingerprint,
      storage_path: storagePath,
      status: "active",
      content_type: "image/png",
      byte_size: 5,
    },
    admin: {
      storage: {
        from: (bucket: string) => ({
          info: () => {
            calls.info++;
            return Promise.resolve({
              data: bucket === "documents" ? state.source : state.destination,
              error: null,
            });
          },
          download: () => {
            calls.download++;
            return Promise.resolve({
              data: new Blob(["photo"], { type: "image/png" }),
              error: null,
            });
          },
          upload: () => {
            calls.upload++;
            return Promise.resolve({ error: null });
          },
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl:
                `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`,
            },
          }),
        }),
      },
    } as unknown as Parameters<typeof copyMediaAsset>[0]["admin"],
  };
  return { input, calls, state };
}

Deno.test("unchanged photos reuse the verified website copy without transferring image bytes", async () => {
  const { input, calls } = fixture();
  const asset = await copyMediaAsset(input);
  assertEquals(calls, { info: 2, download: 0, upload: 0 });
  assertEquals(asset.storage_path, storagePath);
  assertEquals(asset.created, false);
  assertEquals(asset.source_path, sourcePath);
});

Deno.test("changed content at the same source path is hashed and copied again", async () => {
  const { input, calls, state } = fixture();
  state.source = { ...state.source!, etag: "c".repeat(32) };
  const asset = await copyMediaAsset(input);
  assertEquals(calls, { info: 2, download: 1, upload: 1 });
  assertEquals(
    asset.source_fingerprint,
    await sha256Hex(new TextEncoder().encode("photo").buffer),
  );
  assertEquals(asset.created, true);
});

Deno.test("missing website copies are repaired rather than falsely reused", async () => {
  const { input, calls, state } = fixture();
  state.destination = null;
  assertEquals((await copyMediaAsset(input)).created, true);
  assertEquals(calls.download, 1);
  assertEquals(calls.upload, 1);
});

Deno.test("retired assets and copies belonging to another tenant are never reused", async () => {
  for (
    const modification of [{ status: "retired" }, {
      storage_path: storagePath.replace(organisationId, sourceMediaId),
    }, { source_path: "another-photo.png" }]
  ) {
    const { input, calls } = fixture();
    Object.assign(input.existingAsset, modification);
    assertEquals((await copyMediaAsset(input)).created, true);
    assertEquals(calls, { info: 0, download: 1, upload: 1 });
  }
});

Deno.test("reuse does not bypass the approved-project storage source check", async () => {
  const { input, calls } = fixture();
  input.media.file_url = input.media.file_url.replace(
    supabaseUrl,
    "https://another-project.supabase.co",
  );
  await assertRejects(() => copyMediaAsset(input), Error, "approved bucket");
  assertEquals(calls, { info: 0, download: 0, upload: 0 });
});
