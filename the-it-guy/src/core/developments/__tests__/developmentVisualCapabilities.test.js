import assert from "node:assert/strict";
import {
  buildDevelopmentVisualCapabilityReport,
  evaluateVisualSceneCapability,
  getVisualUnitFloorPlanFallback,
  resolveVisualCapabilityDestination,
} from "../developmentVisualCapabilities.js";
import { resolveDevelopmentVisualMap } from "../developmentVisualMap.js";

const units = [
  { id: "1", unitNumber: "A1", block: "Block A", unitType: "Two bed" },
  { id: "2", unitNumber: "A2", block: "Block A", unitType: "Two bed" },
];
const hotspot = (
  destination,
  target = { type: "building", id: "Block A" },
) => ({
  id: `hotspot:${target.id}`,
  type: target.type,
  target,
  geometry: { type: "point", coordinates: [50, 50] },
  label: { text: target.id },
  destination,
});
const mapWith = (scenes, assets = []) =>
  resolveDevelopmentVisualMap({
    visualMap: { defaultSceneId: scenes[0].id, scenes, assets },
  });

const inventoryOnly = mapWith([
  { id: "root", name: "Development", type: "masterplan", background: {} },
]);
assert.equal(
  buildDevelopmentVisualCapabilityReport({
    visualMap: inventoryOnly,
    inventory: units,
  }).experience,
  "inventory_only",
);

const aerialOnly = mapWith([
  {
    id: "root",
    name: "Aerial",
    type: "aerial",
    background: { url: "aerial.jpg" },
  },
]);
assert.equal(
  evaluateVisualSceneCapability(aerialOnly, "root", []).mode,
  "marketing_visual",
);
assert.equal(
  evaluateVisualSceneCapability(aerialOnly, "root", units).mode,
  "visual_with_inventory",
);

const aerialToExterior = mapWith([
  {
    id: "aerial",
    name: "Aerial",
    type: "aerial",
    background: { url: "aerial.jpg" },
    hotspots: [hotspot({ type: "scene", sceneId: "exterior" })],
  },
  {
    id: "exterior",
    name: "Exterior",
    type: "exterior",
    parentSceneId: "aerial",
    background: { url: "exterior.jpg" },
    hotspots: [
      hotspot({ type: "unit", unitId: "1" }, { type: "unit", id: "1" }),
    ],
  },
]);
assert.equal(
  evaluateVisualSceneCapability(aerialToExterior, "aerial", units).mode,
  "interactive_visual",
);
assert.equal(
  resolveVisualCapabilityDestination({
    visualMap: aerialToExterior,
    hotspot: aerialToExterior.scenes[0].hotspots[0],
    inventory: units,
  }).type,
  "scene",
);

const failedExterior = resolveVisualCapabilityDestination({
  visualMap: aerialToExterior,
  hotspot: aerialToExterior.scenes[0].hotspots[0],
  inventory: units,
  failedSceneIds: ["exterior"],
});
assert.equal(failedExterior.type, "unit");
assert.equal(failedExterior.unitId, "1");

const elevationFallback = mapWith([
  {
    id: "site",
    name: "Site plan",
    type: "masterplan",
    background: { url: "site.jpg" },
    hotspots: [hotspot({ type: "scene", sceneId: "elevation" })],
  },
  {
    id: "elevation",
    name: "Block A elevation",
    type: "elevation",
    parentSceneId: "site",
    background: {},
  },
]);
assert.deepEqual(
  resolveVisualCapabilityDestination({
    visualMap: elevationFallback,
    hotspot: elevationFallback.scenes[0].hotspots[0],
    inventory: units,
  }),
  {
    type: "inventory_filter",
    filters: { block: "Block A" },
    fallbackReason: "visual-unavailable",
  },
);

const typePlanMap = mapWith(inventoryOnly.scenes, [
  {
    id: "two-bed-plan",
    name: "Two bedroom plan",
    url: "two-bed.jpg",
    type: "floor_plan",
    association: { type: "unit_type", id: "Two bed" },
    visibility: "public",
    status: "approved",
    processingState: "ready",
  },
]);
assert.deepEqual(getVisualUnitFloorPlanFallback(typePlanMap, units[0]), {
  url: "two-bed.jpg",
  source: "unit_type",
  reason: "Two bedroom plan is shared by this property type",
});
assert.equal(
  buildDevelopmentVisualCapabilityReport({
    visualMap: aerialOnly,
    inventory: units,
    failedSceneIds: ["root"],
  }).experience,
  "inventory_only",
);

console.log("development visual capability Phase 11 fallback matrix passed");
