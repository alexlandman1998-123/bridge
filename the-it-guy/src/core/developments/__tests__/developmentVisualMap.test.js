import assert from "node:assert/strict";
import {
  DEVELOPMENT_VISUAL_MAP_SCHEMA_VERSION,
  addVisualMapAssets,
  addVisualMapChildScene,
  auditDevelopmentVisualMap,
  classifyVisualAsset,
  getVisualMapScene,
  getVisualMapSceneBreadcrumbs,
  getVisualMapSceneUnitIds,
  getVisualHotspotSceneId,
  getPublishedVisualMap,
  findVisualMapHotspotIssues,
  hydrateVisualMapMediaLibrary,
  projectVisualMapScene,
  remapVisualMapSceneViewport,
  replaceVisualMapSceneHotspots,
  removeVisualMapScene,
  removeVisualMapAsset,
  resolveVisualHotspotDestination,
  resolveDevelopmentVisualMap,
  retireLegacyVisualMapFields,
  setVisualMapPublicationStatus,
  updateVisualMapScene,
  updateVisualMapHotspotDestination,
  updateVisualMapAsset,
  updateMasterplanScene,
} from "../developmentVisualMap.js";

const legacy = {
  sitePlanUrl: "https://example.test/masterplan.jpg",
  sitePlanMap: { unitA: { x: 25, y: 40 }, unitB: { x: 70, y: 65 } },
  sitePlanViewport: { x: 5, y: 10, width: 80, height: 70 },
  sitePlanNotShownUnitIds: ["unitB"],
};

const migrated = resolveDevelopmentVisualMap(legacy);
assert.equal(migrated.schemaVersion, DEVELOPMENT_VISUAL_MAP_SCHEMA_VERSION);
assert.equal(migrated.scenes.length, 1);
assert.equal(migrated.scenes[0].background.url, legacy.sitePlanUrl);
assert.equal(migrated.scenes[0].hotspots.length, 2);
assert.equal(migrated.scenes[0].hotspots[1].visibility, "hidden");
assert.deepEqual(projectVisualMapScene(migrated), legacy);

assert.deepEqual(
  classifyVisualAsset({ name: "Block A Exterior Render.jpg" }, [
    { id: "101", block: "Block A" },
  ]),
  { type: "exterior", association: { type: "block", id: "Block A" } },
);
const withAssets = addVisualMapAssets(
  migrated,
  [
    {
      name: "Block A Exterior Render.jpg",
      fileUrl: "https://example.test/block-a.jpg",
    },
  ],
  [{ id: "101", block: "Block A" }],
);
assert.equal(withAssets.assets.length, 1);
assert.equal(withAssets.assets[0].type, "exterior");
assert.deepEqual(withAssets.assets[0].association, {
  type: "block",
  id: "Block A",
});
assert.equal(
  addVisualMapAssets(withAssets, [withAssets.assets[0]]).assets.length,
  1,
);
const approvedAssetMap = updateVisualMapAsset(
  withAssets,
  withAssets.assets[0].id,
  { status: "approved" },
);
assert.equal(approvedAssetMap.assets[0].status, "approved");
assert.equal(
  setVisualMapPublicationStatus(approvedAssetMap, "published").publishedSnapshot
    .assets.length,
  1,
);
assert.equal(
  removeVisualMapAsset(approvedAssetMap, approvedAssetMap.assets[0].id).assets
    .length,
  0,
);

const multiStorey = resolveDevelopmentVisualMap({
  visualMap: {
    revision: 7,
    defaultSceneId: "estate",
    scenes: [
      {
        id: "estate",
        type: "masterplan",
        background: { url: "estate.jpg" },
        hotspots: [
          {
            id: "building:a",
            type: "building",
            target: { type: "building", id: "a" },
            childSceneId: "building-a-floor-1",
            geometry: {
              type: "polygon",
              coordinates: [
                [10, 10],
                [40, 10],
                [40, 40],
                [10, 40],
              ],
            },
          },
        ],
      },
      {
        id: "building-a-floor-1",
        type: "floor_plan",
        parentSceneId: "estate",
        parentHotspotId: "building:a",
        background: { url: "floor-1.svg" },
        hotspots: [
          {
            id: "unit:101",
            type: "unit",
            target: { type: "unit", id: "101" },
            geometry: {
              type: "polygon",
              coordinates: [
                [5, 5],
                [20, 5],
                [20, 20],
                [5, 20],
              ],
            },
          },
        ],
      },
    ],
  },
});
assert.equal(multiStorey.revision, 7);
assert.equal(
  getVisualMapScene(multiStorey, "building-a-floor-1").parentSceneId,
  "estate",
);
assert.equal(
  getVisualHotspotSceneId(getVisualMapScene(multiStorey).hotspots[0]),
  "building-a-floor-1",
);
assert.equal(
  getVisualMapScene(multiStorey).hotspots[0].destination.type,
  "scene",
);
assert.equal(
  Object.hasOwn(getVisualMapScene(multiStorey).hotspots[0], "childSceneId"),
  false,
);
assert.deepEqual(
  getVisualMapSceneBreadcrumbs(multiStorey, "building-a-floor-1").map(
    (scene) => scene.id,
  ),
  ["estate", "building-a-floor-1"],
);
assert.deepEqual(getVisualMapSceneUnitIds(multiStorey, "estate"), ["101"]);
assert.deepEqual(
  getVisualMapSceneUnitIds(multiStorey, "estate", { descendants: false }),
  [],
);

const withChild = addVisualMapChildScene(migrated, "masterplan", {
  name: "Block A",
  type: "building",
  background: { url: "block-a.jpg" },
});
assert.equal(withChild.scenes.length, 2);
assert.equal(
  getVisualHotspotSceneId(getVisualMapScene(withChild).hotspots.at(-1)),
  "block-a",
);
assert.equal(
  getVisualMapScene(withChild, "block-a").parentSceneId,
  "masterplan",
);
const renamedChild = updateVisualMapScene(withChild, "block-a", {
  name: "Block Alpha",
});
assert.equal(getVisualMapScene(renamedChild, "block-a").name, "Block Alpha");
assert.equal(removeVisualMapScene(renamedChild, "block-a").scenes.length, 1);
const healthyAudit = auditDevelopmentVisualMap(multiStorey, [{ id: "101" }]);
assert.equal(healthyAudit.ready, true);
assert.equal(healthyAudit.coveragePercent, 100);
const brokenHierarchy = {
  ...multiStorey,
  scenes: multiStorey.scenes.map((scene) =>
    scene.id === "estate"
      ? {
          ...scene,
          hotspots: [
            {
              ...scene.hotspots[0],
              destination: { type: "scene", sceneId: "missing" },
            },
          ],
        }
      : scene,
  ),
};
const brokenAudit = auditDevelopmentVisualMap(brokenHierarchy, [
  { id: "101" },
  { id: "102" },
]);
assert.equal(brokenAudit.ready, false);
assert.ok(
  brokenAudit.errors.some((issue) => issue.code === "missing-child-scene"),
);
assert.ok(
  brokenAudit.errors.some((issue) => issue.code === "unreachable-scene"),
);
assert.equal(
  brokenAudit.warnings.some((issue) => issue.code === "unmapped-inventory"),
  true,
);

const canonicalWins = hydrateVisualMapMediaLibrary({
  ...legacy,
  visualMap: multiStorey,
});
assert.equal(canonicalWins.sitePlanUrl, "estate.jpg");
assert.deepEqual(canonicalWins.sitePlanMap, {});

const updated = updateMasterplanScene(migrated, {
  sitePlanMap: { unitA: { x: 50, y: 55 } },
});
assert.equal(updated.revision, 2);
assert.deepEqual(projectVisualMapScene(updated).sitePlanMap, {
  unitA: { x: 50, y: 55 },
});

const richSceneUpdated = updateMasterplanScene(multiStorey, {
  sitePlanUrl: "estate-v2.jpg",
});
assert.equal(
  getVisualMapScene(richSceneUpdated).background.url,
  "estate-v2.jpg",
);
assert.equal(
  getVisualMapScene(richSceneUpdated).hotspots[0].geometry.type,
  "polygon",
);
assert.equal(
  getVisualHotspotSceneId(getVisualMapScene(richSceneUpdated).hotspots[0]),
  "building-a-floor-1",
);
assert.deepEqual(
  resolveVisualHotspotDestination(
    multiStorey,
    getVisualMapScene(multiStorey).hotspots[0],
    [{ id: "101" }],
  ),
  { type: "scene", sceneId: "building-a-floor-1" },
);
assert.deepEqual(
  resolveVisualHotspotDestination(
    multiStorey,
    getVisualMapScene(multiStorey, "building-a-floor-1").hotspots[0],
    [{ id: "101" }],
  ),
  { type: "unit", unitId: "101" },
);
const filteredJourney = updateVisualMapHotspotDestination(
  multiStorey,
  "estate",
  getVisualMapScene(multiStorey).hotspots[0].id,
  { type: "inventory_filter", filters: { block: "Block A" } },
);
assert.deepEqual(getVisualMapScene(filteredJourney).hotspots[0].destination, {
  type: "inventory_filter",
  filters: { block: "Block A" },
});
assert.deepEqual(
  resolveVisualHotspotDestination(
    filteredJourney,
    getVisualMapScene(filteredJourney).hotspots[0],
    [{ id: "101" }],
  ),
  { type: "inventory_filter", filters: { block: "Block A" } },
);
const floorProjection = projectVisualMapScene(
  multiStorey,
  "building-a-floor-1",
);
assert.deepEqual(floorProjection.sitePlanMap["101"], { x: 12.5, y: 12.5 });
const replaced = replaceVisualMapSceneHotspots(migrated, "masterplan", [
  migrated.scenes[0].hotspots[0],
  { ...migrated.scenes[0].hotspots[0], id: "unit:unitA:duplicate" },
]);
assert.equal(findVisualMapHotspotIssues(replaced).length, 2);
const cropped = remapVisualMapSceneViewport(multiStorey, "building-a-floor-1", {
  x: 5,
  y: 5,
  width: 50,
  height: 50,
});
assert.deepEqual(
  getVisualMapScene(cropped, "building-a-floor-1").hotspots[0].geometry
    .coordinates[0],
  [0, 0],
);
const published = setVisualMapPublicationStatus(richSceneUpdated, "published");
assert.equal(published.publicationStatus, "published");
assert.equal(published.revision, richSceneUpdated.revision + 1);
assert.equal(
  published.publishedSnapshot.scenes[0].background.url,
  "estate-v2.jpg",
);
const draftAfterPublish = updateMasterplanScene(published, {
  sitePlanUrl: "estate-v3-draft.jpg",
});
assert.equal(draftAfterPublish.publicationStatus, "draft");
assert.equal(
  getVisualMapScene(getPublishedVisualMap(draftAfterPublish)).background.url,
  "estate-v2.jpg",
);
assert.equal(
  hydrateVisualMapMediaLibrary(
    { visualMap: draftAfterPublish },
    { preferPublished: true },
  ).sitePlanUrl,
  "estate-v2.jpg",
);

const persisted = retireLegacyVisualMapFields({
  ...legacy,
  visual_map: multiStorey,
  galleryImageUrls: "gallery.jpg",
});
assert.equal(persisted.galleryImageUrls, "gallery.jpg");
assert.ok(persisted.visualMap);
for (const key of [
  "sitePlanUrl",
  "sitePlanMap",
  "sitePlanViewport",
  "sitePlanNotShownUnitIds",
  "masterplanUrl",
  "visual_map",
]) {
  assert.equal(
    Object.hasOwn(persisted, key),
    false,
    `${key} must not remain writable`,
  );
}

console.log("development visual map canonical contract checks passed");
