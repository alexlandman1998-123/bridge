import assert from 'node:assert/strict'
import {
  createJourneyStageOverride,
  fetchJourneyStageOverrides,
} from '../journeyStageOverrideService.js'
import {
  JOURNEY_ENTITY_TYPES,
  JOURNEY_STAGE_ACTIONS,
} from '../../core/journey/journeyStagePolicy.js'

const tests = []

function test(name, fn) {
  tests.push([name, fn])
}

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const ENTITY_ID = '22222222-2222-4222-8222-222222222222'

function createFetchClient(rows = []) {
  const calls = []
  const builder = {
    select(value) {
      calls.push(['select', value])
      return this
    },
    eq(column, value) {
      calls.push(['eq', column, value])
      return this
    },
    order(column, options) {
      calls.push(['order', column, options])
      return this
    },
    then(resolve) {
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    },
  }
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return builder
    },
  }
}

function createInsertClient(responseRow = {}) {
  const calls = []
  const builder = {
    insert(row) {
      calls.push(['insert', row])
      return this
    },
    select(value) {
      calls.push(['select', value])
      return this
    },
    single() {
      calls.push(['single'])
      return Promise.resolve({ data: responseRow, error: null })
    },
  }
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return builder
    },
  }
}

test('fetches and normalizes journey stage overrides', async () => {
  const client = createFetchClient([{
    id: 'override-1',
    organisation_id: ORG_ID,
    entity_type: JOURNEY_ENTITY_TYPES.buyerLead,
    entity_id: ENTITY_ID,
    stage_key: 'viewing',
    action_type: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Viewing happened offline.',
  }])

  const rows = await fetchJourneyStageOverrides({
    organisationId: ORG_ID,
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    entityId: ENTITY_ID,
    client,
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].stageKey, 'viewing')
  assert.deepEqual(client.calls.filter((call) => call[0] === 'eq').map((call) => call.slice(1)), [
    ['entity_type', JOURNEY_ENTITY_TYPES.buyerLead],
    ['entity_id', ENTITY_ID],
    ['organisation_id', ORG_ID],
  ])
})

test('creates journey stage overrides through the phase 2 contract', async () => {
  const responseRow = {
    id: 'override-2',
    organisation_id: ORG_ID,
    entity_type: JOURNEY_ENTITY_TYPES.buyerLead,
    entity_id: ENTITY_ID,
    stage_key: 'viewing',
    action_type: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Viewing happened offline.',
    notification_mode: 'internal_only',
    metadata: { source: 'journey_rail' },
  }
  const client = createInsertClient(responseRow)
  const row = await createJourneyStageOverride({
    organisationId: ORG_ID,
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    entityId: ENTITY_ID,
    stageKey: 'viewing',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Viewing happened offline.',
    metadata: { source: 'journey_rail' },
  }, { client })

  const insertCall = client.calls.find((call) => call[0] === 'insert')
  assert.equal(insertCall[1].organisation_id, ORG_ID)
  assert.equal(insertCall[1].action_type, JOURNEY_STAGE_ACTIONS.markComplete)
  assert.equal(insertCall[1].notification_mode, 'internal_only')
  assert.equal(row.stageKey, 'viewing')
})

for (const [name, fn] of tests) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}
