import assert from "node:assert/strict";
import {
  addVisualMapAssets,
  auditDevelopmentVisualMap,
  classifyVisualAsset,
  getPublishedVisualMap,
  resolveDevelopmentVisualMap,
  setVisualMapPublicationStatus,
  updateVisualMapAsset,
} from "../developmentVisualMap.js";

const inventory = [
  {
    id: "unit-a-101",
    unitNumber: "A101",
    block: "Block A",
    phase: "Phase 1",
    floor: "1",
    unitType: "Type B",
  },
];

assert.deepEqual(
  classifyVisualAsset({ name: "Block A exterior render.jpg" }, inventory),
  { type: "exterior", association: { type: "block", id: "Block A" } },
);
assert.deepEqual(
  classifyVisualAsset({ name: "A101 floor plan.png" }, inventory),
  {
    type: "floor_plan",
    association: { type: "unit", id: "unit-a-101" },
  },
);

const base = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "masterplan",
    scenes: [
      {
        id: "masterplan",
        type: "masterplan",
        name: "Masterplan",
        background: { url: "https://example.test/site.jpg" },
      },
    ],
  },
});
const uploaded = addVisualMapAssets(
  base,
  [
    {
      name: "Block A exterior render.jpg",
      fileUrl: "https://example.test/block-a.jpg",
      uploadedAt: "2026-09-05T12:00:00.000Z",
    },
  ],
  inventory,
);
assert.equal(uploaded.assets.length, 1);
assert.equal(uploaded.assets[0].status, "draft");
assert.equal(uploaded.assets[0].processingState, "ready");
assert.equal(
  addVisualMapAssets(uploaded, [uploaded.assets[0]], inventory).assets.length,
  1,
);

const approved = updateVisualMapAsset(uploaded, uploaded.assets[0].id, {
  status: "approved",
});
const published = setVisualMapPublicationStatus(approved, "published");
assert.equal(published.publishedSnapshot.assets.length, 1);
assert.equal(getPublishedVisualMap(published).assets.length, 1);

const failed = addVisualMapAssets(base, [
  {
    name: "broken aerial.jpg",
    processingState: "failed",
    error: "Upload failed",
  },
]);
assert.equal(
  auditDevelopmentVisualMap(failed, []).errors.some(
    (issue) => issue.code === "unavailable-visual-asset",
  ),
  true,
);

console.log("development visual asset Phase 8 checks passed");
