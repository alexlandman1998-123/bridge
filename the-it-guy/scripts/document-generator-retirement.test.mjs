import { assertBondApplicationSigningAvailable } from '../src/modules/bond/application/submission/bondApplicationSigningAvailability.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import { retiredDocumentGenerator } from '../../supabase/functions/_shared/retiredDocumentGenerator.ts'
import { assertDocumentGeneratorAvailable, RETIRED_DOCUMENT_FUNCTIONS } from '../src/core/documents/documentGeneratorRetirement.js'
import { buildKingstonsDigitalSigningDecision } from '../src/core/kingstons/digitalSigningDecision.js'
import { buildKingstonsBuyerOtpDigitalDecision } from '../src/core/transactions/kingstonsBuyerOtpReadiness.js'

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
    const requirement = { id: 'requirement-1', requirement_key: documentType }
    const upload = vm.runInNewContext(`(${functionSource('../src/services/privateListingService.js', 'uploadPrivateListingDocument')})`, {
      requireClient: () => ({}),
      getCurrentUser: async () => ({ id: 'agent-1' }),
      normalizeUuid: value => String(value || ''),
      normalizeText: value => String(value || ''),
      normalizeCompatibilityKey: value => String(value || ''),
      validateDocumentUploadFile: file => ({ safeName: file.name }),
      getPrivateListingById: async () => ({ id: 'listing-1' }),
      sanitizeDocumentFileName: value => value,
      uploadToPrivateListingDocumentsBucket: async () => 'documents',
      getPrivateListingDocumentRequirements: async () => [requirement],
      privateListingDocumentKeysOverlap: (a, b) => a === b,
      isMandateDocumentRow: row => row.document_type === 'signed_mandate',
      insertPrivateListingDocumentRow: async (_, row) => {
        savedDocument = row
        return { data: { ...row, id: 'document-1' } }
      },
      normalizeDocumentRows: rows => rows,
      updatePrivateListingRequirementStatus: async (_, status) => { requirementStatus = status },
      updatePrivateListing: async (_, listing) => { savedListing = listing },
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
