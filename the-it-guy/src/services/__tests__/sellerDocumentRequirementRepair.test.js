import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const query = async (sql, params = []) => (await db.query(sql, params)).rows
const repair = async () => (await query('select bridge_repair_private_listing_seller_document_links($1) as result', [id(3)]))[0].result
const requirement = (n, key, status = 'required', required = true, listing = id(3)) => query('insert into private_listing_document_requirements(id,private_listing_id,requirement_key,status,is_required) values ($1,$2,$3,$4,$5)', [id(n), listing, key, status, required])
const file = (n, key, status = 'uploaded', visibility = 'internal') => query('insert into private_listing_documents(id,private_listing_id,document_type,document_name,status,storage_path,visibility) values ($1,$2,$3,$4,$5,$6,$7)', [id(n), id(3), key, `File ${n}.pdf`, status, `original/${n}.pdf`, visibility])
const identity = (actor = id(2), org = id(1)) => query("select set_config('app.uid',$1,false),set_config('app.org',$2,false)", [actor, org])
beforeAll(async () => {
  await db.exec(await readFile(new URL('../../../scripts/fixtures/seller-document-journey.sql', import.meta.url), 'utf8'))
  await db.exec('alter table private_listing_documents add column category text')
  await db.exec(await readFile(new URL('../../../../supabase/migrations/20261004121736_seller_document_review_runtime_reconciliation.sql', import.meta.url), 'utf8'))
  await query('insert into organisations values ($1)', [id(1)])
  await query('insert into auth.users values ($1)', [id(2)])
  await query('insert into private_listings(id,organisation_id,assigned_agent_id) values ($1,$2,$3),($4,$2,$3)', [id(3), id(1), id(2), id(4)])
  await requirement(10, 'id_document')
  await requirement(11, 'proof_of_address')
  await requirement(12, 'Proof of address')
  await requirement(13, 'title_deed', 'required', false)
  await requirement(14, 'company_address_proof', 'approved')
  await requirement(15, 'trust_deed', 'completed')
  await requirement(16, 'Trust deed')
  await requirement(17, 'cipc_documents', 'required', true, id(4))
  for (const [n, key] of [[20,'ID document'],[21,'spouse_id_document'],[22,'proof_of_address'],[23,'title_deed'],[24,'company_address_proof'],[25,'trust_deed'],[26,'cipc_documents']]) await file(n,key)
  await file(27,'id_document','approved')
  await query("insert into document_requirement_instances(id,context_type,context_id,listing_id,document_definition_key) values ($1,'private_listing',$2,$2,'foreign_company'),($3,'private_listing',$4,$4,'company_address_proof')", [id(60),id(4),id(61),id(3)])
  await requirement(18,'foreign_company')
  await query('update private_listing_document_requirements set canonical_requirement_instance_id=$1 where id=$2',[id(60),id(18)])
  await file(28,'foreign_company')
  await file(29,'id_document')
  await query('update private_listing_documents set canonical_requirement_instance_id=$1 where id=$2',[id(61),id(29)])
  await db.exec(await readFile(new URL('../../../../supabase/migrations/20261006070039_seller_document_requirement_link_repair.sql', import.meta.url), 'utf8'))
  await identity()
}, 30000)
afterAll(async () => { await db.close() })
describe('seller document repair against PostgreSQL and current validation triggers', () => {
  it('backfills only one exact active same-listing match, retaining the pending file and audit', async () => {
    const rows = await query('select id,requirement_id,status,storage_path,review_revision from private_listing_documents order by id')
    expect(rows.find(row => row.id === id(20))).toMatchObject({ requirement_id:id(10),status:'uploaded',storage_path:'original/20.pdf',review_revision:1 })
    expect(rows.filter(row => row.id !== id(20)).every(row => row.requirement_id === null)).toBe(true)
    const events = await query('select * from seller_document_review_events')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ action:'link_requirement',previous_status:'uploaded',next_status:'uploaded',actor_id:null })
    expect((await query('select status,assurance_state,satisfied_by_document_id from private_listing_document_requirements where id=$1',[id(10)]))[0]).toEqual({status:'uploaded',assurance_state:'received_pending_approval',satisfied_by_document_id:null})
    expect(await query('select id from notification_events')).toHaveLength(0)
  })
  it('rejects new seller-facing files without a requirement and retains generic internal uploads', async () => {
    await expect(file(30,'cipc_documents','uploaded','seller_visible')).rejects.toMatchObject({code:'23514'})
    await expect(file(31,'listing_document')).resolves.toBeDefined()
  })
  it('repairs after the correct checklist is added with an actor audit and idempotent retry', async () => {
    await requirement(40,'cipc_documents')
    expect(await repair()).toEqual({ok:true,linkedCount:1,remainingCount:7})
    expect((await repair()).linkedCount).toBe(0)
    expect(await query('select actor_id,review_revision from seller_document_review_events where document_id=$1',[id(26)])).toEqual([{actor_id:id(2),review_revision:1}])
    expect((await query('select storage_path,status from private_listing_documents where id=$1',[id(26)]))[0]).toEqual({storage_path:'original/26.pdf',status:'uploaded'})
    expect(await query('select id from notification_events')).toHaveLength(0)
    await expect(query("select bridge_review_private_listing_seller_document_p1_8($1,'approve',null,0)",[id(26)])).rejects.toMatchObject({code:'40001'})
  })
  it('refuses anonymous users, inactive members and another agent', async () => {
    for (const [actor,org] of [['',id(1)],[id(2),id(4)],[id(99),id(1)]]) {
      await identity(actor,org)
      await expect(repair()).rejects.toMatchObject({code:'42501'})
    }
    await identity()
    expect((await query("select has_function_privilege('anon','bridge_repair_private_listing_seller_document_links(uuid)','EXECUTE') as anon,has_function_privilege('authenticated','bridge_repair_private_listing_seller_document_links(uuid)','EXECUTE') as member"))[0]).toEqual({anon:false,member:true})
    await db.exec('set role authenticated')
    try { expect((await repair()).linkedCount).toBe(0) } finally { await db.exec('reset role') }
  })
  it('rolls back the file and checklist if the audit cannot be saved', async () => {
    await file(50,'rates_account')
    await requirement(51,'rates_account')
    await db.exec("alter table seller_document_review_events add constraint reject_new_audit check(document_id <> '00000000-0000-4000-8000-000000000050')")
    await expect(repair()).rejects.toMatchObject({code:'23514'})
    expect((await query('select requirement_id,review_revision from private_listing_documents where id=$1',[id(50)]))[0]).toEqual({requirement_id:null,review_revision:0})
    expect((await query('select status from private_listing_document_requirements where id=$1',[id(51)]))[0].status).toBe('required')
    await db.exec('alter table seller_document_review_events drop constraint reject_new_audit')
  })
})
