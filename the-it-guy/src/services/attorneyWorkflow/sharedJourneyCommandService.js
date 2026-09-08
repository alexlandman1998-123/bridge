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
