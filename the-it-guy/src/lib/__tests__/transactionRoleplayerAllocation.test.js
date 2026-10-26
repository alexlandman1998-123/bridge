import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise the actual save sequence with local adapters; no Supabase client or messages.
const api = readFileSync(new URL('../api.js', import.meta.url), 'utf8')
const saveSource = api.slice(api.indexOf('export async function saveTransactionRoleplayerSelections('), api.indexOf('\nexport async function reassignDeclinedTransferAttorneyInstruction(')).replace('export ', '')

function setup({ transaction = {}, overrides = {} } = {}) {
  const calls = []
  const row = { id: 'transaction', finance_type: 'bond', finance_managed_by: 'client', onboarding_status: 'completed', status: 'Registered', buyer_id: null, ...transaction }
  const deps = {
    requireClient: () => ({}),
    resolveActiveProfileContext: async () => ({ userId: 'agent', role: 'agent' }),
    normalizeRoleType: (role) => role,
    normalizeTransactionRoleplayerSelection: (selection) => selection,
    fetchTransactionRowById: async () => row,
    resolveAttorneyFirmIdForCreationRoleplayer: async () => 'firm',
    isBondFinanceType: (type) => ['bond', 'combination', 'hybrid'].includes(type),
    normalizeFinanceType: (type) => type,
    upsertTransactionRoleplayerSelection: async (_client, payload) => { calls.push(['upsert', payload]); return [{ id: 'roleplayer' }] },
    updateRecordByIdWithMissingColumnFallback: async (_client, table, id, patch) => { calls.push(['patch', table, id, patch]); Object.assign(row, patch) },
    propagateTransactionRoleplayersIfPossible: async (_client, payload) => { calls.push(['propagate', payload]) },
    logTransactionEventIfPossible: async (_client, payload) => { calls.push(['event', payload]) },
    isFirmFirstAttorneyAllocation: (selection) => Boolean(selection.firmFirstAllocation),
    replayRoleplayerAllocationForCompletedOnboarding: async () => { calls.push(['onboarding-replay']) },
    publishWorkflowChangedIfPossible: async () => { calls.push(['workflow-refresh']) },
    fetchTransactionById: async () => ({ transaction: row }),
    ...overrides,
  }
  const save = new Function(...Object.keys(deps), `${saveSource}; return saveTransactionRoleplayerSelections`)(...Object.values(deps))
  return { save, calls, row }
}
const attorney = { roleType: 'transfer_attorney', companyName: 'Transfer Firm', email: 'firm@example.test', organisationId: 'transfer-org', firmFirstAllocation: true }
const originator = { roleType: 'bond_originator', companyName: 'Bond Firm', email: 'bond@example.test', organisationId: 'bond-org' }

test('allocates an originator without an attorney, buyer email, or onboarding replay', async () => {
  const { save, calls, row } = setup()
  await save({ transactionId: row.id, roleplayers: [originator], allocationOnly: true, source: 'transaction_workspace_allocation' })
  const patch = calls.find(([type]) => type === 'patch')[3]
  assert.equal(patch.bond_originator, 'Bond Firm')
  assert.equal(patch.finance_managed_by, 'bond_originator')
  assert.equal('attorney' in patch, false)
  assert.equal(row.status, 'Registered')
  assert.equal(row.onboarding_status, 'completed')
  assert.equal(calls.some(([type]) => type === 'onboarding-replay'), false)
  const propagation = calls.find(([type]) => type === 'propagate')[1]
  assert.equal(propagation.preserveWorkflowState, true)
  assert.equal(propagation.transaction.finance_managed_by, 'bond_originator')
  assert.deepEqual(propagation.rolePlayers.map((role) => role.roleType), ['bond_originator'])
})

test('allocates only the attorney and preserves the existing originator and onboarding state', async () => {
  const { save, calls, row } = setup({ transaction: { bond_originator: 'Existing Originator', assigned_bond_originator_email: 'existing@example.test', onboarding_status: 'not_started' } })
  await save({ transactionId: row.id, roleplayers: [attorney], allocationOnly: true })
  const patch = calls.find(([type]) => type === 'patch')[3]
  assert.equal(patch.attorney, 'Transfer Firm')
  assert.equal('bond_originator' in patch, false)
  assert.equal('assigned_bond_originator_email' in patch, false)
  assert.equal('finance_managed_by' in patch, false)
  assert.equal(row.bond_originator, 'Existing Originator')
  assert.equal(row.onboarding_status, 'not_started')
  assert.equal(calls.filter(([type]) => type === 'upsert').length, 1)
  assert.equal(calls.some(([type]) => type === 'onboarding-replay'), false)
})

test('leaves the existing explicit onboarding save and replay behavior intact', async () => {
  const { save, calls, row } = setup()
  await assert.rejects(save({ transactionId: row.id, roleplayers: [originator] }), /Transfer Attorney is required before buyer onboarding/)
  await save({ transactionId: row.id, roleplayers: [attorney] })
  assert.equal(calls.filter(([type]) => type === 'onboarding-replay').length, 1)
  assert.equal(calls.find(([type]) => type === 'patch')[3].bond_originator, null)
})

test('rejects allocating a bond originator to cash finance before any writes', async () => {
  const { save, calls, row } = setup({ transaction: { finance_type: 'cash' } })
  await assert.rejects(save({ transactionId: row.id, roleplayers: [originator], allocationOnly: true }), /Choose Bond or Combination/)
  assert.equal(calls.length, 0)
})

test('rejects empty allocation and unauthorized actors without writes', async () => {
  const { save, calls, row } = setup()
  await assert.rejects(save({ transactionId: row.id, allocationOnly: true }), /Select a transaction professional/)
  await assert.rejects(save({ transactionId: row.id, roleplayers: [attorney], allocationOnly: true, actorRole: 'buyer' }), /permission/)
  assert.equal(calls.length, 0)
})

test('validates the transfer firm workspace before saving standalone allocations', async () => {
  const { save, calls, row } = setup({ overrides: { resolveAttorneyFirmIdForCreationRoleplayer: async () => null } })
  await assert.rejects(save({ transactionId: row.id, roleplayers: [attorney], allocationOnly: true }), /active attorney workspace/)
  assert.equal(calls.length, 0)
})

test('a persistence failure stops propagation and never replays onboarding', async () => {
  const { save, calls, row } = setup({ overrides: { upsertTransactionRoleplayerSelection: async () => { throw new Error('Write failed') } } })
  await assert.rejects(save({ transactionId: row.id, roleplayers: [originator], allocationOnly: true }), /Write failed/)
  assert.equal(calls.length, 0)
})

const bondSource = api.slice(api.indexOf('async function ensureBondApplicationWorkspaceRecord('), api.indexOf('\nexport const __transactionBondApplicationClassificationTestUtils'))
test('reallocating an originator preserves the existing application status and captured metadata', async () => {
  let patch
  const query = { select() { return this }, eq() { return this }, limit: async () => ({ data: [{ id: 'existing-application' }] }) }
  const deps = {
    fetchRawBondHybridWorkflow: async () => ({ id: 'workflow' }),
    resolveRoleplayerSelectionScope: () => ({ organisationId: 'new-org', assignmentStatus: 'assigned' }),
    updateRecordByIdWithMissingColumnFallback: async (_client, _table, _id, payload) => { patch = payload; return [{ id: 'existing-application' }] },
  }
  const ensure = new Function(...Object.keys(deps), `${bondSource}; return ensureBondApplicationWorkspaceRecord`)(...Object.values(deps))
  await ensure({ from: () => query }, { transactionId: 'transaction', selection: { ...originator, userId: 'selected-user' }, actorProfile: { userId: 'agent' }, preserveWorkflowState: true })
  assert.equal(patch.assigned_organisation_id, 'new-org')
  assert.equal('status' in patch, false)
  assert.equal('notes' in patch, false)
  assert.equal('metadata' in patch, false)
})

const page = readFileSync(new URL('../../pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const allocateSource = page.slice(page.indexOf('  async function allocateTransactionProfessional('), page.indexOf('  function openRoleplayerConfirmation('))
test('the workspace allocation handler saves only the requested role and reports refresh failure without repeating allocation', async () => {
  const { save, calls, row } = setup()
  const messages = []
  const deps = {
    canManageTransactionRoleplayers: true,
    transaction: row,
    workspaceRole: 'agent',
    allocationRoles: [{ key: 'bond_originator', label: 'Bond Originator', options: [{ ...originator, id: 'option' }] }],
    buildRoleplayerSelection: (roleType, option) => ({ ...option, roleType }),
    saveTransactionRoleplayerSelections: save,
    setData: () => {},
    setStakeholderMessage: (message) => messages.push(message),
    loadData: async () => { throw new Error('Refresh unavailable') },
    setError: (message) => messages.push(message),
    window: { dispatchEvent: () => {} },
    Event: class {},
  }
  const allocate = new Function(...Object.keys(deps), `${allocateSource}; return allocateTransactionProfessional`)(...Object.values(deps))
  await allocate('bond_originator', { ...originator, id: 'option' })
  assert.equal(calls.filter(([type]) => type === 'upsert').length, 1)
  assert.equal(calls.some(([type]) => type === 'onboarding-replay'), false)
  assert.match(messages[0], /allocation saved/)
  assert.match(messages[1], /allocation was saved/)
  assert.equal(row.onboarding_status, 'completed')
})
