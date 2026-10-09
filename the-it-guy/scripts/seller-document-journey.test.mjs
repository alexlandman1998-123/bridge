import { runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection } from '../src/lib/documentUploadRecovery.js'
import { createMandateTermsFixture } from './fixtures/seller-mandate-capture.mjs'
import { collectSellerSigningBundle } from './seller-document-release-check.mjs'
import { collectSellerReleaseSource } from './seller-document-release-candidate.mjs'
import { createSyntheticMandateSigningRuntime } from './fixtures/seller-mandate-signing.mjs'
import { buildSellerMandateTermsFormPatch, normalizeSellerMandateCapture, getSellerMandatePreparationIssues } from '../src/lib/sellerMandateCapture.js'
import { buildListingSellerProfileFormPatch, createListingSellerProfileBuilderDraft } from '../src/lib/listingSellerProfileBuilderModel.js'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PGlite } from '@electric-sql/pglite'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindConfig from '../tailwind.config.js'
import { createSellerCorrectionFixture, sellerCorrectionValues } from './fixtures/seller-document-corrections.mjs'
import { saveListingSellerCanonicalUpdate } from '../src/services/listings/listingSellerCanonicalUpdateService.js'
import { buildListingSellerCanonicalSavePayload, isMatchingSellerCanonicalSaveReceipt } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { buildSellerPostOnboardingDrafts } from '../src/core/documents/sellerPostOnboardingDrafts.js'
import { createSellerOnboardingManualSigningPack } from '../src/core/documents/sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions, buildSellerReviewedDocumentVersionIndex } from '../src/core/documents/sellerReviewedDocumentVersions.js'
import { buildSellerDocumentSourceOfTruth } from '../src/services/sellerDocumentRequirementsService.js'
import { hasCompletedSellerDisclosure, hasCompletedOnboardingDisclosureSignature } from '../src/core/documents/sellerDocumentSigningContract.js'
import { buildSellerOnboardingSigningPackSnapshot } from '../src/core/documents/sellerOnboardingSigningPackSnapshot.js'
import { buildSellerAgentAssistedDisclosurePatch, getSellerDisclosureQuestionMissing } from '../src/lib/sellerAgentAssistedDisclosure.js'
import { buildSellerDocumentWorkflow } from '../src/core/documents/sellerDocumentWorkflow.js'

// The same saved records pass through application preparation, Chromium PDF
// downloads, the complete Edge handler and unchanged PostgreSQL commands.
// Auth/session, email delivery, Storage bytes and transaction promotion are
// synthetic infrastructure. This is a local pre-transaction acceptance test,
// not a hosted UI, wet-ink authenticity or full migration-chain verification.
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceFingerprint = (await collectSellerReleaseSource(path.resolve(appRoot, '..'), await collectSellerSigningBundle())).fingerprint
const output = path.join(appRoot, 'test-results/seller-document-journey')
const db = new PGlite()
const actor = randomUUID(), organisation = randomUUID()
const signingTable = 'private_listing_seller_portal_signing_documents'
const recipientTable = 'private_listing_seller_portal_signing_recipients'
const evidenceTable = 'private_listing_seller_portal_signature_evidence'
const keys = ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate']
const allowedTables = new Set(['private_listings', 'private_listing_seller_onboarding', signingTable, recipientTable, evidenceTable])
const hash = value => createHash('sha256').update(value).digest('hex')
const sql = async (query, parameters = []) => (await db.query(query, parameters)).rows
const identifier = value => { assert.match(value, /^[a-z_]+$/); return value }
const encode = value => value && typeof value === 'object' ? JSON.stringify(value) : value
let handler, signature, browser, page, portalPage, server, baseUrl, deliveryFailure = false
const emails = [], report = [], browserErrors = []
let downloads = 0, downloadedPages = 0, browserSignatures = 0, browserPhysicalReviews = 0
let existingSignedUploads = 0, agentAssistedCaptures = 0
const rpcArguments = {
  bridge_update_seller_portal_document_corrections: ['p_token_hash', 'p_expected_version_digest', 'p_updates'],
  bridge_submit_seller_portal_document_signature: ['p_token_hash', 'p_signed_name', 'p_signature_type', 'p_signature_value', 'p_signed_date', 'p_signed_place', 'p_acceptance_ip', 'p_acceptance_user_agent', 'p_expected_version_digest'],
  bridge_review_seller_portal_signed_document: ['p_signing_document_id', 'p_signed_html', 'p_signed_html_digest', 'p_reviewer_id'],
}
const admin = {
  auth: { getUser: async token => ({ data: token === 'synthetic-agent-session' ? { user: { id: actor } } : null, error: null }) },
  async rpc(name, values) {
    if (name === 'bridge_listing_seller_actor_permission') return { data: values.p_organisation_id === organisation, error: null }
    assert.ok(rpcArguments[name], `Unexpected RPC ${name}`)
    try {
      const args = rpcArguments[name].map(key => encode(values[key]))
      const rows = await sql(`select public.${identifier(name)}(${args.map((_, index) => `$${index + 1}`).join(',')}) as result`, args)
      return { data: rows[0].result, error: null }
    } catch (error) { return { data: null, error } }
  },
  from(table) {
    assert.ok(allowedTables.has(table), `Unexpected table ${table}`)
    const args = [], filters = []
    let columns = '*', single = false, limit = '', order = '', patch, inserted
    const bind = value => { args.push(value); return `$${args.length}` }
    const query = {
      select(value) { columns = value === '*' ? '*' : value.split(',').map(key => identifier(key.trim())).join(','); return query },
      eq(key, value) { filters.push(`${identifier(key)}=${bind(value)}`); return query },
      neq(key, value) { filters.push(`${identifier(key)}<>${bind(value)}`); return query },
      gt(key, value) { filters.push(`${identifier(key)}>${bind(value)}`); return query },
      in(key, values) { filters.push(`${identifier(key)} in (${values.map(bind).join(',')})`); return query },
      order(key, options) { order = ` order by ${identifier(key)} ${options?.ascending === false ? 'desc' : 'asc'}`; return query },
      limit(value) { assert.ok(Number.isInteger(value)); limit = ` limit ${value}`; return query },
      single() { single = true; return query }, maybeSingle() { single = true; return query },
      update(value) { patch = value; return query }, insert(value) { inserted = Array.isArray(value) ? value : [value]; return query },
      async then(resolve) {
        try {
          let command
          const where = filters.length ? ` where ${filters.join(' and ')}` : ''
          if (inserted) {
            const fields = Object.keys(inserted[0]).map(identifier)
            command = `insert into ${table} (${fields.join(',')}) values ${inserted.map(row => `(${fields.map(key => bind(encode(row[key]))).join(',')})`).join(',')} returning ${columns}`
          } else if (patch) {
            command = `update ${table} set ${Object.entries(patch).map(([key, value]) => `${identifier(key)}=${bind(encode(value))}`).join(',')}${where} returning ${columns}`
          } else command = `select ${columns} from ${table}${where}${order}${limit}`
          const rows = await sql(command, args)
          if (single) assert.ok(rows.length <= 1)
          return resolve({ data: single ? rows[0] || null : rows, error: null })
        } catch (error) { return resolve({ data: null, error }) }
      },
    }
    return query
  },
}
async function request(action, fields, staff = false) {
  const response = await handler(new Request('https://synthetic.example.test/seller-portal-document-signing', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(staff ? { authorization: 'Bearer synthetic-agent-session' } : {}) },
    body: JSON.stringify({ action, ...fields }),
  }))
  return { status: response.status, body: await response.json() }
}

async function rehearseSellerDocumentRollback() {
  const tables = [...allowedTables, 'private_listing_documents', 'private_listing_document_requirements', 'seller_document_review_events']
  const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table,
    (await sql(`select coalesce(jsonb_agg(to_jsonb(row) order by to_jsonb(row)::text),'[]'::jsonb) as data from ${identifier(table)} row`))[0].data])))
  const signature = 'public.bridge_upload_private_listing_seller_signed_copy(text,text,text,text,text,text,uuid,text,text,uuid,text)'
  assert.equal((await sql('select to_regprocedure($1) is not null as present', [signature]))[0].present, true)
  const before = await snapshot()
  const rollbackSql = (await fs.readFile(path.resolve(appRoot, '../docs/seller-document-review-runtime-rollback.sql'), 'utf8'))
    .replace(/^\s*(begin|commit);\s*$/gmi, '')
  await db.exec('begin')
  try {
    await db.exec(rollbackSql)
    assert.equal((await sql('select to_regprocedure($1) is not null as present', [signature]))[0].present, false)
    assert.deepEqual(await snapshot(), before, 'Scoped rollback must retain every saved fact, requirement, file, review and signature')
  } finally { await db.exec('rollback') }
  assert.equal((await sql('select to_regprocedure($1) is not null as present', [signature]))[0].present, true)
  assert.deepEqual(await snapshot(), before)
  console.log('Scoped rollback rehearsed transactionally against the connected SQL fixtures; all saved records and signatures preserved')
}
async function reopened(listingId) {
  const listing = (await sql('select * from private_listings where id=$1', [listingId]))[0]
  const onboarding = (await sql('select * from private_listing_seller_onboarding where private_listing_id=$1', [listingId]))[0]
  return { ...listing, organisationId: listing.organisation_id, updatedAt: new Date(listing.updated_at).toISOString(),
    sellerOnboarding: { status: onboarding.status, formData: onboarding.form_data } }
}
async function persist(update) {
  const payload = buildListingSellerCanonicalSavePayload(update)
  const values = [update.listingId, encode(payload.formData), encode(update.canonicalFacts), encode(update.readiness), encode(payload.listingPatch),
    update.onboardingStatus, update.sellerType, update.ownershipStructure, update.maritalRegime, update.mutationId, update.mutationType, update.source, update.changedFields, update.expectedUpdatedAt || null]
  const result = (await sql(`select save_private_listing_seller_canonical_update(${values.map((_, index) => `$${index + 1}`).join(',')}) as result`, values))[0].result
  assert.equal(isMatchingSellerCanonicalSaveReceipt(result, update), true, 'The committed SQL rows must confirm the same mutation and document versions')
  return { listing: await reopened(update.listingId), receipt: result }
}
async function save(listing, formPatch, status = 'completed') {
  return saveListingSellerCanonicalUpdate({ listing, formPatch, onboardingStatus: status, syncLinkedCrmContact: false }, { savePrivateListingSellerCanonicalUpdate: persist })
}
async function mandateCapturePersistence() {
  for (const mandateType of ['sole', 'open', 'dual']) {
    const listingId = randomUUID(), terms = { ...createMandateTermsFixture(), mandateType }
    if (mandateType === 'open') terms.mandateDuration = 'until_cancelled'
    const patch = { ...createSellerCorrectionFixture().form, ...buildSellerMandateTermsFormPatch(terms) }
    await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [listingId, organisation, actor])
    await sql('insert into private_listing_seller_onboarding(private_listing_id,token,form_data,status) values($1,$2,$3,$4)', [listingId, `synthetic-capture-${randomUUID()}`, '{}', 'in_progress'])
    const initial = await reopened(listingId)
    await save(initial, patch, 'in_progress')
    const opened = await reopened(listingId)
    const draft = createListingSellerProfileBuilderDraft(opened)
    assert.deepEqual(draft.mandateCapture, normalizeSellerMandateCapture(terms.mandateCapture))
    assert.equal(draft.protectionPeriod, '0')
    if (mandateType === 'open') assert.equal(draft.expiryDate, '')
    draft.mandateCapture.buyerExclusions = { status: 'none', details: '' }
    draft.mandateCapture.agencyB.noticeEmail = ''
    const next = buildListingSellerProfileFormPatch(draft)
    await save(opened, next, 'in_progress')
    const result = (await reopened(listingId)).sellerOnboarding.formData
    assert.deepEqual(result.mandateCapture, next.mandateCapture)
    assert.equal(result.mandateCapture.buyerExclusions.details, '')
    assert.equal(result.mandateCapture.agencyB.noticeEmail, '')
    if (mandateType === 'open') assert.equal(result.mandateEndDate, '')
    assert.ok(getSellerMandatePreparationIssues(result).some(value => /business\/legal approval/.test(value)))
    assert.equal((await sql(`select count(*)::int as count from ${signingTable} where private_listing_id=$1`, [listingId]))[0].count, 0)
    console.log(`${mandateType}: new schedules saved and reopened through the actual canonical SQL; clears retained, no signing copy created`)
  }
}

async function prepare(branch, mandateType, route = 'digital_pack', { agentAssisted = false } = {}) {
  const listingId = randomUUID(), copy = createSellerCorrectionFixture(branch)
  const form = copy.form
  // The unsigned disclosure must follow the selected document-signing route.
  form.propertyDisclosure.signature = ''; form.propertyDisclosure.signedAt = ''
  if (agentAssisted) {
    Object.assign(form, buildSellerAgentAssistedDisclosurePatch({ disclosure: form.propertyDisclosure, capturedBy: actor, existingFormData: {} }))
    assert.deepEqual(getSellerDisclosureQuestionMissing(form.propertyDisclosure), [])
    assert.equal(form.propertyDisclosure.declarationAccepted, false)
    assert.equal(form.propertyDisclosure.signature, '')
    assert.equal(form.sellerDisclosureCapture.status, 'awaiting_seller_review_and_signature')
    agentAssistedCaptures++
  }
  form.mandateType = mandateType; form.askingPrice = '2450000'
  const signingPack = copy.pack.signingPackSnapshot
  signingPack.disclosure = structuredClone(form.propertyDisclosure)
  signingPack.mandate.mandateType = mandateType
  signingPack.mandate.otherAgencyName = mandateType === 'dual' ? 'Second Synthetic Agency' : ''
  const primaryColour = branch === 'company' ? '#38165e' : '#173d35'
  signingPack.branding = { ...signingPack.branding, organisationName: `Synthetic ${branch} Agency`, primaryColour, accentColour: '#78521b' }
  await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [listingId, organisation, actor])
  await sql('insert into private_listing_seller_onboarding(private_listing_id,token,form_data,status) values($1,$2,$3,$4)', [listingId, `synthetic-portal-${randomUUID()}`, '{}', 'in_progress'])
  for (const key of keys) await sql('insert into private_listing_document_requirements(private_listing_id,requirement_key,requirement_name) values($1,$2,$2)', [listingId, key])
  const initial = await reopened(listingId)
  const captured = await save(initial, form, 'in_progress')
  const captureRetry = await persist(captured.update)
  assert.equal(captureRetry.receipt.idempotentReplay, true, 'A lost save response must be safely replayable')
  await assert.rejects(save(initial, { sellerTaxNumber: 'STALE-SAVE' }), error => error.code === '40001')
  const opened = await reopened(listingId)
  assert.equal(opened.sellerOnboarding.formData.sellerTaxNumber, 'ORIGINAL-TAX')
  const approval = { ...copy.approval, signingRoute: route, selectedDocuments: ['fica', 'mandate'], documentRoutes: Object.fromEntries(keys.map(key => [key, route])) }
  const savedForm = opened.sellerOnboarding.formData
  const drafts = buildSellerPostOnboardingDrafts({ formData: savedForm, listing: opened, branding: signingPack.branding })
  const prepared = createSellerOnboardingManualSigningPack({ formData: savedForm, signingPack, formalPackApproval: approval, postOnboardingDrafts: drafts, actor })
  const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: prepared, formalPackApproval: approval, signingPack, actor })
  assert.equal(frozen.documents.length, 3)
  await save(opened, { sellerPostOnboardingDrafts: drafts, sellerOnboardingReview: { status: 'approved' }, sellerOnboardingFormalPackApproval: approval,
    sellerOnboardingManualSigningPack: { ...prepared, documents: frozen.documents }, sellerReviewedDocumentVersions: buildSellerReviewedDocumentVersionIndex(frozen) })
  const persisted = (await reopened(listingId)).sellerOnboarding.formData
  if (agentAssisted) {
    assert.equal(persisted.sellerDisclosureCapture.capturedBy, actor)
    assert.equal(persisted.propertyDisclosure.signature, '')
    assert.equal(hasCompletedOnboardingDisclosureSignature(persisted), false, 'Agent capture cannot attest on behalf of the seller')
  }
  assert.deepEqual(persisted.sellerOnboardingManualSigningPack.signingPackSnapshot.branding, signingPack.branding)
  assert.deepEqual(persisted.sellerOnboardingManualSigningPack.documents, frozen.documents, 'Reopening must preserve every approved byte, signer and digest')
  return { listingId, copy, form: persisted, frozen, branch, mandateType, route }
}
async function download(html, name, { signed = false, logoColour = [206, 20, 126] } = {}) {
  if (html.includes('data-signature-evidence=')) {
    const presentation = await page.evaluate(async html => {
      const frame = document.createElement('iframe'); frame.style.width = '794px'
      frame.setAttribute('sandbox', 'allow-same-origin')
      const loaded = new Promise(resolve => { frame.onload = resolve }); frame.srcdoc = html; document.body.appendChild(frame)
      await loaded
      const doc = frame.contentDocument
      await Promise.all([...doc.images].map(img => img.decode()))
      const cards = [...doc.querySelectorAll('[data-recorded-seller-signature]')]
      const evidencePages = [...doc.querySelectorAll('.seller-portal-signature-page')]
      const result = { pending: cards.some(card => /Awaiting signature|Not signed yet/.test(card.textContent)),
        signaturesMissing: cards.some(card => !card.querySelector('img')), pages: evidencePages.length,
        branded: evidencePages.every(page => page.closest('.document,.property-disclosure-document') && page.querySelector('.doc-header img,.header img') && page.querySelector('.doc-footer,.footer')),
        overflowing: evidencePages.some(page => page.scrollHeight > 1125) }
      frame.remove(); return result
    }, html)
    assert.equal(presentation.pending, false, `${name}: signed panels must reflect recorded completion`)
    assert.equal(presentation.signaturesMissing, false)
    assert.ok(presentation.pages > 0)
    assert.equal(presentation.branded, true, `${name}: every final evidence page must retain its saved brand and footer`)
    assert.equal(presentation.overflowing, false, `${name}: final evidence must fit its A4 page`)
  }
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(async ({ html, name }) => window.downloadPdf(html, name), { html, name: `${name}.pdf` })])
  const target = path.join(output, `${name}.pdf`)
  await file.saveAs(target)
  assert.equal(await file.failure(), null)
  const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(target)), useSystemFonts: true }).promise
  let signaturePixels = 0, logoPixels = 0
  try {
    assert.ok(pdf.numPages >= 2, `${name}: complete multi-page document required`)
    for (let index = 1; index <= pdf.numPages; index++) {
      const sheet = await pdf.getPage(index), viewport = sheet.getViewport({ scale: 0.75 })
      const canvas = pdf.canvasFactory.create(viewport.width, viewport.height)
      try {
        await sheet.render({ canvasContext: canvas.context, viewport }).promise
        const pixels = canvas.context.getImageData(0, 0, canvas.canvas.width, canvas.canvas.height).data
        let ink = 0
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const [r, g, b] = [pixels[offset], pixels[offset + 1], pixels[offset + 2]]
          if (Math.min(r, g, b) < 210) ink++
          if (Math.abs(r - logoColour[0]) < 35 && Math.abs(g - logoColour[1]) < 35 && Math.abs(b - logoColour[2]) < 35) logoPixels++
          if (b > 160 && r < 80 && g < 110) signaturePixels++
        }
        assert.ok(ink / (pixels.length / 4) > 0.005, `${name} page ${index}: blank or truncated download`)
        if (name === 'digital-multiple_owners-dual-signed_mandate-final' && (index === 1 || index === pdf.numPages)) {
          await fs.writeFile(path.join(output, `review-${index === 1 ? 'mandate' : 'signatures'}.png`), canvas.canvas.toBuffer('image/png'))
        }
      } finally { pdf.canvasFactory.destroy(canvas) }
    }
    assert.ok(logoPixels > 50, `${name}: persisted agency logo must survive download`)
    if (signed) assert.ok(signaturePixels > 100, `${name}: recorded signatures must appear in the downloaded PDF`)
    downloadedPages += pdf.numPages; downloads++
  } finally { await pdf.destroy() }
  assert.equal(await page.locator('[data-seller-document-pdf-stage], .html2pdf__overlay').count(), 0)
  return target
}
async function issuedRecipients(documentId) {
  const recipients = await sql(`select * from ${recipientTable} where signing_document_id=$1 order by signer_email`, [documentId])
  return recipients.map(recipient => {
    const email = emails.find(value => value.idempotencyKey === `seller-portal-signature:${documentId}:${recipient.signer_email}`)
    const token = decodeURIComponent(email.text.match(/\/seller\/sign\/([^\s]+)/)[1])
    assert.equal(hash(token), recipient.token_hash)
    return { ...recipient, token }
  })
}
async function assertCompleted(fixture) {
  const listing = await reopened(fixture.listingId)
  listing.documents = await sql('select * from private_listing_documents where private_listing_id=$1', [fixture.listingId])
  listing.documentRequirements = await sql('select * from private_listing_document_requirements where private_listing_id=$1', [fixture.listingId])
  const projection = buildSellerDocumentSourceOfTruth({ listing, formData: listing.sellerOnboarding.formData })
  for (const key of keys) {
    const row = projection.rows.find(value => value.key === key)
    assert.equal(row.complete, true, `${key}: reopened seller workspace must show approved evidence`)
    assert.equal(row.canDownload, true)
    assert.equal(row.original.document.id, listing.documents.find(value => value.document_type === key).id)
  }
  assert.deepEqual(listing.sellerOnboarding.formData.sellerOnboardingManualSigningPack, fixture.form.sellerOnboardingManualSigningPack, 'Signing/review must preserve the frozen source pack')
}
async function digitalJourney(branch, mandateType) {
  const fixture = await prepare(branch, mandateType), issued = []
  for (const document of fixture.frozen.documents) {
    const sent = await request('issue', { listingId: fixture.listingId, documentKey: document.key }, true)
    assert.equal(sent.status, 200, JSON.stringify(sent.body))
    const recipients = await issuedRecipients(sent.body.signingDocumentId)
    assert.equal(recipients.length, document.requiredSigners.length)
    const count = emails.length
    assert.equal((await request('issue', { listingId: fixture.listingId, documentKey: document.key }, true)).status, 409)
    assert.equal(emails.length, count, 'Issuance retries must not resend active requests')
    issued.push({ document, id: sent.body.signingDocumentId, recipients })
  }
  const fica = issued.find(row => row.document.key === 'signed_fica_declaration')
  const correction = await request('correct', { token: fica.recipients[0].token, versionDigest: fica.document.versionDigest, corrections: sellerCorrectionValues(fixture.copy, fica.document.key) })
  assert.equal(correction.status, 200, JSON.stringify(correction.body))
  assert.equal((await request('correct', { token: fica.recipients[0].token, versionDigest: fica.document.versionDigest, corrections: sellerCorrectionValues(fixture.copy, fica.document.key) })).status, 409)
  for (const item of issued) {
    const name = `digital-${branch}-${mandateType}-${item.document.key}`
    for (let index = 0; index < item.recipients.length; index++) {
      const recipient = item.recipients[index]
      const viewed = await request('view', { token: recipient.token })
      assert.equal(viewed.status, 200, JSON.stringify(viewed.body))
      assert.match(viewed.body.reviewedHtml, /Corrected Property Address/)
      assert.equal(viewed.body.versionDigest, (await sql(`select version_digest from ${signingTable} where id=$1`, [item.id]))[0].version_digest)
      if (index === 0) await download(viewed.body.reviewedHtml, `${name}-copy`)
      const fields = { token: recipient.token, signedName: viewed.body.signerName, signatureType: 'drawn', signatureValue: signature,
        signedDate: '2026-10-04', signedPlace: 'Synthetic Signing Place', accepted: true, versionDigest: viewed.body.versionDigest }
      assert.equal((await request('sign', { ...fields, signedName: 'Unrelated Person' })).status, 400)
      assert.equal((await request('sign', { ...fields, versionDigest: item.document.versionDigest })).status, 409)
      const signed = await request('sign', fields)
      assert.equal(signed.status, 200, JSON.stringify(signed.body))
      assert.equal(signed.body.allRequiredSignersComplete, index === item.recipients.length - 1)
      const beforeRetry = await sql(`select id from ${evidenceTable} where signing_document_id=$1`, [item.id])
      assert.equal((await request('sign', fields)).status, 404)
      assert.deepEqual(await sql(`select id from ${evidenceTable} where signing_document_id=$1`, [item.id]), beforeRetry)
      const versionsBefore = await sql(`select id,version_digest from ${signingTable} where private_listing_id=$1 order by id`, [fixture.listingId])
      const locked = await request('correct', { token: fica.recipients.at(-1).token, versionDigest: correction.body.versionDigest, corrections: sellerCorrectionValues(fixture.copy, fica.document.key) })
      assert.ok([404, 409].includes(locked.status), 'The first signature must lock every copy; completed links become unavailable')
      assert.deepEqual(await sql(`select id,version_digest from ${signingTable} where private_listing_id=$1 order by id`, [fixture.listingId]), versionsBefore)
      if (!signed.body.allRequiredSignersComplete) {
        assert.equal((await request('preview', { signingDocumentId: item.id }, true)).status, 409)
        assert.equal((await request('review', { signingDocumentId: item.id }, true)).status, 409)
        assert.equal((await sql('select status from private_listing_document_requirements where private_listing_id=$1 and requirement_key=$2', [fixture.listingId, item.document.key]))[0].status, 'required')
      }
    }
    const preview = await request('preview', { signingDocumentId: item.id }, true)
    assert.equal(preview.status, 200, JSON.stringify(preview.body))
    assert.match(preview.body.signedHtml, /Electronic signatures/)
    for (const recipient of item.recipients) assert.ok(preview.body.signedHtml.includes(recipient.signer_email === 'primary@example.test' ? 'Corrected Primary' : recipient.signer_name))
    await download(preview.body.signedHtml, `${name}-final`, { signed: true })
    assert.equal((await request('review', { signingDocumentId: item.id })).status, 403)
    const reviewed = await request('review', { signingDocumentId: item.id }, true)
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body))
    const persisted = (await sql('select * from private_listing_documents where id=$1', [reviewed.body.documentId]))[0]
    assert.equal(persisted.generated_html, preview.body.signedHtml)
    assert.equal(persisted.reviewed_signing_version_digest, preview.body.versionDigest)
    assert.equal((await request('review', { signingDocumentId: item.id }, true)).status, 409)
    await assert.rejects(sql('update private_listing_documents set generated_html=$1 where id=$2', ['TAMPERED', reviewed.body.documentId]), /immutable/)
  }
  await assertCompleted(fixture)
  report.push({ route: 'digital', branch, mandateType, documents: 3, signatures: issued.reduce((sum, item) => sum + item.recipients.length, 0), result: 'passed' })
  console.log(`${branch}/${mandateType}: saved → reopened → generated → corrected → downloaded → all signers → reviewed → reopened`)
}

async function installEdge(runtime) {
  const edge = await build({ absWorkingDir: appRoot, entryPoints: ['../supabase/functions/seller-portal-document-signing/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [runtime.plugin, { name: 'local-journey-infrastructure', setup(builder) {
      builder.onResolve({ filter: /^(supabase|jsr:)|send-email\// }, args => ({ path: args.path, namespace: 'synthetic' }))
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: args.path === 'supabase' ? 'export const createClient = () => globalThis.__sellerJourneyAdmin;'
        : args.path.startsWith('jsr:') ? '' : `
          export const sendViaResendApi = async options => globalThis.__sellerJourneyEmail(options);
          export const resolveAudienceEmailSender = async () => 'agency@example.test';
          export const resolveEmailBranding = async () => ({organisationName:'Synthetic Agency'});
          export const renderBridgeCta = () => ''; export const renderBridgeEmailLayout = () => '<p>Synthetic email</p>';
          export const renderBridgeIntroParagraphs = () => '';
        ` }))
    } }],
  })
  await import(`data:text/javascript;base64,${Buffer.from(edge.outputFiles[0].text).toString('base64')}#${randomUUID()}`)
  assert.equal(typeof handler, 'function')
}
async function fullMandateJourney(runtime, mandateType) {
  await installEdge(runtime)
  const listingId = randomUUID(), signingPack = structuredClone(runtime.packs[mandateType]), api = runtime.api
  const approval = { status: 'approved', signingRoute: 'digital_pack', selectedDocuments: ['mandate'], commission: { confirmed: true } }
  const prepared = api.createSellerOnboardingSigningCopyPack({ signingPack, formalPackApproval: approval, disclosureSigned: true, actor, generatedAt: signingPack.frozenAt })
  const frozen = await api.createSellerReviewedDocumentVersions({ manualSigningPack: prepared, formalPackApproval: approval, signingPack, actor, approvedAt: signingPack.frozenAt })
  prepared.documents = frozen.documents
  const source = { sellerOnboardingReview: { status: 'approved' }, sellerOnboardingFormalPackApproval: approval,
    sellerOnboardingManualSigningPack: prepared, sellerReviewedDocumentVersions: api.buildSellerReviewedDocumentVersionIndex(frozen) }
  await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [listingId, organisation, actor])
  await sql('insert into private_listing_seller_onboarding(private_listing_id,token,form_data,status) values($1,$2,$3,$4)', [listingId, `full-mandate-${randomUUID()}`, encode(source), 'completed'])
  await sql('insert into private_listing_document_requirements(private_listing_id,requirement_key,requirement_name) values($1,$2,$2)', [listingId, 'signed_mandate'])
  const sent = await request('issue', { listingId, documentKey: 'signed_mandate' }, true)
  assert.equal(sent.status, 200, JSON.stringify(sent.body))
  const id = sent.body.signingDocumentId, recipients = await issuedRecipients(id)
  assert.equal(recipients.length, mandateType === 'dual' ? 4 : 3)
  // Reconcile the forward review migration around already-sent frozen copies.
  // It must not change their source, recipient links, hashes or evidence.
  const historySnapshot = async () => Promise.all([signingTable, recipientTable, evidenceTable, 'private_listing_seller_onboarding',
    'private_listing_documents', 'private_listing_document_requirements']
    .map(table => sql(`select * from ${table} order by id`)))
  const migration = await fs.readFile(new URL('../../supabase/migrations/20261004121736_seller_document_review_runtime_reconciliation.sql', import.meta.url), 'utf8')
  const beforeMigration = await historySnapshot()
  await db.exec(migration)
  assert.deepEqual(await historySnapshot(), beforeMigration)
  // Simulate renewal: the trusted old wording is archived and the next wording
  // is still pending. Existing requests continue, but old copies cannot start
  // new requests. No approval is inferred from the stored document itself.
  const nextRuntime = await createSyntheticMandateSigningRuntime({ archiveRuntime: runtime })
  await installEdge(nextRuntime)
  const unissuedListing = randomUUID()
  await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [unissuedListing, organisation, actor])
  await sql('insert into private_listing_seller_onboarding(private_listing_id,token,form_data,status) values($1,$2,$3,$4)', [unissuedListing, `archived-${randomUUID()}`, encode(source), 'completed'])
  const beforeArchivedIssue = await historySnapshot(), beforeEmails = emails.length
  const archivedIssue = await request('issue', { listingId: unissuedListing, documentKey: 'signed_mandate' }, true)
  assert.equal(archivedIssue.status, 409)
  assert.match(archivedIssue.body.error, /currently approved mandate wording/)
  assert.deepEqual(await historySnapshot(), beforeArchivedIssue)
  assert.equal(emails.length, beforeEmails)
  const downgradedSource = structuredClone(source), downgraded = downgradedSource.sellerOnboardingManualSigningPack.documents[0]
  delete downgraded.mandateContract
  delete downgraded.mandateTerms.mandateCapture
  downgraded.generatedHtml = '<p>Legacy-looking substitute</p>'
  downgraded.requiredSigners = downgraded.requiredSigners.filter(signer => !signer.role.startsWith('Agency'))
  downgraded.contentDigest = await api.mandateDigest(downgraded.generatedHtml)
  downgraded.versionDigest = await api.computeSellerReviewedDocumentVersionDigest(downgraded)
  downgradedSource.sellerReviewedDocumentVersions = api.buildSellerReviewedDocumentVersionIndex({ ...frozen, documents: [downgraded] })
  await sql('update private_listing_seller_onboarding set form_data=$1 where private_listing_id=$2', [encode(downgradedSource), unissuedListing])
  const beforeDowngradeIssue = await historySnapshot()
  const downgradeIssue = await request('issue', { listingId: unissuedListing, documentKey: 'signed_mandate' }, true)
  assert.equal(downgradeIssue.status, 409)
  assert.match(downgradeIssue.body.error, /Approve and freeze/)
  assert.deepEqual(await historySnapshot(), beforeDowngradeIssue)
  assert.equal(emails.length, beforeEmails)
  // The database returns recipients without order guarantees. Sellers sign,
  // then Agency A, then Agency B to exercise the Dual completion boundary.
  recipients.sort((a, b) => (a.signer_role.startsWith('Agency') ? 1 : 0) - (b.signer_role.startsWith('Agency') ? 1 : 0) || a.signer_role.localeCompare(b.signer_role))
  const initial = await request('view', { token: recipients[0].token })
  assert.equal(initial.status, 200)
  assert.equal(initial.body.canEdit, false)
  assert.equal(initial.body.editData, null)
  const screenReview = await page.evaluate(async html => {
    const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-same-origin'); frame.style.width = '100%'
    const loaded = new Promise(resolve => { frame.onload = resolve }); frame.srcdoc = html; document.body.appendChild(frame)
    await loaded; await (await import('/runtime.js')).prepareSellerMandateReviewPreview(frame)
    const doc = frame.contentDocument, root = doc.querySelector('[data-review-layout]')
    const result = { paginated: root.dataset.reviewPaginated, pages: root.querySelectorAll('.mandate-review-page').length,
      overflowing: doc.documentElement.scrollWidth > frame.clientWidth + 1, signatures: root.querySelectorAll('[data-mandate-signer]').length,
      body: root.textContent }
    frame.remove(); return result
  }, initial.body.reviewedHtml)
  assert.equal(screenReview.paginated, 'true')
  assert.equal(screenReview.overflowing, false, 'The sandboxed mobile view must show the full readable mandate')
  assert.equal(screenReview.signatures, recipients.length)
  assert.ok(screenReview.pages >= 7)
  assert.ok(screenReview.body.includes('7 '))
  assert.equal((await request('correct', { token: recipients[0].token, versionDigest: initial.body.versionDigest, corrections: { common: {} } })).status, 409)
  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index]
    const viewed = await request('view', { token: recipient.token, documentKey: 'signed_fica_declaration' })
    assert.equal(viewed.status, 200, JSON.stringify(viewed.body))
    assert.equal(viewed.body.documentKey, 'signed_mandate', 'An agency token accesses only its mandate, never FICA')
    assert.equal(viewed.body.versionDigest, frozen.documents[0].versionDigest)
    assert.match(viewed.body.reviewedHtml, /data-mandate-signing-copy="full-v1"/)
    const signed = await request('sign', { token: recipient.token, signedName: viewed.body.signerName, signatureType: 'drawn', signatureValue: signature,
      signedDate: '2026-10-04', signedPlace: 'Synthetic Signing Place', accepted: true, versionDigest: viewed.body.versionDigest })
    assert.equal(signed.status, 200, JSON.stringify(signed.body))
    assert.equal(signed.body.allRequiredSignersComplete, index === recipients.length - 1)
    if (index === 0) {
      const partialHistory = await historySnapshot()
      await db.exec(migration)
      assert.deepEqual(await historySnapshot(), partialHistory, 'Forward reconciliation preserves partial signature evidence')
    }
    if (index < recipients.length - 1) {
      assert.equal((await request('preview', { signingDocumentId: id }, true)).status, 409)
      assert.equal((await request('review', { signingDocumentId: id }, true)).status, 409)
      assert.equal((await sql('select status from private_listing_document_requirements where private_listing_id=$1', [listingId]))[0].status, 'required')
    }
  }
  const signedHistory = await historySnapshot()
  await db.exec(migration)
  assert.deepEqual(await historySnapshot(), signedHistory, 'Forward reconciliation preserves fully signed mandates awaiting review')
  const preview = await request('preview', { signingDocumentId: id }, true)
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.doesNotMatch(preview.body.signedHtml, /class="review-signature-lines"/)
  assert.equal((preview.body.signedHtml.match(/class="mandate-recorded-signature"/g) || []).length, recipients.length)
  for (const recipient of recipients) assert.ok(preview.body.signedHtml.includes(`Signed by ${recipient.signer_name} as ${recipient.signer_role}`))
  await download(preview.body.signedHtml, `full-${mandateType}-accepted-mandate`, { signed: true, logoColour: [36, 84, 76] })
  assert.equal((await request('review', { signingDocumentId: id }, true)).status, 200)
  const completedHistory = await historySnapshot()
  await db.exec(migration)
  assert.deepEqual(await historySnapshot(), completedHistory, 'Forward reconciliation preserves completed and reviewed mandates')
  assert.deepEqual((await reopened(listingId)).sellerOnboarding.formData.sellerOnboardingManualSigningPack, prepared, 'The signed/reviewed source retains every frozen byte')
  report.push({ branch: 'two_sellers_and_contracting_agencies', mandateType, route: 'digital_pack', fullWording: true, syntheticApprovalOnly: true,
    historicalRenewal: true, forwardMigrationPreservesHistory: true, recipients: recipients.length })
}
async function workspace(listingId) {
  const listing = await reopened(listingId)
  listing.documents = await sql('select * from private_listing_documents where private_listing_id=$1', [listingId])
  listing.documentRequirements = await sql('select * from private_listing_document_requirements where private_listing_id=$1', [listingId])
  return { listing, source: buildSellerDocumentSourceOfTruth({ listing, formData: listing.sellerOnboarding.formData }) }
}

async function signInBrowser(recipient, name, { fullMandate = false, correctFica = false } = {}) {
  await portalPage.goto(`${baseUrl}/seller/sign/${encodeURIComponent(recipient.token)}`)
  await portalPage.getByRole('heading', { name: /Review and sign/ }).waitFor()
  const submit = portalPage.getByRole('button', { name: 'Sign this document', exact: true })
  assert.equal(await submit.isDisabled(), true)
  const frame = portalPage.frames().find(value => value !== portalPage.mainFrame())
  assert.ok(frame)
  if (fullMandate) {
    await frame.locator('[data-review-paginated="true"]').waitFor()
    assert.equal(await portalPage.getByRole('button', { name: 'Save and review changes' }).count(), 0)
    await portalPage.getByText('These details are frozen into the mandate.', { exact: false }).waitFor()
    assert.equal(await frame.locator('[data-mandate-signer]').count(), (await sql('select required_signers from private_listing_seller_portal_signing_documents where id=$1', [recipient.signing_document_id]))[0].required_signers.length)
  }
  if (correctFica) {
    await portalPage.getByLabel('Income tax number', { exact: true }).fill('BROWSER-CONFIRMED-TAX')
    assert.equal(await submit.isDisabled(), true, 'Unsaved corrections prevent signature submission')
    await portalPage.getByRole('button', { name: 'Save and review changes', exact: true }).click()
    await portalPage.waitForFunction(() => document.querySelector('button') && [...document.querySelectorAll('button')].some(button => button.textContent === 'Save and review changes' && button.disabled))
  }
  assert.equal(await portalPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'The actual mobile signing page must fit the viewport')
  assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'The actual mobile document review must fit the viewport')
  const accepted = portalPage.getByRole('checkbox', { name: /I have reviewed this complete document/ })
  if (recipient.signer_role.startsWith('Agency')) assert.equal(await portalPage.getByRole('checkbox', { name: /I accept the mandate on behalf of the contracting agency/ }).count(), 1)
  await accepted.check()
  await portalPage.getByLabel('Date of signature', { exact: true }).fill('2026-10-04')
  await portalPage.getByLabel('Place of signature', { exact: true }).fill('Browser Acceptance Town')
  assert.equal(await submit.isDisabled(), true, 'A checkbox and typed details alone are not signature evidence')
  const canvas = portalPage.getByLabel(`Signature box for ${recipient.signer_name}`, { exact: true })
  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  await portalPage.mouse.move(bounds.x + 16, bounds.y + 100)
  await portalPage.mouse.down()
  for (let step = 1; step <= 20; step++) await portalPage.mouse.move(bounds.x + 16 + step * (bounds.width - 40) / 20, bounds.y + 85 + Math.sin(step / 2) * 30)
  await portalPage.mouse.up()
  await portalPage.getByLabel('Confirm your full name', { exact: true }).fill('Wrong Signer')
  assert.equal(await submit.isDisabled(), true, 'The public page requires the frozen named recipient')
  await portalPage.getByLabel('Confirm your full name', { exact: true }).fill(recipient.signer_name)
  await portalPage.screenshot({ path: path.join(output, `${name}-mobile.png`), fullPage: true })
  await submit.click()
  await portalPage.getByRole('heading', { name: 'Signature received', exact: true }).waitFor()
  const evidence = (await sql(`select * from ${evidenceTable} where signing_document_id=$1 and recipient_id=$2`, [recipient.signing_document_id, recipient.id]))[0]
  assert.equal(evidence.signature_type, 'drawn')
  assert.match(evidence.signature_value, /^data:image\/png;base64,/)
  assert.ok(evidence.signature_value.length > 1000)
  assert.equal(evidence.signed_place, 'Browser Acceptance Town')
  assert.equal((await request('view', { token: recipient.token })).status, 404)
  browserSignatures++
}

async function completeConnectedDigital(fixture, document, { browserSign = false, correctFica = false } = {}) {
  const sent = await request('issue', { listingId: fixture.listingId, documentKey: document.key }, true)
  assert.equal(sent.status, 200, JSON.stringify(sent.body))
  const recipients = await issuedRecipients(sent.body.signingDocumentId)
  recipients.sort((a, b) => Number(a.signer_role.startsWith('Agency')) - Number(b.signer_role.startsWith('Agency')) || a.signer_email.localeCompare(b.signer_email))
  assert.equal(recipients.length, document.requiredSigners.length)
  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index]
    if (browserSign && (index === 0 || recipient.signer_role.startsWith('Agency'))) {
      await signInBrowser(recipient, `connected-${fixture.branch}-${document.key}-${index}`, { fullMandate: document.key === 'signed_mandate', correctFica: correctFica && index === 0 })
    } else {
      const view = await request('view', { token: recipient.token })
      const signed = await request('sign', { token: recipient.token, signedName: recipient.signer_name, signatureType: 'drawn', signatureValue: signature,
        signedDate: '2026-10-04', signedPlace: 'Connected Acceptance Town', accepted: true, versionDigest: view.body.versionDigest })
      assert.equal(signed.status, 200, JSON.stringify(signed.body))
    }
    if (index < recipients.length - 1) {
      assert.equal((await request('preview', { signingDocumentId: sent.body.signingDocumentId }, true)).status, 409)
      assert.equal((await request('review', { signingDocumentId: sent.body.signingDocumentId }, true)).status, 409)
    }
  }
  const preview = await request('preview', { signingDocumentId: sent.body.signingDocumentId }, true)
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  const evidence = await sql(`select signature_value from ${evidenceTable} where signing_document_id=$1`, [sent.body.signingDocumentId])
  for (const row of evidence) assert.ok(preview.body.signedHtml.includes(row.signature_value), 'Every saved drawn signature is included in the final HTML')
  await download(preview.body.signedHtml, `connected-${fixture.branch}-${document.key}-final`, { signed: evidence.some(row => row.signature_value === signature), logoColour: [36, 84, 76] })
  assert.equal((await request('review', { signingDocumentId: sent.body.signingDocumentId }, true)).status, 200)
  return (await sql('select id from private_listing_documents where private_listing_id=$1 and document_type=$2', [fixture.listingId, document.key]))[0].id
}

async function portalUploadService(fixture) {
  // Execute the existing upload action with only its session/Storage and
  // non-transactional transport dependencies replaced. Its RPC is real SQL.
  const source = await fs.readFile(path.join(appRoot, 'src/services/privateListingService.js'), 'utf8')
  const start = source.indexOf('export async function uploadSellerClientPortalDocument(')
  const end = source.indexOf('export const __privateListingServiceTestUtils', start)
  assert.ok(start >= 0 && end > start)
  const classifierStart = source.indexOf('export function isSellerPortalSessionExpiredError(')
  const classifierEnd = source.indexOf('\nfunction normalizeKey(', classifierStart)
  assert.ok(classifierStart >= 0 && classifierEnd > classifierStart)
  const normalizeKey = value => String(value ?? '').trim().toLowerCase()
  const isSellerPortalSessionExpiredError = Function('normalizeKey',
    `${source.slice(classifierStart, classifierEnd).replace('export function', 'function')}\nreturn isSellerPortalSessionExpiredError`,
  )(normalizeKey)
  const events = { uploads: 0, removals: 0, commands: [] }
  const client = { async rpc(name, params) {
    events.commands.push({ name, params })
    assert.equal(name, 'bridge_upload_private_listing_seller_signed_copy')
    const argumentsInOrder = ['p_token', 'p_requirement_key', 'p_document_name', 'p_storage_path', 'p_file_url', 'p_document_type',
      'p_canonical_requirement_instance_id', 'p_category', 'p_access_token', 'p_reviewed_signing_version_id', 'p_reviewed_signing_version_digest']
    try { return { data: (await sql(`select ${name}(${argumentsInOrder.map((_, index) => `$${index + 1}`).join(',')}) as result`, argumentsInOrder.map(key => params[key])))[0].result } }
    catch (error) { return { error } }
  } }
  const scope = {
    runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
    normalizeKey, isSellerPortalSessionExpiredError,
    requireClient: () => client, normalizeText: value => String(value ?? '').trim(), normalizeUuid: value => value || '',
    getStoredSellerPortalAccessToken: () => '', getSellerPortalSignedUploadReference: fixture.api.getSellerPortalSignedUploadReference,
    getSellerOnboardingByToken: async () => { const opened = await workspace(fixture.listingId); return { listing: opened.listing, onboardingFormData: { formData: opened.listing.sellerOnboarding.formData } } },
    requireSellerPortalStorageClient: () => ({}), validateDocumentUploadFile: file => ({ safeName: file.name }),
    resolveExactSellerRequirement: ({ requirements, requirementKey }) => requirements.find(row => row.requirement_key === requirementKey),
    assertSellerUploadTarget: () => {}, sanitizeDocumentFileName: value => value,
    uploadToPrivateListingDocumentsBucket: async () => { events.uploads++; return 'synthetic-storage' },
    removePrivateListingDocumentObject: async () => { events.removals++ }, normalizeDocumentRows: rows => rows,
    linkUploadedDocumentToRequirement: async () => { throw new Error('Unexpected canonical-instance transport') },
    syncSellerJourneyLeadStageForListingId: async () => {}, linkSellerPortalDocumentRequestUpload: async () => null,
    buildPrivateListingDocumentPersistenceReceipt: value => value, createPrivateListingDocumentSignedUrl: async () => 'synthetic-private-file',
  }
  const action = Function(...Object.keys(scope), `${source.slice(start, end).replace('export async function', 'async function')}\nreturn uploadSellerClientPortalDocument`)(...Object.values(scope))
  return { action, events }
}

async function completeConnectedPhysical(fixture, document) {
  const onboarding = (await sql('select token from private_listing_seller_onboarding where private_listing_id=$1', [fixture.listingId]))[0]
  const bytesPath = await download(document.generatedHtml, `connected-${fixture.branch}-${document.key}-physical`, { logoColour: [36, 84, 76] })
  const form = (await reopened(fixture.listingId)).sellerOnboarding.formData
  const reference = await fixture.api.getSellerPortalSignedUploadReference(form, document.key)
  const before = await sql('select * from private_listing_documents where private_listing_id=$1 order by id', [fixture.listingId])
  const beforeRequirements = await sql('select * from private_listing_document_requirements where private_listing_id=$1 order by id', [fixture.listingId])
  const params = [onboarding.token, document.key, 'returned-synthetic.pdf', `synthetic/${fixture.listingId}/${document.key}.pdf`, null,
    document.key, null, 'Seller Document', null, reference.reviewedSigningVersionId, reference.reviewedSigningVersionDigest]
  await assert.rejects(sql('select bridge_upload_private_listing_seller_signed_copy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [...params.slice(0, 10), `sha256:${'0'.repeat(64)}`]), /does not match the current reviewed signing copy/)
  await assert.rejects(sql('select bridge_upload_private_listing_seller_signed_copy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [...params.slice(0, 9), null, null]), /exact reviewed document version/)
  await sql("update private_listing_seller_onboarding set form_data=jsonb_set(form_data,'{sellerOnboardingFormalPackApproval,status}','\"draft\"') where private_listing_id=$1", [fixture.listingId])
  await assert.rejects(sql('select bridge_upload_private_listing_seller_signed_copy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', params), /Approve the seller onboarding/)
  await sql('update private_listing_seller_onboarding set form_data=$1 where private_listing_id=$2', [encode(form), fixture.listingId])
  await sql("update private_listing_seller_onboarding set seller_portal_password_hash='synthetic-protected' where private_listing_id=$1", [fixture.listingId])
  await assert.rejects(sql('select bridge_upload_private_listing_seller_signed_copy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', params), /session has expired/)
  await sql('update private_listing_seller_onboarding set seller_portal_password_hash=null where private_listing_id=$1', [fixture.listingId])
  assert.deepEqual(await sql('select * from private_listing_documents where private_listing_id=$1 order by id', [fixture.listingId]), before, 'A stale signing upload rolls back its record and linking')
  assert.deepEqual(await sql('select * from private_listing_document_requirements where private_listing_id=$1 order by id', [fixture.listingId]), beforeRequirements, 'Rejected uploads do not change requirement completion')
  const service = await portalUploadService(fixture)
  const uploadValues = { token: onboarding.token, requirementKey: document.key, documentType: document.key,
    file: new File([await fs.readFile(bytesPath)], 'returned-synthetic.pdf', { type: 'application/pdf' }), ...reference }
  await assert.rejects(service.action({ ...uploadValues, reviewedSigningVersionDigest: `sha256:${'0'.repeat(64)}` }), /Reopen the current signing copy/)
  assert.equal(service.events.uploads, 0, 'A copy changed since opening must be rejected before Storage')
  await sql("update private_listing_seller_onboarding set seller_portal_password_hash='synthetic-protected' where private_listing_id=$1", [fixture.listingId])
  await assert.rejects(service.action(uploadValues), error => error.code === 'seller_portal_session_expired')
  assert.equal(service.events.removals, 1, 'Failed SQL submission cleans up its synthetic Storage object')
  await sql('update private_listing_seller_onboarding set seller_portal_password_hash=null where private_listing_id=$1', [fixture.listingId])
  const uploaded = await service.action(uploadValues)
  assert.equal(uploaded.status, 'uploaded')
  const stored = (await sql('select * from private_listing_documents where id=$1', [uploaded.id]))[0]
  assert.equal(stored.reviewed_signing_version_id, reference.reviewedSigningVersionId)
  assert.equal(stored.reviewed_signing_version_digest, reference.reviewedSigningVersionDigest)
  await reviewPhysicalInBrowser(uploaded.id, document.key)
  return uploaded.id
}

async function reviewPhysicalInBrowser(documentId, documentKey) {
  await portalPage.goto(`${baseUrl}/review/${documentId}`)
  await portalPage.getByRole('button', { name: 'Approve', exact: true }).click()
  const approve = portalPage.getByRole('button', { name: 'Approve signed copy', exact: true })
  assert.equal(await approve.isDisabled(), true)
  const attestation = portalPage.getByRole('checkbox', { name: documentKey === 'signed_mandate' ? /each contracting agency acceptance/ : /every required seller/ })
  await attestation.check()
  await approve.click()
  await portalPage.getByRole('status').waitFor()
  assert.equal(await portalPage.getByRole('status').textContent(), 'Signed copy approved')
  const events = await sql('select reason from seller_document_review_events where document_id=$1', [documentId])
  assert.equal(events.length, 1)
  if (documentKey === 'signed_mandate') assert.match(events[0].reason, /every required seller signature and each contracting agency acceptance/)
  browserPhysicalReviews++
}

async function existingSignedJourney() {
  const fixture = await prepare('individual', 'sole', 'manual_upload', { agentAssisted: true })
  const original = (await reopened(fixture.listingId)).sellerOnboarding.formData.sellerOnboardingManualSigningPack
  for (const document of fixture.frozen.documents) {
    const bytesPath = await download(document.generatedHtml, `existing-${document.key}-prepared`)
    assert.ok((await fs.stat(bytesPath)).size > 10000)
    const requirement = (await sql('select id from private_listing_document_requirements where private_listing_id=$1 and requirement_key=$2', [fixture.listingId, document.key]))[0]
    // The stored file represents a synthetic externally signed copy. Auth and
    // Storage transport are fixtures; the evidence and review guards are real SQL.
    const uploaded = (await sql(`insert into private_listing_documents(private_listing_id,requirement_id,document_type,status,storage_path,uploaded_by,seller_signing_evidence_source)
      values($1,$2,$3,'uploaded',$4,$5,'existing_signed_upload') returning *`,
    [fixture.listingId, requirement.id, document.key, `synthetic/existing/${fixture.listingId}/${document.key}.pdf`, actor]))[0]
    assert.equal(uploaded.reviewed_signing_version_id, null)
    assert.equal(uploaded.reviewed_signing_version_digest, null)
    const pending = await workspace(fixture.listingId)
    const row = pending.source.rows.find(row => row.key === document.key)
    assert.equal(row.complete, false, 'An existing upload remains incomplete until its signatures are reviewed')
    assert.equal(buildSellerDocumentWorkflow({ item: row, copy: document }).state, 'review')
    assert.equal((await request('issue', { listingId: fixture.listingId, documentKey: document.key }, true)).status, 409,
      'The actual issuance handler must reject a conflicting pending signed upload')
    await reviewPhysicalInBrowser(uploaded.id, document.key)
    const reviewed = (await workspace(fixture.listingId)).source.rows.find(row => row.key === document.key)
    assert.equal(reviewed.complete, true)
    assert.equal(buildSellerDocumentWorkflow({ item: reviewed }).state, 'complete')
    assert.equal(reviewed.original.document.id, uploaded.id, 'Reopening uses the existing reviewed file rather than a generated unsigned copy')
    assert.equal(reviewed.original.document.seller_signing_evidence_source, 'existing_signed_upload')
    existingSignedUploads++
  }
  await assertCompleted(fixture)
  assert.deepEqual((await reopened(fixture.listingId)).sellerOnboarding.formData.sellerOnboardingManualSigningPack, original,
    'Reviewing independent evidence preserves every previously generated byte and version')
  assert.equal((await sql(`select count(*)::int as count from ${signingTable} where private_listing_id=$1`, [fixture.listingId]))[0].count, 0)
  report.push({ route: 'existing_signed_upload', branch: 'individual', mandateType: 'sole', agentAssisted: true, documents: 3, result: 'passed' })
  console.log('Agent-assisted disclosure saved unsigned → all three existing signed uploads → real browser signature review → complete on reopen; generated versions preserved')
}

async function connectedJourney(runtime, branch, mandateType, { physical = false, browserSign = false } = {}) {
  await installEdge(runtime)
  const listingId = randomUUID(), copy = createSellerCorrectionFixture(branch), api = runtime.api
  copy.form.titleDeedNumber = `TITLE-${branch.toUpperCase()}/2026`
  copy.form.erfNumber = `ERF-${branch.toUpperCase()}-123`
  const signingPack = buildSellerOnboardingSigningPackSnapshot({ formData: copy.form, listing: { id: listingId }, recipients: copy.signers,
    branding: structuredClone(runtime.packs[mandateType].branding), mandate: structuredClone(runtime.packs[mandateType].mandate), generatedAt: runtime.packs[mandateType].frozenAt })
  signingPack.mandate.mandateCapture.authority.capacity = branch === 'company' ? 'Director' : branch === 'trust' ? 'Trustee' : 'Registered owner'
  signingPack.mandate.mandateCapture.authority.details = `${branch}: all required owners or representatives sign under AUTH-CONNECTED-1.`
  signingPack.mandateAcceptanceReview = { ...runtime.packs[mandateType].mandateAcceptanceReview, authorityReference: 'AUTH-CONNECTED-1' }
  signingPack.disclosureReference = runtime.packs[mandateType].disclosureReference
  signingPack.frozenAt = runtime.packs[mandateType].frozenAt
  copy.form.propertyDisclosure.signature = ''; copy.form.propertyDisclosure.signedAt = ''
  Object.assign(copy.form, buildSellerMandateTermsFormPatch(signingPack.mandate))
  await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [listingId, organisation, actor])
  await sql('insert into private_listing_seller_onboarding(private_listing_id,token,form_data,status) values($1,$2,$3,$4)', [listingId, `connected-${randomUUID()}`, '{}', 'in_progress'])
  for (const key of keys) await sql('insert into private_listing_document_requirements(private_listing_id,requirement_key,requirement_name) values($1,$2,$2)', [listingId, key])
  await save(await reopened(listingId), copy.form)
  const opened = await reopened(listingId), savedForm = opened.sellerOnboarding.formData
  const drafts = buildSellerPostOnboardingDrafts({ formData: savedForm, listing: opened, branding: signingPack.branding })
  const approval = { ...copy.approval, signingRoute: 'digital_pack', selectedDocuments: ['fica'], documentRoutes: {
    signed_fica_declaration: 'digital_pack', signed_disclosure_form: physical ? 'manual_upload' : 'digital_pack', signed_mandate: physical ? 'manual_upload' : 'digital_pack' } }
  const prepared = api.createSellerOnboardingManualSigningPack({ signingPack, formData: savedForm, formalPackApproval: approval, postOnboardingDrafts: drafts, actor, generatedAt: signingPack.frozenAt })
  const frozen = await api.createSellerReviewedDocumentVersions({ manualSigningPack: prepared, formalPackApproval: approval, signingPack, actor })
  prepared.documents = frozen.documents
  assert.deepEqual(frozen.documents.map(row => row.key).sort(), keys.filter(key => key !== 'signed_mandate').sort())
  await save(opened, { sellerOnboardingReview: { status: 'approved' }, sellerOnboardingFormalPackApproval: approval,
    sellerOnboardingManualSigningPack: prepared, sellerReviewedDocumentVersions: api.buildSellerReviewedDocumentVersionIndex(frozen), sellerPostOnboardingDrafts: drafts })
  const fixture = { listingId, branch, mandateType, api }
  const fica = frozen.documents.find(row => row.key === 'signed_fica_declaration')
  const disclosure = frozen.documents.find(row => row.key === 'signed_disclosure_form')
  const ficaId = await completeConnectedDigital(fixture, fica, { browserSign, correctFica: browserSign && branch === 'individual' })
  const disclosureId = physical ? await completeConnectedPhysical(fixture, disclosure) : await completeConnectedDigital(fixture, disclosure, { browserSign })
  const completed = await workspace(listingId), form = completed.listing.sellerOnboarding.formData
  assert.equal(hasCompletedOnboardingDisclosureSignature(form), false, 'Final portal/physical evidence does not rewrite the original disclosure')
  assert.equal(hasCompletedSellerDisclosure({ formData: form, documentRows: completed.source.rows }), true)
  const preservedDocuments = await sql('select * from private_listing_documents where id in ($1,$2) order by id', [ficaId, disclosureId])
  const mandateApproval = { ...approval, selectedDocuments: ['mandate'], signingRoute: physical ? 'manual_upload' : 'digital_pack' }
  // Use the persisted copies after public corrections, exactly as the agent does.
  const current = form.sellerOnboardingManualSigningPack
  const updatedDrafts = buildSellerPostOnboardingDrafts({ formData: form, listing: completed.listing, branding: signingPack.branding })
  const mandatePack = api.createSellerOnboardingSigningCopyPack({ existing: current, signingPack, formalPackApproval: mandateApproval, postOnboardingDrafts: updatedDrafts,
    disclosureSigned: hasCompletedSellerDisclosure({ formData: form, documentRows: completed.source.rows }), actor, generatedAt: signingPack.frozenAt })
  const mandateVersions = await api.createSellerReviewedDocumentVersions({ existing: form.sellerReviewedDocumentVersions, manualSigningPack: mandatePack, formalPackApproval: mandateApproval, signingPack, actor })
  mandatePack.documents = mandateVersions.documents
  for (const key of ['signed_fica_declaration', 'signed_disclosure_form']) assert.deepEqual(mandatePack.documents.find(row => row.key === key), current.documents.find(row => row.key === key), 'Completing the mandate preserves every earlier frozen byte and version')
  await save(completed.listing, { sellerOnboardingFormalPackApproval: mandateApproval, sellerOnboardingManualSigningPack: mandatePack,
    sellerReviewedDocumentVersions: api.buildSellerReviewedDocumentVersionIndex(mandateVersions), sellerPostOnboardingDrafts: updatedDrafts })
  assert.deepEqual(await sql('select * from private_listing_documents where id in ($1,$2) order by id', [ficaId, disclosureId]), preservedDocuments)
  let mandate = mandatePack.documents.find(row => row.key === 'signed_mandate')
  assert.ok(mandate.mandateContract)
  assert.equal(mandate.requiredSigners.length, copy.signers.length + (mandateType === 'dual' ? 2 : 1))
  assert.ok(mandate.generatedHtml.includes(copy.form.titleDeedNumber), 'The saved title-deed reference must pull through')
  assert.ok(mandate.generatedHtml.includes(copy.form.erfNumber), 'The saved erf reference must pull through')
  for (const value of [signingPack.seller.legalOwnerName, signingPack.seller.legalOwnerIdentity, signingPack.property.address]) if (value) assert.ok(mandate.generatedHtml.includes(value), `${branch}: legal owner, identity and property must pull into the mandate`)
  if (branch === 'company') assert.match(mandate.generatedHtml, /Original Entity Holdings/)
  if (branch === 'trust') assert.match(mandate.generatedHtml, /Original Entity Trust/)
  if (mandateType === 'dual') {
    const firstIssue = await request('issue', { listingId, documentKey: 'signed_mandate' }, true)
    assert.equal(firstIssue.status, 200, JSON.stringify(firstIssue.body))
    const oldRecipients = await issuedRecipients(firstIssue.body.signingDocumentId)
    const seller = oldRecipients.find(row => !row.signer_role.startsWith('Agency'))
    assert.equal((await request('sign', { token: seller.token, signedName: seller.signer_name, signatureType: 'drawn', signatureValue: signature,
      signedDate: '2026-10-04', signedPlace: 'Original Copy Town', accepted: true, versionDigest: mandate.versionDigest })).status, 200)
    const originalEvidence = await sql(`select * from ${evidenceTable} where signing_document_id=$1`, [firstIssue.body.signingDocumentId])
    const originalCopy = structuredClone(mandate)
    signingPack.mandate.specialConditions = 'Synthetic replacement: all sellers and both agencies accept this revised condition.'
    const beforeReplacement = await reopened(listingId)
    const replacementPack = api.createSellerOnboardingSigningCopyPack({ existing: mandatePack, signingPack, formalPackApproval: mandateApproval,
      postOnboardingDrafts: updatedDrafts, disclosureSigned: true, actor, generatedAt: signingPack.frozenAt })
    const replacementVersions = await api.createSellerReviewedDocumentVersions({ existing: beforeReplacement.sellerOnboarding.formData.sellerReviewedDocumentVersions,
      manualSigningPack: replacementPack, formalPackApproval: mandateApproval, signingPack, actor })
    replacementPack.documents = replacementVersions.documents
    mandate = replacementPack.documents.find(row => row.key === 'signed_mandate')
    assert.notEqual(mandate.versionId, originalCopy.versionId)
    assert.ok(replacementPack.versionHistory.some(entry => entry.documents.some(row => row.versionId === originalCopy.versionId && row.generatedHtml === originalCopy.generatedHtml)))
    await save(beforeReplacement, { ...buildSellerMandateTermsFormPatch(signingPack.mandate), sellerOnboardingManualSigningPack: replacementPack,
      sellerReviewedDocumentVersions: api.buildSellerReviewedDocumentVersionIndex(replacementVersions) })
    // The following completion issues the replacement, which must revoke every
    // outstanding old link while retaining the original signature evidence.
    fixture.originalRequest = { id: firstIssue.body.signingDocumentId, recipients: oldRecipients, evidence: originalEvidence }
  }
  fixture.form = (await reopened(listingId)).sellerOnboarding.formData
  if (physical) await completeConnectedPhysical(fixture, mandate)
  else await completeConnectedDigital(fixture, mandate, { browserSign })
  if (fixture.originalRequest) {
    const original = fixture.originalRequest
    assert.equal((await sql(`select status from ${signingTable} where id=$1`, [original.id]))[0].status, 'revoked')
    for (const recipient of original.recipients) assert.equal((await request('view', { token: recipient.token })).status, 404)
    assert.equal((await request('review', { signingDocumentId: original.id }, true)).status, 409)
    assert.deepEqual(await sql(`select * from ${evidenceTable} where signing_document_id=$1`, [original.id]), original.evidence)
  }
  await assertCompleted(fixture)
  report.push({ branch, mandateType, route: physical ? 'mixed' : 'digital_pack', fullWording: true, documents: 3,
    sequentialPreparation: true, completedDisclosurePreserved: true, replacementPreservesEvidence: Boolean(fixture.originalRequest), publicBrowserSigning: browserSign, physicalReviewBrowser: physical, syntheticApprovalOnly: true })
  console.log(`${branch}/${mandateType}: FICA + disclosure completed → mandate prepared without replacing either → all signatures/review → all three downloadable`)
}

async function physicalJourney(branch, mandateType) {
  const fixture = await prepare(branch, mandateType, 'manual_upload')
  const onboarding = (await sql('select * from private_listing_seller_onboarding where private_listing_id=$1', [fixture.listingId]))[0]
  for (const document of fixture.frozen.documents) {
    const name = `physical-${branch}-${mandateType}-${document.key}`
    const bytesPath = await download(document.generatedHtml, name)
    assert.ok((await fs.stat(bytesPath)).size > 10000)
    // Local stored bytes represent a returned hard copy. A human verifies ink
    // and authority; the actual upload RPC and review guard verify its record.
    const storedPath = `synthetic/${fixture.listingId}/${document.key}.pdf`
    const uploaded = (await sql('select bridge_upload_private_listing_seller_document($1,$2,$3,$4) as result', [onboarding.token, document.key, `${name}.pdf`, storedPath]))[0].result
    assert.equal(uploaded.pending_transaction_promotion, true)
    assert.equal(uploaded.document.status, 'uploaded')
    const id = uploaded.document.id
    await sql('update private_listing_documents set reviewed_signing_version_id=$1,reviewed_signing_version_digest=$2 where id=$3', [document.versionId, 'stale-digest', id])
    await assert.rejects(sql("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures and authority checked',0)", [id]), error => error.code === '23514')
    assert.equal((await sql('select status from private_listing_documents where id=$1', [id]))[0].status, 'uploaded')
    await sql('update private_listing_documents set reviewed_signing_version_digest=$1 where id=$2', [document.versionDigest, id])
    await assert.rejects(sql("select bridge_review_private_listing_seller_document_p1_8($1,'approve',null,0)", [id]), error => error.code === '23514')
    const approval = (await sql("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures and authority checked',0) as result", [id]))[0].result
    assert.equal(approval.document.status, 'approved')
    assert.equal(approval.requirement.satisfied_by_document_id, id)
    const retry = (await sql("select bridge_review_private_listing_seller_document_p1_8($1,'approve','Signatures and authority checked',1) as result", [id]))[0].result
    assert.equal(retry.idempotent, true)
    assert.equal((await sql('select count(*)::int as count from seller_document_review_events where document_id=$1', [id]))[0].count, 1)
  }
  await assertCompleted(fixture)
  await sql('update private_listing_seller_onboarding set seller_portal_link_expires_at=$1 where private_listing_id=$2', ['2020-01-01', fixture.listingId])
  await assert.rejects(sql('select bridge_upload_private_listing_seller_document($1,$2,$3,$4)', [onboarding.token, 'signed_mandate', 'expired.pdf', 'synthetic/expired.pdf']), /invalid or inactive/)
  report.push({ route: 'physical', branch, mandateType, documents: 3, result: 'passed' })
  console.log(`${branch}/${mandateType}: saved → reopened → downloaded → upload RPC → current-version review → reopened; expired upload rejected`)
}
async function expiryAndDeliveryRetries() {
  const fixture = await prepare('multiple_owners', 'sole')
  deliveryFailure = true
  assert.equal((await request('issue', { listingId: fixture.listingId, documentKey: 'signed_mandate' }, true)).status, 502)
  const failed = (await sql(`select * from ${signingTable} where private_listing_id=$1`, [fixture.listingId]))[0]
  assert.equal(failed.status, 'revoked')
  assert.ok((await sql(`select status from ${recipientTable} where signing_document_id=$1`, [failed.id])).every(row => row.status === 'revoked'))
  deliveryFailure = false
  const retry = await request('issue', { listingId: fixture.listingId, documentKey: 'signed_mandate' }, true)
  assert.equal(retry.status, 200, JSON.stringify(retry.body))
  const recipients = await issuedRecipients(retry.body.signingDocumentId)
  await sql(`update ${recipientTable} set expires_at=$1 where signing_document_id=$2`, ['2020-01-01', retry.body.signingDocumentId])
  for (const action of ['view', 'correct', 'sign']) assert.equal((await request(action, { token: recipients[0].token })).status, 404)
  assert.equal((await sql(`select count(*)::int as count from ${evidenceTable} where signing_document_id=$1`, [retry.body.signingDocumentId]))[0].count, 0)
  const fresh = await request('issue', { listingId: fixture.listingId, documentKey: 'signed_mandate' }, true)
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body))
  assert.equal((await sql(`select status from ${signingTable} where id=$1`, [retry.body.signingDocumentId]))[0].status, 'expired')
  assert.equal((await request('view', { token: recipients[0].token })).status, 404)
  console.log('Delivery failure revokes every recipient; retry and expired-link replacement succeed without reactivating old links')
}
const previousDeno = globalThis.Deno, previousFetch = globalThis.fetch
try {
  await fs.mkdir(output, { recursive: true })
  await db.exec(await fs.readFile(new URL('./fixtures/seller-document-journey.sql', import.meta.url), 'utf8'))
  await sql('insert into auth.users values($1)', [actor]); await sql('insert into organisations values($1)', [organisation])
  await sql("select set_config('app.uid',$1,false),set_config('app.org',$2,false)", [actor, organisation])
  for (const file of ['20260924151653_listing_seller_canonical_update_phase2.sql', '20260927102934_seller_portal_document_signing_foundation.sql',
    '20260928092501_seller_portal_signature_place_and_date.sql', '20261004121736_seller_document_review_runtime_reconciliation.sql', '20260927122535_seller_physical_signing_version_review.sql', '20261009150000_seller_existing_signed_evidence.sql']) {
    await db.exec(await fs.readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  const uploadBase = await fs.readFile(new URL('../../supabase/migrations/202608090001_seller_portal_upload_rls_context_fix.sql', import.meta.url), 'utf8')
  const start = uploadBase.indexOf('create or replace function public.bridge_upload_private_listing_seller_document(')
  assert.ok(start >= 0)
  await db.exec(uploadBase.slice(start, uploadBase.indexOf('$$;', start) + 3))
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20260905090353_document_trust_phase1_seller_atomic_link.sql', import.meta.url), 'utf8'))
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261004181626_seller_portal_signed_upload_version_binding.sql', import.meta.url), 'utf8'))
  await mandateCapturePersistence()
  globalThis.__sellerJourneyAdmin = admin
  globalThis.__sellerJourneyEmail = options => {
    if (deliveryFailure && options.to === 'second@example.test') return { ok: false }
    emails.push(options); return { ok: true, data: { id: `synthetic-message-${emails.length}` } }
  }
  globalThis.fetch = () => { throw new Error('Remote requests are forbidden in this acceptance test') }
  globalThis.Deno = {
    env: { get: key => ({ SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', SUPABASE_ANON_KEY: 'synthetic-anon',
      SELLER_PORTAL_SIGNING_ENABLED: 'true', RESEND_API_KEY: 'synthetic-email', RESEND_FROM_EMAIL: 'agency@example.test', PUBLIC_APP_URL: 'https://synthetic.example.test' })[key] },
    serve: callback => { handler = callback },
  }
  const mandateRuntime = await createSyntheticMandateSigningRuntime()
  await installEdge(mandateRuntime)
  const exporter = await build({ absWorkingDir: appRoot, stdin: { contents: "export { downloadHtmlDocumentPdf } from './src/lib/htmlDocumentPdf.js'; export { prepareSellerMandateReviewPreview } from './src/lib/sellerMandateReviewPreview.js';", resolveDir: appRoot }, bundle: true, platform: 'browser', format: 'esm', write: false })
  const signingUi = await build({ absWorkingDir: appRoot, entryPoints: ['scripts/fixtures/seller-document-journey-browser.jsx'],
    bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'local-public-transport-only', setup(builder) {
      builder.onLoad({ filter: /supabaseClient\.js$/ }, () => ({ loader: 'js', contents: `
        export const supabase = { functions: { async invoke(name, { body }) {
          if (name !== 'seller-portal-document-signing') throw new Error('Unexpected public function');
          const response = await fetch('/api/signing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          const data = await response.json();
          return { data, error: response.ok ? null : { message: data.error, context: { json: async () => data } } };
        } } };` }))
    } }] })
  const css = await postcss([tailwindcss({ ...tailwindConfig, content: [path.join(appRoot, 'src/**/*.{js,jsx,ts,tsx}')] }), autoprefixer()])
    .process(await fs.readFile(path.join(appRoot, 'src/index.css'), 'utf8'), { from: path.join(appRoot, 'src/index.css') })
  server = createServer(async (incoming, response) => {
    const url = new URL(incoming.url, 'http://localhost')
    const sendJson = (status, value) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    try {
      if (url.pathname.startsWith('/api/')) {
        let body = ''
        for await (const chunk of incoming) { body += chunk; assert.ok(body.length < 1000000) }
        const values = body ? JSON.parse(body) : {}
        if (url.pathname === '/api/signing') {
          assert.ok(['view', 'correct', 'sign'].includes(values.action), 'Only public signing actions use this browser transport')
          const result = await request(values.action, values)
          return sendJson(result.status, result.body)
        }
        if (url.pathname === '/api/physical-review') {
          if (incoming.method === 'GET') return sendJson(200, { document: (await sql('select * from private_listing_documents where id=$1', [url.searchParams.get('id')]))[0] })
          const result = (await sql('select bridge_review_private_listing_seller_document_p1_8($1,$2,$3,$4) as result',
            [values.documentId, values.action, values.reason, values.expectedVersion]))[0].result
          return sendJson(200, result)
        }
        return sendJson(404, { error: 'Unknown local transport' })
      }
      if (url.pathname === '/runtime.js') return response.writeHead(200, { 'content-type': 'text/javascript' }).end(exporter.outputFiles[0].text)
      if (url.pathname === '/signing-ui.js') return response.writeHead(200, { 'content-type': 'text/javascript' }).end(signingUi.outputFiles[0].text)
      if (url.pathname === '/app.css') return response.writeHead(200, { 'content-type': 'text/css' }).end(css.css)
      response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div>' +
        (url.pathname === '/' ? '<p>Local seller journey verification</p>' : '<script type="module" src="/signing-ui.js"></script>') + '</body></html>')
    } catch (error) { sendJson(400, { error: error.message }) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', route => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort('blockedbyclient'))
  page = await context.newPage(); page.on('pageerror', error => browserErrors.push(error.message))
  portalPage = await context.newPage(); portalPage.on('pageerror', error => browserErrors.push(error.message))
  await page.goto(baseUrl)
  signature = await page.evaluate(async () => {
    window.downloadPdf = (await import('/runtime.js')).downloadHtmlDocumentPdf
    const canvas = document.createElement('canvas'); canvas.width = 280; canvas.height = 90
    const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#1234ef'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(12, 60); ctx.bezierCurveTo(75, 5, 60, 85, 132, 40); ctx.bezierCurveTo(140, 10, 180, 75, 260, 30); ctx.stroke()
    return canvas.toDataURL('image/png')
  })
  if (!process.argv.includes('--full-mandates-only') && !process.argv.includes('--connected-only')) {
    for (const [branch, mandateType] of [['individual', 'sole'], ['multiple_owners', 'dual'], ['company', 'exclusive'], ['trust', 'open']]) await digitalJourney(branch, mandateType)
    for (const [branch, mandateType] of [['individual', 'exclusive'], ['multiple_owners', 'open'], ['company', 'dual'], ['trust', 'sole']]) await physicalJourney(branch, mandateType)
    await expiryAndDeliveryRetries()
    await existingSignedJourney()
  }
  if (!process.argv.includes('--connected-only')) for (const mandateType of ['sole', 'open', 'dual']) await fullMandateJourney(mandateRuntime, mandateType)
  if (!process.argv.includes('--full-mandates-only')) {
    const branchFilter = process.argv.find(value => value.startsWith('--branch='))?.slice('--branch='.length)
    for (const [branch, type, options] of [['individual', 'sole', { browserSign: true }], ['company', 'open', {}],
      ['multiple_owners', 'dual', { browserSign: true }], ['trust', 'sole', { physical: true }]]) {
      if (!branchFilter || branch === branchFilter) await connectedJourney(mandateRuntime, branch, type, options)
    }
  }
  assert.deepEqual(browserErrors, [])
  await rehearseSellerDocumentRollback()
  assert.equal((await collectSellerReleaseSource(path.resolve(appRoot, '..'), await collectSellerSigningBundle())).fingerprint,
    sourceFingerprint, 'Seller release source changed during acceptance; rerun against the final source')
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ result: 'passed', localOnly: true, sourceFingerprint,
    verifiedAt: new Date().toISOString(), downloads, downloadedPages, browserSignatures, browserPhysicalReviews,
    existingSignedUploads, agentAssistedCaptures, journeys: report,
    boundaries: ['synthetic auth/session', 'email transport', 'Storage bytes', 'pre-transaction promotion'],
    localRollbackVerified: true, pendingHostedAcceptance: true, fullMigrationChainVerified: false }, null, 2))
  console.log(`Seller document journey passed: ${report.length} journeys, ${downloads} actual PDF downloads (${downloadedPages} pages), corrections, expired links and retries. No remote writes or email delivery.`)
} finally {
  globalThis.Deno = previousDeno; globalThis.fetch = previousFetch
  delete globalThis.__sellerJourneyAdmin; delete globalThis.__sellerJourneyEmail
  await browser?.close()
  if (server?.listening) await new Promise(resolve => server.close(resolve))
  await db.close()
}
