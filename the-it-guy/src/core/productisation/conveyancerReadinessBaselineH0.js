export const CONVEYANCER_READINESS_H0_VERSION = 'conveyancer_readiness_h0_v1'

export const CONVEYANCER_READINESS_CLASSIFICATIONS = Object.freeze({
  live: 'live',
  guarded: 'guarded',
  manualFallback: 'manual_fallback',
  testOnly: 'test_only',
  missing: 'missing',
})

export const CONVEYANCER_READINESS_FEATURES = Object.freeze([
  'cockpit',
  'mobile_shell',
  'notifications',
  'documents',
  'integrations',
])

const phase = (id, name, ui, service, persistence, tests, classification = 'test_only') => Object.freeze({
  id,
  name,
  classification,
  userVisible: classification === 'live',
  surfaces: Object.freeze({
    ui: Object.freeze(ui),
    service: Object.freeze(service),
    persistence: Object.freeze(persistence),
    tests: Object.freeze(tests),
  }),
})

export const CONVEYANCER_READINESS_CAPABILITY_CATALOGUE = Object.freeze([
  phase('P0', 'Product baseline', [], ['src/core/productisation/conveyancerProductBaseline.js'], ['baseline evidence contract'], ['test:conveyancer-productisation-p0']),
  phase('P1', 'Persistence foundation', [], ['src/core/productisation/conveyancerPersistenceFoundation.js'], ['202607160001_conveyancer_productisation_p1.sql'], ['test:conveyancer-productisation-p1'], 'guarded'),
  phase('P2', 'Matter orchestration', [], ['src/core/productisation/conveyancerOrchestration.js'], ['202607160002_conveyancer_productisation_p2.sql'], ['test:conveyancer-productisation-p2'], 'guarded'),
  phase('P3', 'Conveyancer cockpit', ['src/components/attorney/cockpit/ConveyancerCockpit.jsx', 'src/pages/AttorneyTransactionDetail.jsx'], ['src/core/productisation/conveyancerCockpit.js'], ['P1 plan and action projections'], ['test:conveyancer-productisation-p3'], 'guarded'),
  phase('P4', 'Notification delivery', [], ['src/core/productisation/conveyancerNotificationDelivery.js'], ['202607160004_conveyancer_productisation_p4.sql'], ['test:conveyancer-productisation-p4'], 'guarded'),
  phase('P5', 'Document pipeline', [], ['src/core/productisation/conveyancerDocumentPipeline.js'], ['202607160006_conveyancer_productisation_p5.sql'], ['test:conveyancer-productisation-p5'], 'guarded'),
  phase('P6', 'Provider runtime', [], ['src/core/productisation/conveyancerProviderRuntime.js'], ['202607160008_conveyancer_productisation_p6.sql'], ['test:conveyancer-productisation-p6'], 'guarded'),
  phase('P7', 'Provider transport', [], ['src/core/productisation/conveyancerProviderTransport.js'], ['202607160010_conveyancer_productisation_p7.sql'], ['test:conveyancer-productisation-p7'], 'guarded'),
  phase('P8', 'Operational assurance', [], ['src/core/productisation/conveyancerOperationalAssurance.js'], ['202607160011_conveyancer_productisation_p8.sql'], ['test:conveyancer-productisation-p8'], 'guarded'),
  phase('P9', 'Guided experience', ['src/components/attorney/cockpit/ConveyancerCockpit.jsx'], ['src/core/productisation/conveyancerGuidedExperience.js'], ['P1-P8 read projections'], ['test:conveyancer-productisation-p9'], 'guarded'),
  phase('P10', 'Quality assurance', [], ['src/core/productisation/conveyancerQualityAssurance.js'], ['immutable P8 test evidence'], ['test:conveyancer-productisation-p10']),
  phase('G1', 'Practice operations contract', [], ['src/core/practice/conveyancerPracticeOperationsContract.js'], [], ['test:conveyancer-practice-g1']),
  phase('G2', 'Information governance', [], ['src/core/practice/conveyancerInformationGovernance.js'], [], ['test:conveyancer-practice-g2']),
  phase('G3', 'Manual evidence register', [], ['src/core/practice/conveyancerManualEvidenceRegister.js'], [], ['test:conveyancer-practice-g3']),
  phase('G4', 'Client risk and compliance', [], ['src/core/practice/conveyancerClientRiskCompliance.js'], [], ['test:conveyancer-practice-g4']),
  phase('G5', 'Trust-money controls', [], ['src/core/practice/conveyancerTrustMoneyControls.js'], [], ['test:conveyancer-practice-g5']),
  phase('G6', 'Matter correspondence', [], ['src/core/practice/conveyancerMatterCorrespondenceRegister.js'], [], ['test:conveyancer-practice-g6']),
  phase('G7', 'Firm operations configuration', [], ['src/core/practice/conveyancerFirmOperationsConfiguration.js'], [], ['test:conveyancer-practice-g7']),
  phase('G8', 'External portal', [], ['src/core/practice/conveyancerExternalPortal.js'], [], ['test:conveyancer-practice-g8']),
  phase('G9', 'Close-out and recovery', [], ['src/core/practice/conveyancerMatterCloseoutRecovery.js'], [], ['test:conveyancer-practice-g9']),
  phase('G10', 'Practice assurance', [], ['src/core/practice/conveyancerPracticeAssuranceG10.js'], [], ['test:conveyancer-practice-g10']),
])

export const CONVEYANCER_READINESS_REQUIRED_PILOT_SCENARIOS = Object.freeze([
  'cash_transfer',
  'new_bond',
  'existing_bond_cancellation',
  'simultaneous_three_role',
  'sectional_title',
  'entity_or_trust_party',
  'exception_and_waiver',
  'manual_provider_fallback',
])

export const CONVEYANCER_READINESS_REQUIRED_PILOT_ROLES = Object.freeze([
  'conveyancer',
  'secretary',
  'finance',
  'compliance',
  'firm_admin',
])

export const CONVEYANCER_READINESS_CHECKS = Object.freeze([
  Object.freeze({ id: 'automated_tests', mandatory: true }),
  Object.freeze({ id: 'production_build', mandatory: true }),
  Object.freeze({ id: 'desktop_browser', mandatory: true }),
  Object.freeze({ id: 'mobile_browser', mandatory: true }),
  Object.freeze({ id: 'console_errors', mandatory: true }),
  Object.freeze({ id: 'http_errors', mandatory: true }),
  Object.freeze({ id: 'accessibility', mandatory: true }),
  Object.freeze({ id: 'responsive_visuals', mandatory: true }),
  Object.freeze({ id: 'lint', mandatory: true }),
  Object.freeze({ id: 'migration_reconciliation', mandatory: true }),
])

const text = (value = '') => String(value ?? '').trim()
const unique = (values = []) => [...new Set(values.filter(Boolean))]
const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}
const validDate = (value) => Boolean(value && Number.isFinite(new Date(value).getTime()))
const iso = (value) => validDate(value) ? new Date(value).toISOString() : null
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => { result[key] = stable(value[key]); return result }, {})
}
const fingerprint = (value) => {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
const secretBearing = (value) => /"(?:password|secret|credential|api.?key|access.?token|refresh.?token|private.?key)"\s*:/i.test(JSON.stringify(value || {}))

function normalizeCapability(input = {}) {
  const surfaces = input.surfaces || {}
  return {
    id: text(input.id).toUpperCase(),
    name: text(input.name),
    classification: text(input.classification).toLowerCase(),
    userVisible: input.userVisible === true,
    surfaces: {
      ui: unique((surfaces.ui || []).map(text)),
      service: unique((surfaces.service || []).map(text)),
      persistence: unique((surfaces.persistence || []).map(text)),
      tests: unique((surfaces.tests || []).map(text)),
    },
    evidenceReferences: unique((input.evidenceReferences || []).map(text)),
    owner: text(input.owner) || null,
    note: text(input.note) || null,
  }
}

export function evaluateConveyancerReadinessCapabilities(input = CONVEYANCER_READINESS_CAPABILITY_CATALOGUE) {
  const capabilities = (input || []).map(normalizeCapability)
  const findings = []
  const expectedIds = CONVEYANCER_READINESS_CAPABILITY_CATALOGUE.map((item) => item.id)
  const actualIds = capabilities.map((item) => item.id)
  if (unique(actualIds).length !== actualIds.length) findings.push('capability_id_duplicate')
  for (const id of expectedIds) if (!actualIds.includes(id)) findings.push(`capability_missing:${id}`)
  for (const item of capabilities) {
    if (!Object.values(CONVEYANCER_READINESS_CLASSIFICATIONS).includes(item.classification)) findings.push(`capability_classification_invalid:${item.id}`)
    if (!item.surfaces.service.length || !item.surfaces.tests.length) findings.push(`capability_contract_unmapped:${item.id}`)
    if (item.classification === 'live') {
      for (const surface of ['ui', 'service', 'persistence', 'tests']) if (!item.surfaces[surface].length) findings.push(`live_surface_missing:${item.id}:${surface}`)
      if (!item.evidenceReferences.length) findings.push(`live_evidence_missing:${item.id}`)
      if (!item.owner) findings.push(`live_owner_missing:${item.id}`)
      if (!item.userVisible) findings.push(`live_visibility_invalid:${item.id}`)
    }
    if (item.classification === 'test_only' && item.userVisible) findings.push(`test_only_visibility_forbidden:${item.id}`)
    if (item.classification === 'missing' && item.userVisible) findings.push(`missing_visibility_forbidden:${item.id}`)
  }
  const counts = Object.fromEntries(Object.values(CONVEYANCER_READINESS_CLASSIFICATIONS).map((status) => [status, capabilities.filter((item) => item.classification === status).length]))
  return freeze({ valid: findings.length === 0, findings: unique(findings), counts, capabilities })
}

export function buildConveyancerReadinessFeatureControls(input = {}) {
  const controls = Object.fromEntries(CONVEYANCER_READINESS_FEATURES.map((feature) => {
    const source = input[feature] || {}
    const mode = ['off', 'observe', 'pilot', 'live'].includes(text(source.mode).toLowerCase()) ? text(source.mode).toLowerCase() : 'off'
    return [feature, {
      mode,
      enabled: mode !== 'off',
      organisationIds: unique((source.organisationIds || []).map(text)),
      firmIds: unique((source.firmIds || []).map(text)),
      matterIds: unique((source.matterIds || []).map(text)),
      updatedBy: text(source.updatedBy) || null,
      reason: text(source.reason) || null,
    }]
  }))
  const findings = []
  for (const [feature, control] of Object.entries(controls)) {
    if (control.mode === 'pilot' && (!control.organisationIds.length || !control.firmIds.length || !control.matterIds.length)) findings.push(`feature_pilot_scope_incomplete:${feature}`)
    if (control.mode === 'live' && (!control.updatedBy || !control.reason)) findings.push(`feature_live_approval_missing:${feature}`)
  }
  return freeze({ valid: findings.length === 0, findings, controls })
}

export function buildConveyancerReadinessPilot(input = {}) {
  const roles = Object.fromEntries(CONVEYANCER_READINESS_REQUIRED_PILOT_ROLES.map((role) => [role, text(input.users?.[role]) || null]))
  const matters = (input.matters || []).map((item) => ({ matterId: text(item.matterId), scenario: text(item.scenario).toLowerCase() }))
  const pilot = {
    pilotId: text(input.pilotId),
    organisationId: text(input.organisationId),
    firmId: text(input.firmId),
    roles,
    matters,
    startsAt: iso(input.startsAt),
    endsAt: iso(input.endsAt),
    controls: {
      realNotificationsAllowed: false,
      realProviderCommandsAllowed: false,
      realClientContactAllowed: false,
      trustPaymentsAllowed: false,
      manualProviderFallbackRequired: true,
      killSwitchRequired: true,
    },
  }
  const findings = []
  if (!pilot.pilotId || !pilot.organisationId || !pilot.firmId) findings.push('pilot_identity_incomplete')
  if (Object.values(roles).some((value) => !value) || unique(Object.values(roles)).length !== CONVEYANCER_READINESS_REQUIRED_PILOT_ROLES.length) findings.push('pilot_role_coverage_invalid')
  if (!pilot.startsAt || !pilot.endsAt || new Date(pilot.startsAt) >= new Date(pilot.endsAt)) findings.push('pilot_window_invalid')
  if (unique(matters.map((item) => item.matterId)).length !== matters.length || matters.some((item) => !item.matterId)) findings.push('pilot_matter_identity_invalid')
  for (const scenario of CONVEYANCER_READINESS_REQUIRED_PILOT_SCENARIOS) if (!matters.some((item) => item.scenario === scenario)) findings.push(`pilot_scenario_missing:${scenario}`)
  return freeze({ valid: findings.length === 0, findings, pilot })
}

export function buildConveyancerReadinessSnapshot(input = {}) {
  const capabilities = evaluateConveyancerReadinessCapabilities(input.capabilities || CONVEYANCER_READINESS_CAPABILITY_CATALOGUE)
  const features = buildConveyancerReadinessFeatureControls(input.features)
  const pilot = buildConveyancerReadinessPilot(input.pilot)
  const suppliedChecks = new Map((input.checks || []).map((item) => [text(item.id), item]))
  const checks = CONVEYANCER_READINESS_CHECKS.map((definition) => {
    const supplied = suppliedChecks.get(definition.id) || {}
    return {
      id: definition.id,
      mandatory: definition.mandatory,
      status: ['passed', 'failed', 'blocked', 'not_run'].includes(text(supplied.status).toLowerCase()) ? text(supplied.status).toLowerCase() : 'not_run',
      evidenceReference: text(supplied.evidenceReference) || null,
      note: text(supplied.note) || null,
    }
  })
  const snapshot = {
    version: CONVEYANCER_READINESS_H0_VERSION,
    snapshotId: text(input.snapshotId),
    environment: text(input.environment).toLowerCase(),
    releaseReference: text(input.releaseReference),
    generatedAt: iso(input.generatedAt),
    generatedBy: text(input.generatedBy),
    capabilities,
    features,
    pilot,
    checks,
    controls: {
      diagnosticOnly: true,
      databaseWritesPerformed: false,
      providerCallsPerformed: false,
      notificationsSent: false,
      featureActivationPerformed: false,
      deploymentPerformed: false,
    },
  }
  const blockers = []
  if (!snapshot.snapshotId || !['local', 'staging', 'production'].includes(snapshot.environment) || !snapshot.releaseReference || !snapshot.generatedAt || !snapshot.generatedBy) blockers.push('snapshot_identity_invalid')
  if (!capabilities.valid) blockers.push(...capabilities.findings)
  if (!features.valid) blockers.push(...features.findings)
  if (!pilot.valid) blockers.push(...pilot.findings)
  for (const check of checks) {
    if (check.mandatory && check.status !== 'passed') blockers.push(`check_${check.status}:${check.id}`)
    if (check.status === 'passed' && !check.evidenceReference) blockers.push(`check_evidence_missing:${check.id}`)
  }
  if (secretBearing(input)) blockers.push('snapshot_contains_secret')
  snapshot.blockers = unique(blockers)
  snapshot.decision = snapshot.blockers.length ? 'blocked' : 'ready_for_h1'
  snapshot.fingerprint = fingerprint(snapshot)
  return freeze(snapshot)
}

export function serializeConveyancerReadinessSnapshot(snapshot = {}) {
  if (secretBearing(snapshot)) return JSON.stringify({ version: CONVEYANCER_READINESS_H0_VERSION, decision: 'blocked', blockers: ['snapshot_contains_secret'] })
  return JSON.stringify(stable({
    version: snapshot.version,
    snapshotId: snapshot.snapshotId,
    environment: snapshot.environment,
    releaseReference: snapshot.releaseReference,
    generatedAt: snapshot.generatedAt,
    decision: snapshot.decision,
    blockers: snapshot.blockers,
    capabilityCounts: snapshot.capabilities?.counts,
    featureModes: Object.fromEntries(Object.entries(snapshot.features?.controls || {}).map(([key, value]) => [key, value.mode])),
    pilot: { pilotId: snapshot.pilot?.pilot?.pilotId, scenarioCount: snapshot.pilot?.pilot?.matters?.length || 0 },
    checks: snapshot.checks,
    controls: snapshot.controls,
    fingerprint: snapshot.fingerprint,
  }))
}
