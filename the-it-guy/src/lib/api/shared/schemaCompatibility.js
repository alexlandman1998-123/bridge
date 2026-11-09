// New domain code must keep compatibility decisions explicit and local. This
// helper prevents mutation of a caller-owned payload while retrying a write.
export function omitPayloadKeys(payload = {}, keys = []) {
  const omitted = new Set(keys)
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !omitted.has(key)))
}

// Extracted without changing validation, persistence order or recovery behaviour.
import { isMissingColumnError, isMissingTableError, isPermissionDeniedError } from './readHelpers.js'

export async function updateRecordByIdWithMissingColumnFallback(client, table, id, payload = {}, select = 'id') {
  let currentPayload = { ...payload }
  let result = await client.from(table).update(currentPayload).eq('id', id).select(select).limit(1)
  let attempts = 0

  while (result.error && attempts < 24) {
    const missingKey = Object.keys(currentPayload).find((key) => isMissingColumnError(result.error, key))
    if (!missingKey) break
    delete currentPayload[missingKey]
    if (!Object.keys(currentPayload).length) return null
    result = await client.from(table).update(currentPayload).eq('id', id).select(select).limit(1)
    attempts += 1
  }

  if (result.error) {
    if (isMissingTableError(result.error, table) || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}
