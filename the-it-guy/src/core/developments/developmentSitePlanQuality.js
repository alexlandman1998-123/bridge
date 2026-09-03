const MAP_MINIMUM = 3;
const MAP_MAXIMUM = 97;
const DEFAULT_COLLISION_DISTANCE = 2.5;

function labelForUnit(unit = {}) {
  return String(
    unit.unitNumber || unit.unit_number || unit.unitLabel || unit.unit_label || unit.id || "Unit",
  ).trim();
}

function validNumber(value) {
  return Number.isFinite(Number(value));
}

function isWithinMap(position) {
  return (
    validNumber(position?.x) &&
    validNumber(position?.y) &&
    Number(position.x) >= MAP_MINIMUM &&
    Number(position.x) <= MAP_MAXIMUM &&
    Number(position.y) >= MAP_MINIMUM &&
    Number(position.y) <= MAP_MAXIMUM
  );
}

function distanceBetween(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
}

/**
 * Validates saved, canonical map coordinates without changing them. Percentages
 * near the map edge are intentionally treated as invalid so public map markers
 * cannot be clipped by responsive layouts.
 */
export function evaluateDevelopmentSitePlanQuality({
  units = [],
  sitePlanMap = {},
  collisionDistance = DEFAULT_COLLISION_DISTANCE,
} = {}) {
  const missing = [];
  const invalid = [];
  const placed = [];
  const safeDistance = Math.max(Number(collisionDistance) || DEFAULT_COLLISION_DISTANCE, 0.1);
  const buckets = new Map();
  const collisions = [];
  const collisionKeys = new Set();

  for (const unit of units) {
    const unitId = String(unit?.id || "").trim();
    if (!unitId) continue;

    const position = sitePlanMap?.[unitId];
    const item = { unitId, label: labelForUnit(unit), position };
    if (!position) {
      missing.push(item);
      continue;
    }
    if (!isWithinMap(position)) {
      invalid.push(item);
      continue;
    }
    placed.push(item);
  }

  for (const item of placed) {
    const bucketX = Math.floor(Number(item.position.x) / safeDistance);
    const bucketY = Math.floor(Number(item.position.y) / safeDistance);
    for (let x = bucketX - 1; x <= bucketX + 1; x += 1) {
      for (let y = bucketY - 1; y <= bucketY + 1; y += 1) {
        for (const candidate of buckets.get(`${x}:${y}`) || []) {
          const distance = distanceBetween(item.position, candidate.position);
          if (distance >= safeDistance) continue;
          const unitIds = [candidate.unitId, item.unitId].sort();
          const key = unitIds.join(":");
          if (collisionKeys.has(key)) continue;
          collisionKeys.add(key);
          collisions.push({
            unitIds,
            labels: [candidate.label, item.label],
            distance: Number(distance.toFixed(1)),
          });
        }
      }
    }
    const key = `${bucketX}:${bucketY}`;
    buckets.set(key, [...(buckets.get(key) || []), item]);
  }

  const issues = [
    ...missing.map((item) => ({ type: "missing", unitIds: [item.unitId], label: item.label })),
    ...invalid.map((item) => ({ type: "invalid", unitIds: [item.unitId], label: item.label })),
    ...collisions.map((item) => ({ type: "overlap", unitIds: item.unitIds, label: item.labels.join(" and "), distance: item.distance })),
  ];

  return {
    totalCount: units.filter((unit) => String(unit?.id || "").trim()).length,
    placedCount: placed.length,
    missing,
    invalid,
    collisions,
    issues,
    issueCount: issues.length,
    ready: issues.length === 0,
  };
}
