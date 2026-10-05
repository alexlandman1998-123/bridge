import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'
import { createSellerCorrectionFixture, sellerCorrectionValues } from './fixtures/seller-document-corrections.mjs'
import { createMandateCaptureFixture } from './fixtures/seller-mandate-capture.mjs'
import { buildSellerSigningCorrectionEditData, validateSellerSigningDocumentCorrections, renderSellerSigningDocumentCorrections } from '../src/core/documents/sellerSigningDocumentCorrections.js'
import { createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex } from '../src/core/documents/sellerReviewedDocumentVersions.js'

// Exercise the deployed request handler and the existing SQL function together.
// Only the Supabase transport, Deno listener and email infrastructure are replaced.
// All records and the PostgreSQL database are synthetic and local to this process.
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const db = new PGlite()
const hash = value => createHash('sha256').update(value).digest('hex')
const digest = value => `sha256:${hash(value)}`
const keys = ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form']
const tables = new Set(['private_listing_seller_portal_signing_recipients', 'private_listing_seller_portal_signing_documents', 'private_listing_seller_onboarding'])
const identifier = value => {
  assert.match(value, /^[a-z_]+$/)
  return value
}
let rpcCalls = 0
const admin = {
  from(table) {
    assert.ok(tables.has(table), `Unexpected table: ${table}`)
    const parameters = [], filters = []
    let columns = '*', limit = '', single = false
    const query = {
      select(value) { columns = value.split(',').map(column => identifier(column.trim())).join(', '); return query },
      eq(column, value) { parameters.push(value); filters.push(`${identifier(column)} = $${parameters.length}`); return query },
      limit(value) { assert.ok(Number.isInteger(value)); limit = ` limit ${value}`; return query },
      maybeSingle() { single = true; return query },
      async then(resolve, reject) {
        try {
          const result = await db.query(`select ${columns} from ${table}${filters.length ? ` where ${filters.join(' and ')}` : ''}${limit}`, parameters)
          if (single) assert.ok(result.rows.length <= 1)
          return resolve({ data: single ? result.rows[0] || null : result.rows, error: null })
        } catch (error) { return reject(error) }
      },
    }
    return query
  },
  async rpc(name, parameters) {
    assert.equal(name, 'bridge_update_seller_portal_document_corrections')
    rpcCalls++
    try {
      const result = await db.query(`select public.${name}($1, $2, $3::jsonb) as result`, [parameters.p_token_hash, parameters.p_expected_version_digest, JSON.stringify(parameters.p_updates)])
      return { data: result.rows[0].result, error: null }
    } catch (error) { return { data: null, error } }
  },
}
const previousDeno = globalThis.Deno
let handler
globalThis.__sellerCorrectionAdmin = admin
globalThis.Deno = {
  env: { get: key => ({ SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', SUPABASE_ANON_KEY: 'synthetic-anon-key', SELLER_PORTAL_SIGNING_ENABLED: 'true' })[key] },
  serve: callback => { handler = callback },
}

async function seed(branch, selectedKey = 'signed_fica_declaration') {
  await db.exec('truncate private_listing_seller_portal_signature_evidence, private_listing_seller_portal_signing_recipients, private_listing_seller_portal_signing_documents, private_listing_seller_onboarding')
  const listingId = randomUUID(), copy = createSellerCorrectionFixture(branch)
  const approval = { ...copy.approval, signingRoute: 'digital_pack', selectedDocuments: ['mandate', 'fica', 'signed_disclosure_form'] }
  const documents = keys.map(key => ({ key, generatedHtml: renderSellerSigningDocumentCorrections(copy, key, validateSellerSigningDocumentCorrections(buildSellerSigningCorrectionEditData(copy, key), key), listingId),
    ...(key !== 'signed_disclosure_form' ? { sourceFactsFingerprint: `synthetic-captured-facts-${key}` } : {}),
  }))
  // Corrections must also work with the facts-bound versions the current browser creates.
  const reviewed = await createSellerReviewedDocumentVersions({ manualSigningPack: { documents }, formalPackApproval: approval, signingPack: copy.pack.signingPackSnapshot, actor: 'synthetic-agent', approvedAt: '2026-10-04T10:00:00Z' })
  copy.form.sellerOnboardingFormalPackApproval = approval
  copy.form.sellerOnboardingReview = { status: 'approved' }
  copy.form.sellerOnboardingManualSigningPack = { ...copy.pack, documents: reviewed.documents }
  copy.form.sellerReviewedDocumentVersions = buildSellerReviewedDocumentVersionIndex(reviewed)
  await db.query('insert into private_listing_seller_onboarding values ($1, $2, $3::jsonb)', [listingId, 'completed', JSON.stringify(copy.form)])
  const rows = []
  for (const document of reviewed.documents) {
    const id = randomUUID()
    await db.query('insert into private_listing_seller_portal_signing_documents values ($1,$2,$3,$4,$5,$6,$5,$6,$7,$8::jsonb,$9::jsonb,$10)', [id, listingId, document.key, document.versionId, document.versionDigest, document.contentDigest, document.generatedHtml, '{}', JSON.stringify(document.requiredSigners), 'sent'])
    rows.push({ id, ...document })
  }
  // An earlier approved copy is a distinct historical row with unchanged bytes.
  // Signature evidence for ANY document on this listing correctly blocks edits;
  // that stricter case is checked separately below.
  const historicalId = randomUUID()
  await db.query('insert into private_listing_seller_portal_signing_documents (id, private_listing_id, document_key, reviewed_html, status) values ($1,$2,$3,$4,$5)', [historicalId, listingId, 'signed_mandate', 'HISTORIC-APPROVED-HTML', 'reviewed'])
  const token = `synthetic-seller-correction-${randomUUID()}`, tokenHash = hash(token)
  const selected = rows.find(row => row.key === selectedKey)
  const signer = selected.requiredSigners[0]
  await db.query('insert into private_listing_seller_portal_signing_recipients values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [randomUUID(), selected.id, tokenHash, signer.name, signer.role, signer.email, 'pending', new Date(Date.now() + 3600000).toISOString(), null])
  return { copy, rows, selected, listingId, token, tokenHash, historicalId }
}
async function request(fixture, corrections, versionDigest = fixture.selected.versionDigest) {
  const response = await handler(new Request('https://synthetic.example.test/seller-portal-document-signing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'correct', token: fixture.token, versionDigest, corrections }) }))
  return { status: response.status, body: await response.json() }
}
async function snapshot() {
  return (await db.query('select * from private_listing_seller_portal_signing_documents order by id')).rows
}
function replacements(rows) {
  return rows.filter(row => row.status === 'sent').map(row => {
    const reviewedHtml = `${row.reviewed_html}<!-- synthetic replacement -->`
    const contentDigest = digest(reviewedHtml)
    return { documentId: row.id, expectedVersionDigest: row.version_digest, reviewedHtml, corrections: row.seller_corrections, contentDigest, versionDigest: digest(`${row.source_version_digest}:${contentDigest}`) }
  })
}
try {
  await db.exec(`
    create schema extensions;
    create function extensions.digest(bytea, text) returns bytea language sql as $$ select sha256($1) $$;
    create table private_listing_seller_portal_signing_documents (
      id uuid primary key, private_listing_id uuid, document_key text, version_id text,
      version_digest text, content_digest text, source_version_digest text, source_content_digest text,
      reviewed_html text, seller_corrections jsonb, required_signers jsonb, status text
    );
    create table private_listing_seller_portal_signing_recipients (
      id uuid primary key, signing_document_id uuid, token_hash text unique,
      signer_name text, signer_role text, signer_email text, status text, expires_at timestamptz, viewed_at timestamptz
    );
    create table private_listing_seller_portal_signature_evidence (id uuid primary key, signing_document_id uuid);
    create table private_listing_seller_onboarding (private_listing_id uuid primary key, status text, form_data jsonb);
  `)
  const migration = await fs.readFile(new URL('../../supabase/migrations/20260928092501_seller_portal_signature_place_and_date.sql', import.meta.url), 'utf8')
  const start = migration.indexOf('create function public.bridge_update_seller_portal_document_corrections(')
  assert.ok(start >= 0)
  const end = migration.indexOf('$$;', start)
  await db.exec(migration.slice(start, end + 3))
  const bundled = await build({
    absWorkingDir: appRoot, entryPoints: ['../supabase/functions/seller-portal-document-signing/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'synthetic-edge-infrastructure', setup(builder) {
      builder.onResolve({ filter: /^(supabase|jsr:)|send-email\// }, args => ({ path: args.path, namespace: 'synthetic' }))
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: args.path === 'supabase'
        ? 'export const createClient = () => globalThis.__sellerCorrectionAdmin;'
        : args.path.startsWith('jsr:') ? ''
          : 'export const sendViaResendApi = () => { throw new Error("Email is outside this check") }; export const resolveAudienceEmailSender = sendViaResendApi; export const resolveEmailBranding = sendViaResendApi; export const renderBridgeCta = sendViaResendApi; export const renderBridgeEmailLayout = sendViaResendApi; export const renderBridgeIntroParagraphs = sendViaResendApi;' }))
    } }],
  })
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
  assert.equal(typeof handler, 'function', 'The real Edge request handler must be registered')
  for (const branch of ['multiple_owners', 'company', 'trust']) {
    const fixture = await seed(branch)
    const original = await snapshot()
    const result = await request(fixture, sellerCorrectionValues(fixture.copy, fixture.selected.key))
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal(result.body.signerName, 'Corrected Primary')
    assert.match(result.body.reviewedHtml, /CORRECTED-TAX/)
    const changed = await snapshot()
    for (const row of changed.filter(row => row.status === 'sent')) {
      const prior = original.find(value => value.id === row.id)
      assert.match(row.reviewed_html, /Corrected Primary/)
      assert.match(row.reviewed_html, /Corrected Property Address/)
      assert.match(row.reviewed_html, /Second Owner/)
      assert.equal(row.content_digest, digest(row.reviewed_html))
      assert.equal(row.version_digest, digest(`${row.source_version_digest}:${row.content_digest}`))
      assert.equal(row.source_version_digest, prior.source_version_digest)
      assert.equal(row.source_content_digest, prior.source_content_digest)
      assert.deepEqual(row.required_signers, prior.required_signers, 'Invitation routing and authority stay frozen')
    }
    assert.deepEqual(changed.find(row => row.id === fixture.historicalId), original.find(row => row.id === fixture.historicalId))
    assert.deepEqual((await db.query('select form_data from private_listing_seller_onboarding')).rows[0].form_data, fixture.copy.form)
    assert.equal((await request(fixture, sellerCorrectionValues(fixture.copy, fixture.selected.key))).status, 409, 'An obsolete version cannot overwrite corrected copies')
    assert.deepEqual(await snapshot(), changed)
    const selected = changed.find(row => row.id === fixture.selected.id)
    // A signature on a different document locks the entire shared pack.
    await db.query('insert into private_listing_seller_portal_signature_evidence values ($1,$2)', [randomUUID(), fixture.rows.find(row => row.key !== fixture.selected.key).id])
    assert.equal((await request(fixture, sellerCorrectionValues(fixture.copy, fixture.selected.key), selected.version_digest)).status, 409)
    assert.deepEqual(await snapshot(), changed)
    console.log(`${branch}: all three copies updated, source/history preserved, stale save and signed-pack edit rejected`)
  }
  for (const key of ['signed_mandate', 'signed_disclosure_form']) {
    const fixture = await seed('multiple_owners', key)
    const corrections = sellerCorrectionValues(fixture.copy, key, key === 'signed_mandate'
      ? { mandate: { mandateType: 'dual', otherAgencyName: 'Second Correction Agency' } }
      : { disclosure: { comments: 'Corrected defects comment' } })
    const result = await request(fixture, corrections)
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.match(result.body.reviewedHtml, key === 'signed_mandate' ? /Second Correction Agency/ : /Corrected defects comment/)
    assert.match(result.body.reviewedHtml, /Second Owner/)
    console.log(`${key}: correction request updates shared details and document-specific terms`)
  }
  const legacy = await seed('individual', 'signed_mandate')
  const legacyBefore = await snapshot(), callsBeforeSchedules = rpcCalls
  const injected = await request(legacy, sellerCorrectionValues(legacy.copy, 'signed_mandate', { mandate: { mandateCapture: createMandateCaptureFixture() } }))
  assert.equal(injected.status, 400, 'New schedules cannot be injected into an old signing template')
  assert.deepEqual(await snapshot(), legacyBefore)
  assert.equal(rpcCalls, callsBeforeSchedules, 'Unsupported schedule edits stop before the database write')
  console.log('Revised schedules cannot be silently inserted into a legacy contract')
  const fixture = await seed('multiple_owners')
  const unchanged = await snapshot(), updates = replacements(unchanged)
  const parameters = { p_token_hash: fixture.tokenHash, p_expected_version_digest: fixture.selected.versionDigest, p_updates: updates.slice(0, 1) }
  assert.ok((await admin.rpc('bridge_update_seller_portal_document_corrections', parameters)).error, 'Incomplete batches must fail')
  assert.deepEqual(await snapshot(), unchanged)
  updates.at(-1).contentDigest = 'sha256:tampered'
  assert.ok((await admin.rpc('bridge_update_seller_portal_document_corrections', { ...parameters, p_updates: updates })).error, 'A failure on the last copy must roll back earlier replacements')
  assert.deepEqual(await snapshot(), unchanged)
  const callsBefore = rpcCalls
  await db.query('update private_listing_seller_portal_signing_recipients set expires_at = $1', ['2020-01-01T00:00:00Z'])
  assert.equal((await request(fixture, sellerCorrectionValues(fixture.copy, fixture.selected.key))).status, 404)
  assert.equal(rpcCalls, callsBefore, 'Expired links never reach the write operation')
  assert.deepEqual(await snapshot(), unchanged)
  console.log('Atomic batch rollback, complete-pack requirement and expired-link rejection passed. No remote writes.')
} finally {
  globalThis.Deno = previousDeno
  delete globalThis.__sellerCorrectionAdmin
  await db.close()
}
