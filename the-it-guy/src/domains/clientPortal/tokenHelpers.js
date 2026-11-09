// clientPortal owns these operations and their existing recovery behavior.


export function generateClientPortalToken() {
  return `clp${crypto.randomUUID().replaceAll('-', '')}`
}

export function normalizeDocumentKeyCandidate(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
}
