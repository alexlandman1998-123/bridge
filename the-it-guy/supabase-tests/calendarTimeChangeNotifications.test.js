import { PGlite } from '@electric-sql/pglite'
import { afterAll,beforeAll,beforeEach,expect,it } from 'vitest'
import { setupCalendarReservationDatabase,actor,second,org,booking,id,input,people } from './calendarReservationFixture'
let db,command
const preferred='2099-07-21T08:00:00Z'
async function role(who=actor,name='authenticated') {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(name==='anon'?{}:{sub:who,email:who===actor?'agent@example.test':'other@example.test'})]);await db.exec(`set role ${name}`)
}
async function admin(sql,args=[]) {await db.exec('reset role');return (await db.query(sql,args)).rows}
async function state() {return (await db.query('select get_calendar_time_change($1) as v',[booking])).rows[0].v}
async function change(action,request=null,start=null) {
 return (await db.query('select mutate_calendar_time_change($1,$2,$3,$4,$5,$6,null) as v',[booking,(await state()).revision,id(command++),action,request,start])).rows[0].v
}
async function jobs(stage=null) {return admin("select * from calendar_delivery_jobs where event_kind like $1 order by event_kind,channel",[stage?`time_change:${stage}:%`:'time_change:%'])}
async function seed(extra=[],changes={}) {
 await role();const saved=(await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,null,$5) as v',[org,booking,JSON.stringify(input(changes)),JSON.stringify(people([{user_id:second,name:'Buyer',email:'other@example.test',participant_role:'Buyer',is_required:true},...extra])),id(20)])).rows[0].v
 for(const p of saved.participants.filter(p=>p.user_id!==actor&&p.is_required))await db.query("select * from submit_appointment_rsvp($1,'Accepted')",[p.rsvp_token])
}
async function propose() {await role(second);const request=(await change('request',null,preferred)).state.active.id;await role();await change('propose',request,preferred);return request}
async function token() {return (await admin('select rsvp_token from appointment_participants where appointment_id=$1 and user_id=$2',[booking,second]))[0].rsvp_token}
async function tokenResponse(value,request,revision,key=id(command++),status='Accepted') {
 return (await db.query('select respond_calendar_time_change_by_token($1,$2,$3,$4,$5) as v',[value,request,revision,key,status])).rows[0].v
}
beforeAll(async()=>{db=new PGlite();await setupCalendarReservationDatabase(db)},30000)
afterAll(async()=>db?.close())
beforeEach(async()=>{command=100;await admin("update organisation_users set membership_status='active',status='active'");await admin("set time zone 'UTC'");await admin('truncate appointments,private.calendar_mutation_receipts cascade');await seed()})
it('queues one request message for the organiser and requester without notifying unrelated guests',async()=>{
 await admin('truncate appointments cascade');await seed([{name:'Optional guest',email:'optional@example.test',participant_role:'Buyer',is_required:false}])
 await role(second);await change('request',null,preferred)
 expect((await jobs('requested')).filter(j=>j.channel==='email').map(j=>j.recipient_email).sort()).toEqual(['agent@example.test','other@example.test'])
 const generic=await admin("select event_kind from calendar_delivery_jobs where status='queued' and event_kind not like 'reminder:%' and event_kind not like 'time_change:%'")
 expect(generic).toEqual([])
})
it('keeps proposed deliveries valid and deduplicated while other attendees partially approve',async()=>{
 await admin('truncate appointments cascade');await seed([{name:'Required guest',email:'required@example.test',participant_role:'Buyer',is_required:true}])
 const request=await propose();const before=(await jobs('proposed')).filter(j=>j.channel==='email')
 await role(second);await change('accept',request)
 const after=(await jobs('proposed')).filter(j=>j.channel==='email')
 expect(after.map(j=>j.id).sort()).toEqual(before.map(j=>j.id).sort())
 expect(after.every(j=>j.status==='queued')).toBe(true)
 expect((await admin('select private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where id=$1',[before.find(j=>j.recipient_email==='required@example.test').id]))[0].valid).toBe(true)
})
it('confirms through a signed token and replays the same command after that token is rotated',async()=>{
 const request=await propose();const revision=(await state()).active.proposal_revision;const value=await token();await role(actor,'anon')
 const key=id(300),saved=await tokenResponse(value,request,revision,key)
 expect(saved.outcome).toBe('confirmed');expect(Date.parse(saved.dateTime)).toBe(Date.parse(preferred))
 expect((await tokenResponse(value,request,revision,key)).replayed).toBe(true)
 await expect(tokenResponse(value,request,revision,key,'Declined')).rejects.toThrow(/identifier/)
 expect((await jobs('confirmed')).filter(j=>j.channel==='email')).toHaveLength(2)
 expect((await jobs('proposed')).every(j=>j.status==='superseded')).toBe(true)
})
it('rejects a stale proposal version and a revoked token',async()=>{
 const request=await propose(),revision=(await state()).active.proposal_revision,value=await token();await role(actor,'anon')
 await expect(tokenResponse(value,request,revision+1)).rejects.toThrow(/changed/)
 await admin('update appointment_participants set rsvp_revoked_at=now() where user_id=$1',[second]);await role(actor,'anon')
 await expect(tokenResponse(value,request,revision)).rejects.toThrow(/removed|expired/)
})
it('keeps current-time emails distinct for organiser decline, withdrawal and expiry',async()=>{
 await role(second);const request=(await change('request',null,preferred)).state.active.id
 await role();await change('decline',request)
 expect((await jobs('declined')).filter(j=>j.channel==='email')).toHaveLength(2)
 await role(second);const next=(await change('request',null,preferred)).state.active.id;await change('withdraw',next)
 expect((await jobs('withdrawn')).filter(j=>j.channel==='email')).toHaveLength(2)
 await role(second);await change('request',null,preferred)
 await admin("update appointment_reschedule_requests set request_expires_at=now()-interval '1 second' where status='pending'")
 await db.query('select expire_calendar_holds()')
 expect((await jobs('expired')).filter(j=>j.channel==='email')).toHaveLength(2)
 expect((await admin('select status,has_confirmed_reservation from appointments'))[0]).toMatchObject({status:'confirmed',has_confirmed_reservation:true})
})
it('respects disabled invitations and internal-only visibility',async()=>{
 await admin('truncate appointments cascade');await seed([],{invitations_enabled:false})
 await role(second);await change('request',null,preferred);expect(await jobs()).toEqual([])
})
it('supersedes a frozen proposal payload after a material edit or cancellation',async()=>{
 await propose();const job=(await jobs('proposed')).find(j=>j.channel==='email')
 await admin("update appointments set title='Updated title'")
 expect((await admin('select private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where id=$1',[job.id]))[0].valid).toBe(false)
 const replacement=(await jobs('proposed')).find(j=>j.channel==='email'&&j.participant_id===job.participant_id&&j.status==='queued')
 expect(replacement.id).not.toBe(job.id)
 await admin("update appointments set status='cancelled',has_confirmed_reservation=false")
 expect((await admin('select private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where id=$1',[replacement.id]))[0].valid).toBe(false)
})
it('keeps invitation context private and exposes only the current proposal version',async()=>{
 await propose();const value=await token();await role(actor,'anon')
 const context=(await db.query('select get_calendar_invitation_context($1) as v',[value])).rows[0].v
 expect(context.proposal).toBe(true);expect(Number.isInteger(context.proposal_revision)).toBe(true)
 expect(context).not.toHaveProperty('participants');expect(context).not.toHaveProperty('notes');expect(context).not.toHaveProperty('created_by')
 await expect(db.query('select * from private.calendar_invitation_commands')).rejects.toThrow(/permission denied/)
})
it('returns the current agreement when a partial acceptance is retried after other required attendees approve',async()=>{
 await admin('truncate appointments cascade');await seed([{name:'Required guest',email:'required@example.test',participant_role:'Buyer',is_required:true}])
 const request=await propose(),revision=(await state()).active.proposal_revision,value=await token();await role(actor,'anon')
 const key=id(310);expect((await tokenResponse(value,request,revision,key)).outcome).toBe('pending')
 const other=(await admin("select rsvp_token from appointment_participants where email='required@example.test'"))[0].rsvp_token
 await db.query("select respond_calendar_time_change_by_token($1,$2,$3,$4,'Accepted')",[other,request,revision,id(311)])
 await role(actor,'anon');expect((await tokenResponse(value,request,revision,key)).outcome).toBe('confirmed')
})
it('replays a withdrawn proposal as closed instead of claiming that approval is still pending',async()=>{
 await admin('truncate appointments cascade');await seed([{name:'Required guest',email:'required@example.test',participant_role:'Buyer',is_required:true}])
 const request=await propose(),revision=(await state()).active.proposal_revision,value=await token();await role(actor,'anon')
 const key=id(312);await tokenResponse(value,request,revision,key)
 await role();await change('withdraw',request)
 await role(actor,'anon');expect((await tokenResponse(value,request,revision,key)).outcome).toBe('closed')
})
it('does not send client lifecycle notices for an internal-only appointment',async()=>{
 await admin("update appointments set visibility_scope='internal_only'")
 await role();await change('request',null,preferred)
 expect((await jobs('requested')).filter(j=>j.channel==='email').map(j=>j.recipient_email)).toEqual(['agent@example.test'])
})
it('supersedes pending notices when a cancelled appointment is archived without reissuing an invitation',async()=>{
 await propose();const job=(await jobs('proposed'))[0]
 await admin("update appointments set status='cancelled',has_confirmed_reservation=false")
 await admin('update appointments set archived_at=now()')
 expect((await admin('select private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where id=$1',[job.id]))[0].valid).toBe(false)
})

it('keeps delivery identity stable across client and worker session timezones',async()=>{
 await admin("set time zone 'Pacific/Auckland'");await role(second);await change('request',null,preferred)
 const job=(await jobs('requested')).find(j=>j.channel==='email')
 await admin("set time zone 'UTC'")
 expect((await admin('select private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where id=$1',[job.id]))[0].valid).toBe(true)
})

it('revokes external time-change reads and responses when the booking becomes internal-only',async()=>{
 const request=await propose(),revision=(await state()).active.proposal_revision,value=await token()
 await admin("update appointments set visibility_scope='internal_only'")
 await role(second);await expect(state()).rejects.toThrow(/access/)
 await role(actor,'anon');expect((await db.query('select get_calendar_invitation_context($1) as v',[value])).rows[0].v).toBeNull()
 await expect(tokenResponse(value,request,revision)).rejects.toThrow(/removed|expired|access/)
 await expect(db.query("select * from submit_appointment_rsvp($1,'Accepted')",[value])).rejects.toThrow(/access|permitted|removed/)
})
it('does not reveal a later booking through a replay receipt after the participant was revoked',async()=>{
 const request=await propose(),revision=(await state()).active.proposal_revision,value=await token(),key=id(940)
 await role(actor,'anon');await tokenResponse(value,request,revision,key)
 await admin('update appointment_participants set rsvp_revoked_at=now() where appointment_id=$1 and user_id=$2',[booking,second])
 await role(actor,'anon');await expect(tokenResponse(value,request,revision,key)).rejects.toThrow(/removed|expired|access/)
})

it('removes workflow and invitation access for an internal organiser whose membership was removed',async()=>{
 await propose()
 const owner=(await admin('select rsvp_token from appointment_participants where appointment_id=$1 and user_id=$2',[booking,actor]))[0].rsvp_token
 await admin("update organisation_users set membership_status='removed',status='removed' where organisation_id=$1 and user_id=$2",[org,actor])
 await role();await expect(state()).rejects.toThrow(/access/)
 const pending=(await admin("select private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where event_kind like 'time_change:proposed:%' and recipient_id=$1",[actor]));expect(pending.length).toBeGreaterThan(0);expect(pending.every(j=>!j.valid)).toBe(true)
 await role(actor,'anon');expect((await db.query('select get_calendar_invitation_context($1) as v',[owner])).rows[0].v).toBeNull()
 // Restore the shared fixture membership for the next case.
 await admin("update organisation_users set membership_status='active',status='active' where organisation_id=$1 and user_id=$2",[org,actor])
})
