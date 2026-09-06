// New domain code must keep compatibility decisions explicit and local. This
// helper prevents mutation of a caller-owned payload while retrying a write.
export function omitPayloadKeys(payload = {}, keys = []) {
  const omitted = new Set(keys)
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !omitted.has(key)))
}
