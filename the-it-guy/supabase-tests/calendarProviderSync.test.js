import {readFile} from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest'
import { setupCalendarReservationDatabase,org,otherOrg,actor,second,outsider,booking,id,input,people } from './calendarReservationFixture.js'
let db,counter
const cipher={v:1,iv:'encrypted-iv',ciphertext:'encrypted-server-token'}
async function user(who=actor,role='authenticated') {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:who,email:'agent@example.test'})]);await db.exec(`set role ${role}`)
}
async function admin(sql,args=[]) {await db.exec('reset role');return db.query(sql,args)}
async function rpc(name,args=[]) {return (await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result}
async function connection(provider='google',who=actor,organisation=org) {
 await user(actor,'service_role');const state=(++counter).toString(16).padStart(64,'0')
 const start=await rpc('begin_calendar_provider_oauth',[organisation,who,provider,state,'a'.repeat(64),'https://app.example.test/mobile/calendar'])
 await rpc('consume_calendar_provider_oauth',[state,provider]);await rpc('finish_calendar_provider_oauth',[state,'account-'+who,'agent@example.test',JSON.stringify(cipher)])
 return start.connectionId
}
async function save(changes={},revision=null,which=booking,attendees=people([])) {
 await user();return rpc('save_calendar_appointment_with_delivery',[org,which,JSON.stringify(input(changes)),attendees===null?null:JSON.stringify(attendees),revision,id(200+ ++counter)])
}
async function work() {await user(actor,'service_role');const connections=await rpc('claim_calendar_provider_connections',[5]);return connections[0]}
async function prepare(c) {await user(actor,'service_role');return rpc('prepare_calendar_provider_event',[c.id,c.lease])}
async function finish(c,e,result={}) {await user(actor,'service_role');return rpc('finish_calendar_provider_event',[c.id,c.lease,e.appointment_id,e.job_lease,e.copy_key,e.version,JSON.stringify({status:'synced',externalId:'provider-event',remoteHash:'remote-hash',etag:'etag',writtenHash:e.desired_hash,...result})])}
async function status(who=actor,organisation=org) {await user(who);return rpc('read_calendar_provider_status',[organisation,booking])}
beforeAll(async()=>{
 db=new PGlite();await setupCalendarReservationDatabase(db)
 await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
 create schema net;create table net.fixture_requests(url text,headers jsonb,body jsonb,timeout integer);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.fixture_requests values(url,headers,body,timeout_milliseconds);return 1234;end$$;
 create schema cron;create table cron.fixture_jobs(job_name text,schedule text,command text);
 create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$begin insert into cron.fixture_jobs values(job_name,schedule,command);return 1;end$$;`)
 const schedule=await readFile(new URL('../../supabase/migrations/20261008210940_calendar_provider_worker_schedule.sql',import.meta.url),'utf8')
 await db.exec(schedule.replace(/create extension if not exists pg_net with schema extensions;/,'').replace(/create extension if not exists pg_cron;/,''))
},30000)
afterAll(async()=>db?.close())
beforeEach(async()=>{counter=0;await db.exec('reset role;truncate appointments,appointment_participants,private.calendar_mutation_receipts,private.calendar_repair_batches,private.calendar_provider_connections,private.calendar_provider_audit cascade')})
describe('Connected provider SQL lifecycle',()=>{
 it('runs a bounded Vault-backed schedule and refuses browser dispatch',async()=>{
  await user();await expect(rpc('private.run_calendar_provider_sync')).rejects.toThrow(/permission denied/)
  await db.exec('reset role');expect(await rpc('private.run_calendar_provider_sync')).toMatchObject({scheduled:false})
  await admin("insert into vault.decrypted_secrets values('arch9_project_url','https://fixture.example.test'),('arch9_service_role_key','fixture-service')")
  await db.exec('reset role');expect(await rpc('private.run_calendar_provider_sync')).toEqual({scheduled:true,requestId:1234})
  expect((await admin('select url,body,timeout from net.fixture_requests')).rows[0]).toEqual({url:'https://fixture.example.test/functions/v1/calendar-provider-sync-worker',body:{limit:5},timeout:120000})
  expect((await admin('select job_name,schedule from cron.fixture_jobs')).rows[0]).toEqual({job_name:'arch9-calendar-provider-sync-1m',schedule:'* * * * *'})
  await admin('truncate vault.decrypted_secrets,net.fixture_requests')
 })
 it('binds one-use authorization to active user, workspace, provider and generation',async()=>{
  await user(actor,'service_role');const state='a'.repeat(64)
  await expect(rpc('begin_calendar_provider_oauth',[otherOrg,actor,'google',state,'a'.repeat(64),'https://app.example.test/'])).rejects.toThrow(/membership/)
  const c=await rpc('begin_calendar_provider_oauth',[org,actor,'google',state,'a'.repeat(64),'https://app.example.test/'])
  await expect(rpc('consume_calendar_provider_oauth',[state,'outlook'])).rejects.toThrow(/valid/)
  await rpc('consume_calendar_provider_oauth',[state,'google']);await expect(rpc('consume_calendar_provider_oauth',[state,'google'])).rejects.toThrow(/already used/)
  await user();await rpc('disconnect_calendar_provider',[c.connectionId]);await user(actor,'service_role')
  await expect(rpc('finish_calendar_provider_oauth',[state,'account','Account',JSON.stringify(cipher)])).rejects.toThrow(/valid/)
 })
 it('rejects expired authorization and never stores plaintext tokens',async()=>{
  await user(actor,'service_role');const state='a'.repeat(64)
  await rpc('begin_calendar_provider_oauth',[org,actor,'google',state,'a'.repeat(64),'https://app.example.test/'])
  await admin("update private.calendar_provider_oauth_states set expires_at=now()-interval '1 minute'");await user(actor,'service_role')
  await expect(rpc('consume_calendar_provider_oauth',[state,'google'])).rejects.toThrow(/expired/)
  const next='b'.repeat(64);await rpc('begin_calendar_provider_oauth',[org,actor,'google',next,'a'.repeat(64),'https://app.example.test/']);await rpc('consume_calendar_provider_oauth',[next,'google'])
  await expect(rpc('finish_calendar_provider_oauth',[next,'account','Account',JSON.stringify({access_token:'plain'})])).rejects.toThrow(/Encrypted/)
 })
 it('queues one durable personal copy per provider and copies no attendees or private notes',async()=>{
  await connection();await connection('outlook');await save({notes:'Confidential notes'})
  const receipt=await status();expect(receipt.events).toHaveLength(2);expect(receipt.events.every(e=>e.status==='queued')).toBe(true)
  const c=await work(),e=await prepare(c);expect(e.desired_payload).toMatchObject({start:'2099-07-20T08:00:00+00:00',end:'2099-07-20T09:00:00+00:00',timezone:'Africa/Johannesburg'})
  expect(JSON.stringify(e.desired_payload)).not.toContain('Confidential');expect(e.desired_payload.participants).toBeUndefined()
  expect(e.create_payload.payload).toEqual(e.desired_payload)
 })
 it('backfills only eligible future bookings when connecting',async()=>{
  await save();await save({status:'draft'},null,id(61));await admin("insert into appointments(appointment_id,organisation_id,created_by,agent_id,status,appointment_date,start_time,end_time,date_time,end_date_time,timezone) values($1,$2,$3,$3,'completed','2020-01-01','10:00','11:00','2020-01-01T08:00Z','2020-01-01T09:00Z','Africa/Johannesburg')",[id(60),org,actor])
  await connection();expect((await status()).events).toHaveLength(1)
  expect((await admin('select count(*)::int as n from private.calendar_provider_events')).rows[0].n).toBe(1)
 })
 it('removes an old personal copy when a legacy booking moves organisations',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c);await finish(c,e)
  await admin('alter table appointments disable trigger user')
  await admin('update appointments set organisation_id=$1 where appointment_id=$2',[otherOrg,booking])
  await admin('alter table appointments enable trigger user')
  await user(actor,'service_role');await rpc('release_calendar_provider_connection',[c.id,c.lease])
  const next=await work(),removed=await prepare(next);expect(removed.desired_action).toBe('delete')
 })
 it('retains stable copy identity across edits and fences old provider receipts',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c)
  await save({title:'Updated title'},0,booking,null)
  expect(await finish(c,e)).toBe(false)
  const next=await prepare(c);expect(next.copy_key).toBe(e.copy_key);expect(next.external_id).toBe('provider-event');expect(next.desired_payload.title).toBe('Updated title')
  expect((await status()).events[0].status).toBe('processing')
 })
 it('updates verified polling time without endlessly appending unchanged audit receipts',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c);await finish(c,e)
  expect((await admin('select count(*)::int as n from private.calendar_provider_audit')).rows[0].n).toBe(1)
  await admin("update private.calendar_provider_events set next_attempt_at=now()-interval '1 minute'");const poll=await prepare(c);expect(await finish(c,poll)).toBe(true)
  expect((await admin('select count(*)::int as n from private.calendar_provider_audit')).rows[0].n).toBe(1)
  await save({title:'Changed source'},0,booking,null);const changed=await prepare(c);await finish(c,changed,{remoteHash:'changed-remote-hash'})
  expect((await admin('select count(*)::int as n from private.calendar_provider_audit')).rows[0].n).toBe(2)
 })
 it('never marks synced without an actual provider receipt',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c)
  await expect(finish(c,e,{externalId:null})).rejects.toThrow(/verified provider/)
  expect(await finish(c,e)).toBe(true);expect((await status()).events[0]).toMatchObject({status:'synced',lastError:null})
 })
 it('cancels the mapped copy and never renews an expired request while polling',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c);await finish(c,e)
  await save({status:'cancelled'},0,booking,null);const remove=await prepare(c);expect(remove.desired_action).toBe('delete');await finish(c,remove,{status:'removed',remoteHash:null})
  expect((await status()).events[0].status).toBe('removed')
 })
 it('checks logical hold expiry again before an external write',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c)
  await admin("update appointments set hold_expires_at=now()-interval '1 second'");await user(actor,'service_role')
  expect(await rpc('validate_calendar_provider_event',[c.id,c.lease,booking,e.job_lease,e.version])).toBe(false)
  const next=await prepare(c);expect(next.desired_action).toBe('delete')
 })
 it('does not export an unrelated agent’s booking within the same organisation',async()=>{
  await connection('google',second);await save();expect((await status(second)).events).toHaveLength(0)
  const c=await work();expect(await prepare(c)).toBeNull()
 })
 it('fences a revoked credential even if a concurrent appointment edit advances its target',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c);await save({title:'Current title'},0,booking,null)
  expect(await finish(c,e,{status:'needs_reconnect'})).toBe(false)
  expect((await status()).connections[0].status).toBe('needs_reconnect')
 })
 it('removes a co-agent copy after attendance is removed without exposing someone else’s status',async()=>{
  await connection('google',second);await save({},null,booking,people([{user_id:second,name:'Co-agent',email:'other@example.test',participant_role:'Co-agent'}]))
  const c=await work(),e=await prepare(c);await finish(c,e)
  expect((await status(second)).events).toHaveLength(1);expect((await status(actor)).events).toHaveLength(0)
  await save({},0,booking,people([]));const removed=await prepare(c);expect(removed.desired_action).toBe('delete')
 })
 it('records outside changes for explicit review and refuses stale review decisions',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c)
  await finish(c,e,{status:'needs_review',remoteHash:'outside-hash',observed:{title:'Outside change',deleted:false}})
  let current=(await status()).events[0];expect(current).toMatchObject({status:'needs_review',observed:{title:'Outside change'}})
  await expect(rpc('calendar_provider_event_action',[org,booking,'google','sync',null])).rejects.toThrow(/Review/)
  await expect(rpc('calendar_provider_event_action',[org,booking,'google','restore',id(99)])).rejects.toThrow(/updated/)
  await rpc('calendar_provider_event_action',[org,booking,'google','restore',current.reviewToken])
  const restored=await prepare(c);expect(restored.force_hash).toBe('outside-hash');expect(restored.version).toBeGreaterThan(e.version)
 })
 it('keeps an outside change visible even when a concurrent Arch9 edit advances the target',async()=>{
  await connection();await save();const c=await work(),e=await prepare(c);await save({title:'Newer Arch9 title'},0,booking,null)
  expect(await finish(c,e,{status:'needs_review',remoteHash:'outside',observed:{deleted:true}})).toBe(false)
  expect((await status()).events[0]).toMatchObject({status:'needs_review',lastError:'outside_change'})
 })
 it('can pause a copy without altering the booking or sending messages',async()=>{
  await connection();await save();await user();await rpc('calendar_provider_event_action',[org,booking,'google','pause',null])
  await save({title:'Still an Arch9 booking'},0,booking,null)
  expect((await status()).events[0]).toMatchObject({status:'paused',enabled:false})
  const c=await work();expect(await prepare(c)).toBeNull()
  expect((await admin('select status from appointments')).rows[0].status).toBe('requested')
 })
 it('disconnects locally, clears credentials, invalidates work and retains late creation evidence',async()=>{
  const connected=await connection();await save();const c=await work(),e=await prepare(c)
  await user();await rpc('disconnect_calendar_provider',[connected]);expect(await finish(c,e)).toBe(false)
  expect((await status()).connections[0].status).toBe('disconnected')
  const row=(await admin('select credential from private.calendar_provider_connections')).rows[0];expect(row.credential).toBeNull()
  expect((await admin('select external_id,status from private.calendar_provider_events')).rows[0]).toEqual({external_id:'provider-event',status:'paused'})
 })
 it('does not allow a reconnect to attach old copies to a different account',async()=>{
  await connection();await user(actor,'service_role');const state='f'.repeat(64)
  await rpc('begin_calendar_provider_oauth',[org,actor,'google',state,'a'.repeat(64),'https://app.example.test/']);await rpc('consume_calendar_provider_oauth',[state,'google'])
  await expect(rpc('finish_calendar_provider_oauth',[state,'another-account','Another',JSON.stringify(cipher)])).rejects.toThrow(/same account/)
 })
 it('isolates worker leases and rejects stale credential rotations',async()=>{
  await connection();await save();const c=await work()
  await user(actor,'service_role');expect(await rpc('claim_calendar_provider_connections',[5])).toHaveLength(0)
  expect(await rpc('refresh_calendar_provider_credential',[c.id,id(99),JSON.stringify(cipher),JSON.stringify({...cipher,ciphertext:'rotated'})])).toBe(false)
  expect(await rpc('refresh_calendar_provider_credential',[c.id,c.lease,JSON.stringify(cipher),JSON.stringify({...cipher,ciphertext:'rotated'})])).toBe(true)
 })
 it('stops credential use after membership removal and protects all private state',async()=>{
  await connection();await save();await admin("update organisation_users set status='inactive' where user_id=$1",[actor])
  await user(actor,'service_role');expect(await rpc('claim_calendar_provider_connections',[5])).toHaveLength(0)
  await user();await expect(rpc('read_calendar_provider_status',[org,booking])).rejects.toThrow(/membership/)
  await expect(db.query('select * from private.calendar_provider_connections')).rejects.toThrow(/permission denied/)
  await user(outsider);await expect(rpc('read_calendar_provider_status',[org,booking])).rejects.toThrow(/membership/)
  await admin("update organisation_users set status='active' where user_id=$1",[actor])
 })
 it('respects historical repair suppression without losing the normal calendar job receipt',async()=>{
  await connection();await save();await admin("update organisation_users set role='principal' where user_id=$1",[actor]);await user(actor,'service_role')
  const snap=await rpc('export_calendar_repair_snapshot',[org]);await rpc('repair_calendar_appointments',[org,id(90),actor,'Reviewed historical data',JSON.stringify([{appointmentId:booking,expectedFingerprint:snap.records[0].fingerprint,action:'suppress_historical_delivery',reason:'Reviewed',evidence:'Original request'}]),false])
  expect((await status()).events[0].status).toBe('suppressed')
 })
})
