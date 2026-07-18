begin;

-- Attorney calendar Phase 1 recovery.
-- Restores the profile bootstrap contract, promotes appointment delivery tables
-- into the migration ledger, and gives assigned attorney teams scoped access to
-- the appointment records used by the scheduling workspace.

grant select, insert, update on table public.profiles to authenticated;

create or replace function public.bridge_can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    or exists (
      select 1
      from public.attorney_firm_members actor_member
      join public.attorney_firm_members target_member
        on target_member.firm_id = actor_member.firm_id
       and target_member.status = 'active'
      where actor_member.user_id = auth.uid()
        and actor_member.status = 'active'
        and target_member.user_id = p_profile_id
    )
    or exists (
      select 1
      from public.organisation_users actor_member
      join public.organisation_users target_member
        on target_member.organisation_id = actor_member.organisation_id
       and target_member.status = 'active'
      where actor_member.user_id = auth.uid()
        and actor_member.status = 'active'
        and target_member.user_id = p_profile_id
    );
$$;

revoke all on function public.bridge_can_view_profile(uuid) from public, anon;
grant execute on function public.bridge_can_view_profile(uuid) to authenticated;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_authenticated_scope on public.profiles;
create policy profiles_select_authenticated_scope
on public.profiles
for select
to authenticated
using (public.bridge_can_view_profile(id));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.bridge_attorney_can_manage_transaction(p_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and coalesce(assignment.assignment_status, assignment.status, 'active') = 'active'
      and coalesce(assignment.can_manage_signing, true)
      and (
        assignment.attorney_user_id = auth.uid()
        or assignment.primary_attorney_id = auth.uid()
        or assignment.secretary_id = auth.uid()
        or assignment.admin_handler_id = auth.uid()
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.firm_id = coalesce(assignment.attorney_firm_id, assignment.firm_id)
            and member.user_id = auth.uid()
            and member.status = 'active'
            and member.role in (
              'firm_admin',
              'director_partner',
              'transfer_attorney',
              'bond_attorney',
              'conveyancing_secretary',
              'reception_scheduling'
            )
        )
      )
  );
$$;

revoke all on function public.bridge_attorney_can_manage_transaction(uuid) from public, anon;
grant execute on function public.bridge_attorney_can_manage_transaction(uuid) to authenticated;

create or replace function public.bridge_can_access_appointment(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.appointments appointment
    where appointment.appointment_id = p_appointment_id
      and (
        appointment.created_by = auth.uid()
        or appointment.agent_id = auth.uid()
        or public.bridge_is_org_admin(appointment.organisation_id)
        or public.bridge_attorney_can_manage_transaction(appointment.transaction_id)
        or exists (
          select 1
          from public.appointment_participants participant
          where participant.appointment_id = appointment.appointment_id
            and participant.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.bridge_can_access_appointment(uuid) from public, anon;
grant execute on function public.bridge_can_access_appointment(uuid) to authenticated;

grant select, insert, update, delete on table public.appointments to authenticated;
grant select, insert, update, delete on table public.appointment_participants to authenticated;

drop policy if exists appointments_attorney_select on public.appointments;
create policy appointments_attorney_select
on public.appointments
for select
to authenticated
using (public.bridge_attorney_can_manage_transaction(transaction_id));

drop policy if exists appointments_attorney_insert on public.appointments;
create policy appointments_attorney_insert
on public.appointments
for insert
to authenticated
with check (public.bridge_attorney_can_manage_transaction(transaction_id));

drop policy if exists appointments_attorney_update on public.appointments;
create policy appointments_attorney_update
on public.appointments
for update
to authenticated
using (public.bridge_attorney_can_manage_transaction(transaction_id))
with check (public.bridge_attorney_can_manage_transaction(transaction_id));

drop policy if exists appointments_attorney_delete on public.appointments;
create policy appointments_attorney_delete
on public.appointments
for delete
to authenticated
using (public.bridge_attorney_can_manage_transaction(transaction_id));

drop policy if exists appointment_participants_attorney_select on public.appointment_participants;
create policy appointment_participants_attorney_select
on public.appointment_participants
for select
to authenticated
using (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_participants_attorney_insert on public.appointment_participants;
create policy appointment_participants_attorney_insert
on public.appointment_participants
for insert
to authenticated
with check (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_participants_attorney_update on public.appointment_participants;
create policy appointment_participants_attorney_update
on public.appointment_participants
for update
to authenticated
using (public.bridge_can_access_appointment(appointment_id))
with check (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_participants_attorney_delete on public.appointment_participants;
create policy appointment_participants_attorney_delete
on public.appointment_participants
for delete
to authenticated
using (public.bridge_can_access_appointment(appointment_id));

create table if not exists public.appointment_notification_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  event_type text not null default 'appointment_updated',
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_role text,
  recipient_email text,
  visibility text not null default 'shared_role_players',
  title text not null default 'Appointment update',
  message text,
  email_status text not null default 'pending',
  in_app_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointment_notification_events
  add column if not exists appointment_id uuid references public.appointments(appointment_id) on delete cascade,
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists event_type text not null default 'appointment_updated',
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_role text,
  add column if not exists recipient_email text,
  add column if not exists visibility text not null default 'shared_role_players',
  add column if not exists title text not null default 'Appointment update',
  add column if not exists message text,
  add column if not exists email_status text not null default 'pending',
  add column if not exists in_app_status text not null default 'pending',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.appointment_notification_events
  drop constraint if exists appointment_notification_events_visibility_check;
alter table public.appointment_notification_events
  add constraint appointment_notification_events_visibility_check
  check (visibility in ('client_visible', 'internal_only', 'shared_role_players'));

alter table public.appointment_notification_events
  drop constraint if exists appointment_notification_events_email_status_check;
alter table public.appointment_notification_events
  add constraint appointment_notification_events_email_status_check
  check (email_status in ('pending', 'sent', 'failed', 'skipped', 'cancelled'));

alter table public.appointment_notification_events
  drop constraint if exists appointment_notification_events_in_app_status_check;
alter table public.appointment_notification_events
  add constraint appointment_notification_events_in_app_status_check
  check (in_app_status in ('pending', 'sent', 'failed', 'skipped', 'cancelled'));

create index if not exists appointment_notification_events_appointment_idx
  on public.appointment_notification_events (appointment_id);
create index if not exists appointment_notification_events_transaction_idx
  on public.appointment_notification_events (transaction_id);
create index if not exists appointment_notification_events_recipient_idx
  on public.appointment_notification_events (recipient_id, created_at desc);
create unique index if not exists appointment_notification_events_dedupe_idx
  on public.appointment_notification_events (dedupe_key)
  where dedupe_key is not null;

alter table public.appointment_notification_events enable row level security;
grant select, insert, update, delete on table public.appointment_notification_events to authenticated;
grant all on table public.appointment_notification_events to service_role;

drop policy if exists appointment_notification_events_select_scoped on public.appointment_notification_events;
create policy appointment_notification_events_select_scoped
on public.appointment_notification_events
for select
to authenticated
using (
  recipient_id = auth.uid()
  or public.bridge_can_access_appointment(appointment_id)
);

drop policy if exists appointment_notification_events_insert_scoped on public.appointment_notification_events;
create policy appointment_notification_events_insert_scoped
on public.appointment_notification_events
for insert
to authenticated
with check (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_notification_events_update_scoped on public.appointment_notification_events;
create policy appointment_notification_events_update_scoped
on public.appointment_notification_events
for update
to authenticated
using (public.bridge_can_access_appointment(appointment_id))
with check (public.bridge_can_access_appointment(appointment_id));

create table if not exists public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_role text,
  recipient_email text,
  recipient_phone text,
  reminder_type text not null default 'appointment_reminder_due',
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointment_reminders
  add column if not exists appointment_id uuid references public.appointments(appointment_id) on delete cascade,
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_role text,
  add column if not exists recipient_email text,
  add column if not exists recipient_phone text,
  add column if not exists reminder_type text not null default 'appointment_reminder_due',
  add column if not exists scheduled_for timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists sent_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.appointment_reminders
set scheduled_for = now()
where scheduled_for is null;

alter table public.appointment_reminders
  alter column scheduled_for set not null;

alter table public.appointment_reminders
  drop constraint if exists appointment_reminders_status_check;
alter table public.appointment_reminders
  add constraint appointment_reminders_status_check
  check (status in ('pending', 'sent', 'failed', 'cancelled'));

create index if not exists appointment_reminders_appointment_idx
  on public.appointment_reminders (appointment_id, scheduled_for);
create index if not exists appointment_reminders_status_idx
  on public.appointment_reminders (status, scheduled_for);
create unique index if not exists appointment_reminders_dedupe_idx
  on public.appointment_reminders (
    appointment_id,
    recipient_role,
    coalesce(recipient_email, ''),
    reminder_type,
    scheduled_for
  );

alter table public.appointment_reminders enable row level security;
grant select, insert, update, delete on table public.appointment_reminders to authenticated;
grant all on table public.appointment_reminders to service_role;

drop policy if exists appointment_reminders_select_scoped on public.appointment_reminders;
create policy appointment_reminders_select_scoped
on public.appointment_reminders
for select
to authenticated
using (
  recipient_id = auth.uid()
  or public.bridge_can_access_appointment(appointment_id)
);

drop policy if exists appointment_reminders_insert_scoped on public.appointment_reminders;
create policy appointment_reminders_insert_scoped
on public.appointment_reminders
for insert
to authenticated
with check (public.bridge_can_access_appointment(appointment_id));

drop policy if exists appointment_reminders_update_scoped on public.appointment_reminders;
create policy appointment_reminders_update_scoped
on public.appointment_reminders
for update
to authenticated
using (public.bridge_can_access_appointment(appointment_id))
with check (public.bridge_can_access_appointment(appointment_id));

notify pgrst, 'reload schema';

commit;
