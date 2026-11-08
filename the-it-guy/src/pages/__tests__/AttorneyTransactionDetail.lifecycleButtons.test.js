import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
function handler(name, next, scope) {
  const start = source.indexOf(`  async function ${name}(`)
  const end = source.indexOf(`\n  async function ${next}(`, start)
  return Function('scope', `with(scope){return (${source.slice(start, end).trim()});}`)(scope)
}
function fixture() {
  const notice = vi.fn(), events = vi.fn(), close = vi.fn(), error = vi.fn()
  return { notice, events, close, error, scope: {
    transaction: { id: 'tx' }, currentMatterAccessKey: 'tx:attorney', liveMatterScopeRef: { current: 'tx:attorney' },
    setSaving: vi.fn(), setError: error, setLifecycleActionNotice: notice, setRegistrationModalOpen: close,
    registrationDraft: { registrationDate: '2026-11-08', titleDeedNumber: 'T123' },
    markTransactionRegistered: vi.fn().mockResolvedValue({ lifecycleWarnings: [] }),
    markTransactionCompleted: vi.fn().mockResolvedValue({ lifecycleWarnings: [] }),
    unarchiveTransactionLifecycle: vi.fn().mockResolvedValue({ id: 'tx', lifecycle_state: 'active' }),
    refreshRegistrationValidation: vi.fn().mockResolvedValue(null), setConfirmDialog: close,
    reasonDialog: { action: 'cancel', reasonRequired: true }, reasonDraft: 'Reviewed cancellation',
    setReasonDialog: close, setReasonDraft: vi.fn(), undoTransactionRegistration: vi.fn(), archiveTransactionLifecycle: vi.fn(),
    cancelTransactionLifecycle: vi.fn().mockResolvedValue({ id: 'tx', lifecycle_state: 'cancelled' }),
    navigate: vi.fn(), workspaceBackPath: '/transactions',
    window: { dispatchEvent: events }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
  } }
}
it('registration records success and schedules one scoped refresh without replaying the action', async () => {
  const f = fixture()
  await handler('handleRunRegistration', 'handleConfirmAction', f.scope)()
  expect(f.scope.markTransactionRegistered).toHaveBeenCalledOnce()
  expect(f.notice).toHaveBeenLastCalledWith('Registration saved.')
  expect(f.events).toHaveBeenCalledOnce()
  expect(f.events.mock.calls[0][0].detail).toEqual({ transactionId: 'tx' })
  expect(f.error).not.toHaveBeenCalledWith(expect.stringMatching(/Unable/))
})
it('a notification warning remains distinct from a failed registration', async () => {
  const f = fixture()
  f.scope.markTransactionRegistered.mockResolvedValue({ lifecycleWarnings: ['Registration saved; notification needs review.'] })
  await handler('handleRunRegistration', 'handleConfirmAction', f.scope)()
  expect(f.notice).toHaveBeenLastCalledWith('Registration saved; notification needs review.')
  expect(f.close).toHaveBeenCalledWith(false)
})
it('a late successful response cannot close the dialog or replace feedback on another matter', async () => {
  const f = fixture(); let finish
  f.scope.markTransactionRegistered.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = handler('handleRunRegistration', 'handleConfirmAction', f.scope)()
  f.scope.liveMatterScopeRef.current = 'new:attorney'; f.notice.mockClear()
  finish({ lifecycleWarnings: [] }); await pending
  expect(f.close).not.toHaveBeenCalled()
  expect(f.notice).not.toHaveBeenCalled()
  expect(f.events.mock.calls[0][0].detail.transactionId).toBe('tx')
})
it('permission rejection keeps the registration dialog open with its reason', async () => {
  const f = fixture()
  f.scope.markTransactionRegistered.mockRejectedValue(new Error('Only the assigned transfer legal team can register.'))
  await handler('handleRunRegistration', 'handleConfirmAction', f.scope)()
  expect(f.error).toHaveBeenLastCalledWith('Only the assigned transfer legal team can register.')
  expect(f.close).not.toHaveBeenCalled()
  expect(f.events).not.toHaveBeenCalled()
})
it('completion uses the authoritative API once and emits one refresh', async () => {
  const f = fixture()
  await handler('handleConfirmAction', 'handleSubmitReasonAction', f.scope)('complete')
  expect(f.scope.markTransactionCompleted).toHaveBeenCalledExactlyOnceWith('tx')
  expect(f.notice).toHaveBeenLastCalledWith('Transaction completed.')
  expect(f.events).toHaveBeenCalledOnce()
})
it('a stale cancellation response never navigates away from the newly opened matter', async () => {
  const f = fixture(); let finish
  f.scope.cancelTransactionLifecycle.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = handler('handleSubmitReasonAction', 'handlePrintFinalReport', f.scope)()
  f.scope.liveMatterScopeRef.current = 'new:attorney'
  finish({ id: 'tx', lifecycle_state: 'cancelled' }); await pending
  expect(f.scope.navigate).not.toHaveBeenCalled()
  expect(f.close).not.toHaveBeenCalled()
})
it('changing matter or role clears old lifecycle dialogs, entered proof and the busy button state', () => {
  const start = source.indexOf('function resetLifecycleActionState()')
  const end = source.indexOf('}, [currentMatterAccessKey])', start) + 1
  const scope = Object.fromEntries(['setSaving','setLifecycleActionNotice','setRegistrationModalOpen','setRegistrationDraft','setRegistrationValidation','setConfirmDialog','setReasonDialog','setReasonDraft'].map(key => [key,vi.fn()]))
  Function('scope', `with(scope){return (${source.slice(start,end)})}`)(scope)()
  expect(scope.setSaving).toHaveBeenCalledWith(false)
  expect(scope.setRegistrationModalOpen).toHaveBeenCalledWith(false)
  expect(scope.setRegistrationDraft).toHaveBeenCalledWith({registrationDate:'',titleDeedNumber:'',registrationConfirmationDocumentId:''})
  expect(scope.setConfirmDialog.mock.calls[0][0]({open:true}).open).toBe(false)
  expect(scope.setReasonDialog.mock.calls[0][0]({open:true}).open).toBe(false)
})
