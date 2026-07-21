function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const REASON_CODES = Object.freeze({ paused: 'N6_PAUSED', expired: 'N6_EXPIRED', not_enrolled: 'N6_NOT_ENROLLED', cohort_limit_exceeded: 'N6_COHORT_LIMIT_EXCEEDED', invalid_control: 'N6_INVALID_CONTROL' })

function denied(code, title, message, phases, metadata = {}) {
  return { contract: 'arch9-document-experience-runtime-rollout-gate-v1', allowed: false, status: 'blocked', code, title, message, solution: { phases: phases.map((action, index) => ({ id: `N6.${index + 1}`, action })) }, ...metadata }
}

function shadowAllowed(code, metadata = {}) {
  return { contract: 'arch9-document-experience-runtime-rollout-gate-v1', allowed: true, status: 'shadow_allowed', code, ...metadata }
}

export function resolveDocumentExperienceRuntimeRolloutAccess({ organisationId = '', enforcementMode = 'shadow', schemaAvailable = false, rpcResult = null } = {}) {
  const enforcement = key(enforcementMode) === 'enforced' ? 'enforced' : 'shadow'
  const organisationPresent = Boolean(text(organisationId))
  if (!schemaAvailable) {
    if (enforcement === 'shadow') return shadowAllowed('N6_SHADOW_SCHEMA_PENDING', { stage: 'legacy', revision: 0, configured: false })
    return denied('N6_RUNTIME_STORE_UNAVAILABLE', 'Document rollout check unavailable', 'The rollout control store cannot be verified, so this workspace remains closed.', ['Restore the N6 migration and runtime RPC.', 'Verify the organisation control before retrying.'])
  }
  if (!organisationPresent) {
    if (enforcement === 'shadow') return shadowAllowed('N6_SHADOW_UNSCOPED', { stage: 'legacy', revision: 0, configured: false })
    return denied('N6_ORGANISATION_REQUIRED', 'Organisation required', 'This document must be opened inside an authorised organisation.', ['Return to the transaction or listing workspace.', 'Open the document from its organisation-scoped record.'])
  }
  const configured = rpcResult?.configured === true
  if (!configured) {
    if (enforcement === 'shadow') return shadowAllowed('N6_SHADOW_NOT_CONFIGURED', { stage: 'legacy', revision: 0, configured: false })
    return denied('N6_CONTROL_NOT_CONFIGURED', 'Document rollout not configured', 'This organisation has not been enrolled in the controlled document rollout.', ['Ask the rollout operator to review the latest N4/N5 evidence.', 'Add the organisation through a bounded N6 control before retrying.'])
  }
  const reason = key(rpcResult?.reason)
  const stage = key(rpcResult?.stage) || null
  const revision = Number(rpcResult?.revision || 0)
  const metadata = { configured: true, stage, revision, expiresAt: rpcResult?.expires_at || null }
  if (enforcement === 'shadow') return shadowAllowed(`N6_SHADOW_${(REASON_CODES[reason] || 'ACCESS_DENIED').replace(/^N6_/, '')}`, { ...metadata, observedReason: reason || null, observedAllowed: rpcResult?.allowed === true })
  if (rpcResult?.allowed === true && ['pilot', 'expanded', 'full'].includes(stage)) return { contract: 'arch9-document-experience-runtime-rollout-gate-v1', allowed: true, status: 'rollout_allowed', code: 'N6_ENROLLED', ...metadata }
  const messages = {
    paused: ['Document rollout paused', 'This organisation’s document rollout is paused while the current issue is resolved.'],
    expired: ['Document rollout window expired', 'The authorised rollout window ended and must be reassessed before continuing.'],
    not_enrolled: ['Organisation not enrolled', 'This organisation is outside the currently authorised document cohort.'],
    cohort_limit_exceeded: ['Rollout cohort limit reached', 'The authorised participant ceiling has been reached.'],
    invalid_control: ['Rollout control invalid', 'The active rollout record failed its runtime safety checks.'],
  }
  const [title, message] = messages[reason] || ['Document rollout unavailable', 'The runtime rollout gate did not authorise this organisation.']
  return denied(REASON_CODES[reason] || 'N6_ACCESS_DENIED', title, message, ['Do not bypass or recreate the document from another route.', 'Resolve the active N5/N6 control condition.', 'Rerun N4 and issue a fresh staged control if required.'], metadata)
}
