import { buildDealSetup, validateDealSetup } from './dealSetupContract.js'

export const DEAL_SETUP_COMPATIBILITY_AUDIT_VERSION = 'deal_setup_phase8_compatibility_v1'

export function auditDealSetupCompatibility({ transaction = {}, buyerParties = [] } = {}) {
  const setup = buildDealSetup({ transaction, buyerParties })
  const validation = validateDealSetup(setup)
  const issues = [...validation.issues]
  if (!transaction.buyer_parties_model_version) issues.push('Legacy buyer-party model version is not recorded.')
  if (setup.buyers.length && !setup.primaryBuyerId) issues.push('Legacy transaction has buyer parties but no primary buyer compatibility link.')
  return Object.freeze({ transactionId: setup.transactionId, readyForBackfill: issues.length === 0, issues: Object.freeze(issues), setup })
}
