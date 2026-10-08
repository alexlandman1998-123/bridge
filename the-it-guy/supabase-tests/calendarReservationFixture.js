import { readFile } from 'node:fs/promises'
export const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const org=id(1), otherOrg=id(2), actor=id(3), second=id(4), outsider=id(5), booking=id(6), room=id(7), task=id(8), transaction=id(9)
const sql = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
export const input = changes => ({ appointment_date:'2099-07-20',start_time:'10:00',end_time:'11:00',date_time:'2099-07-20T08:00:00Z',
  end_date_time:'2099-07-20T09:00:00Z',timezone:'Africa/Johannesburg',all_day:false,agent_id:actor,status:'requested',title:'Viewing', ...changes })
export const people = changes => [{ user_id:actor,name:'Agent',email:'agent@example.test',participant_role:'Agent',is_required:true }, ...changes]

export async function setupCalendarReservationDatabase(db, loadSql = sql) {
  await db.exec(`do $$begin
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end$$; alter role service_role bypassrls; create schema auth; create schema private; create schema extensions; grant usage on schema auth to authenticated,anon;
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1),'hex')$$;
    create table organisations(id uuid primary key); create table profiles(id uuid primary key,email text,role text);
    create table organisation_users(organisation_id uuid,user_id uuid,workspace_role text,organization_role text,organisation_role text,role text,
      membership_status text,status text,created_at timestamptz default now());
    create table leads(lead_id uuid primary key,organisation_id uuid,assigned_agent_id uuid);
    create table contacts(contact_id uuid primary key,organisation_id uuid); create table transactions(id uuid primary key,organisation_id uuid);
    create function public.bridge_appointment_org_matches_transaction(t uuid,o uuid) returns boolean language sql stable as $$select exists(select 1 from transactions where id=t and organisation_id=o)$$;
    create function public.bridge_attorney_can_manage_transaction(uuid) returns boolean language sql stable as $$select false$$;
  `)
  const base=await loadSql('202605130001_appointment_module_v1.sql')
  await db.exec(base.slice(0,base.indexOf('alter table public.appointments enable row level security;')))
  await db.exec(`alter table appointments add scheduling_owner_user_id uuid, add attorney_delivery_enabled boolean, add calendar_revision integer not null default 0,
    add listing_viewing_round_number integer, add confirmed_at timestamptz;
    alter table appointment_participants add rsvp_revoked_at timestamptz,add rsvp_expires_at timestamptz,add is_scheduling_owner boolean default false;
    create table appointment_resources(id uuid primary key,organisation_id uuid,is_active boolean default true);
    create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,assignment_status text,status text,can_manage_signing boolean);
    create table attorney_firms(id uuid,organisation_id uuid);
    create table attorney_firm_members(user_id uuid,status text,firm_id uuid,role text);
    create table appointment_reminders(id uuid primary key default gen_random_uuid(),appointment_id uuid,status text,recipient_id uuid,recipient_email text,metadata jsonb,updated_at timestamptz);
    create table appointment_reschedule_requests(id uuid primary key default gen_random_uuid(),appointment_id uuid references appointments(appointment_id) on delete cascade,
      participant_id uuid,requested_by uuid,requested_by_role text,reason text,preferred_start timestamptz,preferred_end timestamptz,
      status text default 'pending',reviewed_by uuid,reviewed_at timestamptz,suggested_slots jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    create table transaction_checklist_items(id uuid primary key,transaction_id uuid,status text,updated_at timestamptz);
    create table listing_viewing_round_responses(token_hash text);
  `)
  await db.exec(await loadSql('202607130002_membership_helper_status_alignment.sql'))
  await db.exec(await loadSql('202605210001_agent_calendar_visibility_rpc.sql'))
  const permissions=await loadSql('202607180044_attorney_calendar_phase7_staging_acceptance.sql')
  await db.exec(permissions.slice(permissions.indexOf('create or replace function public.bridge_can_write_appointment_payload'),permissions.indexOf('drop policy if exists appointments_agency_write')))
  await db.exec('create function public.bridge_can_access_appointment(uuid) returns boolean language sql as $$select exists(select 1 from appointments where appointment_id=$1 and (created_by=auth.uid() or agent_id=auth.uid()))$$;')
  await db.exec(await loadSql('20261003201121_attorney_appointment_management.sql'))
  await db.exec(await loadSql('20261008163445_appointment_end_instant.sql'))
  const responses=await loadSql('20261004110204_attorney_cross_role_appointment_responses.sql')
  await db.exec(responses.slice(responses.indexOf('create or replace function public.submit_appointment_rsvp'),responses.indexOf('create function public.bridge_respond_client_portal_appointment')))
  await db.exec(await loadSql('20261008164958_calendar_atomic_reservations.sql'))
  await db.exec(`create table appointment_notification_events(id uuid primary key,appointment_id uuid,transaction_id uuid,event_type text,recipient_id uuid references profiles(id),recipient_role text,recipient_email text,visibility text,title text,message text,email_status text,in_app_status text,metadata jsonb,dedupe_key text);
    create unique index notification_dedupe on appointment_notification_events(dedupe_key) where dedupe_key is not null;`)
  await db.exec(await loadSql('20261008184511_calendar_durable_notifications.sql'))
  await db.exec(await loadSql('20261008193925_calendar_agent_archive_workflow.sql'))
  await db.exec(await loadSql('20261008202747_calendar_historical_reconciliation.sql'))
  await db.exec(await loadSql('20261008205719_calendar_connected_provider_sync.sql'))
  await db.exec(await loadSql('20261008220735_calendar_operational_health_support.sql'))
  await db.exec(`alter table appointments enable row level security; alter table appointment_participants enable row level security;
    grant select,insert,update,delete on appointments,appointment_participants,appointment_reschedule_requests,appointment_resources to authenticated;
    create policy appointments_read on appointments for select to authenticated using (public.bridge_is_active_member(organisation_id) and (created_by=auth.uid() or agent_id=auth.uid()));
    create policy appointments_write on appointments for all to authenticated using (created_by=auth.uid()) with check (public.bridge_is_active_member(organisation_id) and created_by=auth.uid());
    create policy participants_read on appointment_participants for select to authenticated using (exists(select 1 from appointments a where a.appointment_id=appointment_participants.appointment_id));
    create policy participants_attendee_read on appointment_participants for select to authenticated using(public.bridge_can_access_appointment(appointment_id));
    create policy participants_write on appointment_participants for all to authenticated using (exists(select 1 from appointments a where a.appointment_id=appointment_participants.appointment_id and a.created_by=auth.uid()));
    insert into organisations values('${org}'),('${otherOrg}');
    insert into profiles values('${actor}','agent@example.test','agent'),('${second}','other@example.test','agent'),('${outsider}','outside@example.test','agent');
    insert into organisation_users(organisation_id,user_id,role,status) values('${org}','${actor}','agent','active'),('${org}','${second}','agent','active'),('${otherOrg}','${outsider}','agent','active');
    insert into transactions values('${transaction}','${org}');
    insert into appointment_resources values('${room}','${org}',true);
  `)
}
