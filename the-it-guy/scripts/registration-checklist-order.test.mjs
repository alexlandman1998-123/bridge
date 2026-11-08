import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/lib/api.js',import.meta.url),'utf8')
const start=source.indexOf('function buildRegistrationBlockers(')
const end=source.indexOf('\nexport async function ',start)
const definition=source.slice(start,end)
const build=Function('normalizeDocumentRequestPriorityValue','TRANSACTION_CHECKLIST_PENDING_STATUSES',
 'normalizeChecklistItemStatusValue','normalizeAttorneyStageValue','resolveAttorneyOperationalStageKey',
 'REGISTRATION_STAGE_KEYS','isRegistrationConfirmationDocument',definition+';return buildRegistrationBlockers')(
  value=>value,new Set(['pending','in_progress','blocked']),value=>value,value=>value,()=> 'registration_preparation',
  new Set(['registration_preparation','registered']),d=>d.document_type==='registration_confirmation')
const context={transaction:{registration_date:'2026-11-04',title_deed_number:'CONTROLLED-STAGING-TITLE'},
 operationalState:{stageKey:'registration_preparation'},lifecycleState:'active',
 documents:[{id:'registration-proof',document_type:'registration_confirmation'}],
 checklistItems:[{stage:'registered',priority:'required',status:'pending'}]}
assert.deepEqual(build({context}).blockers,[],'Registration cannot depend on tasks performed after registration.')
assert.ok(build({context:{...context,checklistItems:[...context.checklistItems,{stage:'transfer',priority:'required',status:'pending'}]}})
 .blockers.some(b=>b.key==='required_checklist'),'Required pre-registration work still blocks registration.')
assert.ok(build({context:{...context,documents:[]}}).blockers.some(b=>b.key==='registration_confirmation_document'))
assert.ok(build({context:{...context,lifecycleState:'cancelled'}}).blockers.some(b=>b.key==='lifecycle_state'))
assert.ok(build({context,registrationConfirmationDocumentId:'another-matters-file'}).blockers.some(b=>b.key==='registration_confirmation_document_scope'))
console.log('5 registration checklist ordering and evidence scenarios passed')
