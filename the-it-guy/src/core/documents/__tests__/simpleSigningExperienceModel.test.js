import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSimpleSigningExperienceModel,
  SIMPLE_SIGNING_EXPERIENCE_MODEL_CONTRACT,
} from '../simpleSigningExperienceModel.js'

function baseSession(overrides = {}) {
  return {
    packet: { packet_type: 'mandate', title: 'Mandate' },
    signer: { signer_role: 'seller', status: 'sent' },
    version: { version_number: 2, rendered_file_name: 'Mandate_Seller.pdf', page_count: 6 },
    fields: [
      { id: 'signature-1', field_type: 'signature', page_number: 4, required: true, status: 'pending' },
      { id: 'initial-1', field_type: 'initial', page_number: 5, required: true, status: 'pending' },
    ],
    ...overrides,
  }
}

test('adapts a mandate seller session into the simple review state', () => {
  const model = buildSimpleSigningExperienceModel({ session: baseSession(), documentPreviewUrl: 'https://example.test/doc.pdf' })
  assert.equal(model.contract, SIMPLE_SIGNING_EXPERIENCE_MODEL_CONTRACT)
  assert.equal(model.state, 'review')
  assert.equal(model.currentStepLabel, 'Step 1 of 3 · Review')
  assert.equal(model.document.title, 'Mandate')
  assert.equal(model.document.signerRoleLabel, 'Seller')
  assert.equal(model.document.previewAvailable, true)
  assert.equal(model.actionCard.primaryAction.label, 'View document')
})

test('maps an in-progress signer to the sign state and next field CTA', () => {
  const model = buildSimpleSigningExperienceModel({
    session: baseSession({
      signer: { signer_role: 'seller', status: 'viewed' },
      fields: [
        { id: 'signature-1', field_type: 'signature', page_number: 4, required: true, status: 'pending' },
      ],
    }),
  })
  assert.equal(model.state, 'sign')
  assert.equal(model.currentStepLabel, 'Step 2 of 3 · Sign')
  assert.equal(model.progress.remainingFieldCount, 1)
  assert.equal(model.progress.nextField.pageNumber, 4)
  assert.equal(model.actionCard.title, "It's your turn to sign")
  assert.equal(model.actionCard.primaryAction.label, 'Add my signature')
})

test('maps completed fields to the finish state', () => {
  const model = buildSimpleSigningExperienceModel({
    session: baseSession({
      signer: { signer_role: 'seller', status: 'viewed' },
      fields: [
        { id: 'signature-1', field_type: 'signature', page_number: 4, required: true, status: 'completed' },
      ],
    }),
  })
  assert.equal(model.state, 'finish')
  assert.equal(model.steps.find((step) => step.id === 'finish').status, 'current')
  assert.equal(model.actionCard.primaryAction.label, 'Finish signing')
})

test('maps completion with final artifact to the all-set state', () => {
  const model = buildSimpleSigningExperienceModel({
    session: baseSession({
      signer: { signer_role: 'seller', status: 'signed' },
      completion: {
        finalArtifact: { ready: true, fileName: 'mandate-v2-final-signed.pdf' },
      },
    }),
  })
  assert.equal(model.state, 'completed')
  assert.equal(model.stateLabel, 'PDF ready')
  assert.equal(model.actionCard.title, 'PDF ready')
  assert.equal(model.actionCard.primaryAction.label, 'Open completed PDF')
  assert.equal(model.document.fileName, 'mandate-v2-final-signed.pdf')
  assert.ok(model.steps.every((step) => step.status === 'complete'))
})

test('maps signed sessions without final artifact to finalising PDF state', () => {
  const model = buildSimpleSigningExperienceModel({
    session: baseSession({
      signer: { signer_role: 'seller', status: 'signed' },
      completion: {
        finalArtifact: { ready: false },
      },
    }),
  })
  assert.equal(model.state, 'completed')
  assert.equal(model.stateLabel, 'Finalising PDF')
  assert.equal(model.copy.instruction, 'Signing recorded.')
  assert.equal(model.actionCard.title, 'Finalising PDF')
  assert.equal(model.actionCard.description, 'Signing recorded. The completed PDF is being prepared and will appear here when it is ready.')
  assert.equal(model.actionCard.primaryAction.label, 'Check again')
})

test('adapts OTP purchaser sessions without hardcoding mandate copy', () => {
  const model = buildSimpleSigningExperienceModel({
    session: baseSession({
      packet: { packet_type: 'otp', title: 'Offer to Purchase' },
      signer: { signer_role: 'purchaser_1', status: 'viewed' },
      version: { rendered_file_name: 'Offer_To_Purchase.pdf' },
    }),
  })
  assert.equal(model.document.title, 'Offer to Purchase')
  assert.equal(model.document.signerRoleLabel, 'Buyer')
  assert.match(model.copy.headline, /Offer to Purchase · Buyer/)
})

test('keeps sensitive links out of the simple UI model', () => {
  const model = buildSimpleSigningExperienceModel({
    session: baseSession(),
    documentPreviewUrl: 'https://example.test/token-secret.pdf',
    fallbackPreviewHtml: '<p>secret</p>',
  })
  assert.equal(model.document.previewAvailable, true)
  assert.doesNotMatch(JSON.stringify(model), /token-secret|<p>secret<\/p>|https:\/\/example\.test/)
})
