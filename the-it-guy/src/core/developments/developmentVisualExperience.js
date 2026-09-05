import {
  getVisualHotspotSceneId,
  getVisualMapScene,
  resolveDevelopmentVisualMap,
} from "./developmentVisualMap.js";

const text = (value) => String(value || "").trim();

export function getLikelyNextVisualScene(visualMap, sceneId) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scene = getVisualMapScene(map, sceneId);
  const candidates = (scene?.hotspots || [])
    .filter((hotspot) => hotspot.visibility !== "hidden")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((hotspot) => getVisualHotspotSceneId(hotspot))
    .filter(Boolean);
  return candidates.length ? getVisualMapScene(map, candidates[0]) : null;
}

export function getVisualSceneFloorTabs(visualMap, sceneId) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const scene = getVisualMapScene(map, sceneId);
  if (!scene) return [];
  const parentId = scene.parentSceneId || scene.id;
  return map.scenes
    .filter(
      (candidate) =>
        candidate.type === "floor_plan" &&
        (candidate.parentSceneId || candidate.id) === parentId,
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getVisualScenePrompt(scene, hotspotCount = 0) {
  if (!scene || !hotspotCount) return "Browse the available residences";
  if (["masterplan", "aerial"].includes(scene.type))
    return "Select a building or home to explore";
  if (["building", "exterior", "elevation"].includes(scene.type))
    return "Select a floor or residence";
  if (scene.type === "floor_plan") return "Select a residence on this floor";
  return "Select a highlighted area to explore";
}

export function getVisualSceneImageCandidates(scene) {
  const sources = Array.isArray(scene?.background?.sources)
    ? scene.background.sources
    : [];
  return {
    avif: text(sources.find((source) => source.format === "avif")?.url),
    webp: text(sources.find((source) => source.format === "webp")?.url),
    fallback: text(scene?.background?.url),
  };
}

export function getPreferredVisualSceneImage(scene, supports = {}) {
  const candidates = getVisualSceneImageCandidates(scene);
  if (supports.avif && candidates.avif) return candidates.avif;
  if (supports.webp && candidates.webp) return candidates.webp;
  return candidates.fallback || candidates.webp || candidates.avif;
}

export function getVisualOrientation(scene) {
  const degrees = Number(scene?.orientationDegrees) || 0;
  return {
    degrees,
    label: degrees ? `North rotated ${degrees} degrees` : "North is up",
  };
}
