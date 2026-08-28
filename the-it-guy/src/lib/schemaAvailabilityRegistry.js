const unavailableSources = new Set()

function normalizeSourceName(sourceName = '') {
  return String(sourceName || '').trim().toLowerCase()
}

export function isSchemaSourceUnavailable(sourceName) {
  const key = normalizeSourceName(sourceName)
  return key ? unavailableSources.has(key) : false
}

export function markSchemaSourceUnavailable(sourceName) {
  const key = normalizeSourceName(sourceName)
  if (!key) return false
  const wasKnown = unavailableSources.has(key)
  unavailableSources.add(key)
  return !wasKnown
}

export function clearSchemaAvailabilityRegistry() {
  unavailableSources.clear()
}

export const __schemaAvailabilityRegistryTestUtils = Object.freeze({
  getUnavailableSources: () => [...unavailableSources],
})
