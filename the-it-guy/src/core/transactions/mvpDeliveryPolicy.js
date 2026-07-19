export const MVP_DELIVERY_POLICY_VERSION = 'arch9_mvp_delivery_policy_v1'

export const MVP_ALLOWED_WORKSTREAMS = Object.freeze({
  launch_scope: 'Launch boundary, role plan, and transaction truth contract',
  transaction_spine: 'Atomic transaction creation, canonical facts, and idempotency',
  workflow_controls: 'Workflow lanes, gates, overrides, and stage integrity',
  document_control: 'Canonical requirements, document ownership, review, and readiness',
  participant_invites: 'Participants, signatories, invitations, and role visibility',
  transaction_overview: 'Shared transaction overview and role-specific next actions',
  communications: 'Transaction notifications, delivery records, retries, and resend controls',
  simulation_reliability: 'Staging fixtures, golden scenarios, reconciliation, and repair tooling',
  release_operations: 'Build, test, environment, authentication, and release safety',
})

export const MVP_FROZEN_WORKSTREAMS = Object.freeze({
  crm_expansion: 'New CRM features beyond the lead-to-transaction path',
  ai_automation: 'New AI assistants, intelligence, or automation features',
  advanced_analytics: 'New executive reporting, analytics, or dashboard expansion',
  calendar_expansion: 'New calendar, scheduling, or appointment features',
  commercial_expansion: 'New commercial sales, lease, or asset-management workflows',
  enterprise_workspace: 'Enterprise hierarchy, billing, team, or permission expansion',
  workflow_builder: 'Custom workflow-builder or per-firm workflow configuration',
  billing_payments: 'Billing, subscription, payment, or commission-product expansion',
})

function normalizeWorkstream(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function assessMvpDeliveryWorkstream(workstream = '') {
  const key = normalizeWorkstream(workstream)
  if (MVP_ALLOWED_WORKSTREAMS[key]) {
    return {
      version: MVP_DELIVERY_POLICY_VERSION,
      workstream: key,
      allowed: true,
      decision: 'proceed',
      reason: MVP_ALLOWED_WORKSTREAMS[key],
    }
  }
  if (MVP_FROZEN_WORKSTREAMS[key]) {
    return {
      version: MVP_DELIVERY_POLICY_VERSION,
      workstream: key,
      allowed: false,
      decision: 'frozen',
      reason: MVP_FROZEN_WORKSTREAMS[key],
    }
  }
  return {
    version: MVP_DELIVERY_POLICY_VERSION,
    workstream: key || null,
    allowed: false,
    decision: 'product_exception_required',
    reason: 'This workstream is not in the MVP delivery plan. Add an explicit product exception before implementation.',
  }
}

export function assertMvpDeliveryWorkstreamAllowed(workstream = '') {
  const assessment = assessMvpDeliveryWorkstream(workstream)
  if (assessment.allowed) return assessment

  const error = new Error(assessment.reason)
  error.code = assessment.decision === 'frozen' ? 'mvp_feature_freeze' : 'mvp_product_exception_required'
  error.deliveryPolicy = assessment
  throw error
}
