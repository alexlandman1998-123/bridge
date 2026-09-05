import { normaliseSitePlanViewport } from "./developmentSitePlanViewport.js";

export const DEVELOPMENT_VISUAL_MAP_SCHEMA_VERSION = 3;

export const VISUAL_ASSET_TYPES = Object.freeze([
  "aerial",
  "site_plan",
  "exterior",
  "elevation",
  "floor_plan",
  "interior",
  "parking_plan",
  "brochure",
  "other",
]);

export const VISUAL_ASSET_ASSOCIATION_TYPES = Object.freeze([
  "development",
  "phase",
  "block",
  "floor",
  "unit",
  "unit_type",
]);

export const VISUAL_SCENE_TYPES = Object.freeze([
  "masterplan",
  "aerial",
  "phase",
  "building",
  "exterior",
  "elevation",
  "floor_plan",
  "interior",
  "amenity",
  "parking_plan",
]);

export const VISUAL_DESTINATION_TYPES = Object.freeze([
  "scene",
  "unit",
  "inventory_filter",
  "amenity",
  "external",
  "none",
]);

export const VISUAL_HOTSPOT_TYPES = Object.freeze([
  "phase",
  "building",
  "floor",
  "unit",
  "amenity",
  "parking",
  "storeroom",
  "commercial",
]);

const text = (value) => String(value || "").trim();
const safeDestinationUrl = (value) =>
  /^(https?:\/\/|mailto:|tel:)/i.test(text(value));
const clamp = (value) => Math.min(100, Math.max(0, Number(value)));
const finite = (value) => Number.isFinite(Number(value));

function normalisePoint(point) {
  if (
    Array.isArray(point) &&
    point.length >= 2 &&
    finite(point[0]) &&
    finite(point[1])
  ) {
    return [clamp(point[0]), clamp(point[1])];
  }
  if (point && finite(point.x) && finite(point.y))
    return [clamp(point.x), clamp(point.y)];
  return null;
}

function normaliseGeometry(geometry = {}) {
  const type = geometry.type === "polygon" ? "polygon" : "point";
  if (type === "polygon") {
    const coordinates = (
      Array.isArray(geometry.coordinates) ? geometry.coordinates : []
    )
      .map(normalisePoint)
      .filter(Boolean);
    return coordinates.length >= 3 ? { type, coordinates } : null;
  }
  const coordinates = normalisePoint(geometry.coordinates || geometry);
  return coordinates ? { type, coordinates } : null;
}

function normaliseDestination(hotspot, targetType, targetId) {
  const source =
    hotspot.destination && typeof hotspot.destination === "object"
      ? hotspot.destination
      : {};
  const requestedType = VISUAL_DESTINATION_TYPES.includes(source.type)
    ? source.type
    : "";
  const legacySceneId = text(hotspot.childSceneId);
  const type =
    requestedType ||
    (legacySceneId
      ? "scene"
      : targetType === "unit"
        ? "unit"
        : targetType === "amenity"
          ? "amenity"
          : "none");
  if (type === "scene")
    return {
      type,
      sceneId: text(source.sceneId || source.scene_id || legacySceneId),
    };
  if (type === "unit")
    return { type, unitId: text(source.unitId || source.unit_id || targetId) };
  if (type === "inventory_filter") {
    const filters =
      source.filters && typeof source.filters === "object"
        ? source.filters
        : {};
    return {
      type,
      filters: Object.fromEntries(
        Object.entries(filters)
          .map(([key, value]) => [text(key), text(value)])
          .filter(([key, value]) => key && value),
      ),
    };
  }
  if (type === "amenity")
    return {
      type,
      amenityId: text(source.amenityId || source.amenity_id || targetId),
    };
  if (type === "external")
    return { type, url: text(source.url), newTab: source.newTab !== false };
  return { type: "none" };
}

function normaliseHotspot(hotspot = {}, index = 0) {
  const geometry = normaliseGeometry(hotspot.geometry);
  const targetType = VISUAL_HOTSPOT_TYPES.includes(hotspot.target?.type)
    ? hotspot.target.type
    : VISUAL_HOTSPOT_TYPES.includes(hotspot.type)
      ? hotspot.type
      : "unit";
  const targetId = text(hotspot.target?.id || hotspot.targetId);
  if (!geometry || !targetId) return null;
  const labelPoint = normalisePoint(
    hotspot.label?.position || hotspot.labelPosition,
  );
  const destination = normaliseDestination(hotspot, targetType, targetId);
  return {
    id: text(hotspot.id) || `${targetType}:${targetId}:${index + 1}`,
    type: targetType,
    target: { type: targetType, id: targetId },
    geometry,
    destination,
    label: {
      text: text(hotspot.label?.text || hotspot.labelText),
      ...(labelPoint ? { position: labelPoint } : {}),
    },
    visibility: hotspot.visibility === "hidden" ? "hidden" : "public",
    displayOrder: finite(hotspot.displayOrder)
      ? Number(hotspot.displayOrder)
      : index,
  };
}

function normaliseScene(scene = {}, index = 0) {
  const id = text(scene.id) || `scene-${index + 1}`;
  const type = VISUAL_SCENE_TYPES.includes(scene.type)
    ? scene.type
    : "masterplan";
  const hotspots = (Array.isArray(scene.hotspots) ? scene.hotspots : [])
    .map(normaliseHotspot)
    .filter(Boolean);
  return {
    id,
    type,
    name:
      text(scene.name) ||
      (type === "masterplan" ? "Masterplan" : `Scene ${index + 1}`),
    parentSceneId: text(scene.parentSceneId) || null,
    parentHotspotId: text(scene.parentHotspotId) || null,
    background: {
      type: scene.background?.type === "map" ? "map" : "image",
      url: text(scene.background?.url),
      sources: ["avif", "webp"]
        .map((format) => ({
          format,
          url: text(
            Array.isArray(scene.background?.sources)
              ? scene.background.sources.find(
                  (source) => source.format === format,
                )?.url
              : scene.background?.sources?.[format],
          ),
        }))
        .filter((source) => source.url),
      ...(finite(scene.background?.width)
        ? { width: Number(scene.background.width) }
        : {}),
      ...(finite(scene.background?.height)
        ? { height: Number(scene.background.height) }
        : {}),
    },
    viewport: normaliseSitePlanViewport(scene.viewport),
    orientationDegrees: finite(scene.orientationDegrees)
      ? ((Number(scene.orientationDegrees) % 360) + 360) % 360
      : 0,
    hotspots,
    hiddenTargetIds: [
      ...new Set(
        (Array.isArray(scene.hiddenTargetIds) ? scene.hiddenTargetIds : [])
          .map(text)
          .filter(Boolean),
      ),
    ],
    displayOrder: finite(scene.displayOrder)
      ? Number(scene.displayOrder)
      : index,
  };
}

function inferVisualAssetType(name = "") {
  const value = text(name).toLowerCase();
  if (/aerial|drone|bird.?s.?eye/.test(value)) return "aerial";
  if (/site.?plan|master.?plan/.test(value)) return "site_plan";
  if (/parking|basement/.test(value)) return "parking_plan";
  if (/floor.?plan|layout|type.?plan/.test(value)) return "floor_plan";
  if (/elevation|facade|façade/.test(value)) return "elevation";
  if (/exterior|outside|building.?render/.test(value)) return "exterior";
  if (/interior|kitchen|bedroom|bathroom|lounge/.test(value)) return "interior";
  if (/brochure|sales.?pack/.test(value) || /\.pdf$/i.test(value))
    return "brochure";
  return "other";
}

export function classifyVisualAsset(file = {}, inventory = []) {
  const name = text(file.name || file.fileName || file.title || file.url);
  const lowerName = name.toLowerCase();
  const candidates = inventory.flatMap((unit) => {
    const values = [
      ["unit", unit.id, unit.unitNumber || unit.displayNumber],
      ["block", unit.block || unit.blockName, unit.block || unit.blockName],
      ["phase", unit.phase || unit.phaseName, unit.phase || unit.phaseName],
      ["floor", unit.floor || unit.floorNumber, unit.floor || unit.floorNumber],
      ["unit_type", unit.unitType || unit.type, unit.unitType || unit.type],
    ];
    return values.filter(([, id, label]) => id && label);
  });
  const match = candidates
    .sort((left, right) => text(right[2]).length - text(left[2]).length)
    .find(([, , label]) => lowerName.includes(text(label).toLowerCase()));
  return {
    type: inferVisualAssetType(name),
    association: match
      ? { type: match[0], id: text(match[1]) }
      : { type: "development", id: "" },
  };
}

function normaliseVisualAsset(asset = {}, index = 0, inventory = []) {
  const name = text(
    asset.name || asset.title || asset.fileName || asset.file_name || asset.url,
  );
  const suggestion = classifyVisualAsset({ ...asset, name }, inventory);
  const requestedType = text(asset.type);
  const association = asset.association || suggestion.association;
  const associationType = VISUAL_ASSET_ASSOCIATION_TYPES.includes(
    association?.type,
  )
    ? association.type
    : "development";
  const url = text(asset.url || asset.fileUrl || asset.file_url);
  return {
    id: text(asset.id) || `visual-asset-${index + 1}`,
    name: name || `Visual asset ${index + 1}`,
    url,
    type: VISUAL_ASSET_TYPES.includes(requestedType)
      ? requestedType
      : suggestion.type,
    association: { type: associationType, id: text(association?.id) },
    visibility: asset.visibility === "internal" ? "internal" : "public",
    status: asset.status === "approved" ? "approved" : "draft",
    source: text(asset.source) || "upload",
    uploadedAt: text(asset.uploadedAt || asset.uploaded_at),
    processingState: ["ready", "processing", "missing", "failed"].includes(
      asset.processingState,
    )
      ? asset.processingState
      : url
        ? "ready"
        : "missing",
    error: text(asset.error),
  };
}

function legacyMasterplanScene(mediaLibrary = {}) {
  const pointMap =
    mediaLibrary.sitePlanMap && typeof mediaLibrary.sitePlanMap === "object"
      ? mediaLibrary.sitePlanMap
      : {};
  const hiddenTargetIds = [
    ...new Set(
      (Array.isArray(mediaLibrary.sitePlanNotShownUnitIds)
        ? mediaLibrary.sitePlanNotShownUnitIds
        : []
      )
        .map(text)
        .filter(Boolean),
    ),
  ];
  const hidden = new Set(hiddenTargetIds);
  const hotspots = Object.entries(pointMap).flatMap(
    ([unitId, point], index) => {
      const coordinates = normalisePoint(point);
      if (!coordinates || !text(unitId)) return [];
      return [
        {
          id: `unit:${text(unitId)}`,
          type: "unit",
          target: { type: "unit", id: text(unitId) },
          geometry: { type: "point", coordinates },
          label: { text: text(point?.sourceLabel), position: coordinates },
          visibility: hidden.has(text(unitId)) ? "hidden" : "public",
          displayOrder: index,
        },
      ];
    },
  );
  return normaliseScene({
    id: "masterplan",
    type: "masterplan",
    name: "Masterplan",
    background: {
      type: "image",
      url: mediaLibrary.sitePlanUrl || mediaLibrary.masterplanUrl,
    },
    viewport: mediaLibrary.sitePlanViewport,
    hotspots,
    hiddenTargetIds,
  });
}

/**
 * Canonical visual-map reader. Old site-plan fields are imported only when a
 * canonical map is absent; they never override or merge into canonical data.
 */
export function resolveDevelopmentVisualMap(mediaLibrary = {}) {
  const raw = mediaLibrary.visualMap || mediaLibrary.visual_map;
  const hasCanonicalMap =
    raw && typeof raw === "object" && Array.isArray(raw.scenes);
  const scenes = hasCanonicalMap
    ? raw.scenes.map(normaliseScene)
    : [legacyMasterplanScene(mediaLibrary)];
  const uniqueScenes = scenes.filter(
    (scene, index) =>
      scenes.findIndex((candidate) => candidate.id === scene.id) === index,
  );
  const requestedDefault = text(raw?.defaultSceneId || raw?.default_scene_id);
  const defaultSceneId = uniqueScenes.some(
    (scene) => scene.id === requestedDefault,
  )
    ? requestedDefault
    : uniqueScenes[0]?.id || "masterplan";
  const publishedSource = raw?.publishedSnapshot || raw?.published_snapshot;
  const publishedSnapshot =
    publishedSource && Array.isArray(publishedSource.scenes)
      ? {
          revision: Math.max(1, Number(publishedSource.revision) || 1),
          defaultSceneId:
            text(
              publishedSource.defaultSceneId ||
                publishedSource.default_scene_id,
            ) || defaultSceneId,
          scenes: publishedSource.scenes.map(normaliseScene),
          assets: (Array.isArray(publishedSource.assets)
            ? publishedSource.assets
            : []
          ).map((asset, index) => normaliseVisualAsset(asset, index)),
        }
      : null;
  return {
    schemaVersion: DEVELOPMENT_VISUAL_MAP_SCHEMA_VERSION,
    revision: Math.max(1, Number(raw?.revision) || 1),
    publicationStatus:
      raw?.publicationStatus === "published" ? "published" : "draft",
    defaultSceneId,
    scenes: uniqueScenes,
    assets: (Array.isArray(raw?.assets) ? raw.assets : []).map((asset, index) =>
      normaliseVisualAsset(asset, index),
    ),
    ...(publishedSnapshot ? { publishedSnapshot } : {}),
  };
}

export function addVisualMapAssets(visualMap, assets = [], inventory = []) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const existingKeys = new Set(
    map.assets.map(
      (asset) => `${asset.url.toLowerCase()}|${asset.name.toLowerCase()}`,
    ),
  );
  const additions = assets
    .map((asset, index) =>
      normaliseVisualAsset(asset, map.assets.length + index, inventory),
    )
    .filter((asset) => {
      const key = `${asset.url.toLowerCase()}|${asset.name.toLowerCase()}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
  return {
    ...map,
    revision: map.revision + (additions.length ? 1 : 0),
    publicationStatus: additions.length ? "draft" : map.publicationStatus,
    assets: [...map.assets, ...additions],
  };
}

export function updateVisualMapAsset(visualMap, assetId, patch = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    assets: map.assets.map((asset, index) =>
      asset.id === assetId
        ? normaliseVisualAsset({ ...asset, ...patch }, index)
        : asset,
    ),
  };
}

export function removeVisualMapAsset(visualMap, assetId) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  if (!map.assets.some((asset) => asset.id === assetId)) return map;
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    assets: map.assets.filter((asset) => asset.id !== assetId),
  };
}

export function getVisualMapScene(visualMap, sceneId = "") {
  const map = resolveDevelopmentVisualMap({ visualMap });
  return (
    map.scenes.find(
      (scene) => scene.id === (text(sceneId) || map.defaultSceneId),
    ) || map.scenes[0]
  );
}

export function getVisualHotspotSceneId(hotspot = {}) {
  return hotspot.destination?.type === "scene"
    ? text(hotspot.destination.sceneId)
    : text(hotspot.childSceneId);
}

export function resolveVisualHotspotDestination(
  visualMap,
  hotspot = {},
  inventory = [],
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const destination = normaliseDestination(
    hotspot,
    hotspot.target?.type || hotspot.type,
    hotspot.target?.id,
  );
  const unitById = new Map(inventory.map((unit) => [text(unit.id), unit]));
  if (destination.type === "scene") {
    if (map.scenes.some((scene) => scene.id === destination.sceneId))
      return destination;
    const targetUnit = unitById.get(text(hotspot.target?.id));
    if (targetUnit)
      return {
        type: "unit",
        unitId: text(targetUnit.id),
        fallbackReason: "missing-scene",
      };
  }
  if (destination.type === "unit") {
    if (!inventory.length || unitById.has(destination.unitId))
      return destination;
    return { type: "none", fallbackReason: "missing-unit" };
  }
  if (destination.type === "inventory_filter") return destination;
  if (destination.type === "external" && safeDestinationUrl(destination.url))
    return destination;
  if (destination.type === "amenity" && destination.amenityId)
    return destination;
  const targetId = text(hotspot.target?.id);
  if (
    hotspot.target?.type === "unit" &&
    (!inventory.length || unitById.has(targetId))
  )
    return { type: "unit", unitId: targetId, fallbackReason: "target-default" };
  const filterKey = { phase: "phase", building: "block", floor: "floor" }[
    hotspot.target?.type
  ];
  if (filterKey && targetId)
    return {
      type: "inventory_filter",
      filters: { [filterKey]: targetId },
      fallbackReason: "group-default",
    };
  return { type: "none" };
}

export function getVisualMapSceneBreadcrumbs(visualMap, sceneId = "") {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const breadcrumbs = [];
  const visited = new Set();
  let scene = getVisualMapScene(map, sceneId);
  while (scene && !visited.has(scene.id)) {
    breadcrumbs.unshift(scene);
    visited.add(scene.id);
    scene = scene.parentSceneId
      ? map.scenes.find((item) => item.id === scene.parentSceneId)
      : null;
  }
  return breadcrumbs;
}

export function getVisualMapSceneUnitIds(
  visualMap,
  sceneId = "",
  options = {},
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const root = getVisualMapScene(map, sceneId);
  const ids = new Set();
  const visited = new Set();
  const collect = (scene) => {
    if (!scene || visited.has(scene.id)) return;
    visited.add(scene.id);
    for (const hotspot of scene.hotspots) {
      if (hotspot.visibility !== "hidden" && hotspot.type === "unit")
        ids.add(hotspot.target.id);
      const childSceneId = getVisualHotspotSceneId(hotspot);
      if (options.descendants !== false && childSceneId)
        collect(map.scenes.find((item) => item.id === childSceneId));
    }
  };
  collect(root);
  return [...ids];
}

export function addVisualMapChildScene(
  visualMap,
  parentSceneId,
  sceneInput = {},
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const parent = getVisualMapScene(map, parentSceneId);
  const baseId =
    text(sceneInput.id || sceneInput.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `scene-${map.scenes.length + 1}`;
  let id = baseId;
  let suffix = 2;
  while (map.scenes.some((scene) => scene.id === id))
    id = `${baseId}-${suffix++}`;
  const scene = normaliseScene(
    {
      ...sceneInput,
      id,
      parentSceneId: parent.id,
      parentHotspotId: `navigation:${id}`,
      displayOrder: map.scenes.length,
    },
    map.scenes.length,
  );
  const navigationHotspot = normaliseHotspot(
    {
      id: `navigation:${id}`,
      type:
        sceneInput.targetType ||
        (scene.type === "floor_plan"
          ? "floor"
          : scene.type === "building" || scene.type === "elevation"
            ? "building"
            : "phase"),
      targetId: text(sceneInput.targetId) || id,
      destination: { type: "scene", sceneId: id },
      geometry: sceneInput.geometry || { type: "point", coordinates: [50, 50] },
      label: {
        text: text(sceneInput.navigationLabel || scene.name),
        position: sceneInput.labelPosition || [50, 50],
      },
    },
    parent.hotspots.length,
  );
  const scenes = map.scenes.map((item) =>
    item.id === parent.id
      ? normaliseScene({
          ...item,
          hotspots: [...item.hotspots, navigationHotspot],
        })
      : item,
  );
  scenes.push(scene);
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes,
  };
}

export function updateVisualMapScene(visualMap, sceneId, patch = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes: map.scenes.map((scene) =>
      scene.id === sceneId
        ? normaliseScene({
            ...scene,
            ...patch,
            background: { ...scene.background, ...patch.background },
          })
        : scene,
    ),
  };
}

export function removeVisualMapScene(visualMap, sceneId) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  if (sceneId === map.defaultSceneId) return map;
  const removeIds = new Set([sceneId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const scene of map.scenes)
      if (
        scene.parentSceneId &&
        removeIds.has(scene.parentSceneId) &&
        !removeIds.has(scene.id)
      ) {
        removeIds.add(scene.id);
        changed = true;
      }
  }
  const scenes = map.scenes
    .filter((scene) => !removeIds.has(scene.id))
    .map((scene) =>
      normaliseScene({
        ...scene,
        hotspots: scene.hotspots.filter(
          (hotspot) => !removeIds.has(getVisualHotspotSceneId(hotspot)),
        ),
      }),
    );
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes,
  };
}

export function auditDevelopmentVisualMap(visualMap, inventory = []) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const sceneById = new Map(map.scenes.map((scene) => [scene.id, scene]));
  const inventoryIds = new Set(
    inventory.map((unit) => text(unit.id)).filter(Boolean),
  );
  const mappedUnitIds = new Set();
  const issues = [];
  const add = (severity, code, message, sceneId = null, targetId = null) =>
    issues.push({ severity, code, message, sceneId, targetId });

  if (!sceneById.has(map.defaultSceneId))
    add("error", "missing-default-scene", "The default scene does not exist.");
  for (const scene of map.scenes) {
    if (scene.parentSceneId && !sceneById.has(scene.parentSceneId))
      add(
        "error",
        "missing-parent-scene",
        `${scene.name} links to a missing parent scene.`,
        scene.id,
      );
    if (scene.hotspots.length && !scene.background.url)
      add(
        "error",
        "missing-scene-background",
        `${scene.name} has mapped areas but no plan or image.`,
        scene.id,
      );
    const duplicateIssues = findVisualMapHotspotIssues(map, scene.id);
    if (duplicateIssues.length)
      add(
        "error",
        "duplicate-hotspots",
        `${scene.name} contains ${duplicateIssues.length} duplicate mapping issue${duplicateIssues.length === 1 ? "" : "s"}.`,
        scene.id,
      );
    for (const hotspot of scene.hotspots) {
      if (hotspot.type === "unit") {
        mappedUnitIds.add(hotspot.target.id);
        if (inventoryIds.size && !inventoryIds.has(hotspot.target.id))
          add(
            "warning",
            "orphan-unit",
            `${hotspot.label.text || hotspot.target.id} is mapped but no longer exists in inventory.`,
            scene.id,
            hotspot.target.id,
          );
      }
      const childSceneId = getVisualHotspotSceneId(hotspot);
      if (hotspot.destination.type === "scene" && !childSceneId)
        add(
          "error",
          "empty-scene-destination",
          `${hotspot.label.text || hotspot.target.id} has no destination scene.`,
          scene.id,
          hotspot.target.id,
        );
      if (
        hotspot.destination.type === "external" &&
        !safeDestinationUrl(hotspot.destination.url)
      )
        add(
          "error",
          "invalid-external-destination",
          `${hotspot.label.text || hotspot.target.id} needs a valid http(s), email or telephone destination.`,
          scene.id,
          hotspot.target.id,
        );
      if (childSceneId) {
        const child = sceneById.get(childSceneId);
        if (!child)
          add(
            "error",
            "missing-child-scene",
            `${hotspot.label.text || hotspot.target.id} opens a missing scene.`,
            scene.id,
            hotspot.target.id,
          );
        else if (
          child.parentHotspotId === hotspot.id &&
          child.parentSceneId !== scene.id
        )
          add(
            "error",
            "parent-child-mismatch",
            `${child.name} does not point back to ${scene.name}.`,
            scene.id,
            hotspot.target.id,
          );
      }
    }
  }

  const reachable = new Set();
  const visit = (sceneId) => {
    if (reachable.has(sceneId)) return;
    reachable.add(sceneId);
    for (const hotspot of sceneById.get(sceneId)?.hotspots || []) {
      const childSceneId = getVisualHotspotSceneId(hotspot);
      if (childSceneId && sceneById.has(childSceneId)) visit(childSceneId);
    }
  };
  visit(map.defaultSceneId);
  const checked = new Set();
  const checking = new Set();
  const detectCycle = (sceneId) => {
    if (checking.has(sceneId)) {
      add(
        "error",
        "scene-cycle",
        `The visual journey contains a loop at ${sceneById.get(sceneId)?.name || sceneId}.`,
        sceneId,
      );
      return;
    }
    if (checked.has(sceneId)) return;
    checking.add(sceneId);
    for (const hotspot of sceneById.get(sceneId)?.hotspots || []) {
      const childSceneId = getVisualHotspotSceneId(hotspot);
      if (childSceneId && sceneById.has(childSceneId))
        detectCycle(childSceneId);
    }
    checking.delete(sceneId);
    checked.add(sceneId);
  };
  detectCycle(map.defaultSceneId);
  for (const scene of map.scenes)
    if (!reachable.has(scene.id))
      add(
        "error",
        "unreachable-scene",
        `${scene.name} cannot be reached from the masterplan.`,
        scene.id,
      );
  const unmappedUnitIds = [...inventoryIds].filter(
    (id) => !mappedUnitIds.has(id),
  );
  if (unmappedUnitIds.length)
    add(
      "warning",
      "unmapped-inventory",
      `${unmappedUnitIds.length} inventory unit${unmappedUnitIds.length === 1 ? " is" : "s are"} not mapped.`,
      map.defaultSceneId,
    );
  const assetKeys = new Set();
  for (const asset of map.assets) {
    const key = `${asset.url.toLowerCase()}|${asset.name.toLowerCase()}`;
    if (assetKeys.has(key))
      add(
        "error",
        "duplicate-visual-asset",
        `${asset.name} is duplicated in the visual asset workspace.`,
        null,
        asset.id,
      );
    assetKeys.add(key);
    if (["missing", "failed"].includes(asset.processingState))
      add(
        asset.visibility === "public" ? "error" : "warning",
        "unavailable-visual-asset",
        `${asset.name} is ${asset.processingState} and cannot be used publicly.`,
        null,
        asset.id,
      );
    if (asset.association.type !== "development" && !asset.association.id)
      add(
        "warning",
        "unassociated-visual-asset",
        `${asset.name} still needs a ${asset.association.type.replaceAll("_", " ")} association.`,
        null,
        asset.id,
      );
  }
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    ready: errors.length === 0,
    issues,
    errors,
    warnings,
    mappedUnitCount: mappedUnitIds.size,
    inventoryUnitCount: inventoryIds.size,
    coveragePercent: inventoryIds.size
      ? Math.round(
          (Math.min(mappedUnitIds.size, inventoryIds.size) /
            inventoryIds.size) *
            100,
        )
      : 100,
  };
}

/** Temporary UI projection. It keeps existing renderers operating from the
 * canonical scene without keeping a second persisted map model alive. */
export function projectVisualMapScene(visualMap, sceneId = "") {
  const scene = getVisualMapScene(visualMap, sceneId);
  const sitePlanMap = {};
  const hidden = new Set(scene?.hiddenTargetIds || []);
  for (const hotspot of scene?.hotspots || []) {
    if (hotspot.type !== "unit") continue;
    const coordinates = hotspot.geometry.coordinates;
    const [x, y] =
      hotspot.geometry.type === "polygon"
        ? coordinates
            .reduce(
              ([sumX, sumY], [pointX, pointY]) => [
                sumX + pointX,
                sumY + pointY,
              ],
              [0, 0],
            )
            .map((total) => Math.round((total / coordinates.length) * 10) / 10)
        : coordinates;
    sitePlanMap[hotspot.target.id] = {
      x,
      y,
      ...(hotspot.label?.text ? { sourceLabel: hotspot.label.text } : {}),
    };
    if (hotspot.visibility === "hidden") hidden.add(hotspot.target.id);
  }
  return {
    sitePlanUrl: scene?.background?.url || "",
    sitePlanMap,
    sitePlanViewport: scene?.viewport || normaliseSitePlanViewport(),
    sitePlanNotShownUnitIds: [...hidden],
  };
}

export function replaceVisualMapSceneHotspots(visualMap, sceneId, hotspots) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const selectedSceneId = text(sceneId) || map.defaultSceneId;
  const scenes = map.scenes.map((scene) =>
    scene.id === selectedSceneId
      ? normaliseScene({ ...scene, hotspots })
      : scene,
  );
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes,
  };
}

export function updateVisualMapHotspotDestination(
  visualMap,
  sceneId,
  hotspotId,
  destination,
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scene = getVisualMapScene(map, sceneId);
  return replaceVisualMapSceneHotspots(
    map,
    scene.id,
    scene.hotspots.map((hotspot) =>
      hotspot.id === hotspotId ? { ...hotspot, destination } : hotspot,
    ),
  );
}

function remapCoordinate([x, y], fromViewport, toViewport) {
  const sourceX = fromViewport.x + (x / 100) * fromViewport.width;
  const sourceY = fromViewport.y + (y / 100) * fromViewport.height;
  return [
    Math.round(
      clamp(((sourceX - toViewport.x) / toViewport.width) * 100) * 10,
    ) / 10,
    Math.round(
      clamp(((sourceY - toViewport.y) / toViewport.height) * 100) * 10,
    ) / 10,
  ];
}

export function remapVisualMapSceneViewport(visualMap, sceneId, nextViewport) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const selectedSceneId = text(sceneId) || map.defaultSceneId;
  const scenes = map.scenes.map((scene) => {
    if (scene.id !== selectedSceneId) return scene;
    const from = normaliseSitePlanViewport(scene.viewport);
    const to = normaliseSitePlanViewport(nextViewport);
    const hotspots = scene.hotspots.map((hotspot) => {
      const coordinates =
        hotspot.geometry.type === "polygon"
          ? hotspot.geometry.coordinates.map((point) =>
              remapCoordinate(point, from, to),
            )
          : remapCoordinate(hotspot.geometry.coordinates, from, to);
      const labelPosition = hotspot.label?.position
        ? remapCoordinate(hotspot.label.position, from, to)
        : undefined;
      return {
        ...hotspot,
        geometry: { ...hotspot.geometry, coordinates },
        label: {
          ...hotspot.label,
          ...(labelPosition ? { position: labelPosition } : {}),
        },
      };
    });
    return normaliseScene({ ...scene, viewport: to, hotspots });
  });
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes,
  };
}

export function findVisualMapHotspotIssues(visualMap, sceneId = "") {
  const scene = getVisualMapScene(visualMap, sceneId);
  const issues = [];
  const targets = new Map();
  const geometries = new Map();
  for (const hotspot of scene?.hotspots || []) {
    const targetKey = `${hotspot.target.type}:${hotspot.target.id}`;
    const geometryKey = JSON.stringify(hotspot.geometry);
    if (targets.has(targetKey))
      issues.push({
        type: "duplicate-target",
        hotspotIds: [targets.get(targetKey), hotspot.id],
        targetKey,
      });
    else targets.set(targetKey, hotspot.id);
    if (geometries.has(geometryKey))
      issues.push({
        type: "duplicate-geometry",
        hotspotIds: [geometries.get(geometryKey), hotspot.id],
        targetKey,
      });
    else geometries.set(geometryKey, hotspot.id);
  }
  return issues;
}

export function updateMasterplanScene(visualMap, patch = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const current = getVisualMapScene(map, patch.sceneId);
  const hiddenTargetIds =
    patch.sitePlanNotShownUnitIds === undefined
      ? current?.hiddenTargetIds || []
      : [
          ...new Set(
            (Array.isArray(patch.sitePlanNotShownUnitIds)
              ? patch.sitePlanNotShownUnitIds
              : []
            )
              .map(text)
              .filter(Boolean),
          ),
        ];
  const hidden = new Set(hiddenTargetIds);
  let hotspots = current?.hotspots || [];
  if (patch.sitePlanMap !== undefined) {
    const preservedRichHotspots = hotspots.filter(
      (hotspot) => hotspot.type !== "unit" || hotspot.geometry.type !== "point",
    );
    const pointHotspots = legacyMasterplanScene({
      sitePlanMap: patch.sitePlanMap,
      sitePlanNotShownUnitIds: hiddenTargetIds,
    }).hotspots;
    hotspots = [...preservedRichHotspots, ...pointHotspots];
  }
  hotspots = hotspots.map((hotspot) =>
    hotspot.type === "unit"
      ? {
          ...hotspot,
          visibility: hidden.has(hotspot.target.id) ? "hidden" : "public",
        }
      : hotspot,
  );
  const replacement = normaliseScene({
    ...current,
    background: {
      ...current?.background,
      ...(patch.sitePlanUrl !== undefined ? { url: patch.sitePlanUrl } : {}),
    },
    viewport:
      patch.sitePlanViewport === undefined
        ? current?.viewport
        : patch.sitePlanViewport,
    hiddenTargetIds,
    hotspots,
  });
  const scenes = map.scenes.map((scene) =>
    scene.id === replacement.id ? replacement : scene,
  );
  if (!scenes.some((scene) => scene.id === replacement.id))
    scenes.unshift(replacement);
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes,
  };
}

export function setVisualMapPublicationStatus(visualMap, publicationStatus) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const nextStatus = publicationStatus === "published" ? "published" : "draft";
  if (nextStatus === "published") {
    const revision = map.revision + 1;
    return {
      ...map,
      revision,
      publicationStatus: "published",
      publishedSnapshot: {
        revision,
        defaultSceneId: map.defaultSceneId,
        scenes: map.scenes,
        assets: map.assets.filter(
          (asset) =>
            asset.status === "approved" &&
            asset.visibility === "public" &&
            asset.processingState === "ready",
        ),
      },
    };
  }
  if (map.publicationStatus === "draft") return map;
  return { ...map, revision: map.revision + 1, publicationStatus: "draft" };
}

export function getPublishedVisualMap(visualMap) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  if (!map.publishedSnapshot) return map;
  return resolveDevelopmentVisualMap({
    visualMap: {
      schemaVersion: map.schemaVersion,
      revision: map.publishedSnapshot.revision,
      publicationStatus: "published",
      defaultSceneId: map.publishedSnapshot.defaultSceneId,
      scenes: map.publishedSnapshot.scenes,
      assets: map.publishedSnapshot.assets,
      publishedSnapshot: map.publishedSnapshot,
    },
  });
}

export function hydrateVisualMapMediaLibrary(mediaLibrary = {}, options = {}) {
  const visualMap = resolveDevelopmentVisualMap(mediaLibrary);
  const projectedMap = options.preferPublished
    ? getPublishedVisualMap(visualMap)
    : visualMap;
  return { ...mediaLibrary, visualMap, ...projectVisualMapScene(projectedMap) };
}

/** Remove every superseded writable field before persistence. */
export function retireLegacyVisualMapFields(mediaLibrary = {}) {
  const visualMap = resolveDevelopmentVisualMap(mediaLibrary);
  const {
    sitePlanUrl: _sitePlanUrl,
    site_plan_url: _sitePlanUrlSnake,
    sitePlanMap: _sitePlanMap,
    site_plan_map: _sitePlanMapSnake,
    sitePlanViewport: _sitePlanViewport,
    site_plan_viewport: _sitePlanViewportSnake,
    sitePlanNotShownUnitIds: _hiddenIds,
    site_plan_not_shown_unit_ids: _hiddenIdsSnake,
    masterplanUrl: _masterplanUrl,
    masterplan_url: _masterplanUrlSnake,
    visual_map: _visualMapSnake,
    ...rest
  } = mediaLibrary;
  return { ...rest, visualMap };
}
