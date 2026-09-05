import assert from "node:assert/strict";
import {
  getLikelyNextVisualScene,
  getPreferredVisualSceneImage,
  getVisualOrientation,
  getVisualSceneFloorTabs,
  getVisualSceneImageCandidates,
  getVisualScenePrompt,
} from "../developmentVisualExperience.js";
import { resolveDevelopmentVisualMap } from "../developmentVisualMap.js";

const map = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "site",
    scenes: [
      {
        id: "site",
        name: "Site plan",
        type: "masterplan",
        orientationDegrees: 28,
        background: {
          url: "site.jpg",
          sources: { webp: "site.webp", avif: "site.avif" },
        },
        hotspots: [
          {
            id: "block-a",
            type: "building",
            target: { type: "building", id: "A" },
            destination: { type: "scene", sceneId: "floor-1" },
            geometry: { type: "point", coordinates: [20, 20] },
            label: { text: "Block A" },
          },
          {
            id: "block-b",
            type: "building",
            target: { type: "building", id: "B" },
            destination: { type: "scene", sceneId: "floor-2" },
            geometry: { type: "point", coordinates: [70, 20] },
            label: { text: "Block B" },
          },
        ],
      },
      {
        id: "floor-1",
        name: "Floor 1",
        type: "floor_plan",
        parentSceneId: "site",
        background: { url: "floor-1.jpg" },
      },
      {
        id: "floor-2",
        name: "Floor 2",
        type: "floor_plan",
        parentSceneId: "site",
        background: { url: "floor-2.jpg" },
      },
    ],
  },
});

assert.equal(getLikelyNextVisualScene(map, "site").id, "floor-1");
assert.deepEqual(
  getVisualSceneFloorTabs(map, "floor-1").map((scene) => scene.id),
  ["floor-1", "floor-2"],
);
assert.equal(
  getVisualScenePrompt(map.scenes[0], 2),
  "Select a building or home to explore",
);
assert.deepEqual(getVisualOrientation(map.scenes[0]), {
  degrees: 28,
  label: "North rotated 28 degrees",
});
assert.deepEqual(getVisualSceneImageCandidates(map.scenes[0]), {
  avif: "site.avif",
  webp: "site.webp",
  fallback: "site.jpg",
});
assert.equal(
  getPreferredVisualSceneImage(map.scenes[0], { avif: true, webp: true }),
  "site.avif",
);
assert.equal(
  getPreferredVisualSceneImage(map.scenes[0], { webp: true }),
  "site.webp",
);
assert.equal(getPreferredVisualSceneImage(map.scenes[0]), "site.jpg");

console.log("development visual buyer experience Phase 13 checks passed");
