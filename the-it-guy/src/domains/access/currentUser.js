// access owns these operations and their existing recovery behavior.
import { normalizeNullableUuid } from '../../lib/api/shared/readHelpers.js'

export async function getCurrentSupabaseUserId(client) {
  try {
    const result = await client.auth.getUser()
    return normalizeNullableUuid(result?.data?.user?.id)
  } catch {
    return null
  }
}
