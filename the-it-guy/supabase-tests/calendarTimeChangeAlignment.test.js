import { PGlite } from '@electric-sql/pglite'
import { afterAll,beforeAll,beforeEach,expect,it } from 'vitest'
import { setupCalendarReservationDatabase,actor,second,org,booking,id,input,people } from './calendarReservationFixture'
let db,command
const original='2099-07-20T08:00:00Z', preferred='2099-07-21T08:00:00Z'
async function user(who=actor,role='authenticated') {
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:who,email:who===actor?'agent@example.test':'other@example.test'})]);await db.exec(`set role ${role}`)
}
async function admin(sql,args=[]) {await db.exec('reset role');return (await db.query(sql,args)).rows}
async function state(){return (await db.query('select get_calendar_time_change($1) as v',[booking])).rows[0].v}
async function change(action,request=null,start=null) {return (await db.query('select mutate_calendar_time_change($1,$2,$3,$4,$5,$6,null) as v',[booking,(await state()).revision,id(command++),action,request,start])).rows[0].v}
async function reminders(){return admin("select *,private.calendar_delivery_valid(j) as valid from calendar_delivery_jobs j where event_kind like 'reminder:%' order by id")}
async function propose(){await user(second);const request=(await change('request',null,preferred)).state.active.id;await user();await change('propose',request,preferred);return request}
async function copies(){return admin('select * from private.calendar_provider_events order by connection_id')}
async function connect(provider,n){await admin("insert into private.calendar_provider_connections(id,organisation_id,user_id,provider,status,credential) values($1,$2,$3,$4,'connected',$5)",[id(n),org,actor,provider,JSON.stringify({v:1,ciphertext:'fixture',iv:'fixture'})]);await admin('select private.reconcile_calendar_provider_event($1,$2)',[id(n),booking])}
beforeAll(async()=>{db=new PGlite();await setupCalendarReservationDatabase(db)},30000)
afterAll(async()=>db?.close())
beforeEach(async()=>{
 command=100;await admin('truncate appointments,private.calendar_provider_connections,private.calendar_mutation_receipts cascade');await user()
 const saved=(await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,null,$5) as v',[org,booking,JSON.stringify(input({reminders_enabled:true,reminder_rules:[{reminderType:'appointment_reminder',offsetMinutes:60}]})),JSON.stringify(people([{user_id:second,name:'Buyer',email:'other@example.test',participant_role:'Buyer',is_required:true}])),id(20)])).rows[0].v
 await db.query("select * from submit_appointment_rsvp($1,'Accepted')",[saved.participants.find(p=>p.user_id===second).rsvp_token])
})
it('keeps the same original-time reminders through requests, proposals and partial approval',async()=>{
 await admin("insert into appointment_participants(appointment_id,name,email,participant_role,is_required,rsvp_status) values($1,'Required guest','guest@example.test','Buyer',true,'Accepted')",[booking])
 const before=await reminders();expect(before.length).toBeGreaterThan(0)
 const request=await propose();await user(second);await change('accept',request)
 const after=await reminders();expect(after.map(j=>j.id)).toEqual(before.map(j=>j.id));expect(after.every(j=>j.valid)).toBe(true)
 expect(after.every(j=>Date.parse(j.scheduled_for)===Date.parse(original)-3600000)).toBe(true)
})
it.each(['withdraw','decline','decline_proposal','expire'])('preserves original reminders when the replacement closes: %s',async(action)=>{
 const before=await reminders();let request
 if(action==='decline'){await user(second);request=(await change('request',null,preferred)).state.active.id}else request=await propose()
 if(action==='expire'){await admin("update appointment_reschedule_requests set hold_expires_at=now()-interval '1 second'");await db.query('select expire_calendar_holds()')}
 else {await user(action==='decline_proposal'?second:actor);await change(action,request)}
 expect((await reminders()).map(j=>j.id)).toEqual(before.map(j=>j.id));expect((await reminders()).every(j=>j.valid)).toBe(true)
})
it('retires old reminders and creates exactly one set at the agreed replacement time',async()=>{
 const before=await reminders(),request=await propose();await user(second);await change('accept',request)
 const after=await reminders(),current=after.filter(j=>j.valid)
 expect(current).toHaveLength(before.length);expect(current.every(j=>Date.parse(j.scheduled_for)===Date.parse(preferred)-3600000)).toBe(true)
 expect(after.filter(j=>before.some(b=>b.id===j.id)).every(j=>j.status==='superseded'&&!j.valid)).toBe(true)
 await admin('select private.reconcile_calendar_delivery($1)',[booking]);expect((await reminders()).filter(j=>j.valid).map(j=>j.id)).toEqual(current.map(j=>j.id))
})
it('retains a delivered receipt instead of reissuing the original reminder after voting',async()=>{
 const before=await reminders();await admin("update calendar_delivery_jobs set status='delivered',delivered_at=now() where id=$1",[before[0].id])
 await propose();const after=await reminders();expect(after.map(j=>j.id)).toEqual(before.map(j=>j.id));expect(after.find(j=>j.id===before[0].id).status).toBe('delivered')
})
it('keeps a frozen reminder claim valid across voting but fences it after final confirmation',async()=>{
 const reminder=(await reminders())[0];await admin("update calendar_delivery_jobs set status='processing',attempt_count=1,claimed_at=now() where id=$1",[reminder.id])
 const request=await propose();await user(actor,'service_role')
 expect((await db.query('select prepare_calendar_delivery($1,1,$2) as v',[reminder.id,JSON.stringify({to:reminder.recipient_email,appointmentId:booking,idempotencyKey:`calendar-appointment:${reminder.id}`})])).rows[0].v).toBeTruthy()
 await user(second);await change('accept',request);await user(actor,'service_role')
 expect((await db.query('select prepare_calendar_delivery($1,1,$2) as v',[reminder.id,JSON.stringify({to:reminder.recipient_email,appointmentId:booking,idempotencyKey:`calendar-appointment:${reminder.id}`})])).rows[0].v).toBeNull()
})
it('supersedes material reminder content changes and respects disabled reminders and privacy',async()=>{
 const before=await reminders();await admin("update appointments set location='New address',calendar_revision=calendar_revision+1")
 expect((await reminders()).filter(j=>j.valid)).toHaveLength(before.length)
 expect((await reminders()).filter(j=>before.some(b=>b.id===j.id)).every(j=>!j.valid)).toBe(true)
 await admin("update appointments set visibility_scope='internal_only',calendar_revision=calendar_revision+1")
 expect((await reminders()).filter(j=>j.valid).every(j=>j.recipient_id===actor)).toBe(true)
 await admin('update appointments set reminders_enabled=false');expect((await reminders()).filter(j=>j.valid)).toEqual([])
})
it.each(['google','outlook'])('keeps the %s copy unchanged until approval then updates the same copy once',async provider=>{
 await connect(provider,60);const before=(await copies())[0],request=await propose();await user();await change('accept',request)
 let current=(await copies())[0];expect(current.copy_key).toBe(before.copy_key);expect(current.version).toBe(before.version);expect(current.desired_hash).toBe(before.desired_hash)
 expect(Date.parse(current.desired_payload.start)).toBe(Date.parse(original));expect(current.desired_payload.status).toBe('confirmed')
 await user(second);await change('accept',request);current=(await copies())[0]
 expect(current.copy_key).toBe(before.copy_key);expect(current.version).toBe(before.version+1);expect(Date.parse(current.desired_payload.start)).toBe(Date.parse(preferred))
 await admin('select private.reconcile_calendar_provider_event($1,$2)',[id(60),booking]);expect((await copies())[0].version).toBe(current.version)
})
it('records request decisions in the existing scoped support history without invitation capabilities',async()=>{
 const request=await propose();await user(second);await change('accept',request);await user()
 const support=(await db.query('select read_calendar_appointment_support($1,$2) as v',[org,booking])).rows[0].v
 const events=support.history.filter(e=>e.source==='time_change');expect(events.some(e=>e.status==='requested')).toBe(true);expect(events.some(e=>e.status==='proposed')).toBe(true);expect(events.some(e=>e.status==='confirmed')).toBe(true)
 expect(JSON.stringify(events)).not.toContain('rsvp_token');expect(events.find(e=>e.status==='requested').actor_id).toBe(second)
})
it('creates a clear in-app review notification once using the existing worker receipt',async()=>{
 await propose();const job=(await admin("select * from calendar_delivery_jobs where event_kind like 'time_change:proposed:%' and channel='in_app' and recipient_id=$1",[second]))[0]
 await admin("update calendar_delivery_jobs set status='processing',attempt_count=1,claimed_at=now() where id=$1",[job.id]);await user(actor,'service_role')
 await db.query('select prepare_calendar_delivery($1,1)',[job.id]);await db.query('select prepare_calendar_delivery($1,1)',[job.id])
 const notes=await admin('select * from appointment_notification_events where id=$1',[job.id]);expect(notes).toHaveLength(1);expect(notes[0].title).toBe('Review proposed time');expect(notes[0].metadata.actionUrl).toBe(`/pipeline/calendar?appointmentId=${booking}`)
})
it('does not report missing reminders solely because a vote advanced the booking revision',async()=>{
 await propose();const findings=await admin('select * from private.calendar_health_findings($1)',[org]);expect(findings.some(f=>f.kind==='missing_reminder')).toBe(false)
})

it('keeps a failed lifecycle message eligible for reviewed retry after another guest votes',async()=>{
 await admin("insert into appointment_participants(appointment_id,name,email,participant_role,is_required,rsvp_status) values($1,'Required guest','guest@example.test','Buyer',true,'Accepted')",[booking])
 const request=await propose();const job=(await admin("select * from calendar_delivery_jobs where event_kind like 'time_change:proposed:%' and channel='email' and recipient_email='guest@example.test'"))[0]
 await admin("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where id=$1",[job.id])
 await user(second);await change('accept',request);await user()
 const snapshot=(await db.query('select read_calendar_appointment_support($1,$2) as v',[org,booking])).rows[0].v
 expect(snapshot.revision).toBeGreaterThan(job.revision);expect(snapshot.jobs.find(j=>j.id===job.id).retry_allowed).toBe(true)
 const recovered=(await db.query("select calendar_support_action($1,$2,$3,'retry',$4,$5,'Reviewed provider failure') as v",[org,booking,snapshot.revision,job.id,id(900)])).rows[0].v
 expect(recovered.queued).toBe(1)
})
it('fences a provider claim for the old time when the final approval commits',async()=>{
 await connect('google',60);await user(actor,'service_role')
 const c=(await db.query('select claim_calendar_provider_connections(1) as v')).rows[0].v[0]
 const e=(await db.query('select prepare_calendar_provider_event($1,$2) as v',[c.id,c.lease])).rows[0].v
 const request=await propose();await user(actor,'service_role')
 expect((await db.query('select validate_calendar_provider_event($1,$2,$3,$4,$5) as v',[c.id,c.lease,booking,e.job_lease,e.version])).rows[0].v).toBe(true)
 await user(second);await change('accept',request);await user(actor,'service_role')
 expect((await db.query('select validate_calendar_provider_event($1,$2,$3,$4,$5) as v',[c.id,c.lease,booking,e.job_lease,e.version])).rows[0].v).toBe(false)
})

it('adopts a synced legacy hash without changing its copy, version or provider receipt',async()=>{
 await connect('google',60)
 await admin("update private.calendar_provider_events set external_id='existing-provider-event',status='synced',desired_hash=md5(desired_payload::text),synced_hash=md5(desired_payload::text),remote_hash='observed-provider-hash'")
 const before=(await copies())[0]
 const {readFile}=await import('node:fs/promises')
 const migration=await readFile(new URL('../../supabase/migrations/20261019174614_calendar_time_change_alignment.sql',import.meta.url),'utf8')
 await admin(migration.slice(migration.indexOf('-- Adopt the material hash'),migration.indexOf('create or replace function private.calendar_expected_jobs')))
 const current=(await copies())[0];expect(current.desired_hash).not.toBe(before.desired_hash);expect(current.synced_hash).toBe(current.desired_hash)
 expect(current).toMatchObject({external_id:before.external_id,copy_key:before.copy_key,version:before.version,remote_hash:before.remote_hash,status:'synced'})
 await user(second);await change('request',null,preferred)
 expect((await copies())[0]).toMatchObject({desired_hash:current.desired_hash,version:current.version,status:'synced'})
})

it('also retains a tentative original copy while its replacement awaits agreement',async()=>{
 await admin("update appointments set status='requested',has_confirmed_reservation=false,hold_expires_at=now()+interval '24 hours'")
 await connect('outlook',60);const before=(await copies())[0]
 await propose();const after=(await copies())[0]
 expect(after.desired_hash).toBe(before.desired_hash);expect(after.version).toBe(before.version);expect(after.desired_payload.status).toBe('requested')
})
