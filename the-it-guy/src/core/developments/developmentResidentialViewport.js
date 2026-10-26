/** A reversible view in scene coordinates. Preserve the full width and entrance. */
export function getResidentialPlanViewport(scene) {
  const points = (scene?.hotspots || [])
    .filter((hotspot) => hotspot.type === 'unit' && hotspot.visibility !== 'hidden')
    .flatMap((hotspot) => {
      const coordinates = hotspot.geometry?.coordinates;
      const geometryPoints = hotspot.geometry?.type === 'polygon' ? coordinates : [coordinates];
      return [...(geometryPoints || []), hotspot.label?.position]
        .filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite));
    });
  if (points.length < 2) return null;
  // Keep room above the first homes for labels, and retain the whole lower
  // drawing so the access road and entrance never disappear from this view.
  const y = Math.min(65, Math.max(0, Math.min(...points.map((point) => point[1])) - 8));
  return y > 5 ? { x: -5, y, width: 110, height: 100 - y } : null;
}
