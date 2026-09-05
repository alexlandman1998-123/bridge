import assert from "node:assert/strict";
import {
  getVisualHotspotSceneId,
  getVisualMapScene,
  resolveDevelopmentVisualMap,
} from "../developmentVisualMap.js";
import {
  addVisualJourneyLink,
  applyVisualJourneyTemplate,
  buildVisualJourneyOutline,
  removeVisualJourneyScene,
  reorderVisualJourneyScene,
} from "../developmentVisualJourney.js";

const base = resolveDevelopmentVisualMap({
  visualMap: {
    defaultSceneId: "masterplan",
    scenes: [
      {
        id: "masterplan",
        type: "masterplan",
        name: "Masterplan",
        background: { url: "site.jpg" },
      },
    ],
  },
});

const templated = applyVisualJourneyTemplate(base, "single_home", {
  inventory: [{ id: "home-1", unitNumber: "1" }],
  assetByType: {
    aerial: { url: "aerial.jpg" },
    exterior: { url: "exterior.jpg" },
  },
});
assert.equal(templated.scenes.length, 2);
assert.equal(getVisualMapScene(templated).name, "Aerial view");
assert.equal(getVisualMapScene(templated).background.url, "aerial.jpg");
assert.equal(templated.scenes[1].background.url, "exterior.jpg");
assert.equal(templated.scenes[1].hotspots[0].destination.type, "unit");
assert.deepEqual(
  buildVisualJourneyOutline(templated).map((scene) => scene.name),
  ["Aerial view", "Exterior render"],
);

const reordered = reorderVisualJourneyScene(
  templated,
  templated.scenes[1].id,
  "up",
);
assert.equal(reordered.scenes[0].name, "Exterior render");
assert.equal(reordered.defaultSceneId, "masterplan");

const linked = addVisualJourneyLink(templated, "masterplan", {
  label: "Available homes",
  destination: {
    type: "inventory_filter",
    filters: { phase: "Phase 1" },
  },
});
assert.equal(
  getVisualMapScene(linked).hotspots.at(-1).destination.type,
  "inventory_filter",
);

const childId = templated.scenes[1].id;
const cascaded = removeVisualJourneyScene(templated, childId);
assert.equal(cascaded.scenes.length, 1);
assert.equal(
  getVisualHotspotSceneId(getVisualMapScene(cascaded).hotspots[0]),
  "",
);

const apartment = applyVisualJourneyTemplate(base, "apartment_building", {
  inventory: [{ id: "unit-a-101", unitNumber: "A101" }],
  assetByType: {
    aerial: { url: "aerial.jpg" },
    elevation: { url: "elevation.jpg" },
    floor_plan: { url: "floor.jpg" },
  },
});
const elevation = apartment.scenes[1];
const floor = apartment.scenes[2];
const relinked = removeVisualJourneyScene(apartment, elevation.id, floor.id);
assert.equal(relinked.scenes.length, 2);
assert.equal(getVisualMapScene(relinked, floor.id).parentSceneId, "masterplan");
assert.equal(
  getVisualHotspotSceneId(getVisualMapScene(relinked).hotspots[0]),
  floor.id,
);
assert.equal(
  getVisualMapScene(relinked, floor.id).hotspots[0].destination.type,
  "unit",
);

console.log("development visual journey Phase 9 checks passed");
