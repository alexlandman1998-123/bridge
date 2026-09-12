function isTransientJourneyCommandFailure(error) {
  if (!error) return false
  // The command receipt is keyed by commandId, so replaying the identical
  // payload after a statement timeout is safe: either the timed-out database
  // transaction rolled back, or a completed command returns its durable
  // receipt. Do not retry validation, permission, or stale-version errors.
  if (['57014', '08006', '08001', '53300'].includes(String(error.code || ''))) return true
  if (error.code) return false
  return /failed to fetch|fetch failed|network(?:error| request failed)|load failed|connection (?:reset|closed)|timed?\s*out/i.test(String(error.message || error))
}

async function retryDelay(attempt) {
  await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
}

// Retry only an uncertain transport failure, using the identical command identity.
// Database conflicts/validation errors must be handled by refreshing, not retried.
export async function commitSharedJourneyTask(client, payload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await client.rpc('bridge_update_attorney_workflow_step_v4', payload)
      if (!result || (!result.error && result.data == null)) throw new Error('No saved outcome was returned. Reload the matter to verify before retrying.')
      if (attempt < 2 && isTransientJourneyCommandFailure(result.error)) {
        await retryDelay(attempt)
        continue
      }
      return result
    } catch (error) {
      if (attempt === 2 || !isTransientJourneyCommandFailure(error)) throw error
      await retryDelay(attempt)
    }
  }
}

// A free-form professional or client-safe update must use the same durable
// transaction command as a task completion. This prevents one role seeing an
// update before another role's activity/journey read model has refreshed.
export async function commitSharedJourneyLaneUpdate(client, payload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await client.rpc('bridge_add_attorney_lane_update_and_sync_v1', payload)
      if (!result || (!result.error && result.data == null)) throw new Error('No saved outcome was returned. Reload the matter to verify before retrying.')
      if (attempt < 2 && isTransientJourneyCommandFailure(result.error)) {
        await retryDelay(attempt)
        continue
      }
      return result
    } catch (error) {
      if (attempt === 2 || !isTransientJourneyCommandFailure(error)) throw error
      await retryDelay(attempt)
    }
  }
}
