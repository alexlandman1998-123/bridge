function normalizeText(value) {
  return String(value || '').trim()
}

export function buildCommercialCanvassingPath(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    const normalized = normalizeText(value)
    if (normalized) query.set(key, normalized)
  })
  const suffix = query.toString()
  return suffix ? `/commercial/canvassing?${suffix}` : '/commercial/canvassing'
}

