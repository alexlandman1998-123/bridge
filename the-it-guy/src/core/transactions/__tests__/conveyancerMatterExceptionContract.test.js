import assert from 'node:assert/strict'
import {
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_EVIDENCE_TYPES,
  MATTER_PLAN_OWNER_ROLES,
} from '../conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION,
  CONVEYANCER_MATTER_EXCEPTION_SCHEMA,
  MATTER_EXCEPTION_CAPABILITIES,
  MATTER_EXCEPTION_CATEGORIES,
  MATTER_EXCEPTION_RESOLUTION_OUTCOMES,
  MATTER_EXCEPTION_SEVERITIES,
  MATTER_EXCEPTION_SEVERITY_POLICY,
  MATTER_EXCEPTION_SOURCE_TYPES,
  MATTER_EXCEPTION_STATUSES,
  canMatterExceptionActor,
  evaluateMatterExceptionEscalation,
  evaluateMatterExceptionSupersession,
  evaluateMatterExceptionTransition,
  validateConveyancerMatterException,
} from '../conveyancerMatterExceptionContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const detectedAt = '2026-07-15T08:00:00.000Z'

function exception(overrides = {}) {
  return {
    contractVersion: CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION,
    exceptionId: 'exception-1',
    planId: 'matter_plan:tx-b1-1:v1',
    planVersion: 1,
    transactionId: 'tx-b1-1',
    organisationId: 'org-b1-1',
    actionKey: 'verify_authority',
    code: 'missing_company_resolution',
    deduplicationKey: 'tx-b1-1:verify_authority:missing_company_resolution',
    title: 'Company resolution is outstanding',
    description: 'The purchaser company has not supplied an authorised acquisition resolution.',
    category: MATTER_EXCEPTION_CATEGORIES.authority,
    severity: MATTER_EXCEPTION_SEVERITIES.high,
    status: MATTER_EXCEPTION_STATUSES.open,
    source: {
      type: MATTER_EXCEPTION_SOURCE_TYPES.systemRule,
      ruleId: 'authority.company_resolution.v1',
      detectedAt,
      detectedBy: { role: MATTER_PLAN_OWNER_ROLES.system },
    },
    impact: {
      blocksMatter: false,
      blockedActionKeys: ['verify_authority'],
      affectedRoles: [MATTER_PLAN_OWNER_ROLES.transferAttorney],
      customerVisible: true,
    },
    owner: { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, teamId: 'transfer-team' },
    sla: {
      respondBy: '2026-07-15T16:00:00.000Z',
      resolveBy: '2026-07-17T08:00:00.000Z',
    },
    evidenceRequirements: [{
      key: 'company_resolution',
      label: 'Signed company resolution',
      type: MATTER_PLAN_EVIDENCE_TYPES.document,
      required: true,
      requiresApproval: true,
    }],
    evidence: [],
    escalation: { level: 0 },
    createdAt: detectedAt,
    updatedAt: detectedAt,
    runtimeRevision: 0,
    ...overrides,
  }
}

function validate(input = exception()) {
  return validateConveyancerMatterException(input, { actionKeys: ['open_matter', 'verify_authority'] })
}

test('validates a first-class action-linked exception contract', () => {
  const result = validate()
  assert.equal(result.valid, true)
  assert.equal(result.exception.contractVersion, CONVEYANCER_MATTER_EXCEPTION_CONTRACT_VERSION)
  assert.equal(CONVEYANCER_MATTER_EXCEPTION_SCHEMA.planMutationAllowed, false)
  assert.equal(result.exception.impact.blockedActionKeys[0], 'verify_authority')
})

test('rejects explicit invalid classification values', () => {
  const result = validate(exception({ category: 'surprise', severity: 'urgent', status: 'done' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('invalid_exception_category'))
  assert.ok(result.errors.includes('invalid_exception_severity'))
  assert.ok(result.errors.includes('invalid_exception_status'))
})

test('requires status to be explicit even though normalization is safe', () => {
  const source = exception()
  delete source.status
  const result = validate(source)
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('exception_status_required'))
})

test('requires a stable key for later detector idempotency', () => {
  const result = validate(exception({ deduplicationKey: '' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('exception_deduplication_key_required'))
})

test('requires a valid source and accountable internal owner', () => {
  const result = validate(exception({
    source: { type: MATTER_EXCEPTION_SOURCE_TYPES.systemRule, detectedAt, detectedBy: { role: MATTER_PLAN_OWNER_ROLES.client } },
    owner: { role: MATTER_PLAN_OWNER_ROLES.client },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('system_rule_id_required'))
  assert.ok(result.errors.includes('owner_cannot_manage_exception'))
})

test('rejects action impact outside the referenced matter plan', () => {
  const result = validate(exception({
    actionKey: 'unknown_action',
    impact: { blockedActionKeys: ['also_unknown'], affectedRoles: [MATTER_PLAN_OWNER_ROLES.transferAttorney] },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('unknown_exception_action'))
  assert.ok(result.errors.includes('unknown_blocked_action'))
})

test('requires critical exceptions to block work, carry SLAs and be escalated', () => {
  const invalid = validate(exception({
    severity: MATTER_EXCEPTION_SEVERITIES.critical,
    impact: { blocksMatter: false, blockedActionKeys: [] },
    sla: {},
  }))
  assert.ok(invalid.errors.includes('critical_exception_must_block_work'))
  assert.ok(invalid.errors.includes('response_sla_required'))
  assert.ok(invalid.errors.includes('resolution_sla_required'))
  assert.ok(invalid.errors.includes('critical_exception_escalation_required'))
  assert.equal(MATTER_EXCEPTION_SEVERITY_POLICY.critical.escalationRequired, true)
})

test('waiting on an external party requires context and a follow-up time', () => {
  const result = validate(exception({ status: MATTER_EXCEPTION_STATUSES.waitingExternal }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('waiting_on_required'))
  assert.ok(result.errors.includes('follow_up_at_required'))
})

test('resolution requires approved evidence and an authorised resolver', () => {
  const base = exception({
    status: MATTER_EXCEPTION_STATUSES.resolved,
    resolution: {
      outcome: MATTER_EXCEPTION_RESOLUTION_OUTCOMES.fulfilled,
      summary: 'The signed resolution was checked and accepted.',
      resolvedAt: '2026-07-15T12:00:00.000Z',
      resolvedBy: { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' },
    },
  })
  const invalid = validate(base)
  assert.ok(invalid.errors.includes('required_resolution_evidence_not_satisfied'))

  const valid = validate({
    ...base,
    evidence: [{
      requirementKey: 'company_resolution',
      status: MATTER_PLAN_EVIDENCE_STATUSES.approved,
      referenceId: 'document-1',
      capturedAt: '2026-07-15T11:30:00.000Z',
      capturedBy: { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' },
    }],
  })
  assert.equal(valid.valid, true)
})

test('critical waivers require accepted risk, a reason and firm-manager authority', () => {
  const result = validate(exception({
    severity: MATTER_EXCEPTION_SEVERITIES.critical,
    status: MATTER_EXCEPTION_STATUSES.waived,
    impact: { blocksMatter: true, blockedActionKeys: ['verify_authority'] },
    escalation: {
      level: 1,
      reason: 'Critical authority issue',
      escalatedAt: '2026-07-15T08:05:00.000Z',
      escalatedBy: { role: MATTER_PLAN_OWNER_ROLES.transferAttorney },
    },
    evidenceRequirements: [],
    resolution: {
      outcome: MATTER_EXCEPTION_RESOLUTION_OUTCOMES.acceptedRisk,
      summary: 'Risk accepted for test.',
      reason: 'Recorded legal decision.',
      resolvedAt: '2026-07-15T09:00:00.000Z',
      resolvedBy: { role: MATTER_PLAN_OWNER_ROLES.transferAttorney },
    },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('critical_waiver_requires_firm_manager'))
})

test('lifecycle transitions enforce capability, evidence and reasons', () => {
  const acknowledged = evaluateMatterExceptionTransition({
    fromStatus: MATTER_EXCEPTION_STATUSES.open,
    toStatus: MATTER_EXCEPTION_STATUSES.acknowledged,
    actorRole: MATTER_PLAN_OWNER_ROLES.secretary,
  })
  assert.equal(acknowledged.allowed, true)

  const unresolved = evaluateMatterExceptionTransition({
    fromStatus: MATTER_EXCEPTION_STATUSES.investigating,
    toStatus: MATTER_EXCEPTION_STATUSES.resolved,
    actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney,
  })
  assert.equal(unresolved.allowed, false)
  assert.equal(unresolved.reason, 'required_resolution_evidence_not_satisfied')

  const clientResolution = evaluateMatterExceptionTransition({
    fromStatus: MATTER_EXCEPTION_STATUSES.investigating,
    toStatus: MATTER_EXCEPTION_STATUSES.resolved,
    actorRole: MATTER_PLAN_OWNER_ROLES.client,
    requiredEvidenceSatisfied: true,
  })
  assert.equal(clientResolution.allowed, false)
  assert.equal(clientResolution.reason, 'actor_lacks_exception_capability')
})

test('terminal exceptions reopen only under explicit review authority', () => {
  const attorney = evaluateMatterExceptionTransition({
    fromStatus: MATTER_EXCEPTION_STATUSES.resolved,
    toStatus: MATTER_EXCEPTION_STATUSES.investigating,
    actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney,
    reason: 'New contradictory evidence received',
  })
  assert.equal(attorney.allowed, true)
  assert.equal(attorney.requiredCapability, MATTER_EXCEPTION_CAPABILITIES.reopen)

  const secretary = evaluateMatterExceptionTransition({
    fromStatus: MATTER_EXCEPTION_STATUSES.resolved,
    toStatus: MATTER_EXCEPTION_STATUSES.investigating,
    actorRole: MATTER_PLAN_OWNER_ROLES.secretary,
  })
  assert.equal(secretary.allowed, false)

  const unexplained = evaluateMatterExceptionTransition({
    fromStatus: MATTER_EXCEPTION_STATUSES.resolved,
    toStatus: MATTER_EXCEPTION_STATUSES.investigating,
    actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney,
  })
  assert.equal(unexplained.allowed, false)
  assert.equal(unexplained.reason, 'exception_transition_reason_required')
})

test('escalation is sequential, reasoned and unavailable after resolution', () => {
  const allowed = evaluateMatterExceptionEscalation({
    exception: exception(),
    actorRole: MATTER_PLAN_OWNER_ROLES.secretary,
    nextLevel: 1,
    reason: 'SLA at risk',
  })
  assert.equal(allowed.allowed, true)

  const skipped = evaluateMatterExceptionEscalation({
    exception: exception(),
    actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney,
    nextLevel: 2,
    reason: 'Skip a level',
  })
  assert.equal(skipped.reason, 'next_escalation_level_required')

  const terminal = evaluateMatterExceptionEscalation({
    exception: exception({ status: MATTER_EXCEPTION_STATUSES.resolved }),
    actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney,
    nextLevel: 1,
    reason: 'Too late',
  })
  assert.equal(terminal.reason, 'terminal_exception_cannot_escalate')
})

test('supersession is manager-only, same-plan and reasoned', () => {
  const current = exception()
  const next = exception({ exceptionId: 'exception-2' })
  const attorney = evaluateMatterExceptionSupersession({ currentException: current, nextException: next, actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney, reason: 'Duplicate reclassified' })
  assert.equal(attorney.allowed, false)
  assert.equal(attorney.reason, 'exception_supersession_not_authorised')

  const manager = evaluateMatterExceptionSupersession({ currentException: current, nextException: next, actorRole: MATTER_PLAN_OWNER_ROLES.firmManager, reason: 'Duplicate reclassified' })
  assert.equal(manager.allowed, true)
  assert.equal(manager.reason, 'authorised_supersession')
})

test('role capabilities preserve client and support-team boundaries', () => {
  assert.equal(canMatterExceptionActor(MATTER_PLAN_OWNER_ROLES.client, MATTER_EXCEPTION_CAPABILITIES.raise), true)
  assert.equal(canMatterExceptionActor(MATTER_PLAN_OWNER_ROLES.client, MATTER_EXCEPTION_CAPABILITIES.resolve), false)
  assert.equal(canMatterExceptionActor(MATTER_PLAN_OWNER_ROLES.secretary, MATTER_EXCEPTION_CAPABILITIES.remediate), true)
  assert.equal(canMatterExceptionActor(MATTER_PLAN_OWNER_ROLES.secretary, MATTER_EXCEPTION_CAPABILITIES.waive), false)
  assert.equal(canMatterExceptionActor(MATTER_PLAN_OWNER_ROLES.transferAttorney, MATTER_EXCEPTION_CAPABILITIES.override), false)
  assert.equal(canMatterExceptionActor(MATTER_PLAN_OWNER_ROLES.firmManager, MATTER_EXCEPTION_CAPABILITIES.override), true)
})

console.log('conveyancer matter exception B1 contract tests passed')
