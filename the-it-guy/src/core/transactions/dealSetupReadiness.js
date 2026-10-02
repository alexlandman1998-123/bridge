import { validateDealSetup } from './dealSetupContract.js'

export const DEAL_SETUP_READINESS_VERSION = 'deal_setup_readiness_v2'

export function buildDealSetupReadiness({ setup = {}, requirements = [] } = {}) {
  const validation = validateDealSetup(setup)
  // These requirements describe reusable profile coverage, not the transaction's
  // received/approved uploads. They must not determine setup or review completion.
  const missingRequirements = (Array.isArray(requirements) ? requirements : []).filter((item) => !item.satisfiedByProfile)
  const documentRequirementIssues = missingRequirements.map((item) => `${item.label} is required from ${item.owner}.`)
  return Object.freeze({
    version: DEAL_SETUP_READINESS_VERSION,
    ready: validation.valid,
    blockerCount: validation.issues.length,
    blockers: validation.issues,
    missingRequirementCount: missingRequirements.length,
    documentRequirementIssues: Object.freeze(documentRequirementIssues),
  })
}
