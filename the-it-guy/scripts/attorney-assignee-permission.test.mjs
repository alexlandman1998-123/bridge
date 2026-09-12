import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const source=readFileSync('src/lib/attorneyPermissions.js','utf8')
const active=runInNewContext(`(${source.match(/function isAssignmentActive[\s\S]*?\n\}/)[0]})`)
assert.equal(active({assignment_status:'active',status:'active'}),true)
for(const status of ['removed','revoked','inactive','suspended']) {
  assert.equal(active({assignment_status:'active',status}),false)
  assert.equal(active({assignment_status:status,status:'active'}),false)
}
const block=source.slice(source.indexOf('  const isAssignedAttorney = Boolean('),source.indexOf('  const canViewMatter = await canAccessAttorneyMatter'))
for(const field of ['assigned_user_id','attorney_user_id','primary_attorney_id']) {
  const result=runInNewContext(`${block};({isAssignedAttorney,isAssignedParticipant})`,{activeLaneAssignment:{[field]:'actor',status:'active'},resolvedUserId:'actor',isAssignmentActive:active})
  assert.equal(result.isAssignedAttorney,true);assert.equal(result.isAssignedParticipant,true)
}
for(const assignment of [{assigned_user_id:'other',status:'active'},{assigned_user_id:'actor',assignment_status:'active',status:'removed'}]) {
  const result=runInNewContext(`${block};({isAssignedAttorney,isAssignedParticipant})`,{activeLaneAssignment:assignment,resolvedUserId:'actor',isAssignmentActive:active})
  assert.equal(result.isAssignedAttorney,false);assert.equal(result.isAssignedParticipant,false)
}
assert.match(source,/select\('attorney_role, assignment_type, assigned_user_id/)
console.log('PASS: canonical and legacy assignees, unrelated actor denial, conflicting removed status denial')
