import {Client} from 'pg'
import process from 'node:process'
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest'
import {setupCalendarReservationDatabase,org,actor,booking,id,input,people} from './calendarReservationFixture.js'
const socket=process.env.CALENDAR_LOCAL_PG_SOCKET
const settings={host:socket,port:55439,database:'postgres',user:'calendar_test'}
const database=`calendar_providers_${process.pid}_${Date.now()}`
let admin,first,second,connection,counter
const cipher={v:1,iv:'fixture-encrypted-iv',ciphertext:'fixture-encrypted-token'}
async function role(client,name='service_role') {await client.query('reset role');await client.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor})]);await client.query(`set role ${name}`)}
const value=async(client,sql,args=[])=>(await client.query(sql,args)).rows[0].result
const claim=client=>value(client,'select claim_calendar_provider_connections(1) as result')
const prepare=(client,c)=>value(client,'select prepare_calendar_provider_event($1,$2) as result',[c.id,c.lease])
const finish=(client,c,e,result={})=>value(client,'select finish_calendar_provider_event($1,$2,$3,$4,$5,$6,$7) as result',[c.id,c.lease,booking,e.job_lease,e.copy_key,e.version,JSON.stringify({status:'synced',externalId:'provider-id',remoteHash:'remote-hash',etag:'etag',writtenHash:e.desired_hash,...result})])
async function save(client,changes={},revision=null) {
 await role(client,'authenticated');return value(client,'select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6) as result',[org,booking,JSON.stringify(input(changes)),revision===null?JSON.stringify(people([])):null,revision,id(200+ ++counter)])
}
async function blocked() {
 for(let i=0;i<100;i++) {if((await admin.query("select count(*)::int as n from pg_stat_activity where datname=$1 and wait_event='advisory'",[database])).rows[0].n>0)return;await new Promise(resolve=>setTimeout(resolve,20))}
 throw new Error('Expected an independent transaction to wait for the calendar lock.')
}
describe.skipIf(!socket)('Independent local provider transactions',()=>{
 beforeAll(async()=>{
  if(!socket.startsWith('/') || !socket.includes('/calendar-phase3-'))throw new Error('Use an isolated calendar test socket.')
  const bootstrap=new Client(settings);await bootstrap.connect();await bootstrap.query(`create database ${database}`);await bootstrap.end()
  admin=new Client({...settings,database});await admin.connect();await setupCalendarReservationDatabase({exec:s=>admin.query(s),query:(s,a)=>admin.query(s,a)})
  first=new Client({...settings,database});second=new Client({...settings,database});await Promise.all([first.connect(),second.connect()])
 },30000)
 beforeEach(async()=>{
  counter=0;await first.query('rollback');await second.query('rollback');await admin.query('truncate appointments,appointment_participants,private.calendar_mutation_receipts,private.calendar_repair_batches,private.calendar_provider_connections,private.calendar_provider_audit cascade')
  await role(first);await role(second)
  connection=(await value(first,'select begin_calendar_provider_oauth($1,$2,$3,$4,$5,$6) as result',[org,actor,'google','a'.repeat(64),'v'.repeat(64),'https://app.example.test/'])).connectionId
  await first.query('select consume_calendar_provider_oauth($1,$2)',['a'.repeat(64),'google']);await first.query('select finish_calendar_provider_oauth($1,$2,$3,$4)',['a'.repeat(64),'account','Account',JSON.stringify(cipher)])
  await save(first);await role(first)
 })
 afterAll(async()=>{
  await Promise.all([first?.end(),second?.end(),admin?.end()]);const bootstrap=new Client(settings);await bootstrap.connect();await bootstrap.query(`drop database if exists ${database}`);await bootstrap.end()
 })
 it('gives simultaneous worker claims one connection lease',async()=>{
  await first.query('begin');expect(await claim(first)).toHaveLength(1)
  const pending=claim(second);await blocked();await first.query('commit');expect(await pending).toEqual([])
 })
 it('reclaims an expired lease and refuses an old preparation or release',async()=>{
  const c=(await claim(first))[0],e=await prepare(first,c)
  await admin.query("update private.calendar_provider_connections set lease_expires_at=now()-interval '1 minute'")
  const next=(await claim(second))[0];expect(next.lease).not.toBe(c.lease);expect(await prepare(first,c)).toBeNull()
  await first.query('select release_calendar_provider_connection($1,$2)',[c.id,c.lease]);expect(await prepare(second,next)).toMatchObject({copy_key:e.copy_key})
 })
 it.each([{title:'Concurrent title'},{status:'cancelled'}])('fences a provider receipt behind a concurrent edit %j',async changes=>{
  const c=(await claim(first))[0],e=await prepare(first,c)
  await first.query('begin');await save(first,changes,0)
  const pending=finish(second,c,e);await blocked();await first.query('commit');expect(await pending).toBe(false)
  const stored=(await admin.query('select external_id,status,desired_action from private.calendar_provider_events')).rows[0]
  expect(stored).toMatchObject({external_id:'provider-id',status:'queued',desired_action:changes.status?'delete':'upsert'})
 })
 it('keeps a late creation receipt paused behind disconnect and removes the secret',async()=>{
  const c=(await claim(first))[0],e=await prepare(first,c)
  await role(first,'authenticated');await first.query('begin');await first.query('select disconnect_calendar_provider($1)',[connection])
  const pending=finish(second,c,e);await blocked();await first.query('commit');expect(await pending).toBe(false)
  expect((await admin.query('select credential,status from private.calendar_provider_connections')).rows[0]).toEqual({credential:null,status:'disconnected'})
  expect((await admin.query('select external_id,status from private.calendar_provider_events')).rows[0]).toEqual({external_id:'provider-id',status:'paused'})
 })
 it('rejects a consumed authorization finishing after concurrent disconnect',async()=>{
  await first.query('select begin_calendar_provider_oauth($1,$2,$3,$4,$5,$6)',[org,actor,'google','b'.repeat(64),'v'.repeat(64),'https://app.example.test/'])
  await first.query('select consume_calendar_provider_oauth($1,$2)',['b'.repeat(64),'google'])
  await role(first,'authenticated');await first.query('begin');await first.query('select disconnect_calendar_provider($1)',[connection])
  const pending=second.query('select finish_calendar_provider_oauth($1,$2,$3,$4)',['b'.repeat(64),'account','Account',JSON.stringify(cipher)]).catch(error=>error)
  await blocked();await first.query('commit');expect((await pending).message).toMatch(/no longer valid/)
 })
 it('returns one support receipt for simultaneous retries of the same command',async()=>{
  await admin.query("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where event_kind='invite'")
  const job=(await admin.query("select id from calendar_delivery_jobs where event_kind='invite' limit 1")).rows[0].id
  await role(first,'authenticated');await role(second,'authenticated')
  const retry=client=>value(client,'select calendar_support_action($1,$2,$3,$4,$5,$6,$7) as result',[org,booking,0,'retry',job,id(901),'Reviewed outage'])
  await first.query('begin');expect(await retry(first)).toMatchObject({queued:1,replayed:false})
  const pending=retry(second);await blocked();await first.query('commit');expect(await pending).toMatchObject({queued:1,replayed:true})
  expect((await admin.query('select count(*)::int as n from private.calendar_support_commands')).rows[0].n).toBe(1)
  expect((await admin.query('select attempt_count,max_attempts from calendar_delivery_jobs where id=$1',[job])).rows[0]).toEqual({attempt_count:5,max_attempts:6})
 })
 it('rejects stale recovery behind a simultaneous cancellation without reviving jobs',async()=>{
  await admin.query("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where event_kind='invite'")
  const job=(await admin.query("select id from calendar_delivery_jobs where event_kind='invite' limit 1")).rows[0].id
  await first.query('begin');await save(first,{status:'cancelled'},0);await role(second,'authenticated')
  const pending=value(second,'select calendar_support_action($1,$2,$3,$4,$5,$6,$7) as result',[org,booking,0,'retry',job,id(902),'Reviewed outage']).catch(error=>error)
  await blocked();await first.query('commit');expect((await pending).message).toMatch(/Appointment changed/)
  expect((await admin.query('select status from calendar_delivery_jobs where id=$1',[job])).rows[0].status).toBe('superseded')
  expect((await admin.query('select count(*)::int as n from private.calendar_support_commands')).rows[0].n).toBe(0)
 })
 it('reconciles concurrent missing reminder work once while preserving the original hold',async()=>{
  await admin.query("delete from calendar_delivery_jobs where event_kind like 'reminder:%'")
  const hold=(await admin.query('select hold_expires_at from appointments')).rows[0].hold_expires_at
  await role(first,'authenticated');await role(second,'authenticated')
  const reconcile=(client,command)=>value(client,'select calendar_support_action($1,$2,$3,$4,$5,$6,$7) as result',[org,booking,0,'reconcile',null,command,'Reviewed missing reminders'])
  await first.query('begin');const initial=await reconcile(first,id(903));expect(initial.queued).toBeGreaterThan(0)
  const pending=reconcile(second,id(904));await blocked();await first.query('commit');expect(await pending).toMatchObject({queued:0})
  expect((await admin.query("select count(*)::int as n from calendar_delivery_jobs where event_kind like 'reminder:%'")).rows[0].n).toBe(initial.queued)
  expect((await admin.query('select hold_expires_at from appointments')).rows[0].hold_expires_at).toEqual(hold)
 })
})
