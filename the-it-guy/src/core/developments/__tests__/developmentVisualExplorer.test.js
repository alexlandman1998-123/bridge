import assert from "node:assert/strict";
import {
  buildVisualExplorerEvent,
  filterPublicVisualUnits,
  normaliseVisualSelectionIds,
  publicVisualFilterOptions,
  toggleVisualSelection,
  visualHotspotCentre,
  visualUnitStatus,
} from "../developmentVisualExplorer.js";

const units = [
  {
    id: "1",
    unitNumber: "A101",
    unitType: "Apartment",
    bedrooms: 2,
    floor: 1,
    block: "A",
    phase: "North",
    price: 2200000,
    status: "Available",
    releaseDate: "2027-03",
  },
  {
    id: "2",
    unitNumber: "B201",
    unitType: "Penthouse",
    bedrooms: 3,
    floorNumber: 2,
    blockName: "B",
    phase: "South",
    price: 4800000,
    status: "Reserved",
  },
];

assert.equal(visualUnitStatus("Offer pending"), "reserved");
assert.equal(
  filterPublicVisualUnits(units, { query: "a101", status: "available" })[0].id,
  "1",
);
assert.equal(
  filterPublicVisualUnits(units, { bedrooms: "3", maxPrice: "5000000" })[0].id,
  "2",
);
assert.equal(filterPublicVisualUnits(units, { block: "B" })[0].id, "2");
assert.deepEqual(publicVisualFilterOptions(units).floors, ["1", "2"]);
assert.deepEqual(
  visualHotspotCentre({
    geometry: {
      type: "polygon",
      coordinates: [
        [10, 10],
        [30, 10],
        [30, 30],
        [10, 30],
      ],
    },
  }),
  [20, 20],
);
assert.deepEqual(
  normaliseVisualSelectionIds(
    "2,missing,1,2",
    units.map((unit) => unit.id),
  ),
  ["2", "1"],
);
assert.deepEqual(toggleVisualSelection(["1", "2"], "1", 3), ["2"]);
assert.deepEqual(toggleVisualSelection(["1", "2"], "3", 2), ["1", "2"]);
const compareEvent = buildVisualExplorerEvent("compare", {
  unitId: 2,
  compareSize: 2,
});
assert.equal(compareEvent.action, "compare");
assert.equal(compareEvent.eventType, "compare");
assert.equal(compareEvent.unitId, "2");
assert.equal(compareEvent.sceneId, null);
assert.equal(compareEvent.shortlistSize, 0);
assert.equal(compareEvent.compareSize, 2);
assert.deepEqual(compareEvent.metadata, {});
assert.ok(compareEvent.occurredAt);

console.log("development visual explorer phase 2–4 checks passed");
