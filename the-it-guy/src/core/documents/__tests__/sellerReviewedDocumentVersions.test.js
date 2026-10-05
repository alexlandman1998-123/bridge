import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerReviewedDocumentVersionIndex, computeSellerReviewedDocumentVersionDigest, createSellerReviewedDocumentVersions, verifySellerReviewedDocumentVersion } from '../sellerReviewedDocumentVersions.js'
import { getSellerDocumentSigningRouteReadiness, SELLER_DOCUMENT_SIGNING_ROUTES } from '../sellerDocumentSigningContract.js'
import { createSyntheticMandateSigningRuntime } from '../../../../scripts/fixtures/seller-mandate-signing.mjs'
import { createMandateReviewFixture } from '../../../../scripts/fixtures/seller-mandate-review.mjs'
import { buildSellerMandateDocumentMarkup } from '../sellerMandateDocumentMarkup.js'
import { readFile } from 'node:fs/promises'
import { SELLER_MANDATE_WORDING_RELEASE, SELLER_MANDATE_AGENCY_APPROVALS } from '../sellerMandateWordingRelease.js'
import { mandateDigest, createMandateSigningContract, mandateCertificatesCurrent } from '../sellerMandateSigningApproval.js'

const approval = {
  status: 'approved', signingRoute: 'manual_upload',
  commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' },
}
const signingPack = {
  signers: [{ name: 'Alex Seller', role: 'Seller', email: 'alex@example.com' }, { name: 'Pat Seller', role: 'Co-owner', email: 'pat@example.com' }],
  mandate: { mandateType: 'sole', propertyAddress: '1 Test Road', specialConditions: 'No early termination' },
}
const manualSigningPack = {
  documents: [
    { key: 'signed_disclosure_form', generatedHtml: '<article>Disclosure</article>', sourceDraftFingerprint: 'draft-1' },
    { key: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>', sourceDraftFingerprint: 'draft-2' },
    { key: 'signed_mandate', generatedHtml: '<article>Mandate</article>' },
  ],
}

test('user-confirmed wording approval pins exact drafts without approving synthetic agency schedules', async () => {
  for (const [type, name] of [['sole', 'exclusive'], ['open', 'open'], ['dual', 'dual']]) {
    const release = SELLER_MANDATE_WORDING_RELEASE[type]
    const source = await readFile(new URL(`../../../../docs/mandate-wording-review/${name}-mandate-draft.md`, import.meta.url), 'utf8')
    assert.equal(release.markdown, source)
    assert.equal(await mandateDigest(source), release.wordingDigest)
    assert.equal(release.approval.status, 'approved')
    assert.equal(release.approval.wordingDigest, release.wordingDigest)
    assert.equal(release.approval.reference, 'USER-CONFIRMED-PRETORIA-20261004')
    assert.equal(release.approval.counselApprover, 'thread:user-confirmed-counsel-approval')
    assert.equal(SELLER_MANDATE_AGENCY_APPROVALS.length, 0)
    assert.match(buildSellerMandateDocumentMarkup({ signingPack: createMandateReviewFixture(type), approval }), /data-mandate-signing-copy="full-v1"/)
    await assert.rejects(createMandateSigningContract(createMandateReviewFixture(type)), /exact contracting-agency schedules/)
  }
})

test('full signing copies bind all inputs, exact wording and both Dual acceptances without changing FICA signers', async () => {
  const runtime = await createSyntheticMandateSigningRuntime()
  for (const type of ['sole', 'open', 'dual']) {
    const signingPack = structuredClone(runtime.packs[type]), api = runtime.api
    const generatedHtml = api.buildSellerMandateDocumentMarkup({ signingPack, generatedAt: signingPack.frozenAt })
    const frozen = await api.createSellerReviewedDocumentVersions({ manualSigningPack: { generatedAt: signingPack.frozenAt, documents: [{ key: 'signed_mandate', generatedHtml }, { key: 'signed_fica_declaration', generatedHtml: '<p>FICA</p>' }] },
      formalPackApproval: { ...approval, signingRoute: 'digital_pack' }, signingPack, actor: 'agent-1' })
    const [document, fica] = frozen.documents
    assert.equal(document.requiredSigners.length, type === 'dual' ? 4 : 3)
    assert.equal(fica.requiredSigners.length, 2)
    assert.equal(document.mandateContract.markdown, runtime.releases[type].markdown)
    assert.equal(document.mandateContract.inputs.mandate.protectionPeriod, '60')
    assert.match(generatedHtml, /data-mandate-signing-copy="full-v1"/)
    assert.doesNotMatch(generatedHtml, /DRAFT - NOT FOR SIGNATURE|Signature - review draft only/)
    assert.equal(await api.verifySellerReviewedDocumentVersion(document), true)
    assert.equal(mandateCertificatesCurrent(document.mandateContract, '2028-01-01'), false)
    signingPack.branding.organisationName = 'Changed agency'; signingPack.mandate.mandateCapture.agencyB.legalName = 'Changed'
    assert.equal(document.mandateContract.inputs.branding.organisationName, 'Alpha Property')
    for (const mutate of [copy => { copy.mandateContract.markdown += 'changed' }, copy => { copy.mandateContract.inputs.branding.primaryColour = '#000000' },
      copy => { copy.mandateContract.inputs.mandate.specialConditions = 'Changed' }, copy => { copy.mandateContract.requiredSigners.pop() },
      copy => { copy.requiredSigners.pop() }, copy => { delete copy.mandateContract },
      copy => { copy.mandateContract.agencyApproval.reference = 'Older template approval' }]) {
      const changed = structuredClone(document); mutate(changed)
      changed.versionDigest = await api.computeSellerReviewedDocumentVersionDigest(changed)
      assert.equal(await api.verifySellerReviewedDocumentVersion(changed), false)
    }
    const changed = structuredClone(document); changed.generatedHtml += '<p>Altered terms</p>'
    changed.contentDigest = await mandateDigest(changed.generatedHtml); changed.versionDigest = await api.computeSellerReviewedDocumentVersionDigest(changed)
    assert.equal(await api.verifySellerReviewedDocumentVersion(changed), false)
    const downgraded = structuredClone(document)
    downgraded.templateVersion = runtime.releases[type].version
    delete downgraded.mandateContract
    delete downgraded.mandateTerms.mandateCapture
    downgraded.generatedHtml = '<p>Legacy-looking substitute</p>'
    downgraded.requiredSigners = downgraded.requiredSigners.filter(signer => !signer.role.startsWith('Agency'))
    downgraded.contentDigest = await mandateDigest(downgraded.generatedHtml)
    downgraded.versionDigest = await api.computeSellerReviewedDocumentVersionDigest(downgraded)
    assert.equal(await api.verifySellerReviewedDocumentVersion(downgraded), false, 'A full-template version cannot silently downgrade to a legacy contract')
  }
})

test('missing evidence, amended agency schedules and duplicate Dual recipients cannot freeze', async () => {
  const { api, packs } = await createSyntheticMandateSigningRuntime()
  for (const mutate of [pack => { pack.mandateAcceptanceReview.disclosureVerified = false }, pack => { pack.mandateCapture = {} },
    pack => { pack.mandate.mandateCapture.agencyB.noticeAddress = 'Changed after counsel approval' },
    pack => { pack.mandate.mandateCapture.agencyB.representativeEmail = pack.signers[0].email }, pack => { pack.signers.pop() },
    pack => { pack.mandate.otherAgencyName = 'Different contracting agency' },
    pack => { pack.mandate.mandateCapture.agencyB.legalName = pack.mandate.mandateCapture.agencyA.legalName }]) {
    const pack = structuredClone(packs.dual); mutate(pack)
    if (pack.mandateCapture) pack.mandate.mandateCapture = pack.mandateCapture
    await assert.rejects(api.createMandateSigningContract(pack))
  }
})

test('freezes each seller document with its own SHA-256 identity and full signer matrix', async () => {
  const pack = await createSellerReviewedDocumentVersions({ manualSigningPack, formalPackApproval: approval, signingPack, actor: 'agent-1', approvedAt: '2026-09-27T12:00:00Z' })
  assert.deepEqual(pack.documents.map((document) => document.requirementKey), ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'])
  assert.equal(new Set(pack.documents.map((document) => document.versionId)).size, 3)
  for (const document of pack.documents) {
    assert.match(document.versionDigest, /^sha256:[0-9a-f]{64}$/)
    assert.equal(document.requiredSigners.length, 2)
    assert.equal(document.status, 'awaiting_signed_hard_copy')
    assert.equal(await verifySellerReviewedDocumentVersion(document), true)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, generatedHtml: `${document.generatedHtml} changed` }), false)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, sourceDraftFingerprint: 'changed' }), false)
  }
  assert.deepEqual(pack.documents[2].mandateTerms, signingPack.mandate)
  assert.equal(await verifySellerReviewedDocumentVersion({ ...pack.documents[2], requiredSigners: [pack.documents[2].requiredSigners[0]] }), false)
  assert.equal(await verifySellerReviewedDocumentVersion({ ...pack.documents[2], mandateTerms: { specialConditions: 'No early termination', propertyAddress: '1 Test Road', mandateType: 'sole' } }), true)
  const mandateReadiness = getSellerDocumentSigningRouteReadiness({
    documentKey: pack.documents[2].key,
    route: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD,
    onboardingSubmitted: true,
    agentReviewed: true,
    finalVersionId: pack.documents[2].versionId,
    finalVersionDigest: pack.documents[2].versionDigest,
    commercialTermsConfirmed: approval.commission.confirmed,
    requiredSigners: pack.documents[2].requiredSigners,
  })
  assert.equal(mandateReadiness.ready, true)
  const index = buildSellerReviewedDocumentVersionIndex(pack)
  assert.equal(index.documents[0].versionId, pack.documents[0].versionId)
  assert.equal(JSON.stringify(index).includes('<article>'), false)
})

test('approval requires the agent, every signer, distinct rows, and confirmed mandate terms', async () => {
  const prepare = (override = {}) => createSellerReviewedDocumentVersions({ manualSigningPack, formalPackApproval: approval, signingPack, actor: 'agent-1', ...override })
  await assert.rejects(prepare({ actor: '' }), /agent/)
  await assert.rejects(prepare({ signingPack: { signers: [{ name: 'Alex', role: '' }] } }), /every required seller signer/)
  await assert.rejects(prepare({ manualSigningPack: { documents: [manualSigningPack.documents[0], manualSigningPack.documents[0]] } }), /distinct requirement row/)
  await assert.rejects(prepare({ formalPackApproval: { ...approval, commission: { confirmed: false } } }), /commission and VAT/)
  const physicalWithoutEmail = await prepare({ signingPack: { ...signingPack, signers: [{ name: 'Alex Seller', role: 'Seller', email: '' }] } })
  assert.equal(physicalWithoutEmail.documents[0].requiredSigners[0].email, '')
  await assert.rejects(prepare({ formalPackApproval: { ...approval, signingRoute: 'digital_pack' }, signingPack: { ...signingPack, signers: [{ name: 'Alex Seller', role: 'Seller', email: '' }] } }), /distinct valid email/)
})

// Fixed vectors calculated independently with Node's SHA-256 implementation.
// They keep the serialization and already-approved legacy hashes stable.
const expectedDigests = {
  signed_disclosure_form: ['sha256:576de757f451069b7b63c92f623b3342aba701d757ea9879cce585e3fc340621', 'sha256:bd058ff784e28c9a0292987404490e0f36540a27fc202dd042fd860778e90769'],
  signed_fica_declaration: ['sha256:260d0cc33d9de2415cf0283325cdcca52785a9fb4e864e4d7f2fcbd06abc18ce', 'sha256:1d4cc00c1207ff3009725d498d6cf1cd7d741e93f4a229f7f97ea86452999bea'],
  signed_mandate: ['sha256:8b7c15fc66b9fc8e1a916adeb6ec4db603eff40f843e0b991113ca54d09ebc45', 'sha256:fc5ba53808589baea0aaec296f25871dba28e6e69ec294b1af29200693de8451'],
}
const prepareVersions = (overrides = {}) => createSellerReviewedDocumentVersions({ manualSigningPack, formalPackApproval: approval, signingPack, actor: 'agent-1', approvedAt: '2026-09-27T12:00:00Z', ...overrides })

for (const sourceFactsFingerprint of ['', 'test-captured-facts']) {
  test(`version hashes retain the fixed ${sourceFactsFingerprint ? 'captured-facts' : 'legacy'} format for every document`, async () => {
    const pack = await prepareVersions({ manualSigningPack: { documents: manualSigningPack.documents.map(document => ({ ...document, sourceFactsFingerprint })) } })
    for (const document of pack.documents) {
      assert.equal(document.versionDigest, expectedDigests[document.key][sourceFactsFingerprint ? 1 : 0])
      assert.equal(await computeSellerReviewedDocumentVersionDigest(document), document.versionDigest)
      assert.equal(await verifySellerReviewedDocumentVersion(document), true)
    }
  })
}

test('absent, empty and whitespace-only facts fingerprints preserve the old approved version', async () => {
  const pack = await prepareVersions()
  for (const document of pack.documents) {
    const absent = { ...document }
    delete absent.sourceFactsFingerprint
    assert.equal(await verifySellerReviewedDocumentVersion(absent), true)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, sourceFactsFingerprint: '   ' }), true)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, sourceFactsFingerprint: 'newly-added-facts' }), false)
  }
})

test('changed or removed facts cannot downgrade a newer copy to the legacy contract', async () => {
  const pack = await prepareVersions({ manualSigningPack: { documents: manualSigningPack.documents.map(document => ({ ...document, sourceFactsFingerprint: 'test-captured-facts' })) } })
  const index = buildSellerReviewedDocumentVersionIndex(pack)
  for (const document of pack.documents) {
    assert.equal(index.documents.find(row => row.key === document.key).sourceFactsFingerprint, 'test-captured-facts')
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, sourceFactsFingerprint: '' }), false)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, sourceFactsFingerprint: 'changed-facts' }), false)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, versionDigest: expectedDigests[document.key][0] }), false)
  }
})

test('object key ordering is stable while signer order and authority remain bound to the reviewed copy', async () => {
  const pack = await prepareVersions()
  for (const document of pack.documents) {
    const reordered = { ...document, requiredSigners: document.requiredSigners.map(signer => ({ email: signer.email, role: signer.role, name: signer.name })) }
    assert.equal(await verifySellerReviewedDocumentVersion(reordered), true)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, requiredSigners: [...document.requiredSigners].reverse() }), false)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, requiredSigners: document.requiredSigners.map(signer => ({ ...signer, role: 'Different authority' })) }), false)
  }
})

test('preparing a new FICA version preserves unselected legacy copies and approved history', async () => {
  const existing = await prepareVersions()
  for (const document of existing.documents) delete document.sourceFactsFingerprint
  const before = structuredClone(existing)
  const updated = await prepareVersions({ existing, formalPackApproval: { ...approval, selectedDocuments: ['fica'] }, manualSigningPack: {
    documents: existing.documents.map(document => document.key === 'signed_fica_declaration'
      ? { ...manualSigningPack.documents[1], sourceFactsFingerprint: 'test-captured-facts' } : document),
  } })
  assert.deepEqual(existing, before)
  assert.deepEqual(updated.history[0].documents, before.documents)
  for (const key of ['signed_disclosure_form', 'signed_mandate']) {
    assert.deepEqual(updated.documents.find(row => row.key === key), before.documents.find(row => row.key === key))
  }
  const fica = updated.documents.find(row => row.key === 'signed_fica_declaration')
  assert.notEqual(fica.versionId, before.documents[1].versionId)
  assert.equal(fica.versionDigest, expectedDigests.signed_fica_declaration[1])
})

test('FICA-only preparation preserves exact frozen full mandates across preparation times and wording renewal', async () => {
  const runtime = await createSyntheticMandateSigningRuntime()
  const next = await createSyntheticMandateSigningRuntime({ archiveRuntime: runtime })
  for (const type of ['sole', 'open', 'dual']) {
    const signingPack = structuredClone(runtime.packs[type])
    const mandateApproval = { ...approval, signingRoute: 'digital_pack', selectedDocuments: ['mandate'] }
    const original = runtime.api.createSellerOnboardingSigningCopyPack({ signingPack, formalPackApproval: mandateApproval,
      disclosureSigned: true, generatedAt: signingPack.frozenAt })
    const frozen = await runtime.api.createSellerReviewedDocumentVersions({ manualSigningPack: original,
      formalPackApproval: mandateApproval, signingPack, actor: 'agent-1' })
    original.documents = frozen.documents
    const before = structuredClone(original), mandate = original.documents[0]
    assert.notEqual(next.releases[type].wordingDigest, mandate.mandateContract.wordingDigest)
    assert.equal(await next.api.verifySellerReviewedDocumentVersion(mandate), true)
    assert.equal(await next.api.isCurrentMandateSigningContract(mandate.mandateContract), false)
    assert.equal(next.api.buildSellerMandateFrozenDocumentMarkup(mandate.mandateContract), mandate.generatedHtml)
    await assert.rejects(next.api.createMandateSigningContract(signingPack), /business and legal approval/)
    signingPack.frozenAt = '2026-10-05T14:00:00Z'
    const ficaApproval = { ...mandateApproval, selectedDocuments: ['fica'] }
    const fresh = next.api.createSellerOnboardingSigningCopyPack({ existing: original, signingPack,
      formalPackApproval: ficaApproval, disclosureSigned: true, generatedAt: signingPack.frozenAt,
      postOnboardingDrafts: { documents: [{ key: 'signed_fica_declaration', generatedHtml: '<p>New FICA only</p>' }] } })
    const updated = await next.api.createSellerReviewedDocumentVersions({ existing: frozen, manualSigningPack: fresh,
      formalPackApproval: ficaApproval, signingPack, actor: 'agent-1' })
    assert.deepEqual(updated.documents.find(document => document.key === 'signed_mandate'), mandate)
    assert.deepEqual(updated.history[0].documents, frozen.documents)
    assert.deepEqual(original, before)
    for (const mutate of [pack => { pack.property.address = 'Changed property' }, pack => { pack.branding.organisationName = 'Changed brand' },
      pack => { pack.mandate.protectionPeriod = '0' }, pack => { pack.signers[0].email = 'changed@example.com' },
      pack => { pack.mandate.mandateCapture.agencyA.noticeEmail = 'changed@example.com' }]) {
      const changed = structuredClone(signingPack); mutate(changed)
      assert.throws(() => next.api.createSellerOnboardingSigningCopyPack({ existing: original, signingPack: changed,
        formalPackApproval: ficaApproval, disclosureSigned: true,
        postOnboardingDrafts: { documents: [{ key: 'signed_fica_declaration', generatedHtml: '<p>New FICA</p>' }] } }), /mandate details changed/)
      await assert.rejects(next.api.createSellerReviewedDocumentVersions({ manualSigningPack: fresh,
        formalPackApproval: ficaApproval, signingPack: changed, actor: 'agent-1' }), /changed|signers/)
    }
    const unsupported = structuredClone(mandate)
    unsupported.mandateContract.version += '-unregistered'
    unsupported.versionDigest = await next.api.computeSellerReviewedDocumentVersionDigest(unsupported)
    assert.equal(await next.api.verifySellerReviewedDocumentVersion(unsupported), false)
    unsupported.mandateContract = { ...mandate.mandateContract, wordingApproval: { ...mandate.mandateContract.wordingApproval, reference: 'Self-approved' } }
    unsupported.versionDigest = await next.api.computeSellerReviewedDocumentVersionDigest(unsupported)
    assert.equal(await next.api.verifySellerReviewedDocumentVersion(unsupported), false)
  }
})

test('FICA-only preparation retains legacy copies without facts hashes and treats sole/exclusive as the same recorded mandate', async () => {
  for (const createPack of ['createSellerOnboardingManualSigningPack', 'createSellerOnboardingSigningCopyPack']) {
    const { [createPack]: prepare } = await import('../sellerOnboardingManualSigningPack.js')
    const originalPack = { ...signingPack, mandate: { ...signingPack.mandate, mandateType: 'exclusive' } }
    const original = await prepareVersions({ signingPack: originalPack })
    const mandate = original.documents.find(document => document.key === 'signed_mandate')
    delete mandate.sourceFactsFingerprint
    const before = structuredClone(mandate)
    const fresh = prepare({ existing: { documents: [mandate] }, formalPackApproval: { ...approval, selectedDocuments: ['fica'] },
      signingPack, formData: { propertyDisclosure: { signature: 'Alex', signedAt: '2026-10-04' }, sellerComplianceSigning: { complete: true } },
      disclosureSigned: true, postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<p>New FICA</p>' }] } })
    const updated = await prepareVersions({ manualSigningPack: fresh, formalPackApproval: { ...approval, selectedDocuments: ['fica'] } })
    assert.deepEqual(updated.documents.find(document => document.key === 'signed_mandate'), before)
    assert.equal(await verifySellerReviewedDocumentVersion(mandate), true)
    assert.equal(mandate.mandateTerms.mandateType, 'exclusive')
    const snapshot = { ...originalPack, branding: { organisationName: 'Historical Agency' }, seller: { name: 'Alex Seller', idNumber: '123' }, property: { titleDeedNumber: 'OLD-DEED' } }
    const input = { existing: { documents: [mandate], signingPackSnapshot: snapshot }, formalPackApproval: { ...approval, selectedDocuments: ['fica'] },
      signingPack: snapshot, disclosureSigned: true,
      formData: { propertyDisclosure: { signature: 'Alex', signedAt: '2026-10-04' }, sellerComplianceSigning: { complete: true } },
      postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<p>New FICA</p>' }] } }
    assert.doesNotThrow(() => prepare(input))
    assert.throws(() => prepare({ ...input, signingPack: { ...snapshot, seller: { ...snapshot.seller, idNumber: 'Changed ID' } } }), /mandate details changed/)
    assert.throws(() => prepare({ ...input, signingPack: { ...snapshot, property: { titleDeedNumber: 'Changed Deed' } } }), /mandate details changed/)
    await assert.rejects(prepareVersions({ manualSigningPack: fresh, formalPackApproval: { ...approval, selectedDocuments: ['fica'] },
      signingPack: { ...signingPack, mandate: { ...signingPack.mandate, mandateType: 'open' } } }), /mandate terms changed/)
  }
})
