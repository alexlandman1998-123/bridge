import { validateDealSetup } from './dealSetupContract.js'

export const DEAL_SETUP_READINESS_VERSION = 'deal_setup_readiness_v1'

export function buildDealSetupReadiness({ setup = {}, requirements = [] } = {}) {
  const validation = validateDealSetup(setup)
  const missingRequirements = (Array.isArray(requirements) ? requirements : []).filter((item) => !item.satisfiedByProfile)
  const blockers = [...validation.issues, ...missingRequirements.map((item) => `${item.label} is required from ${item.owner}.`)]
  return Object.freeze({ version: DEAL_SETUP_READINESS_VERSION, ready: blockers.length === 0, blockerCount: blockers.length, blockers: Object.freeze(blockers), missingRequirementCount: missingRequirements.length })
}
