const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

const number = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * The viewport is expressed as a percentage of the original asset. Keeping it
 * separate from the asset means the source drawing remains recoverable.
 */
export function normaliseSitePlanViewport(viewport = {}) {
  const width = clamp(number(viewport.width, 100), 35, 100)
  const height = clamp(number(viewport.height, 100), 35, 100)
  return {
    x: clamp(number(viewport.x, 0), 0, 100 - width),
    y: clamp(number(viewport.y, 0), 0, 100 - height),
    width,
    height,
  }
}

export function isFullSitePlanViewport(viewport = {}) {
  const value = normaliseSitePlanViewport(viewport)
  return value.x === 0 && value.y === 0 && value.width === 100 && value.height === 100
}

/** Keep saved unit markers attached to their source-plan location after a crop. */
export function remapSitePlanCoordinates(sitePlanMap = {}, fromViewport = {}, toViewport = {}) {
  const from = normaliseSitePlanViewport(fromViewport)
  const to = normaliseSitePlanViewport(toViewport)
  return Object.fromEntries(
    Object.entries(sitePlanMap || {}).flatMap(([unitId, point]) => {
      const x = Number(point?.x)
      const y = Number(point?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []

      const sourceX = from.x + (x / 100) * from.width
      const sourceY = from.y + (y / 100) * from.height
      const nextX = ((sourceX - to.x) / to.width) * 100
      const nextY = ((sourceY - to.y) / to.height) * 100
      // Markers outside the new crop deliberately become unplaced so they are
      // never published floating at an incorrect edge.
      if (nextX < 0 || nextX > 100 || nextY < 0 || nextY > 100) return []
      return [[unitId, { x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 }]]
    }),
  )
}
