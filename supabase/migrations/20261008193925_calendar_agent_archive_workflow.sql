begin;

-- Archiving is a visibility decision, never a new appointment lifecycle or a
-- new delivery revision. Restoring history cannot renew holds or revive mail.
alter table public.appointments
 add column archived_at timestamptz,
 add column archived_by uuid references public.profiles(id) on delete set null,
 add column archive_reason text;
create index appointments_archived_by_idx on public.appointments(archived_by) where archived_by is not null;

create table private.calendar_archive_history (
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(appointment_id),
 actor_id uuid not null references public.profiles(id),
 command_id uuid not null,
 action text not null check(action in ('archive','restore')),
 reason text not null,
 calendar_revision integer not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,command_id)
);
alter table private.calendar_archive_history enable row level security;
revoke all on private.calendar_archive_history from public,anon,authenticated;
create index calendar_archive_history_appointment_idx on private.calendar_archive_history(appointment_id,created_at);

create function private.protect_calendar_archive() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.archived_at is not null or new.archived_by is not null or new.archive_reason is not null then
     raise exception 'Create the appointment before archiving it.' using errcode='22023';
   end if;
   return new;
 end if;
 if (new.archived_at,new.archived_by,new.archive_reason) is distinct from (old.archived_at,old.archived_by,old.archive_reason) then
   if current_user in ('anon','authenticated') then
     raise exception 'Use the verified archive command.' using errcode='42501';
   end if;
   if private.calendar_status(old.status) not in ('draft','cancelled','declined','completed','no_show') or new.status is distinct from old.status then
     raise exception 'Cancel an active appointment before archiving it.' using errcode='22023';
   end if;
 elsif old.archived_at is not null and new is distinct from old then
   raise exception 'Restore this archived appointment before editing it.' using errcode='22023';
 end if;
 return new;
end; $$;
revoke all on function private.protect_calendar_archive() from public,anon,authenticated;
create trigger calendar_archive_guard before insert or update on public.appointments
 for each row execute function private.protect_calendar_archive();

create function public.set_calendar_appointment_archive(
 p_organisation_id uuid,p_appointment_id uuid,p_archive boolean,p_reason text,
 p_expected_revision integer,p_expected_archived_at timestamptz,p_command_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; v_fingerprint jsonb; receipt jsonb; action text;
begin
 if auth.uid() is null or p_organisation_id is null or p_appointment_id is null or p_archive is null or p_command_id is null
   or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then
   raise exception 'Choose an appointment and give a short archive or restore reason.' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attorney_calendar_scheduling',0));
 select * into a from public.appointments where appointment_id=p_appointment_id for update;
 if not found or a.organisation_id<>p_organisation_id or not public.bridge_can_write_appointment_payload(
   a.transaction_id,a.organisation_id,a.created_by,a.agent_id) then
   raise exception 'Not authorised to manage this appointment.' using errcode='42501';
 end if;
 action:=case when p_archive then 'archive' else 'restore' end;
 v_fingerprint:=jsonb_build_object('action',action,'organisation',p_organisation_id,'appointment',p_appointment_id,
   'reason',btrim(p_reason),'revision',p_expected_revision,'archivedAt',p_expected_archived_at);
 select r.result into receipt from private.calendar_mutation_receipts r
   where r.actor_id=auth.uid() and r.command_id=p_command_id and r.fingerprint=v_fingerprint;
 if found then return private.calendar_receipt(a)||jsonb_build_object('replayed',true); end if;
 if exists(select 1 from private.calendar_mutation_receipts r where r.actor_id=auth.uid() and r.command_id=p_command_id) then
   raise exception 'This command identifier was already used for different details.' using errcode='22023'; end if;
 if p_expected_revision is null or a.calendar_revision<>p_expected_revision or a.archived_at is distinct from p_expected_archived_at then
   raise exception 'This appointment changed. Refresh before archiving or restoring.' using errcode='40001'; end if;
 if private.calendar_status(a.status) not in ('draft','cancelled','declined','completed','no_show') then
   raise exception 'Cancel an active appointment before archiving it.' using errcode='22023'; end if;
 if p_archive=(a.archived_at is not null) then
   raise exception 'This appointment is already in that archive state. Refresh it.' using errcode='40001'; end if;
 update public.appointments set archived_at=case when p_archive then clock_timestamp() else null end,
   archived_by=case when p_archive then auth.uid() else null end,archive_reason=case when p_archive then btrim(p_reason) else null end,
   updated_at=clock_timestamp() where appointment_id=a.appointment_id returning * into a;
 insert into private.calendar_archive_history(appointment_id,actor_id,command_id,action,reason,calendar_revision)
   values(a.appointment_id,auth.uid(),p_command_id,action,btrim(p_reason),a.calendar_revision);
 -- Archive retires outstanding delivery; restore only restores visibility.
 if p_archive then
   update public.calendar_delivery_jobs set status='superseded',claimed_at=null,updated_at=clock_timestamp()
     where appointment_id=a.appointment_id and status in ('queued','processing','failed');
   update public.appointment_reminders set status='cancelled',updated_at=clock_timestamp()
     where appointment_id=a.appointment_id and status='pending';
 end if;
 receipt:=private.calendar_receipt(a);
 insert into private.calendar_mutation_receipts(actor_id,command_id,appointment_id,fingerprint,result)
   values(auth.uid(),p_command_id,a.appointment_id,v_fingerprint,receipt);
 return receipt;
end; $$;
revoke all on function public.set_calendar_appointment_archive(uuid,uuid,boolean,text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.set_calendar_appointment_archive(uuid,uuid,boolean,text,integer,timestamptz,uuid) to authenticated;

create or replace function private.calendar_delivery_valid(j public.calendar_delivery_jobs) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.appointments a join public.appointment_participants p on p.appointment_id=a.appointment_id
   where a.appointment_id=j.appointment_id and a.archived_at is null and p.participant_id=j.participant_id
   and a.calendar_delivery_managed and a.attorney_delivery_enabled is null
   and (a.listing_viewing_round_number is null or j.event_kind like 'reminder:%')
   and a.calendar_revision=j.revision and j.expires_at>clock_timestamp()
   and (j.channel<>'email' or private.calendar_email_allowed(a.organisation_id,j.recipient_email))
   and p.participant_role is not distinct from j.participant_role and p.user_id is not distinct from j.recipient_id and lower(btrim(coalesce(p.email,'')))=coalesce(j.recipient_email,'')
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and (p.rsvp_revoked_at is null or (j.event_kind in ('cancelled','completed','declined','no_show') and p.rsvp_revoked_at=a.updated_at))
   and case when j.event_kind in ('cancelled','completed','declined','no_show') then
     a.invitations_enabled and private.calendar_status(a.status)=j.event_kind
   else private.calendar_status(a.status) not in ('draft','cancelled','completed','declined','no_show')
     and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())
     and private.calendar_end(a)>clock_timestamp()
     and lower(p.rsvp_status)<>'declined'
     and case when j.event_kind like 'reminder:%' then a.reminders_enabled and exists(
       select 1 from jsonb_array_elements(coalesce(a.reminder_rules,'[]'::jsonb)) r
       where 'reminder:'||(r->>'reminderType')=j.event_kind and a.date_time-(r->>'offsetMinutes')::integer*interval '1 minute'=j.scheduled_for)
     else a.invitations_enabled end
   end);
$$;
revoke all on function private.calendar_delivery_valid(public.calendar_delivery_jobs) from public,anon,authenticated;

create or replace function private.reconcile_calendar_delivery(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.appointments; kind text; start_at timestamptz;
begin
 select * into a from public.appointments where appointment_id=p_id;
 if not found or not a.calendar_delivery_managed then return; end if;
 update public.appointment_reminders set status='cancelled',updated_at=clock_timestamp() where appointment_id=p_id and status='pending';
 update public.calendar_delivery_jobs j set status='superseded',claimed_at=null,updated_at=clock_timestamp()
   where j.appointment_id=p_id and j.status in ('queued','processing','failed') and not private.calendar_delivery_valid(j);
 if a.archived_at is not null or a.attorney_delivery_enabled is not null then return; end if;
 kind:=case private.calendar_status(a.status) when 'requested' then 'invite' when 'accepted' then 'invite'
   when 'confirmed' then 'confirmed' when 'alternative_proposed' then 'reschedule_proposed'
   when 'alternative_requested' then 'reschedule_requested' else private.calendar_status(a.status) end;
 start_at:=a.date_time;
 if kind='draft' then return; end if;
 insert into public.calendar_delivery_jobs(appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,next_attempt_at)
 select a.appointment_id,p.participant_id,a.calendar_revision,kind,c.channel,p.user_id,lower(btrim(coalesce(p.email,''))),p.participant_role,
   clock_timestamp(),case when kind in ('cancelled','completed','declined','no_show') then clock_timestamp()+interval '1 day'
     else least(private.calendar_end(a),case when a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' then private.calendar_end(a) else a.hold_expires_at end) end,clock_timestamp()
 from public.appointment_participants p cross join (values('email'),('in_app')) c(channel)
 where p.appointment_id=a.appointment_id and a.invitations_enabled and a.listing_viewing_round_number is null
   and (p.rsvp_revoked_at is null or (kind in ('cancelled','completed','declined','no_show') and p.rsvp_revoked_at=a.updated_at))
   and (kind in ('cancelled','completed','declined','no_show') or (lower(p.rsvp_status)<>'declined' and private.calendar_end(a)>clock_timestamp()
     and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())))
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and ((c.channel='email' and private.calendar_email_allowed(a.organisation_id,lower(btrim(p.email))) and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
 on conflict(appointment_id,revision,participant_id,event_kind,channel) do nothing;
 if not a.reminders_enabled or kind in ('draft','cancelled','completed','declined','no_show') then return; end if;
 insert into public.calendar_delivery_jobs(appointment_id,participant_id,revision,event_kind,channel,recipient_id,recipient_email,participant_role,scheduled_for,expires_at,next_attempt_at)
 select a.appointment_id,p.participant_id,a.calendar_revision,'reminder:'||(r->>'reminderType'),c.channel,p.user_id,lower(btrim(coalesce(p.email,''))),p.participant_role,
   start_at-(r->>'offsetMinutes')::integer*interval '1 minute',least(start_at+interval '15 minutes',start_at-(r->>'offsetMinutes')::integer*interval '1 minute'+interval '15 minutes'),
   start_at-(r->>'offsetMinutes')::integer*interval '1 minute'
 from public.appointment_participants p cross join jsonb_array_elements(coalesce(a.reminder_rules,'[]'::jsonb)) r cross join (values('email'),('in_app')) c(channel)
 where p.appointment_id=a.appointment_id and p.rsvp_revoked_at is null and lower(p.rsvp_status)<>'declined'
   and (a.visibility_scope<>'internal_only' or lower(p.participant_role) in ('agent','co-agent','attorney','bond originator','developer representative'))
   and ((c.channel='email' and private.calendar_email_allowed(a.organisation_id,lower(btrim(p.email))) and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c.channel='in_app' and p.user_id is not null))
   and (a.has_confirmed_reservation or private.calendar_status(a.status)='confirmed' or a.hold_expires_at>clock_timestamp())
   and start_at-(r->>'offsetMinutes')::integer*interval '1 minute'>clock_timestamp()
 on conflict(appointment_id,revision,participant_id,event_kind,channel) do nothing;
end; $$;
revoke all on function private.reconcile_calendar_delivery(uuid) from public,anon,authenticated;

create or replace function public.bridge_list_calendar_appointments_with_times(
  p_organisation_id uuid,
  p_include_all boolean default false,
  p_listing_id text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(
    to_jsonb(a) || jsonb_build_object('end_date_time',stored.end_date_time,'calendar_revision',stored.calendar_revision, 'reservation_managed',stored.reservation_managed,'request_issued_at',stored.request_issued_at,'hold_expires_at',stored.hold_expires_at,'has_confirmed_reservation',stored.has_confirmed_reservation,
      'archived_at',stored.archived_at,'archived_by',stored.archived_by,'archive_reason',stored.archive_reason,'calendar_delivery_managed',stored.calendar_delivery_managed,'invitations_enabled',stored.invitations_enabled,'reminders_enabled',stored.reminders_enabled,'reminder_rules',stored.reminder_rules,'attach_calendar_invite',stored.attach_calendar_invite,'email_theme',stored.email_theme,'email_template_key',stored.email_template_key,'attorney_delivery_enabled',stored.attorney_delivery_enabled,'listing_viewing_round_number',stored.listing_viewing_round_number)
    order by a.date_time asc nulls last, a.created_at desc
  ), '[]'::jsonb)
  from public.bridge_list_calendar_appointments(p_organisation_id, p_include_all, p_listing_id, p_from, p_to) a
  join public.appointments stored
    on stored.appointment_id = a.appointment_id and stored.organisation_id = a.organisation_id;
$$;

commit;
