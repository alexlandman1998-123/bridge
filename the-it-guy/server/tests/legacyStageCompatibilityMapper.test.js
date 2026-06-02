import assert from 'node:assert/strict'

import { mapLegacyStageToWorkflowAction } from '../services/legacyStageCompatibilityMapper.js'

assert.equal(mapLegacyStageToWorkflowAction('FIN'), 'MOVE_TO_FINANCE')
assert.equal(mapLegacyStageToWorkflowAction('FINANCE'), 'MOVE_TO_FINANCE')
assert.equal(mapLegacyStageToWorkflowAction('TRANSFER'), 'MOVE_TO_TRANSFER')
assert.equal(mapLegacyStageToWorkflowAction('REGISTRATION'), 'MARK_READY_FOR_REGISTRATION')
assert.equal(mapLegacyStageToWorkflowAction('COMPLETE'), 'MARK_REGISTERED')
assert.equal(mapLegacyStageToWorkflowAction('CANCELLED'), 'CANCEL_TRANSACTION')

assert.throws(
  () => mapLegacyStageToWorkflowAction('OTP'),
  /Unsupported legacy stage: OTP/,
)

console.log('legacyStageCompatibilityMapper tests passed')
