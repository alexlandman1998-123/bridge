import assert from 'node:assert/strict'
import test from 'node:test'
import { createMandateCaptureFixture, createMandateTermsFixture } from '../../../scripts/fixtures/seller-mandate-capture.mjs'
import { buildSellerMandateTermsFormPatch, getSellerMandateCaptureMissing, getSellerMandatePreparationIssues, getSellerMandateTermsMissing, isMandateCalendarDate, normalizeSellerMandateCapture, readSellerMandateTerms, validateSellerMandateCapture } from '../sellerMandateCapture.js'
import { buildListingSellerProfileFormPatch, createListingSellerProfileBuilderDraft } from '../listingSellerProfileBuilderModel.js'
import { buildSellerLeadManualCapturePayload, buildSellerLeadSigningPackTermsPatch, createSellerLeadAgentOnboardingDraft } from '../sellerLeadManualCaptureModel.js'
import { applyListingSellerCanonicalUpdateSnapshot, buildListingSellerCanonicalUpdate } from '../../services/listings/listingSellerCanonicalUpdateModel.js'
import { buildSellerOnboardingSigningPackSnapshot } from '../../core/documents/sellerOnboardingSigningPackSnapshot.js'
import { buildSellerSigningPacketFingerprint } from '../sellerSigningPacketChangeControl.js'
import { buildSellerSigningCorrectionEditData, validateSellerSigningDocumentCorrections } from '../../core/documents/sellerSigningDocumentCorrections.js'
import { createSellerCorrectionFixture } from '../../../scripts/fixtures/seller-document-corrections.mjs'

test('complete Dual schedules record both agencies and the agreed allocation without defaults', () => {
  const terms = createMandateTermsFixture()
  assert.deepEqual(getSellerMandateTermsMissing(terms, { ownershipType: 'individual' }), [])
  const blank = normalizeSellerMandateCapture({})
  assert.equal(blank.allocation.agencyAPercentage, '')
  assert.equal(blank.buyerExclusions.status, '')
  assert.ok(getSellerMandateCaptureMissing(blank, { mandateType: 'dual' }).some(value => /Agency B/.test(value)))
  assert.equal(readSellerMandateTerms({}).protectionPeriod, '')
})

test('Exclusive aliases use one capture model and single-agency validation ignores dormant Dual fields', () => {
  for (const type of ['sole', 'exclusive', 'sole_mandate', 'exclusive_mandate']) {
    const terms = { ...createMandateTermsFixture(), mandateType: type }
    terms.mandateCapture.agencyB = {}
    terms.mandateCapture.allocation = {}
    assert.equal(readSellerMandateTerms(terms).mandateType, 'sole')
    assert.deepEqual(getSellerMandateTermsMissing(terms, { ownershipType: 'individual' }), [])
    terms.mandateType = 'dual'
    assert.ok(getSellerMandateTermsMissing(terms).some(value => /Agency B/.test(value)))
  }
})

test('unknown saved capture versions retain all fields and cannot be downgraded into v1 signing inputs', () => {
  const future = { version: 2, futureAgencySchedule: { retained: 'Original data' }, agencyA: { futureField: 'Keep this' } }
  const before = structuredClone(future)
  const normalized = normalizeSellerMandateCapture(future)
  assert.deepEqual(normalized, future)
  normalized.futureAgencySchedule.retained = 'Local change'
  assert.deepEqual(future, before)
  const terms = readSellerMandateTerms({ ...createMandateTermsFixture(), mandateCapture: future })
  assert.deepEqual(terms.mandateCapture, future)
  assert.ok(getSellerMandateTermsMissing(terms).some(value => /Unsupported mandate capture version/.test(value)))
  assert.throws(() => buildSellerMandateTermsFormPatch(terms), /Unsupported mandate capture/)
})

test('zero protection is explicit; blank, negative and fractional days block preparation', () => {
  const terms = createMandateTermsFixture()
  for (const protectionPeriod of ['', '-1', '0.5', '9007199254740992']) assert.ok(getSellerMandateTermsMissing({ ...terms, protectionPeriod }).some(value => /Protection days/.test(value)))
  for (const protectionPeriod of [0, '0', '60']) assert.ok(!getSellerMandateTermsMissing({ ...terms, protectionPeriod }).some(value => /Protection days/.test(value)))
})

test('Open indefinite duration clears every end-date alias and cannot resurrect listing expiry', () => {
  const patch = buildSellerMandateTermsFormPatch({ ...createMandateTermsFixture(), mandateType: 'open', mandateDuration: 'until_cancelled' })
  for (const key of ['endDate', 'mandateEndDate', 'mandate_end_date', 'expiryDate', 'mandateExpiryDate', 'mandate_expiry_date']) assert.equal(patch[key], '')
  const listing = { id: 'synthetic-listing', expiryDate: '2028-01-01' }
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: patch })
  assert.equal(update.listingPatch.expiryDate, '')
  const reopened = applyListingSellerCanonicalUpdateSnapshot(listing, update)
  assert.equal(createListingSellerProfileBuilderDraft(reopened).expiryDate, '')
  assert.equal(readSellerMandateTerms(patch, listing).endDate, '')
  assert.ok(!getSellerMandateTermsMissing(patch).some(value => /end date/.test(value)))
  assert.ok(getSellerMandateTermsMissing({ ...patch, mandateDuration: 'fixed' }).some(value => /end date/.test(value)))
})

test('actual calendar dates, order and fixed duration are required for Exclusive and Dual', () => {
  assert.equal(isMandateCalendarDate('2028-02-29'), true)
  for (const value of ['2026-02-29', '2026-09-31', '2026-13-01', '2026-1-1']) assert.equal(isMandateCalendarDate(value), false)
  const terms = createMandateTermsFixture()
  for (const endDate of ['', '2026-09-31', '2026-10-03']) assert.ok(getSellerMandateTermsMissing({ ...terms, endDate }).some(value => /end date/.test(value)))
  assert.ok(getSellerMandateTermsMissing({ ...terms, mandateDuration: 'until_cancelled' }).includes('Mandate duration'))
})

test('fees and VAT require actual choices, with a positive fixed fee or percentage at most 100', () => {
  const terms = createMandateTermsFixture()
  assert.ok(!getSellerMandateTermsMissing({ ...terms, askingPrice: 'R 2 450 000.00' }).includes('Positive asking price'))
  for (const commissionPercentage of ['', '0', '-1', '101', '5abc']) assert.ok(getSellerMandateTermsMissing({ ...terms, commissionPercentage }).some(value => /commission amount/.test(value)))
  assert.ok(getSellerMandateTermsMissing({ ...terms, vatHandling: 'maybe' }).includes('Commission VAT treatment'))
  assert.ok(!getSellerMandateTermsMissing({ ...terms, commissionBasis: 'fixed', commissionAmount: '12500', vatHandling: 'no' }).some(value => /commission amount|Commission VAT/.test(value)))
})

test('Dual shares must total 100 and the agreed split needs its instructions and annexure', () => {
  const terms = createMandateTermsFixture()
  terms.mandateCapture.allocation.agencyAPercentage = '50'
  assert.ok(getSellerMandateTermsMissing(terms).includes('Dual shares must total 100%'))
  terms.mandateCapture.allocation.agencyBPercentage = '50'
  terms.mandateCapture.allocation.annexureReference = ''
  assert.ok(getSellerMandateTermsMissing(terms).includes('Dual allocation annexure reference'))
  terms.mandateCapture.allocation.rule = 'effective_cause'
  assert.ok(!getSellerMandateTermsMissing(terms).includes('Dual allocation annexure reference'))
  terms.mandateCapture.allocation.agencyBVatHandling = ''
  assert.ok(getSellerMandateTermsMissing(terms).includes('Dual Agency B VAT treatment'))
})

test('None, Not applicable and incomplete evidence are distinct choices', () => {
  const capture = createMandateCaptureFixture()
  capture.buyerExclusions = { status: 'none', details: '' }
  capture.priceExclusions = { status: 'not_applicable', details: '' }
  assert.deepEqual(getSellerMandateCaptureMissing(capture, { mandateType: 'sole', ownershipType: 'individual' }), [])
  capture.buyerExclusions.status = ''
  assert.ok(getSellerMandateCaptureMissing(capture).includes('Excluded buyers or transactions: explicit choice'))
  capture.authority.status = 'not_applicable'
  assert.ok(getSellerMandateCaptureMissing(capture, { ownershipType: 'company' }).includes('Seller authority evidence'))
  capture.agencyA.businessFfcReference = ''
  assert.ok(getSellerMandateCaptureMissing(capture).some(value => /Business FFC evidence/.test(value)))
})

test('approved expenses require the cap, VAT and payment trigger', () => {
  const capture = createMandateCaptureFixture()
  capture.expenses.maximumAmount = '0'
  capture.expenses.vatHandling = ''
  capture.expenses.paymentTrigger = ''
  const missing = getSellerMandateCaptureMissing(capture)
  assert.ok(missing.includes('Positive maximum approved expense'))
  assert.ok(missing.includes('Expense VAT treatment'))
  assert.ok(missing.some(value => /payment trigger/.test(value)))
  capture.expenses.status = 'none'
  assert.ok(!getSellerMandateCaptureMissing(capture).some(value => /[Ee]xpense|payment trigger/.test(value)))
})

test('capture is bounded and whitelisted rather than coercing arbitrary objects into text', () => {
  const capture = createMandateCaptureFixture()
  assert.throws(() => validateSellerMandateCapture({ ...capture, version: 2 }), /Unsupported/)
  assert.throws(() => validateSellerMandateCapture({ ...capture, agencyA: [] }), /section/)
  assert.throws(() => validateSellerMandateCapture({ ...capture, authority: { status: 'approved' } }), /status/)
  assert.throws(() => validateSellerMandateCapture({ ...capture, agencyA: { ...capture.agencyA, legalName: {} } }), /text or numbers/)
  assert.throws(() => buildSellerMandateTermsFormPatch({ mandateCapture: { ...capture, expenses: { status: 'captured', details: 'x'.repeat(4001) } } }), /too long/)
  const clean = validateSellerMandateCapture({ ...capture, arbitrary: 'discard', agencyA: { ...capture.agencyA, verificationPassed: true } })
  assert.equal(clean.arbitrary, undefined)
  assert.equal(clean.agencyA.verificationPassed, undefined)
})

test('lead, listing, canonical save and reopened editors retain the complete schedules and clears', () => {
  const terms = createMandateTermsFixture(), patch = buildSellerLeadSigningPackTermsPatch(terms)
  const listing = { id: 'synthetic-listing', sellerOnboarding: { formData: { ownershipType: 'individual', sellerFirstName: 'Seller', sellerSurname: 'Owner', propertyAddress: 'Original property', unrelatedNotes: 'retain me' } } }
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: patch })
  const reopened = applyListingSellerCanonicalUpdateSnapshot(listing, update)
  const draft = createListingSellerProfileBuilderDraft(reopened)
  assert.deepEqual(draft.mandateCapture, normalizeSellerMandateCapture(terms.mandateCapture))
  assert.equal(draft.protectionPeriod, '0')
  assert.equal(draft.commissionPercentage, '5')
  draft.mandateCapture.agencyB.noticeEmail = ''
  draft.mandateCapture.buyerExclusions = { status: 'none', details: '' }
  const nextPatch = buildListingSellerProfileFormPatch(draft)
  const saved = applyListingSellerCanonicalUpdateSnapshot(reopened, buildListingSellerCanonicalUpdate({ listing: reopened, formPatch: nextPatch }))
  const leadDraft = createSellerLeadAgentOnboardingDraft({ listing: saved, formData: saved.sellerOnboarding.formData })
  assert.equal(leadDraft.mandateCapture.agencyB.noticeEmail, '')
  assert.equal(leadDraft.mandateCapture.buyerExclusions.status, 'none')
  assert.equal(leadDraft.mandateCapture.buyerExclusions.details, '')
  const manual = buildSellerLeadManualCapturePayload({ form: { ...nextPatch, ownershipType: 'individual' } })
  assert.deepEqual(manual.formPatch.mandateCapture, nextPatch.mandateCapture)
  assert.equal(manual.formPatch.commissionPercentage, '5')
  assert.equal(manual.formPatch.mandateTerms, terms.specialConditions)
  assert.equal(saved.sellerOnboarding.formData.unrelatedNotes, 'retain me')
})

test('fresh snapshots freeze schedules by value; they do not attach mutable draft references', () => {
  const terms = createMandateTermsFixture(), formData = buildSellerMandateTermsFormPatch(terms)
  const snapshot = buildSellerOnboardingSigningPackSnapshot({ formData, mandate: { mandateType: 'dual' } })
  assert.deepEqual(snapshot.mandate.mandateCapture, normalizeSellerMandateCapture(terms.mandateCapture))
  formData.mandateCapture.agencyB.legalName = 'Changed after freezing'
  assert.equal(snapshot.mandate.mandateCapture.agencyB.legalName, 'Bravo Property (Pty) Ltd')
  const indefinite = buildSellerOnboardingSigningPackSnapshot({ formData: { ...formData, mandateType: 'open', mandateDuration: 'until_cancelled' }, mandate: { mandateType: 'open', endDate: '2028-01-01' } })
  assert.equal(indefinite.mandate.endDate, '')
})

test('cleared price, type and conditions stay blank and zero protection replaces every old alias', () => {
  const old = buildSellerMandateTermsFormPatch(createMandateTermsFixture())
  const listing = { id: 'synthetic-listing', mandateType: 'dual', askingPrice: '2450000', sellerOnboarding: { formData: old } }
  const draft = createListingSellerProfileBuilderDraft(listing)
  draft.mandateType = ''
  draft.askingPrice = ''
  draft.mandateTerms = ''
  draft.protectionPeriod = '0'
  const formPatch = buildListingSellerProfileFormPatch(draft)
  const reopened = applyListingSellerCanonicalUpdateSnapshot(listing, buildListingSellerCanonicalUpdate({ listing, formPatch }))
  const next = createListingSellerProfileBuilderDraft(reopened)
  assert.equal(next.mandateType, '')
  assert.equal(next.askingPrice, '')
  assert.equal(next.mandateTerms, '')
  for (const key of ['protectionPeriod', 'protectionPeriodDays', 'mandateProtectionPeriod', 'mandate_protection_period']) assert.equal(formPatch[key], '0')
  assert.equal(formPatch.specialConditions, '')
})

test('correction edit data retains schedules and explicit clears without mutating the approved snapshot', () => {
  const copy = createSellerCorrectionFixture()
  copy.pack.signingPackSnapshot.mandate.mandateCapture = createMandateCaptureFixture()
  const before = structuredClone(copy)
  const edit = buildSellerSigningCorrectionEditData(copy, 'signed_mandate')
  edit.mandate.mandateCapture.agencyB.noticeEmail = ''
  const clean = validateSellerSigningDocumentCorrections(edit, 'signed_mandate')
  const reopened = buildSellerSigningCorrectionEditData(copy, 'signed_mandate', clean)
  assert.equal(reopened.mandate.mandateCapture.agencyB.noticeEmail, '')
  assert.deepEqual(copy, before)
})

test('legacy snapshots and fingerprints retain their shape; new captured instructions affect change control', () => {
  const legacy = { seller: {}, mandate: {}, selectedDocuments: [] }
  assert.equal(buildSellerSigningPacketFingerprint(legacy), JSON.stringify({ sellerType: '', sellerName: '', sellerEmail: '', authorisedSignatory: '', propertyAddress: '', commissionBasis: '', commissionPercentage: '', commissionAmount: '', vatHandling: '', selectedDocuments: [] }))
  assert.equal(normalizeSellerMandateCapture(undefined), undefined)
  assert.equal(buildSellerOnboardingSigningPackSnapshot({}).mandate.mandateCapture, undefined)
  const current = { ...legacy, mandate: createMandateTermsFixture() }
  const before = buildSellerSigningPacketFingerprint(current)
  current.mandate.mandateCapture.allocation.agencyAPercentage = '40'
  assert.notEqual(buildSellerSigningPacketFingerprint(current), before)
})

test('capture cannot be silently attached to the current signing template even when complete', () => {
  const terms = createMandateTermsFixture()
  assert.deepEqual(getSellerMandateTermsMissing(terms, { ownershipType: 'individual' }), [])
  assert.match(getSellerMandatePreparationIssues(terms, { ownershipType: 'individual' }).join(' '), /business\/legal approval/)
  delete terms.mandateCapture
  assert.deepEqual(getSellerMandatePreparationIssues(terms), [])
})

test('checked acceptance evidence survives save, reopened listing capture and fresh snapshots', () => {
  const terms = { ...createMandateTermsFixture(), mandateAcceptanceReview: { authorityVerified: true, disclosureVerified: true, ffcVerified: true,
    reviewedBy: 'Synthetic staff reviewer', reviewedAt: '2026-10-04T10:00:00Z', authorityReference: 'AUTH-001', disclosureReference: 'MDF-001', agencySchedulesDigest: `sha256:${'a'.repeat(64)}` } }
  const form = buildSellerMandateTermsFormPatch(terms)
  const reopened = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData: form } })
  assert.deepEqual(reopened.mandateAcceptanceReview, terms.mandateAcceptanceReview)
  const saved = buildListingSellerProfileFormPatch(reopened)
  assert.deepEqual(saved.mandateAcceptanceReview, terms.mandateAcceptanceReview)
  const snapshot = buildSellerOnboardingSigningPackSnapshot({ formData: saved, mandate: terms })
  assert.equal(snapshot.disclosureReference, 'MDF-001')
  snapshot.mandate.mandateAcceptanceReview.reviewedBy = 'Changed after freezing'
  assert.equal(saved.mandateAcceptanceReview.reviewedBy, 'Synthetic staff reviewer')
})
