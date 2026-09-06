import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  extensionForWebsiteBrandAsset,
  isAllowedWebsiteBrandContentType,
  normalizeWebsiteBrandAction,
  websiteBrandAssetStoragePath,
} from "./websiteBrandAssets.ts";

const organisationId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";

Deno.test("normalizes only supported website brand actions", () => {
  assertEquals(normalizeWebsiteBrandAction(" Save "), "save");
  assertEquals(normalizeWebsiteBrandAction("PUBLISH"), "publish");
  assertEquals(normalizeWebsiteBrandAction("delete"), "");
});

Deno.test("allows only supported website logo types", () => {
  assertEquals(isAllowedWebsiteBrandContentType("image/png"), true);
  assertEquals(isAllowedWebsiteBrandContentType("image/svg+xml"), true);
  assertEquals(isAllowedWebsiteBrandContentType("image/gif"), false);
  assertEquals(isAllowedWebsiteBrandContentType("text/html"), false);
  assertEquals(extensionForWebsiteBrandAsset("image/jpeg"), "jpg");
});

Deno.test("creates immutable website-owned brand paths", () => {
  const fingerprint = "b".repeat(64);
  assertEquals(
    websiteBrandAssetStoragePath({
      organisationId,
      websiteSiteId: siteId,
      variant: "dark",
      fingerprint,
      extension: "svg",
    }),
    `organisations/${organisationId}/websites/${siteId}/branding/dark/${fingerprint}.svg`,
  );
});

Deno.test("rejects unsafe website brand paths", async () => {
  await assertRejects(
    async () =>
      websiteBrandAssetStoragePath({
        organisationId: "../another-tenant",
        websiteSiteId: siteId,
        variant: "light",
        fingerprint: "b".repeat(64),
        extension: "png",
      }),
    Error,
    "canonical UUID",
  );
});
