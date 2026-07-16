import assert from 'node:assert/strict'
import {
  assureConveyancerPracticeRelease,
  buildConveyancerPracticePhaseCheckpoint,
  buildConveyancerPracticePilotManifest,
  CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY,
  CONVEYANCER_PRACTICE_MINIMUM_SCENARIOS,
  CONVEYANCER_PRACTICE_PHASES,
  CONVEYANCER_PRACTICE_REQUIRED_PROBES,
  evaluateConveyancerPracticePilot,
  serializeConveyancerPracticeAssuranceEvidence,
  validateConveyancerPracticePhaseCheckpoint,
} from '../conveyancerPracticeAssurance.js'
import { buildFirmOperationsConfiguration } from '../conveyancerFirmOperationsConfiguration.js'

const org = '10000000-0000-4000-8000-000000000001'
const firm = '20000000-0000-4000-8000-000000000001'
const branch = '30000000-0000-4000-8000-000000000001'
const team = '40000000-0000-4000-8000-000000000001'
const managerId = '50000000-0000-4000-8000-000000000001'
const release = 'practice-release:g8:1'
const build = 'build:g8:1'
const commit = 'a'.repeat(40)
const evidenceHash = `sha256:${'b'.repeat(64)}`
const artifactFingerprint = 'fnv1a_1234abcd'

function manager() { return { userId: managerId, membershipId: `membership:${managerId}`, role: 'firm_manager', organisationId: org, attorneyFirmId: firm, branchId: branch, teamId: team } }

function configuration() {
  const result = buildFirmOperationsConfiguration({
    configurationId: 'firm-config:g8:1', revision: 1, organisationId: org, attorneyFirmId: firm, status: 'published', effectiveAt: '2026-07-01T00:00:00Z', reason: 'G8 release candidate configuration.', configuredBy: manager(),
    structure: { branches: [{ branchId: branch, name: 'Cape Town' }], departments: [{ departmentId: 'department:g8:transfers', branchId: branch, name: 'Transfers' }], teams: [{ teamId: team, departmentId: 'department:g8:transfers', name: 'Transfer Team' }] },
    roleCapabilities: [{ role: 'firm_manager', capabilities: ['view_matter', 'allocate_matter', 'manage_practice'] }],
    approvalThresholds: [{ approvalKey: 'high_value', minimumApprovals: 2, requiredRoles: ['accounts', 'supervising_attorney'], thresholdMinor: 10000000, currency: 'ZAR' }],
    delegationLimits: [{ role: 'responsible_attorney', capabilities: ['review_evidence'], maximumHours: 48 }],
    playbooks: [{ playbookId: 'playbook:g8:transfer', matterType: 'property_transfer', lane: 'transfer', planDefinitionId: 'plan:g8:transfer', planDefinitionVersion: '1.0.0' }],
    slaPolicies: [{ slaKey: 'document_request', acknowledgeHours: 8, targetHours: 24, escalateHours: 48, calendarId: 'calendar:g8:za', escalationRole: 'supervising_attorney' }],
    contentAssignments: [{ assignmentKey: 'instruction', matterType: 'property_transfer', documentType: 'instruction', templateVersionId: 'template:g8:1', templateFingerprint: artifactFingerprint }],
    calendars: [{ calendarId: 'calendar:g8:za', name: 'South Africa', workingDays: [1, 2, 3, 4, 5], startsAt: '08:00', endsAt: '17:00' }],
    queuePriorities: [{ signal: 'blocked', weight: 100 }, { signal: 'overdue', weight: 50 }],
    capacityRules: [{ ruleId: 'capacity:g8:default', role: '*', maximumWeightedLoad: 10 }],
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.configuration
}

function probes(overrides = {}) { return Object.fromEntries(CONVEYANCER_PRACTICE_REQUIRED_PROBES.map((name) => [name, overrides[name] ?? true])) }

function checkpoint(phase, overrides = {}) {
  const config = overrides.configuration || configuration()
  const fingerprints = phase === 'G7' ? [config.fingerprint] : [artifactFingerprint]
  return buildConveyancerPracticePhaseCheckpoint({ checkpointId: `checkpoint:${phase.toLowerCase()}`, phase, releaseCandidateId: release, buildId: build, sourceCommitHash: commit, environment: 'staging', organisationId: org, attorneyFirmId: firm, suiteId: `suite:${phase.toLowerCase()}`, suiteVersion: '1.0.0', scenarioCount: CONVEYANCER_PRACTICE_MINIMUM_SCENARIOS[phase], passedCount: CONVEYANCER_PRACTICE_MINIMUM_SCENARIOS[phase], failedCount: 0, skippedCount: 0, probes: probes(), artifactFingerprints: fingerprints, evidenceReference: `evidence://${phase.toLowerCase()}`, evidenceHash, executedAt: '2026-07-16T08:00:00Z', executedBy: { userId: 'quality:g8', role: 'quality_engineer', organisationId: org, attorneyFirmId: firm }, reviewedAt: '2026-07-16T09:00:00Z', reviewedBy: { userId: managerId, role: 'firm_manager', organisationId: org, attorneyFirmId: firm }, ...overrides }).checkpoint
}

function checkpoints(config = configuration()) { return Object.values(CONVEYANCER_PRACTICE_PHASES).map((phase) => checkpoint(phase, { configuration: config })) }
function manualReadiness(overrides = {}) { return { manualEvidenceCapture: true, manualCorrespondenceFiling: true, manualComplianceReview: true, manualTrustReconciliation: true, manualMatterSupervision: true, ...overrides } }
function assurance(overrides = {}) { const config = overrides.configuration || configuration(); return assureConveyancerPracticeRelease({ assuranceId: 'assurance:g8:1', checkpoints: overrides.checkpoints || checkpoints(config), configuration: config, manualReadiness: overrides.manualReadiness || manualReadiness(), assuredAt: '2026-07-16T10:00:00Z', ...overrides }) }

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

test('certifies immutable G1-G7 phase checkpoints', () => {
  for (const phase of Object.values(CONVEYANCER_PRACTICE_PHASES)) {
    const value = checkpoint(phase)
    assert.equal(validateConveyancerPracticePhaseCheckpoint(value).valid, true, phase)
  }
})

test('enforces the minimum scenario count with zero failures and skips', () => {
  const invalid = buildConveyancerPracticePhaseCheckpoint({ ...checkpoint('G3'), scenarioCount: 11, passedCount: 10, failedCount: 1 })
  assert.ok(invalid.errors.includes('practice_checkpoint_scenario_gate_failed'))
})

test('requires every cross-cutting control probe', () => {
  const invalid = buildConveyancerPracticePhaseCheckpoint({ ...checkpoint('G2'), probes: probes({ accessIsolation: false }) })
  assert.ok(invalid.errors.includes('practice_checkpoint_control_probe_failed'))
})

test('requires independent quality execution and firm-manager review', () => {
  const invalid = buildConveyancerPracticePhaseCheckpoint({ ...checkpoint('G1'), reviewedBy: { userId: 'quality:g8', role: 'firm_manager', organisationId: org, attorneyFirmId: firm } })
  assert.ok(invalid.errors.includes('practice_checkpoint_independent_review_invalid'))
})

test('detects checkpoint tampering and open exceptions', () => {
  const tampered = structuredClone(checkpoint('G4')); tampered.passedCount -= 1
  const validation = validateConveyancerPracticePhaseCheckpoint(tampered)
  assert.ok(validation.errors.includes('practice_checkpoint_fingerprint_invalid'))
  assert.ok(validation.errors.includes('practice_checkpoint_scenario_gate_failed'))
  const exception = buildConveyancerPracticePhaseCheckpoint({ ...checkpoint('G4'), exceptions: ['unreviewed-risk-path'] })
  assert.ok(exception.errors.includes('practice_checkpoint_open_exception'))
})

test('certifies one consistent G1-G7 release as ready', () => {
  const result = assurance()
  assert.equal(result.decision, 'ready', JSON.stringify(result.findings))
  assert.equal(result.counts.checkpoints, 7)
  assert.ok(Object.values(result.phaseStatus).every(Boolean))
})

test('blocks a release with a missing or duplicate phase checkpoint', () => {
  const rows = checkpoints(); rows.pop()
  assert.equal(assurance({ checkpoints: rows }).decision, 'blocked')
  assert.ok(assurance({ checkpoints: [...rows, rows[0], rows[0]] }).findings.some((item) => item.code === 'practice_phase_checkpoint_duplicate'))
})

test('blocks inconsistent release and tenant bindings', () => {
  const rows = checkpoints(); rows[0] = checkpoint('G1', { releaseCandidateId: 'different-release' })
  const result = assurance({ checkpoints: rows })
  assert.ok(result.findings.some((item) => item.code === 'practice_release_binding_inconsistent'))
})

test('revalidates the exact published G7 configuration fingerprint', () => {
  const config = configuration(); const tampered = structuredClone(config); tampered.reason = 'Changed after publication.'
  const result = assurance({ configuration: tampered, checkpoints: checkpoints(config) })
  assert.ok(result.findings.some((item) => item.code === 'practice_configuration_fingerprint_invalid'))
})

test('requires the G7 checkpoint to bind the released configuration', () => {
  const config = configuration(); const rows = checkpoints(config); rows[6] = checkpoint('G7', { configuration: config, artifactFingerprints: [artifactFingerprint] })
  const result = assurance({ configuration: config, checkpoints: rows })
  assert.ok(result.findings.some((item) => item.code === 'practice_g7_checkpoint_configuration_binding_invalid'))
})

test('requires every manual-first operating path', () => {
  const result = assurance({ manualReadiness: manualReadiness({ manualCorrespondenceFiling: false }) })
  assert.equal(result.decision, 'blocked')
  assert.ok(result.findings.some((item) => item.code === 'practice_manual_correspondence_filing_not_ready'))
})

test('does not require external providers for release readiness', () => {
  const result = assurance()
  assert.equal(result.providerDependency.externalProvidersRequired, false)
  assert.equal(result.providerDependency.manualOperationRequired, true)
  assert.equal(result.providerDependency.integrationsAreAccelerators, true)
})

test('allows a clean controlled pilot to go', () => {
  const result = evaluateConveyancerPracticePilot({ scenarios: [{ scenarioId: 'ready-practice', assurance: assurance(), expectedDecision: 'ready' }], operationalMetrics: {} })
  assert.equal(result.decision, 'go', JSON.stringify(result.holds))
  assert.equal(result.scenarioPassRate, 1)
})

test('holds the pilot for authority, trust or silent-rewrite failures', () => {
  const result = evaluateConveyancerPracticePilot({ scenarios: [{ assurance: assurance() }], operationalMetrics: { authorityViolations: 1, trustControlBreaches: 1, silentConfigurationRewrites: 1 } })
  assert.equal(result.decision, 'hold')
  assert.ok(result.holds.includes('authority_violations_threshold_exceeded'))
  assert.ok(result.holds.includes('trust_control_breaches_threshold_exceeded'))
  assert.ok(result.holds.includes('silent_configuration_rewrites_threshold_exceeded'))
})

test('observes a small manual backlog and holds a large one', () => {
  const scenarios = [{ assurance: assurance() }]
  assert.equal(evaluateConveyancerPracticePilot({ scenarios, operationalMetrics: { manualBacklogRate: 0.1 } }).decision, 'observe')
  assert.equal(evaluateConveyancerPracticePilot({ scenarios, operationalMetrics: { manualBacklogRate: 0.2 } }).decision, 'hold')
})

test('builds a small, owned and provider-independent pilot manifest', () => {
  const manifest = buildConveyancerPracticePilotManifest({ firmIds: [firm], lanes: ['transfer', 'bond'], maximumMatters: 100, startsAt: '2026-08-01T00:00:00Z', endsAt: '2026-08-31T00:00:00Z', owners: { assurance: 'qa-owner', legal: 'legal-owner', operations: 'ops-owner', compliance: 'compliance-owner', trust: 'trust-owner', privacy: 'privacy-owner', support: 'support-owner', rollback: 'rollback-owner' } })
  assert.equal(manifest.valid, true, JSON.stringify(manifest.errors))
  assert.equal(manifest.scope.maximumMatters, 25)
  assert.equal(manifest.controls.externalProvidersRequired, false)
  assert.equal(manifest.controls.manualFallbackRequired, true)
  assert.equal(manifest.controls.killSwitchRequired, true)
})

test('serializes assurance evidence without payloads, credentials or party data', () => {
  const value = serializeConveyancerPracticeAssuranceEvidence({ assurance: { ...assurance(), payload: { partyName: 'Secret' }, credential: 'secret' }, pilot: evaluateConveyancerPracticePilot({ scenarios: [{ assurance: assurance() }] }) })
  assert.equal(value.includes('partyName'), false)
  assert.equal(value.includes('"credential":"secret"'), false)
  assert.equal(value.includes('Secret'), false)
  assert.equal(JSON.parse(value).assurance.decision, 'ready')
})

test('keeps G8 completely inside its read-only assurance boundary', () => {
  assert.equal(CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY.externalProvidersRequired, false)
  assert.equal(CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY.databaseWritesPerformed, false)
  assert.equal(CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY.trustPaymentExecuted, false)
  assert.equal(CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY.configurationAdopted, false)
  assert.equal(CONVEYANCER_PRACTICE_ASSURANCE_BOUNDARY.deploymentPerformed, false)
})
