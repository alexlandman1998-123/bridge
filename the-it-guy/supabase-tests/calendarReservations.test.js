import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { id, org, otherOrg, actor, second, outsider, booking, room, task, transaction, input, people, setupCalendarReservationDatabase } from './calendarReservationFixture.js'
let db
async function save({ key=booking, data=input(), attendees=people([]), revision=null, command=id(20), action='save' }={}) {
  return (await db.query('select public.save_calendar_appointment($1,$2,$3,$4,$5,$6,$7) as saved',
    [org,key,JSON.stringify(data),attendees===null?null:JSON.stringify(attendees),revision,command,action])).rows[0].saved
}
async function proposal(saved, action, changes={}) {
  return (await db.query('select public.mutate_calendar_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as saved',
    [booking,saved.appointment.calendar_revision,changes.command||id(21),action,changes.request||null,changes.start||null,changes.end||null,'Client requested change',changes.timezone||null,changes.allDay??null])).rows[0].saved
}
async function respond(token,status='Accepted',start=null,end=null) {
  return (await db.query('select * from public.submit_appointment_rsvp($1,$2,$3,$4,$5)',[token,status,start,null,end])).rows[0]
}
async function user(userId=actor) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:userId,email:userId===actor?'agent@example.test':'other@example.test'})]); await db.exec('set role authenticated') }
async function row() { return (await db.query('select * from public.appointments where appointment_id=$1',[booking])).rows[0] }
beforeAll(async () => {
  db=new PGlite()
  await setupCalendarReservationDatabase(db)
},30000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('reset role; truncate appointments,appointment_participants,appointment_reminders,appointment_reschedule_requests,transaction_checklist_items,private.calendar_mutation_receipts cascade'); await user() })

describe('Atomic ordinary calendar commands', () => {
  it('issues a server-timed 24-hour hold and returns an authoritative appointment and attendees', async () => {
    const saved=await save()
    expect(saved.verified).toBe(true)
    expect(saved.appointment.reservation_managed).toBe(true)
    expect(Date.parse(saved.appointment.hold_expires_at)-Date.parse(saved.appointment.request_issued_at)).toBe(86400000)
    expect(saved.participants).toHaveLength(1)
    expect(saved.participants[0].rsvp_status).toBe('Accepted')
  })
  it('rolls the entire booking back when attendee persistence fails', async () => {
    await expect(save({attendees:people([{name:'Invalid',participant_role:'Nonexistent'}])})).rejects.toThrow(/role_check/)
    expect(await row()).toBeUndefined()
  })
  it('rejects a stale edit and preserves the previously verified record', async () => {
    const saved=await save()
    await save({ data:input({notes:'First edit'}),attendees:null,revision:saved.appointment.calendar_revision,command:id(22) })
    await expect(save({data:input({notes:'Stale edit'}),attendees:null,revision:0,command:id(23)})).rejects.toThrow(/changed/)
    expect((await row()).notes).toBe('First edit')
  })
  it('replays the same command without another booking and rejects identifier reuse', async () => {
    const saved=await save(); const again=await save()
    expect(again.replayed).toBe(true)
    expect(again.participants[0].participant_id).toBe(saved.participants[0].participant_id)
    await expect(save({data:input({title:'Changed'})})).rejects.toThrow(/identifier/)
  })
  it('retains attendee identity, response and token across ordinary contact edits', async () => {
    const saved=await save(); const p=saved.participants[0]
    const updated=await save({attendees:[{...p,name:'Agent updated'}],revision:0,command:id(22)})
    expect(updated.participants[0]).toMatchObject({participant_id:p.participant_id,rsvp_status:'Accepted',rsvp_token:p.rsvp_token,name:'Agent updated'})
  })
  it('rejects a second pending booking for the same agent in the same time', async () => {
    await save()
    await expect(save({key:id(30),command:id(31)})).rejects.toThrow(/already reserved/)
    expect((await db.query('select count(*) from appointments')).rows[0].count).toBe(1)
  })
  it('allows another request after expiry without changing the old request outcome', async () => {
    await save()
    await db.exec('reset role'); await db.query("update appointments set hold_expires_at=now()-interval '1 second' where appointment_id=$1",[booking]); await user()
    await save({key:id(30),command:id(31)})
    expect((await row()).status).toBe('requested')
  })
  it('enforces organisation scope and denies a read-only co-agent mutation', async () => {
    await save({attendees:people([{user_id:second,name:'Co-agent',email:'other@example.test',participant_role:'Co-agent'}])})
    await user(second)
    await expect(save({attendees:null,revision:0,command:id(22)})).rejects.toThrow(/Not authorised/)
    await user(outsider)
    await expect(save({key:id(40),command:id(41)})).rejects.toThrow(/membership/)
  })
  it('rejects anonymous save execution and fabricated browser hold extensions', async () => {
    await save()
    await expect(db.query("update appointments set hold_expires_at=now()+interval '7 days' where appointment_id=$1",[booking])).rejects.toThrow(/verified appointment/)
    await db.exec('set role anon')
    await expect(save()).rejects.toThrow(/permission denied/)
  })
})


describe('Attendee response and removal boundaries', () => {
  const client = {name:'Client',email:'client@example.test',participant_role:'Buyer',is_required:true}
  const extra = {name:'Observer',email:'optional@example.test',participant_role:'Other Contact',is_required:false}
  it('caps a short-notice hold at the appointment start', async () => {
    const soon = new Date(Date.now()+60*60*1000)
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'UTC'}).format(soon)
    const start = soon.toISOString().slice(11,16)
    const instant = `${date}T${start}:00Z`
    const end = new Date(Date.parse(instant)+15*60000).toISOString()
    const saved = await save({data:input({timezone:'UTC',appointment_date:date,start_time:start,end_time:end.slice(11,16),date_time:instant,end_date_time:end})})
    expect(Date.parse(saved.appointment.hold_expires_at)).toBe(Date.parse(instant))
  })
  it('waits for every required attendee, with no hold extension for a partial response', async () => {
    const saved=await save({attendees:people([client,{...client,email:'second-client@example.test'}])})
    await respond(saved.participants.find(p=>p.email===client.email).rsvp_token)
    expect((await row()).status).toBe('accepted')
    expect((await row()).hold_expires_at).toEqual(new Date(saved.appointment.hold_expires_at))
    const response=await respond(saved.participants.find(p=>p.email==='second-client@example.test').rsvp_token)
    expect(response.rsvp_status).toBe('Accepted')
    expect((await row()).status).toBe('confirmed')
  })
  it('does not turn an individual decline into whole-booking cancellation', async () => {
    const saved=await save({attendees:people([client])})
    await respond(saved.participants.find(p=>p.email===client.email).rsvp_token,'Declined')
    expect((await row()).status).toBe('requested')
    await expect(save({data:input({status:'confirmed'}),attendees:null,revision:1,command:id(22)})).rejects.toThrow(/Required attendees/)
  })
  it('allows confirmation without optional responses and keeps an optional decline from changing it', async () => {
    const saved=await save({attendees:people([client,extra])})
    await respond(saved.participants.find(p=>p.email===client.email).rsvp_token)
    await respond(saved.participants.find(p=>p.email===extra.email).rsvp_token,'Declined')
    expect((await row()).status).toBe('confirmed')
  })
  it('rejects late acceptance and only an explicit reissue creates a new hold and token', async () => {
    const saved=await save({attendees:people([client])});const person=saved.participants.find(p=>p.email===client.email)
    await db.exec('reset role');await db.query("update appointments set hold_expires_at=now()-interval '1 minute' where appointment_id=$1",[booking]);await user()
    await expect(respond(person.rsvp_token)).rejects.toThrow(/hold expired/)
    const edited=await save({data:input({notes:'Follow up'}),attendees:null,revision:0,command:id(22)})
    expect(Date.parse(edited.appointment.hold_expires_at)).toBeLessThan(Date.now())
    const renewed=await save({data:input(),attendees:null,revision:1,command:id(23),action:'reissue'})
    expect(renewed.participants.find(p=>p.email===client.email).participant_id).toBe(person.participant_id)
    expect(renewed.participants.find(p=>p.email===client.email).rsvp_token).not.toBe(person.rsvp_token)
    expect(Date.parse(renewed.appointment.hold_expires_at)).toBeGreaterThan(Date.now())
    expect(await respond(person.rsvp_token)).toBeUndefined()
  })
  it('revokes removed attendees and preserves remaining identities and responses', async () => {
    const saved=await save({attendees:people([{user_id:second,name:'Co-agent',email:'other@example.test',participant_role:'Co-agent',is_required:true}])})
    const removed=saved.participants.find(p=>p.user_id===second)
    await user(second)
    expect((await db.query('select * from bridge_list_calendar_appointments($1)',[org])).rows).toHaveLength(1)
    await user()
    const updated=await save({attendees:saved.participants.filter(p=>p.user_id!==second),revision:0,command:id(22)})
    expect(updated.participants).toHaveLength(1)
    expect(updated.participants[0].rsvp_token).toBe(saved.participants.find(p=>p.user_id===actor).rsvp_token)
    expect(await respond(removed.rsvp_token)).toBeUndefined()
    await user(second)
    expect((await db.query('select * from bridge_list_calendar_appointments($1)',[org])).rows).toHaveLength(0)
  })
  it('forbids a manager from fabricating another attendee response', async () => {
    const saved=await save({attendees:people([client])})
    const p=saved.participants.find(p=>p.email===client.email)
    await expect(db.query("select respond_calendar_appointment($1,$2,0,$3,'Accepted')",[booking,p.participant_id,id(24)])).rejects.toThrow(/own current invitation/)
    await expect(db.query("update appointment_participants set rsvp_status='Accepted' where participant_id=$1",[p.participant_id])).rejects.toThrow(/verified attendee/)
  })
  it('keeps receipts private even from authorised managers', async () => {
    await save()
    await expect(db.query('select * from private.calendar_mutation_receipts')).rejects.toThrow(/permission denied/)
  })
})

describe('Confirmed replacement reservations and atomic outcomes', () => {
  const client={name:'Buyer',email:'client@example.test',participant_role:'Buyer',is_required:true}
  async function confirmed() {
    const saved=await save({attendees:people([client])})
    await respond(saved.participants.find(p=>p.email===client.email).rsvp_token)
    saved.appointment=await row()
    return saved
  }
  it('holds both times and moves only after required replacement approvals', async () => {
    const original=await confirmed()
    const proposed=await proposal(original,'propose',{start:'2099-07-20T10:00:00Z',end:'2099-07-20T11:00:00Z'})
    expect(new Date(proposed.appointment.date_time).toISOString()).toBe('2099-07-20T08:00:00.000Z')
    expect(proposed.appointment.has_confirmed_reservation).toBe(true)
    await expect(save({key:id(30),command:id(31)})).rejects.toThrow(/already reserved/)
    await expect(save({key:id(30),command:id(31),data:input({start_time:'12:00',end_time:'13:00',date_time:'2099-07-20T10:00:00Z',end_date_time:'2099-07-20T11:00:00Z'})})).rejects.toThrow(/already reserved/)
    await expect(proposal(proposed,'approve',{request:proposed.request.id,command:id(25)})).rejects.toThrow(/Required attendees/)
    const p=proposed.participants.find(p=>p.email===client.email)
    const context=(await db.query('select get_calendar_invitation_context($1) as context',[p.rsvp_token])).rows[0].context
    expect(context).toMatchObject({proposal:true,rsvp_status:'Pending'})
    await respond(p.rsvp_token)
    expect(new Date((await row()).date_time).toISOString()).toBe('2099-07-20T10:00:00.000Z')
    expect((await row()).status).toBe('confirmed')
    const retry=await proposal(original,'propose',{start:'2099-07-20T10:00:00Z',end:'2099-07-20T11:00:00Z'})
    expect(retry.replayed).toBe(true)
    expect(retry.request.status).toBe('accepted')
    expect(retry.appointment.status).toBe('confirmed')
    await save({key:id(30),command:id(31)})
  })
  it('preserves a replacement timezone through approval without changing the original early', async () => {
    const original=await confirmed()
    const proposed=await proposal(original,'propose',{start:'2099-07-21T14:00:00Z',end:'2099-07-21T15:00:00Z',timezone:'America/New_York'})
    expect(proposed.appointment.timezone).toBe('Africa/Johannesburg')
    const person=proposed.participants.find(p=>p.email===client.email)
    const context=(await db.query('select get_calendar_invitation_context($1) as context',[person.rsvp_token])).rows[0].context
    expect(context).toMatchObject({timezone:'America/New_York',start_time:'10:00:00',all_day:false})
    await respond(person.rsvp_token)
    expect(await row()).toMatchObject({timezone:'America/New_York',start_time:'10:00:00',end_time:'11:00:00'})
  })
  it('switches a confirmed appointment to an approved all-day replacement with an exclusive end', async () => {
    const original=await confirmed()
    const proposed=await proposal(original,'propose',{start:'2099-07-20T22:00:00Z',end:'2099-07-21T22:00:00Z',allDay:true})
    expect(proposed.appointment.all_day).toBe(false)
    await respond(proposed.participants.find(p=>p.email===client.email).rsvp_token)
    expect(await row()).toMatchObject({all_day:true,start_time:'00:00:00',end_time:'23:59:00'})
    expect(new Date((await row()).end_date_time).toISOString()).toBe('2099-07-21T22:00:00.000Z')
  })
  it('expires or rejects only the replacement, preserving the confirmed original', async () => {
    const original=await confirmed()
    const proposed=await proposal(original,'propose',{start:'2099-07-20T10:00:00Z',end:'2099-07-20T11:00:00Z'})
    await db.exec('reset role');await db.query("update appointment_reschedule_requests set hold_expires_at=now()-interval '1 minute' where id=$1",[proposed.request.id]);
    await db.query('select expire_calendar_holds()');await user()
    expect((await row()).status).toBe('confirmed')
    expect(new Date((await row()).date_time).toISOString()).toBe('2099-07-20T08:00:00.000Z')
    expect(await respond(proposed.participants.find(p=>p.email===client.email).rsvp_token)).toBeUndefined()
  })
  it('rolls completion back if its linked task cannot be completed', async () => {
    await db.exec('reset role');await db.query("insert into transaction_checklist_items values($1,$2,'pending',now())",[task,transaction]);await user()
    const data=input({appointment_date:'2020-07-20',date_time:'2020-07-20T08:00:00Z',end_date_time:'2020-07-20T09:00:00Z',status:'draft',linked_task_id:task,transaction_id:transaction})
    const saved=await save({data})
    await db.exec(`reset role; create function public.fail_calendar_task() returns trigger language plpgsql as $$begin raise exception 'task unavailable'; end$$; create trigger fail_calendar_task before update on transaction_checklist_items for each row execute function fail_calendar_task()`);await user()
    await expect(save({data:{status:'completed'},attendees:null,revision:saved.appointment.calendar_revision,command:id(22)})).rejects.toThrow(/task unavailable/)
    expect((await row()).status).toBe('draft')
    await db.exec('reset role; drop trigger fail_calendar_task on transaction_checklist_items; drop function fail_calendar_task()');await user()
    const done=await save({data:{status:'completed'},attendees:null,revision:0,command:id(23)})
    expect(done.appointment.status).toBe('completed')
    await db.exec('reset role');expect((await db.query('select status from transaction_checklist_items where id=$1',[task])).rows[0].status).toBe('completed')
  })
})


describe('Required identities, resources and response capabilities', () => {
  const client={name:'Buyer',email:'client@example.test',participant_role:'Buyer',is_required:true}
  it('does not expose another attendee response token to a co-agent', async () => {
    const saved=await save({attendees:people([client,{user_id:second,name:'Co-agent',email:'other@example.test',participant_role:'Co-agent',is_required:true}])})
    await user(second)
    const available=(await db.query('select * from appointment_participants')).rows
    expect(available).toHaveLength(1)
    expect(available[0].user_id).toBe(second)
    const personal=saved.participants.find(p=>p.user_id===second)
    const result=(await db.query("select respond_calendar_appointment($1,$2,0,$3,'Accepted') as response",[booking,personal.participant_id,id(24)])).rows[0].response
    expect(result).toMatchObject({verified:true,participantId:personal.participant_id})
  })
  it('denies a raw self-response even when an attendee cannot select the parent appointment', async () => {
    const saved=await save({attendees:people([{user_id:second,name:'Co-agent',email:'other@example.test',participant_role:'Co-agent',is_required:true}])})
    const personal=saved.participants.find(p=>p.user_id===second)
    await db.exec('reset role; create policy test_self_write on appointment_participants for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())')
    await user(second)
    expect((await db.query('select * from appointments where appointment_id=$1',[booking])).rows).toHaveLength(0)
    await expect(db.query("update appointment_participants set rsvp_status='Accepted' where participant_id=$1",[personal.participant_id])).rejects.toThrow(/verified attendee/)
    await db.exec('reset role; drop policy test_self_write on appointment_participants')
  })
  it('protects shared required clients even when the other booking belongs to another organisation', async () => {
    await save({attendees:people([client])})
    await db.exec('reset role')
    await db.query("update appointments set organisation_id=$1,agent_id=$2,created_by=$2 where appointment_id=$3",[otherOrg,outsider,booking])
    await db.query('update appointment_participants set organisation_id=$1 where appointment_id=$2',[otherOrg,booking])
    await user()
    await expect(save({key:id(30),command:id(31),attendees:people([client])})).rejects.toThrow(/already reserved/)
    expect((await db.query('select * from bridge_list_calendar_appointments($1)',[org])).rows).toHaveLength(0)
  })
  it('matches an assigned user to a hidden required attendee stored only by email', async () => {
    await db.exec('reset role')
    await db.query(`insert into appointments(appointment_id,organisation_id,created_by,agent_id,appointment_date,start_time,end_time,date_time,end_date_time,timezone,status)
      values($1,$2,$3,$3,'2099-07-20','10:00','11:00','2099-07-20T08:00Z','2099-07-20T09:00Z','Africa/Johannesburg','Confirmed')`,[id(30),otherOrg,outsider])
    await db.query(`insert into appointment_participants(appointment_id,organisation_id,name,email,participant_role,is_required,rsvp_status)
      values($1,$2,'Agent as buyer','AGENT@example.test','Buyer',true,'Accepted')`,[id(30),otherOrg])
    await user()
    expect((await db.query('select * from bridge_list_calendar_appointments($1)',[org])).rows).toHaveLength(0)
    await expect(save({attendees:[]})).rejects.toThrow(/already reserved/)
  })
  it('allows back-to-back bookings and optional attendee conflicts', async () => {
    await save({attendees:people([{...client,is_required:false}])})
    await save({key:id(30),command:id(31),data:input({agent_id:second}),attendees:[{...client,is_required:false}]})
    await save({key:id(32),command:id(33),data:input({start_time:'11:00',end_time:'12:00',date_time:'2099-07-20T09:00:00Z',end_date_time:'2099-07-20T10:00:00Z'})})
    expect((await db.query('select count(*) from appointments')).rows[0].count).toBe(3)
  })
  it('protects a room even for different agents and rejects a room from another organisation', async () => {
    await save({data:input({resource_id:room})})
    await expect(save({key:id(30),command:id(31),data:input({agent_id:second,resource_id:room}),attendees:[]})).rejects.toThrow(/already reserved/)
    await db.exec('reset role');await db.query('insert into appointment_resources values($1,$2,true)',[id(42),otherOrg]);await user()
    await expect(save({key:id(30),command:id(31),data:input({resource_id:id(42)})})).rejects.toThrow(/boardroom/)
  })
  it('removes obsolete reminders and cannot recreate them for removed or expired invitations', async () => {
    const saved=await save({attendees:people([client])})
    await db.exec('reset role');await db.query("insert into appointment_reminders(appointment_id,status,recipient_email) values($1,'pending',$2)",[booking,client.email]);await user()
    await save({attendees:saved.participants.filter(p=>p.email!==client.email),revision:0,command:id(22)})
    await db.exec('reset role');expect((await db.query('select status from appointment_reminders')).rows[0].status).toBe('cancelled')
    await db.query("insert into appointment_reminders(appointment_id,status,recipient_email) values($1,'pending',$2)",[booking,client.email])
    expect((await db.query('select status from appointment_reminders')).rows.every(r=>r.status==='cancelled')).toBe(true)
  })
  it('handles an inconsistent hidden historical booking conservatively', async () => {
    await save()
    await db.exec('reset role');await db.exec('alter table appointments disable trigger calendar_final_appointment_slot; alter table appointments disable trigger appointment_end_instant_guard');await db.query("update appointments set timezone='Unknown/Zone' where appointment_id=$1",[booking]);await db.exec('alter table appointments enable trigger calendar_final_appointment_slot; alter table appointments enable trigger appointment_end_instant_guard');await user()
    await expect(save({key:id(30),command:id(31)})).rejects.toThrow(/already reserved/)
    await save({key:id(30),command:id(31),data:input({agent_id:second}),attendees:[]})
  })
})


describe('Material edits, legacy revisions and response history', () => {
  const client={name:'Buyer',email:'client@example.test',participant_role:'Buyer',is_required:true}
  it('retains the previous response privately while asking for fresh approval after an identity change', async () => {
    const saved=await save({attendees:people([client])})
    const person=saved.participants.find(p=>p.email===client.email)
    await respond(person.rsvp_token)
    const current=await row()
    const changed=await save({data:input({status:'confirmed'}),attendees:saved.participants.map(p=>p.participant_id===person.participant_id?{...p,email:'replacement@example.test'}:p),revision:current.calendar_revision,command:id(22)})
    const replacement=changed.participants.find(p=>p.participant_id===person.participant_id)
    expect(replacement.rsvp_status).toBe('Pending')
    expect(replacement.rsvp_token).not.toBe(person.rsvp_token)
    expect(changed.appointment.has_confirmed_reservation).toBe(true)
    await db.exec('reset role')
    const history=(await db.query('select response from private.calendar_response_history where participant_id=$1',[person.participant_id])).rows
    expect(history.some(r=>r.response.status==='Accepted' && r.response.email===client.email)).toBe(true)
    expect(history.every(r=>r.response.rsvp_token===undefined)).toBe(true)
  })
  it('notices updates through an older privileged writer before accepting a new command', async () => {
    await save()
    await db.exec('reset role');await db.query("update appointments set notes='Written elsewhere' where appointment_id=$1",[booking]);await user()
    await expect(save({data:input({notes:'Old form'}),attendees:null,revision:0,command:id(22)})).rejects.toThrow(/changed/)
    expect((await row()).notes).toBe('Written elsewhere')
  })
  it('blocks browser inserts disguised as specialist bookings', async () => {
    await expect(db.query("insert into appointments(appointment_id,organisation_id,created_by,agent_id,status,appointment_date,start_time,end_time,date_time,end_date_time,timezone,attorney_delivery_enabled) values($1,$2,$3,$3,'requested','2099-07-20','10:00','11:00','2099-07-20T08:00Z','2099-07-20T09:00Z','Africa/Johannesburg',false)",[booking,org,actor])).rejects.toThrow(/verified appointment/)
  })
  it('keeps cancellation available after historical overlap and revokes all current links', async () => {
    const saved=await save({attendees:people([client])})
    await db.exec('reset role; alter table appointments disable trigger calendar_final_appointment_slot')
    await db.query("insert into appointments(appointment_id,organisation_id,agent_id,created_by,status,appointment_date,start_time,end_time,date_time,end_date_time,timezone) values($1,$2,$3,$3,'confirmed','2099-07-20','10:00','11:00','2099-07-20T08:00Z','2099-07-20T09:00Z','Africa/Johannesburg')",[id(30),org,actor])
    await db.exec('alter table appointments enable trigger calendar_final_appointment_slot');await user()
    const cancelled=await save({data:{status:'cancelled',cancellation_reason:'Client withdrew'},attendees:null,revision:saved.appointment.calendar_revision,command:id(22)})
    expect(cancelled.appointment.status).toBe('cancelled')
    expect(cancelled.participants.every(p=>p.rsvp_token===null && p.rsvp_revoked_at)).toBe(true)
    await expect(db.query('delete from appointments where appointment_id=$1',[booking])).rejects.toThrow(/verified appointment/)
  })
})


it('edits a consistent historical confirmed booking without inventing a replacement time', async () => {
  await db.exec('reset role')
  await db.query("insert into appointments(appointment_id,organisation_id,agent_id,created_by,status,appointment_date,start_time,end_time,date_time,timezone) values($1,$2,$3,$3,'confirmed','2099-07-20','10:00','11:00','2099-07-20T08:00Z','Africa/Johannesburg')",[booking,org,actor])
  await user()
  const updated=await save({data:{notes:'Reviewed',end_date_time:'2099-07-20T09:00Z'},attendees:null,revision:0,command:id(22)})
  expect(updated.appointment.status).toBe('confirmed')
  expect(updated.appointment.notes).toBe('Reviewed')
  await expect(save({data:{status:'draft'},attendees:null,revision:updated.appointment.calendar_revision,command:id(23)})).rejects.toThrow(/confirmed booking/)
  await db.exec('reset role')
  await expect(db.query("update appointments set date_time='2099-07-21T08:00Z',end_date_time='2099-07-21T09:00Z',appointment_date='2099-07-21' where appointment_id=$1",[booking])).rejects.toThrow(/approve the replacement/)
})


it('applies a sole required organiser approval without leaving an unnecessary pending proposal', async () => {
  const saved=await save({data:input({status:'confirmed'})})
  const changed=await proposal(saved,'propose',{start:'2099-07-20T10:00Z',end:'2099-07-20T11:00Z'})
  expect(changed.request.status).toBe('accepted')
  expect(changed.appointment.status).toBe('confirmed')
  expect(Date.parse(changed.appointment.date_time)).toBe(Date.parse('2099-07-20T10:00Z'))
})
