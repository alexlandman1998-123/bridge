-- Phase 5: Smart rescheduling + coordination workflow foundation

alter table if exists public.appointments drop constraint if exists appointments_status_check;
alter table if exists public.appointments
  add constraint appointments_status_check
  check (status in ('Draft', 'Pending Confirmation', 'Proposed', 'Confirmed', 'Completed', 'Cancelled', 'Declined', 'Needs Reschedule', 'Reschedule Requested'));

do $$
begin
  if to_regclass('public.appointments') is null then
    raise notice 'Skipping appointment_reschedule_requests table because public.appointments does not exist yet.';
    return;
  end if;

  execute $create_table$
    create table if not exists public.appointment_reschedule_requests (
      id uuid primary key default gen_random_uuid(),
      appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
      requested_by uuid references public.profiles(id) on delete set null,
      requested_by_role text,
      reason text,
      preferred_start timestamptz,
      preferred_end timestamptz,
      status text not null default 'pending',
      reviewed_by uuid references public.profiles(id) on delete set null,
      reviewed_at timestamptz,
      suggested_slots jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $create_table$;
end;
$$;

alter table if exists public.appointment_reschedule_requests drop constraint if exists appointment_reschedule_requests_status_check;
alter table if exists public.appointment_reschedule_requests
  add constraint appointment_reschedule_requests_status_check
  check (status in ('pending', 'proposed', 'accepted', 'rejected', 'cancelled', 'completed'));

do $$
begin
  if to_regclass('public.appointment_reschedule_requests') is null then
    raise notice 'Skipping appointment_reschedule_requests indexes because table does not exist yet.';
    return;
  end if;

  execute 'create index if not exists appointment_reschedule_requests_appointment_idx on public.appointment_reschedule_requests (appointment_id)';
  execute 'create index if not exists appointment_reschedule_requests_status_idx on public.appointment_reschedule_requests (status)';
  execute 'create index if not exists appointment_reschedule_requests_created_idx on public.appointment_reschedule_requests (created_at desc)';
end;
$$;
