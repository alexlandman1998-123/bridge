import assert from 'node:assert/strict'

import {
  OFFER_WORKFLOW_RETIRED,
  OFFER_WORKFLOW_RETIRED_MESSAGE,
  OFFER_WORKFLOW_RETIRED_REASON,
  assertOfferWorkflowAvailable,
} from '../offerWorkflowRetirement.js'

assert.equal(OFFER_WORKFLOW_RETIRED, true)
assert.match(OFFER_WORKFLOW_RETIRED_MESSAGE, /buyer onboarding/i)
assert.match(OFFER_WORKFLOW_RETIRED_REASON, /OTP preparation/i)

assert.throws(
  () => assertOfferWorkflowAvailable(),
  (error) => {
    assert.equal(error?.code, 'offer_workflow_retired')
    assert.equal(error?.message, OFFER_WORKFLOW_RETIRED_MESSAGE)
    assert.equal(error?.reason, OFFER_WORKFLOW_RETIRED_REASON)
    return true
  },
)

console.log('offer workflow retirement tests passed')
