import assert from 'node:assert/strict'

import {
  getMvpLaunchRoleDefinition,
  MVP_LAUNCH_ROLE_PLAN_VERSION,
  resolveMvpLaunchRolePlan,
} from '../mvpLaunchRoles.js'

function keys(rows = []) {
  return rows.map((row) => row.key)
}

{
  const plan = resolveMvpLaunchRolePlan({
    transactionType: 'private_sale',
    financeType: 'cash',
    buyerEntityType: 'individual',
    sellerEntityType: 'individual',
    requiresCancellationAttorney: false,
  })
  assert.equal(plan.version, MVP_LAUNCH_ROLE_PLAN_VERSION)
  assert.deepEqual(keys(plan.requiredAtCreation), ['buyer', 'seller', 'agent'])
  assert.deepEqual(keys(plan.requiredByFinance), [])
  assert.deepEqual(keys(plan.requiredByTransfer), ['transfer_attorney'])
}

{
  const plan = resolveMvpLaunchRolePlan({
    transactionType: 'private_sale',
    financeType: 'bond',
    buyerEntityType: 'company',
    sellerEntityType: 'trust',
    requiresCancellationAttorney: true,
  })
  assert.deepEqual(keys(plan.requiredByOtp), ['buyer_company_signatory', 'seller_trustee'])
  assert.deepEqual(keys(plan.requiredByFinance), ['bond_originator'])
  assert.deepEqual(keys(plan.requiredByTransfer), ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
}

{
  const plan = resolveMvpLaunchRolePlan({
    transactionType: 'development_sale',
    financeType: 'hybrid',
    buyerEntityType: 'trust',
    sellerEntityType: 'developer',
  })
  assert.deepEqual(keys(plan.requiredAtCreation), ['buyer', 'developer_representative'])
  assert.equal(plan.roles.find((role) => role.key === 'agent')?.requiredAtCreation, false)
  assert.equal(plan.roles.find((role) => role.key === 'buyer_trustee')?.requiredBy, 'otp_executed')
}

assert.equal(getMvpLaunchRoleDefinition('transfer_attorney')?.legalRole, 'transfer')
assert.equal(getMvpLaunchRoleDefinition('unknown_role'), null)

console.log('mvp launch role plan tests passed')
