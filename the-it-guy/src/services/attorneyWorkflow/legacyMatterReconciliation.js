import { buildMatterWorkflowPlan, getApplicableAttorneyTaskDefinitions } from './matterWorkflowPlanService.js'

// A renamed/merged task is not proof that all of the newer work was completed.
// Preserve the source row and expose the mapping for review, never promote it.
export function previewLegacyMatterReconciliation(routingProfile = {}, lanes = []) {
  const plan = buildMatterWorkflowPlan({ routingProfile })
  plan.lanes = lanes.map(lane => {
    const planned = plan.lanes.find(item => item.laneKey === lane.laneKey)
    const definitions = getApplicableAttorneyTaskDefinitions({ laneKey: lane.laneKey })
    const stepKeys = planned?.stepKeys || definitions.map(task => task.key)
    return { laneKey: lane.laneKey, stepKeys, taskCount: stepKeys.length }
  })
  plan.laneKeys = plan.lanes.map(lane => lane.laneKey)
  const review = lanes.flatMap(lane => {
    const definitions = getApplicableAttorneyTaskDefinitions({ laneKey: lane.laneKey })
    const keys = new Set(plan.lanes.find(item => item.laneKey === lane.laneKey).stepKeys)
    return (lane.steps || []).filter(step => !keys.has(step.step_key)).map(step => ({
      laneKey: lane.laneKey, sourceKey: step.step_key,
      targetKey: definitions.find(task => task.aliases?.includes(step.step_key))?.key || null,
      sourceStatus: step.status, disposition: 'retained_for_review',
    }))
  })
  return { plan, review }
}
