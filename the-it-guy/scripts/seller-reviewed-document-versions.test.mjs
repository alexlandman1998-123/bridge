import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { createSellerCorrectionFixture } from './fixtures/seller-document-corrections.mjs'
import { buildSellerPostOnboardingDrafts } from '../src/core/documents/sellerPostOnboardingDrafts.js'
import { createSellerOnboardingManualSigningPack, createSellerOnboardingSigningCopyPack } from '../src/core/documents/sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex, verifySellerReviewedDocumentVersion } from '../src/core/documents/sellerReviewedDocumentVersions.js'

// Run actual browser preparation/freezing and the entire Edge request handler.
// Replace only transport/auth/email infrastructure with local synthetic records.
// No application renderer, version check or handler action is stubbed.
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const keys = ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate']
const copyTime = '2026-10-04T10:00:00Z'
const hash = value => createHash('sha256').update(value).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const onboardingTable = 'private_listing_seller_onboarding'
const documentsTable = 'private_listing_seller_portal_signing_documents'
const recipientsTable = 'private_listing_seller_portal_signing_recipients'
const evidenceTable = 'private_listing_seller_portal_signature_evidence'
let tables, emails, writeCount, handler
const admin = {
  auth: { getUser: async token => token === 'synthetic-agent-token' ? { data: { user: { id: 'synthetic-agent' } }, error: null } : { data: null, error: new Error('Invalid synthetic session') } },
  rpc: async name => {
    assert.equal(name, 'bridge_listing_seller_actor_permission', 'Unexpected RPC in issuance/view tests')
    return { data: true, error: null }
  },
  from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`)
    const filters = []
    let columns = '*', limit = Infinity, single = false, inserted, patch
    const query = {
      select(value) { columns = value; return query },
      eq(key, value) { filters.push(row => row[key] === value); return query },
      neq(key, value) { filters.push(row => row[key] !== value); return query },
      in(key, values) { filters.push(row => values.includes(row[key])); return query },
      gt(key, value) { filters.push(row => row[key] > value); return query },
      limit(value) { limit = value; return query },
      maybeSingle() { single = true; return query },
      single() { single = true; return query },
      insert(value) { inserted = Array.isArray(value) ? value : [value]; return query },
      update(value) { patch = value; return query },
      async then(resolve, reject) {
        try {
          let rows
          if (inserted) {
            rows = inserted.map(row => ({ id: randomUUID(), status: table === documentsTable ? 'prepared' : 'pending', created_at: new Date().toISOString(), ...structuredClone(row) }))
            tables[table].push(...rows)
            writeCount++
          } else {
            rows = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, limit)
            if (patch) { rows.forEach(row => Object.assign(row, structuredClone(patch))); writeCount++ }
          }
          if (columns !== '*') rows = rows.map(row => Object.fromEntries(columns.split(',').map(key => key.trim()).map(key => [key, row[key]])))
          if (single) assert.ok(rows.length <= 1)
          return resolve({ data: single ? rows[0] || null : rows, error: null })
        } catch (error) { return reject(error) }
      },
    }
    return query
  },
}

async function prepare(branch = 'multiple_owners', format = 'current', generator = 'signing-copy', mandateType = 'sole') {
  const copy = createSellerCorrectionFixture(branch), listingId = randomUUID()
  const signingPack = copy.pack.signingPackSnapshot
  signingPack.mandate.mandateType = mandateType
  if (mandateType === 'dual') signingPack.mandate.otherAgencyName = 'Second Synthetic Agency'
  const approval = { ...copy.approval, selectedDocuments: ['fica', 'mandate'], signingRoute: 'digital_pack' }
  const drafts = buildSellerPostOnboardingDrafts({ formData: copy.form, listing: { id: listingId }, branding: signingPack.branding, generatedAt: copyTime })
  const createPack = generator === 'manual-generator' ? createSellerOnboardingManualSigningPack : createSellerOnboardingSigningCopyPack
  const prepared = createPack({ formData: copy.form, formalPackApproval: approval, signingPack, postOnboardingDrafts: drafts, actor: 'synthetic-agent', generatedAt: copyTime })
  assert.ok(prepared.documents.find(row => row.key === 'signed_fica_declaration').sourceFactsFingerprint)
  assert.ok(prepared.documents.find(row => row.key === 'signed_mandate').sourceFactsFingerprint)
  if (format !== 'current') for (const document of prepared.documents) delete document.sourceFactsFingerprint
  const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: prepared, formalPackApproval: approval, signingPack, actor: 'synthetic-agent', approvedAt: copyTime })
  const index = buildSellerReviewedDocumentVersionIndex(frozen)
  if (format === 'legacy-absent') {
    for (const document of frozen.documents) delete document.sourceFactsFingerprint
    for (const document of index.documents) delete document.sourceFactsFingerprint
  }
  for (const document of frozen.documents) assert.equal(await verifySellerReviewedDocumentVersion(document), true)
  const form = { ...copy.form, sellerPostOnboardingDrafts: drafts,
    sellerOnboardingReview: { status: 'approved' }, sellerOnboardingFormalPackApproval: approval,
    sellerOnboardingManualSigningPack: { ...prepared, signingPackSnapshot: signingPack, documents: frozen.documents },
    sellerReviewedDocumentVersions: index,
  }
  tables = { private_listings: [{ id: listingId, organisation_id: 'synthetic-organisation' }],
    [onboardingTable]: [{ private_listing_id: listingId, status: 'completed', form_data: form }],
    [documentsTable]: [], [recipientsTable]: [], [evidenceTable]: [],
  }
  emails = []; writeCount = 0
  return { form, frozen, listingId, index }
}
async function request(action, fields, authenticated = true) {
  const response = await handler(new Request('https://synthetic.example.test/seller-portal-document-signing', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer synthetic-agent-token' } : {}) },
    body: JSON.stringify({ action, ...fields }),
  }))
  return { status: response.status, body: await response.json() }
}
async function expectRejection(mutate, key = 'signed_mandate') {
  const fixture = await prepare()
  mutate(fixture, fixture.frozen.documents.find(row => row.key === key), fixture.index.documents.find(row => row.key === key))
  const before = structuredClone(tables)
  const result = await request('issue', { listingId: fixture.listingId, documentKey: key })
  assert.equal(result.status, 409, JSON.stringify(result.body))
  assert.match(result.body.error, /Approve and freeze/)
  assert.equal(writeCount, 0, 'Invalid versions must fail before preparing recipients or sending')
  assert.deepEqual(emails, [])
  assert.deepEqual(tables, before)
}

const previousDeno = globalThis.Deno, previousFetch = globalThis.fetch
globalThis.__sellerVersionAdmin = admin
globalThis.__sellerVersionEmail = options => { emails.push(options); return { ok: true, data: { id: `synthetic-message-${emails.length}` } } }
globalThis.fetch = () => { throw new Error('Network requests are forbidden in this local version check') }
globalThis.Deno = {
  env: { get: key => ({ SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', SUPABASE_ANON_KEY: 'synthetic-anon-key',
    SELLER_PORTAL_SIGNING_ENABLED: 'true', RESEND_API_KEY: 'synthetic-email-key', RESEND_FROM_EMAIL: 'agency@example.test', PUBLIC_APP_URL: 'https://synthetic.example.test' })[key] },
  serve: callback => { handler = callback },
}
try {
  const bundled = await build({ absWorkingDir: appRoot, entryPoints: ['../supabase/functions/seller-portal-document-signing/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'synthetic-edge-infrastructure', setup(builder) {
      builder.onResolve({ filter: /^(supabase|jsr:)|send-email\// }, args => ({ path: args.path, namespace: 'synthetic' }))
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: args.path === 'supabase'
        ? 'export const createClient = () => globalThis.__sellerVersionAdmin;'
        : args.path.startsWith('jsr:') ? '' : `
          export const sendViaResendApi = async options => globalThis.__sellerVersionEmail(options);
          export const resolveAudienceEmailSender = async () => 'agency@example.test';
          export const resolveEmailBranding = async () => ({organisationName:'Synthetic Agency'});
          export const renderBridgeCta = () => '<span>Synthetic call to action</span>';
          export const renderBridgeEmailLayout = () => '<article>Synthetic email</article>';
          export const renderBridgeIntroParagraphs = () => '<p>Synthetic introduction</p>';
        ` }))
    } }],
  })
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
  assert.equal(typeof handler, 'function')
  let issuedCount = 0
  for (const [branch, format, generator, mandateType] of [
    ['multiple_owners', 'current', 'signing-copy', 'sole'],
    ['company', 'current', 'signing-copy', 'exclusive'],
    ['trust', 'current', 'signing-copy', 'open'],
    ['multiple_owners', 'current', 'signing-copy', 'dual'],
    ['multiple_owners', 'current', 'manual-generator', 'sole'],
    ['company', 'current', 'manual-generator', 'dual'],
    ['multiple_owners', 'legacy-absent', 'signing-copy', 'sole'],
    ['multiple_owners', 'legacy-empty', 'manual-generator', 'sole'],
  ]) {
    const fixture = await prepare(branch, format, generator, mandateType), source = structuredClone(fixture.form)
    for (const document of fixture.frozen.documents) {
      const result = await request('issue', { listingId: fixture.listingId, documentKey: document.key })
      assert.equal(result.status, 200, `${format}/${branch}/${document.key}: ${JSON.stringify(result.body)}`)
      assert.equal(result.body.sentCount, document.requiredSigners.length)
      const saved = tables[documentsTable].find(row => row.id === result.body.signingDocumentId)
      assert.equal(saved.status, 'sent')
      assert.equal(saved.reviewed_html, document.generatedHtml)
      assert.equal(saved.source_version_digest, document.versionDigest)
      assert.equal(saved.version_digest, document.versionDigest)
      assert.equal(saved.content_digest, document.contentDigest)
      assert.deepEqual(saved.required_signers, document.requiredSigners)
      const sent = emails.filter(email => email.idempotencyKey.startsWith(`seller-portal-signature:${saved.id}:`))
      assert.equal(sent.length, document.requiredSigners.length)
      for (const email of sent) {
        const token = email.text.match(/https:\/\/synthetic\.example\.test\/seller\/sign\/([^\s]+)/)?.[1]
        assert.ok(token)
        const recipient = tables[recipientsTable].find(row => row.token_hash === hash(decodeURIComponent(token)))
        assert.equal(recipient.signer_email, email.to)
        const viewed = await request('view', { token: decodeURIComponent(token) }, false)
        assert.equal(viewed.status, 200, JSON.stringify(viewed.body))
        assert.equal(viewed.body.reviewedHtml, document.generatedHtml)
        assert.equal(viewed.body.versionDigest, document.versionDigest)
        assert.equal(viewed.body.canEdit, true)
      }
      const recipientsBefore = tables[recipientsTable].length, messagesBefore = emails.length
      assert.equal((await request('issue', { listingId: fixture.listingId, documentKey: document.key })).status, 409, 'The same approved version cannot be issued twice')
      assert.equal(tables[recipientsTable].length, recipientsBefore)
      assert.equal(emails.length, messagesBefore)
      issuedCount++
    }
    assert.deepEqual(fixture.form, source, 'Issuance/viewing must never rewrite approved facts, hashes or historical copies')
    console.log(`${format}/${generator}/${branch}/${mandateType}: disclosure, FICA and mandate pass real issuance/viewing; approved hashes preserved`)
  }
  const tampering = [
    ['HTML', (_fixture, document) => { document.generatedHtml += '<p>Tampered</p>' }],
    ['source facts', (_fixture, document) => { document.sourceFactsFingerprint += '-changed' }],
    ['removed source facts', (_fixture, document) => { delete document.sourceFactsFingerprint }],
    ['source draft', (_fixture, document) => { document.sourceDraftFingerprint = 'changed-draft' }],
    ['signer identity', (_fixture, document) => { document.requiredSigners[0].name = 'Changed Signer' }],
    ['signer routing', (_fixture, document) => { document.requiredSigners[0].email = 'changed@example.test' }],
    ['signer role', (_fixture, document) => { document.requiredSigners[0].role = 'Different Authority' }],
    ['mandate terms', (_fixture, document) => { document.mandateTerms.askingPrice = '1' }],
    ['index source facts', (_fixture, _document, index) => { index.sourceFactsFingerprint = 'changed-index-facts' }],
    ['index source draft', (_fixture, _document, index) => { index.sourceDraftFingerprint = 'changed-index-draft' }],
    ['index signer', (_fixture, _document, index) => { index.requiredSigners = [] }],
    ['index mandate terms', (_fixture, _document, index) => { index.mandateTerms = { ...index.mandateTerms, askingPrice: '1' } }],
    ['index version', (_fixture, _document, index) => { index.versionId = randomUUID() }],
    ['duplicate document', (fixture, document) => { fixture.form.sellerOnboardingManualSigningPack.documents.push(structuredClone(document)) }],
    ['duplicate index', (fixture, _document, index) => { fixture.index.documents.push(structuredClone(index)) }],
    ['legacy hash fallback with present facts', (_fixture, document, index) => {
      document.versionDigest = index.versionDigest = `sha256:${hash(JSON.stringify(canonical({ key: document.key, contentDigest: document.contentDigest,
        sourceDraftFingerprint: document.sourceDraftFingerprint, signers: document.requiredSigners, mandateTerms: document.mandateTerms })))}`
    }],
  ]
  for (const [label, mutate] of tampering) { await expectRejection(mutate); console.log(`Rejected ${label} tampering before any write`) }
  for (const key of ['signed_fica_declaration', 'signed_disclosure_form']) {
    await expectRejection((_fixture, document) => { document.generatedHtml += '<p>Tampered</p>' }, key)
  }
  const fixture = await prepare()
  assert.equal((await request('issue', { listingId: fixture.listingId, documentKey: 'signed_mandate' }, false)).status, 403)
  assert.equal(writeCount, 0)
  console.log(`Seller version contract passed: ${issuedCount} local issuance/viewing flows, ${tampering.length + 2} tampering cases, legacy compatibility and agent access. No remote writes or email delivery.`)
} finally {
  globalThis.Deno = previousDeno
  globalThis.fetch = previousFetch
  delete globalThis.__sellerVersionAdmin
  delete globalThis.__sellerVersionEmail
}
