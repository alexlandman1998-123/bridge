import {
  auditDevelopmentVisualMap,
  getVisualMapSceneUnitIds,
  resolveDevelopmentVisualMap,
} from "./developmentVisualMap.js";
import { buildDevelopmentVisualCapabilityReport } from "./developmentVisualCapabilities.js";

const text = (value) => String(value || "").trim();

export const VISUAL_PREVIEW_DEVICES = Object.freeze([
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "tablet", label: "Tablet", width: 820 },
  { id: "mobile", label: "Mobile", width: 390 },
]);

export const VISUAL_PREVIEW_SCENARIOS = Object.freeze([
  { id: "live_draft", label: "Current draft" },
  { id: "missing_asset", label: "Missing asset fallback" },
  { id: "failed_image", label: "Failed image" },
  { id: "sold_reserved", label: "Sold and reserved states" },
]);

function issue(status, code, label, detail, sceneId = null) {
  return { status, code, label, detail, sceneId };
}

export function compareVisualMapDraftToPublished(visualMap) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const published = map.publishedSnapshot;
  if (!published)
    return {
      hasPublishedSnapshot: false,
      changed: true,
      summary: "This development has not published a visual journey yet.",
      sceneDelta: map.scenes.length,
      hotspotDelta: map.scenes.reduce(
        (total, scene) => total + scene.hotspots.length,
        0,
      ),
      assetDelta: map.assets.length,
    };
  const hotspotCount = (scenes) =>
    scenes.reduce((total, scene) => total + scene.hotspots.length, 0);
  const sceneDelta = map.scenes.length - published.scenes.length;
  const hotspotDelta =
    hotspotCount(map.scenes) - hotspotCount(published.scenes);
  const assetDelta =
    map.assets.length -
    (Array.isArray(published.assets) ? published.assets.length : 0);
  const changed =
    map.revision !== published.revision ||
    sceneDelta !== 0 ||
    hotspotDelta !== 0 ||
    assetDelta !== 0;
  return {
    hasPublishedSnapshot: true,
    changed,
    sceneDelta,
    hotspotDelta,
    assetDelta,
    summary: changed
      ? sceneDelta || hotspotDelta || assetDelta
        ? `${Math.abs(sceneDelta)} scene, ${Math.abs(hotspotDelta)} hotspot and ${Math.abs(assetDelta)} asset changes since the live snapshot.`
        : "Content or journey settings have changed since the live snapshot."
      : "The draft matches the live visual journey.",
  };
}

export function buildDevelopmentVisualPreviewReadiness({
  visualMap,
  inventory = [],
} = {}) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const audit = auditDevelopmentVisualMap(map, inventory);
  const capability = buildDevelopmentVisualCapabilityReport({
    visualMap: map,
    inventory,
  });
  const checks = [];
  map.scenes.forEach((scene) => {
    const sceneCapability = capability.scenes.find(
      (item) => item.sceneId === scene.id,
    );
    checks.push(
      issue(
        sceneCapability?.mode === "unavailable"
          ? "error"
          : sceneCapability?.hasDeadEnd
            ? "warning"
            : "ready",
        "entry-experience",
        scene.name,
        sceneCapability?.reason || "No capability result.",
        scene.id,
      ),
    );
    if (!text(scene.name))
      checks.push(
        issue(
          "error",
          "accessible-scene-name",
          "Scene name",
          "Every view needs a descriptive name.",
          scene.id,
        ),
      );
    scene.hotspots.forEach((hotspot) => {
      if (!text(hotspot.label?.text))
        checks.push(
          issue(
            "warning",
            "accessible-hotspot-label",
            `${scene.name} clickable area`,
            "Add a buyer-readable label for keyboard and screen-reader users.",
            scene.id,
          ),
        );
    });
    if (scene.hotspots.length > 250)
      checks.push(
        issue(
          "warning",
          "hotspot-budget",
          `${scene.name} performance`,
          `${scene.hotspots.length} hotspots exceed the recommended 250-per-scene budget.`,
          scene.id,
        ),
      );
    const pixels =
      Number(scene.background.width || 0) *
      Number(scene.background.height || 0);
    if (pixels > 16000000)
      checks.push(
        issue(
          "warning",
          "image-pixel-budget",
          `${scene.name} image size`,
          "The source exceeds 16 megapixels; create a responsive web rendition.",
          scene.id,
        ),
      );
  });
  map.assets.forEach((asset) => {
    if (asset.visibility === "public" && asset.processingState !== "ready")
      checks.push(
        issue(
          "error",
          "asset-loading",
          asset.name,
          `The public asset is ${asset.processingState}.`,
        ),
      );
  });
  audit.errors.forEach((entry) =>
    checks.push(
      issue(
        "error",
        entry.code,
        "Structural validation",
        entry.message,
        entry.sceneId,
      ),
    ),
  );
  audit.warnings.forEach((entry) =>
    checks.push(
      issue(
        "warning",
        entry.code,
        "Launch warning",
        entry.message,
        entry.sceneId,
      ),
    ),
  );
  const errors = checks.filter((item) => item.status === "error");
  const warnings = checks.filter((item) => item.status === "warning");
  return {
    safeToPublish: errors.length === 0,
    decision: errors.length
      ? "blocked"
      : warnings.length
        ? "safe_with_fallbacks"
        : "ready",
    checks,
    errors,
    warnings,
    capability,
    comparison: compareVisualMapDraftToPublished(map),
  };
}

export function buildVisualPreviewScenario(
  visualMap,
  inventory = [],
  scenarioId = "live_draft",
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  if (scenarioId === "missing_asset") {
    return {
      visualMap: {
        ...map,
        scenes: map.scenes.map((scene) =>
          scene.id === map.defaultSceneId
            ? { ...scene, background: { ...scene.background, url: "" } }
            : scene,
        ),
      },
      inventory,
      failedSceneIds: [],
    };
  }
  if (scenarioId === "failed_image")
    return {
      visualMap: map,
      inventory,
      failedSceneIds: [map.defaultSceneId],
    };
  if (scenarioId === "sold_reserved")
    return {
      visualMap: map,
      inventory: inventory.map((unit, index) => ({
        ...unit,
        status: index % 2 ? "Reserved" : "Sold",
      })),
      failedSceneIds: [],
    };
  return { visualMap: map, inventory, failedSceneIds: [] };
}

export function rollbackVisualMapToPublishedSnapshot(visualMap) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  if (!map.publishedSnapshot) return map;
  return resolveDevelopmentVisualMap({
    visualMap: {
      ...map,
      revision: map.revision + 1,
      publicationStatus: "draft",
      defaultSceneId: map.publishedSnapshot.defaultSceneId,
      scenes: map.publishedSnapshot.scenes,
      assets: map.publishedSnapshot.assets || [],
      publishedSnapshot: map.publishedSnapshot,
    },
  });
}

export function getVisualPreviewJourneyKinds(visualMap) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const rootUnits = getVisualMapSceneUnitIds(map, map.defaultSceneId);
  const groupScenes = map.scenes.filter((scene) =>
    ["phase", "building", "elevation"].includes(scene.type),
  );
  return {
    singleHome: rootUnits.length <= 1,
    multiBlock: groupScenes.length > 1,
    entrySceneIds: [
      map.defaultSceneId,
      ...groupScenes.map((scene) => scene.id),
    ],
  };
}

export async function validateVisualMapAssetLoading(
  visualMap,
  load = (url) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    }),
) {
  const map = resolveDevelopmentVisualMap({ visualMap });
  const urls = [
    ...new Set(map.scenes.map((scene) => scene.background.url).filter(Boolean)),
  ];
  const results = await Promise.all(
    urls.map(async (url) => ({ url, loaded: await load(url) })),
  );
  return {
    results,
    ready: results.every((result) => result.loaded),
    failedUrls: results
      .filter((result) => !result.loaded)
      .map((result) => result.url),
  };
}
