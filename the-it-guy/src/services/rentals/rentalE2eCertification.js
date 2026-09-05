export const RENTAL_E2E_SCENARIOS = Object.freeze([
  'lead_capture_and_qualification',
  'viewing_recorded_within_lead',
  'application_documents_and_fica',
  'approved_application_converts_to_tenancy',
  'tenant_portal_token_and_request',
  'landlord_portal_token_and_decision',
  'rentals_workspace_navigation',
  'rls_and_public_portal_boundaries',
])

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

export function assessRentalE2eCertification({ stagingRebuild = {}, certification = {} } = {}) {
  const scenarios = new Map((Array.isArray(certification.scenarios) ? certification.scenarios : []).map((scenario) => [scenario?.id, scenario]))
  const failedScenarios = RENTAL_E2E_SCENARIOS.filter((id) => {
    const scenario = scenarios.get(id)
    return !(scenario?.passed === true && text(scenario?.reference) && timestamp(scenario?.recordedAt))
  })
  const stagingReceiptBound = stagingRebuild.ready === true
    && certification.projectRef === stagingRebuild.target
    && certification.chainSha256 === stagingRebuild.chainSha256
  return {
    version: 'arch9_rental_e2e_certification_phase9_v1',
    status: stagingReceiptBound && failedScenarios.length === 0 ? 'STAGING_RENTALS_CERTIFIED' : 'BLOCKED_PENDING_STAGING_CERTIFICATION',
    ready: stagingReceiptBound && failedScenarios.length === 0,
    stagingReceiptBound,
    failedScenarios,
    requiredScenarios: RENTAL_E2E_SCENARIOS,
    applyAllowed: false,
    nextAction: stagingReceiptBound && failedScenarios.length === 0
      ? 'Staging workflow certification is complete; proceed to release-candidate preflight only.'
      : 'Attach a matching rebuilt-staging receipt and referenced passing evidence for every required Rentals scenario.',
  }
}
