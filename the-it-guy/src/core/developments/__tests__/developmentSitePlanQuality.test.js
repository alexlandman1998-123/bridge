import assert from "node:assert/strict";
import { evaluateDevelopmentSitePlanQuality } from "../developmentSitePlanQuality.js";

const units = [
  { id: "a", unitNumber: "001" },
  { id: "b", unitNumber: "002" },
  { id: "c", unitNumber: "003" },
  { id: "d", unitNumber: "004" },
];

const review = evaluateDevelopmentSitePlanQuality({
  units,
  sitePlanMap: {
    a: { x: 10, y: 10 },
    b: { x: 11, y: 11 },
    d: { x: "outside", y: 20 },
  },
});

assert.equal(review.ready, false);
assert.equal(review.placedCount, 2);
assert.deepEqual(review.missing.map((item) => item.label), ["003"]);
assert.deepEqual(review.invalid.map((item) => item.label), ["004"]);
assert.equal(review.collisions.length, 1);
assert.deepEqual(review.collisions[0].labels, ["001", "002"]);
assert.equal(review.issues.length, 3);

const ready = evaluateDevelopmentSitePlanQuality({
  units: units.slice(0, 2),
  sitePlanMap: { a: { x: 10, y: 10 }, b: { x: 80, y: 80 } },
});
assert.equal(ready.ready, true);
assert.equal(ready.issueCount, 0);

const readyWithOffPlanUnit = evaluateDevelopmentSitePlanQuality({
  units: units.slice(0, 3),
  sitePlanMap: { a: { x: 10, y: 10 }, b: { x: 80, y: 80 } },
  excludedUnitIds: ["c"],
});
assert.equal(readyWithOffPlanUnit.ready, true);
assert.equal(readyWithOffPlanUnit.totalCount, 3);

console.log("development site-plan quality checks passed");
