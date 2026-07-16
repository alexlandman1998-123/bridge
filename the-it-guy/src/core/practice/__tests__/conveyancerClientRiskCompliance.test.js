import assert from 'node:assert/strict'
import {
  buildClientRiskAssessment,
  buildComplianceAuditEvent,
  buildComplianceAuditExport,
  buildCompliancePartyProfile,
  buildFirmCompliancePolicy,
  buildRestrictedComplianceEscalation,
  CLIENT_RISK_RATINGS,
  DUE_DILIGENCE_ROUTES,
  evaluateComplianceReassessment,
  reviewClientRiskAssessment,
} from '../conveyancerClientRiskCompliance.js'
import { CANONICAL_EVIDENCE_TYPES, CONVEYANCER_MANUAL_EVIDENCE_VERSION } from '../conveyancerManualEvidenceRegister.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const matter = '50000000-0000-4000-8000-000000000001'
const assessor = '60000000-0000-4000-8000-000000000001'
const reviewer = '70000000-0000-4000-8000-000000000001'
const manager = '80000000-0000-4000-8000-000000000001'
const party = 'party:g4:buyer'
const at = '2026-07-16T12:00:00.000Z'
const hashA = `sha256:${'a'.repeat(64)}`
const hashB = `sha256:${'b'.repeat(64)}`

function identity(operationId = 'assessment:g4:1') {
  return { organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team, transactionId: matter, operationId, lane: 'transfer' }
}

function actor(role = 'responsible_attorney', userId = assessor) {
  return { userId, membershipId: `membership:${userId}`, role, organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team }
}

function policy(overrides = {}) {
  return buildFirmCompliancePolicy({
    policyId: 'rmcp:g4:1',
    policyVersion: '1.0.0',
    organisationId: org,
    attorneyFirmId: firm,
    rmcpReference: 'document://firm/rmcp/1',
    effectiveAt: '2026-07-01T00:00:00Z',
    reviewIntervalDays: 365,
    allowSimplifiedDueDiligence: true,
    reason: 'Firm-approved risk management and compliance programme.',
    ...overrides,
  })
}

function profile(overrides = {}) {
  return {
    profileId: 'profile:g4:buyer',
    identity: identity(),
    partyId: party,
    partyType: 'natural_person',
    roleInMatter: 'purchaser',
    identityReference: 'party-vault://g4/buyer',
    identityHash: hashA,
    residenceOrIncorporationCountry: 'za',
    beneficialOwners: [],
    authorisedRepresentatives: [],
    capturedAt: at,
    capturedBy: assessor,
    retainUntil: '2032-07-16T00:00:00Z',
    ...overrides,
  }
}

function acceptedEvidence(type, overrides = {}) {
  return {
    version: CONVEYANCER_MANUAL_EVIDENCE_VERSION,
    evidenceId: `evidence:g4:${type}`,
    identity: identity(`evidence:g4:${type}`),
    canonicalEvidenceType: type,
    state: 'accepted',
    quality: { complete: true },
    confirmedFields: { party_id: party },
    acceptedBy: reviewer,
    acceptedAt: at,
    ...overrides,
  }
}

function evidenceFor(types) {
  return types.map((type) => acceptedEvidence(type))
}

const baseTypes = [CANONICAL_EVIDENCE_TYPES.identityDocument, CANONICAL_EVIDENCE_TYPES.addressVerification, CANONICAL_EVIDENCE_TYPES.pepScreening, CANONICAL_EVIDENCE_TYPES.sanctionsScreening]

function assessment(overrides = {}) {
  return buildClientRiskAssessment({
    assessmentId: 'assessment:g4:1',
    policy: policy().policy,
    profile: profile(),
    assessedBy: actor(),
    assessedAt: at,
    indicators: [],
    evidence: evidenceFor(baseTypes),
    ...overrides,
  })
}

function indicator(id, overrides = {}) {
  return { id, present: true, evidenceReference: `screening://${id}`, evidenceHash: hashB, rationale: `Reviewed ${id} indicator.`, source: 'manual_review', ...overrides }
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('binds a configurable firm RMCP rather than imposing one universal policy', () => {
  const custom = policy({ thresholds: { lowMaximum: 10, mediumMaximum: 30 }, riskFactors: [{ id: 'firm_specific_factor', weight: 31, forcesEnhanced: true }] })
  assert.equal(custom.ok, true, JSON.stringify(custom.errors))
  assert.equal(custom.policy.thresholds.mediumMaximum, 30)
  assert.equal(custom.policy.riskFactors[0].id, 'firm_specific_factor')
  assert.match(custom.binding.policyFingerprint, /^fnv1a_/)
})

test('creates a reference-only protected profile for an individual', () => {
  const result = buildCompliancePartyProfile(profile())
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.profile.partyType, 'natural_person')
  assert.deepEqual(result.informationResource.classifications, ['financial', 'restricted', 'special_personal'])
  assert.equal(result.informationResource.exportPolicy, 'prohibited')
})

test('captures beneficial owners and authorised representatives for entities', () => {
  const result = buildCompliancePartyProfile(profile({
    partyType: 'company',
    beneficialOwners: [{ partyId: 'party:g4:owner', ownershipPercent: 75, controlBasis: 'shareholding', evidenceReference: 'evidence://owner', evidenceHash: hashB }, { partyId: 'party:g4:controller', controlBasis: 'effective_control', evidenceReference: 'evidence://controller', evidenceHash: hashB }],
    authorisedRepresentatives: [{ partyId: 'party:g4:director', capacity: 'director', evidenceReference: 'evidence://director', evidenceHash: hashB }],
  }))
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.profile.beneficialOwners[0].ownershipPercent, 75)
  assert.equal(result.profile.beneficialOwners[1].ownershipPercent, null)
  assert.equal(result.profile.authorisedRepresentatives[0].capacity, 'director')
})

test('routes a complete low-risk individual through firm-approved simplified CDD', () => {
  const result = assessment()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.assessment.rating, CLIENT_RISK_RATINGS.low)
  assert.equal(result.assessment.route, DUE_DILIGENCE_ROUTES.simplified)
  assert.deepEqual(result.assessment.outstandingRequirements, [])
  assert.equal(result.assessment.state, 'pending_review')
  assert.equal(result.assessment.mayProceed, false)
})

test('requires accepted G3 evidence bound to the same party and matter', () => {
  const wrongParty = evidenceFor(baseTypes).map((item) => ({ ...item, confirmedFields: { party_id: 'party:g4:other' } }))
  const result = assessment({ evidence: wrongParty })
  assert.equal(result.assessment.outstandingRequirements.length, baseTypes.length)
  assert.ok(result.assessment.holdReasons.includes('client_due_diligence_outstanding'))
})

test('uses explainable indicators to route PEP and high-risk clients to enhanced CDD', () => {
  const enhancedTypes = [...baseTypes, CANONICAL_EVIDENCE_TYPES.sourceOfFunds, CANONICAL_EVIDENCE_TYPES.sourceOfWealth, CANONICAL_EVIDENCE_TYPES.adverseMediaScreening]
  const result = assessment({ indicators: [indicator('pep_or_related_person')], evidence: evidenceFor(enhancedTypes) })
  assert.equal(result.assessment.score, 35)
  assert.equal(result.assessment.rating, CLIENT_RISK_RATINGS.medium)
  assert.equal(result.assessment.route, DUE_DILIGENCE_ROUTES.enhanced)
  assert.deepEqual(result.assessment.outstandingRequirements, [])
  assert.equal(result.assessment.indicators[0].rationale, 'Reviewed pep_or_related_person indicator.')
})

test('rejects duplicate indicators so risk weights cannot be counted twice', () => {
  const result = assessment({ indicators: [indicator('pep_or_related_person'), indicator('pep_or_related_person', { evidenceReference: 'screening://pep/second' })] })
  assert.ok(result.errors.includes('compliance_duplicate_indicator'))
})

test('places unresolved sanctions indicators on hold even when documents are complete', () => {
  const enhancedTypes = [...baseTypes, CANONICAL_EVIDENCE_TYPES.sourceOfFunds, CANONICAL_EVIDENCE_TYPES.sourceOfWealth, CANONICAL_EVIDENCE_TYPES.adverseMediaScreening]
  const result = assessment({ indicators: [indicator('sanctions_potential_match')], evidence: evidenceFor(enhancedTypes) })
  assert.equal(result.assessment.rating, CLIENT_RISK_RATINGS.high)
  assert.equal(result.assessment.state, 'held')
  assert.ok(result.assessment.holdReasons.includes('restricted_risk_indicator_requires_resolution'))
})

test('derives entity CDD requirements and blocks missing ownership or representation', () => {
  const result = assessment({ profile: profile({ partyType: 'trust' }), evidence: evidenceFor(baseTypes) })
  assert.ok(result.assessment.requirements.includes(CANONICAL_EVIDENCE_TYPES.beneficialOwnershipEvidence))
  assert.ok(result.assessment.requirements.includes(CANONICAL_EVIDENCE_TYPES.authorisedRepresentativeEvidence))
  assert.ok(result.assessment.holdReasons.includes('beneficial_ownership_outstanding'))
  assert.ok(result.assessment.holdReasons.includes('authorised_representative_outstanding'))
})

test('requires independent compliance approval and blocks approval with open CDD', () => {
  const ready = assessment().assessment
  const selfReview = reviewClientRiskAssessment({ assessment: ready, reviewer: actor(), decision: 'approved', reason: 'Reviewed.', reviewedAt: '2026-07-16T13:00:00Z' })
  assert.ok(selfReview.errors.includes('compliance_review_not_authorised'))
  const approval = reviewClientRiskAssessment({ assessment: ready, reviewer: actor('compliance', reviewer), decision: 'approved', reason: 'CDD complete and risk response appropriate.', reviewedAt: '2026-07-16T13:00:00Z' })
  assert.equal(approval.ok, true, JSON.stringify(approval.errors))
  assert.equal(approval.assessment.mayProceed, true)
  const repeated = reviewClientRiskAssessment({ assessment: approval.assessment, reviewer: actor('compliance', manager), decision: 'approved', reason: 'Repeat approval.', reviewedAt: '2026-07-16T14:00:00Z' })
  assert.ok(repeated.errors.includes('compliance_assessment_not_reviewable'))
  const blocked = reviewClientRiskAssessment({ assessment: assessment({ evidence: [] }).assessment, reviewer: actor('compliance', reviewer), decision: 'approved', reason: 'Attempt approval.', reviewedAt: '2026-07-16T13:00:00Z' })
  assert.ok(blocked.errors.includes('compliance_approval_blocked'))
})

test('requires periodic and event-driven reassessment through superseding assessments', () => {
  const current = assessment().assessment
  const eventDriven = evaluateComplianceReassessment({ assessment: current, asOf: '2026-07-20T00:00:00Z', events: [{ type: 'beneficial_ownership_changed', occurredAt: '2026-07-19T00:00:00Z', reference: 'event:g4:1' }] })
  assert.equal(eventDriven.required, true)
  assert.equal(eventDriven.action, 'create_superseding_assessment')
  const periodic = evaluateComplianceReassessment({ assessment: current, asOf: '2027-07-17T00:00:00Z' })
  assert.ok(periodic.triggers.some((trigger) => trigger.type === 'periodic_review_due'))
})

test('creates restricted escalation without client notification or automatic reporting', () => {
  const result = buildRestrictedComplianceEscalation({
    escalationId: 'escalation:g4:1',
    identity: identity('escalation:g4:1'),
    assessmentId: 'assessment:g4:1',
    partyId: party,
    reasonCode: 'unusual_transaction_pattern',
    intelligenceReference: 'restricted://intelligence/g4/1',
    intelligenceHash: hashB,
    actor: actor('compliance', reviewer),
    createdAt: at,
    retainUntil: '2032-07-16T00:00:00Z',
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.escalation.controls.clientNotificationAllowed, false)
  assert.equal(result.escalation.controls.automaticRegulatoryReportAllowed, false)
  assert.equal(result.informationResource.legalHold, true)
})

test('produces redacted audit exports and common G1 audit events', () => {
  const approved = reviewClientRiskAssessment({ assessment: assessment().assessment, reviewer: actor('compliance', reviewer), decision: 'approved', reason: 'CDD complete.', reviewedAt: '2026-07-16T13:00:00Z' }).assessment
  const exported = buildComplianceAuditExport({ assessment: approved, exportId: 'export:g4:1', generatedAt: '2026-07-16T14:00:00Z', generatedBy: manager })
  assert.equal(exported.ok, true, JSON.stringify(exported.errors))
  assert.equal(exported.export.redacted, true)
  assert.equal('identityReference' in exported.export, false)
  const audit = buildComplianceAuditEvent({ assessment: approved, eventId: 'audit:g4:1', actorUserId: reviewer, reason: 'Client risk assessment approved.', occurredAt: approved.reviewedAt, detailReference: 'compliance://assessment/g4/1', detailHash: hashB })
  assert.equal(audit.ok, true, JSON.stringify(audit.errors))
  assert.equal(audit.event.eventType, 'compliance_assessment_approved')
})

console.log('G4 client-risk compliance tests passed.')
