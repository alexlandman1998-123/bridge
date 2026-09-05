const text = (value) => String(value ?? "").trim();

export function visualUnitStatus(value) {
  const status = text(value).toLowerCase();
  if (status.includes("reserve") || status.includes("offer")) return "reserved";
  if (status.includes("sold") || status.includes("complete")) return "sold";
  if (status.includes("unreleased") || status.includes("draft"))
    return "unreleased";
  return "available";
}

export function visualUnitFloor(unit = {}) {
  return text(unit.floor ?? unit.floorNumber ?? unit.floor_number);
}

export function visualUnitRelease(unit = {}) {
  return text(
    unit.releaseDate ??
      unit.release_date ??
      unit.occupationDate ??
      unit.occupation_date,
  );
}

export function publicVisualFilterOptions(inventory = []) {
  const values = (selector) =>
    [...new Set(inventory.map(selector).map(text).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    );
  return {
    types: values((unit) => unit.unitType),
    bedrooms: values((unit) => unit.bedrooms),
    floors: values(visualUnitFloor),
    phases: values((unit) => unit.phase),
    releases: values(visualUnitRelease),
  };
}

export function filterPublicVisualUnits(inventory = [], filters = {}) {
  const query = text(filters.query).toLowerCase();
  const maxPrice = Number(filters.maxPrice) || 0;
  return inventory.filter((unit) => {
    const haystack = [unit.unitNumber, unit.unitType, unit.block, unit.phase]
      .map(text)
      .join(" ")
      .toLowerCase();
    return (
      (!query || haystack.includes(query)) &&
      (!filters.type ||
        filters.type === "all" ||
        text(unit.unitType) === filters.type) &&
      (!filters.status ||
        filters.status === "all" ||
        visualUnitStatus(unit.status) === filters.status) &&
      (!filters.bedrooms ||
        filters.bedrooms === "all" ||
        text(unit.bedrooms) === filters.bedrooms) &&
      (!filters.floor ||
        filters.floor === "all" ||
        visualUnitFloor(unit) === filters.floor) &&
      (!filters.block ||
        filters.block === "all" ||
        text(unit.block || unit.blockName) === filters.block) &&
      (!filters.phase ||
        filters.phase === "all" ||
        text(unit.phase) === filters.phase) &&
      (!filters.release ||
        filters.release === "all" ||
        visualUnitRelease(unit) === filters.release) &&
      (!maxPrice || !Number(unit.price) || Number(unit.price) <= maxPrice)
    );
  });
}

export function visualHotspotCentre(hotspot = {}) {
  const coordinates = hotspot.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [50, 50];
  if (hotspot.geometry?.type !== "polygon") return coordinates;
  return coordinates
    .reduce(
      ([x, y], point) => [x + Number(point[0]), y + Number(point[1])],
      [0, 0],
    )
    .map((value) => value / coordinates.length);
}

export function normaliseVisualSelectionIds(value, validIds = []) {
  const valid = new Set(validIds.map(text));
  const source = Array.isArray(value) ? value : text(value).split(",");
  return [
    ...new Set(
      source.map(text).filter((id) => id && (!valid.size || valid.has(id))),
    ),
  ];
}

export function toggleVisualSelection(ids = [], unitId, maximum = Infinity) {
  const id = text(unitId);
  const next = new Set(ids.map(text).filter(Boolean));
  if (next.has(id)) next.delete(id);
  else if (next.size < maximum) next.add(id);
  return [...next];
}

export function buildVisualExplorerEvent(action, detail = {}) {
  return {
    action: text(action),
    eventType: text(detail.eventType || action),
    unitId: text(detail.unitId) || null,
    sceneId: text(detail.sceneId) || null,
    shortlistSize: Number(detail.shortlistSize) || 0,
    compareSize: Number(detail.compareSize) || 0,
    occurredAt: new Date().toISOString(),
    metadata:
      detail.metadata && typeof detail.metadata === "object"
        ? detail.metadata
        : {},
  };
}
