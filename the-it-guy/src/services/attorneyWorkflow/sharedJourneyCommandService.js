// Retry only an uncertain transport failure, using the identical command identity.
// Database conflicts/validation errors must be handled by refreshing, not retried.
export async function commitSharedJourneyTask(client, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await client.rpc('bridge_update_attorney_workflow_step_v4', payload)
      if (result.error && !result.error.code && attempt === 0) continue
      return result
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}

// A free-form professional or client-safe update must use the same durable
// transaction command as a task completion. This prevents one role seeing an
// update before another role's activity/journey read model has refreshed.
export async function commitSharedJourneyLaneUpdate(client, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await client.rpc('bridge_add_attorney_lane_update_and_sync_v1', payload)
      if (result.error && !result.error.code && attempt === 0) continue
      return result
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}
