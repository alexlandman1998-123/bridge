import assert from "node:assert/strict";
import {
  getVisualMapScene,
  resolveDevelopmentVisualMap,
} from "../developmentVisualMap.js";
import {
  applyDevelopmentVisualSuggestion,
  buildDevelopmentVisualSuggestions,
} from "../developmentVisualSuggestions.js";

const inventory = [
  {
    id: "101",
    unitNumber: "A101",
    block: "Block A",
    floor: "1",
    unitType: "Two bed",
  },
  {
    id: "102",
    unitNumber: "A102",
    block: "Block A",
    floor: "1",
    unitType: "One bed",
  },
  {
    id: "201",
    unitNumber: "A201",
    block: "Block A",
    floor: "2",
    unitType: "Two bed",
  },
  {
    id: "202",
    unitNumber: "A202",
    block: "Block A",
    floor: "2",
    unitType: "One bed",
  },
];

const map = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "masterplan",
    assets: [
      {
        id: "two-bed-plan",
        name: "Two bed plan",
        url: "two-bed.jpg",
        type: "floor_plan",
        association: { type: "unit_type", id: "Two bed" },
        status: "approved",
        processingState: "ready",
      },
    ],
    scenes: [
      {
        id: "masterplan",
        name: "Masterplan",
        type: "masterplan",
        background: { url: "site.jpg" },
      },
      {
        id: "elevation",
        name: "Block A elevation",
        type: "elevation",
        parentSceneId: "masterplan",
        background: { url: "elevation.jpg" },
      },
      {
        id: "floor-1",
        name: "Floor 1",
        type: "floor_plan",
        parentSceneId: "elevation",
        background: { url: "floor-1.jpg" },
        hotspots: [
          {
            id: "unit:101",
            type: "unit",
            target: { type: "unit", id: "101" },
            geometry: {
              type: "polygon",
              coordinates: [
                [5, 5],
                [45, 5],
                [45, 45],
                [5, 45],
              ],
            },
          },
          {
            id: "unit:102",
            type: "unit",
            target: { type: "unit", id: "102" },
            geometry: {
              type: "polygon",
              coordinates: [
                [55, 5],
                [95, 5],
                [95, 45],
                [55, 45],
              ],
            },
          },
        ],
      },
      {
        id: "floor-2",
        name: "Floor 2",
        type: "floor_plan",
        parentSceneId: "elevation",
        background: { url: "floor-2.jpg" },
      },
    ],
  },
});

const suggestions = buildDevelopmentVisualSuggestions({
  visualMap: map,
  inventory,
});
assert.equal(
  suggestions.some((item) => item.type === "elevation_grid"),
  true,
);
assert.equal(
  suggestions.some((item) => item.type === "copy_floor"),
  true,
);
assert.equal(
  suggestions.some((item) => item.type === "unit_type_floorplan"),
  true,
);
assert.equal(
  suggestions.some((item) => item.type === "likely_next"),
  true,
);

const elevationSuggestion = suggestions.find(
  (item) => item.type === "elevation_grid",
);
const withRows = applyDevelopmentVisualSuggestion(
  map,
  elevationSuggestion,
  inventory,
);
assert.equal(getVisualMapScene(withRows, "elevation").hotspots.length, 2);
assert.equal(
  getVisualMapScene(withRows, "elevation").hotspots[0].geometry.type,
  "polygon",
);

const copySuggestion = suggestions.find((item) => item.type === "copy_floor");
const copied = applyDevelopmentVisualSuggestion(map, copySuggestion, inventory);
assert.deepEqual(
  getVisualMapScene(copied, "floor-2").hotspots.map((item) => item.target.id),
  ["201", "202"],
);
const mirrored = applyDevelopmentVisualSuggestion(
  map,
  { ...copySuggestion, payload: { ...copySuggestion.payload, mirror: true } },
  inventory,
);
assert.equal(
  getVisualMapScene(mirrored, "floor-2").hotspots[0].geometry.coordinates[0][0],
  95,
);
assert.deepEqual(
  getVisualMapScene(copied, "floor-2").hotspots[0].geometry.coordinates,
  getVisualMapScene(map, "floor-1").hotspots[0].geometry.coordinates,
);

const unitTypeSuggestion = suggestions.find(
  (item) => item.type === "unit_type_floorplan",
);
const withUnitType = applyDevelopmentVisualSuggestion(
  map,
  unitTypeSuggestion,
  inventory,
);
assert.equal(withUnitType.scenes.at(-1).background.url, "two-bed.jpg");
assert.equal(withUnitType.scenes.at(-1).hotspots.length, 2);

const hierarchyBase = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "masterplan",
    scenes: [
      {
        id: "masterplan",
        name: "Masterplan",
        type: "masterplan",
        background: { url: "site.jpg" },
      },
    ],
  },
});
const hierarchySuggestions = buildDevelopmentVisualSuggestions({
  visualMap: hierarchyBase,
  inventory,
  structureNodes: [
    { id: "block-a", nodeType: "block", label: "Block A" },
    { id: "floor-a-1", parentId: "block-a", nodeType: "floor", label: "1" },
    { id: "floor-a-2", parentId: "block-a", nodeType: "floor", label: "2" },
  ],
});
const hierarchy = hierarchySuggestions.find(
  (item) => item.type === "scene_hierarchy",
);
const withHierarchy = applyDevelopmentVisualSuggestion(
  hierarchyBase,
  hierarchy,
  inventory,
);
assert.equal(withHierarchy.scenes.length, 4);

console.log("development visual deterministic Phase 10 suggestions passed");
