import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { actor,second,outsider,org,booking,id,input,people,setupCalendarReservationDatabase } from './calendarReservationFixture'
let db,command=60
const start='2099-07-21T08:00:00Z'
async function user(who=actor) {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:who,email:who===actor?'agent@example.test':who===second?'other@example.test':'outside@example.test'})]);await db.exec('set role authenticated')
}
async function admin(sql,args=[]) {await db.exec('reset role');return (await db.query(sql,args)).rows}
async function state() {return (await db.query('select get_calendar_time_change($1) as state',[booking])).rows[0].state}
async function mutate(action,request=null,preferred=null,revision=null,key=id(command++)) {
 const current=await state();return (await db.query('select mutate_calendar_time_change($1,$2,$3,$4,$5,$6,$7) as saved',[booking,revision??current.revision,key,action,request,preferred,'Please move our appointment.'])).rows[0].saved
}
async function seed(changes={}) {
 await user();const row=(await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6) as saved',[org,booking,JSON.stringify(input(changes)),JSON.stringify(people([{user_id:second,name:'Buyer',email:'other@example.test',participant_role:'Buyer',is_required:true}])),null,id(20)])).rows[0].saved
 await db.query("select * from submit_appointment_rsvp($1,'Accepted',null,null,null)",[row.participants.find(p=>p.user_id===second).rsvp_token])
}
beforeAll(async()=>{db=new PGlite();await setupCalendarReservationDatabase(db)},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{command=60;await admin('truncate appointments,appointment_participants,appointment_reminders,appointment_reschedule_requests,calendar_delivery_jobs,private.calendar_mutation_receipts cascade');await seed()})
it('requests a fixed-duration replacement without moving the original booking',async()=>{
 await user(second);const result=await mutate('request',null,start)
 expect(result.state.active.status).toBe('pending');expect(Date.parse(result.state.active.preferred_end)-Date.parse(result.state.active.preferred_start)).toBe(3600000)
 const row=(await admin('select date_time,has_confirmed_reservation from appointments'))[0]
 expect(Date.parse(row.date_time)).toBe(Date.parse('2099-07-20T08:00:00Z'));expect(row.has_confirmed_reservation).toBe(true)
})
it('requires organiser review and every required attendee’s approval',async()=>{
 await user(second);const created=await mutate('request',null,start);const request=created.state.active.id
 await expect(mutate('propose',request,start)).rejects.toThrow(/organiser/)
 await user();const proposed=await mutate('propose',request,start);expect(proposed.state.active.status).toBe('proposed')
 await mutate('accept',request)
 expect(Date.parse((await admin('select date_time from appointments'))[0].date_time)).toBe(Date.parse('2099-07-20T08:00:00Z'))
 await user(second);const accepted=await mutate('accept',request);expect(accepted.state.active).toBeNull()
 expect(Date.parse((await admin('select date_time from appointments'))[0].date_time)).toBe(Date.parse(start))
})
it('deduplicates retries and rejects a second active request or stale decision',async()=>{
 await user(second);const before=await state();const key=id(90);const first=await mutate('request',null,start,before.revision,key)
 expect((await mutate('request',null,start,before.revision,key)).replayed).toBe(true)
 await expect(mutate('request',null,'2099-07-22T08:00:00Z')).rejects.toThrow(/already awaiting/)
 await user();await expect(mutate('propose',first.state.active.id,start,before.revision)).rejects.toThrow(/changed/)
})
it('withdraws the requester’s request and restores the original RSVP and reservation',async()=>{
 await user(second);const created=await mutate('request',null,start);await mutate('withdraw',created.state.active.id)
 const row=(await admin('select status,has_confirmed_reservation from appointments'))[0]
 expect(row.status).toBe('confirmed');expect(row.has_confirmed_reservation).toBe(true)
 expect((await admin('select rsvp_status from appointment_participants where user_id=$1',[second]))[0].rsvp_status).toBe('Accepted')
})
it('expires pending requests without cancelling the original appointment',async()=>{
 await user(second);await mutate('request',null,start);await admin("update appointment_reschedule_requests set request_expires_at=now()-interval '1 second'")
 await db.query('select expire_calendar_holds()');expect((await admin('select status from appointments'))[0].status).toBe('confirmed')
 expect((await admin('select closed_reason from appointment_reschedule_requests'))[0].closed_reason).toBe('expired')
})
it('denies cross-organisation access',async()=>{
 await user(outsider);await expect(state()).rejects.toThrow(/access/)
 await expect(db.query('select mutate_calendar_time_change($1,0,$2,$3)',[booking,id(99),'request'])).rejects.toThrow(/access/)
})
it('checks live conflicts again when the organiser proposes the requested slot',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6)',[org,id(140),JSON.stringify(input({appointment_date:'2099-07-21',date_time:start,end_date_time:'2099-07-21T09:00:00Z'})),JSON.stringify(people([])),null,id(141)])
 await expect(mutate('propose',request,start)).rejects.toThrow(/already reserved/)
 expect((await state()).active.status).toBe('pending')
})
it('expires a proposed replacement and releases only the replacement hold',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await mutate('propose',request,start)
 await admin("update appointment_reschedule_requests set hold_expires_at=now()-interval '1 second'")
 await db.query('select expire_calendar_holds()')
 expect((await admin('select status,has_confirmed_reservation from appointments'))[0]).toMatchObject({status:'confirmed',has_confirmed_reservation:true})
 expect((await admin("select count(*) from appointment_participants where proposal_id is not null"))[0].count).toBe(0)
})
it('lets an already accepted guest request and withdraw using only their current invitation token',async()=>{
 const token=(await admin('select rsvp_token from appointment_participants where user_id=$1',[second]))[0].rsvp_token
 await db.query("select set_config('request.jwt.claims','{}',false)");await db.exec('set role anon')
 let result=(await db.query('select request_calendar_time_change_by_token($1,$2,$3) as saved',[token,start,'A new time please.'])).rows[0].saved
 expect(result.verified).toBe(true);expect(result.context.time_change.mine).toBe(true)
 const request=result.context.time_change.id
 expect((await db.query('select request_calendar_time_change_by_token($1,$2,$3) as saved',[token,start,'A new time please.'])).rows[0].saved.replayed).toBe(true)
 result=(await db.query('select request_calendar_time_change_by_token($1,null,null,$2) as saved',[token,request])).rows[0].saved
 expect(result.context.time_change).toBeNull();expect(result.context.can_request_time_change).toBe(true)
 expect((await admin('select status from appointments'))[0].status).toBe('confirmed')
})
it('denies a different guest token withdrawal and does not expose private appointment data',async()=>{
 const rows=await admin('select user_id,rsvp_token from appointment_participants')
 const buyer=rows.find(p=>p.user_id===second).rsvp_token,agent=rows.find(p=>p.user_id===actor).rsvp_token
 await db.query("select set_config('request.jwt.claims','{}',false)");await db.exec('set role anon')
 const result=(await db.query('select request_calendar_time_change_by_token($1,$2,null) as saved',[buyer,start])).rows[0].saved
 expect(result.context).not.toHaveProperty('participants');expect(result.context).not.toHaveProperty('notes')
 await expect(db.query('select request_calendar_time_change_by_token($1,null,null,$2)',[agent,result.context.time_change.id])).rejects.toThrow(/Only the requester/)
})

it('records who requested, proposed and approved without exposing invitation capabilities',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await mutate('propose',request,start)
 await user(second);const result=await mutate('accept',request)
 const events=result.state.events
 expect(events.filter(e=>e.action==='requested')).toHaveLength(1)
 expect(events.find(e=>e.action==='requested').actor_id).toBe(second)
 expect(events.find(e=>e.action==='proposed').actor_id).toBe(actor)
 expect(events.filter(e=>e.action==='accepted')).toHaveLength(2)
 expect(events.some(e=>e.action==='confirmed')).toBe(true)
 expect(JSON.stringify(events)).not.toContain('rsvp_token')
 await expect(db.query('select * from private.calendar_time_change_events')).rejects.toThrow(/permission denied/)
})
it('keeps the original booking and original RSVP when a required attendee declines the replacement',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await mutate('propose',request,start)
 await user(second);const result=await mutate('decline_proposal',request)
 expect(result.state.active).toBeNull()
 expect(result.state.events.some(e=>e.action==='declined_proposal'&&e.actor_id===second)).toBe(true)
 expect((await admin('select status,has_confirmed_reservation from appointments'))[0]).toMatchObject({status:'confirmed',has_confirmed_reservation:true})
 expect((await admin('select rsvp_status from appointment_participants where user_id=$1',[second]))[0].rsvp_status).toBe('Accepted')
 expect(Date.parse((await admin('select date_time from appointments'))[0].date_time)).toBe(Date.parse('2099-07-20T08:00:00Z'))
})
it('allows the organiser to keep the current time with a recorded decision',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();const result=await mutate('decline',request)
 expect(result.state.active).toBeNull();expect(result.state.history[0].closed_reason).toBe('declined')
 expect((await admin('select status from appointments'))[0].status).toBe('confirmed')
})
it('prevents a manager from overriding missing required approvals through the existing endpoint',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await mutate('propose',request,start)
 await expect(db.query("select mutate_calendar_proposal($1,$2,$3,'approve',$4)",[booking,(await state()).revision,id(180),request])).rejects.toThrow(/Required attendees/)
 expect((await state()).active.status).toBe('proposed')
})
it('moves an internal appointment immediately when the organiser is the only required attendee',async()=>{
 await admin('delete from appointment_participants where user_id=$1',[second])
 await user();const request=(await mutate('request',null,start)).state.active.id
 const result=await mutate('propose',request,start)
 expect(result.state.active).toBeNull()
 expect(Date.parse((await admin('select date_time from appointments'))[0].date_time)).toBe(Date.parse(start))
})
it('rejects a reused command identifier with different inputs without duplicating history',async()=>{
 await user(second);const revision=(await state()).revision,key=id(190)
 await mutate('request',null,start,revision,key)
 await expect(mutate('request',null,'2099-07-22T08:00:00Z',revision,key)).rejects.toThrow(/identifier/)
 expect((await state()).events.filter(e=>e.action==='requested')).toHaveLength(1)
})
it('cannot revive an expired unconfirmed original reservation',async()=>{
 await admin("update appointments set status='requested',has_confirmed_reservation=false,hold_expires_at=now()-interval '1 minute'")
 await user();expect((await state()).canRequest).toBe(false)
 await expect(mutate('request',null,start)).rejects.toThrow(/reservation expired/)
})
it('does not reopen a cancelled original appointment while expiring its request',async()=>{
 await user(second);await mutate('request',null,start)
 await admin("update appointments set status='cancelled',has_confirmed_reservation=false")
 await admin("update appointment_reschedule_requests set request_expires_at=now()-interval '1 second'")
 await db.query('select expire_calendar_holds()')
 expect((await admin('select status,has_confirmed_reservation from appointments'))[0]).toMatchObject({status:'cancelled',has_confirmed_reservation:false})
})
it('supports all-day requests without changing their duration',async()=>{
 await admin('truncate appointments cascade');await seed({all_day:true,date_time:'2099-07-19T22:00Z',end_date_time:'2099-07-20T22:00Z',start_time:'00:00',end_time:'23:59'})
 await user(second);const requested=await mutate('request',null,'2099-07-20T22:00Z')
 expect(Date.parse(requested.state.active.preferred_end)-Date.parse(requested.state.active.preferred_start)).toBe(86400000)
 await user();await mutate('propose',requested.state.active.id,'2099-07-20T22:00Z')
 await user(second);await mutate('accept',requested.state.active.id)
 expect((await admin('select all_day from appointments'))[0].all_day).toBe(true)
})
it('caps proposal expiry at the original start so an unattended request cannot outlive the booking',async()=>{
 const original=(await admin("select date_trunc('hour',now())+interval '1 hour' as start,date_trunc('hour',now())+interval '90 minutes' as finish"))[0]
 const day=new Date(original.start).toLocaleDateString('en-CA',{timeZone:'Africa/Johannesburg'})
 const time=value=>new Date(value).toLocaleTimeString('en-GB',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit'})
 await admin('truncate appointments cascade');await seed({date_time:original.start,end_date_time:original.finish,appointment_date:day,start_time:time(original.start),end_time:time(original.finish)})
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();const result=await mutate('propose',request,start)
 expect(Date.parse(result.state.active.hold_expires_at)).toBe(Date.parse(result.state.active.original_start))
})
it('returns current state when an earlier request command is retried after withdrawal',async()=>{
 await user(second);const revision=(await state()).revision,key=id(191)
 const first=await mutate('request',null,start,revision,key)
 await mutate('withdraw',first.state.active.id)
 const replay=await mutate('request',null,start,revision,key)
 expect(replay.replayed).toBe(true);expect(replay.state.active).toBeNull()
 expect(replay.state.history[0].closed_reason).toBe('withdrawn')
})
it('handles managed ordinary appointments with an explicitly disabled attorney-delivery flag',async()=>{
 await admin('update appointments set attorney_delivery_enabled=false')
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await mutate('propose',request,start)
 await user(second);expect((await mutate('accept',request)).state.active).toBeNull()
})
it('records an anonymous required attendee decline and restores the original booking',async()=>{
 await user(second);const request=(await mutate('request',null,start)).state.active.id
 await user();await mutate('propose',request,start)
 const participant=(await admin('select participant_id,rsvp_token from appointment_participants where user_id=$1',[second]))[0]
 await db.query("select set_config('request.jwt.claims','{}',false)");await db.exec('set role anon')
 await db.query("select * from submit_appointment_rsvp($1,'Declined')",[participant.rsvp_token])
 const events=await admin("select action,participant_id from private.calendar_time_change_events where action='declined_proposal'")
 expect(events).toEqual([{action:'declined_proposal',participant_id:participant.participant_id}])
 expect((await admin('select status,has_confirmed_reservation from appointments'))[0]).toMatchObject({status:'confirmed',has_confirmed_reservation:true})
 expect((await admin('select rsvp_status from appointment_participants where user_id=$1',[second]))[0].rsvp_status).toBe('Accepted')
})
