import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

const db = new PGlite()
const query = (sql,args=[]) => db.query(sql,args)
try {
  // Local Vault/net/cron doubles never contact a server or send a communication.
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema vault; create schema net; create schema cron;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table net.requests(id bigserial,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.requests(url,headers,body,timeout_milliseconds) values($1,$2,$3,$4) returning id$$;
    create table cron.job(jobid bigserial,jobname text,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
    create function cron.unschedule(bigint) returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;
    create table marketing_event_rsvp_messages(id integer primary key,status text,message_type text,scheduled_for timestamptz);
    create table marketing_event_rsvp_handoffs(id integer primary key,status text,attempts integer);
    insert into marketing_event_rsvp_messages values(1,'queued','morning_reminder',now()+interval '1 day'),(2,'sent','confirmation',now());
    insert into marketing_event_rsvp_handoffs values(1,'queued',0),(2,'processed',1);`)
  const old = readFileSync(new URL('../../supabase/migrations/20260901165820_marketing_event_worker_phase8.sql',import.meta.url),'utf8').replace(/^create extension.*$/gm,'')
  await db.exec(old)
  const correction = readFileSync(new URL('../../supabase/migrations/20261013181842_marketing_event_worker_service_key_headers.sql',import.meta.url),'utf8')
  const messagesBefore = (await query('select * from marketing_event_rsvp_messages order by id')).rows
  const handoffsBefore = (await query('select * from marketing_event_rsvp_handoffs order by id')).rows
  const cronBefore = (await query('select * from cron.job')).rows
  await db.exec(correction)
  assert.equal((await query('select bridge_run_marketing_event_worker_phase8() as result')).rows[0].result.reason,'vault_configuration_missing')
  assert.equal((await query('select count(*)::int n from net.requests')).rows[0].n,0)
  await query("insert into vault.decrypted_secrets values('arch9_project_url','https://local.example.test/'),('arch9_service_role_key','sb_secret_scheduler_test')")
  await query('set role service_role')
  assert.equal((await query('select bridge_run_marketing_event_worker_phase8() as result')).rows[0].result.scheduled,true)
  await query('reset role')
  const modern = (await query('select * from net.requests order by id desc limit 1')).rows[0]
  assert.deepEqual(modern.headers,{'Content-Type':'application/json',apikey:'sb_secret_scheduler_test'})
  assert.equal(modern.url,'https://local.example.test/functions/v1/marketing-event-worker')
  assert.deepEqual(modern.body,{limit:50})
  assert.equal(modern.timeout_milliseconds,15000)
  await query("update vault.decrypted_secrets set decrypted_secret='eyJ.test.signature' where name='arch9_service_role_key'")
  await query('select bridge_run_marketing_event_worker_phase8()')
  assert.deepEqual((await query('select headers from net.requests order by id desc limit 1')).rows[0].headers,{'Content-Type':'application/json',apikey:'eyJ.test.signature',Authorization:'Bearer eyJ.test.signature'})
  for (const role of ['anon','authenticated']) {
    await query(`set role ${role}`)
    await assert.rejects(query('select bridge_run_marketing_event_worker_phase8()'),/permission denied/)
    await query('reset role')
  }
  await query('grant execute on function bridge_run_marketing_event_worker_phase8() to authenticated')
  await query('set role authenticated')
  await assert.rejects(query('select bridge_run_marketing_event_worker_phase8()'),/Worker authorization required/)
  await query('reset role')
  await query("delete from vault.decrypted_secrets where name='arch9_service_role_key'")
  assert.equal((await query('select bridge_run_marketing_event_worker_phase8() as result')).rows[0].result.reason,'vault_configuration_missing')
  assert.equal((await query('select count(*)::int n from net.requests')).rows[0].n,2)
  await db.exec(correction)
  assert.deepEqual((await query('select * from marketing_event_rsvp_messages order by id')).rows,messagesBefore)
  assert.deepEqual((await query('select * from marketing_event_rsvp_handoffs order by id')).rows,handoffsBefore)
  assert.deepEqual((await query('select * from cron.job')).rows,cronBefore)
  await query('set role authenticated')
  await assert.rejects(query('select bridge_run_marketing_event_worker_phase8()'),/permission denied/)
  await query('reset role')
  console.log('Marketing scheduler: modern/legacy headers, service-only access, missing Vault configuration and unchanged queue/schedule checks passed')
} finally { await db.close() }
