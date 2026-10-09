import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildSellerAgentAssistedDisclosurePatch, getSellerDisclosureQuestionMissing, isSellerDisclosureCaptureLocked } from '../sellerAgentAssistedDisclosure.js'
import { buildSellerLeadAgentOnboardingSubmission, createSellerLeadAgentOnboardingDraft } from '../sellerLeadManualCaptureModel.js'
import { PROPERTY_DISCLOSURE_QUESTIONS, isPropertyDisclosureDigitallyComplete, buildPropertyDisclosureAnnexureSnapshot, normalizePropertyDisclosure } from '../propertyDisclosure.js'
import { areRequiredSellerDisclosureAcknowledgementsAccepted } from '../../core/documents/sellerDisclosureAcknowledgements.js'
import { buildSellerPostOnboardingDrafts } from '../../core/documents/sellerPostOnboardingDrafts.js'

const answers = () => ({ responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map(question => [question.key, { answer: question.number === 12 ? 'unsure' : 'no', note: question.number === 12 ? 'Seller reports an intermittent leak.' : '' }])) })
const at = '2026-10-09T10:00:00Z'

test('full agent capture preserves every answer, explanations, zero quantity and comments without seller attestation', () => {
  const disclosure = { ...answers(), remoteControlsQuantity: 0, comments: 'Inspection pending.',
    signature: 'forged', signedAt: at, declarationAccepted: true, arch9TermsAccepted: true,
    sellerDisclosureAcknowledgements: { accuracy: { accepted: true } }, generatedDocument: { html: 'stale' } }
  const captured = buildSellerAgentAssistedDisclosurePatch({ disclosure, capturedBy: 'agent-a', capturedAt: at })
  assert.deepEqual(captured.propertyDisclosure.responses, disclosure.responses)
  assert.equal(captured.propertyDisclosure.remoteControlsQuantity, '0')
  assert.equal(captured.propertyDisclosure.comments, 'Inspection pending.')
  assert.equal(captured.propertyDisclosure.signature, '')
  assert.equal(captured.propertyDisclosure.signedAt, '')
  assert.equal(captured.propertyDisclosure.declarationAccepted, false)
  assert.equal(captured.propertyDisclosure.arch9TermsAccepted, false)
  assert.equal(captured.propertyDisclosure.sellerDisclosureAcknowledgements, null)
  assert.equal(captured.propertyDisclosure.generatedDocument, null)
  assert.equal(isPropertyDisclosureDigitallyComplete(captured.propertyDisclosure), false)
  assert.equal(captured.propertyDisclosureStatus, 'pending_seller_completion')
  assert.deepEqual(captured.sellerDisclosureCapture, { mode: 'agent_assisted', status: 'awaiting_seller_review_and_signature', capturedBy: 'agent-a', capturedAt: at })
  const snapshot = buildPropertyDisclosureAnnexureSnapshot(captured.propertyDisclosure)
  assert.equal(snapshot.sellerSignature, '')
  const drafts = buildSellerPostOnboardingDrafts({ formData: captured, listing: {}, generatedAt: at })
  assert.ok(JSON.stringify(drafts).includes('Seller reports an intermittent leak.'))
  assert.ok(JSON.stringify(drafts).includes('Inspection pending.'))
})

test('incomplete capture saves as a draft and reopens without inventing unanswered responses', () => {
  const key = PROPERTY_DISCLOSURE_QUESTIONS[0].key
  const draft = { propertyDisclosure: { responses: { [key]: { answer: 'yes', note: 'Light trips.' } }, comments: 'Call electrician.' } }
  const saved = buildSellerLeadAgentOnboardingSubmission({ draft, saveAsDraft: true, capturedBy: 'agent-a', capturedAt: at })
  assert.deepEqual(saved.errors, [])
  assert.equal(saved.formData.sellerDisclosureCapture.status, 'draft')
  const reopened = createSellerLeadAgentOnboardingDraft({ formData: saved.formData })
  assert.deepEqual(reopened.propertyDisclosure.responses[key], { answer: 'yes', note: 'Light trips.' })
  assert.equal(reopened.propertyDisclosure.comments, 'Call electrician.')
  assert.match(getSellerDisclosureQuestionMissing(reopened.propertyDisclosure)[0], /19 remaining/)
  const submitted = buildSellerLeadAgentOnboardingSubmission({ draft: reopened, existingFormData: saved.formData })
  assert.ok(submitted.errors.some(message => /19 remaining/.test(message)))
})

test('deliberate explanation and quantity clears survive normalization and reopen', () => {
  const captured = buildSellerAgentAssistedDisclosurePatch({ disclosure: { ...answers(), comments: '', commentary: 'Stale', otherDisclosure: '', other_disclosure: 'Old', remoteControlsQuantity: '', remote_controls_quantity: '3' } })
  const reopened = createSellerLeadAgentOnboardingDraft({ formData: captured })
  assert.equal(reopened.propertyDisclosure.comments, '')
  assert.equal(reopened.propertyDisclosure.otherDisclosure, '')
  assert.equal(reopened.propertyDisclosure.remoteControlsQuantity, '')
})

for (const evidence of [
  { propertyDisclosure: { decision: 'none', signature: 'signed-original', signedAt: at, declarationAccepted: true, legacyField: 'preserve' } },
  { propertyDisclosure: { comments: 'Shared answers' }, sellerComplianceSigners: [{ signature: { value: 'co-owner-signature' } }] },
  { propertyDisclosure: { uploadedDocumentReviewed: true, generatedDocument: { id: 'uploaded-original' } } },
]) {
  test(`existing evidence locks assisted capture: ${JSON.stringify(evidence)}`, () => {
    const existing = { ...evidence, sellerOnboardingDisclosureSnapshot: { frozenAt: at }, sellerOnboardingManualSigningPack: { documents: [{ generatedHtml: 'signed-original' }] } }
    assert.equal(isSellerDisclosureCaptureLocked(existing), true)
    const draft = createSellerLeadAgentOnboardingDraft({ formData: existing })
    assert.equal(draft.disclosureLocked, true)
    const saved = buildSellerLeadAgentOnboardingSubmission({ draft: { ...draft, propertyDisclosure: answers() }, existingFormData: existing, saveAsDraft: true })
    assert.deepEqual(saved.formData.propertyDisclosure, existing.propertyDisclosure)
    assert.deepEqual(saved.formData.sellerOnboardingDisclosureSnapshot, existing.sellerOnboardingDisclosureSnapshot)
    assert.deepEqual(saved.formData.sellerOnboardingManualSigningPack, existing.sellerOnboardingManualSigningPack)
    assert.equal(saved.formData.sellerDisclosureCapture, undefined)
  })
}

const page = readFileSync(new URL('../../pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const handler = page.slice(page.indexOf('  async function handleSubmitManualSellerOnboarding('), page.indexOf('  async function handleSendSellerPortalLink()', page.indexOf('  async function handleSubmitManualSellerOnboarding(')))

async function runHandler({ draft = {}, saveAsDraft = false, fail = false } = {}) {
  const events = { writes: [], errors: [], closed: false, busy: false }
  const manual = { leadId: 'lead-a', listing: { id: 'listing-a' }, token: 'token-a', formData: {} }
  const scope = {
    manualSellerOnboarding: manual, manualSellerOnboardingDraft: draft, isManualSellerOnboardingSaving: false,
    buildSellerLeadAgentOnboardingSubmission, currentAgent: { id: 'agent-a' }, normalizeText: value => String(value || '').trim(),
    setError: error => events.errors.push(error), setIsManualSellerOnboardingSaving: value => { events.busy = value },
    updateSellerOnboardingProgress: async (token, payload) => { events.writes.push({ token, payload }); if (fail) throw new Error('Save failed'); return { listing: manual.listing, onboarding: {} } },
    submitSellerOnboarding: async () => { throw new Error('An incomplete submission must not write') },
    setManualSellerOnboarding: value => { events.closed = value === null }, setSelectedLeadHydratedListing: () => {}, patchSelectedLeadRecord: () => {}, setMessage: () => {},
  }
  await Function(...Object.keys(scope), `${handler}; return handleSubmitManualSellerOnboarding(null, ${saveAsDraft})`)(...Object.values(scope))
  return events
}

test('actual agent handler blocks incomplete submission before persistence', async () => {
  const result = await runHandler()
  assert.equal(result.writes.length, 0)
  assert.ok(result.errors.some(error => /20 remaining/.test(error)))
  assert.equal(result.closed, false)
})

test('actual agent draft handler persists partial answers and leaves the editor open, including on failure', async () => {
  const draft = { propertyDisclosure: { responses: { electrical_faults: { answer: 'yes', note: 'Reported fault.' } } } }
  for (const fail of [false, true]) {
    const result = await runHandler({ draft, saveAsDraft: true, fail })
    assert.equal(result.writes.length, 1)
    assert.equal(result.writes[0].payload.formData.sellerDisclosureCapture.capturedBy, 'agent-a')
    assert.equal(result.writes[0].payload.status, 'in_progress')
    assert.equal(result.closed, false)
    assert.equal(result.busy, false)
    if (fail) assert.equal(result.errors.at(-1), 'Save failed')
  }
})

const onboarding = readFileSync(new URL('../../pages/SellerOnboarding.jsx', import.meta.url), 'utf8')
const missingFunction = onboarding.slice(onboarding.indexOf('function getPropertyDisclosureMissingItems('), onboarding.indexOf('function getPropertyAddressDetails('))
const getPageMissing = Function('normalizePropertyDisclosure', 'PROPERTY_DISCLOSURE_QUESTIONS', 'areRequiredSellerDisclosureAcknowledgementsAccepted', `${missingFunction}; return getPropertyDisclosureMissingItems`)(normalizePropertyDisclosure, PROPERTY_DISCLOSURE_QUESTIONS, areRequiredSellerDisclosureAcknowledgementsAccepted)

test('listing assisted capture requires answers; ordinary seller and private signer paths still require signature evidence', () => {
  assert.deepEqual(getPageMissing(answers(), { requireSignature: false }), [])
  assert.ok(getPageMissing(answers()).includes('draw a signature'))
  assert.ok(getPageMissing(answers()).includes('select a signature date'))
  assert.match(getPageMissing({}, { requireSignature: false })[0], /20 remaining/)
  assert.deepEqual(getPageMissing({ signature: 'legacy-signed' }, { requireSignature: false, preserveSigned: true }), [])
})

test('actual assisted autosave keeps capture timestamps out of dirty-input comparison', async () => {
  const saveFunction = onboarding.slice(onboarding.indexOf('  async function saveDraft('), onboarding.indexOf('  useEffect', onboarding.indexOf('  async function saveDraft(')))
  let current = { propertyDisclosure: answers() }
  const stored = []
  const signature = (form, currentStep) => JSON.stringify({ currentStep, form })
  const last = { current: '' }
  const scope = {
    form: current, currentStep: 2, hasRequestedComplianceSigner: false, listing: {},
    normalizeSellerFormForProgression: value => structuredClone(value), buildSellerDraftSignature: signature,
    isAgentAssistedCompletion: true, assistedDisclosureSource: {}, buildSellerAgentAssistedDisclosurePatch,
    useDbFirstSellerOnboarding: false, setSaving: () => {}, setError: () => {}, setDraftSyncStatus: () => {},
    buildCanonicalPayload: () => ({}), buildSellerEntityProfileAliases: () => ({}),
    persistListingUpdate: async updater => {
      const saved = updater({ sellerOnboarding: {} })
      stored.push(saved.sellerOnboarding.formData)
      return saved
    },
    SELLER_ONBOARDING_STATUS: { IN_PROGRESS: 'in_progress' }, lastDraftSignatureRef: last,
    setForm: updater => { current = updater(current) }, setLastDraftSavedAt: () => {},
  }
  assert.equal(await Function(...Object.keys(scope), `${saveFunction}; return saveDraft(2, {silent:true})`)(...Object.values(scope)), true)
  assert.equal(stored[0].sellerDisclosureCapture.mode, 'agent_assisted')
  assert.equal(stored[0].propertyDisclosure.signature, '')
  assert.equal(current.sellerDisclosureCapture, undefined)
  assert.equal(last.current, signature(current, 2))
})
