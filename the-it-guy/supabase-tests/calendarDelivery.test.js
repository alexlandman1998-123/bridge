import { dispatchCalendarAppointmentJob } from '../../supabase/functions/_shared/calendarAppointmentDelivery.ts'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { id,org,actor,outsider,booking,input,people,setupCalendarReservationDatabase } from './calendarReservationFixture.js'
let db
const client={name:'Buyer',email:'buyer@example.test',participant_role:'Buyer',is_required:true}
const rules=[{reminderType:'custom_30m',offsetMinutes:30}]
async function user(userId=actor,role='authenticated') {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:userId,email:'agent@example.test'})]);await db.exec(`set role ${role}`)
}
async function save({data={},attendees=people([client]),revision=null,command=id(20)}={}) {
 return (await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6) as saved',
 [org,booking,JSON.stringify(input(data)),attendees===null?null:JSON.stringify(attendees),revision,command])).rows[0].saved
}
async function jobs() {return (await db.query('select id,appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,status,attempt_count,scheduled_for,next_attempt_at,provider_message_id,delivered_at from calendar_delivery_jobs order by event_kind,channel')).rows}
async function claim() {await user(actor,'service_role');return (await db.query('select * from claim_calendar_delivery(25)')).rows}
async function prepare(job,payload=null) {return (await db.query('select prepare_calendar_delivery($1,$2,$3) as receipt',[job.id,job.attempt_count,payload===null?null:JSON.stringify(payload)])).rows[0].receipt}
async function complete(job,status='provider_accepted',provider='provider-1') {return (await db.query('select complete_calendar_delivery($1,$2,$3,$4) as receipt',[job.id,job.attempt_count,status,provider])).rows[0].receipt}
const payload=job=>({to:job.recipient_email,appointmentId:job.appointment_id,idempotencyKey:`calendar-appointment:${job.id}`,notes:'Frozen content'})
beforeAll(async()=>{
 db=new PGlite();await setupCalendarReservationDatabase(db)
 await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
  create schema net;create table net.fixture_requests(url text,headers jsonb,body jsonb);
  create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.fixture_requests values(url,headers,body);return 1234;end$$;
  create schema cron;create table cron.fixture_jobs(job_name text,schedule text,command text);
  create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$begin insert into cron.fixture_jobs values(job_name,schedule,command);return 1;end$$;`)
 // pg_net and pg_cron calls are local SQL adapters here; no remote requests.
 const schedule=await readFile(new URL('../../supabase/migrations/20261008184859_calendar_delivery_worker_schedule.sql',import.meta.url),'utf8')
 await db.exec(schedule.replace(/create extension if not exists pg_net with schema extensions;/,'').replace(/create extension if not exists pg_cron;/,''))
},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{await db.exec('reset role;truncate appointments,appointment_participants,appointment_notification_events,private.calendar_mutation_receipts,private.calendar_provider_receipts cascade');await user()})

describe('Durable calendar save and queue',()=>{
 it('commits independently persisted choices and jobs in the verified save, without browser delivery',async()=>{
  const saved=await save({data:{invitations_enabled:false,reminder_rules:rules}})
  expect(saved.delivery).toMatchObject({verified:true,revision:0})
  expect(saved.delivery.jobs).toHaveLength(3) // agent email + profile channel, external email only
  expect(saved.delivery.jobs.every(j=>j.event_kind==='reminder:custom_30m')).toBe(true)
  expect(saved.delivery.jobs.find(j=>j.channel==='in_app').recipient_id).toBe(actor)
  expect(saved.delivery.jobs.find(j=>j.recipient_email===client.email).recipient_id).toBeNull()
  const reloaded=(await db.query('select bridge_list_calendar_appointments_with_times($1) as rows',[org])).rows[0].rows[0]
  expect(reloaded).toMatchObject({invitations_enabled:false,reminders_enabled:true,reminder_rules:rules,calendar_delivery_managed:true})
  expect(saved.delivery.jobs.every(j=>!('payload' in j))).toBe(true)
 })
 it('creates invitations with reminders disabled and preserves an explicitly empty reminder schedule',async()=>{
  const saved=await save({data:{reminders_enabled:false,reminder_rules:[]}})
  expect(saved.delivery.jobs).toHaveLength(3)
  expect(saved.delivery.jobs.every(j=>j.event_kind==='invite')).toBe(true)
 })
 it('schedules only future offsets for a short-notice request',async()=>{
  const start=new Date(Date.now()+60*60000);start.setUTCSeconds(0,0);const end=new Date(start.getTime()+30*60000)
  // Keep this short-notice fixture within one local date even near UTC midnight.
  const offset=start.getUTCHours()===23 ? 120 : 0
  const wallStart=new Date(start.getTime()+offset*60000),wallEnd=new Date(end.getTime()+offset*60000)
  const saved=await save({data:{timezone:offset ? 'Africa/Johannesburg' : 'UTC',appointment_date:wallStart.toISOString().slice(0,10),start_time:wallStart.toISOString().slice(11,16),end_time:wallEnd.toISOString().slice(11,16),date_time:start.toISOString(),end_date_time:end.toISOString()}})
  expect(new Set(saved.delivery.jobs.map(j=>j.event_kind))).toEqual(new Set(['invite','reminder:appointment_reminder_due']))
 })
 it('adds viewing reminders without duplicating the dedicated three-party invitation queue',async()=>{
  await save({data:{reminder_rules:rules}})
  await db.exec('reset role');await db.query('update appointments set listing_viewing_round_number=1 where appointment_id=$1',[booking]);await user()
  const saved=await save({data:{reminder_rules:rules},revision:0,command:id(21),attendees:null})
  expect(saved.appointment.calendar_delivery_managed).toBe(true)
  expect(saved.delivery.jobs).toHaveLength(3)
  expect(saved.delivery.jobs.every(j=>j.event_kind==='reminder:custom_30m')).toBe(true)
 })
 it('has no delivery for drafts and creates no external delivery for internal-only visibility',async()=>{
  expect((await save({data:{status:'draft'}})).delivery.jobs).toHaveLength(0)
  const issued=await save({data:{visibility_scope:'internal_only'},revision:0,command:id(21)})
  expect(issued.delivery.jobs.length).toBeGreaterThan(0)
  expect(issued.delivery.jobs.every(j=>j.recipient_id===actor)).toBe(true)
 })
 it('rolls back the appointment and all jobs on invalid rules or attendee failures',async()=>{
  await expect(save({data:{reminder_rules:[{reminderType:'custom',offsetMinutes:-1}]}})).rejects.toThrow(/valid reminder/)
  await expect(save({attendees:people([{...client,participant_role:'Invalid'}])})).rejects.toThrow()
  expect(await jobs()).toHaveLength(0)
  expect((await db.query('select count(*) from appointments')).rows[0].count).toBe(0)
 })
 it('deduplicates command retries and detects different preferences under a reused command',async()=>{
  const saved=await save();expect((await save()).replayed).toBe(true)
  expect(await jobs()).toHaveLength(saved.delivery.jobs.length)
  await expect(save({data:{invitations_enabled:false}})).rejects.toThrow(/identifier/)
 })
 it('supersedes old and claimed work after a schedule edit, then queues only the new revision',async()=>{
  await save();const claimed=await claim();await user()
  const moved=await save({data:{start_time:'12:00',end_time:'13:00',date_time:'2099-07-20T10:00Z',end_date_time:'2099-07-20T11:00Z'},revision:0,command:id(21),attendees:null})
  expect(moved.delivery.jobs.every(j=>j.revision===1)).toBe(true)
  expect((await jobs()).filter(j=>j.revision===0).every(j=>j.status==='superseded')).toBe(true)
  await user(actor,'service_role');expect(await prepare(claimed[0],payload(claimed[0]))).toBeNull()
 })
 it('rechecks cancellation before a claimed reminder can send',async()=>{
  await save();const claimed=await claim();await user()
  await save({data:{status:'cancelled'},revision:0,command:id(21),attendees:null})
  await user(actor,'service_role');expect(await prepare(claimed[0],payload(claimed[0]))).toBeNull()
  expect((await jobs()).filter(j=>j.status==='queued').every(j=>j.event_kind==='cancelled')).toBe(true)
 })
 it('records provider evidence if cancellation wins while an external request is already in flight',async()=>{
  await save();const job=(await claim()).find(j=>j.channel==='email')
  await prepare(job,payload(job));await user()
  await save({data:{status:'cancelled'},revision:0,command:id(21),attendees:null})
  await user(actor,'service_role');expect(await complete(job)).toBe(false)
  expect((await jobs()).find(j=>j.id===job.id)).toMatchObject({status:'superseded',provider_message_id:'provider-1'})
 })
 it('preserves type defaults and stops expired reminder offsets rather than catching up',async()=>{
  const saved=await save({data:{appointment_type:'internal_meeting'}})
  expect(new Set(saved.delivery.jobs.filter(j=>j.event_kind.startsWith('reminder:')).map(j=>j.event_kind))).toEqual(new Set(['reminder:appointment_reminder_2h','reminder:appointment_reminder_due']))
  await db.exec('reset role');await db.query("update calendar_delivery_jobs set scheduled_for=now()-interval '1 hour',expires_at=now()-interval '45 minutes',next_attempt_at=now()-interval '1 hour' where event_kind like 'reminder:%'")
  expect((await claim()).every(j=>!j.event_kind.startsWith('reminder:'))).toBe(true)
  expect((await jobs()).filter(j=>j.event_kind.startsWith('reminder:')).every(j=>j.status==='superseded')).toBe(true)
 })
 it('stops delivery to removed and declined attendees without fabricated profile IDs',async()=>{
  const saved=await save();const buyer=saved.participants.find(p=>p.email===client.email)
  await db.query("select * from submit_appointment_rsvp($1,'Declined',null,null,null)",[buyer.rsvp_token])
  expect((await jobs()).filter(j=>j.participant_id===buyer.participant_id).every(j=>j.status==='superseded')).toBe(true)
  await save({attendees:saved.participants.filter(p=>p.email!==client.email),revision:1,command:id(21)})
  expect((await jobs()).filter(j=>j.participant_id===buyer.participant_id).every(j=>j.status==='superseded')).toBe(true)
 })
 it('expires held requests even when no expiry cleanup has run',async()=>{
  await save();await db.exec('reset role');await db.query("update appointments set hold_expires_at=now()-interval '1 second' where appointment_id=$1",[booking])
  expect(await claim()).toHaveLength(0)
  expect((await jobs()).every(j=>j.status==='superseded')).toBe(true)
 })
})

describe('Scheduled worker configuration',()=>{
 it('requires Vault configuration and invokes only the local bounded worker adapter',async()=>{
  await db.exec('reset role')
  expect((await db.query('select private.run_calendar_appointment_delivery() as receipt')).rows[0].receipt).toEqual({scheduled:false,reason:'vault_configuration_missing'})
  await db.exec("insert into vault.decrypted_secrets values('arch9_project_url','https://fixture.example.test'),('arch9_service_role_key','local-fixture-only')")
  try {
   expect((await db.query('select private.run_calendar_appointment_delivery() as receipt')).rows[0].receipt).toEqual({scheduled:true,requestId:1234})
   expect((await db.query('select url,body from net.fixture_requests')).rows[0]).toEqual({url:'https://fixture.example.test/functions/v1/calendar-appointment-delivery-worker',body:{limit:10}})
   expect((await db.query('select job_name,schedule from cron.fixture_jobs')).rows[0]).toEqual({job_name:'arch9-calendar-appointment-delivery-1m',schedule:'* * * * *'})
  } finally {await db.exec('truncate vault.decrypted_secrets,net.fixture_requests');await user()}
 })
})

describe('Claims, retries, receipts and access',()=>{
 it('claims each due job once and refuses early reminder work',async()=>{
  await save();const first=await claim();expect(first).toHaveLength(3)
  expect(first.every(j=>j.event_kind==='invite'&&j.attempt_count===1)).toBe(true)
  expect(await claim()).toHaveLength(0)
 })
 it('reclaims an interrupted worker, rejects the old attempt and freezes provider content on retry',async()=>{
  await save();let job=(await claim()).find(j=>j.channel==='email')
  expect(await prepare(job,payload(job))).toEqual(payload(job))
  await db.exec('reset role');await db.query("update calendar_delivery_jobs set claimed_at=now()-interval '6 minutes' where id=$1",[job.id]);await user(actor,'service_role')
  const next=(await claim()).find(j=>j.id===job.id);expect(next.attempt_count).toBe(2)
  expect(await prepare(job,payload(job))).toBeNull();expect(await complete(job)).toBe(false)
  expect(await prepare(next,{...payload(next),notes:'Different on retry'})).toEqual(payload(job))
 })
 it('freezes rendered provider content without storing credentials and rejects public access',async()=>{
  await save();const job=(await claim()).find(j=>j.channel==='email')
  const body={from:'Agent <agent@example.test>',to:job.recipient_email,subject:'Viewing',html:'First branded content',idempotencyKey:`calendar-appointment:${job.id}`}
  const freeze=async value=>(await db.query('select freeze_calendar_provider_payload($1,$2) as receipt',[job.id,JSON.stringify(value)])).rows[0].receipt
  expect(await freeze(body)).toEqual(body)
  expect(await freeze({...body,html:'Changed branding on retry'})).toEqual(body)
  await expect(freeze({...body,apiKey:'never-store-credentials'})).rejects.toThrow(/Invalid provider payload/)
  await user();await expect(freeze(body)).rejects.toThrow(/permission denied/)
  await expect(db.query('select provider_payload from calendar_delivery_jobs')).rejects.toThrow(/permission denied/)
 })
 it('persists in-app delivery once using the profile FK and protects token payloads',async()=>{
  await save();const job=(await claim()).find(j=>j.channel==='in_app')
  expect(await prepare(job)).toEqual({delivered:true});expect(await prepare(job)).toBeNull()
  await db.exec('reset role');expect((await db.query('select recipient_id from appointment_notification_events')).rows).toEqual([{recipient_id:actor}])
  await user();expect((await db.query('select status from calendar_delivery_jobs where id=$1',[job.id])).rows[0].status).toBe('delivered')
  await expect(db.query('select payload from calendar_delivery_jobs')).rejects.toThrow(/permission denied/)
 })
 it('stores provider acceptance separately from actual delivery and rejects empty provider receipts',async()=>{
  await save();const job=(await claim()).find(j=>j.channel==='email')
  await expect(complete(job,'provider_accepted',null)).rejects.toThrow(/Invalid provider receipt/)
  expect(await complete(job)).toBe(true)
  expect((await jobs()).find(j=>j.id===job.id)).toMatchObject({status:'provider_accepted',provider_message_id:'provider-1',delivered_at:null})
  await db.query("select record_calendar_provider_receipt('event-1','provider-1','email.delivered')")
  expect((await jobs()).find(j=>j.id===job.id).status).toBe('delivered')
 })
 it('reconciles early webhook delivery and prevents a later delivered event undoing a bounce',async()=>{
  await save();const job=(await claim()).find(j=>j.channel==='email')
  await db.query("select record_calendar_provider_receipt('event-1','provider-1','email.delivered')")
  await complete(job);expect((await jobs()).find(j=>j.id===job.id).status).toBe('delivered')
  await db.query("select record_calendar_provider_receipt('event-2','provider-1','email.bounced')")
  await db.query("select record_calendar_provider_receipt('event-3','provider-1','email.delivered')")
  expect((await jobs()).find(j=>j.id===job.id)).toMatchObject({status:'failed',attempt_count:5})
  await claim();expect((await jobs()).filter(j=>j.channel==='email'&&j.recipient_email===job.recipient_email&&j.event_kind.startsWith('reminder:')).every(j=>j.status==='superseded')).toBe(true)
 })
 it('bounds transient retries and stops after the final attempt',async()=>{
  await save();const job=(await claim()).find(j=>j.channel==='email')
  await complete(job,'failed',null)
  const failed=(await jobs()).find(j=>j.id===job.id)
  expect(failed.status).toBe('failed');expect(Date.parse(failed.next_attempt_at)).toBeGreaterThan(Date.now())
  expect(await claim()).toHaveLength(0)
  await db.exec('reset role');await db.query("update calendar_delivery_jobs set attempt_count=5,next_attempt_at=now() where id=$1",[job.id]);await user(actor,'service_role')
  expect(await claim()).toHaveLength(0)
 })
 it('runs a committed save through the real SQL worker gate to controlled provider and webhook receipts',async()=>{
  await save({data:{reminder_rules:rules}})
  const claimed=await claim()
  const sqlClient={
   async rpc(name,args) {
    const result=name==='prepare_calendar_delivery' ? await db.query('select prepare_calendar_delivery($1,$2,$3) as receipt',[args.p_id,args.p_attempt,args.p_payload===null?null:JSON.stringify(args.p_payload)])
      : await db.query('select complete_calendar_delivery($1,$2,$3,$4) as receipt',[args.p_id,args.p_attempt,args.p_status,args.p_provider_id])
    return {data:result.rows[0].receipt,error:null}
   },
   from(table) {return {select:()=>({eq:(column,value)=>({maybeSingle:async()=>({data:(await db.query(`select * from ${table} where ${column}=$1`,[value])).rows[0],error:null})})})}}
  }
  // Worker has server-only context reads; the email adapter remains a local fake.
  await db.exec('reset role;grant select on appointments,appointment_participants,profiles to service_role');await user(actor,'service_role')
  let providerCalls=0
  for(const job of claimed) {
   const dispatched=await dispatchCalendarAppointmentJob(sqlClient,job,{supabaseUrl:'https://local.example.test',serviceRoleKey:'fixture-only',appUrl:'https://app.example.test'},async(_url,request)=>{
    providerCalls++;const body=JSON.parse(request.body);expect(body.idempotencyKey).toBe(`calendar-appointment:${job.id}`)
    return new Response(JSON.stringify({ok:true,emailId:`provider-${job.id}`}))
   })
   expect(dispatched.status).toBe(job.channel==='email'?'provider_accepted':'delivered')
  }
  expect(providerCalls).toBe(2)
  for(const job of claimed.filter(job=>job.channel==='email')) await db.query("select record_calendar_provider_receipt($1,$2,'email.delivered')",[`event-${job.id}`,`provider-${job.id}`])
  const persisted=await jobs();expect(persisted.filter(j=>j.event_kind==='invite').every(j=>j.status==='delivered')).toBe(true)
  expect(persisted.filter(j=>j.event_kind.startsWith('reminder:')).every(j=>j.status==='queued')).toBe(true)
 })
 it('honours recipient email opt-outs while retaining the internal in-app route',async()=>{
  await db.exec('reset role;create table notification_recipient_preferences(organisation_id uuid,recipient_email text,email_enabled boolean)')
  await db.query('insert into notification_recipient_preferences values($1,$2,false)',[org,'agent@example.test']);await user()
  try {
   const saved=await save();expect(saved.delivery.jobs.some(j=>j.channel==='in_app')).toBe(true)
   expect(saved.delivery.jobs.some(j=>j.channel==='email'&&j.recipient_email==='agent@example.test')).toBe(false)
  } finally {await db.exec('reset role;drop table notification_recipient_preferences');await user()}
 })
 it('denies public claims, fabricated preferences, queue writes, cross-organisation receipts and private ledger reads',async()=>{
  await save()
  await expect(db.query('select claim_calendar_delivery(25)')).rejects.toThrow(/permission denied/)
  await expect(db.query('update appointments set reminders_enabled=false')).rejects.toThrow(/verified appointment/)
  await expect(db.query("update calendar_delivery_jobs set status='delivered'")).rejects.toThrow(/permission denied/)
  await expect(db.query('select * from private.calendar_provider_receipts')).rejects.toThrow(/permission denied/)
  await user(outsider);expect(await jobs()).toHaveLength(0)
  await user(actor,'anon');await expect(db.query('select claim_calendar_delivery(25)')).rejects.toThrow(/permission denied/)
 })
})
