import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildSimpleSigningExperienceModel,
  SIMPLE_SIGNING_EXPERIENCE_MODEL_CONTRACT,
} from '../src/core/documents/simpleSigningExperienceModel.js'

const modelSource = fs.readFileSync('src/core/documents/simpleSigningExperienceModel.js', 'utf8')
const config = JSON.parse(fs.readFileSync('config/document-generator-simple-signing-phase1-model.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-1.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(config.phase, 'document-generator-simple-signing-ui-phase-1')
assert.equal(config.contract, SIMPLE_SIGNING_EXPERIENCE_MODEL_CONTRACT)
assert.equal(config.status, 'adapter_model_ready')
assert.deepEqual(config.modelStates, ['review', 'sign', 'finish', 'completed', 'blocked'])

const mandate = buildSimpleSigningExperienceModel({
  session: {
    packet: { packet_type: 'mandate' },
    signer: { signer_role: 'seller', status: 'viewed' },
    version: { rendered_file_name: 'Mandate_Seller.pdf', page_count: 6 },
    fields: [{ id: 'signature-1', field_type: 'signature', page_number: 4, required: true, status: 'pending' }],
  },
})
assert.equal(mandate.state, 'sign')
assert.equal(mandate.document.title, 'Mandate')
assert.equal(mandate.document.signerRoleLabel, 'Seller')
assert.equal(mandate.actionCard.primaryAction.label, 'Add my signature')

for (const reference of [
  'previewAvailable',
  'currentStepLabel',
  'actionCard',
  'helpCard',
  'secureFooter',
  'mutatedData: false',
  'resolveSimpleSigningState',
]) {
  assert.ok(modelSource.includes(reference), `Phase 1 model should keep ${reference}`)
}

for (const forbidden of [
  'dispatch-final-signed-document',
  'send-email',
  'completeSignerSigning(',
  'applySignerField(',
  'resolveSignerFinalSignedArtifactAccess(',
  'downloadUrl:',
]) {
  assert.equal(modelSource.includes(forbidden), false, `Phase 1 adapter must not own ${forbidden}`)
}

for (const reference of [
  'adapter',
  'existing signer session',
  'Mandate',
  'Offer to Purchase',
  'no email delivery changes',
  'no final-artifact changes',
]) {
  assert.ok(audit.includes(reference), `Phase 1 audit should keep ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase1'],
  'node --test src/core/documents/__tests__/simpleSigningExperienceScope.test.js src/core/documents/__tests__/simpleSigningExperienceModel.test.js && node scripts/document-generator-simple-signing-phase1-model.test.mjs',
)

console.log('document-generator simple signing Phase 1 model guard passed.')
