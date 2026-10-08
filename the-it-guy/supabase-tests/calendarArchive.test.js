import { PGlite } from '@electric-sql/pglite'
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest'
import { id,org,actor,second,outsider,booking,input,people,setupCalendarReservationDatabase } from './calendarReservationFixture.js'
let db
async function user(who=actor,role='authenticated') {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:who,email:'agent@example.test'})]);await db.exec(`set role ${role}`)
}
async function save(data={},revision=null,command=id(20),attendees=people([])) {
 return (await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6) as receipt',[org,booking,JSON.stringify(input(data)),attendees===null?null:JSON.stringify(attendees),revision,command])).rows[0].receipt
}
async function archive({hide=true,revision=0,archivedAt=null,command=id(21),reason='Duplicate appointment'}={}) {
 return (await db.query('select set_calendar_appointment_archive($1,$2,$3,$4,$5,$6,$7) as receipt',[org,booking,hide,reason,revision,archivedAt,command])).rows[0].receipt
}
beforeAll(async()=>{db=new PGlite();await setupCalendarReservationDatabase(db)},30000)
afterAll(async()=>db?.close())
beforeEach(async()=>{await db.exec('reset role;truncate appointments,appointment_participants,private.calendar_mutation_receipts cascade');await user()})
describe('Reversible appointment archive with authoritative SQL',()=>{
 it('archives a draft with an audit record and restores only visibility',async()=>{
  const saved=await save({status:'draft'})
  const hidden=await archive()
  expect(hidden).toMatchObject({verified:true,appointment:{status:'draft',calendar_revision:0,archived_by:actor,archive_reason:'Duplicate appointment'}})
  expect(hidden.appointment.archived_at).toBeTruthy()
  const rows=(await db.query('select bridge_list_calendar_appointments_with_times($1) as rows',[org])).rows[0].rows
  expect(rows[0].archived_at).toBe(hidden.appointment.archived_at)
  const restored=await archive({hide:false,archivedAt:hidden.appointment.archived_at,command:id(22),reason:'Keep in draft history'})
  expect(restored.appointment).toMatchObject({archived_at:null,archived_by:null,archive_reason:null,status:'draft',calendar_revision:saved.appointment.calendar_revision,hold_expires_at:saved.appointment.hold_expires_at})
  expect(restored.delivery.jobs).toHaveLength(0)
  await db.exec('reset role')
  expect((await db.query('select action,actor_id from private.calendar_archive_history order by created_at')).rows).toEqual([{action:'archive',actor_id:actor},{action:'restore',actor_id:actor}])
 })
 it('requires cancellation first and rejects expired active requests too',async()=>{
  await save()
  await expect(archive()).rejects.toThrow(/Cancel an active/)
  await db.exec('reset role;update appointments set hold_expires_at=now()-interval \'1 hour\'')
  await user();await expect(archive()).rejects.toThrow(/Cancel an active/)
 })
 it('keeps cancelled history, closes old delivery and never revives tokens or jobs on restore',async()=>{
  await save()
  const closed=await save({status:'cancelled'},0,id(30),null)
  const originalTokens=closed.participants.map(p=>p.rsvp_token)
  const hidden=await archive({revision:1})
  expect(hidden.delivery.jobs.every(j=>j.status==='superseded')).toBe(true)
  const restored=await archive({hide:false,revision:1,archivedAt:hidden.appointment.archived_at,command:id(22)})
  expect(restored.appointment.status).toBe('cancelled')
  expect(restored.participants.map(p=>p.rsvp_token)).toEqual(originalTokens)
  expect(restored.delivery.jobs.every(j=>j.status==='superseded')).toBe(true)
  await user(actor,'service_role');expect((await db.query('select * from claim_calendar_delivery(25)')).rows).toHaveLength(0)
 })
 it('deduplicates a lost response and rejects command reuse, stale revisions and competing archive states',async()=>{
  await save({status:'draft'})
  const hidden=await archive()
  expect((await archive()).replayed).toBe(true)
  await expect(archive({reason:'Different command'})).rejects.toThrow(/identifier/)
  await expect(archive({command:id(23)})).rejects.toThrow(/changed/)
  await expect(archive({hide:false,revision:9,archivedAt:hidden.appointment.archived_at,command:id(24)})).rejects.toThrow(/changed/)
  await db.exec('reset role');expect((await db.query('select count(*)::int as n from private.calendar_archive_history')).rows[0].n).toBe(1)
 })
 it('enforces management scope, anonymous denial and private audit isolation',async()=>{
  await save({status:'draft'},null,id(20),people([{user_id:second,name:'Attendee',email:'other@example.test',participant_role:'Co-agent'}]))
  for (const who of [second,outsider]) {await user(who);await expect(archive()).rejects.toThrow(/authorised/)}
  await user(actor,'anon');await expect(archive()).rejects.toThrow(/permission denied/)
  await user();await expect(db.query('select * from private.calendar_archive_history')).rejects.toThrow(/permission denied/)
 })
 it('prevents direct archive and any edits/reissue while archived',async()=>{
  await save({status:'draft'})
  await expect(db.query('update appointments set archived_at=now() where appointment_id=$1',[booking])).rejects.toThrow(/verified archive/)
  await archive()
  await expect(save({status:'requested'},0,id(25),null)).rejects.toThrow(/Restore/)
  await expect(db.query('update appointments set notes=$1 where appointment_id=$2',['Changed',booking])).rejects.toThrow(/Restore/)
  await db.exec('reset role');expect((await db.query('select count(*)::int as n from private.calendar_archive_history')).rows[0].n).toBe(1)
 })
 it('requires a reason and rolls back invalid archive requests completely',async()=>{
  await save({status:'draft'})
  await expect(archive({reason:' '})).rejects.toThrow(/reason/)
  await expect(archive({reason:'x'.repeat(1001)})).rejects.toThrow(/reason/)
  expect((await db.query('select archived_at from appointments')).rows[0].archived_at).toBeNull()
 })
})
