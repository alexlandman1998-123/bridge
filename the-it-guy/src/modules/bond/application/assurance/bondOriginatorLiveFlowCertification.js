import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import {
  BOND_APPLICATION_BROWSER_E2E_SCENARIOS,
  BOND_APPLICATION_BROWSER_E2E_VERSION,
} from '../ux/bondApplicationBrowserE2EContract.js'
import { BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION } from './bondOriginatorProductionPromotion.js'

export const BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION = 'phase-9-v1'
export const BOND_ORIGINATOR_LIVE_FLOW_MAX_EVIDENCE_AGE_HOURS = 4

export const BOND_ORIGINATOR_LIVE_FLOW_STEPS = Object.freeze([
  Object.freeze({ key: 'open_application', actor: 'buyer' }),
  Object.freeze({ key: 'save_draft', actor: 'buyer' }),
  Object.freeze({ key: 'resume_application', actor: 'buyer' }),
  Object.freeze({ key: 'recalculate_requirements', actor: 'buyer' }),
  Object.freeze({ key: 'upload_document', actor: 'buyer' }),
  Object.freeze({ key: 'review_application', actor: 'bond_originator' }),
  Object.freeze({ key: 'download_branded_pack', actor: 'bond_originator' }),
  Object.freeze({ key: 'controlled_originator_handoff', actor: 'bond_originator' }),
])

export const BOND_ORIGINATOR_LIVE_FLOW_REQUIRED_VERSIONS = Object.freeze([
  'applicationSchema',
  'browserContract',
  'documentRules',
  'requirementProfile',
  'reconciliation',
  'originatorPack',
  'controlledHandoff',
])

function text(value) {
  return String(value || '').trim()
}

function hoursBetween(later, earlier) {
  const end = Date.parse(later)
  const start = Date.parse(earlier)
  if (!Number.isFinite(end) || !Number.isFinite(start)) return Number.POSITIVE_INFINITY
  return Math.max(0, (end - start) / 3_600_000)
}

function check(key, passed, message, evidence = {}) {
  return { key, passed: passed === true, status: passed === true ? 'pass' : 'fail', message, evidence }
}

function evaluateResults(expected, received = []) {
  const expectedKeys = new Set(expected.map((item) => item.key))
  const byKey = new Map()
  const duplicates = new Set()
  for (const result of Array.isArray(received) ? received : []) {
    const key = text(result?.key)
    if (byKey.has(key)) duplicates.add(key)
    byKey.set(key, result)
  }
  return {
    missing: expected.filter((item) => !byKey.has(item.key)).map((item) => item.key),
    failed: expected.filter((item) => byKey.get(item.key)?.passed !== true).map((item) => item.key),
    unknown: [...byKey.keys()].filter((key) => !expectedKeys.has(key)),
    duplicates: [...duplicates],
    byKey,
  }
}

function sameCanonicalValues(first = [], second = []) {
  return canonicalizeBondApplicationSnapshot([...(first || [])].sort()) ===
    canonicalizeBondApplicationSnapshot([...(second || [])].sort())
}

export function buildBondOriginatorLiveFlowEvidenceTemplate({
  generatedAt = new Date().toISOString(),
  fixtureId = '',
  artifactId = '',
} = {}) {
  const result = (item) => ({
    key: item.key,
    actor: item.actor,
    passed: false,
    environment: 'staging',
    fixtureId,
    artifactId,
    observedAt: generatedAt,
    evidenceRef: '',
  })
  return {
    generatedAt,
    environment: 'staging',
    build: { commitSha: '', artifactId, deploymentUrl: '' },
    fixture: { id: fixtureId, version: '', description: '' },
    promotionArtifact: {},
    browserEvidence: {
      contractVersion: BOND_APPLICATION_BROWSER_E2E_VERSION,
      authenticatedActors: { buyer: false, bond_originator: false },
      journeySteps: BOND_ORIGINATOR_LIVE_FLOW_STEPS.map(result),
      contractScenarios: BOND_APPLICATION_BROWSER_E2E_SCENARIOS.map(result),
      consoleErrors: [],
      apiErrors: [],
      pageErrors: [],
    },
    reconciliationEvidence: {
      firstRunActiveCount: 0,
      secondRunActiveCount: 0,
      firstRunActiveIdentities: [],
      secondRunActiveIdentities: [],
      duplicateActiveIdentityCount: 0,
      uploadedDocumentIdsBefore: [],
      uploadedDocumentIdsAfter: [],
    },
    artifactEvidence: { brandedPackDownloaded: false, packFingerprint: '', controlledHandoffPrepared: false, handoffIdempotencyKey: '', artifactId, fixtureId, evidenceRef: '' },
    versions: Object.fromEntries(BOND_ORIGINATOR_LIVE_FLOW_REQUIRED_VERSIONS.map((key) => [key, ''])),
    mutatedProduction: false,
  }
}

export function buildBondOriginatorLiveFlowCertification(input = {}) {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const environment = text(input.environment).toLowerCase()
  const artifactId = text(input.build?.artifactId)
  const fixtureId = text(input.fixture?.id)
  const observedAt = input.browserEvidence?.observedAt ||
    input.browserEvidence?.journeySteps?.map((item) => item?.observedAt).filter(Boolean).sort().at(-1)
  const evidenceAgeHours = hoursBetween(generatedAt, observedAt)
  const journey = evaluateResults(BOND_ORIGINATOR_LIVE_FLOW_STEPS, input.browserEvidence?.journeySteps)
  const browserScenarios = evaluateResults(BOND_APPLICATION_BROWSER_E2E_SCENARIOS, input.browserEvidence?.contractScenarios)
  const resultCollections = [journey, browserScenarios]
  const allResults = resultCollections.flatMap((collection) => [...collection.byKey.values()])
  const bindingFailures = allResults.filter((result) =>
    text(result?.environment).toLowerCase() !== environment ||
    text(result?.fixtureId) !== fixtureId ||
    text(result?.artifactId) !== artifactId ||
    !text(result?.observedAt) ||
    !text(result?.evidenceRef),
  ).map((result) => result?.key)
  const actorFailures = BOND_ORIGINATOR_LIVE_FLOW_STEPS.filter((step) => journey.byKey.get(step.key)?.actor !== step.actor).map((step) => step.key)
  const reconciliation = input.reconciliationEvidence || {}
  const uploadsPreserved = sameCanonicalValues(reconciliation.uploadedDocumentIdsBefore, reconciliation.uploadedDocumentIdsAfter)
  const identitiesStable = sameCanonicalValues(reconciliation.firstRunActiveIdentities, reconciliation.secondRunActiveIdentities)
  const missingVersions = BOND_ORIGINATOR_LIVE_FLOW_REQUIRED_VERSIONS.filter((key) => !text(input.versions?.[key]))
  const artifactEvidenceBound = text(input.artifactEvidence?.artifactId) === artifactId &&
    text(input.artifactEvidence?.fixtureId) === fixtureId && Boolean(text(input.artifactEvidence?.evidenceRef))
  const checks = [
    check('staging_environment_only', environment === 'staging', 'Live-flow certification must run against staging, never production.', { environment }),
    check('build_identity_locked', Boolean(text(input.build?.commitSha) && artifactId && text(input.build?.deploymentUrl)), 'Bind a commit, deployment artifact and staging URL.', input.build || {}),
    check('representative_fixture_locked', Boolean(fixtureId && text(input.fixture?.version) && text(input.fixture?.description)), 'Identify and version the representative live-shaped fixture.', input.fixture || {}),
    check('phase7_promotion_ready', input.promotionArtifact?.version === BOND_ORIGINATOR_PRODUCTION_PROMOTION_VERSION && input.promotionArtifact?.ready === true && input.promotionArtifact?.status === 'promotion_ready' && Boolean(text(input.promotionArtifact?.fingerprint)), 'Phase 7 promotion assurance must be ready and fingerprinted.', { version: input.promotionArtifact?.version || null, status: input.promotionArtifact?.status || null }),
    check('authenticated_actor_sessions', input.browserEvidence?.authenticatedActors?.buyer === true && input.browserEvidence?.authenticatedActors?.bond_originator === true, 'Capture authenticated buyer and bond-originator sessions.', input.browserEvidence?.authenticatedActors || {}),
    check('journey_complete', journey.missing.length === 0 && journey.failed.length === 0 && journey.unknown.length === 0 && journey.duplicates.length === 0, 'Every live-flow journey step must pass exactly once.', { ...journey, byKey: undefined }),
    check('journey_actor_boundaries', actorFailures.length === 0, 'Each step must run as its required authenticated actor.', { actorFailures }),
    check('browser_contract_complete', input.browserEvidence?.contractVersion === BOND_APPLICATION_BROWSER_E2E_VERSION && browserScenarios.missing.length === 0 && browserScenarios.failed.length === 0 && browserScenarios.unknown.length === 0 && browserScenarios.duplicates.length === 0, 'The current browser E2E contract must pass exactly once.', { expectedVersion: BOND_APPLICATION_BROWSER_E2E_VERSION, actualVersion: input.browserEvidence?.contractVersion || null, ...browserScenarios, byKey: undefined }),
    check('single_build_fixture_evidence', bindingFailures.length === 0, 'Every result must carry an evidence reference and bind to the same environment, fixture and artifact.', { bindingFailures }),
    check('runtime_errors_absent', !(input.browserEvidence?.consoleErrors || []).length && !(input.browserEvidence?.apiErrors || []).length && !(input.browserEvidence?.pageErrors || []).length, 'Console, API and page errors must be empty.', { consoleErrors: input.browserEvidence?.consoleErrors || [], apiErrors: input.browserEvidence?.apiErrors || [], pageErrors: input.browserEvidence?.pageErrors || [] }),
    check('reconciliation_idempotent', Number(reconciliation.firstRunActiveCount) === Number(reconciliation.secondRunActiveCount) && identitiesStable && Number(reconciliation.duplicateActiveIdentityCount) === 0, 'A second reconciliation must add no active requirements or duplicate identities.', { firstRunActiveCount: reconciliation.firstRunActiveCount, secondRunActiveCount: reconciliation.secondRunActiveCount, identitiesStable, duplicateActiveIdentityCount: reconciliation.duplicateActiveIdentityCount }),
    check('uploads_preserved', uploadsPreserved, 'Recalculation must preserve the fixture document uploads.', { uploadsPreserved, beforeCount: reconciliation.uploadedDocumentIdsBefore?.length || 0, afterCount: reconciliation.uploadedDocumentIdsAfter?.length || 0 }),
    check('download_and_handoff_evidenced', input.artifactEvidence?.brandedPackDownloaded === true && Boolean(text(input.artifactEvidence?.packFingerprint)) && input.artifactEvidence?.controlledHandoffPrepared === true && Boolean(text(input.artifactEvidence?.handoffIdempotencyKey)) && artifactEvidenceBound, 'Evidence the branded pack download and controlled handoff package from the same artifact and fixture.', input.artifactEvidence || {}),
    check('version_manifest_complete', missingVersions.length === 0, 'Record every application, rule, profile, schema, browser, pack and handoff version used by the run.', { versions: input.versions || {}, missingVersions }),
    check('evidence_fresh', evidenceAgeHours <= BOND_ORIGINATOR_LIVE_FLOW_MAX_EVIDENCE_AGE_HOURS, 'Live-flow evidence must be no older than four hours.', { observedAt: observedAt || null, evidenceAgeHours }),
    check('production_untouched', input.mutatedProduction !== true, 'Certification must not mutate production.', { mutatedProduction: input.mutatedProduction === true }),
  ]
  const blockers = checks.filter((item) => !item.passed)
  const payload = {
    version: BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION,
    generatedAt,
    environment,
    build: { commitSha: text(input.build?.commitSha) || null, artifactId: artifactId || null, deploymentUrl: text(input.build?.deploymentUrl) || null },
    fixture: { id: fixtureId || null, version: text(input.fixture?.version) || null },
    promotionFingerprint: input.promotionArtifact?.fingerprint || null,
    packFingerprint: input.artifactEvidence?.packFingerprint || null,
    versions: input.versions || {},
    checks,
  }
  return {
    ...payload,
    status: blockers.length ? 'live_certification_blocked' : 'live_certification_ready',
    ready: blockers.length === 0,
    blockers,
    metrics: { checkCount: checks.length, passedCount: checks.length - blockers.length, blockerCount: blockers.length, journeyStepCount: BOND_ORIGINATOR_LIVE_FLOW_STEPS.length, browserScenarioCount: BOND_APPLICATION_BROWSER_E2E_SCENARIOS.length },
    fingerprint: `${BOND_ORIGINATOR_LIVE_FLOW_CERTIFICATION_VERSION}:${canonicalizeBondApplicationSnapshot(payload)}`,
    nextAction: blockers.length ? 'Resolve every blocker and repeat the full authenticated staging run on one unchanged build.' : 'Attach this artifact to the production-promotion record and promote the certified artifact only.',
  }
}
