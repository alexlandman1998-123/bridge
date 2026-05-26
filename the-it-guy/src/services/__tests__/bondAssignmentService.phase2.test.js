import assert from 'node:assert/strict'

import {
  assignBondComplianceReviewer,
  assignBondManager,
  assignBondProcessor,
  assignBondRegion,
  assignBondUnit,
  assignBondWorkspace,
  assignPrimaryBondConsultant,
  clearBondAssignment,
  getBondAssignmentDisplay,
  resolveBondAssignment,
  resolveCanonicalBondAssignment,
  resolveCurrentBondAssignment,
  resolveParticipantBondAssignment,
  resolveRolePlayerBondAssignment,
} from '../bondAssignmentService.js'

function createMockClient() {
  const state = {
    transactions: [],
    transactionRolePlayers: [],
    queries: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.payload = null
      this.action = null
      this._limit = null
      this._onConflict = null
    }

    update(payload = {}) {
      this.action = 'update'
      this.payload = payload
      return this
    }

    insert(payload) {
      this.action = 'insert'
      this.payload = payload
      return this
    }

    upsert(payload, options = {}) {
      this.action = 'upsert'
      this.payload = payload
      this._onConflict = options.onConflict || null
      return this
    }

    select() {
      return this
    }

    eq() {
      return this
    }

    limit(value) {
      this._limit = value
      return this
    }

    async execute() {
      if (this.table === 'transactions' && this.action === 'update') {
        const row = { id: `transaction-${state.transactions.length + 1}`, ...this.payload }
        state.transactions.push(row)
        state.queries.push({ table: this.table, action: this.action, payload: this.payload })
        return { data: [row], error: null }
      }

      if (this.table === 'transaction_role_players' && this.action === 'upsert') {
        const row = Array.isArray(this.payload) ? this.payload[0] : this.payload
        const next = { id: `player-${state.transactionRolePlayers.length + 1}`, ...row }
        state.transactionRolePlayers.push(next)
        state.queries.push({ table: this.table, action: this.action, payload: row })
        return { data: [next], error: null }
      }

      if (this.table === 'transaction_role_players' && this.action === 'insert') {
        const row = this.payload
        const next = { id: `player-${state.transactionRolePlayers.length + 1}`, ...row }
        state.transactionRolePlayers.push(next)
        state.queries.push({ table: this.table, action: this.action, payload: row })
        return { data: [next], error: null }
      }

      return { data: [], error: null }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }
  }

  return {
    state,
    from: (table) => new Query(table),
    auth: {
      async getUser() {
        return { data: { user: { id: 'actor-1', email: 'actor@bridge.local' } } }
      },
    },
  }
}

const canonicalTx = {
  bond_workspace_id: '11111111-1111-4111-8111-911111111111',
  bond_region_id: '22222222-2222-4222-8222-922222222222',
  bond_workspace_unit_id: '33333333-3333-4333-8333-933333333333',
  primary_bond_consultant_user_id: '44444444-4444-4444-8444-944444444444',
  assigned_bond_processor_user_id: '55555555-5555-4555-8555-955555555555',
  assigned_bond_manager_user_id: '66666666-6666-4666-8666-966666666666',
  assigned_bond_compliance_user_id: '77777777-7777-4777-8777-977777777777',
  assigned_bond_originator_email: 'legacy-consultant@example.test',
  bond_originator: 'Legacy Consultant',
}

assert.equal(resolveCanonicalBondAssignment(canonicalTx).primaryConsultantUserId, '44444444-4444-4444-8444-944444444444')
const effectiveCanonical = resolveBondAssignment(canonicalTx)
assert.equal(effectiveCanonical.source, 'canonical')
assert.equal(effectiveCanonical.bondWorkspaceId, '11111111-1111-4111-8111-911111111111')
assert.equal(effectiveCanonical.processorUserId, '55555555-5555-4555-8555-955555555555')
assert.equal(effectiveCanonical.managerUserId, '66666666-6666-4666-8666-966666666666')
assert.equal(effectiveCanonical.complianceUserId, '77777777-7777-4777-8777-977777777777')

const participantBased = resolveBondAssignment({
  participants: [{ participantRole: 'consultant', status: 'active', user_id: 'consultant-fallback', participant_email: 'consultant-fallback@example.test' }],
})
assert.equal(participantBased.source, 'participant')
assert.equal(participantBased.primaryConsultantUserId, 'consultant-fallback')

const rolePlayerBased = resolveBondAssignment({
  transaction_role_players: [{ role_type: 'bond_originator', status: 'active', user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }],
})
assert.equal(rolePlayerBased.source, 'role_player')
assert.equal(rolePlayerBased.primaryConsultantUserId, 'ffffffff-ffff-4fff-8fff-ffffffffffff')

const legacyEmail = resolveBondAssignment({
  assigned_bond_originator_email: 'legacy-only@example.test',
})
assert.equal(legacyEmail.source, 'legacy_email')
assert.equal(legacyEmail.primaryConsultantEmail, 'legacy-only@example.test')

const legacyText = resolveBondAssignment({
  bond_originator: 'Legacy Name',
})
assert.equal(legacyText.source, 'legacy_text')
assert.equal(legacyText.primaryConsultantName, 'Legacy Name')

const missingAssignment = resolveBondAssignment()
assert.equal(missingAssignment.source, 'none')
assert.equal(missingAssignment.bondWorkspaceId, null)
assert.equal(missingAssignment.primaryConsultantUserId, null)

assert.equal(getBondAssignmentDisplay(canonicalTx).workspace.id, '11111111-1111-4111-8111-911111111111')
assert.equal(resolveCurrentBondAssignment({ transaction: canonicalTx }).bondAssignmentResolution.source, 'canonical')
assert.equal(resolveParticipantBondAssignment({ participants: [{ participant_role: 'consultant', status: 'active', participant_email: 'p@example.test' }] }).source, 'participant')
assert.equal(resolveRolePlayerBondAssignment({ transaction_role_players: [{ role_type: 'bond_originator', status: 'active', user_id: 'processor-x' }] }).source, 'role_player')

const consultantClient = createMockClient()
const consultantAssign = await assignPrimaryBondConsultant('11111111-1111-4111-8111-911111111111', {
  userId: '88888888-8888-4888-8888-988888888888',
  email: 'consultant-new@example.test',
  name: 'Consultant New',
  emitLegacyEmail: true,
  client: consultantClient,
})
assert.equal(consultantAssign.ok, true)
  assert.equal(consultantClient.state.transactions[0].primary_bond_consultant_user_id, '88888888-8888-4888-8888-988888888888')
assert.equal(consultantClient.state.transactions[0].bond_assignment_status, 'consultant_assigned')
assert.equal(consultantClient.state.transactionRolePlayers[0].role_type, 'bond_originator')
  assert.equal(consultantClient.state.transactions[1].assigned_bond_originator_email, 'consultant-new@example.test')

  const regionClient = createMockClient()
await assignBondRegion('22222222-2222-4222-8222-922222222222', {
  regionId: '99999999-9999-4999-8999-999999999999',
  workspaceId: '11111111-1111-4111-8111-911111111111',
  client: regionClient,
})
assert.equal(regionClient.state.transactions[0].bond_region_id, '99999999-9999-4999-8999-999999999999')
assert.equal(regionClient.state.transactions[0].bond_assignment_status, 'workspace_assigned')

const unitClient = createMockClient()
await assignBondUnit('33333333-3333-4333-8333-933333333333', {
  workspaceUnitId: 'aaaaaaaa-aaaa-4aaa-8aaa-9aaaaaaaaaaa',
  client: unitClient,
})
assert.equal(unitClient.state.transactions[0].bond_workspace_unit_id, 'aaaaaaaa-aaaa-4aaa-8aaa-9aaaaaaaaaaa')
assert.equal(unitClient.state.transactions[0].bond_assignment_status, 'consultant_assigned')

const workspaceClient = createMockClient()
  await assignBondWorkspace('44444444-4444-4444-8444-944444444444', { workspaceId: '11111111-1111-4111-8111-911111111111', client: workspaceClient })
assert.equal(workspaceClient.state.transactions[0].bond_workspace_id, '11111111-1111-4111-8111-911111111111')
assert.equal(workspaceClient.state.transactions[0].bond_assignment_status, 'workspace_assigned')

const managerClient = createMockClient()
await assignBondManager('55555555-5555-4555-8555-955555555555', {
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-9bbbbbbbbbbb',
  client: managerClient,
  currentTransaction: canonicalTx,
  email: 'manager-1@example.test',
})
  assert.equal(managerClient.state.transactions[0].assigned_bond_manager_user_id, 'bbbbbbbb-bbbb-4bbb-8bbb-9bbbbbbbbbbb')
assert.equal(managerClient.state.transactions[0].assigned_bond_originator_email, undefined)
assert.equal(managerClient.state.transactionRolePlayers[0].role_type, 'manager')

const processorClient = createMockClient()
await assignBondProcessor('66666666-6666-4666-8666-966666666666', {
  userId: 'cccccccc-cccc-4ccc-8ccc-9ccccccccccc',
  client: processorClient,
  email: 'processor-1@example.test',
})
assert.equal(processorClient.state.transactions[0].assigned_bond_processor_user_id, 'cccccccc-cccc-4ccc-8ccc-9ccccccccccc')
assert.equal(processorClient.state.transactionRolePlayers[0].role_type, 'processor')

const complianceClient = createMockClient()
await assignBondComplianceReviewer('77777777-7777-4777-8777-977777777777', {
  userId: 'dddddddd-dddd-4ddd-8ddd-9ddddddddddd',
  client: complianceClient,
  email: 'compliance-1@example.test',
})
assert.equal(complianceClient.state.transactions[0].assigned_bond_compliance_user_id, 'dddddddd-dddd-4ddd-8ddd-9ddddddddddd')
assert.equal(complianceClient.state.transactionRolePlayers[0].role_type, 'compliance')

const clearClient = createMockClient()
await clearBondAssignment('88888888-8888-4888-8888-988888888888', {
  clearPrimaryConsultant: true,
  clearProcessor: true,
  clearManager: true,
  clearCompliance: true,
  client: clearClient,
  actorId: 'actor-2',
})
assert.equal(clearClient.state.transactions[0].primary_bond_consultant_user_id, null)
assert.equal(clearClient.state.transactions[0].assigned_bond_processor_user_id, null)
assert.equal(clearClient.state.transactions[0].assigned_bond_manager_user_id, null)
assert.equal(clearClient.state.transactions[0].assigned_bond_compliance_user_id, null)
assert.equal(clearClient.state.transactions[0].bond_assignment_status, 'unassigned')
assert.equal(clearClient.state.transactions[0].bond_assignment_source, 'manual')
assert.equal(clearClient.state.transactions[0].bond_assignment_updated_by, 'actor-1')

console.log('bondAssignmentService phase2 tests passed')
