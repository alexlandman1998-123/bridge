function normalizeForCanonicalJson(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeForCanonicalJson(item))
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        const normalized = normalizeForCanonicalJson(value[key])
        if (normalized !== undefined) accumulator[key] = normalized
        return accumulator
      }, {})
  }
  return value
}

export function canonicalizeBondApplicationSnapshot(value) {
  return JSON.stringify(normalizeForCanonicalJson(value))
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashCanonicalBondApplicationPayload(value) {
  const canonicalJson = canonicalizeBondApplicationSnapshot(value)
  const encoder = new TextEncoder()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(canonicalJson))
  return bytesToHex(digest)
}

export async function hashBondApplicationSnapshot(snapshot) {
  return hashCanonicalBondApplicationPayload(snapshot)
}
