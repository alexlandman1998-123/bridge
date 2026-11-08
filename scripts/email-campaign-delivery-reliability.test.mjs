import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'

// Actual table definitions and the additive migration, in an isolated database.
// No network, provider credentials, remote rows or production schedules.
const org = '11111111-1111-4111-8111-111111111111'
const otherOrg = '22222222-2222-4222-8222-222222222222'
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
test('campaign delivery reliability: transactional recovery and provider receipts', async t => {
  const db = new PGlite()
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.organisations(id uuid primary key); create table public.organisation_branches(id uuid primary key);`)
    const foundation = readFileSync('supabase/migrations/20260909113000_email_campaigns_foundation.sql', 'utf8')
    for (const table of ['email_sender_identities','email_marketing_contacts','email_suppressions','email_subscription_types','email_campaigns','email_campaign_recipients','email_campaign_dispatch_jobs','email_events']) {
      const start = foundation.indexOf(`create table if not exists public.${table} (`)
      assert.ok(start >= 0)
      await db.exec(foundation.slice(start).split('\n);')[0] + '\n);')
    }
    await db.exec(`grant usage on schema public to service_role,authenticated,anon;
      grant all on all tables in schema public to service_role;
      insert into public.organisations values('${org}'),('${otherOrg}'); insert into auth.users values('${user}');`)
    await db.exec(readFileSync('supabase/migrations/20261105154612_email_campaign_delivery_reliability.sql', 'utf8'))
    const campaign = await one(`insert into email_campaigns(organisation_id,name,subject,status,created_by) values($1,'Test','News','sending',$2) returning id`, [org,user])
    const reset = async () => {
      await db.exec(`reset role; truncate email_campaign_recipients cascade; update email_campaigns set status='sending',sent_at=null;`)
      await db.exec('truncate email_campaign_provider_receipts, email_suppressions')
      const r = await one(`insert into email_campaign_recipients(organisation_id,campaign_id,email) values($1,$2,'person@example.test') returning *`, [org,campaign.id])
      await db.query(`insert into email_campaign_dispatch_jobs(organisation_id,campaign_id,run_at) values($1,$2,now()-interval '1 minute') on conflict(campaign_id) do update set status='queued',run_at=now()-interval '1 minute',lease_token=null,locked_at=null,attempts=0`, [org,campaign.id])
      await db.exec('set role service_role')
      return r
    }
    const claim = async () => (await db.query('select * from email_campaign_claim_dispatch_jobs(1)')).rows[0]
    const prepare = async (j,r,payload = {to:[r.email],subject:'Original',html:'<p>Hello</p>'}) => (await one('select email_campaign_prepare_send($1,$2,$3,$4) result',[j.id,j.lease_token,r.id,JSON.stringify(payload)])).result
    const accept = (r,id='provider-1') => db.query('select email_campaign_accept_send($1,$2,$3)',[r.id,id,JSON.stringify({id})])
    const event = async (id,type,provider='provider-1') => (await one('select email_campaign_record_provider_event($1,$2,$3,$4) ok',[id,provider,type,JSON.stringify({type,created_at:'2026-11-05T12:00:00Z',data:{email_id:provider}})])).ok
    const recipient = r => one('select * from email_campaign_recipients where id=$1',[r.id])
    const finish = j => db.query('select email_campaign_finish_dispatch($1,$2) result',[j.id,j.lease_token])

    await t.test('claims once, reclaims stale leases, increments attempts and fences the old worker', async () => {
      const r = await reset(), first = await claim()
      assert.equal(await claim(),undefined)
      await db.query(`update email_campaign_dispatch_jobs set locked_at=now()-interval '6 minutes' where id=$1`,[first.id])
      const second = await claim()
      assert.notEqual(first.lease_token,second.lease_token)
      assert.equal(second.attempts,2)
      assert.equal((await prepare(first,r)).action,'lease_lost')
      assert.equal((await finish(first)).rows[0].result,'lease_lost')
      assert.equal((await prepare(second,r)).action,'send')
    })
    await t.test('saves and reuses the exact original payload inside the safe retry window', async () => {
      const r = await reset(), j = await claim(), first = await prepare(j,r)
      const retry = await prepare(j,r,{to:[r.email],subject:'Changed',html:'Different'})
      assert.deepEqual(retry,first)
      assert.equal((await recipient(r)).send_attempts,2)
      await accept(r)
      assert.equal((await prepare(j,r)).action,'skip')
      await finish(j)
      assert.equal((await one('select status from email_campaigns where id=$1',[campaign.id])).status,'sent')
    })
    await t.test('cannot send a campaign cancelled after the job was claimed', async () => {
      const r = await reset(), j = await claim()
      await db.query(`update email_campaigns set status='cancelled' where id=$1`,[campaign.id])
      assert.equal((await prepare(j,r)).action,'lease_lost')
      assert.equal((await recipient(r)).status,'queued')
      assert.equal((await one('select status from email_campaign_dispatch_jobs where id=$1',[j.id])).status,'cancelled')
    })
    await t.test('stops expired or legacy uncertain requests for explicit reconciliation', async () => {
      for (const legacy of [false,true]) {
        const r = await reset(), j = await claim()
        if (legacy) await db.query(`update email_campaign_recipients set status='sending' where id=$1`,[r.id])
        else {
          await prepare(j,r)
          await db.exec('reset role')
          await db.query(`update email_campaign_send_attempts set first_attempt_at=now()-interval '24 hours' where recipient_id=$1`,[r.id])
          await db.exec('set role service_role')
        }
        assert.equal((await prepare(j,r)).action,'review')
        assert.equal((await finish(j)).rows[0].result,'review')
        assert.equal((await one('select status,last_error from email_campaign_dispatch_jobs where id=$1',[j.id])).status,'failed')
        assert.match((await recipient(r)).error_reason,/manual reconciliation/)
      }
    })
    await t.test('records early signed receipts and applies them on provider acceptance', async () => {
      const r = await reset(), j = await claim()
      await prepare(j,r)
      assert.equal(await event('early-click','email.clicked'),false)
      await accept(r)
      assert.equal((await recipient(r)).status,'clicked')
      assert.equal(await event('early-click','email.clicked'),true)
      assert.equal((await one(`select count(*)::int n from email_events where provider_event_id='early-click'`)).n,1)
      await accept(r)
      assert.equal((await recipient(r)).status,'clicked')
    })
    await t.test('drains receipts missed by concurrent acceptance even with no send jobs to claim', async () => {
      const r = await reset(), j = await claim()
      await prepare(j,r); await accept(r); await finish(j)
      await db.query(`insert into email_campaign_provider_receipts(event_id,provider_message_id,event_type,payload)
        values('concurrent-receipt','provider-1','email.delivered','{}')`)
      assert.equal(await claim(),undefined)
      assert.equal((await one('select email_campaign_reconcile_provider_receipts(100) n')).n,1)
      assert.equal((await recipient(r)).status,'delivered')
      assert.equal((await one('select email_campaign_reconcile_provider_receipts(100) n')).n,0)
    })
    await t.test('stops a batch atomically without overwriting accepted recipient evidence', async () => {
      const r = await reset(), first = await claim()
      await prepare(first,r); await accept(r)
      const queued = await one(`insert into email_campaign_recipients(organisation_id,campaign_id,email) values($1,$2,'pending@example.test') returning *`,[org,campaign.id])
      assert.equal((await one('select email_campaign_stop_dispatch($1,$2,$3) ok',[first.id,first.lease_token,'Source changed'])).ok,true)
      assert.equal((await recipient(r)).status,'sent')
      assert.equal((await recipient(queued)).status,'failed')
      assert.equal((await one('select status from email_campaigns where id=$1',[campaign.id])).status,'partially_failed')
      assert.equal((await one('select status from email_campaign_dispatch_jobs where id=$1',[first.id])).status,'failed')
    })
    await t.test('late acceptance and out-of-order events cannot undo engagement or terminal safety states', async () => {
      const r = await reset(), j = await claim()
      await prepare(j,r); await accept(r)
      await event('click','email.clicked'); await event('open','email.opened'); await accept(r)
      assert.equal((await recipient(r)).status,'clicked')
      await event('complaint','email.complained'); await event('delivery','email.delivered'); await event('bounce','email.bounced'); await accept(r)
      assert.equal((await recipient(r)).status,'complained')
      assert.equal((await one('select reason from email_suppressions')).reason,'complaint')
      await db.query(`update email_campaign_recipients set status='unsubscribed' where id=$1`,[r.id])
      await event('click-again','email.clicked')
      assert.equal((await recipient(r)).status,'unsubscribed')
    })
    await t.test('provider suppression is recorded atomically and does not overwrite an unsubscribe', async () => {
      const r = await reset(), j = await claim()
      await prepare(j,r); await accept(r)
      await db.query(`insert into email_suppressions(organisation_id,email,reason) values($1,$2,'unsubscribe')`,[org,r.email])
      assert.equal(await event('suppression','email.suppressed'),true)
      assert.equal((await recipient(r)).status,'suppressed')
      assert.equal((await one('select reason from email_suppressions')).reason,'unsubscribe')
      assert.equal((await one(`select event_type from email_events where provider_event_id='suppression'`)).event_type,'suppressed')
    })
    await t.test('event and suppression failures roll back all effects and an identical retry repairs them', async () => {
      for (const table of ['email_events','email_suppressions']) {
        const r = await reset(), j = await claim()
        await prepare(j,r); await accept(r)
        await db.exec(`reset role; create function fail_email_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture storage failure'; end $$;
          create trigger fixture_failure before insert on ${table} for each row execute function fail_email_fixture(); set role service_role;`)
        await assert.rejects(event('retry-bounce','email.bounced'),/fixture storage failure/)
        assert.equal((await recipient(r)).status,'sent')
        assert.equal((await one(`select count(*)::int n from email_campaign_provider_receipts where event_id='retry-bounce'`)).n,0)
        await db.exec(`reset role; drop trigger fixture_failure on ${table}; drop function fail_email_fixture(); set role service_role;`)
        assert.equal(await event('retry-bounce','email.bounced'),true)
        assert.equal((await recipient(r)).status,'bounced')
        assert.equal((await one('select reason from email_suppressions')).reason,'hard_bounce')
      }
    })
    await t.test('failed completion rolls back campaign status and leaves recoverable work', async () => {
      const r = await reset(), j = await claim()
      await prepare(j,r); await accept(r)
      await db.exec(`reset role; create function fail_job_fixture() returns trigger language plpgsql as $$ begin if new.status='completed' then raise exception 'fixture completion failure'; end if; return new; end $$;
        create trigger fixture_job_failure before update on email_campaign_dispatch_jobs for each row execute function fail_job_fixture(); set role service_role;`)
      await assert.rejects(finish(j),/fixture completion failure/)
      assert.equal((await one('select status from email_campaigns where id=$1',[campaign.id])).status,'sending')
      assert.equal((await one('select status from email_campaign_dispatch_jobs where id=$1',[j.id])).status,'running')
      await db.exec('reset role; drop trigger fixture_job_failure on email_campaign_dispatch_jobs; drop function fail_job_fixture(); set role service_role;')
      assert.equal((await finish(j)).rows[0].result,'completed')
    })
    await t.test('rejects a foreign recipient and grants no browser access to server payloads or RPCs', async () => {
      const r = await reset(), j = await claim()
      const foreign = await one(`insert into email_campaigns(organisation_id,name,subject,created_by) values($1,'Foreign','Private',$2) returning id`,[otherOrg,user])
      const other = await one(`insert into email_campaign_recipients(organisation_id,campaign_id,email) values($1,$2,'other@example.test') returning *`,[otherOrg,foreign.id])
      await assert.rejects(prepare(j,other),/does not belong/)
      for (const role of ['anon','authenticated']) {
        await db.exec(`reset role; set role ${role}`)
        await assert.rejects(claim(),/permission denied/)
        await assert.rejects(prepare(j,r),/permission denied/)
        await assert.rejects(event('forged','email.clicked'),/permission denied/)
        await assert.rejects(accept(r),/permission denied/)
        await assert.rejects(finish(j),/permission denied/)
        await assert.rejects(db.query('select email_campaign_reconcile_provider_receipts(100)'),/permission denied/)
        await assert.rejects(db.query('select email_campaign_stop_dispatch($1,$2,$3)',[j.id,j.lease_token,'Forged']),/permission denied/)
        await assert.rejects(db.query('select * from email_campaign_send_attempts'),/permission denied/)
        await assert.rejects(db.query('select * from email_campaign_provider_receipts'),/permission denied/)
      }
    })
  } finally { await db.close() }
})
