import {
  addVisualMapChildScene,
  getVisualHotspotSceneId,
  getVisualMapScene,
  removeVisualMapScene,
  replaceVisualMapSceneHotspots,
  resolveDevelopmentVisualMap,
  updateVisualMapScene,
} from "./developmentVisualMap.js";

const text = (value) => String(value || "").trim();

export const VISUAL_JOURNEY_TEMPLATES = Object.freeze([
  {
    id: "single_home",
    name: "Single home",
    description: "Aerial view → exterior render → property details",
    scenes: [
      { name: "Aerial view", type: "aerial" },
      { name: "Exterior render", type: "exterior" },
    ],
  },
  {
    id: "apartment_building",
    name: "Apartment building",
    description: "Aerial view → building elevation → floor plan → residence",
    scenes: [
      { name: "Aerial view", type: "aerial" },
      { name: "Building elevation", type: "elevation" },
      { name: "Floor plan", type: "floor_plan" },
    ],
  },
  {
    id: "multi_block_estate",
    name: "Multi-block estate",
    description: "Masterplan → block view → floor plan → residence",
    scenes: [
      { name: "Masterplan", type: "masterplan" },
      { name: "Block view", type: "exterior" },
      { name: "Floor plan", type: "floor_plan" },
    ],
  },
]);

export function buildVisualJourneyOutline(visualMap) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  return [...map.scenes]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      type: scene.type,
      imageUrl: scene.background.url,
      parentSceneId: scene.parentSceneId,
      destinations: scene.hotspots
        .filter((hotspot) => hotspot.visibility !== "hidden")
        .map((hotspot) => ({
          hotspotId: hotspot.id,
          label: hotspot.label.text || hotspot.target.id,
          destination: hotspot.destination,
        })),
    }));
}

export function addVisualJourneyLink(
  visualMap,
  sceneId,
  { label, destination, position = [50, 50] } = {},
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scene = getVisualMapScene(map, sceneId);
  const targetType = destination?.type === "unit" ? "unit" : "building";
  const targetId = text(
    destination?.unitId ||
      destination?.sceneId ||
      Object.values(destination?.filters || {})[0] ||
      label,
  );
  if (!targetId || !destination?.type) return map;
  const baseId = `journey:${scene.id}:${targetType}:${targetId}`
    .toLowerCase()
    .replace(/[^a-z0-9:-]+/g, "-");
  let id = baseId;
  let suffix = 2;
  while (scene.hotspots.some((hotspot) => hotspot.id === id))
    id = `${baseId}:${suffix++}`;
  return replaceVisualMapSceneHotspots(map, scene.id, [
    ...scene.hotspots,
    {
      id,
      type: targetType,
      target: { type: targetType, id: targetId },
      geometry: { type: "point", coordinates: position },
      label: { text: text(label) || targetId, position },
      destination,
      visibility: "public",
      displayOrder: scene.hotspots.length,
    },
  ]);
}

export function reorderVisualJourneyScene(visualMap, sceneId, direction) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scenes = [...map.scenes].sort(
    (left, right) => left.displayOrder - right.displayOrder,
  );
  const index = scenes.findIndex((scene) => scene.id === sceneId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= scenes.length) return map;
  [scenes[index], scenes[nextIndex]] = [scenes[nextIndex], scenes[index]];
  return {
    ...map,
    revision: map.revision + 1,
    publicationStatus: "draft",
    scenes: scenes.map((scene, displayOrder) => ({ ...scene, displayOrder })),
  };
}

export function removeVisualJourneyScene(
  visualMap,
  sceneId,
  replacementSceneId = "",
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  if (sceneId === map.defaultSceneId) return map;
  const replacement = map.scenes.find(
    (scene) => scene.id === replacementSceneId && scene.id !== sceneId,
  );
  const removing = map.scenes.find((scene) => scene.id === sceneId);
  if (!removing) return map;
  if (!replacement) return removeVisualMapScene(map, sceneId);
  const inheritedHotspots = removing.hotspots.filter(
    (hotspot) => getVisualHotspotSceneId(hotspot) !== replacement.id,
  );
  const scenes = map.scenes
    .filter((scene) => scene.id !== sceneId)
    .map((scene) => ({
      ...scene,
      parentSceneId:
        scene.parentSceneId === sceneId
          ? scene.id === replacement.id
            ? removing.parentSceneId
            : replacement.id
          : scene.parentSceneId,
      parentHotspotId:
        scene.parentSceneId === sceneId
          ? scene.id === replacement.id
            ? removing.parentHotspotId
            : inheritedHotspots.find(
                (hotspot) => getVisualHotspotSceneId(hotspot) === scene.id,
              )?.id || scene.parentHotspotId
          : scene.parentHotspotId,
      hotspots: scene.hotspots
        .flatMap((hotspot) => {
          if (getVisualHotspotSceneId(hotspot) !== sceneId) return [hotspot];
          return [
            {
              ...hotspot,
              destination: { type: "scene", sceneId: replacement.id },
            },
          ];
        })
        .concat(
          scene.id === replacement.id
            ? inheritedHotspots.filter(
                (hotspot) =>
                  !scene.hotspots.some(
                    (existing) => existing.id === hotspot.id,
                  ),
              )
            : [],
        ),
    }));
  return resolveDevelopmentVisualMap({
    visualMap: {
      ...map,
      revision: map.revision + 1,
      publicationStatus: "draft",
      scenes,
    },
  });
}

export function applyVisualJourneyTemplate(
  visualMap,
  templateId,
  { inventory = [], assetByType = {} } = {},
) {
  const template = VISUAL_JOURNEY_TEMPLATES.find(
    (item) => item.id === templateId,
  );
  let map = resolveDevelopmentVisualMap({ visualMap });
  if (!template) return map;
  const root = getVisualMapScene(map, map.defaultSceneId);
  map = updateVisualMapScene(map, root.id, {
    name: template.scenes[0].name,
    type: template.scenes[0].type,
    background: {
      url: assetByType[template.scenes[0].type]?.url || root.background.url,
    },
  });
  let parentId = root.id;
  for (const definition of template.scenes.slice(1)) {
    map = addVisualMapChildScene(map, parentId, {
      ...definition,
      background: { url: assetByType[definition.type]?.url || "" },
    });
    parentId = map.scenes.at(-1).id;
  }
  const unit = inventory[0];
  if (unit)
    map = addVisualJourneyLink(map, parentId, {
      label: `Residence ${unit.displayNumber || unit.unitNumber || unit.id}`,
      destination: { type: "unit", unitId: text(unit.id) },
    });
  return map;
}
