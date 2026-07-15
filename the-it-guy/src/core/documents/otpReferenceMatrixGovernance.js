import { resolveLegalClausePackScenarioMatrixGovernance } from './legalClausePackScenarioMatrixGovernance.js'
import { resolveCanonicalOtpReferenceMatrixGovernance } from './otpCanonicalReferenceMatrixGovernance.js'
import { isCanonicalOtpTemplate } from './otpCanonicalReferenceMatrix.js'

export function resolveOtpReferenceMatrixGovernance(template = {}) {
  return isCanonicalOtpTemplate(template)
    ? resolveCanonicalOtpReferenceMatrixGovernance(template)
    : resolveLegalClausePackScenarioMatrixGovernance(template)
}
