import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { setupCalendarReservationDatabase, org, otherOrg, actor, second, outsider, booking, id, input, people } from './calendarReservationFixture.js'
let db
async function role(name='service_role') { await db.exec(`reset role; set role ${name}`) }
async function snapshot() { await role(); return (await db.query('select export_calendar_repair_snapshot($1) as snapshot',[org])).rows[0].snapshot }
async function entry(action='normalise_metadata',extra={},which=booking) {
 const exported=await snapshot(); const record=exported.records.find(r=>r.appointment.appointment_id===which)
 return {appointmentId:which,expectedFingerprint:record.fingerprint,action,reason:'Reviewed original booking',evidence:'Confirmed against original invitation',...extra}
}
async function repair(entries,{preview=true,batch=id(40),reviewer=actor,organisation=org}={}) {
 await role(); return (await db.query('select repair_calendar_appointments($1,$2,$3,$4,$5,$6) as receipt',[organisation,batch,reviewer,'Historical calendar repair',JSON.stringify(entries),preview])).rows[0].receipt
}
async function rollback({preview=true,original=id(40),batch=id(41)}={}) {
 await role();return (await db.query('select rollback_calendar_repair($1,$2,$3,$4,$5,$6) as receipt',[org,original,batch,actor,'Recover reviewed repair',preview])).rows[0].receipt
}
async function admin(sql,args=[]) { await db.exec('reset role'); return sql.includes(';') && !args.length ? db.exec(sql) : db.query(sql,args) }
async function seed(changes={},which=booking,attendees=people([])) {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,email:'agent@example.test'})]);await db.exec('set role authenticated')
 await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6)',[org,which,JSON.stringify(input(changes)),JSON.stringify(attendees),null,id(Number(which.slice(-4))+100)])
}
beforeAll(async()=>{db=new PGlite();await setupCalendarReservationDatabase(db);await db.exec("alter table appointments add is_demo_data boolean default false;update organisation_users set role='principal' where user_id='"+actor+"'")},30000)
afterAll(async()=>db?.close())
beforeEach(async()=>{await db.exec('reset role;truncate appointments,appointment_participants,private.calendar_mutation_receipts,private.calendar_repair_batches cascade')})
describe('Reviewed historical repair against authoritative SQL',()=>{
 it('exports fingerprints and redacts names, addresses and response tokens',async()=>{
  await seed();const report=await snapshot();expect(report).toMatchObject({version:1,organisationId:org,complete:true,total:1})
  const text=JSON.stringify(report);expect(text).not.toContain('agent@example.test');expect(text).not.toContain('rsvp_token');expect(text).not.toContain('Viewing')
  expect(report.records[0].fingerprint).toMatch(/^[a-f0-9]{32}$/)
 })
 it('previews trigger effects without changing rows, jobs or private audit',async()=>{
  await seed();await admin("update appointments set status='Pending Confirmation',reservation_managed=false,hold_expires_at=null,created_at=now()-interval '10 days',request_issued_at=null")
  const before=await snapshot();const preview=await repair([await entry()]);expect(preview).toMatchObject({verified:true,preview:true})
  expect((await snapshot()).records).toEqual(before.records)
  expect((await admin('select count(*)::int as n from private.calendar_repair_batches')).rows[0].n).toBe(0)
 })
 it('normalises known labels and original hold deadlines without fresh invitations',async()=>{
  await seed();await admin("update appointments set status='Pending Confirmation',reservation_managed=false,hold_expires_at=null,created_at=now()-interval '10 days',request_issued_at=null")
  const result=await repair([await entry()],{preview:false});expect(result.preview).toBe(false)
  const record=(await snapshot()).records[0];expect(record.appointment).toMatchObject({status:'requested',reservation_managed:true,calendar_revision:2})
  expect(Date.parse(record.appointment.hold_expires_at)-Date.parse(record.appointment.created_at)).toBe(86400000)
  expect(record.jobs.every(j=>j.status==='superseded')).toBe(true)
  expect((await db.query('select * from claim_calendar_delivery(25)')).rows).toHaveLength(0)
 })
 it('keeps an earlier deadline and persists delivery choices',async()=>{
  await seed({invitations_enabled:false,reminders_enabled:true});await admin("update appointments set hold_expires_at=now()+interval '2 hours'")
  const prior=(await snapshot()).records[0].appointment;await repair([await entry()],{preview:false})
  expect((await snapshot()).records[0].appointment).toMatchObject({hold_expires_at:prior.hold_expires_at,invitations_enabled:false,reminders_enabled:true})
 })
 it('derives an end only from existing clock evidence and refuses a guessed duration',async()=>{
  await seed();await admin('update appointments set end_date_time=null');await repair([await entry()],{preview:false})
  expect((await snapshot()).records[0].appointment.end_date_time).toBe('2099-07-20T09:00:00+00:00')
  await admin('update appointments set end_time=null,end_date_time=null')
  await expect(repair([await entry()],{batch:id(42)})).rejects.toThrow(/Missing duration/)
 })
 it('matches internal attendees by exact unique active profile while preserving identity and response',async()=>{
  await seed({},booking,people([{name:'Second',email:'other@example.test',participant_role:'Co-agent',is_required:false}]))
  let r=(await snapshot()).records[0];const p=r.participants.find(p=>p.emailKey && !p.user_id)
  expect(p.matchingProfileIds).toEqual([second]);await repair([await entry('link_internal_participant',{participantId:p.participant_id,userId:second})],{preview:false})
  r=(await snapshot()).records[0];expect(r.participants.find(x=>x.participant_id===p.participant_id)).toMatchObject({...p,user_id:second})
  await rollback({preview:false});expect((await snapshot()).records[0].participants.find(x=>x.participant_id===p.participant_id).user_id).toBeNull()
 })
 it('rejects cross-organisation, external and ambiguous identity matches',async()=>{
  await seed({},booking,people([{name:'Client',email:'other@example.test',participant_role:'Buyer'}]))
  const p=(await snapshot()).records[0].participants.find(p=>!p.user_id)
  await expect(repair([await entry('link_internal_participant',{participantId:p.participant_id,userId:second})])).rejects.toThrow(/internal attendee/)
  await admin("update appointment_participants set participant_role='Co-agent' where participant_id=$1",[p.participant_id])
  await expect(repair([await entry('link_internal_participant',{participantId:p.participant_id,userId:outsider})])).rejects.toThrow(/unique, exact/)
  await admin('insert into organisation_users(organisation_id,user_id,role,status) values($1,$2,$3,$4)',[org,outsider,'agent','active'])
  await admin("update profiles set email='other@example.test' where id=$1",[outsider]);await expect(repair([await entry('link_internal_participant',{participantId:p.participant_id,userId:second})])).rejects.toThrow(/unique, exact/)
  await admin('delete from organisation_users where organisation_id=$1 and user_id=$2',[org,outsider]);await admin("update profiles set email='outside@example.test' where id=$1",[outsider])
 })
 it('requires fresh worker fingerprints and atomically rejects a partly stale batch',async()=>{
  await seed();await seed({start_time:'12:00',end_time:'13:00',date_time:'2099-07-20T10:00:00Z',end_date_time:'2099-07-20T11:00:00Z'},id(60))
  const entries=[await entry(),await entry('normalise_metadata',{},id(60))]
  await admin("update calendar_delivery_jobs set attempt_count=attempt_count+1 where appointment_id=$1",[id(60)])
  await expect(repair(entries,{preview:false})).rejects.toThrow(/fresh snapshot/)
  expect((await snapshot()).records.every(r=>r.appointment.calendar_revision===0)).toBe(true)
  expect((await admin('select count(*)::int as n from private.calendar_repair_entries')).rows[0].n).toBe(0)
 })
 it('deduplicates retries, reports later changes, and rejects changed batch details',async()=>{
  await seed();const e=await entry();await repair([e],{preview:false});expect(await repair([e],{preview:false})).toMatchObject({replayed:true,current:true})
  await expect(repair([{...e,reason:'Another plan'}],{preview:false})).rejects.toThrow(/different plan/)
  await admin("update appointments set notes='Agent made a subsequent change'");expect(await repair([e],{preview:false})).toMatchObject({replayed:true,current:false})
  await expect(rollback({preview:false})).rejects.toThrow(/fresh snapshot/)
 })
 it('rolls back metadata without resurrecting jobs, response deadlines or revisions',async()=>{
  await seed();await admin("update appointments set status='Pending Confirmation',reservation_managed=false,created_at=now()-interval '10 days',request_issued_at=null,hold_expires_at=null")
  await repair([await entry()],{preview:false});const after=(await snapshot()).records
  expect((await rollback()).preview).toBe(true);expect((await snapshot()).records).toEqual(after)
  expect((await rollback({preview:false})).preview).toBe(false)
  const r=(await snapshot()).records[0];expect(r.appointment).toMatchObject({status:'Pending Confirmation',calendar_revision:3,reservation_managed:false})
  expect(Date.parse(r.appointment.hold_expires_at)).toBeLessThan(Date.now())
  expect(r.jobs.every(j=>j.status==='superseded')).toBe(true);expect(r.participants.every(p=>Date.parse(p.rsvp_expires_at)<Date.now())).toBe(true)
  expect(await rollback({preview:false})).toMatchObject({replayed:true,current:true})
 })
 it('allows evidenced past time correction and recovery while revoking stale RSVP links',async()=>{
  await seed({status:'draft'})
  await admin("update appointments set appointment_date='2020-01-01',start_time='10:00',end_time='11:00',date_time='2020-01-01T08:00:00Z',end_date_time='2020-01-01T09:00:00Z',status='confirmed',reservation_managed=true")
  await admin("alter table appointments disable trigger calendar_original_reservation_guard; alter table appointments disable trigger calendar_final_appointment_slot; update appointments set date_time='2020-01-01T10:00:00Z'; set constraints all immediate; alter table appointments enable trigger calendar_original_reservation_guard; alter table appointments enable trigger calendar_final_appointment_slot")
  const schedule={appointment_date:'2020-01-01',start_time:'10:00',end_time:'11:00',date_time:'2020-01-01T08:00:00Z',end_date_time:'2020-01-01T09:00:00Z',timezone:'Africa/Johannesburg',all_day:false}
  await repair([await entry('correct_past_schedule',{schedule})],{preview:false});let r=(await snapshot()).records[0]
  expect(r.appointment.date_time).toBe('2020-01-01T08:00:00+00:00');expect(r.participants.every(p=>p.rsvp_revoked_at)).toBe(true)
  await rollback({preview:false});r=(await snapshot()).records[0];expect(r.appointment.date_time).toBe('2020-01-01T10:00:00+00:00');expect(r.participants.every(p=>p.rsvp_revoked_at)).toBe(true)
 })
 it('does not move future bookings or close uncertain past outcomes',async()=>{
  await seed();await expect(repair([await entry('correct_past_schedule',{schedule:input()})])).rejects.toThrow(/reschedule workflow/)
  await expect(repair([await entry('complete')])).rejects.toThrow(/Unsupported/)
  await expect(repair([await entry('normalise_metadata',{status:'completed'})])).rejects.toThrow(/supported fields/)
 })
 it('excludes demo, archived and specialist records from generic repairs',async()=>{
  await seed({status:'draft'});for(const field of ['is_demo_data=true','attorney_delivery_enabled=false','listing_viewing_round_number=1',"archived_at=now(),archived_by='"+actor+"'"]) {
   await admin('update appointments set '+field);await expect(repair([await entry('suppress_historical_delivery')])).rejects.toThrow(/dedicated workflow/)
   await admin('update appointments set is_demo_data=false,attorney_delivery_enabled=null,listing_viewing_round_number=null,archived_at=null,archived_by=null')
  }
 })
 it('denies browser access, unauthorised reviewers and keeps private audit inaccessible',async()=>{
  await seed();const e=await entry()
  await role('authenticated');await expect(db.query('select export_calendar_repair_snapshot($1)',[org])).rejects.toThrow(/permission denied/)
  await role('anon');await expect(db.query('select repair_calendar_appointments($1,$2,$3,$4,$5,true)',[org,id(40),actor,'Repair',JSON.stringify([e])])).rejects.toThrow(/permission denied/)
  await expect(repair([e],{reviewer:second})).rejects.toThrow(/manager/)
  await expect(repair([e],{organisation:otherOrg})).rejects.toThrow(/manager|outside/)
  await role();await expect(db.query('select * from private.calendar_repair_entries')).rejects.toThrow(/permission denied/)
  await db.exec('reset role');await expect(db.query('select export_calendar_repair_snapshot($1)',[org])).rejects.toThrow(/server-side/)
 })
 it('requires per-record evidence and refuses unsupported fields or caller recovery',async()=>{
  await seed();const e=await entry();for(const change of [{evidence:''},{originalBatch:id(42)},{schedule:input()},{participantId:id(22)},{action:'rollback'}]) await expect(repair([{...e,...change}])).rejects.toThrow(/evidence|Recovery|rollback|Fields/)
 })
 it('keeps live booking conflicts out of metadata repairs without choosing a winner',async()=>{
  await seed({status:'confirmed'});await seed({status:'confirmed',start_time:'12:00',end_time:'13:00',date_time:'2099-07-20T10:00:00Z',end_date_time:'2099-07-20T11:00:00Z'},id(60))
  await admin('alter table appointments disable trigger calendar_original_reservation_guard;alter table appointments disable trigger calendar_final_appointment_slot')
  await admin("update appointments set start_time='10:00',end_time='11:00',date_time='2099-07-20T08:00:00Z',end_date_time='2099-07-20T09:00:00Z' where appointment_id=$1",[id(60)])
  await admin('alter table appointments enable trigger calendar_original_reservation_guard;alter table appointments enable trigger calendar_final_appointment_slot')
  expect((await snapshot()).records[0].reservationConflict).toBe(true)
  await expect(repair([await entry()],{preview:false})).rejects.toThrow(/already reserved/)
  expect((await admin('select count(*)::int as n from private.calendar_repair_batches')).rows[0].n).toBe(0)
 })
 it('recovers a lost receipt read-only and never exposes its private before-state',async()=>{
  await seed();await repair([await entry()],{preview:false})
  const receipt=(await db.query('select get_calendar_repair_receipt($1,$2) as receipt',[org,id(40)])).rows[0].receipt
  expect(receipt).toMatchObject({verified:true,preview:false,replayed:true,current:true})
  for(const secret of ['rsvp_token','agent@example.test','before_state']) expect(JSON.stringify(receipt)).not.toContain(secret)
  await expect(db.query('select get_calendar_repair_receipt($1,$2)',[otherOrg,id(40)])).rejects.toThrow(/No verified/)
  await role('authenticated');await expect(db.query('select get_calendar_repair_receipt($1,$2)',[org,id(40)])).rejects.toThrow(/permission denied/)
 })
 it('does not shorten a confirmed RSVP deadline to an old request hold',async()=>{
  await seed({status:'confirmed'});await admin("update appointment_participants set rsvp_expires_at='2099-07-20T08:00:00Z'")
  await admin("update appointments set request_issued_at=now()-interval '10 days',hold_expires_at=now()-interval '9 days'")
  await repair([await entry()],{preview:false});expect((await snapshot()).records[0].participants.every(p=>Date.parse(p.rsvp_expires_at)>Date.now())).toBe(true)
 })
 it('rejects a repair when an RSVP capability changes after review',async()=>{
  await seed();const e=await entry();await admin("update appointment_participants set rsvp_revoked_at=now()")
  await expect(repair([e],{preview:false})).rejects.toThrow(/fresh snapshot/)
 })
 it('suppresses only the repair revision and resumes after an intentional reissue',async()=>{
  await seed();await repair([await entry('suppress_historical_delivery')],{preview:false})
  expect((await db.query('select * from claim_calendar_delivery(25)')).rows).toHaveLength(0)
  await db.exec('reset role;set role authenticated')
  await db.query("select save_calendar_appointment_with_delivery($1,$2,$3,null,1,$4,'reissue')",[org,booking,JSON.stringify({notes:'Intentionally reissued after review'}),id(90)])
  const r=(await snapshot()).records[0];expect(r.appointment.calendar_revision).toBeGreaterThan(1)
  expect(r.jobs.some(j=>j.revision===r.appointment.calendar_revision && j.status==='queued')).toBe(true)
 })

})
