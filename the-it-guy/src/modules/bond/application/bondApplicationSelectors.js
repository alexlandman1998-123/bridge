export function getPrimaryApplicant(state) {
  return state?.participants?.primaryApplicant || null
}

export function getCoApplicant(state) {
  return state?.participants?.coApplicant || null
}

export function getPropertySummary(state) {
  return state?.application?.property || {}
}

export function getFinanceSummary(state) {
  return state?.application?.finance || {}
}

export function getSelectedBankIds(state) {
  return Array.isArray(state?.application?.selectedBankIds) ? state.application.selectedBankIds : []
}

export function getLegacySubmissionInfo(state) {
  return state?.legacySubmission || {}
}

export function getApplicationStatus(state) {
  return state?.meta?.status || state?.legacySubmission?.status || null
}

export function getAdapterDiagnostics(state) {
  return state?.compatibility?.diagnostics || []
}
