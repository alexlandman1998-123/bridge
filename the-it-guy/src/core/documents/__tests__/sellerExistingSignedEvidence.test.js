import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('existing signed uploads use recorded review without weakening exact-version or online evidence guards', async () => {
  const db = new PGlite(), actor = randomUUID(), organisation = randomUUID(), listing = randomUUID()
  const sql = async (query, params = []) => (await db.query(query, params)).rows
  try {
    await db.exec(await readFile(new URL('../../../../scripts/fixtures/seller-document-journey.sql', import.meta.url), 'utf8'))
    for (const file of ['20260927102934_seller_portal_document_signing_foundation.sql', '20261004121736_seller_document_review_runtime_reconciliation.sql', '20260927122535_seller_physical_signing_version_review.sql', '20261009150000_seller_existing_signed_evidence.sql', '20261010094542_seller_existing_evidence_agent_access.sql']) {
      await db.exec(await readFile(new URL(`../../../../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await sql('insert into auth.users values($1)', [actor]); await sql('insert into organisations values($1)', [organisation])
    await sql("select set_config('app.uid',$1,false),set_config('app.org',$2,false)", [actor, organisation])
    await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [listing, organisation, actor])
    const version = randomUUID(), digest = `sha256:${'a'.repeat(64)}`
    const form = { sellerOnboardingManualSigningPack: { documents: [{ key: 'signed_mandate', versionId: version, versionDigest: digest }] } }
    await sql('insert into private_listing_seller_onboarding(private_listing_id,token,status,form_data) values($1,$2,$3,$4)', [listing, randomUUID(), 'completed', JSON.stringify(form)])
    const requirement = (await sql("insert into private_listing_document_requirements(private_listing_id,requirement_key,requirement_name) values($1,'signed_mandate','Mandate') returning id", [listing]))[0].id
    const upload = async (source = 'existing_signed_upload', versionId = null, versionDigest = null) => (await sql(`insert into private_listing_documents(private_listing_id,requirement_id,document_type,status,storage_path,uploaded_by,seller_signing_evidence_source,reviewed_signing_version_id,reviewed_signing_version_digest)
      values($1,$2,'signed_mandate','uploaded','synthetic/signed.pdf',$3,$4,$5,$6) returning id`, [listing, requirement, actor, source, versionId, versionDigest]))[0].id
    const review = (id, reason = null) => sql("select bridge_review_private_listing_seller_document_p1_8($1,'approve',$2,0) as result", [id, reason])
    const existing = await upload()
    assert.equal((await sql('select status from private_listing_documents where id=$1', [existing]))[0].status, 'uploaded')
    await assert.rejects(review(existing), /recorded signature review/)
    await assert.rejects(sql("update private_listing_documents set seller_signing_evidence_source='reviewed_copy' where id=$1", [existing]), /immutable/)
    const html = '<html>Synthetic approved mandate</html>', contentDigest = `sha256:${createHash('sha256').update(html).digest('hex')}`
    const issue = () => sql(`insert into private_listing_seller_portal_signing_documents(organisation_id,private_listing_id,document_key,version_id,version_digest,content_digest,reviewed_html,required_signers,approval_reference,created_by,status)
      values($1,$2,'signed_mandate',$3,$4,$5,$6,$7,'synthetic-approval',$8,'sent') returning id`, [organisation, listing, version, digest, contentDigest, html, JSON.stringify([{ name: 'Synthetic Seller', role: 'Seller', email: 'seller@example.test' }]), actor])
    await assert.rejects(issue(), /Review the existing signed upload/)
    assert.equal((await review(existing, 'Checked every required signature and agency acceptance.'))[0].result.ok, true)
    assert.equal((await sql('select status from private_listing_documents where id=$1', [existing]))[0].status, 'approved')
    const stale = await upload('reviewed_copy', randomUUID(), digest)
    await assert.rejects(review(stale, 'Checked signatures.'), /does not match the current reviewed physical signing copy/)
    await sql("select bridge_review_private_listing_seller_document_p1_8($1,'reject','Stale version; replace the file.',0)", [stale])
    const bound = await upload('reviewed_copy', version, digest)
    assert.equal((await review(bound, 'Compared the reviewed signing copy and every signature.'))[0].result.ok, true)
    const request = (await issue())[0].id
    await assert.rejects(upload(), /active online signing request/)
    await sql("update private_listing_seller_portal_signing_documents set status='revoked' where id=$1", [request])
    await sql("select set_config('app.uid',$1,false)", [randomUUID()])
    await assert.rejects(upload(), /Agent access/)
    assert.equal((await sql('select count(*)::int as count from private_listing_documents where status=\'approved\''))[0].count, 2)
  } finally { await db.close() }
})

test('an authenticated assigned agent can upload existing evidence without reading private signing documents', async () => {
  const db = new PGlite()
  const actor = randomUUID(), organisation = randomUUID(), listing = randomUUID()
  const sql = async (query, params = []) => (await db.query(query, params)).rows
  try {
    await db.exec(await readFile(new URL('../../../../scripts/fixtures/seller-document-journey.sql', import.meta.url), 'utf8'))
    for (const file of ['20260927102934_seller_portal_document_signing_foundation.sql', '20261004121736_seller_document_review_runtime_reconciliation.sql', '20260927122535_seller_physical_signing_version_review.sql', '20261009150000_seller_existing_signed_evidence.sql', '20261010094542_seller_existing_evidence_agent_access.sql']) {
      await db.exec(await readFile(new URL(`../../../../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await sql('insert into auth.users values($1)', [actor])
    await sql('insert into organisations values($1)', [organisation])
    await sql("select set_config('app.uid',$1,false),set_config('app.org',$2,false)", [actor, organisation])
    await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by) values($1,$2,$3,$3)', [listing, organisation, actor])
    const requirement = (await sql("insert into private_listing_document_requirements(private_listing_id,requirement_key,requirement_name) values($1,'signed_mandate','Mandate') returning id", [listing]))[0].id
    await db.exec('grant usage on schema public,auth to authenticated; grant select on private_listings,private_listing_document_requirements to authenticated; grant insert,select on private_listing_documents to authenticated;')
    await db.exec('set role authenticated')
    const [document] = await sql("insert into private_listing_documents(private_listing_id,requirement_id,document_type,status,storage_path,uploaded_by,seller_signing_evidence_source) values($1,$2,'signed_mandate','uploaded','synthetic/signed.pdf',$3,'existing_signed_upload') returning id,status", [listing, requirement, actor])
    assert.equal(document.status, 'uploaded')
    assert.equal((await sql("select private.bridge_seller_document_has_active_signing($1,'signed_mandate') as active", [listing]))[0].active, false)
    await assert.rejects(sql('select reviewed_html from private_listing_seller_portal_signing_documents'), /permission denied/)
    await assert.rejects(sql("select private.bridge_seller_document_has_active_signing($1,'anything_else')", [listing]), /exact seller signing requirement/)
    await db.exec('reset role')
    await sql("update private_listing_documents set status='rejected' where id=$1", [document.id])
    const html = '<html>Synthetic online mandate</html>'
    await sql(`insert into private_listing_seller_portal_signing_documents(organisation_id,private_listing_id,document_key,version_id,version_digest,content_digest,reviewed_html,required_signers,approval_reference,created_by,status)
      values($1,$2,'signed_mandate',$3,$4,$5,$6,$7,'synthetic-approval',$8,'sent')`, [organisation, listing, randomUUID(), `sha256:${'a'.repeat(64)}`, `sha256:${createHash('sha256').update(html).digest('hex')}`, html, JSON.stringify([{ name: 'Synthetic Seller', role: 'Seller', email: 'seller@example.test' }]), actor])
    await db.exec('set role authenticated')
    assert.equal((await sql("select private.bridge_seller_document_has_active_signing($1,'signed_mandate') as active", [listing]))[0].active, true)
    await assert.rejects(sql("insert into private_listing_documents(private_listing_id,requirement_id,document_type,status,storage_path,uploaded_by,seller_signing_evidence_source) values($1,$2,'signed_mandate','uploaded','synthetic/replacement.pdf',$3,'existing_signed_upload')", [listing, requirement, actor]), /Review the active online signing request/)

    await sql("select set_config('app.uid',$1,false)", [randomUUID()])
    await assert.rejects(sql("select private.bridge_seller_document_has_active_signing($1,'signed_mandate')", [listing]), /Agent access/)
    await sql("select set_config('app.uid',$1,false),set_config('app.org',$2,false)", [actor, randomUUID()])
    await assert.rejects(sql("select private.bridge_seller_document_has_active_signing($1,'signed_mandate')", [listing]), /Agent access/)
    await db.exec('reset role')
    assert.equal((await sql("select has_function_privilege('anon','private.bridge_seller_document_has_active_signing(uuid,text)','execute') as allowed"))[0].allowed, false)
    assert.equal((await sql("select has_table_privilege('authenticated','private_listing_seller_portal_signing_documents','select') as allowed"))[0].allowed, false)
  } finally { await db.close() }
})
