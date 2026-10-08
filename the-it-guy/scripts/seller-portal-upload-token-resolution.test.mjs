import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const readMigration = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const version = uuid(90), digest = 'a'.repeat(64)
const correction = await readMigration('20261008154013_seller_portal_upload_token_resolution.sql')
const db = new PGlite()
const rows = async (sql, args = []) => (await db.query(sql, args)).rows
const functionSql = (source, name) => {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, name)
  return source.slice(start, source.indexOf('$$;', start) + 3)
}
const snapshot = async () => Promise.all(['private_listing_seller_onboarding', 'private_listing_documents',
  'private_listing_document_requirements', 'private_listing_activity', 'documents'].map(table =>
  rows(`select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]'::jsonb) as data from ${table} r`)))
const grants = () => rows(`select proname, proacl::text, prosecdef, proconfig from pg_proc
  where proname in ('bridge_upload_private_listing_seller_document',
  'bridge_upload_private_listing_seller_document_phase1_base', 'bridge_upload_private_listing_seller_signed_copy') order by proname`)

await db.exec(await readFile(new URL('./fixtures/seller-document-journey.sql', import.meta.url), 'utf8'))
await db.exec(`alter table private_listing_seller_onboarding
  add column seller_portal_token text, add column token_expires_at timestamptz,
  add column seller_portal_invite_token_hash text, add column seller_portal_invite_consumed_at timestamptz,
  add column seller_portal_invite_expires_at timestamptz;
  create table synthetic_transaction_links(listing_id uuid primary key, transaction_id uuid, canonical_id uuid);
  create or replace function bridge_resolve_private_listing_transaction_id(uuid) returns uuid language sql as $$
    select transaction_id from synthetic_transaction_links where listing_id=$1
  $$;
  create or replace function bridge_promote_private_listing_document_row(p_id uuid) returns jsonb language plpgsql as $$
  declare tx synthetic_transaction_links%rowtype; doc uuid;
  begin
    select l.* into tx from synthetic_transaction_links l join private_listing_documents d on d.private_listing_id=l.listing_id where d.id=p_id;
    if tx.transaction_id is not null then
      doc:=gen_random_uuid();
      insert into documents values(doc,tx.transaction_id,tx.canonical_id);
      update private_listing_documents set promoted_transaction_id=tx.transaction_id,promoted_document_id=doc where id=p_id;
    end if;
    return '{"continuity":{"synthetic":true}}'::jsonb;
  end;
  $$;`)
await db.exec(functionSql(await readMigration('20261001092739_seller_onboarding_access_enforcement.sql'), 'bridge_resolve_private_listing_seller_portal_token'))
await db.exec('revoke all on function bridge_resolve_private_listing_seller_portal_token(text) from public,anon,authenticated')
await db.exec(functionSql(await readMigration('202607140004_client_portal_phase1_access_stability.sql'), 'bridge_private_listing_seller_portal_link_is_active'))
await db.exec(functionSql(await readMigration('202608090001_seller_portal_upload_rls_context_fix.sql'), 'bridge_upload_private_listing_seller_document'))
await db.exec(await readMigration('20260905090353_document_trust_phase1_seller_atomic_link.sql'))
await db.exec(await readMigration('20261004181626_seller_portal_signed_upload_version_binding.sql'))

for (const n of [1, 2]) {
  await rows('insert into private_listings(id,organisation_id) values($1,$2)', [uuid(n), uuid(n + 10)])
  await rows(`insert into private_listing_seller_onboarding(private_listing_id,token,seller_portal_token,
    token_expires_at,seller_portal_password_hash,seller_portal_access_token_hash,seller_portal_access_token_expires_at,form_data)
    values($1,$2,$3,now()-interval '1 day','password',encode(extensions.digest($4,'sha256'),'hex'),now()+interval '1 hour',$5)`,
  [uuid(n), `legacy-${n}`, `stable-${n}`, `session-${n}`, JSON.stringify({
    sellerOnboardingReview: { status: 'approved' }, sellerOnboardingFormalPackApproval: { status: 'approved' },
    sellerOnboardingManualSigningPack: { documents: [{ key: 'signed_mandate', versionId: version, versionDigest: digest, generatedHtml: '<p>Frozen approved copy</p>' }] },
  })])
  for (const key of ['id_copy', 'signed_mandate']) await rows(`insert into private_listing_document_requirements(private_listing_id,requirement_key) values($1,$2)`, [uuid(n), key])
}

async function upload(token, { signed = false, session = 'session-1', versionId = version, versionDigest = digest } = {}) {
  await db.exec('set role anon')
  try {
    const args = [token, signed ? 'signed_mandate' : 'id_copy', 'file.pdf', 'synthetic/file.pdf', null,
      signed ? 'signed_mandate' : 'id_copy', null, 'Seller Document', session]
    if (signed) args.push(versionId, versionDigest)
    return (await rows(`select bridge_upload_private_listing_seller_${signed ? 'signed_copy' : 'document'}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args))[0].result
  } finally { await db.exec('reset role') }
}

test.after(() => db.close())
test('stable seller links reproduce the live failure; correction preserves records, grants and private bases', async () => {
  await assert.rejects(upload('stable-1'), /invalid or inactive/)
  await assert.rejects(upload('stable-1', { signed: true }), /invalid or inactive/)
  const before = await snapshot(), acl = await grants()
  const base = await rows("select prosrc from pg_proc where proname='bridge_upload_private_listing_seller_document_phase1_base'")
  await db.exec(correction)
  await db.exec(correction)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await grants(), acl)
  assert.deepEqual(await rows("select prosrc from pg_proc where proname='bridge_upload_private_listing_seller_document_phase1_base'"), base)
})

test('both agency fixtures upload with stable links after legacy onboarding expiry, retaining pending linking and exact signing versions', async () => {
  for (const n of [1, 2]) {
    const normal = await upload(`stable-${n}`, { session: `session-${n}` })
    assert.equal(normal.document.private_listing_id, uuid(n))
    assert.equal(normal.document_trust_state, 'pending_transaction_link')
    const signed = await upload(`stable-${n}`, { signed: true, session: `session-${n}` })
    assert.equal(signed.document.private_listing_id, uuid(n))
    assert.equal(signed.document.reviewed_signing_version_id, version)
    assert.equal(signed.document.reviewed_signing_version_digest, digest)
    assert.equal(signed.document.status, 'uploaded')
  }
})

test('invalid, expired, invitation, inactive and cross-agency session inputs leave no document or checklist changes', async () => {
  await rows(`update private_listing_seller_onboarding set seller_portal_invite_token_hash=encode(extensions.digest('invite-1','sha256'),'hex'),seller_portal_invite_expires_at=now()+interval '1 day' where private_listing_id=$1`, [uuid(1)])
  for (const token of ['missing', 'legacy-1', 'invite-1']) {
    for (const signed of [false, true]) {
      const before = await snapshot()
      await assert.rejects(upload(token, { signed }), /invalid or inactive/)
      assert.deepEqual(await snapshot(), before)
    }
  }
  const beforeSessionFailure = await snapshot()
  for (const signed of [false, true]) await assert.rejects(upload('stable-2', { signed }), /session has expired/)
  assert.deepEqual(await snapshot(), beforeSessionFailure)
  await rows('update private_listing_seller_onboarding set seller_portal_link_active=false where private_listing_id=$1', [uuid(1)])
  await assert.rejects(upload('stable-1'), /invalid or inactive/)
  await rows("update private_listing_seller_onboarding set seller_portal_link_active=true,seller_portal_link_expires_at=now()-interval '1 second' where private_listing_id=$1", [uuid(1)])
  await assert.rejects(upload('stable-1'), /invalid or inactive/)
  await rows('update private_listing_seller_onboarding set seller_portal_link_expires_at=null where private_listing_id=$1', [uuid(1)])
  await rows("update private_listing_seller_onboarding set seller_portal_access_token_expires_at=now()-interval '1 second' where private_listing_id=$1", [uuid(1)])
  await assert.rejects(upload('stable-1'), /session has expired/)
  await rows("update private_listing_seller_onboarding set seller_portal_access_token_expires_at=now()+interval '1 hour' where private_listing_id=$1", [uuid(1)])
  await rows("update private_listing_seller_onboarding set token_expires_at=now()+interval '1 day' where private_listing_id=$1", [uuid(1)])
  assert.equal((await upload('legacy-1')).document.private_listing_id, uuid(1))
})

test('stale reviewed versions and failed canonical transaction linking roll back all upload side effects', async () => {
  const before = await snapshot()
  await assert.rejects(upload('stable-1', { signed: true, versionDigest: 'b'.repeat(64) }), /current reviewed signing copy/)
  assert.deepEqual(await snapshot(), before)
  await rows('insert into synthetic_transaction_links values($1,$2,null)', [uuid(1), uuid(70)])
  await assert.rejects(upload('stable-1'), /canonical transaction document requirement/)
  assert.deepEqual(await snapshot(), before)
  await rows('update synthetic_transaction_links set canonical_id=$1 where listing_id=$2', [uuid(80), uuid(1)])
  const linked = await upload('stable-1')
  assert.equal(linked.document_trust_state, 'canonically_linked')
  assert.equal(linked.shared_document.transaction_id, uuid(70))
  assert.equal(linked.shared_document.canonical_requirement_instance_id, uuid(80))
})
