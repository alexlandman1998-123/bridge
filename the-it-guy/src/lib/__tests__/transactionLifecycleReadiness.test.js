import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../api.js', import.meta.url), 'utf8')
function apiReadiness(scope) {
  const helpers = source.slice(source.indexOf('function getMissingCloseoutDocumentKeys('), source.indexOf('export async function getCompletionBlockers('))
  const action = source.slice(source.indexOf('export async function getCompletionBlockers('), source.indexOf('export async function markTransactionCompleted(')).replace('export ', '')
  return Function('scope', `with(scope){${helpers} ${action};return getCompletionBlockers}`)(scope)
}
function fixture(overrides = {}) {
  return { requireClient: () => ({}), getTransactionLifecyclePermissions: vi.fn().mockResolvedValue({canComplete:true}),
    loadTransactionLifecycleContext: vi.fn().mockResolvedValue({transaction:{id:'tx'},lifecycleState:'registered',closeout:{documents:[{key:'registration_confirmation',status:'uploaded'},{key:'signed_transfer_documents',status:'accepted'},{key:'financial_settlement_documents',status:'uploaded'}]},checklistItems:[]}),
    CLOSEOUT_REQUIRED_DOCUMENT_KEYS: new Set(['registration_confirmation','signed_transfer_documents','financial_settlement_documents']),
    TRANSACTION_CHECKLIST_PENDING_STATUSES:new Set(['pending','in_progress','blocked']),normalizeRequiredStatus:v=>v,normalizeAttorneyStageValue:v=>v,normalizeDocumentRequestPriorityValue:v=>v,normalizeChecklistItemStatusValue:v=>v,...overrides }
}
it('completion readiness runs the real document and checklist helpers and retains the transaction context', async()=>{
  const result = await apiReadiness(fixture())('tx')
  expect(result).toMatchObject({canMarkCompleted:true,transaction:{id:'tx'},blockers:[]})
})
it('missing closeout evidence and pending post-registration tasks explain both blockers', async()=>{
  const scope=fixture();scope.loadTransactionLifecycleContext.mockResolvedValue({transaction:{id:'tx'},lifecycleState:'registered',closeout:{documents:[]},checklistItems:[{stage:'registered',priority:'required',status:'pending'}]})
  const result=await apiReadiness(scope)('tx')
  expect(result.canMarkCompleted).toBe(false)
  expect(result.blockers.map(b=>b.key)).toEqual(['closeout_documents_missing','post_registration_tasks_pending'])
})
it('denied completion access returns a useful reason before any workflow setup/read side effect', async()=>{
  const scope=fixture();scope.getTransactionLifecyclePermissions.mockResolvedValue({canComplete:false})
  const result=await apiReadiness(scope)('tx')
  expect(result.canMarkCompleted).toBe(false)
  expect(result.blockers[0].label).toMatch(/assigned transfer legal team/)
  expect(scope.loadTransactionLifecycleContext).not.toHaveBeenCalled()
})
