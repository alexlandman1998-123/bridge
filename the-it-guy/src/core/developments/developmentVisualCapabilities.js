import {
  getVisualMapScene,
  getVisualMapSceneUnitIds,
  resolveDevelopmentVisualMap,
  resolveVisualHotspotDestination,
} from "./developmentVisualMap.js";

const text = (value) => String(value || "").trim();
const unitType = (unit) =>
  text(unit?.displayType || unit?.unitType || unit?.unit_type || unit?.type);

export function getVisualUnitFloorPlanFallback(visualMap, unit = {}) {
  const directUrl = text(
    unit.floorplanUrl || unit.floorPlanUrl || unit.floorplanImageUrl,
  );
  if (directUrl)
    return { url: directUrl, source: "unit", reason: "Individual floor plan" };
  const map = resolveDevelopmentVisualMap({ visualMap });
  const readyAssets = map.assets.filter(
    (asset) =>
      asset.type === "floor_plan" &&
      asset.status === "approved" &&
      asset.visibility === "public" &&
      asset.processingState === "ready" &&
      asset.url,
  );
  const unitAsset = readyAssets.find(
    (asset) =>
      asset.association.type === "unit" &&
      asset.association.id === text(unit.id),
  );
  if (unitAsset)
    return { url: unitAsset.url, source: "unit_asset", reason: unitAsset.name };
  const typeAsset = readyAssets.find(
    (asset) =>
      asset.association.type === "unit_type" &&
      asset.association.id.toLowerCase() === unitType(unit).toLowerCase(),
  );
  if (typeAsset)
    return {
      url: typeAsset.url,
      source: "unit_type",
      reason: `${typeAsset.name} is shared by this property type`,
    };
  return { url: "", source: "none", reason: "No floor plan available" };
}

export function evaluateVisualSceneCapability(
  visualMap,
  sceneId,
  inventory = [],
  { failedSceneIds = [] } = {},
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scene = getVisualMapScene(map, sceneId);
  const failed = new Set(failedSceneIds.map(text));
  const hasConfiguredImage = Boolean(scene?.background?.url);
  const imageAvailable = hasConfiguredImage && !failed.has(scene.id);
  const unitIds = getVisualMapSceneUnitIds(map, scene.id);
  const inventoryIds = new Set(inventory.map((unit) => text(unit.id)));
  const availableUnitIds = unitIds.filter(
    (id) => !inventoryIds.size || inventoryIds.has(id),
  );
  const actionableHotspotCount = (scene?.hotspots || []).filter(
    (hotspot) =>
      resolveVisualHotspotDestination(map, hotspot, inventory).type !== "none",
  ).length;
  let mode = "unavailable";
  let reason = "No usable visual or inventory is available.";
  if (imageAvailable && actionableHotspotCount) {
    mode = "interactive_visual";
    reason = "A usable image and clickable buyer actions are available.";
  } else if (imageAvailable && inventory.length) {
    mode = "visual_with_inventory";
    reason = "The image is usable; inventory remains the next-step fallback.";
  } else if (imageAvailable) {
    mode = "marketing_visual";
    reason = "The image is usable, but no public inventory is available.";
  } else if (inventory.length) {
    mode = "inventory_only";
    reason = hasConfiguredImage
      ? "The image failed, so current inventory is shown instead."
      : "No image is configured, so current inventory is shown instead.";
  }
  return {
    sceneId: scene?.id || text(sceneId),
    sceneName: scene?.name || "Visual scene",
    mode,
    reason,
    hasConfiguredImage,
    imageAvailable,
    imageFailed: hasConfiguredImage && failed.has(scene?.id),
    actionableHotspotCount,
    mappedUnitCount: availableUnitIds.length,
    hasDeadEnd: actionableHotspotCount === 0,
  };
}

export function buildDevelopmentVisualCapabilityReport({
  visualMap,
  inventory = [],
  failedSceneIds = [],
} = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scenes = map.scenes.map((scene) =>
    evaluateVisualSceneCapability(map, scene.id, inventory, { failedSceneIds }),
  );
  const selected =
    scenes.find((scene) => scene.sceneId === map.defaultSceneId) || scenes[0];
  return {
    experience:
      selected?.mode || (inventory.length ? "inventory_only" : "unavailable"),
    reason:
      selected?.reason ||
      (inventory.length
        ? "Inventory is available without a configured visual."
        : "No public experience is available."),
    scenes,
    deadEndSceneCount: scenes.filter((scene) => scene.hasDeadEnd).length,
    failedSceneCount: scenes.filter((scene) => scene.imageFailed).length,
  };
}

function groupFallback(hotspot, inventory) {
  const targetType = hotspot.target?.type;
  const targetId = text(hotspot.target?.id);
  const filterKey = {
    phase: "phase",
    building: "block",
    floor: "floor",
  }[targetType];
  if (filterKey && targetId)
    return {
      type: "inventory_filter",
      filters: { [filterKey]: targetId },
      fallbackReason: "visual-unavailable",
    };
  if (inventory.length)
    return {
      type: "inventory_filter",
      filters: {},
      fallbackReason: "visual-unavailable",
    };
  return { type: "none", fallbackReason: "no-public-capability" };
}

export function resolveVisualCapabilityDestination({
  visualMap,
  hotspot,
  inventory = [],
  failedSceneIds = [],
} = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const destination = resolveVisualHotspotDestination(map, hotspot, inventory);
  if (destination.type === "unit") {
    const unit = inventory.find(
      (item) => text(item.id) === text(destination.unitId),
    );
    return {
      ...destination,
      floorPlan: getVisualUnitFloorPlanFallback(map, unit),
    };
  }
  if (destination.type !== "scene") return destination;
  const capability = evaluateVisualSceneCapability(
    map,
    destination.sceneId,
    inventory,
    { failedSceneIds },
  );
  if (capability.imageAvailable) return destination;
  const unitIds = getVisualMapSceneUnitIds(map, destination.sceneId);
  if (unitIds.length === 1) {
    const unit = inventory.find((item) => text(item.id) === unitIds[0]);
    return {
      type: "unit",
      unitId: unitIds[0],
      floorPlan: getVisualUnitFloorPlanFallback(map, unit),
      fallbackReason: "visual-unavailable",
    };
  }
  const targetScene = getVisualMapScene(map, destination.sceneId);
  const direct = targetScene?.hotspots
    .map((item) => resolveVisualHotspotDestination(map, item, inventory))
    .find((item) => item.type === "unit");
  if (direct) {
    const unit = inventory.find((item) => text(item.id) === direct.unitId);
    return {
      ...direct,
      floorPlan: getVisualUnitFloorPlanFallback(map, unit),
      fallbackReason: "visual-unavailable",
    };
  }
  return groupFallback(hotspot, inventory);
}
