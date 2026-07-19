import assert from 'node:assert/strict'
import { evaluateMvpOtpGate } from '../mvpOtpGate.js'
const common = { routingProfile: { transactionType: 'resale', financeType: 'cash', buyerEntityType: 'trust', sellerEntityType: 'individual' }, documentRequirements: [{ required_from_role: 'buyer', status: 'verified' }, { required_from_role: 'seller', status: 'verified' }] }
assert.equal(evaluateMvpOtpGate({ ...common, participants: [{ role_type: 'buyer' }, { role_type: 'seller' }] }).satisfied, false)
assert.equal(evaluateMvpOtpGate({ ...common, participants: [{ role_type: 'buyer' }, { role_type: 'seller' }, { mvp_launch_role_key: 'buyer_trustee' }] }).satisfied, true)
console.log('mvp OTP gate tests passed')
