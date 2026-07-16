import assert from 'node:assert/strict'
import {
  ATTORNEY_LEAD_ACCESS_SCOPES,
  ATTORNEY_LEAD_LIFECYCLE_STATUSES,
  ATTORNEY_LEAD_SERVICE_TYPES,
  ATTORNEY_LEAD_SOURCE_CHANNELS,
  ATTORNEY_LEAD_STAGES,
  getAttorneyLeadLifecycleStatusForStage,
  getAttorneyLeadRoleAccess,
  isAttorneyLeadServiceType,
  isAttorneyLeadStage,
  normalizeAttorneyLeadSourceChannel,
  sanitizeAttorneyLeadCampaignCode,
} from '../attorneyLeadContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('first-release Attorney services use stable canonical keys', () => {
  assert.deepEqual(Object.values(ATTORNEY_LEAD_SERVICE_TYPES), [
    'transfer_quote',
    'property_transfer',
    'bond_registration',
    'bond_cancellation',
    'property_legal_advice',
    'general_enquiry',
  ])
  assert.equal(isAttorneyLeadServiceType('Transfer Quote'), true)
  assert.equal(isAttorneyLeadServiceType('general litigation'), false)
})

test('Attorney Lead stages are separate from lifecycle statuses', () => {
  assert.equal(isAttorneyLeadStage('Quote Sent'), true)
  assert.equal(getAttorneyLeadLifecycleStatusForStage(ATTORNEY_LEAD_STAGES.qualified), ATTORNEY_LEAD_LIFECYCLE_STATUSES.open)
  assert.equal(getAttorneyLeadLifecycleStatusForStage(ATTORNEY_LEAD_STAGES.won), ATTORNEY_LEAD_LIFECYCLE_STATUSES.won)
  assert.equal(getAttorneyLeadLifecycleStatusForStage(ATTORNEY_LEAD_STAGES.lost), ATTORNEY_LEAD_LIFECYCLE_STATUSES.lost)
  assert.equal(
    getAttorneyLeadLifecycleStatusForStage(ATTORNEY_LEAD_STAGES.followUp, ATTORNEY_LEAD_LIFECYCLE_STATUSES.archived),
    ATTORNEY_LEAD_LIFECYCLE_STATUSES.archived,
  )
})

test('public source aliases normalize to a strict allowlist', () => {
  assert.equal(normalizeAttorneyLeadSourceChannel('Instagram Bio'), ATTORNEY_LEAD_SOURCE_CHANNELS.instagram)
  assert.equal(normalizeAttorneyLeadSourceChannel('QR code'), ATTORNEY_LEAD_SOURCE_CHANNELS.qr)
  assert.equal(normalizeAttorneyLeadSourceChannel('walk-in'), ATTORNEY_LEAD_SOURCE_CHANNELS.manual)
  assert.equal(normalizeAttorneyLeadSourceChannel('javascript:alert(1)'), ATTORNEY_LEAD_SOURCE_CHANNELS.other)
})

test('campaign codes are bounded and contain only analytics-safe characters', () => {
  assert.equal(sanitizeAttorneyLeadCampaignCode(' Transfer Quote / July 2026 '), 'transfer-quote-july-2026')
  assert.equal(sanitizeAttorneyLeadCampaignCode('<script>alert(1)</script>'), 'script-alert-1-script')
  assert.equal(sanitizeAttorneyLeadCampaignCode('abcdef', 4), 'abcd')
})

test('leadership receives all-workspace management access', () => {
  for (const role of ['owner', 'partner', 'director', 'firm_admin', 'director_partner']) {
    const access = getAttorneyLeadRoleAccess(role)
    assert.equal(access.scope, ATTORNEY_LEAD_ACCESS_SCOPES.all)
    assert.equal(access.view, true)
    assert.equal(access.create, true)
    assert.equal(access.edit, true)
    assert.equal(access.assign, true)
    assert.equal(access.archive, true)
  }
})

test('practitioners can work assigned and unassigned leads but cannot assign or archive', () => {
  for (const role of ['attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney', 'candidate_attorney']) {
    const access = getAttorneyLeadRoleAccess(role)
    assert.equal(access.scope, ATTORNEY_LEAD_ACCESS_SCOPES.assignedAndUnassigned)
    assert.equal(access.view, true)
    assert.equal(access.create, true)
    assert.equal(access.edit, true)
    assert.equal(access.assign, false)
    assert.equal(access.archive, false)
  }
})

test('viewer access is assigned-only and read-only', () => {
  const access = getAttorneyLeadRoleAccess('viewer')
  assert.equal(access.scope, ATTORNEY_LEAD_ACCESS_SCOPES.assigned)
  assert.equal(access.view, true)
  assert.equal(access.create, false)
  assert.equal(access.edit, false)
  assert.equal(access.assign, false)
  assert.equal(access.archive, false)
  assert.equal(getAttorneyLeadRoleAccess('unknown-role'), null)
})

console.log('attorneyLeadContract tests passed')

