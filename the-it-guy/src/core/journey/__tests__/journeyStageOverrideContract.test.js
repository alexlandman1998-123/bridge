import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  JOURNEY_ENTITY_TYPES,
  JOURNEY_NOTIFICATION_MODES,
  JOURNEY_STAGE_ACTIONS,
} from '../journeyStagePolicy.js'
import {
  JOURNEY_STAGE_OVERRIDE_ACTION_TYPES,
  JOURNEY_STAGE_OVERRIDE_CONTRACT_VERSION,
  JOURNEY_STAGE_OVERRIDE_ENTITY_TYPES,
  JOURNEY_STAGE_OVERRIDE_NOTIFICATION_MODES,
  serializeJourneyStageOverrideForDatabase,
  validateJourneyStageOverrideInput,
} from '../journeyStageOverrideContract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const ENTITY_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'

test('exposes a stable phase 2 contract version and enum set', () => {
  assert.equal(JOURNEY_STAGE_OVERRIDE_CONTRACT_VERSION, 'journey_stage_overrides_phase2_v1')
  assert.deepEqual(JOURNEY_STAGE_OVERRIDE_ENTITY_TYPES, [
    JOURNEY_ENTITY_TYPES.buyerLead,
    JOURNEY_ENTITY_TYPES.sellerLead,
    JOURNEY_ENTITY_TYPES.developerLead,
    JOURNEY_ENTITY_TYPES.transaction,
  ])
  assert.deepEqual(JOURNEY_STAGE_OVERRIDE_ACTION_TYPES, [
    JOURNEY_STAGE_ACTIONS.markComplete,
    JOURNEY_STAGE_ACTIONS.jumpToStage,
    JOURNEY_STAGE_ACTIONS.clearOverride,
    JOURNEY_STAGE_ACTIONS.markPaid,
  ])
  assert.deepEqual(JOURNEY_STAGE_OVERRIDE_NOTIFICATION_MODES, [
    JOURNEY_NOTIFICATION_MODES.internalOnly,
    JOURNEY_NOTIFICATION_MODES.normal,
  ])
})

test('serializes a buyer viewing catch-up override for database insert', () => {
  const result = serializeJourneyStageOverrideForDatabase({
    organisationId: ORG_ID,
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    entityId: ENTITY_ID,
    stageKey: 'viewing',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Viewing happened in person.',
    actorUserId: ACTOR_ID,
    metadata: { source: 'journey_rail' },
  })

  assert.equal(result.valid, true)
  assert.deepEqual(result.row, {
    organisation_id: ORG_ID,
    entity_type: 'buyer_lead',
    entity_id: ENTITY_ID,
    stage_key: 'viewing',
    action_type: 'mark_complete',
    reason: 'Viewing happened in person.',
    actor_user_id: ACTOR_ID,
    notification_mode: 'internal_only',
    metadata: { source: 'journey_rail' },
    supersedes_override_id: null,
    linked_activity_table: null,
    linked_activity_id: null,
  })
})

test('rejects catch-up completion for an OTP evidence gate', () => {
  const result = validateJourneyStageOverrideInput({
    organisationId: ORG_ID,
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    entityId: ENTITY_ID,
    stageKey: 'offer',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'OTP signed offline.',
  })

  assert.equal(result.valid, false)
  assert.equal(result.errors.some((error) => error.code === 'action_not_allowed'), true)
})

test('allows reservation mark paid without treating it as verification', () => {
  const result = serializeJourneyStageOverrideForDatabase({
    organisationId: ORG_ID,
    entityType: JOURNEY_ENTITY_TYPES.developerLead,
    entityId: ENTITY_ID,
    stageKey: 'reservation',
    actionType: JOURNEY_STAGE_ACTIONS.markPaid,
    reason: 'Buyer sent payment reference.',
    notificationMode: JOURNEY_NOTIFICATION_MODES.internalOnly,
    metadata: { amount: 25000, reference: 'RES-100' },
  })

  assert.equal(result.valid, true)
  assert.equal(result.row.action_type, 'mark_paid')
  assert.equal(result.row.stage_key, 'reservation')
  assert.deepEqual(result.row.metadata, { amount: 25000, reference: 'RES-100' })
})

test('keeps linked activity pointers as an all-or-nothing pair', () => {
  const result = validateJourneyStageOverrideInput({
    organisationId: ORG_ID,
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    entityId: ENTITY_ID,
    stageKey: 'viewing',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Viewing happened in person.',
    linkedActivityTable: 'lead_activity',
  })

  assert.equal(result.valid, false)
  assert.equal(result.errors.some((error) => error.field === 'linkedActivityId'), true)
})

test('migration constrains the same enum values as the contract', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../supabase/migrations/20260820160621_journey_stage_overrides_phase2.sql',
  )
  const sql = fs.readFileSync(migrationPath, 'utf8')

  for (const entityType of JOURNEY_STAGE_OVERRIDE_ENTITY_TYPES) {
    assert.match(sql, new RegExp(`'${entityType}'`))
  }
  for (const actionType of JOURNEY_STAGE_OVERRIDE_ACTION_TYPES) {
    assert.match(sql, new RegExp(`'${actionType}'`))
  }
  for (const notificationMode of JOURNEY_STAGE_OVERRIDE_NOTIFICATION_MODES) {
    assert.match(sql, new RegExp(`'${notificationMode}'`))
  }

  assert.match(sql, /alter table public\.journey_stage_overrides enable row level security;/)
  assert.match(sql, /to authenticated/)
  assert.match(sql, /grant select, insert on table public\.journey_stage_overrides to authenticated;/)
})
