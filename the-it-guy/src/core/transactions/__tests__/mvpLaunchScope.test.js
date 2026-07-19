import assert from 'node:assert/strict'

import {
  MVP_LAUNCH_SCOPE_VERSION,
  assertMvpLaunchScope,
  evaluateMvpLaunchScope,
} from '../mvpLaunchScope.js'

const supportedResidentialResale = {
  transactionType: 'private_sale',
  financeType: 'cash',
  propertyTenure: 'freehold',
  buyerEntityType: 'individual',
  sellerEntityType: 'individual',
}

{
  const assessment = evaluateMvpLaunchScope(supportedResidentialResale)
  assert.equal(assessment.version, MVP_LAUNCH_SCOPE_VERSION)
  assert.equal(assessment.status, 'supported')
  assert.equal(assessment.supported, true)
  assert.equal(assessment.readyForMvpTransactionCreation, true)
  assert.deepEqual(assessment.issues, [])
}

{
  const assessment = evaluateMvpLaunchScope({
    transactionType: 'development_sale',
    financeType: 'hybrid',
    propertyTenure: 'sectional_title',
    buyerEntityType: 'trust',
    sellerEntityType: 'developer',
  })
  assert.equal(assessment.status, 'supported')
}

{
  const assessment = evaluateMvpLaunchScope({
    ...supportedResidentialResale,
    transactionType: 'commercial',
  })
  assert.equal(assessment.status, 'out_of_scope')
  assert.deepEqual(assessment.unsupportedFields, ['transactionType'])
}

{
  const assessment = evaluateMvpLaunchScope({
    ...supportedResidentialResale,
    financeType: 'unknown',
    buyerEntityType: '',
  })
  assert.equal(assessment.status, 'incomplete')
  assert.deepEqual(assessment.missingFields, ['financeType', 'buyerEntityType'])
}

{
  assert.throws(
    () => assertMvpLaunchScope({ ...supportedResidentialResale, sellerEntityType: 'developer' }),
    (error) => error?.code === 'mvp_transaction_out_of_scope' && error?.launchScope?.status === 'out_of_scope',
  )
}

console.log('mvp launch scope tests passed')
