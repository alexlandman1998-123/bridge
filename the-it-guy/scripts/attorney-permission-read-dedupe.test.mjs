import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const service = readFileSync('src/services/permissions/attorneyPermissionService.js','utf8')
const helper = service.slice(service.indexOf('async function resolveAttorneyMembershipForTransaction'), service.indexOf('export async function getAttorneyLegalPermissionContext'))
let accessCalls = 0, membershipCalls = 0
const resolve = new Function('getAttorneyLaneAccessContext','getCurrentUserAttorneyMembership',`${helper}; return resolveAttorneyMembershipForTransaction`)(
  async () => { accessCalls++; return {firmId:'firm'} },
  async (firm,user) => { membershipCalls++; assert.equal(firm,'firm'); assert.equal(user,'user'); return {isActive:true} },
)
assert.deepEqual(await resolve({},'user','matter','transfer_attorney',{firmId:'firm'}),{isActive:true})
assert.equal(accessCalls,0,'reuse only this request’s already-authorised context')
assert.equal(membershipCalls,1)
assert.equal(await resolve({},'user','matter','transfer_attorney',null),null,'a denied lookup must stay denied')
assert.equal(accessCalls,0)
await resolve({},'user','matter','transfer_attorney')
assert.equal(accessCalls,1,'delegation fallback still performs its own lane check')
assert.match(service,/transactionId, role, attorneyAccess\)/)
const laneService=readFileSync('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js','utf8')
assert.match(service,/export async function getAttorneyLegalPermissionContexts/)
assert.match(service,/actorContext: actor,/)
assert.match(service,/transactionAccess,/)
assert.match(laneService,/getAttorneyLegalPermissionContexts\(\{/)
assert.doesNotMatch(laneService,/await Promise\.all\(permissionLaneKeys\.map\(async \(laneKey\) => \{\n\s*const meta = LANE_META/)
assert.match(laneService,/Object\.fromEntries\(permissionLaneKeys\.map/)
console.log('PASS: permission read dedupe, denied-context preservation, fallback verification and deterministic lane ordering')
