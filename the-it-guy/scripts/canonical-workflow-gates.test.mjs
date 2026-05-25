import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function createMockClient(requirements = []) {
  const state = {
    requirements,
    events: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.action = 'select'
      this.payload = null
    }

    select() {
      return this
    }

    insert(payload) {
      this.action = 'insert'
      this.payload = payload
      return this
    }

    eq() {
      return this
    }

    neq() {
      return this
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }

    async execute() {
      if (this.table === 'document_requirement_instances') {
        return { data: state.requirements, error: null }
      }
      if (this.table === 'document_requirement_events') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
        state.events.push(...rows)
        return { data: rows, error: null }
      }
      return { data: [], error: null }
    }
  }

  return {
    state,
    from(table) {
      return new Query(table)
    },
  }
}

try {
  const gates = await server.ssrLoadModule('/src/services/documents/canonicalWorkflowGateService.js')
  const { REQUIREMENT_LEVELS, REQUIREMENT_STATUSES } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')

  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    document_definition_key: 'signed_mandate',
    pack_key: 'seller_authority',
    context_type: 'private_listing',
    context_id: '22222222-2222-4222-8222-222222222222',
    requirement_level: REQUIREMENT_LEVELS.blocker,
    status: REQUIREMENT_STATUSES.pending,
    stage_gates: ['mandate_ready', 'listing_ready'],
    document_definitions: {
      display_label: 'Signed Mandate',
      review_required: false,
    },
  }

  assert.equal(gates.areCanonicalWorkflowGatesEnabled(), true)
  assert.equal(gates.areCanonicalWorkflowGateWarningsEnabled(), false)
  assert.equal(gates.areCanonicalWorkflowGateHardBlocksEnabled(), false)
  assert.equal(gates.resolveGateEnforcementMode(), 'off')
  assert.equal(gates.resolveGateEnforcementMode({ warningsEnabled: true }), 'warning')
  assert.equal(gates.resolveGateEnforcementMode({ hardBlocksEnabled: true }), 'hard_block')

  assert.equal(gates.mapWorkflowStageToCanonicalGate('Finance'), 'finance_ready')
  assert.equal(gates.mapWorkflowStageToCanonicalGate('lodgement_ready'), 'lodgement_ready')
  assert.equal(gates.mapWorkflowStageToCanonicalGate('active'), 'listing_ready')
  assert.equal(gates.getGateDefinition('attorney_instruction_ready').displayLabel, 'Attorney Instruction Ready')

  const blocked = gates.evaluateGateReadinessFromRequirements([base], 'mandate_ready', { enforcementMode: 'hard_block' })
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.blocker_count, 1)
  assert.equal(blocked.can_advance, false)
  assert.equal(blocked.blockers[0].display_label, 'Signed Mandate')

  const warning = gates.evaluateGateReadinessFromRequirements([
    { ...base, requirement_level: REQUIREMENT_LEVELS.required, status: REQUIREMENT_STATUSES.uploaded },
  ], 'mandate_ready', { enforcementMode: 'warning' })
  assert.equal(warning.status, 'warning')
  assert.equal(warning.provisionally_satisfied_count, 1)
  assert.equal(warning.can_advance, true)

  const underReviewBlocker = gates.evaluateGateReadinessFromRequirements([
    {
      ...base,
      status: REQUIREMENT_STATUSES.underReview,
      document_definitions: { display_label: 'Signed Mandate', review_required: true },
    },
  ], 'mandate_ready', { enforcementMode: 'hard_block' })
  assert.equal(underReviewBlocker.status, 'blocked')

  const waived = gates.evaluateGateReadinessFromRequirements([
    { ...base, status: REQUIREMENT_STATUSES.waived },
  ], 'mandate_ready', { enforcementMode: 'hard_block' })
  assert.equal(waived.status, 'ready')
  assert.equal(waived.waived_count, 1)
  assert.equal(waived.can_advance, true)

  const expiredApproved = gates.evaluateGateReadinessFromRequirements([
    {
      ...base,
      status: REQUIREMENT_STATUSES.approved,
      expiry_date: '2026-05-01T00:00:00.000Z',
    },
  ], 'mandate_ready', {
    now: new Date('2026-05-25T00:00:00.000Z'),
    enforcementMode: 'hard_block',
  })
  assert.equal(expiredApproved.status, 'blocked')
  assert.equal(expiredApproved.expired_count, 1)

  const notApplicable = gates.evaluateGateReadinessFromRequirements([], 'handover_ready')
  assert.equal(notApplicable.status, 'not_applicable')
  assert.equal(notApplicable.can_advance, true)
  assert.equal(notApplicable.readiness_percentage, 100)

  const all = gates.evaluateAllGateReadinessFromRequirements([
    base,
    { ...base, id: '33333333-3333-4333-8333-333333333333', stage_gates: ['finance_ready'], status: REQUIREMENT_STATUSES.approved, pack_key: 'buyer_finance' },
  ])
  assert.equal(all.length, 8)
  assert.equal(all.find((gate) => gate.gate_key === 'finance_ready').status, 'ready')

  const client = createMockClient([base])
  const advanceWarning = await gates.canAdvanceWorkflowStage({
    contextType: 'private_listing',
    contextId: base.context_id,
    targetStage: 'active',
    client,
    warningsEnabled: true,
  })
  assert.equal(advanceWarning.allowed, true)
  assert.equal(advanceWarning.warning.includes('blocked by'), true)
  assert.equal(client.state.events.at(-1).event_type, 'gate_warning_shown')

  const hardClient = createMockClient([base])
  const advanceBlocked = await gates.canAdvanceWorkflowStage({
    contextType: 'private_listing',
    contextId: base.context_id,
    targetStage: 'active',
    client: hardClient,
    hardBlocksEnabled: true,
  })
  assert.equal(advanceBlocked.allowed, false)
  assert.equal(advanceBlocked.gate_key, 'listing_ready')
  assert.equal(hardClient.state.events.at(-1).event_type, 'gate_blocked')

  console.log('canonical-workflow-gates tests passed')
} finally {
  await server.close()
}
