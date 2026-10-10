import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
test('durable jobs enforce actor scope, idempotency, claims and interrupted-request safety', async () => {
 const db = new PGlite()
 try {
  await db.exec(`
   create role anon; create role authenticated; create role service_role; create schema auth;
   create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create table auth.users(id uuid primary key,email text);
   create table private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,assigned_agent_email text,created_by uuid,listing_status text,listing_visibility text);
   create table organisation_users(organisation_id uuid,user_id uuid,email text,role text,membership_status text);
   create function bridge_can_access_private_listing(p_id uuid) returns boolean language sql security definer as $$select exists(select 1 from private_listings where id=p_id and assigned_agent_id=auth.uid())$$;
   create function website_get_listing_publication_status(uuid) returns jsonb language sql as $$select jsonb_build_object('websiteSiteId','own','actor',auth.uid())$$;
   create function website_get_partner_listing_status(uuid) returns jsonb language sql as $$select jsonb_build_object('websiteSiteId','partner','actor',auth.uid())$$;
   insert into auth.users values('${id(1)}','agent@example.test'),('${id(2)}','other@example.test');
   insert into organisation_users values('${id(3)}','${id(1)}','agent@example.test','agent','active');
   insert into private_listings values('${id(4)}','${id(3)}','${id(1)}','agent@example.test','${id(1)}','active','private');
  `)
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261010135448_listing_background_publication_jobs.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261010185500_listing_editor_publication_updates.sql',import.meta.url),'utf8'))
  const actor = async n => db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n)})])
  const enqueue = () => db.query(`select enqueue_listing_publication('${id(4)}',array['property24','private_property','agency_website']) as jobs`)
  await actor(2); await assert.rejects(enqueue(), /cannot publish/)
  await actor(1); await db.exec('set role authenticated')
  await assert.rejects(db.exec(`insert into listing_publication_jobs(listing_id,requested_by,channel) values('${id(4)}','${id(1)}','property24')`),/permission denied/)
  const first = (await enqueue()).rows[0].jobs
  assert.equal(first.length,3); assert.deepEqual((await enqueue()).rows[0].jobs, first)
  await assert.rejects(db.exec('select claim_listing_publications()'),/permission denied/)
  await assert.rejects(db.exec('select claim_id from listing_publication_jobs'),/permission denied/)
  await db.exec('reset role')
  const jobs = (await db.query('select * from claim_listing_publications()')).rows
  assert.equal(jobs.length,3); assert.equal((await db.query('select * from claim_listing_publications()')).rows.length,0)
  const website = jobs.find(j=>j.channel==='agency_website')
  assert.equal((await db.query('select begin_listing_publication_dispatch($1,$2) as ok',[website.id,id(90)])).rows[0].ok,false)
  assert.equal((await db.query('select begin_listing_publication_dispatch($1,$2) as ok',[website.id,website.claim_id])).rows[0].ok,true)
  await actor(2)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)])
  const context=(await db.query('select listing_publication_website_context($1,$2,false) as context',[website.id,website.claim_id])).rows[0].context
  assert.equal(context.actorId,id(1)); assert.equal(context.status.actor,id(1))
  assert.equal((await db.query('select auth.uid() as actor')).rows[0].actor,id(2))
  await assert.rejects(db.query('select listing_publication_website_context($1,$2,false)',[website.id,id(90)]),/unavailable/)
  await db.exec("update listing_publication_jobs set claimed_at=now()-interval '11 minutes'")
  const reclaimed=(await db.query('select * from claim_listing_publications()')).rows
  assert.equal(reclaimed.length,2)
  assert.equal((await db.query('select state from listing_publication_jobs where id=$1',[website.id])).rows[0].state,'uncertain')
  await db.exec("select set_config('request.jwt.claim.sub','',false)")
  await actor(1)
  const update = key => db.query(`select enqueue_listing_publication_update('${id(4)}',array['property24','private_property','agency_website'],$1) as jobs`,[id(key)])
  // Unknown provider results cannot be blindly resubmitted.
  await assert.rejects(update(10), /previous submission/)
  await db.exec("update listing_publication_jobs set state='accepted'")
  await db.exec('set role authenticated')
  const queued = (await update(10)).rows[0].jobs
  assert.equal(queued.length,3); assert(queued.every(job => job.state==='queued'))
  assert.deepEqual((await update(10)).rows[0].jobs,queued)
  await db.exec('reset role')
  await db.exec("update listing_publication_jobs set state='accepted'")
  assert((await update(10)).rows[0].jobs.every(job => job.state==='accepted'))
  assert((await update(11)).rows[0].jobs.every(job => job.state==='queued'))
  const updateJobs=(await db.query('select * from claim_listing_publications()')).rows
  await assert.rejects(update(12), /previous submission/)
  assert.equal(updateJobs.length,3)
  await actor(2); await assert.rejects(update(13), /cannot publish/)
  await actor(1)
  await db.exec("update private_listings set listing_status='withdrawn'")
  for(const job of reclaimed) assert.equal((await db.query('select begin_listing_publication_dispatch($1,$2) as ok',[job.id,job.claim_id])).rows[0].ok,false)
  await db.exec("select set_config('request.jwt.claim.sub','',false)")
  await actor(1); await assert.rejects(enqueue(),/Activate/)
  await db.exec("update private_listings set listing_status='active'; update organisation_users set membership_status='removed'")
  await assert.rejects(enqueue(),/cannot publish/)
 } finally { await db.close() }
})
