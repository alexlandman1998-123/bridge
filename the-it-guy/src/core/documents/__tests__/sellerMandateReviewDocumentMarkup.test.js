import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { buildSellerMandateReviewDocumentMarkup, parseSellerMandateReviewWording } from '../sellerMandateReviewDocumentMarkup.js'
import { createMandateReviewFixture } from '../../../../scripts/fixtures/seller-mandate-review.mjs'
import { getSellerMandatePreparationIssues } from '../../../lib/sellerMandateCapture.js'
import { buildSellerMandateTermsFormPatch } from '../../../lib/sellerMandateCapture.js'
import { buildSellerPostOnboardingDrafts } from '../sellerPostOnboardingDrafts.js'
import { createSellerCorrectionFixture } from '../../../../scripts/fixtures/seller-document-corrections.mjs'

const hashes = {
  exclusive: '8e7830475ceb4376ea21c78655605f0b4f98a7c7f2cc6f13fb66718fc9348913',
  open: '1f1cd90a9fdb2cb2f745c909508dc9a978e0e47d006f7dc08a58f3e49800c4b3',
  dual: 'fb86cb6ac2ef90da9adbfa4bf3a074a08ea92fd644c22209cc15076e52a5a6a0',
}
const draft = type => readFileSync(new URL(`../../../../docs/mandate-wording-review/${type}-mandate-draft.md`, import.meta.url), 'utf8')
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
for (const type of ['exclusive', 'open', 'dual']) {
  test(`${type}: preserves every Phase 1 legal paragraph, exact source and review status`, () => {
    const markdown = draft(type)
    assert.equal(createHash('sha256').update(markdown).digest('hex'), hashes[type])
    const signingPack = createMandateReviewFixture(type === 'exclusive' ? 'sole' : type)
    const html = buildSellerMandateReviewDocumentMarkup({ signingPack, draftMarkdown: markdown })
    const wording = parseSellerMandateReviewWording(markdown)
    for (const section of wording.sections) for (const block of section.blocks) if (block.kind === 'paragraph') assert.ok(html.includes(escape(block.text)), `${section.title}: missing paragraph`)
    assert.match(html, /DRAFT FOR REVIEW - NOT FOR SIGNATURE/)
    assert.match(html, /10\.5pt/)
    assert.match(html, /Sam Example/); assert.match(html, /Jordan Example/)
    assert.match(html, /AUTH-001/); assert.match(html, /MDF-001/)
    assert.match(html, /privacy-alpha@example.test/)
    assert.ok(getSellerMandatePreparationIssues(signingPack.mandate).length > 0, 'Review must not activate new signing wording')
    if (type === 'dual') {
      assert.match(html, /Agency A acceptance/); assert.match(html, /Agency B acceptance/)
      assert.match(html, /Agency A: 30% \| Agency B: 70%/)
      assert.match(html, /Bravo Representative/); assert.match(html, /ALLOCATION-1/)
    } else assert.ok(!html.includes('Bravo Property (Pty) Ltd'), 'Hidden second agency must not leak into a single-agency contract')
    if (type === 'open') { assert.match(html, /From 4 October 2026; until cancelled by recorded notice/); assert.ok(!html.includes('4 January 2027')) }
  })
}
test('wrong draft, unsupported type and incomplete legal text fail closed', () => {
  assert.throws(() => buildSellerMandateReviewDocumentMarkup({ signingPack: createMandateReviewFixture('dual'), draftMarkdown: draft('open') }), /does not match/)
  assert.throws(() => buildSellerMandateReviewDocumentMarkup({ signingPack: createMandateReviewFixture('prime'), draftMarkdown: draft('exclusive') }), /Select Exclusive/)
  assert.throws(() => parseSellerMandateReviewWording('## 1 Appointment\nA clause.'), /seven-clause/)
})
test('zero protection, fixed fee, absent data and hostile input stay explicit and escaped', () => {
  const pack = createMandateReviewFixture()
  pack.mandate.protectionPeriod = '0'; pack.mandate.commissionBasis = 'fixed'; pack.mandate.commissionAmount = '15000'; pack.mandate.vatHandling = 'none'
  pack.mandate.specialConditions = '</script><img src=x onerror=alert(1)>'
  const html = buildSellerMandateReviewDocumentMarkup({ signingPack: pack, draftMarkdown: draft('exclusive') })
  assert.match(html, /0 calendar days - none/); assert.match(html, /15[\s\u00a0,]?000[.,]00/); assert.match(html, /No VAT chargeable/)
  assert.ok(!html.includes('<img src=x')); assert.match(html, /&lt;\/script&gt;/)
  assert.equal((html.match(/<script>/g) || []).length, 1)
  const empty = buildSellerMandateReviewDocumentMarkup({ signingPack: { mandate: { mandateType: 'sole' } }, draftMarkdown: draft('exclusive') })
  assert.match(empty, /Not captured - confirm before approval/)
  assert.ok(!empty.includes('60 calendar days'))
})
for (const type of ['company', 'trust']) test(`${type}: legal owner, registered address and representative capacity carry through`, () => {
  const pack = createMandateReviewFixture()
  pack.seller = { legalType: type, legalOwnerName: `Synthetic ${type} Owner`, legalOwnerIdentity: `${type}-REG-001`, companyRegisteredAddress: 'Company registered address', trustRegisteredAddress: 'Trust registered address', residentialAddress: 'Unrelated representative home' }
  pack.signers = [{ name: 'Authorised Representative', capacity: type === 'company' ? 'Director' : 'Trustee', authorityReference: 'RESOLUTION-001' }]
  const html = buildSellerMandateReviewDocumentMarkup({ signingPack: pack, draftMarkdown: draft('exclusive') })
  assert.match(html, new RegExp(`${type === 'company' ? 'Company' : 'Trust'} registered address`))
  assert.ok(!html.includes('Unrelated representative home'))
  assert.match(html, /RESOLUTION-001/)
  assert.ok(html.includes(`<span>Synthetic ${type} Owner</span>`))
})
test('saved schedules connect the complete draft to normal post-onboarding review', () => {
  const copy = createSellerCorrectionFixture('individual')
  const review = createMandateReviewFixture('dual')
  const pack = buildSellerPostOnboardingDrafts({ formData: { ...copy.form, ...buildSellerMandateTermsFormPatch(review.mandate) },
    listing: { id: 'synthetic-review-listing', propertyAddress: review.property.address }, branding: review.branding, generatedAt: '2026-10-04T10:00:00Z' })
  const draft = pack.documents.find(document => document.targetRequirementKey === 'signed_mandate')
  assert.equal(draft.name, 'Full mandate review draft')
  assert.match(draft.generatedHtml, /data-review-layout="seller-mandate-review"/)
  assert.match(draft.generatedHtml, /DRAFT FOR REVIEW - NOT FOR SIGNATURE/)
  assert.match(draft.generatedHtml, /Agency B acceptance/)
  assert.match(draft.generatedHtml, /7 Information notices and records/)
  assert.match(draft.generatedHtml, /Agency A: 30%/)
  assert.match(draft.metadata.wordingDigest, /^sha256:[a-f0-9]{64}$/)
})
