import assert from "node:assert/strict";
import {
  buildDevelopmentVisualPreviewReadiness,
  buildVisualPreviewScenario,
  compareVisualMapDraftToPublished,
  getVisualPreviewJourneyKinds,
  rollbackVisualMapToPublishedSnapshot,
  validateVisualMapAssetLoading,
} from "../developmentVisualPreview.js";
import {
  resolveDevelopmentVisualMap,
  setVisualMapPublicationStatus,
  updateVisualMapScene,
} from "../developmentVisualMap.js";

const inventory = [
  { id: "101", unitNumber: "101", block: "Block A", status: "Available" },
  { id: "102", unitNumber: "102", block: "Block B", status: "Available" },
];
const unitHotspot = (id) => ({
  id: `unit:${id}`,
  type: "unit",
  target: { type: "unit", id },
  destination: { type: "unit", unitId: id },
  geometry: { type: "point", coordinates: [50, 50] },
  label: { text: `Residence ${id}` },
});
const map = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "site",
    scenes: [
      {
        id: "site",
        name: "Site plan",
        type: "masterplan",
        background: { url: "site.jpg", width: 2000, height: 1200 },
        hotspots: [unitHotspot("101")],
      },
    ],
  },
});

const ready = buildDevelopmentVisualPreviewReadiness({
  visualMap: map,
  inventory,
});
assert.equal(ready.safeToPublish, true);
assert.notEqual(ready.decision, "blocked");

const partial = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "site",
    scenes: [
      {
        id: "site",
        name: "Site plan",
        type: "masterplan",
        background: { url: "site.jpg" },
      },
    ],
  },
});
const partialReadiness = buildDevelopmentVisualPreviewReadiness({
  visualMap: partial,
  inventory,
});
assert.equal(partialReadiness.safeToPublish, true);
assert.equal(partialReadiness.decision, "safe_with_fallbacks");

const broken = resolveDevelopmentVisualMap({
  visualMap: {
    ...map,
    scenes: [
      {
        ...map.scenes[0],
        hotspots: [
          {
            ...map.scenes[0].hotspots[0],
            type: "building",
            target: { type: "building", id: "missing" },
            destination: { type: "scene", sceneId: "missing" },
          },
        ],
      },
    ],
  },
});
assert.equal(
  buildDevelopmentVisualPreviewReadiness({ visualMap: broken, inventory })
    .safeToPublish,
  false,
);

const published = setVisualMapPublicationStatus(map, "published");
const edited = updateVisualMapScene(published, "site", {
  name: "Updated site plan",
});
assert.equal(compareVisualMapDraftToPublished(edited).changed, true);
const restored = rollbackVisualMapToPublishedSnapshot(edited);
assert.equal(restored.scenes[0].name, "Site plan");
assert.equal(restored.publicationStatus, "draft");
assert.ok(restored.publishedSnapshot);

assert.equal(
  buildVisualPreviewScenario(map, inventory, "missing_asset").visualMap
    .scenes[0].background.url,
  "",
);
assert.deepEqual(
  buildVisualPreviewScenario(map, inventory, "failed_image").failedSceneIds,
  ["site"],
);
assert.deepEqual(
  buildVisualPreviewScenario(map, inventory, "sold_reserved").inventory.map(
    (unit) => unit.status,
  ),
  ["Sold", "Reserved"],
);

const loading = await validateVisualMapAssetLoading(
  map,
  async (url) => url !== "site.jpg",
);
assert.equal(loading.ready, false);
assert.deepEqual(loading.failedUrls, ["site.jpg"]);
assert.equal(getVisualPreviewJourneyKinds(map).singleHome, true);

const multiBlock = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "site",
    scenes: [
      map.scenes[0],
      {
        id: "a",
        name: "Block A",
        type: "building",
        background: { url: "a.jpg" },
      },
      {
        id: "b",
        name: "Block B",
        type: "building",
        background: { url: "b.jpg" },
      },
    ],
  },
});
assert.equal(getVisualPreviewJourneyKinds(multiBlock).multiBlock, true);

console.log("development visual preview Phase 12 publication controls passed");
