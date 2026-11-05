import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../DevelopmentDetail.jsx', import.meta.url), 'utf8')
function bindFunction(name, nextName, dependencies) {
  const start = source.indexOf(`  async function ${name}(`)
  const end = source.indexOf(`\n  ${nextName}`, start)
  if (start < 0 || end < 0) throw new Error(`Cannot locate ${name}`)
  return new Function(...Object.keys(dependencies), `return ${source.slice(start, end)}`)(...Object.values(dependencies))
}
const unit = { id: 'unit-1', unitNumber: '101', status: 'Available' }
function setup(overrides = {}) {
  const dependencies = {
    canManageDevelopment: true, unitStatusChangeLock: { current: false },
    getDevelopmentUnitStatusOption: value => ({ value, lifecycleStage: value === 'Finance Pending' ? 'finance' : null }),
    requiresDevelopmentTransaction: value => ['Reserved', 'Finance Pending', 'Sold'].includes(value),
    setError: vi.fn(), setFeedback: vi.fn(), setUnitSaving: vi.fn(), setUnitStatusSavingId: vi.fn(), setUnitQuickSavingKey: vi.fn(),
    createTransactionForUnitStatus: vi.fn(async () => ({ transactionId: 'new-tx', stage: 'Finance' })),
    applyUnitQuickUpdate: vi.fn(), loadData: vi.fn(async () => {}), refreshUnitStatusViews: vi.fn(async () => {}),
    saveDevelopmentUnit: vi.fn(async payload => payload), buildUnitQuickSavePayload: (record, patch) => ({ ...record, ...patch }),
    updateTransactionLifecycleStage: vi.fn(async () => {}), ...overrides,
  }
  return { ...dependencies, run: bindFunction('handleUnitStatusQuickChange', 'async function refreshUnitStatusViews', dependencies) }
}

it('saves the stock and linked lifecycle before refreshing all views and reporting success', async () => {
  const context = setup()
  await context.run({ ...unit, currentTransactionId: 'tx' }, 'Finance Pending')
  expect(context.saveDevelopmentUnit).toHaveBeenCalledWith(expect.objectContaining({ status: 'Finance Pending' }))
  expect(context.updateTransactionLifecycleStage).toHaveBeenCalledWith('tx', 'finance', expect.objectContaining({ source: 'development_unit_status_quick_update' }))
  expect(context.refreshUnitStatusViews).toHaveBeenCalledWith('tx')
  expect(context.setFeedback).toHaveBeenLastCalledWith('Unit 101 marked Finance Pending.')
  expect(context.unitStatusChangeLock.current).toBe(false)
})

it('reconciles partial failures without claiming success or keeping an optimistic status', async () => {
  const context = setup({ updateTransactionLifecycleStage: vi.fn(async () => { throw Error('Lifecycle save failed') }) })
  await context.run({ ...unit, currentTransactionId: 'tx' }, 'Finance Pending')
  expect(context.loadData).toHaveBeenCalledOnce()
  expect(context.applyUnitQuickUpdate).not.toHaveBeenCalled()
  expect(context.refreshUnitStatusViews).not.toHaveBeenCalled()
  expect(context.setFeedback).toHaveBeenCalledWith('')
  expect(context.setError).toHaveBeenLastCalledWith('Lifecycle save failed')
  expect(context.unitStatusChangeLock.current).toBe(false)
})

it('retains the existing transaction creation path for sales statuses on unlinked units', async () => {
  const context = setup()
  await context.run(unit, 'Reserved')
  expect(context.createTransactionForUnitStatus).toHaveBeenCalledWith(unit, 'Reserved', { notify: false })
  expect(context.refreshUnitStatusViews).toHaveBeenCalledWith('new-tx')
})

it('does not write for unchanged statuses, viewers, concurrent saves or stock still linked to a sale', async () => {
  for (const context of [setup(), setup({ canManageDevelopment: false }), setup({ unitStatusChangeLock: { current: true } })]) {
    await context.run(unit, context.canManageDevelopment && !context.unitStatusChangeLock.current ? 'Available' : 'Sold')
    expect(context.saveDevelopmentUnit).not.toHaveBeenCalled()
    expect(context.createTransactionForUnitStatus).not.toHaveBeenCalled()
  }
  const context = setup()
  await context.run({ ...unit, status: 'Sold', currentTransactionId: 'tx' }, 'Available')
  expect(context.setError).toHaveBeenCalledWith(expect.stringContaining('linked transaction'))
  expect(context.saveDevelopmentUnit).not.toHaveBeenCalled()
})

it('evicts transaction and development caches and notifies the existing subscribers', async () => {
  const dependencies = { invalidateTransactionsListCache: vi.fn(), invalidateDevelopmentOptionsCache: vi.fn(async () => {}), invalidateTransactionWorkspaceCoreCache: vi.fn(async () => {}), window: { dispatchEvent: vi.fn() }, Event }
  const refresh = bindFunction('refreshUnitStatusViews', 'function openUnitModal', dependencies)
  await refresh('tx')
  expect(dependencies.invalidateTransactionWorkspaceCoreCache).toHaveBeenCalledWith('tx')
  expect(dependencies.window.dispatchEvent.mock.calls[0][0].type).toBe('itg:transaction-updated')
  await refresh()
  expect(dependencies.invalidateTransactionsListCache).toHaveBeenCalledTimes(2)
  expect(dependencies.invalidateDevelopmentOptionsCache).toHaveBeenCalledTimes(2)
  expect(dependencies.window.dispatchEvent.mock.calls[1][0].type).toBe('itg:developments-changed')
})
