import { assertBondApplicationSigningAvailable } from '../src/modules/bond/application/submission/bondApplicationSigningAvailability.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { syncSellerDocumentRequirements as syncSellerDocumentRequirementsFromEngine } from '../src/lib/privateListingRequirementEngine.js'
import { getSellerBasePackAliases } from '../src/lib/sellerBasePackContract.js'
import { parse } from '@babel/parser'
import { retiredDocumentGenerator } from '../../supabase/functions/_shared/retiredDocumentGenerator.ts'
import { assertDocumentGeneratorAvailable, RETIRED_DOCUMENT_FUNCTIONS } from '../src/core/documents/documentGeneratorRetirement.js'
import { buildKingstonsDigitalSigningDecision } from '../src/core/kingstons/digitalSigningDecision.js'
import { buildKingstonsBuyerOtpDigitalDecision } from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'
import { runRecoverableDocumentUpload } from '../src/lib/documentUploadRecovery.js'
import { buildPrivateListingDocumentPersistenceReceipt } from '../src/services/listings/listingSellerDocumentPersistenceModel.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function functionSource(path, name) {
  const source = read(path)
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const node = ast.program.body.map(node => node.declaration || node).find(node => node.id?.name === name)
  assert.ok(node, name)
  return source.slice(node.start, node.end)
}

test('all retired endpoints refuse requests without database, storage or renderer dependencies', async () => {
  const config = read('../../supabase/config.toml')
  for (const name of RETIRED_DOCUMENT_FUNCTIONS) {
    const entry = read(`../../supabase/functions/${name}/index.ts`)
    assert.match(entry, /Deno\.serve\(retiredDocumentGenerator\)/)
    assert.equal((entry.match(/import /g) || []).length, 1)
    assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+enabled = false`))
    for (const method of ['GET', 'POST']) {
      const response = retiredDocumentGenerator(new Request(`https://example.test/${name}`, { method }))
      assert.equal(response.status, 410)
      assert.equal((await response.json()).retryable, false)
    }
  }
  assert.equal(retiredDocumentGenerator(new Request('https://example.test', { method: 'OPTIONS' })).status, 204)
})

test('seller and OTP generator actions are retired for every organisation', () => {
  for (const isKingstons of [false, true]) {
    for (const decision of [buildKingstonsDigitalSigningDecision, buildKingstonsBuyerOtpDigitalDecision]) {
      const result = decision({ isKingstons })
      assert.equal(result.blocked, true)
      assert.equal(result.status, 'retired')
    }
  }
})

test('stale callers fail before attempting any database work', async () => {
  for (const [path, names] of [
    ['../src/services/privateListingService.js', ['precreateSellerMandateDraftFromOnboarding']],
    ['../src/core/documents/packetService.js', ['generatePacketVersion', 'savePacketDraft', 'generateSigningLinks', 'generateFinalSignedPacketDocument']],
    ['../src/lib/documentPacketsApi.js', ['createDocumentPacket', 'createDocumentPacketVersion', 'createEditableDocumentDraftFromTemplate', 'claimDocumentPacketGenerationLease', 'completePhysicalSignedPacketUpload']],
  ]) {
    for (const name of names) {
      const fn = vm.runInNewContext(`(${functionSource(path, name)})`, { assertDocumentGeneratorAvailable })
      await assert.rejects(fn(), { code: 'document_generator_retired' })
    }
  }
})

test('retired function invocation never reaches a network client', async () => {
  const policy = await import('../src/core/documents/documentGeneratorRetirement.js')
  const invoke = vm.runInNewContext(`(${functionSource('../src/lib/supabaseClient.js', 'invokeEdgeFunction')})`, policy)
  for (const name of RETIRED_DOCUMENT_FUNCTIONS) {
    const result = await invoke(name, { client: new Proxy({}, { get() { throw Error('network client touched') } }) })
    assert.equal(result.error.code, 'document_generator_retired')
  }
})

test('onboarding and signed-upload services do not import generator services or schedule drafts', () => {
  const source = read('../src/services/privateListingService.js')
  assert.doesNotMatch(source, /import\(['"][^'"]*(?:packetService|documentPacketsApi)/)
  assert.doesNotMatch(source, /deferSellerOnboardingFollowUp\('mandate editable draft/)
  for (const name of ['uploadPrivateListingDocument', 'uploadSellerClientPortalDocument']) {
    assert.doesNotMatch(functionSource('../src/services/privateListingService.js', name), /assertDocumentGeneratorAvailable|generatePacket|createDocumentPacket|completePhysicalSignedPacketUpload/)
  }
  const app = read('../src/App.jsx')
  assert.doesNotMatch(app, /import\(['"][^'"]*(?:LegalDocumentWorkspacePage|SignerPortal|SettingsSigningTemplatesPage)/)
  assert.match(read('../src/pages/SellerOnboarding.jsx'), /buildPropertyDisclosureDocumentMarkup/)
})

test('signed mandate and OTP uploads persist files and requirement links with no generator available', async () => {
  for (const documentType of ['signed_mandate', 'signed_otp']) {
    let savedDocument
    let savedListing
    let requirementStatus
    let promotedDocumentId
    const requirement = { id: 'requirement-1', requirement_key: documentType }
    const upload = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'uploadPrivateListingDocument')})`, {
      runRecoverableDocumentUpload, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
      requireClient: () => ({ rpc: async (name, parameters) => {
        assert.equal(name, 'bridge_promote_private_listing_document_row')
        promotedDocumentId = parameters.p_private_listing_document_id
        return { data: { promotion_status: 'promoted' }, error: null }
      } }),
      getCurrentUser: async () => ({ id: 'agent-1' }),
      normalizeUuid: value => String(value || ''),
      normalizeText: value => String(value || ''),
      normalizeCompatibilityKey: value => String(value || ''),
      validateDocumentUploadFile: file => ({ safeName: file.name }),
      getPrivateListingById: async () => ({ id: 'listing-1' }),
      sanitizeDocumentFileName: value => value,
      uploadToPrivateListingDocumentsBucket: async () => 'documents',
      getPrivateListingDocumentRequirements: async () => [requirement],
      resolvePrivateListingDocumentRequirement: () => requirement,
      privateListingDocumentKeysOverlap: (a, b) => a === b,
      isMandateDocumentRow: row => row.document_type === 'signed_mandate',
      insertPrivateListingDocumentRow: async (_, row) => {
        savedDocument = row
        return { data: { ...row, id: 'document-1' } }
      },
      normalizeDocumentRows: rows => rows,
      buildPrivateListingDocumentPersistenceReceipt,
      updatePrivateListingRequirementStatus: async (_, status) => { requirementStatus = status; return true },
      updatePrivateListing: async (_, listing) => { savedListing = listing },
      recordSellerMandateSignedWorkflowStage: async () => true,
      createPrivateListingActivity: async () => null,
      syncSellerJourneyLeadStageForListingId: async () => true,
      createPrivateListingDocumentSignedUrl: async () => 'https://example.test/signed-file',
    })
    const result = await upload('listing-1', { name: `${documentType}.pdf`, type: 'application/pdf' }, {
      requirementId: requirement.id, requirementKey: documentType, documentType,
    })
    assert.equal(result.id, 'document-1')
    assert.equal(result.requirementId, requirement.id)
    assert.equal(savedDocument.document_type, documentType)
    assert.equal(promotedDocumentId, 'document-1')
    assert.equal(requirementStatus, 'uploaded')
    assert.equal(result.url, 'https://example.test/signed-file')
    if (documentType === 'signed_mandate') assert.equal(savedListing.mandateStatus, 'signed_uploaded')
    else assert.equal(savedListing, undefined)
  }
})


test('bond signing refuses before accessing clients, writing submissions or creating signing links', async () => {
  for (const name of ['prepareClientPortalBondApplicationSubmission', 'prepareClientPortalJointBondApplicationSubmission', 'createOrReuseBondApplicationSigningPacket']) {
    const fn = vm.runInNewContext(`(${functionSource('../src/lib/api.js', name)})`, { assertBondApplicationSigningAvailable })
    await assert.rejects(fn(), { code: 'bond_application_signing_unavailable' })
  }
})

test('seller upload preflight refuses unreadable or missing requirements before Storage is touched', async () => {
  const resolveRequirement = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'resolvePrivateListingDocumentRequirement')})`, {
    normalizeUuid: value => String(value || ''), normalizeCompatibilityKey: value => String(value || ''),
    getPrivateListingDocumentMatchAliases: key => [key],
  })
  for (const unreadable of [false, true]) {
    let storageCalls = 0
    const upload = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'uploadPrivateListingDocument')})`, {
      runRecoverableDocumentUpload, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
      requireClient: () => ({}), getCurrentUser: async () => ({ id: 'agent' }),
      normalizeUuid: value => String(value || ''), normalizeCompatibilityKey: value => String(value || ''),
      validateDocumentUploadFile: file => ({ safeName: file.name }), getPrivateListingById: async () => ({ id: 'listing' }),
      getPrivateListingDocumentRequirements: async () => { if (unreadable) throw Error('Checklist unavailable'); return [] },
      resolvePrivateListingDocumentRequirement: resolveRequirement,
      sanitizeDocumentFileName: value => value,
      uploadToPrivateListingDocumentsBucket: async () => { storageCalls++; throw Error('Storage touched') },
    })
    await assert.rejects(upload('listing', { name:'company.pdf' }, { requirementKey:'cipc_documents', documentType:'cipc_documents' }), unreadable ? /Checklist unavailable/ : /No active seller requirement/)
    assert.equal(storageCalls, 0)
    if (!unreadable) {
      await assert.rejects(upload('listing', { name:'offer.pdf' }, { requirementKey:'wet_ink_otp_buyer_offer',documentType:'wet_ink_otp_buyer',documentCategory:'buyer_offer',visibility:'internal' }), error => error.code === 'document_save_unconfirmed' && error.cause?.message === 'Storage touched')
      assert.equal(storageCalls, 1)
    }
  }
})

test('schema fallback cannot discard persisted requirement identity', async () => {
  const insert = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'insertPrivateListingDocumentRow')})`, {
    getMissingPrivateListingDocumentInsertColumn: error => error.column,
  })
  for (const column of ['requirement_id', 'canonical_requirement_instance_id']) {
    const attempts = []
    const error = { column, code:'PGRST204' }
    const client = { from: () => ({ insert(payload) { attempts.push(payload); return { select: () => ({ single: async () => ({ error }) }) } } }) }
    const result = await insert(client, { requirement_id:'requirement', canonical_requirement_instance_id:'canonical' }, { requiredColumns:['requirement_id','canonical_requirement_instance_id'] })
    assert.equal(result.error, error)
    assert.equal(attempts.length, 1)
    assert.equal(attempts[0][column], column === 'requirement_id' ? 'requirement' : 'canonical')
  }
})

test('listing intake mandate evidence persists without a checklist and never completes the signed mandate', async () => {
  for (const requirements of [[], [{ id: 'signed-request', requirement_key: 'signed_mandate', status: 'required' }]]) {
    const persisted = []
    let checklistWrites = 0
    let mandateWrites = 0
    const upload = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'uploadPrivateListingDocument')})`, {
      runRecoverableDocumentUpload, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
      requireClient: () => ({ rpc: async () => ({ data: { promotion_status: 'no_transaction', pending_transaction_promotion: true } }) }),
      getCurrentUser: async () => ({ id: 'agent' }), normalizeUuid: value => String(value || ''),
      normalizeText: value => String(value || ''), normalizeCompatibilityKey: value => String(value || ''),
      validateDocumentUploadFile: file => ({ safeName: file.name }), getPrivateListingById: async () => ({ id: 'listing' }),
      getPrivateListingDocumentRequirements: async () => requirements,
      resolvePrivateListingDocumentRequirement: () => { throw Error('Intake evidence must not borrow a signed-mandate request') },
      sanitizeDocumentFileName: value => value, uploadToPrivateListingDocumentsBucket: async () => 'documents',
      isMandateDocumentRow: row => row.document_type !== 'manual_mandate_evidence' && row.document_type.includes('mandate'),
      insertPrivateListingDocumentRow: async (_, row) => { persisted.push({ ...row, id: 'evidence' }); return { data: persisted[0] } },
      normalizeDocumentRows: rows => rows, buildPrivateListingDocumentPersistenceReceipt,
      updatePrivateListingRequirementStatus: async () => { checklistWrites++; return true },
      updatePrivateListing: async () => { mandateWrites++ }, recordSellerMandateSignedWorkflowStage: async () => { mandateWrites++ },
      createPrivateListingActivity: async () => null, syncSellerJourneyLeadStageForListingId: async () => true,
      createPrivateListingDocumentSignedUrl: async () => 'https://example.test/internal-mandate',
    })
    const result = await upload('listing', { name: 'mandate.pdf', type: 'application/pdf', lastModified: requirements.length }, {
      documentType: 'manual_mandate_evidence', documentCategory: 'Mandate evidence', visibility: 'internal',
    })
    assert.equal(result.id, 'evidence')
    assert.equal(result.persistence.recordVerified, true)
    assert.equal(result.persistence.requirementStatus, 'not_applicable')
    assert.equal(result.url, 'https://example.test/internal-mandate')
    assert.equal(persisted[0].document_type, 'manual_mandate_evidence')
    assert.equal(persisted[0].visibility, 'internal')
    assert.equal(persisted[0].requirement_id, null)
    assert.equal(checklistWrites, 0)
    assert.equal(mandateWrites, 0)
    // A reloaded document query reads the durable row, including its private
    // file location, rather than relying on a selected filename in form state.
    assert.ok(persisted[0].storage_path.includes('/listing/documents/'))
  }
})


test('mandate and FICA uploads prepare a missing saved-model target before Storage without replacing protected requests', async () => {
  const listingId = '11111111-1111-4111-8111-111111111111'
  const requirementId = '22222222-2222-4222-8222-222222222222'
  const staleId = '33333333-3333-4333-8333-333333333333'
  const normalizeUuid = value => /^[a-f0-9-]{36}$/i.test(String(value || '')) ? String(value) : ''
  const normalizeKey = value => String(value || '').trim().toLowerCase()
  const resolve = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'resolvePrivateListingDocumentRequirement')})`, {
    normalizeUuid, normalizeCompatibilityKey: normalizeKey,
    getPrivateListingDocumentMatchAliases: getSellerBasePackAliases,
  })
  for (const requirementKey of ['signed_mandate', 'signed_fica_declaration']) {
    for (const mode of ['missing', 'existing', 'existing_alias', 'retired', 'retired_alias', 'stale_id', 'frozen_copy', 'unknown_owner', 'early_intake', 'ensure_failed', 'ensure_unavailable', 'unreadable']) {
      const calls = []
      let matched
      const retired = mode.startsWith('retired')
      const signingRequest = { id: requirementId, requirement_key: mode.endsWith('_alias') ? getSellerBasePackAliases(requirementKey).find(key => key !== requirementKey) : requirementKey, status: retired ? 'not_applicable' : 'required', is_required: !retired }
      const stored = ['existing', 'existing_alias', 'retired', 'retired_alias'].includes(mode) ? [signingRequest] : [{ id: staleId, requirement_key: 'seller_onboarding_submission', status: 'requested', is_required: true }]
      const listing = { id: listingId, listingStatus: mode === 'early_intake' ? 'seller_lead' : 'onboarding_completed', sellerType: mode === 'unknown_owner' ? 'unknown' : 'company' }
      const upload = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'uploadPrivateListingDocument')})`, {
        requireClient: () => ({}), getCurrentUser: async () => ({ id: 'agent' }), normalizeUuid,
        normalizeCompatibilityKey: normalizeKey, normalizeText: normalizeKey,
        validateDocumentUploadFile: file => ({ safeName: file.name }),
        getPrivateListingById: async () => listing,
        getPrivateListingDocumentRequirements: async () => { if (mode === 'unreadable') throw Error('Checklist unavailable'); return stored },
        getPrivateListingDocumentMatchAliases: getSellerBasePackAliases,
        syncSellerDocumentRequirementsFromEngine,
        ensurePrivateListingDocumentRequirements: async (id, rows, options) => {
          assert.equal(id, listingId)
          assert.equal(rows.length, 1)
          assert.equal(rows[0].requirement_key, requirementKey)
          assert.equal(options.reason, 'agent_seller_signing_upload_preflight')
          calls.push('prepare_exact_target')
          if (mode === 'ensure_failed') throw Error('Checklist save denied')
          return mode === 'ensure_unavailable' ? stored : [...stored, signingRequest]
        },
        resolvePrivateListingDocumentRequirement: (rows, options) => { matched = resolve(rows, options); calls.push('resolved'); return matched },
        sanitizeDocumentFileName: value => value,
        DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
        runRecoverableDocumentUpload: async () => { calls.push('Storage'); return { requirementId: matched.id } },
      })
      const options = { requirementKey, documentType: requirementKey, requirementId: mode === 'stale_id' ? staleId : '', reviewedSigningVersionId: mode === 'frozen_copy' ? 'version-1' : '', reviewedSigningVersionDigest: mode === 'frozen_copy' ? 'digest-1' : '' }
      if (['missing', 'existing', 'existing_alias'].includes(mode)) {
        const result = await upload(listingId, { name: `${requirementKey}.pdf` }, options)
        assert.equal(result.requirementId, requirementId)
        assert.deepEqual(calls, mode === 'missing' ? ['prepare_exact_target', 'resolved', 'Storage'] : ['resolved', 'Storage'])
      } else {
        await assert.rejects(upload(listingId, { name: `${requirementKey}.pdf` }, options), /No active seller requirement|unavailable|does not match|checklist is not ready|Checklist save denied/)
        assert.equal(calls.includes('Storage'), false, mode)
        if (!['ensure_failed', 'ensure_unavailable'].includes(mode)) assert.equal(calls.includes('prepare_exact_target'), false, mode)
      }
    }
  }
})


test('listing preparation offers the agency-upload route without requiring or overwriting Arch9 mandate terms', async () => {
  const { validateSellerOnboardingFormalSigningSelection } = await import('../src/core/documents/sellerOnboardingFormalSigningPack.js')
  const { createSellerOnboardingFormalPackApproval } = await import('../src/core/documents/sellerOnboardingFormalPackApproval.js')
  const { createSellerOnboardingSigningCopyPack } = await import('../src/core/documents/sellerOnboardingManualSigningPack.js')
  const { createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex } = await import('../src/core/documents/sellerReviewedDocumentVersions.js')
  const source = read('../src/pages/AgentListingDetail.jsx')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const find = node => {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'saveSellerDocumentSendSelection') return node
    for (const child of Object.values(node)) {
      const found = Array.isArray(child) ? child.map(find).find(Boolean) : find(child)
      if (found) return found
    }
    return null
  }
  const node = find(ast)
  assert.ok(node)
  const handler = source.slice(node.start, node.end)
  for (const mode of ['agency_upload', 'arch9_generated', 'unselected', 'unreviewed', 'save_failed']) {
    const calls = [], errors = [], messages = []
    let saved
    const form = { sellerOnboardingReview: { status: mode === 'unreviewed' ? 'pending' : 'approved' },
      mandateType: 'exclusive', commissionPercentage: '7', protectionPeriod: '', mandateCapture: {},
      sellerName: 'Synthetic Seller', sellerEmail: 'seller@example.test' }
    const before = structuredClone(form)
    const listing = { id: '11111111-1111-4111-8111-111111111111', sellerOnboardingStatus: 'completed', sellerOnboarding: { formData: form } }
    const signingPack = { seller: { name: form.sellerName }, signers: [{ name: form.sellerName, role: 'Seller', email: form.sellerEmail }], mandate: { mandateType: 'exclusive', mandateCapture: {} } }
    const setters = Object.fromEntries(['setSellerDocumentSendSaving', 'setSellerDocumentSendOpen', 'setMandateReplacementIntent'].map(name => [name, () => {}]))
    const save = vm.runInNewContext(`(${handler})`, {
      ...setters, ONLINE_SIGNING_DISABLED: true, sellerMandateSignatureRoute: 'manual_upload', listingRecord: listing,
      sellerMandateDocumentSource: mode === 'unselected' ? '' : mode === 'arch9_generated' ? mode : 'agency_upload',
      sellerDocumentSendSelection: { fica: true, mandate: mode === 'arch9_generated' }, mandateReplacementIntent: false,
      hasIdentifiedSellerEntity: () => true, getSellerSigningPlan: () => ({ recipients: signingPack.signers, ready: true }),
      getSellerSigningDocumentOptions: () => ({ documents: [{ key: 'fica', ready: true }, { key: 'mandate', ready: false }] }),
      validateSellerOnboardingFormalSigningSelection,
      getListingMandateReadiness: () => ({ ready: false, missing: ['Agency schedules are incomplete'] }),
      getListingSellerFormData: () => form, readSellerOnboardingReview: value => value,
      getSellerOnboardingReviewChecklist: () => ({ ready: true }),
      SELLER_ONBOARDING_REVIEW_STATUS: { approved: 'approved', correctionRequested: 'correction_requested' },
      commissionDraft: { basis: 'percentage', percentage: '', amount: '', vatHandling: '' }, marketingDraft: {},
      sellerDocumentReplacementGroupId: '', sellerDocumentReplacementReason: '', listingActor: { id: 'agent-1' }, profile: {},
      saveCommissionDraft: () => { throw Error('Agency-upload preparation must not save commission') },
      requireSellerMandateWording: () => { throw Error('Agency-upload preparation must not select Arch9 wording') },
      buildSellerSigningPackSnapshot: () => signingPack,
      createSellerOnboardingFormalPackApproval, createSellerOnboardingSigningCopyPack,
      createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex,
      buildSellerPostOnboardingDrafts: () => ({ documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>Reviewed FICA</article>' }] }),
      hasCompletedSellerDisclosure: () => true, sellerDocumentSource: { rows: [] },
      preferredTransferAttorneyOptions: [], preferredTransferAttorneyOptionId: '',
      createSellerOnboardingSigningLifecycle: value => ({ stage: value.stage, metadata: value.metadata }),
      SELLER_ONBOARDING_SIGNING_STAGES: { manualAwaitingUpload: 'manual_awaiting_upload', packPrepared: 'pack_prepared' },
      updatePrivateListing: () => { throw Error('Agency-upload preparation must not write mandate listing fields') },
      updatePrivateListingOnboardingFormData: async (id, data) => {
        assert.equal(id, listing.id)
        if (mode === 'save_failed') throw Error('Save failed')
        calls.push('saved'); saved = data
      },
      patchListing: callback => callback(listing),
      setSellerWorkspaceTab: value => calls.push(value),
      setDetailError: value => errors.push(value), setDetailMessage: value => messages.push(value),
    })
    await save()
    assert.deepEqual(form, before)
    if (mode === 'agency_upload') {
      assert.deepEqual(calls, ['saved', 'documents'])
      assert.deepEqual(errors, [])
      assert.match(messages[0], /Upload your agency.*signed mandate/)
      assert.equal(saved.sellerMandateDocumentSource, 'agency_upload')
      assert.deepEqual(saved.sellerOnboardingFormalPackApproval.selectedDocuments, ['fica'])
      assert.equal(saved.sellerOnboardingFormalPackApproval.commission.confirmed, false)
      assert.deepEqual(saved.sellerOnboardingManualSigningPack.documents.map(row => row.key), ['signed_fica_declaration'])
      assert.equal(saved.commissionPercentage, '7')
      assert.equal(saved.mandateType, 'exclusive')
      assert.equal(saved.protectionPeriod, '')
      assert.deepEqual(saved.mandateCapture, {})
      assert.equal(saved.manualMandateSignature, null)
    } else {
      assert.deepEqual(calls, [])
      assert.equal(saved, undefined)
      assert.equal(messages.length, 0)
      assert.ok(errors[0], mode)
    }
  }
})


test('the listing mandate choice has no forced default and both visible options update the actual selection', async () => {
  const React = await import('react')
  const { transformSync } = await import('esbuild')
  const source = read('../src/pages/AgentListingDetail.jsx')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const find = node => {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'JSXElement' && node.openingElement.name.name === 'fieldset' && source.slice(node.start, node.end).includes('Which mandate would you like to use?')) return node
    for (const child of Object.values(node)) {
      const found = Array.isArray(child) ? child.map(find).find(Boolean) : find(child)
      if (found) return found
    }
    return null
  }
  const node = find(ast)
  assert.ok(node)
  const code = transformSync(`const choice = (${source.slice(node.start, node.end)});`, { loader: 'jsx' }).code
  for (const mandateReplacementIntent of [false, true]) {
    const updates = []
    const tree = vm.runInNewContext(`${code}; choice`, { React, sellerDocumentSendSaving: false, sellerMandateDocumentSource: '', mandateReplacementIntent,
      setSellerMandateDocumentSource: value => updates.push(value), setSellerDocumentSendSelection: value => updates.push(value), setDetailError: () => {} })
    const controls = []
    const walk = element => {
      if (!element || typeof element !== 'object') return
      if (element.type === 'input') controls.push(element.props)
      React.Children.toArray(element.props?.children).forEach(walk)
    }
    walk(tree)
    assert.deepEqual(controls.map(input => input.value), ['arch9_generated', 'agency_upload'])
    assert.equal(controls.every(input => input.checked === false && input.type === 'radio'), true)
    controls[0].onChange()
    assert.equal(updates[0], 'arch9_generated')
    assert.equal(updates[1].mandate, true)
    assert.equal(updates[1].fica, !mandateReplacementIntent)
    controls[1].onChange()
    assert.equal(updates[2], 'agency_upload')
    assert.equal(updates[3].mandate, false)
    assert.equal(updates[3].fica, true)
  }
})
