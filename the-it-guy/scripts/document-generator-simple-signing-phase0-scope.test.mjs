import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildSimpleSigningExperienceScope,
  resolveSimpleSigningState,
} from '../src/core/documents/simpleSigningExperienceScope.js'

const scopeSource = fs.readFileSync('src/core/documents/simpleSigningExperienceScope.js', 'utf8')
const config = JSON.parse(fs.readFileSync('config/document-generator-simple-signing-phase0-scope.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-0.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scope = buildSimpleSigningExperienceScope()

assert.equal(config.phase, 'document-generator-simple-signing-ui-phase-0')
assert.equal(config.status, 'scope_locked')
assert.equal(config.contract, scope.contract)
assert.deepEqual(config.coveredDocumentTypes.map((item) => item.packetType), ['mandate', 'otp'])
assert.deepEqual(scope.signingStates.map((item) => item.id), ['review', 'sign', 'finish', 'completed', 'blocked'])

for (const boundary of [
  'changesEmailDispatch',
  'changesFinalArtifactGeneration',
  'changesFinalCompletionTruth',
  'changesSigningTokenAuthority',
  'changesStorageAccess',
]) {
  assert.equal(scope.backendBoundaries[boundary], false, `${boundary} must remain false in Phase 0`)
  assert.equal(config.backendBoundaries[boundary], false, `${boundary} must remain false in config`)
}

assert.equal(resolveSimpleSigningState({ signerStatus: 'sent', requiredFields: 2, completedFields: 0 }), 'review')
assert.equal(resolveSimpleSigningState({ signerStatus: 'viewed', requiredFields: 2, completedFields: 1 }), 'sign')
assert.equal(resolveSimpleSigningState({ signerStatus: 'viewed', requiredFields: 2, completedFields: 2 }), 'finish')
assert.equal(resolveSimpleSigningState({ signerStatus: 'signed', requiredFields: 2, completedFields: 2 }), 'completed')
assert.equal(resolveSimpleSigningState({ signerStatus: 'expired', requiredFields: 2, completedFields: 1 }), 'blocked')

for (const reference of [
  'Mandate',
  'Offer to Purchase',
  'review',
  'sign',
  'finish',
  'completed',
  'blocked',
  'changesEmailDispatch: false',
]) {
  assert.ok(scopeSource.includes(reference), `scope should keep ${reference}`)
}

for (const reference of [
  'UI-only',
  'all generated documents',
  'Mandate',
  'Offer to Purchase',
  'no email delivery changes',
  'no final-artifact changes',
]) {
  assert.ok(audit.includes(reference), `audit should keep ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase0'],
  'node --test src/core/documents/__tests__/simpleSigningExperienceScope.test.js && node scripts/document-generator-simple-signing-phase0-scope.test.mjs',
)

console.log('document-generator simple signing Phase 0 scope guard passed.')
