export const DEVELOPER_LEAD_PHASE16_CONTRACT = 'developer-leads-phase16-launch-readiness-v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isAgencyFedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.accessProfile?.agencyFed === true
}

function isProtectedAgencyLead(lead = {}) {
  return isAgencyFedLead(lead) && lead.accessProfile?.requiresHandoverBeforePrivateDetails === true
}

function isConvertedLead(lead = {}) {
  return normalizeText(lead.leadStatus) === 'converted'
}

function hasLeakedProtectedDetails(lead = {}) {
  if (!isProtectedAgencyLead(lead)) return false
  return Boolean(
    normalizeText(lead.buyerFullName) ||
    normalizeText(lead.buyerEmail) ||
    normalizeText(lead.buyerPhone) ||
    normalizeText(lead.privateNotes),
  )
}

function buildCheck({ key, label, status, detail }) {
  return Object.freeze({ key, label, status, detail })
}

export function buildDeveloperLeadLaunchReadiness({
  leads = [],
  schemaAvailable = true,
  conversionBridgeEnabled = false,
  buyerOnboardingSendEnabled = false,
} = {}) {
  const rows = Array.isArray(leads) ? leads : []
  const developerFedCount = rows.filter((lead) => !isAgencyFedLead(lead)).length
  const agencyFedCount = rows.filter(isAgencyFedLead).length
  const protectedAgencyCount = rows.filter(isProtectedAgencyLead).length
  const leakedProtectedCount = rows.filter(hasLeakedProtectedDetails).length
  const handoverPendingCount = rows.filter((lead) => isAgencyFedLead(lead) && lead.visibilityState === 'consent_pending').length
  const convertedCount = rows.filter(isConvertedLead).length

  const checks = [
    buildCheck({
      key: 'phase10_schema_contract',
      label: 'Developer lead schema',
      status: schemaAvailable ? 'ready' : 'blocked',
      detail: schemaAvailable
        ? 'Developer lead tables, private details, interests, activity, RLS, and Data API grants are expected.'
        : 'Apply the Phase 10 Supabase migration before live lead intake.',
    }),
    buildCheck({
      key: 'developer_fed_intake',
      label: 'Developer-fed intake',
      status: 'ready',
      detail: `${developerFedCount} developer-owned lead${developerFedCount === 1 ? '' : 's'} in the current view.`,
    }),
    buildCheck({
      key: 'agency_privacy_boundary',
      label: 'Agency-fed privacy',
      status: leakedProtectedCount === 0 ? 'ready' : 'blocked',
      detail: leakedProtectedCount === 0
        ? `${protectedAgencyCount} protected agency-fed lead${protectedAgencyCount === 1 ? '' : 's'} keep buyer details hidden.`
        : `${leakedProtectedCount} protected agency-fed lead${leakedProtectedCount === 1 ? '' : 's'} show private buyer fields.`,
    }),
    buildCheck({
      key: 'agency_handover_queue',
      label: 'Agency handover queue',
      status: handoverPendingCount > 0 ? 'attention' : 'ready',
      detail: handoverPendingCount > 0
        ? `${handoverPendingCount} handover request${handoverPendingCount === 1 ? '' : 's'} awaiting agency action.`
        : 'No agency handover requests are waiting in the current view.',
    }),
    buildCheck({
      key: 'lead_to_transaction_bridge',
      label: 'Lead-to-transaction bridge',
      status: conversionBridgeEnabled ? 'ready' : 'pending',
      detail: conversionBridgeEnabled
        ? `${convertedCount} OTP-ready lead${convertedCount === 1 ? '' : 's'} linked to transaction workflow.`
        : 'Transaction workflow handoff is gated until OTP upload.',
    }),
    buildCheck({
      key: 'buyer_onboarding_send',
      label: 'Buyer onboarding send',
      status: buyerOnboardingSendEnabled ? 'ready' : 'pending',
      detail: buyerOnboardingSendEnabled
        ? 'Buyer onboarding links can be sent from qualified, viewing, or reserved developer leads.'
        : 'Buyer onboarding links remain available from transaction workspaces only.',
    }),
  ]

  const blockedCount = checks.filter((check) => check.status === 'blocked').length
  const pendingCount = checks.filter((check) => check.status === 'pending').length
  const attentionCount = checks.filter((check) => check.status === 'attention').length

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE16_CONTRACT,
    status: blockedCount > 0 ? 'blocked' : pendingCount > 0 ? 'pending' : attentionCount > 0 ? 'attention' : 'ready',
    summary: {
      total: rows.length,
      developerFed: developerFedCount,
      agencyFed: agencyFedCount,
      protectedAgency: protectedAgencyCount,
      handoverPending: handoverPendingCount,
      converted: convertedCount,
      blocked: blockedCount,
      pending: pendingCount,
      attention: attentionCount,
    },
    checks,
  })
}
