import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import { createClient } from '@supabase/supabase-js'
import { getDocumentUploadPolicy, getDocumentUploadOptions, validateDocumentUploadFile, withDocumentUploadMimeType } from '../documentUploadPolicy.js'
import { runRecoverableDocumentUpload } from '../documentUploadRecovery.js'
import { uploadToStorageCandidateBuckets } from '../storageFallbacks.js'

const MB = 1024 * 1024
const profiles = [
  ['client_portal', 35], ['seller_portal', 35], ['agent_listing', 35],
  ['internal_transaction', 35], ['developer_portal', 35], ['commercial_document', 35],
  ['documents_storage', 35], ['development_image', 35], ['development_plan', 35], ['document_image', 35], ['signed_pdf', 35],
  ['development_asset', 35], ['signed_packet', 35], ['bank_statement', 35],
  ['rental_application', 8], ['rental_landlord', 8],
  ['recruitment_document', 10], ['recruitment_onboarding', 10],
  ['recruitment_contract', 10], ['recruitment_signed_contract', 10],
  ['fic_policy', 10], ['bond_signed_application', 25], ['legal_template', 25],
]
for (const [surface, limit] of profiles) {
  test(`${surface}: picker types, inferred MIME and inclusive ${limit} MB boundary`, () => {
    const policy = getDocumentUploadPolicy({ surface })
    assert.equal(policy.maxBytes, limit * MB)
    assert.match(policy.helpText, new RegExp(`${limit} MB`))
    assert.deepEqual(policy.accept.split(','), policy.extensions.map(extension => `.${extension}`))
    for (const extension of policy.extensions) {
      const file = { name: `evidence.${extension.toUpperCase()}`, type: '', size: limit * MB }
      const validated = validateDocumentUploadFile(file, { surface })
      assert.ok(policy.mimeTypes.includes(validated.mimeType))
      assert.equal(getDocumentUploadOptions(file, { surface, upsert: false }).contentType, validated.mimeType)
      assert.throws(() => validateDocumentUploadFile({ ...file, size: limit * MB + 1 }, { surface }), { code: 'document_file_too_large' })
    }
    for (const size of [0, -1, NaN, Infinity, 1.5]) {
      assert.throws(() => validateDocumentUploadFile({ name: `empty.${policy.extensions[0]}`, size }, { surface }), { code: 'document_file_empty' })
    }
  })
}

test('file type checks reject MIME mismatches, Excel and forged compound extensions', () => {
  for (const file of [
    { name: 'evidence.pdf', type: 'image/png' },
    { name: 'evidence.png', type: 'application/octet-stream' },
    { name: 'evidence.xlsx', type: '' },
    { name: 'evidence.xls', type: '' },
    { name: 'evidence.pdf.exe', type: 'application/pdf' },
  ]) assert.throws(() => validateDocumentUploadFile({ ...file, size: 100 }), /Unsupported|does not match/)
  for (const surface of ['fic_policy', 'bond_signed_application', 'recruitment_contract', 'signed_packet']) {
    assert.throws(() => validateDocumentUploadFile({ name: 'scan.jpg', type: 'image/jpeg', size: 100 }, { surface }), /Unsupported/)
  }
  assert.throws(() => validateDocumentUploadFile({ name: 'template.pdf', type: 'application/pdf', size: 100 }, { surface: 'legal_template' }), /Unsupported/)
  assert.throws(() => validateDocumentUploadFile({ name: 'image.webp', type: 'image/webp', size: 100 }), /Unsupported/)
  assert.throws(() => validateDocumentUploadFile({ name: 'evidence.pdf', type: '', size: 36 * MB }, { maxBytes: 50 * MB }), /35 MB/)
})

test('long names retain the extension and generated blobs use their storage filename', () => {
  const validated = validateDocumentUploadFile({ name: `folder/${'e'.repeat(180)}.pdf`, size: 100, type: '' })
  assert.equal(validated.safeName.length, 140)
  assert.ok(validated.safeName.endsWith('.pdf'))
  assert.ok(!validated.safeName.includes('/'))
  assert.equal(getDocumentUploadOptions(new Blob(['signature'], { type: 'image/png' }), { fileName: 'signature.png', upsert: false }).contentType, 'image/png')
})

test('local validation inside a recoverable upload remains a definite rejection on retry', async () => {
  const file = new File(['unsupported'], 'spreadsheet.xlsx')
  const client = { storage: { from: () => { throw new Error('Validation must precede Storage.') } } }
  const invoke = () => runRecoverableDocumentUpload({ client, file, scope: ['validation-retry'], run: async attempt => {
    attempt.path('documents/spreadsheet.xlsx')
    await attempt.upload(() => getDocumentUploadOptions(file))
  } })
  for (let retry = 0; retry < 2; retry++) {
    await assert.rejects(invoke, { code: 'document_file_type_invalid', status: 400 })
  }
})

test('the installed Supabase SDK sends the inferred MIME in its actual multipart file part', async () => {
  const requests = []
  const client = createClient('https://fixture.invalid', 'offline-fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      requests.push({ url, options })
      return new Response(JSON.stringify({ Id: 'fixture-id', Key: 'fixture-path' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } },
  })
  for (const extension of ['pdf', 'docx', 'png']) {
    const original = new File(['unchanged document bytes'], `evidence.${extension}`, { type: '', lastModified: 123 })
    const options = getDocumentUploadOptions(original, { upsert: false })
    const body = withDocumentUploadMimeType(original, options.contentType)
    const result = await client.storage.from('documents').upload(`scope/${original.name}`, body, options)
    assert.equal(result.error, null)
    const multipartFile = requests.at(-1).options.body.get('')
    assert.equal(multipartFile.type, options.contentType)
    assert.equal(multipartFile.name, original.name)
    assert.deepEqual(await multipartFile.arrayBuffer(), await original.arrayBuffer())
    assert.equal(body.lastModified, original.lastModified)
    assert.equal(original.type, '')
  }
  assert.equal(requests.length, 3)
})

// These services depend on browser-configured Supabase clients. Exercise their
// actual upload function bodies with a recording Storage client, as the existing
// recovery suite does, so this check cannot contact a live project.
function loadUploadFunction(relativePath, name, values) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start >= 0)
  const body = source.slice(start, source.indexOf('\n}\n', start) + 2)
  return compileFunction(`return (${body})`, Object.keys(values))(...Object.values(values))
}
const services = [
  ['../../services/developerDocumentPortalService.js', 'uploadDeveloperDocumentPortalFile', 'developer'],
  ['../../modules/commercial/services/commercialApi.js', 'uploadCommercialFile', 'commercial'],
  ['../../modules/commercial/services/commercialPortalApi.js', 'uploadPortalFile', 'portal'],
  ['../../modules/commercial/services/commercialOnboardingApi.js', 'uploadCommercialOnboardingPortalFile', 'portal'],
  ['../../modules/commercial/services/commercialLandlordService.js', 'uploadPortalFile', 'portal'],
  ['../api.js', 'uploadToDocumentsBucket', 'documents'],
  ['../api.js', 'uploadToBuyerPortalDocumentsBucket', 'documents'],
  ['../../services/privateListingService.js', 'uploadToPrivateListingDocumentsBucket', 'documents'],
]
for (const [path, name, kind] of services) {
  test(`${path} ${name}: validates before Storage and sends the inferred MIME`, async () => {
    const uploads = []
    const client = {
      storage: { from: bucket => ({ upload: async (path, file, options) => { uploads.push({ bucket, path, file, options }); return { data: { path }, error: null } } }) },
      rpc: async () => ({ data: { id: 'saved-document' }, error: null }),
    }
    const upload = loadUploadFunction(path, name, {
      validateDocumentUploadFile, getDocumentUploadOptions, withDocumentUploadMimeType, runRecoverableDocumentUpload, uploadToStorageCandidateBuckets,
      DOCUMENTS_BUCKET: 'documents', DOCUMENTS_BUCKET_CANDIDATES: ['documents'], COMMERCIAL_DOCUMENT_BUCKET_CANDIDATES: ['documents'],
      supabase: client, isSupabaseConfigured: true, requirePortalClient: () => client,
      createObjectPath: ({ fileName }) => `commercial/${fileName}`, safeFileName: value => value,
      retryStorageOperation: operation => operation(),
    })
    const invoke = file => kind === 'documents' ? upload(client, 'scope/evidence.pdf', file)
      : kind === 'portal' ? upload(client, { accessId: 'access', file })
        : upload({ file, token: 'test-token', portalId: 'portal', transactionId: 'transaction', organisationId: 'org', entityId: 'entity', entityType: 'listing' })
    await assert.rejects(() => invoke(new File(['bad'], 'spreadsheet.xlsx')), /Unsupported/)
    await assert.rejects(() => invoke({ name: 'oversized.pdf', type: 'application/pdf', size: 35 * MB + 1 }), /35 MB/)
    await assert.rejects(() => invoke(new File(['mismatch'], 'evidence.pdf', { type: 'image/png' })), /does not match/)
    assert.equal(uploads.length, 0)
    await invoke(new File(['%PDF-1.4 evidence'], 'evidence.pdf', { type: '' }))
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0].options.contentType, 'application/pdf')
    assert.equal(uploads[0].file.type, 'application/pdf')
  })
}

test('FIC policy rejects empty or mismatched files before Storage and accepts a PDF with no browser MIME', async () => {
  const uploads = []
  const client = { storage: { from: () => ({ upload: async (...args) => { uploads.push(args); return {} } }) } }
  const publish = loadUploadFunction('../../services/branchFicTrainingService.js', 'publishFicPolicy', {
    validateDocumentUploadFile, withDocumentUploadMimeType, runRecoverableDocumentUpload,
    client: () => client, rpc: async () => 'policy-id',
  })
  const input = { version: 'v1', title: 'Policy', owner: 'Compliance officer' }
  await assert.rejects(() => publish('org', { ...input, file: new File([], 'policy.pdf') }), /empty/)
  await assert.rejects(() => publish('org', { ...input, file: new File(['bad'], 'policy.pdf', { type: 'image/png' }) }), /does not match/)
  assert.equal(uploads.length, 0)
  assert.equal(await publish('org', { ...input, file: new File(['%PDF-1.4'], 'policy.pdf') }), 'policy-id')
  assert.equal(uploads[0][2].contentType, 'application/pdf')
  assert.equal(uploads[0][1].type, 'application/pdf')
})

test('DOCX template upload checks size, extension and MIME before Storage and infers its canonical type', async () => {
  const uploads = []
  const client = { storage: { from: () => ({
    upload: async (...args) => { uploads.push(args); return {} },
    createSignedUrl: async () => ({ data: { signedUrl: 'https://fixture.invalid/template' } }),
    getPublicUrl: () => ({ data: {} }),
  }) } }
  const upload = loadUploadFunction('../documentPacketsApi.js', 'uploadDocumentPacketTemplateAsset', {
    validateDocumentUploadFile, withDocumentUploadMimeType, uploadToStorageCandidateBuckets, requireClient: () => client,
    resolvePacketContext: async () => ({ organisationId: 'org', isOrgAdmin: true }),
    normalizeFileExtension: name => name.split('.').at(-1),
    assertPacketType: value => value, normalizeText: value => String(value || '').trim(),
    normalizeTemplateKey: value => value, normalizeStorageSafeName: value => value,
    LEGAL_TEMPLATES_BUCKET_CANDIDATES: ['legal-templates'],
  })
  await assert.rejects(() => upload({ file: new File(['wrong'], 'template.docx', { type: 'image/png' }) }), /does not match/)
  await assert.rejects(() => upload({ file: new File([new Uint8Array(25 * MB + 1)], 'template.docx') }), /25 MB/)
  await assert.rejects(() => upload({ file: new File([], 'template.docx') }), /empty/)
  assert.equal(uploads.length, 0)
  await upload({ file: new File(['PK fixture'], 'template.docx', { type: '' }) })
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0][2].contentType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(uploads[0][1].type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
})
