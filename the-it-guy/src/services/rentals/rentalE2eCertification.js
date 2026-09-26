export const RENTAL_E2E_SCENARIOS = Object.freeze([
  'lead_capture_and_qualification',
  'tenant_and_landlord_enquiries_excluded_from_sales',
  'lead_branch_and_agent_access',
  'viewing_recorded_within_lead',
  'application_link_pending_until_submission',
  'application_documents_and_fica',
  'landlord_lead_signed_mandate_and_linked_listing',
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
  const scenarios = (Array.isArray(certification.scenarios) ? certification.scenarios : []).reduce((byId, scenario) => {
    const id = text(scenario?.id)
    byId.set(id, [...(byId.get(id) || []), scenario])
    return byId
  }, new Map())
  const failedScenarios = RENTAL_E2E_SCENARIOS.filter((id) => {
    const matches = scenarios.get(id) || []
    const scenario = matches[0]
    return !(matches.length === 1 && scenario?.passed === true && text(scenario?.reference) && timestamp(scenario?.recordedAt))
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
