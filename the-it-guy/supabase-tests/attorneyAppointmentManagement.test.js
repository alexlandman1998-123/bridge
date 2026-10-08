import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = id(1), staff = id(2), otherStaff = id(3), outsider = id(4), firm = id(5), org = id(6), otherOrg = id(7), matter = id(8), appointment = id(9), busyAppointment = id(10), room = id(11), otherRoom = id(12), request = id(13), firmOrg = id(14), firmRoom = id(15)
const baseline = '2099-07-20T08:00:00Z'

beforeAll(async () => {
  await db.exec(`
    create role authenticated; create role anon; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'email','')$$;
    create function bridge_is_active_member(uuid) returns boolean language sql as $$select false$$;
    create function auth.role() returns text language sql stable as $$select current_setting('role')$$;
    create table profiles(id uuid primary key, full_name text, first_name text, last_name text, email text);
    create table organisations(id uuid primary key);
    create table transactions(id uuid primary key, organisation_id uuid);
    create table contacts(contact_id uuid primary key,organisation_id uuid);
    create table leads(lead_id uuid primary key,organisation_id uuid,assigned_agent_id uuid);
    create table organisation_users(organisation_id uuid,user_id uuid,membership_status text,status text);
    create table transaction_checklist_items(id uuid primary key,transaction_id uuid,status text,updated_at timestamptz);
    create table attorney_firm_members(firm_id uuid, user_id uuid, role text, status text);
    create table attorney_firms(id uuid primary key, organisation_id uuid);
    create table transaction_attorney_assignments(transaction_id uuid, attorney_firm_id uuid, firm_id uuid, assignment_status text, status text, can_manage_signing boolean);
    create function bridge_is_org_admin(o uuid) returns boolean language sql as $$select false$$;
    create function bridge_membership_role(o uuid) returns text language sql as $$select ''::text$$;
    create function bridge_attorney_can_manage_transaction(t uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.transaction_attorney_assignments ta join public.attorney_firm_members m on m.firm_id=ta.attorney_firm_id
        where ta.transaction_id=t and m.user_id=auth.uid() and m.status='active' and m.role <> 'admin_staff')$$;
    create function bridge_can_write_appointment_payload(t uuid,o uuid,c uuid,a uuid) returns boolean language sql stable security definer as $$
      select auth.uid() is not null and (c=auth.uid() or public.bridge_attorney_can_manage_transaction(t))$$;
  `)
  // Actual appointment/participant definitions, including the canonical role
  // constraint. Fixtures supply only the unrelated foreign-key targets/helpers.
  const base = await readFile(new URL('../../supabase/migrations/202605130001_appointment_module_v1.sql', import.meta.url), 'utf8')
  await db.exec(base.slice(0, base.indexOf('alter table public.appointments enable row level security;')))
  await db.exec(`
    alter table appointments add confirmed_at timestamptz, add listing_viewing_round_number integer;
    alter table appointment_participants add rsvp_expires_at timestamptz, add rsvp_revoked_at timestamptz;
    create table appointment_resources(id uuid primary key, organisation_id uuid, resource_name text, is_active boolean default true);
    alter table appointments add foreign key(resource_id) references appointment_resources(id) on delete set null;
    create table appointment_reschedule_requests(id uuid primary key default gen_random_uuid(), appointment_id uuid, requested_by uuid, requested_by_role text, reason text,
      status text, preferred_start timestamptz, preferred_end timestamptz, reviewed_by uuid, reviewed_at timestamptz,
      suggested_slots jsonb, created_at timestamptz default now(), updated_at timestamptz);
    create table appointment_reminders(id uuid primary key default gen_random_uuid(), appointment_id uuid, status text, recipient_id uuid,recipient_email text,metadata jsonb,updated_at timestamptz);
    create function bridge_can_access_appointment(p_appointment_id uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.appointments where appointment_id=p_appointment_id and (created_by=auth.uid() or public.bridge_attorney_can_manage_transaction(transaction_id)))$$;
    grant usage on schema auth to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    alter table appointments enable row level security;
    create policy appointment_scope on appointments to authenticated using(bridge_can_access_appointment(appointment_id))
      with check(bridge_can_write_appointment_payload(transaction_id,organisation_id,created_by,agent_id));
    alter table appointment_participants enable row level security;
    create policy participant_scope on appointment_participants to authenticated using(bridge_can_access_appointment(appointment_id)) with check(bridge_can_access_appointment(appointment_id));
    alter table appointment_reschedule_requests enable row level security;
    create policy request_scope on appointment_reschedule_requests to authenticated using(bridge_can_access_appointment(appointment_id)) with check(bridge_can_access_appointment(appointment_id));
    alter table appointment_reminders enable row level security;
    create policy reminder_scope on appointment_reminders to authenticated using(bridge_can_access_appointment(appointment_id)) with check(bridge_can_access_appointment(appointment_id));
  `)
  const notifications = await readFile(new URL('../../supabase/migrations/202607180024_attorney_calendar_phase1_environment_recovery.sql', import.meta.url), 'utf8')
  await db.exec(notifications.slice(notifications.indexOf('create table if not exists public.appointment_notification_events ('), notifications.indexOf('alter table public.appointment_notification_events')))
  await db.exec("create unique index test_notification_dedupe on appointment_notification_events(dedupe_key) where dedupe_key is not null; grant select on appointment_notification_events to authenticated;")
  const portal = await readFile(new URL('../../supabase/migrations/202605270001_bridge9_principal_demo_seed_support.sql', import.meta.url), 'utf8')
  await db.exec(portal.slice(portal.indexOf('create table if not exists public.client_portal_notifications ('), portal.indexOf('alter table if exists public.client_portal_notifications')))
  await db.exec("grant select on client_portal_notifications to authenticated;")
  await db.exec(await readFile(new URL('../../supabase/migrations/202607180032_attorney_calendar_phase5_reschedule_coordination.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261003201121_attorney_appointment_management.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261003204422_attorney_calendar_durable_delivery.sql', import.meta.url), 'utf8'))
  // This fixture tests scheduling guards; the real calendar reader's access
  // rules are exercised separately in leadAppointmentHistoryReader.test.js.
  const calendarReader = await readFile(new URL('../../supabase/migrations/202605210001_agent_calendar_visibility_rpc.sql', import.meta.url), 'utf8')
  await db.exec(calendarReader.slice(calendarReader.indexOf('create or replace function public.bridge_list_calendar_appointments')))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261008163445_appointment_end_instant.sql', import.meta.url), 'utf8'))
  const lifecycle = await readFile(new URL('../../supabase/migrations/202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql', import.meta.url), 'utf8')
  await db.exec(lifecycle.slice(lifecycle.indexOf('drop function if exists public.get_appointment_rsvp_by_token'), lifecycle.indexOf('create function public.submit_appointment_rsvp')))
  const currentRsvp = await readFile(new URL('../../supabase/migrations/202608100003_viewing_seller_rsvp_buyer_handoff.sql', import.meta.url), 'utf8')
  await db.exec(currentRsvp.slice(currentRsvp.indexOf('create function public.submit_appointment_rsvp'), currentRsvp.indexOf('revoke all on function public.get_viewing_seller')))
  await db.exec("revoke all on function submit_appointment_rsvp(text,text,timestamptz,timestamptz,text) from public; grant execute on function submit_appointment_rsvp(text,text,timestamptz,timestamptz,text) to anon,authenticated; grant execute on function get_appointment_rsvp_by_token(text) to anon,authenticated;")
  await db.exec(await readFile(new URL('../../supabase/migrations/20261008164958_calendar_atomic_reservations.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261008184511_calendar_durable_notifications.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261008193925_calendar_agent_archive_workflow.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261008202747_calendar_historical_reconciliation.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../supabase/migrations/20261008205719_calendar_connected_provider_sync.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(() => db.close())
beforeEach(async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);
    truncate appointments, appointment_participants, profiles, organisations, transactions, appointment_resources, attorney_firms, attorney_firm_members, transaction_attorney_assignments, appointment_reminders, appointment_reschedule_requests, appointment_notification_events, client_portal_notifications cascade;
    insert into profiles values ('${actor}','Attorney A','','','attorney@example.test'), ('${staff}','Secretary A','','','secretary@example.test'),('${otherStaff}','Secretary B','','','second@example.test'),('${outsider}','Outside Firm','','','outside@example.test');
    insert into organisations values('${org}'),('${otherOrg}'),('${firmOrg}');
    insert into attorney_firms values('${firm}','${firmOrg}');
    insert into transactions values('${matter}','${org}');
    insert into attorney_firm_members values('${firm}','${actor}','transfer_attorney','active'),('${firm}','${staff}','conveyancing_secretary','active'),('${firm}','${otherStaff}','conveyancing_secretary','active');
    insert into transaction_attorney_assignments values('${matter}','${firm}',null,'active',null,true);
    insert into appointment_resources values('${room}','${org}','Room A',true),('${otherRoom}','${otherOrg}','Other room',true),('${firmRoom}','${firmOrg}','Firm room',true);
    insert into appointments(appointment_id,organisation_id,transaction_id,created_by,appointment_date,start_time,end_time,date_time,status,updated_at)
      values('${appointment}','${org}','${matter}','${actor}','2099-07-20','10:00','11:00','${baseline}','Confirmed','2026-10-03T12:00:00Z');
    insert into appointment_participants(appointment_id,organisation_id,user_id,name,email,participant_role,rsvp_status)
      values('${appointment}','${org}','${actor}','Attorney A','attorney@example.test','Attorney','Accepted'),('${appointment}','${org}',null,'Buyer','buyer@example.test','Client','Accepted');
    insert into appointment_reminders(appointment_id,status) values('${appointment}','pending');
    insert into appointment_reschedule_requests(id,appointment_id,status,preferred_start,preferred_end) values('${request}','${appointment}','pending','2099-07-20T10:00Z','2099-07-20T11:00Z');
    select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated;
  `)
})
async function manage(action, changes = {}, version = null) {
  const expected = version || (await db.query('select updated_at from appointments where appointment_id=$1', [appointment])).rows[0]?.updated_at
  return (await db.query('select manage_attorney_appointment($1,$2,$3,$4) as saved', [appointment, action, expected, JSON.stringify(changes)])).rows[0].saved
}
async function seedBusy({ email = null, user = null, resource = null, start = '2099-07-20T08:00Z', end = '11:00' } = {}) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`)
  await db.query(`insert into appointments(appointment_id,organisation_id,created_by,appointment_date,start_time,end_time,date_time,status,resource_id)
    values($1,$2,$3,'2099-07-20',($4::timestamptz at time zone 'Africa/Johannesburg')::time,$5::time,$4::timestamptz,'Confirmed',$6)`, [busyAppointment, resource === room ? org : otherOrg, outsider, start, end, resource])
  if (email || user) await db.query(`insert into appointment_participants(appointment_id,organisation_id,user_id,name,email,participant_role,rsvp_status) values($1,$2,$3,'Busy person',$4,'Other Contact','Accepted')`, [busyAppointment, otherOrg, user, email])
  await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated;`)
}

describe('Attorney appointment management SQL', () => {
  it('checks a selected timezone and explicit end against shared room reservations', async () => {
    await seedBusy({ resource: room })
    await db.query(`update appointments set appointment_date='2099-07-20', start_time='11:30', end_time='12:30',
      date_time='2099-07-20T15:30Z', end_date_time='2099-07-20T16:30Z', timezone='America/New_York', resource_id=$1
      where appointment_id=$2`, [room, appointment])
    expect(new Date((await db.query('select end_date_time from appointments where appointment_id=$1', [appointment])).rows[0].end_date_time).toISOString()).toBe('2099-07-20T16:30:00.000Z')
    await expect(db.query(`update appointments set start_time='04:30', end_time='05:30',
      date_time='2099-07-20T08:30Z', end_date_time='2099-07-20T09:30Z' where appointment_id=$1`, [appointment])).rejects.toThrow(/already (booked|reserved)/)
  })
  it('keeps a legacy reschedule usable after an explicit end was saved', async () => {
    await db.query("update appointments set end_date_time='2099-07-20T09:00Z' where appointment_id=$1", [appointment])
    const saved = await manage('edit', { start: '2099-07-21T08:00Z', end: '2099-07-21T09:00Z' })
    expect(saved.appointment.end_date_time).toBeNull()
  })
  it('persists staff identity/email and replaces only the scheduling owner', async () => {
    const saved = await manage('owner', { userId: staff })
    expect(saved.appointment.scheduling_owner_user_id).toBe(staff)
    expect(saved.participants.find(row => row.is_scheduling_owner)).toMatchObject({ user_id: staff, name: 'Secretary A', email: 'secretary@example.test', participant_role: 'Other Contact' })
    const reassigned = await manage('owner', { userId: otherStaff })
    expect(reassigned.participants.filter(row => row.is_scheduling_owner)).toHaveLength(1)
    expect(reassigned.participants.find(row => row.participant_role === 'Attorney').user_id).toBe(actor)
    expect((await manage('owner', { userId: null })).appointment.scheduling_owner_user_id).toBeNull()
  })
  it('rejects staff from another firm and rolls back without losing participants', async () => {
    await expect(manage('owner', { userId: outsider })).rejects.toThrow(/active staff member/)
    expect((await db.query('select * from appointment_participants')).rows).toHaveLength(2)
  })
  it.each(['user', 'email'])('checks hidden cross-organisation staff bookings by %s', async identity => {
    await seedBusy(identity === 'user' ? { user: staff } : { email: 'SECRETARY@example.test' })
    expect((await db.query('select * from appointments where appointment_id=$1', [busyAppointment])).rows).toHaveLength(0)
    await expect(manage('owner', { userId: staff })).rejects.toThrow(/already (booked|reserved)/)
    expect((await db.query('select * from appointment_participants')).rows).toHaveLength(2)
  })
  it('rejects room overlap and an active room belonging to another organisation', async () => {
    await seedBusy({ resource: room })
    await expect(manage('resource', { resourceId: room })).rejects.toThrow(/already (booked|reserved)/)
    await expect(manage('resource', { resourceId: otherRoom })).rejects.toThrow(/this appointment organisation/)
  })
  it('allows the assigned firm boardroom while retaining the matter organisation', async () => {
    const saved = await manage('resource', { resourceId: firmRoom })
    expect(saved.appointment).toMatchObject({ resource_id: firmRoom, organisation_id: org, transaction_id: matter, location_type: 'physical_address', location: 'Firm room' })
    expect((await manage('resource', { resourceId: null })).appointment).toMatchObject({ resource_id: null, location_type: 'to_be_confirmed', location: null })
  })
  it('manages internal events using the firm backing organisation', async () => {
    await db.exec(`reset role; update appointments set transaction_id=null, organisation_id='${firmOrg}' where appointment_id='${appointment}'; set role authenticated;`)
    expect((await manage('owner', { userId: staff })).appointment.scheduling_owner_user_id).toBe(staff)
    expect((await manage('resource', { resourceId: firmRoom })).appointment.resource_id).toBe(firmRoom)
  })
  it('completes an appointment and closes its pending requests and reminders', async () => {
    const saved = await manage('complete')
    expect(saved.appointment.status).toBe('Completed')
    expect(saved.appointment.completed_at).toBeTruthy()
    expect((await db.query('select status from appointment_reminders')).rows[0].status).toBe('cancelled')
    await expect(manage('owner', { userId: staff })).rejects.toThrow(/Closed appointments/)
  })
  it('reschedules atomically, rotates client RSVP tokens and closes old requests/reminders', async () => {
    const previous = (await db.query("select rsvp_token from appointment_participants where participant_role='Client'")).rows[0].rsvp_token
    const saved = await manage('edit', { start: '2099-07-20T10:00Z', end: '2099-07-20T11:30Z' })
    expect(saved.appointment).toMatchObject({ start_time: '12:00:00', end_time: '13:30:00', status: 'Pending Confirmation', external_calendar_status: 'not_synced' })
    expect(saved.participants.find(row => row.participant_role === 'Client').rsvp_status).toBe('Pending')
    expect(saved.participants.every(row => !('rsvp_token' in row))).toBe(true)
    expect((await db.query("select rsvp_token from appointment_participants where participant_role='Client'")).rows[0].rsvp_token).not.toBe(previous)
    expect((await db.query('select status from appointment_reminders')).rows[0].status).toBe('cancelled')
    expect((await db.query('select status from appointment_reschedule_requests')).rows[0].status).toBe('cancelled')
  })
  it('checks real attendees when editing and leaves the original appointment on conflict', async () => {
    await seedBusy({ user: actor, start: '2099-07-20T10:00Z', end: '13:00' })
    await expect(manage('edit', { start: '2099-07-20T10:00Z', end: '2099-07-20T11:00Z' })).rejects.toThrow(/already (booked|reserved)/)
    expect((await db.query('select start_time from appointments where appointment_id=$1', [appointment])).rows[0].start_time).toBe('10:00:00')
  })
  it('guards the existing proposal and acceptance RPCs against staff conflicts', async () => {
    await seedBusy({ email: 'buyer@example.test', start: '2099-07-20T10:00Z', end: '13:00' })
    await expect(db.query('select * from propose_attorney_appointment_reschedule($1,$2,$3)', [request, '2099-07-20T10:00Z', '2099-07-20T11:00Z'])).rejects.toThrow(/already (booked|reserved)/)
    await expect(db.query("select * from resolve_attorney_appointment_reschedule($1,'accepted')", [request])).rejects.toThrow(/already (booked|reserved)/)
  })
  it('retains cancellations and prevents stale RSVP/reschedule revival', async () => {
    const saved = await manage('cancel', { reason: 'Buyer unavailable' })
    expect(saved.appointment).toMatchObject({ status: 'Cancelled', cancelled_by: actor, cancellation_reason: 'Buyer unavailable' })
    expect(saved.participants.every(row => row.rsvp_revoked_at)).toBe(true)
    await db.query("insert into appointment_reminders(appointment_id,status) values($1,'pending')", [appointment])
    await db.query("update appointment_reminders set status='pending' where appointment_id=$1", [appointment])
    expect((await db.query('select status from appointment_reminders')).rows.every(row => row.status === 'cancelled')).toBe(true)
    await expect(db.query("update appointments set status='Confirmed' where appointment_id=$1", [appointment])).rejects.toThrow(/Closed appointments/)
    await expect(manage('edit', { start: '2099-07-20T10:00Z', end: '2099-07-20T11:00Z' })).rejects.toThrow(/Closed appointments/)
  })
  it('rejects stale saves, missing reasons, and invalid business hours', async () => {
    await expect(manage('cancel', { reason: 'Changed' }, '2026-10-02T12:00Z')).rejects.toThrow(/has changed/)
    await expect(manage('cancel', { reason: '  ' })).rejects.toThrow(/reason is required/)
    await expect(manage('edit', { start: '2099-07-20T04:00Z', end: '2099-07-20T05:00Z' })).rejects.toThrow(/08:00 and 17:00/)
  })
  it('preserves existing profile deletion cleanup and the historical owner name', async () => {
    await manage('owner', { userId: staff })
    await manage('cancel', { reason: 'Unavailable' })
    await db.exec(`reset role; delete from profiles where id='${staff}';`)
    expect((await db.query('select scheduling_owner_user_id from appointments where appointment_id=$1', [appointment])).rows[0].scheduling_owner_user_id).toBeNull()
    expect((await db.query('select user_id,name from appointment_participants where is_scheduling_owner')).rows[0]).toEqual({ user_id: null, name: 'Secretary A' })
  })
  it('preserves existing room deletion cleanup and the historical venue', async () => {
    await manage('resource', { resourceId: firmRoom })
    await manage('cancel', { reason: 'Unavailable' })
    await db.exec(`reset role; delete from appointment_resources where id='${firmRoom}';`)
    expect((await db.query('select resource_id,location,status from appointments where appointment_id=$1', [appointment])).rows[0]).toEqual({ resource_id: null, location: 'Firm room', status: 'Cancelled' })
  })
  it('denies an unrelated authenticated user and an anonymous caller', async () => {
    await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false);`)
    await expect(db.query("select manage_attorney_appointment($1,'cancel',$2,$3)", [appointment, '2026-10-03T12:00Z', { reason: 'No' }])).rejects.toThrow(/Not authorised/)
    await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false);")
    await expect(db.query("select manage_attorney_appointment($1,'cancel',$2,$3)", [appointment, '2026-10-03T12:00Z', { reason: 'No' }])).rejects.toThrow(/permission denied/)
  })
})

async function createInvite({ enabled = true, participants = null, appointmentChanges = {} } = {}) {
  return (await db.query('select create_attorney_appointment_invite($1,$2,$3,true) as saved', [JSON.stringify({
    appointment_id: id(50), organisation_id: org, transaction_id: matter, appointment_type: 'attorney_consultation', title: 'Signing',
    appointment_date: '2099-07-21', start_time: '10:00', end_time: '11:30', location_type: 'video_call', meeting_url: 'https://meet.example.test', visibility_scope: 'client_visible',
    ...appointmentChanges,
  }), JSON.stringify(participants || [{ participant_id: id(51), name: 'Buyer', email: 'buyer@example.test', participant_role: 'Client' },
    { participant_id: id(52),user_id:actor,name:'Attorney A',email:'attorney@example.test',participant_role:'Attorney' }]), enabled])).rows[0].saved
}
async function jobs() { return (await db.query('select * from attorney_appointment_delivery_jobs order by created_at,event_kind')).rows }
async function asWorker() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role service_role;") }
async function claim() { await asWorker(); return (await db.query('select * from claim_attorney_appointment_delivery(25)')).rows }
async function actorRole() { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated;`) }

describe('Attorney durable appointment delivery SQL', () => {
  it('saves recipients, tokens, initial delivery and actual-time reminders atomically', async () => {
    const saved = await createInvite()
    expect(saved.appointment).toMatchObject({ start_time:'10:00:00',end_time:'11:30:00',attorney_delivery_enabled:true,calendar_revision:0 })
    expect(saved.participants).toHaveLength(2)
    expect(saved.participants.every(p => !('rsvp_token' in p))).toBe(true)
    expect((await jobs()).map(j => j.event_kind).sort()).toEqual(['invite','reminder_24h','reminder_2h','reminder_due'].sort())
    expect(new Date((await jobs()).find(j=>j.event_kind==='reminder_2h').next_attempt_at).toISOString()).toBe('2099-07-21T06:00:00.000Z')
    expect((await db.query('select * from client_portal_notifications')).rows).toHaveLength(1)
    expect((await db.query('select * from appointment_notification_events')).rows).toHaveLength(1)
  })
  it('rolls back appointment and queued work if any recipient fails validation', async () => {
    await expect(createInvite({participants:[{email:'buyer@example.test',name:'Buyer',participant_role:'Client'},{email:'bad-email',name:'Bad',participant_role:'Client'}]})).rejects.toThrow(/email address/)
    expect((await db.query('select * from appointments where appointment_id=$1',[id(50)])).rows).toHaveLength(0)
    expect(await jobs()).toHaveLength(0)
    expect((await db.query('select * from client_portal_notifications')).rows).toHaveLength(0)
  })
  it('persists notifications off through edits with no email, reminder or portal jobs', async () => {
    const saved = await createInvite({enabled:false})
    await db.query('select manage_attorney_appointment($1,$2,$3,$4)',[id(50),'edit',saved.appointment.updated_at,JSON.stringify({start:'2099-07-21T10:00Z',end:'2099-07-21T11:30Z'})])
    expect(await jobs()).toHaveLength(0)
    expect((await db.query('select * from client_portal_notifications')).rows).toHaveLength(0)
    await expect(db.query('select retry_attorney_appointment_delivery($1,$2)',[id(50),'invite'])).rejects.toThrow(/switched off/)
  })
  it('rejects unauthorized organisation, fake organiser and anonymous RPC calls', async () => {
    await expect(createInvite({appointmentChanges:{organisation_id:otherOrg,transaction_id:null}})).rejects.toThrow(/Not authorised/)
    await expect(createInvite({participants:[{email:'buyer@example.test',name:'Buyer',participant_role:'Client'},{email:'outside@example.test',name:'Outside',participant_role:'Attorney',user_id:outsider}]})).rejects.toThrow(/signed-in attorney/)
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role anon;")
    await expect(createInvite()).rejects.toThrow(/permission denied/)
  })
  it('restricts worker claims/receipts and denies direct browser queue writes', async () => {
    await createInvite()
    await expect(db.query('select * from claim_attorney_appointment_delivery(10)')).rejects.toThrow(/permission denied/)
    await expect(db.query("update attorney_appointment_delivery_jobs set status='sent'")).rejects.toThrow(/permission denied/)
    await expect(db.query("select complete_attorney_appointment_delivery($1,1,'sent')",[id(1)])).rejects.toThrow(/permission denied/)
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${outsider}',false); set role authenticated;`)
    expect(await jobs()).toHaveLength(0)
    await expect(db.query("select retry_attorney_appointment_delivery($1,'invite')",[id(50)])).rejects.toThrow(/Not authorised/)
  })
  it('survives a closed browser and reclaims expired worker leases without accepting stale receipts', async () => {
    await createInvite()
    const first = await claim()
    expect(first).toHaveLength(1)
    expect((await claim())).toHaveLength(0)
    await db.exec("reset role; update attorney_appointment_delivery_jobs set claimed_at=now()-interval '6 minutes' where status='processing';")
    const second = await claim()
    expect(second[0]).toMatchObject({id:first[0].id,attempt_count:2})
    expect((await db.query("select complete_attorney_appointment_delivery($1,$2,'sent',null,'provider') as recorded",[first[0].id,1])).rows[0].recorded).toBe(false)
    expect((await db.query("select complete_attorney_appointment_delivery($1,$2,'sent',null,'provider') as recorded",[first[0].id,2])).rows[0].recorded).toBe(true)
    await actorRole()
    expect((await jobs()).find(j=>j.id===first[0].id)).toMatchObject({status:'sent',provider_message_id:'provider'})
    expect((await db.query('select email_status from appointment_notification_events')).rows[0].email_status).toBe('sent')
  })
  it('retries with backoff, and repeated manual retry does not duplicate queued messages', async () => {
    await createInvite()
    const [job] = await claim()
    await db.query("select complete_attorney_appointment_delivery($1,1,'failed','Provider failed')",[job.id])
    expect(await claim()).toHaveLength(0)
    await actorRole()
    expect((await db.query("select retry_attorney_appointment_delivery($1,'invite') as count",[id(50)])).rows[0].count).toBe(1)
    expect((await db.query("select retry_attorney_appointment_delivery($1,'invite') as count",[id(50)])).rows[0].count).toBe(1)
    expect((await jobs()).filter(j=>j.event_kind==='invite')).toHaveLength(1)
  })
  it('supersedes old invitations and reminders on edit/cancel and rejects late worker receipts', async () => {
    const saved = await createInvite()
    const [job] = await claim()
    await actorRole()
    const edited = (await db.query('select manage_attorney_appointment($1,$2,$3,$4) as saved',[id(50),'edit',saved.appointment.updated_at,JSON.stringify({start:'2099-07-21T10:00Z',end:'2099-07-21T11:30Z'})])).rows[0].saved
    expect(edited.appointment.calendar_revision).toBe(1)
    expect((await jobs()).filter(j=>j.revision===0).every(j=>j.status==='superseded')).toBe(true)
    await asWorker()
    expect((await db.query("select complete_attorney_appointment_delivery($1,1,'sent') as recorded",[job.id])).rows[0].recorded).toBe(false)
    await actorRole()
    await db.query('select manage_attorney_appointment($1,$2,$3,$4)',[id(50),'cancel',edited.appointment.updated_at,JSON.stringify({reason:'Buyer unavailable'})])
    const current=(await jobs()).filter(j=>j.revision===2)
    expect(current.every(j=>j.event_kind==='cancelled')).toBe(true)
    expect((await jobs()).filter(j=>j.revision<2).every(j=>j.status==='superseded')).toBe(true)
  })
  it('does not invalidate delivery when a receipt or unrelated note changes', async () => {
    await createInvite()
    await db.query("update appointments set notes='A note',updated_at=now() where appointment_id=$1",[id(50)])
    expect((await db.query('select calendar_revision from appointments where appointment_id=$1',[id(50)])).rows[0].calendar_revision).toBe(0)
    expect((await jobs()).filter(j=>j.event_kind==='invite')).toHaveLength(1)
  })
})


describe('Attorney RSVP with durable delivery', () => {
  async function token() { return (await db.query("select rsvp_token from appointment_participants where participant_id=$1",[id(51)])).rows[0].rsvp_token }
  async function anonymous() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role anon;") }
  it('accepts the saved token, queues confirmation and makes repeated accept idempotent', async () => {
    await createInvite(); const value=await token(); await anonymous()
    expect((await db.query("select * from submit_appointment_rsvp($1,'Accepted')",[value])).rows).toHaveLength(1)
    expect((await db.query("select * from submit_appointment_rsvp($1,'Accepted')",[value])).rows).toHaveLength(1)
    await expect(db.query("select * from submit_appointment_rsvp($1,'Declined')",[value])).rejects.toThrow(/already been recorded/)
    await actorRole()
    expect((await db.query('select status from appointments where appointment_id=$1',[id(50)])).rows[0].status).toBe('confirmed')
    expect((await jobs()).filter(j=>j.revision===1 && j.event_kind==='confirmed')).toHaveLength(2)
    expect((await jobs()).filter(j=>j.revision===0).every(j=>j.status==='superseded')).toBe(true)
  })
  it('declines without recreating reminders and preserves a distinct declined state', async () => {
    await createInvite(); const value=await token(); await anonymous()
    await db.query("select * from submit_appointment_rsvp($1,'Declined')",[value]); await actorRole()
    expect((await db.query('select status from appointments where appointment_id=$1',[id(50)])).rows[0].status).toBe('declined')
    expect((await jobs()).filter(j=>j.revision===1).every(j=>j.event_kind==='declined')).toBe(true)
  })
  it('records a preferred time and queues the request for the attorney', async () => {
    await createInvite(); const value=await token(); await anonymous()
    await db.query("select * from submit_appointment_rsvp($1,'Proposed New Time',$2,$3,$4)",[value,'2099-07-22T08:00Z','2099-07-22T09:30Z','Buyer unavailable'])
    await actorRole()
    const current=(await jobs()).filter(j=>j.revision===1)
    expect(current).toHaveLength(2)
    expect(current.every(j=>j.event_kind==='reschedule_requested')).toBe(true)
    expect((await db.query('select preferred_start from appointment_reschedule_requests where appointment_id=$1',[id(50)])).rows).toHaveLength(1)
  })
  it('rejects old token after an edit and after cancellation', async () => {
    const saved=await createInvite(),old=await token()
    const edited=(await db.query('select manage_attorney_appointment($1,$2,$3,$4) as saved',[id(50),'edit',saved.appointment.updated_at,JSON.stringify({start:'2099-07-21T10:00Z',end:'2099-07-21T11:30Z'})])).rows[0].saved
    const replacement=await token(); expect(replacement).not.toBe(old)
    await anonymous()
    expect((await db.query("select * from submit_appointment_rsvp($1,'Accepted')",[old])).rows).toHaveLength(0)
    await actorRole()
    await db.query('select manage_attorney_appointment($1,$2,$3,$4)',[id(50),'cancel',edited.appointment.updated_at,JSON.stringify({reason:'No longer needed'})])
    await anonymous()
    expect((await db.query("select * from submit_appointment_rsvp($1,'Accepted')",[replacement])).rows).toHaveLength(0)
  })
  it('queues a second counter-proposal when its dates change without changing proposal status', async () => {
    await manage('owner',{userId:staff})
    await db.query('select * from propose_attorney_appointment_reschedule($1,$2,$3)',[request,'2099-07-23T08:00Z','2099-07-23T09:30Z'])
    const first=(await db.query('select calendar_revision from appointments where appointment_id=$1',[appointment])).rows[0].calendar_revision
    await db.query('select * from propose_attorney_appointment_reschedule($1,$2,$3)',[request,'2099-07-24T08:00Z','2099-07-24T09:30Z'])
    const second=(await db.query('select calendar_revision from appointments where appointment_id=$1',[appointment])).rows[0].calendar_revision
    expect(second).toBeGreaterThan(first)
    expect((await jobs()).filter(j=>j.revision===first && j.status==='queued')).toHaveLength(0)
    expect((await jobs()).filter(j=>j.revision===second).every(j=>j.event_kind==='reschedule_proposed')).toBe(true)
  })
  it('allows an explicit resend with a new provider key, but repeated clicks do not duplicate it', async () => {
    await createInvite(); const [job]=await claim()
    await db.query("select complete_attorney_appointment_delivery($1,$2,'sent')",[job.id,job.attempt_count]); await actorRole()
    expect((await db.query("select retry_attorney_appointment_delivery($1,'invite') as count",[id(50)])).rows[0].count).toBe(1)
    expect((await db.query("select retry_attorney_appointment_delivery($1,'invite') as count",[id(50)])).rows[0].count).toBe(1)
    const invites=(await jobs()).filter(j=>j.event_kind==='invite')
    expect(invites).toHaveLength(2)
    expect(invites[0].id).not.toBe(invites[1].id)
    expect(invites.filter(j=>j.status==='queued')).toHaveLength(1)
  })
  it('records due reminder in-app once and preserves read state through retries', async () => {
    await createInvite(); await db.exec("reset role; update attorney_appointment_delivery_jobs set next_attempt_at=now() where event_kind='reminder_2h';")
    const job=(await claim()).find(j=>j.event_kind==='reminder_2h')
    expect((await db.query('select record_attorney_delivery_in_app($1,$2) as recorded',[job.id,job.attempt_count])).rows[0].recorded).toBe(true)
    await db.exec(`reset role; update client_portal_notifications set status='read' where id='${job.id}'; set role service_role;`)
    await db.query('select record_attorney_delivery_in_app($1,$2)',[job.id,job.attempt_count]); await actorRole()
    expect((await db.query('select status from client_portal_notifications where id=$1',[job.id])).rows[0].status).toBe('read')
  })
})

it('freezes private email bodies for the same lease/key and hides them from browser callers',async()=>{
  await createInvite(); const [job]=await claim()
  const first={to:'buyer@example.test',notes:'First body',rsvpToken:'private-token'}
  expect((await db.query('select save_attorney_delivery_payload($1,$2,$3) as payload',[job.id,job.attempt_count,JSON.stringify(first)])).rows[0].payload).toEqual(first)
  expect((await db.query('select save_attorney_delivery_payload($1,$2,$3) as payload',[job.id,job.attempt_count,JSON.stringify({...first,notes:'Changed body'})])).rows[0].payload).toEqual(first)
  await actorRole()
  await expect(db.query('select * from private.attorney_appointment_email_payloads')).rejects.toThrow(/permission denied/)
  await expect(db.query('select save_attorney_delivery_payload($1,$2,$3)',[job.id,job.attempt_count,'{}'])).rejects.toThrow(/permission denied/)
})
