import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

const phase7 = readJson('config/document-generator-simple-signing-phase7-live-observation.json')
const phase8 = readJson('config/document-generator-simple-signing-phase8-operational-handover.json')
const packageJson = readJson('package.json')
const script = fs.readFileSync('scripts/document-generator-simple-signing-phase8-operational-handover.mjs', 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-8.md', 'utf8')

assert.equal(phase7.phase, 'document-generator-simple-signing-ui-phase-7')
assert.equal(phase7.status, 'live_observation_ready')
assert.equal(phase8.phase, 'document-generator-simple-signing-ui-phase-8')
assert.equal(phase8.status, 'operational_handover_ready')
assert.equal(phase8.decision, 'ready_for_keep_live_decision_after_phase7')
assert.equal(phase8.requiredPriorPhase, 'document-generator-simple-signing-ui-phase-7')
assert.equal(phase8.inputs.phase7Observation, 'test-results/document-generator-simple-signing-phase7/live-observation-report.json')
assert.equal(phase8.inputs.maxObservationAgeMinutes, 1440)
assert.equal(phase8.passingDecision, 'keep_live')
assert.equal(phase8.failingDecision, 'rollback_or_investigate_signer_route')

assert.equal(phase8.production.appUrl, 'https://app.arch9.co.za')
assert.equal(phase8.production.supabaseProjectRef, 'isdowlnollckzvltkasn')
assert.equal(phase8.production.vercelProject, 'bridge')
assert.equal(phase8.production.route, '/sign/:token')
assert.deepEqual(phase8.releaseScope.packetTypes, ['mandate', 'otp'])
assert.equal(phase8.releaseScope.appliesToAllGeneratedDocumentsInScope, true)
assert.equal(phase8.releaseScope.documentGeneratorChanges, false)

for (const control of [
  'noSigningActionRequired',
  'noEmailSendRequired',
  'noFinalArtifactGenerationRequired',
  'noFinalArtifactAccessRequired',
  'noCustomerDataMutationRequired',
  'controlledTokenRedacted',
]) {
  assert.equal(phase8.controls[control], true, `Phase 8 should require ${control}.`)
}

for (const reference of [
  'document-generator-simple-signing-phase7-live-observation.mjs',
  'PHASE8_PHASE7_REPORT_NOT_HEALTHY',
  'PHASE8_OBSERVATION_STALE',
  'PHASE8_FORBIDDEN_CALLS_OCCURRED',
  'PHASE8_REPORT_STORES_SIGNING_TOKEN',
  'PHASE8_SIGNER_TOKEN_RESOLUTION_MISSING',
  'keep_live',
  'rollback_or_investigate_signer_route',
  '--refresh-live-observation',
  '--live',
]) {
  assert.ok(script.includes(reference), `Phase 8 handover should keep ${reference}.`)
}

assert.equal(script.includes('downloadUrl:'), false, 'Phase 8 decision must not expose download URLs.')
assert.equal(script.includes('recipient_email'), false, 'Phase 8 decision must not expose recipient emails.')
assert.equal(script.includes('provider_message_id'), false, 'Phase 8 decision must not expose provider message IDs.')

const fixtureDirectory = 'test-results/document-generator-simple-signing-phase8'
const healthyFixturePath = `${fixtureDirectory}/healthy-phase7-fixture.json`
const blockedFixturePath = `${fixtureDirectory}/blocked-phase7-fixture.json`
const staleFixturePath = `${fixtureDirectory}/stale-phase7-fixture.json`

const healthyPhase7Report = {
  phase: 'document-generator-simple-signing-ui-phase-7',
  status: 'healthy',
  decision: 'keep_live',
  observedAt: new Date().toISOString(),
  production: {
    appUrl: 'https://app.arch9.co.za',
    route: '/sign/:token',
    observedUrl: 'https://app.arch9.co.za/sign/[redacted-token]',
    releaseManifest: {
      reachable: true,
      httpStatus: 200,
      releaseId: 'phase8-contract-fixture',
    },
  },
  controls: {
    readOnly: true,
    invokesSigningAction: false,
    sendsRealCustomerEmails: false,
    generatesFinalArtifacts: false,
    resolvesFinalArtifactAccess: false,
    controlledTokenRedacted: true,
  },
  evidence: {
    viewport: { width: 390, height: 844 },
    shellVisible: true,
    oldSurfaceCount: 0,
    horizontalOverflowPx: 0,
    allowedCalls: [{ functionName: 'resolve-signer-token', method: 'POST', action: 'resolve' }],
    forbiddenCallCount: 0,
    screenshot: 'test-results/document-generator-simple-signing-phase7/live-observation-mobile.png',
  },
  blockers: [],
}
writeJson(healthyFixturePath, healthyPhase7Report)
writeJson(blockedFixturePath, {
  ...healthyPhase7Report,
  status: 'blocked',
  decision: 'rollback_or_investigate_signer_route',
  blockers: [{ code: 'PHASE7_SIMPLE_SHELL_NOT_VISIBLE' }],
})
writeJson(staleFixturePath, {
  ...healthyPhase7Report,
  observedAt: '2026-01-01T00:00:00.000Z',
})

const goRun = spawnSync(process.execPath, [
  'scripts/document-generator-simple-signing-phase8-operational-handover.mjs',
  '--input',
  healthyFixturePath,
  '--max-age-minutes=10000000',
], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })
assert.equal(goRun.status, 0, goRun.stderr || goRun.stdout)
const goDecision = JSON.parse(goRun.stdout)
assert.equal(goDecision.phase, 'document-generator-simple-signing-ui-phase-8')
assert.equal(goDecision.status, 'GO')
assert.equal(goDecision.decision, 'keep_live')
assert.equal(goDecision.operationalState.customerUseBlocked, false)
assert.equal(goDecision.operationalState.documentGeneratorBackendProblemDetected, false)
assert.equal(goDecision.controls.noSigningActionRequired, true)
assert.equal(goDecision.controls.noEmailSendRequired, true)
assert.equal(goDecision.blockers.length, 0)

const blockedRun = spawnSync(process.execPath, [
  'scripts/document-generator-simple-signing-phase8-operational-handover.mjs',
  '--input',
  blockedFixturePath,
  '--max-age-minutes=10000000',
], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })
assert.equal(blockedRun.status, 1, blockedRun.stderr || blockedRun.stdout)
const blockedDecision = JSON.parse(blockedRun.stdout)
assert.equal(blockedDecision.status, 'NO_GO')
assert.equal(blockedDecision.decision, 'rollback_or_investigate_signer_route')
assert.equal(blockedDecision.operationalState.customerUseBlocked, true)
assert.ok(blockedDecision.blockers.some((blocker) => blocker.code === 'PHASE8_PHASE7_REPORT_NOT_HEALTHY'))

const staleRun = spawnSync(process.execPath, [
  'scripts/document-generator-simple-signing-phase8-operational-handover.mjs',
  '--input',
  staleFixturePath,
  '--max-age-minutes=1',
], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })
assert.equal(staleRun.status, 1, staleRun.stderr || staleRun.stdout)
const staleDecision = JSON.parse(staleRun.stdout)
assert.ok(staleDecision.blockers.some((blocker) => blocker.code === 'PHASE8_OBSERVATION_STALE'))

for (const reference of [
  'go/no-go handover',
  'does not sign documents',
  'does not invoke `signer-signing-action`',
  'does not send email',
  'does not generate final artifacts',
  'redact the controlled token',
  'rollback_or_investigate_signer_route',
  'keep_live',
]) {
  assert.ok(audit.includes(reference), `Phase 8 audit should keep ${reference}.`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase8'],
  'npm run test:document-generator-simple-signing-phase7 && node scripts/document-generator-simple-signing-phase8-operational-handover.test.mjs',
)
assert.equal(
  packageJson.scripts['verify:document-generator-simple-signing:production'],
  'node --env-file-if-exists=.env.production.local scripts/document-generator-simple-signing-phase8-operational-handover.mjs --refresh-live-observation --write',
)

console.log('document-generator simple signing Phase 8 operational handover guard passed.')
