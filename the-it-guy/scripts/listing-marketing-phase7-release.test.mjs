import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = path.join(appRoot, 'docs/listing-marketing-phase7-controlled-test.template.json')
const runbookPath = path.join(appRoot, 'docs/listing-marketing-phase7-release-runbook.md')
const packagePath = path.join(appRoot, 'package.json')
const MANUAL_CONTRACT = 'listing-marketing-phase7-controlled-test-v1'

function argument(name) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || ''
}

function assertSafeEvidence(value) {
  const content = JSON.stringify(value)
  assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'Do not store email addresses in release evidence')
  assert.doesNotMatch(content, /(?:bearer|password|secret|credential|access.?token|refresh.?token|signed.?url)/i, 'Do not store credentials or signed links in release evidence')
  assert.doesNotMatch(content, /\+?\d[\d .()/-]{7,}\d/, 'Do not store phone numbers in release evidence')
}

function validateObservation(observation, { template = false } = {}) {
  assert.equal(observation.contract, MANUAL_CONTRACT)
  assert.ok(['staging', 'authorised_test'].includes(observation.environment), 'Only staging or an explicitly authorised test environment is permitted')
  assert.equal(typeof observation.checks, 'object')
  assert.ok(Object.keys(observation.checks).length >= 25, 'The complete Marketing acceptance matrix is required')
  for (const [name, passed] of Object.entries(observation.checks)) {
    assert.equal(typeof passed, 'boolean', `${name} must be recorded as a boolean`)
    if (!template) assert.equal(passed, true, `${name} did not pass`)
  }
  assert.equal(observation.deploymentApproved, false, 'Manual evidence must not grant deployment approval')
  assert.equal(observation.remoteDataOperationApproved, false, 'Manual evidence must not grant remote-data approval')
  if (!template) {
    assert.equal(observation.result, 'passed')
    assert.doesNotMatch(observation.listingReference, /^REPLACE_WITH_/)
    assert.doesNotMatch(observation.operatorReference, /^REPLACE_WITH_/)
    assert.match(observation.sourceRevision, /^[a-f0-9]{40}$/i, 'Evidence must identify the exact source revision')
    assert.ok(Number.isFinite(Date.parse(observation.testedAt)), 'testedAt must be a valid timestamp')
  }
  assertSafeEvidence({ ...observation, notes: '' })
}

test('Phase 7 template is fail-closed and contains no release authority', async () => {
  const template = JSON.parse(await readFile(templatePath, 'utf8'))
  validateObservation(template, { template: true })
  assert.equal(template.result, 'pending')
  assert.equal(Object.values(template.checks).every((value) => value === false), true)
})

test('Phase 7 runbook preserves manual portal confirmation, rollback and approval boundaries', async () => {
  const runbook = await readFile(runbookPath, 'utf8')
  assert.match(runbook, /Do not substitute an Arch9-only save for portal confirmation/i)
  assert.match(runbook, /only failed channels run again/i)
  assert.match(runbook, /application rollback cannot undo external portal mutations/i)
  assert.match(runbook, /require separate explicit approval/i)
})

test('the focused Marketing command includes the Phase 7 gate', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.match(pkg.scripts['test:listing-marketing'], /listing-marketing-phase7-release\.test\.mjs/)
  assert.equal(pkg.scripts['check:listing-marketing'], 'npm run test:listing-marketing && npm run build')
})

test('completed manual evidence is required only when the release operator requests it', async () => {
  const observationPath = argument('observation')
  const requireManual = process.argv.includes('--require-manual')
  if (!observationPath) {
    assert.equal(requireManual, false, 'Phase 7 remains blocked until --observation=/absolute/path/to/evidence.json is supplied')
    return
  }
  const observation = JSON.parse(await readFile(path.resolve(observationPath), 'utf8'))
  validateObservation(observation)
})
