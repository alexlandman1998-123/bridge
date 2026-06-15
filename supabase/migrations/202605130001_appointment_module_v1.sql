-- Bridge appointment module V1
-- Keeps Bridge as the source of truth while adding RSVP tokens, ICS metadata,
-- flexible related-record links, and participant invite tracking.

create table if not exists public.appointments (
  appointment_id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  lead_id uuid references public.leads(lead_id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  agent_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null default 'Appointment',
  appointment_type text not null default 'viewing',
  custom_type_label text,
  appointment_date date,
  start_time time,
  end_time time,
  date_time timestamptz not null default now(),
  timezone text not null default 'Africa/Johannesburg',
  all_day boolean not null default false,
  location_type text not null default 'to_be_confirmed',
  location text,
  meeting_url text,
  status text not null default 'Pending Confirmation',
  notes text,
  listing_id text,
  transaction_id uuid references public.transactions(id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  linked_workflow text,
  linked_workflow_stage text,
  linked_task_id uuid,
  linked_transaction_stage text,
  workflow_completion_effect jsonb not null default '{}'::jsonb,
  visibility_scope text not null default 'shared_role_players',
  completion_behavior text,
  appointment_instructions text,
  required_documents jsonb not null default '[]'::jsonb,
  calendar_event_uid text,
  ics_generated_at timestamptz,
  external_calendar_status text not null default 'not_synced',
  external_calendar_provider text,
  external_calendar_event_id text,
  resource_id uuid,
  allow_outside_business_hours boolean not null default false,
  scheduling_override_reason text,
  outcome_summary text,
  client_feedback text,
  agent_notes text,
  next_step text,
  follow_up_date date,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists public.appointments add column if not exists custom_type_label text;
alter table if exists public.appointments add column if not exists timezone text not null default 'Africa/Johannesburg';
alter table if exists public.appointments add column if not exists all_day boolean not null default false;
alter table if exists public.appointments add column if not exists location_type text not null default 'to_be_confirmed';
alter table if exists public.appointments add column if not exists meeting_url text;
alter table if exists public.appointments add column if not exists related_entity_type text;
alter table if exists public.appointments add column if not exists related_entity_id uuid;
alter table if exists public.appointments add column if not exists cancelled_at timestamptz;
alter table if exists public.appointments add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table if exists public.appointments add column if not exists cancellation_reason text;
alter table if exists public.appointments drop constraint if exists appointments_location_type_check;
alter table if exists public.appointments
  add constraint appointments_location_type_check
  check (location_type in ('physical_address', 'video_call', 'phone_call', 'to_be_confirmed'));
alter table if exists public.appointments drop constraint if exists appointments_related_entity_type_check;
alter table if exists public.appointments
  add constraint appointments_related_entity_type_check
  check (
    related_entity_type is null
    or related_entity_type in ('transaction', 'lead', 'development', 'unit', 'client', 'private_transaction', 'none')
  );
create table if not exists public.appointment_participants (
  participant_id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  name text not null default 'Participant',
  email text,
  phone text,
  participant_role text not null default 'Other Contact',
  is_required boolean not null default true,
  rsvp_status text not null default 'Pending',
  rsvp_comment text,
  rsvp_token text,
  proposed_new_time timestamptz,
  responded_at timestamptz,
  invitation_sent_at timestamptz,
  last_invitation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table if exists public.appointment_participants add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table if exists public.appointment_participants add column if not exists contact_id uuid references public.contacts(contact_id) on delete set null;
alter table if exists public.appointment_participants add column if not exists is_required boolean not null default true;
alter table if exists public.appointment_participants add column if not exists rsvp_comment text;
alter table if exists public.appointment_participants add column if not exists rsvp_token text;
alter table if exists public.appointment_participants add column if not exists invitation_sent_at timestamptz;
alter table if exists public.appointment_participants add column if not exists last_invitation_sent_at timestamptz;
update public.appointment_participants
set rsvp_token = gen_random_uuid()::text
where rsvp_token is null;
alter table if exists public.appointment_participants alter column rsvp_token set default gen_random_uuid()::text;
alter table if exists public.appointment_participants drop constraint if exists appointment_participants_role_check;
alter table if exists public.appointment_participants
  add constraint appointment_participants_role_check
  check (participant_role in ('Client', 'Buyer', 'Seller', 'Agent', 'Co-agent', 'Principal', 'Attorney', 'Bond Originator', 'Developer', 'Other', 'Other Contact'));
alter table if exists public.appointment_participants drop constraint if exists appointment_participants_rsvp_check;
alter table if exists public.appointment_participants
  add constraint appointment_participants_rsvp_check
  check (rsvp_status in ('Pending', 'Accepted', 'Declined', 'Proposed New Time'));
create unique index if not exists appointment_participants_rsvp_token_idx on public.appointment_participants (rsvp_token) where rsvp_token is not null;
create index if not exists appointment_participants_email_idx on public.appointment_participants (email);
create index if not exists appointment_participants_status_idx on public.appointment_participants (rsvp_status);
create index if not exists appointments_related_entity_idx on public.appointments (related_entity_type, related_entity_id);
create index if not exists appointments_org_date_idx on public.appointments (organisation_id, date_time);
alter table public.appointments enable row level security;
alter table public.appointment_participants enable row level security;
drop policy if exists appointments_agency_select on public.appointments;
create policy appointments_agency_select on public.appointments
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or agent_id = auth.uid()
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
  )
);
drop policy if exists appointments_agency_write on public.appointments;
create policy appointments_agency_write on public.appointments
for all to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or agent_id = auth.uid()
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
  )
);
drop policy if exists appointment_participants_agency_select on public.appointment_participants;
create policy appointment_participants_agency_select on public.appointment_participants
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or a.created_by = auth.uid()
        or a.agent_id = auth.uid()
        or appointment_participants.user_id = auth.uid()
      )
  )
);
drop policy if exists appointment_participants_agency_write on public.appointment_participants;
create policy appointment_participants_agency_write on public.appointment_participants
for all to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or a.created_by = auth.uid()
        or a.agent_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or (
          public.bridge_membership_role(a.organisation_id) = 'agent'
          and a.agent_id = auth.uid()
        )
      )
  )
);
drop policy if exists "appointment participants can rsvp with token" on public.appointment_participants;
drop policy if exists "appointment participants can view own rsvp token" on public.appointment_participants;
create or replace function public.get_appointment_rsvp_by_token(p_token text)
returns table (
  participant_id uuid,
  appointment_id uuid,
  participant_name text,
  participant_email text,
  participant_role text,
  rsvp_status text,
  appointment_title text,
  appointment_type text,
  appointment_date date,
  start_time time,
  end_time time,
  location text,
  meeting_url text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    ap.participant_id,
    ap.appointment_id,
    ap.name as participant_name,
    ap.email as participant_email,
    ap.participant_role,
    ap.rsvp_status,
    a.title as appointment_title,
    a.appointment_type,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.location,
    a.meeting_url,
    a.status
  from public.appointment_participants ap
  join public.appointments a on a.appointment_id = ap.appointment_id
  where ap.rsvp_token = p_token
  limit 1
$$;
create or replace function public.submit_appointment_rsvp(
  p_token text,
  p_rsvp_status text,
  p_proposed_new_time timestamptz default null,
  p_rsvp_comment text default null
)
returns table (
  participant_id uuid,
  appointment_id uuid,
  rsvp_status text,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rsvp_status not in ('Accepted', 'Declined', 'Proposed New Time') then
    raise exception 'Invalid RSVP status';
  end if;

  if to_regclass('public.appointment_notification_events') is not null then
    insert into public.appointment_notification_events (
      appointment_id,
      event_type,
      recipient_id,
      recipient_role,
      recipient_email,
      visibility,
      title,
      message,
      email_status,
      in_app_status,
      metadata
    )
    select
      ap.appointment_id,
      case
        when p_rsvp_status = 'Accepted' then 'appointment_confirmed'
        when p_rsvp_status = 'Declined' then 'appointment_declined'
        else 'appointment_reschedule_requested'
      end,
      ap.user_id,
      ap.participant_role,
      ap.email,
      'shared_role_players',
      case
        when p_rsvp_status = 'Accepted' then 'Appointment accepted'
        when p_rsvp_status = 'Declined' then 'Appointment declined'
        else 'Appointment reschedule requested'
      end,
      coalesce(ap.name, ap.email, 'Participant') || ' responded to the appointment.',
      'skipped',
      'pending',
      jsonb_build_object('source', 'appointment_rsvp', 'rsvpStatus', p_rsvp_status, 'comment', p_rsvp_comment)
    from public.appointment_participants ap
    where ap.rsvp_token = p_token;
  end if;

  return query
  update public.appointment_participants ap
  set
    rsvp_status = p_rsvp_status,
    proposed_new_time = case when p_rsvp_status = 'Proposed New Time' then p_proposed_new_time else null end,
    rsvp_comment = case when p_rsvp_status = 'Proposed New Time' then nullif(p_rsvp_comment, '') else null end,
    responded_at = now(),
    updated_at = now()
  where ap.rsvp_token = p_token
  returning ap.participant_id, ap.appointment_id, ap.rsvp_status, ap.responded_at;
end;
$$;
grant execute on function public.get_appointment_rsvp_by_token(text) to anon, authenticated;
grant execute on function public.submit_appointment_rsvp(text, text, timestamptz, text) to anon, authenticated;
