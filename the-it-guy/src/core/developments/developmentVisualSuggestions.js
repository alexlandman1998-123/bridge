import {
  addVisualMapChildScene,
  getVisualMapScene,
  replaceVisualMapSceneHotspots,
  resolveDevelopmentVisualMap,
} from "./developmentVisualMap.js";
import { addVisualJourneyLink } from "./developmentVisualJourney.js";

const text = (value) => String(value || "").trim();
const slug = (value) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const unitNumber = (unit) =>
  text(unit.displayNumber || unit.unitNumber || unit.unit_number || unit.id);
const unitType = (unit) =>
  text(unit.displayType || unit.unitType || unit.unit_type || unit.type);
const floorLabel = (unit) =>
  text(unit.floor || unit.floorNumber || unit.floor_number);
const blockLabel = (unit) =>
  text(unit.block || unit.blockName || unit.building || unit.buildingName);

function structureGroups(inventory, structureNodes) {
  const nodes = structureNodes.map((node) => ({
    id: text(node.id),
    parentId: text(node.parentId || node.parent_id),
    type: text(node.nodeType || node.node_type).toLowerCase(),
    label: text(node.label),
  }));
  const visualNodes = new Set([
    "phase",
    "building",
    "block",
    "precinct",
    "zone",
    "wing",
    "floor",
    "level",
  ]);
  const buildNode = (node) => ({
    id: node.id,
    label: node.label,
    type:
      node.type === "phase"
        ? "phase"
        : ["floor", "level"].includes(node.type)
          ? "floor_plan"
          : "building",
    targetType: ["floor", "level"].includes(node.type)
      ? "floor"
      : node.type === "phase"
        ? "phase"
        : "building",
    children: nodes
      .filter(
        (candidate) =>
          candidate.parentId === node.id && visualNodes.has(candidate.type),
      )
      .map(buildNode),
  });
  const topNodes = nodes.filter(
    (node) =>
      visualNodes.has(node.type) &&
      (!node.parentId ||
        !nodes.some((candidate) => candidate.id === node.parentId)),
  );
  if (topNodes.length) return topNodes.map(buildNode);
  const grouped = new Map();
  inventory.forEach((unit) => {
    const block = blockLabel(unit) || text(unit.phase || unit.phaseName);
    if (!block) return;
    const current = grouped.get(block) || new Set();
    if (floorLabel(unit)) current.add(floorLabel(unit));
    grouped.set(block, current);
  });
  return [...grouped].map(([label, floors]) => ({
    id: slug(label),
    label,
    type: "building",
    targetType: "building",
    children: [...floors].map((floor) => ({
      id: `${slug(label)}-floor-${slug(floor)}`,
      label: `Floor ${floor}`,
      associationId: floor,
      type: "floor_plan",
      targetType: "floor",
      children: [],
    })),
  }));
}

function groupUnits(inventory, keyFn) {
  const groups = new Map();
  inventory.forEach((unit) => {
    const key = keyFn(unit);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  });
  return groups;
}

export function buildDevelopmentVisualSuggestions({
  visualMap,
  inventory = [],
  structureNodes = [],
} = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const suggestions = [];
  const groups = structureGroups(inventory, structureNodes);
  const findGroupScene = (group) =>
    map.scenes.find((scene) => {
      const name = scene.name.toLowerCase();
      const label = group.label.toLowerCase();
      if (group.targetType === "floor")
        return (
          name === label ||
          name.includes(
            `floor ${text(group.associationId || group.label).toLowerCase()}`,
          )
        );
      return name === label || name.includes(label);
    });
  const missingGroups = [];
  const collectMissing = (group, proposedParentSceneId) => {
    const existing = findGroupScene(group);
    if (!existing) {
      missingGroups.push({ ...group, proposedParentSceneId });
      return;
    }
    (group.children || []).forEach((child) =>
      collectMissing(child, existing.id),
    );
  };
  groups.forEach((group) => collectMissing(group, map.defaultSceneId));
  if (missingGroups.length)
    suggestions.push({
      id: `hierarchy:${missingGroups.map((group) => slug(group.label)).join(":")}`,
      type: "scene_hierarchy",
      title: `Create ${missingGroups.length} structure view${missingGroups.length === 1 ? "" : "s"}`,
      description: `${missingGroups.map((group) => group.label).join(", ")} can be created from the existing development structure.`,
      payload: { groups: missingGroups },
    });

  const floorsByBlock = new Map();
  inventory.forEach((unit) => {
    const block = blockLabel(unit) || "Development";
    const floor = floorLabel(unit);
    if (!floor) return;
    if (!floorsByBlock.has(block)) floorsByBlock.set(block, new Map());
    const floors = floorsByBlock.get(block);
    if (!floors.has(floor)) floors.set(floor, []);
    floors.get(floor).push(unit);
  });
  for (const scene of map.scenes.filter(
    (item) => item.type === "elevation" && !item.hotspots.length,
  )) {
    const matching = [...floorsByBlock].find(([block]) =>
      scene.name.toLowerCase().includes(block.toLowerCase()),
    );
    const floors = matching?.[1] || [...floorsByBlock.values()][0];
    if (floors?.size)
      suggestions.push({
        id: `elevation-grid:${scene.id}`,
        type: "elevation_grid",
        title: `Generate ${floors.size} elevation row${floors.size === 1 ? "" : "s"}`,
        description: `${scene.name} can show one editable clickable row per floor.`,
        payload: {
          sceneId: scene.id,
          floors: [...floors].map(([label, units]) => ({
            label,
            unitIds: units.map((unit) => text(unit.id)),
          })),
        },
      });
  }

  const floorGroups = groupUnits(inventory, floorLabel);
  const floorScenes = map.scenes.filter((scene) => scene.type === "floor_plan");
  const mappedSource = floorScenes.find((scene) =>
    scene.hotspots.some((hotspot) => hotspot.type === "unit"),
  );
  if (mappedSource) {
    const sourceFloor = [...floorGroups.keys()].find((floor) =>
      mappedSource.name.toLowerCase().includes(floor.toLowerCase()),
    );
    const sourceUnits = floorGroups.get(sourceFloor) || [];
    for (const target of floorScenes.filter(
      (scene) => !scene.hotspots.length,
    )) {
      const targetFloor = [...floorGroups.keys()].find((floor) =>
        target.name.toLowerCase().includes(floor.toLowerCase()),
      );
      const targetUnits = floorGroups.get(targetFloor) || [];
      const sameShape =
        sourceUnits.length &&
        sourceUnits.length === targetUnits.length &&
        sourceUnits.map(unitType).sort().join("|") ===
          targetUnits.map(unitType).sort().join("|");
      if (sameShape)
        suggestions.push({
          id: `copy-floor:${mappedSource.id}:${target.id}`,
          type: "copy_floor",
          title: `Copy ${mappedSource.name} mappings to ${target.name}`,
          description: `${targetUnits.length} residences have the same unit-type pattern. The copied shapes remain editable.`,
          payload: {
            sourceSceneId: mappedSource.id,
            targetSceneId: target.id,
            sourceUnitIds: sourceUnits.map((unit) => text(unit.id)),
            targetUnitIds: targetUnits.map((unit) => text(unit.id)),
          },
        });
    }
  }

  for (const asset of map.assets.filter(
    (item) =>
      item.status === "approved" &&
      item.processingState === "ready" &&
      item.type === "floor_plan" &&
      item.association.type === "unit_type" &&
      item.association.id,
  )) {
    const units = inventory.filter(
      (unit) => unitType(unit) === asset.association.id,
    );
    if (
      units.length &&
      !map.scenes.some((scene) => scene.background.url === asset.url)
    )
      suggestions.push({
        id: `unit-type-plan:${asset.id}`,
        type: "unit_type_floorplan",
        title: `Link ${asset.name} to ${units.length} residence${units.length === 1 ? "" : "s"}`,
        description: `Create one shared ${asset.association.id} floor-plan view instead of configuring every residence separately.`,
        payload: {
          assetId: asset.id,
          unitType: asset.association.id,
          unitIds: units.map((unit) => text(unit.id)),
        },
      });
  }

  for (const scene of map.scenes.filter((item) => !item.hotspots.length)) {
    const matchingUnits = inventory.filter((unit) => {
      const name = scene.name.toLowerCase();
      return [blockLabel(unit), floorLabel(unit), unitType(unit)]
        .filter(Boolean)
        .some((value) => name.includes(value.toLowerCase()));
    });
    if (matchingUnits.length)
      suggestions.push({
        id: `next:${scene.id}`,
        type: "likely_next",
        title: `Connect ${scene.name} to ${matchingUnits.length === 1 ? "its residence" : "matching residences"}`,
        description:
          matchingUnits.length === 1
            ? `Open ${unitNumber(matchingUnits[0])} directly.`
            : "Open a filtered inventory group if no deeper visual is available.",
        payload: {
          sceneId: scene.id,
          unitIds: matchingUnits.map((unit) => text(unit.id)),
          block: blockLabel(matchingUnits[0]),
          floor: floorLabel(matchingUnits[0]),
        },
      });
  }
  return suggestions;
}

const evenlySpacedPoint = (index, total) => [
  Math.round(((index + 1) / (total + 1)) * 100 * 10) / 10,
  50,
];

export function applyDevelopmentVisualSuggestion(
  visualMap,
  suggestion,
  inventory = [],
) {
  let map = resolveDevelopmentVisualMap({ visualMap });
  if (!suggestion?.type) return map;
  if (suggestion.type === "scene_hierarchy") {
    const addGroup = (group, parentSceneId) => {
      const asset = map.assets.find(
        (item) =>
          item.status === "approved" &&
          [group.label, group.associationId].includes(item.association.id) &&
          (group.type === "floor_plan"
            ? item.type === "floor_plan"
            : ["aerial", "exterior", "elevation"].includes(item.type)),
      );
      map = addVisualMapChildScene(map, parentSceneId, {
        name: group.label,
        type: group.type,
        targetType: group.targetType,
        targetId: group.associationId || group.id,
        background: { url: asset?.url || "" },
      });
      const groupSceneId = map.scenes.at(-1).id;
      (group.children || []).forEach((child) => addGroup(child, groupSceneId));
    };
    for (const group of suggestion.payload.groups) {
      addGroup(group, group.proposedParentSceneId || map.defaultSceneId);
    }
    return map;
  }
  if (suggestion.type === "elevation_grid") {
    const { sceneId, floors } = suggestion.payload;
    const rowHeight = 80 / floors.length;
    const hotspots = floors.map((floor, index) => ({
      id: `floor-row:${slug(floor.label)}`,
      type: "floor",
      target: { type: "floor", id: floor.label },
      geometry: {
        type: "polygon",
        coordinates: [
          [10, 10 + index * rowHeight],
          [90, 10 + index * rowHeight],
          [90, 10 + (index + 1) * rowHeight],
          [10, 10 + (index + 1) * rowHeight],
        ],
      },
      label: {
        text: `Floor ${floor.label}`,
        position: [50, 10 + (index + 0.5) * rowHeight],
      },
      destination: {
        type: "inventory_filter",
        filters: { floor: floor.label },
      },
    }));
    return replaceVisualMapSceneHotspots(map, sceneId, hotspots);
  }
  if (suggestion.type === "copy_floor") {
    const source = getVisualMapScene(map, suggestion.payload.sourceSceneId);
    const targetIds = suggestion.payload.targetUnitIds;
    const sourceIds = suggestion.payload.sourceUnitIds;
    const sourceById = new Map(
      source.hotspots.map((hotspot) => [hotspot.target.id, hotspot]),
    );
    const hotspots = targetIds.flatMap((targetId, index) => {
      const sourceHotspot = sourceById.get(sourceIds[index]);
      const unit = inventory.find((item) => text(item.id) === targetId);
      if (!sourceHotspot) return [];
      return [
        {
          ...sourceHotspot,
          id: `unit:${targetId}`,
          target: { type: "unit", id: targetId },
          destination: { type: "unit", unitId: targetId },
          label: {
            ...sourceHotspot.label,
            text: unitNumber(unit || { id: targetId }),
            ...(suggestion.payload.mirror && sourceHotspot.label?.position
              ? {
                  position: [
                    100 - sourceHotspot.label.position[0],
                    sourceHotspot.label.position[1],
                  ],
                }
              : {}),
          },
          geometry: suggestion.payload.mirror
            ? {
                ...sourceHotspot.geometry,
                coordinates:
                  sourceHotspot.geometry.type === "polygon"
                    ? sourceHotspot.geometry.coordinates.map(([x, y]) => [
                        100 - x,
                        y,
                      ])
                    : [
                        100 - sourceHotspot.geometry.coordinates[0],
                        sourceHotspot.geometry.coordinates[1],
                      ],
              }
            : sourceHotspot.geometry,
        },
      ];
    });
    return replaceVisualMapSceneHotspots(
      map,
      suggestion.payload.targetSceneId,
      hotspots,
    );
  }
  if (suggestion.type === "unit_type_floorplan") {
    const asset = map.assets.find(
      (item) => item.id === suggestion.payload.assetId,
    );
    if (!asset) return map;
    map = addVisualMapChildScene(map, map.defaultSceneId, {
      name: `${suggestion.payload.unitType} floor plan`,
      type: "floor_plan",
      targetType: "building",
      targetId: suggestion.payload.unitType,
      background: { url: asset.url },
    });
    const sceneId = map.scenes.at(-1).id;
    suggestion.payload.unitIds.forEach((unitId, index, ids) => {
      const unit = inventory.find((item) => text(item.id) === unitId);
      map = addVisualJourneyLink(map, sceneId, {
        label: `Residence ${unitNumber(unit || { id: unitId })}`,
        destination: { type: "unit", unitId },
        position: evenlySpacedPoint(index, ids.length),
      });
    });
    return map;
  }
  if (suggestion.type === "likely_next") {
    const { sceneId, unitIds, block, floor } = suggestion.payload;
    if (unitIds.length === 1)
      return addVisualJourneyLink(map, sceneId, {
        label: "View property details",
        destination: { type: "unit", unitId: unitIds[0] },
      });
    const filters = block ? { block } : floor ? { floor } : {};
    return addVisualJourneyLink(map, sceneId, {
      label: "View available residences",
      destination: { type: "inventory_filter", filters },
    });
  }
  return map;
}
