// GeoJSON coordinates use [longitude, latitude]. Preserve all rings and islands.
export function verifiedBoundaryGeometry(value) {
  if (value?.type !== 'MultiPolygon' || !Array.isArray(value.coordinates) || !value.coordinates.length || value.coordinates.length > 100) return null;
  let count = 0;
  for (const polygon of value.coordinates) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 100) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (count += ring.length) > 5000) return null;
      if (ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return null;
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return null;
      const area = ring.slice(1).reduce((a,p,i) => a + ring[i][0]*p[1]-p[0]*ring[i][1],0);
      if (Math.abs(area) < 1e-12) return null;
    }
  }
  return { type: 'MultiPolygon', coordinates: value.coordinates };
}

export function boundaryFromWkt(wkt) {
  if (typeof wkt !== 'string' || wkt.length > 250000) return null;
  // Supplier demo documents geographic WKT. Reject unknown projections/dimensions.
  const match = wkt.trim().match(/^(?:SRID=4326;\s*)?(MULTIPOLYGON|POLYGON)\s*(\(.*\))$/i);
  if (!match) return null;
  try {
    const source = match[2].replace(/\(/g,'[').replace(/\)/g,']')
      .replace(/([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g,'[$1,$2]');
    const coordinates = JSON.parse(source);
    return verifiedBoundaryGeometry({type:'MultiPolygon',coordinates:match[1].toUpperCase()==='POLYGON'?[coordinates]:coordinates});
  } catch { return null; }
}
