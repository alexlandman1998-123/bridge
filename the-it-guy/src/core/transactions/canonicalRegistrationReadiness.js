const MILESTONES = Object.freeze({transfer:'lodged_at_deeds_office',bond:'bond_lodged',cancellation:'cancellation_lodged'})

// An explicit, current plan and a fresh professional snapshot replace legacy
// stage labels. Missing lanes and provisional/stale plans never prove readiness.
export function canonicalRegistrationReadiness(transaction = {}, journey = null) {
  const routing=transaction.routing_profile_json || transaction.routingProfile || {}
  const plan=routing.workflowPlan
  if(plan?.status!=='active')return {available:false,ready:false,requiredLaneKeys:[],lanes:{}}
  const profile=routing.matterProfile || {}
  const requiredLaneKeys=Array.isArray(plan.laneKeys)?plan.laneKeys:[]
  const planValid=plan.provisional===false && profile.status==='confirmed' &&
    Boolean(profile.factFingerprint) && plan.matterProfileFingerprint===profile.factFingerprint &&
    String(plan.matterProfileRevision)===String(profile.revision) && requiredLaneKeys.includes('transfer') &&
    new Set(requiredLaneKeys).size===requiredLaneKeys.length &&
    requiredLaneKeys.every(key=>Object.hasOwn(MILESTONES,key))
  const snapshot=journey?.status==='ready'?journey.snapshot:null
  const sameLanes=snapshot?.requiredLaneKeys?.length===requiredLaneKeys.length &&
    requiredLaneKeys.every(key=>snapshot.requiredLaneKeys.includes(key))
  const snapshotValid=Boolean(snapshot && snapshot.transactionId===transaction.id && sameLanes)
  const lanes=Object.fromEntries(requiredLaneKeys.map(key=>{
    const lane=snapshot?.lanes?.find(lane=>lane.key===key)
    const tasks=lane?.phases?.flatMap(phase=>phase.tasks||[])||[]
    return [key,planValid && snapshotValid && tasks.some(task=>task.key===MILESTONES[key]&&task.status==='completed')]
  }))
  return {available:true,ready:planValid&&snapshotValid&&requiredLaneKeys.every(key=>lanes[key]),
    planValid,snapshotValid,requiredLaneKeys,lanes,
    message:!planValid?'Confirm and reconcile the current legal matter plan.':
      !snapshotValid?'Refresh the current legal journey before registration.':
      'Complete lodgement in every required legal lane before registration.'}
}
