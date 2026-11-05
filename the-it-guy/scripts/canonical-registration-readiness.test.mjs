import assert from 'node:assert/strict'
import {canonicalRegistrationReadiness} from '../src/core/transactions/canonicalRegistrationReadiness.js'
import {buildRegistrationReadinessShortcut} from '../src/core/transactions/registrationReadinessShortcut.js'
const transaction={id:'matter',finance_type:'cash',stage:'OTP Signed',attorney_stage:'instruction_received',
 routing_profile_json:{matterProfile:{status:'confirmed',revision:2,factFingerprint:'current'},
 workflowPlan:{status:'active',provisional:false,laneKeys:['transfer'],matterProfileRevision:2,matterProfileFingerprint:'current'}}}
const journey={status:'ready',snapshot:{transactionId:'matter',requiredLaneKeys:['transfer'],lanes:[{key:'transfer',phases:[{
 key:'registration',tasks:[{key:'lodged_at_deeds_office',status:'completed'},{key:'matter_closed',status:'not_started'}]}]}]}}
const clone=value=>structuredClone(value)
assert.equal(canonicalRegistrationReadiness(transaction,journey).ready,true)
assert.equal(buildRegistrationReadinessShortcut({transaction,workflows:{},rollup:{transactionJourneySnapshot:{legalJourney:journey}}}).ready,true,
 'Authoritative lodged work must not be blocked by old instruction-stage projections.')
const bonded=clone(transaction);bonded.routing_profile_json.workflowPlan.laneKeys.push('bond')
const partial=clone(journey);partial.snapshot.requiredLaneKeys.push('bond')
assert.equal(canonicalRegistrationReadiness(bonded,partial).ready,false,'A missing required bond lane blocks registration.')
const provisional=clone(transaction);provisional.routing_profile_json.workflowPlan.provisional=true
assert.equal(canonicalRegistrationReadiness(provisional,journey).ready,false)
const stale=clone(transaction);stale.routing_profile_json.matterProfile.revision++
assert.equal(canonicalRegistrationReadiness(stale,journey).ready,false)
const foreign=clone(journey);foreign.snapshot.transactionId='other'
assert.equal(canonicalRegistrationReadiness(transaction,foreign).ready,false)
const external=clone(journey);external.snapshot.lanes[0].phases[0].tasks[0].status='completed_externally'
assert.equal(canonicalRegistrationReadiness(transaction,external).ready,false)
assert.equal(canonicalRegistrationReadiness(transaction,{status:'unavailable'}).ready,false)
assert.equal(canonicalRegistrationReadiness({id:'legacy'},journey).available,false)
console.log('9 canonical registration readiness and fail-closed scenarios passed')
