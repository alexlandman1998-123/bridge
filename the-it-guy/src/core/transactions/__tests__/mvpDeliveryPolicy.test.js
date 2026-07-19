import assert from 'node:assert/strict'

import {
  assertMvpDeliveryWorkstreamAllowed,
  assessMvpDeliveryWorkstream,
  MVP_DELIVERY_POLICY_VERSION,
} from '../mvpDeliveryPolicy.js'

{
  const assessment = assessMvpDeliveryWorkstream('workflow controls')
  assert.equal(assessment.version, MVP_DELIVERY_POLICY_VERSION)
  assert.equal(assessment.workstream, 'workflow_controls')
  assert.equal(assessment.allowed, true)
  assert.equal(assessment.decision, 'proceed')
}

{
  const assessment = assessMvpDeliveryWorkstream('advanced analytics')
  assert.equal(assessment.allowed, false)
  assert.equal(assessment.decision, 'frozen')
}

{
  const assessment = assessMvpDeliveryWorkstream('new-experiment')
  assert.equal(assessment.allowed, false)
  assert.equal(assessment.decision, 'product_exception_required')
}

assert.throws(
  () => assertMvpDeliveryWorkstreamAllowed('calendar_expansion'),
  (error) => error?.code === 'mvp_feature_freeze',
)

console.log('mvp delivery policy tests passed')
