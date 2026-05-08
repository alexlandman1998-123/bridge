-- Agency appointments foundation for beta calendar workflow
-- Adds richer appointment fields and participant records.

alter table if exists public.appointments add column if not exists title text;
alter table if exists public.appointments add column if not exists appointment_date date;
alter table if exists public.appointments add column if not exists start_time time;
alter table if exists public.appointments add column if not exists end_time time;
alter table if exists public.appointments add column if not exists contact_id uuid references public.contacts(contact_id) on delete set null;
alter table if exists public.appointments add column if not exists listing_id text;
alter table if exists public.appointments add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
alter table if exists public.appointments add column if not exists outcome_summary text;
alter table if exists public.appointments add column if not exists client_feedback text;
alter table if exists public.appointments add column if not exists agent_notes text;
alter table if exists public.appointments add column if not exists next_step text;
alter table if exists public.appointments add column if not exists follow_up_date date;
alter table if exists public.appointments add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table if exists public.appointments add column if not exists completed_at timestamptz;

alter table if exists public.appointments alter column status set default 'Pending Confirmation';
alter table if exists public.appointments drop constraint if exists appointments_status_check;
alter table if exists public.appointments
  add constraint appointments_status_check
  check (status in ('Draft', 'Pending Confirmation', 'Confirmed', 'Completed', 'Cancelled', 'Needs Reschedule'));

create index if not exists appointments_contact_idx on public.appointments (contact_id);
create index if not exists appointments_transaction_idx on public.appointments (transaction_id);

create table if not exists public.appointment_participants (
  participant_id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  participant_role text not null default 'Other Contact',
  rsvp_status text not null default 'Pending',
  proposed_new_time timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.appointment_participants drop constraint if exists appointment_participants_role_check;
alter table if exists public.appointment_participants
  add constraint appointment_participants_role_check
  check (participant_role in ('Buyer', 'Seller', 'Agent', 'Co-agent', 'Principal', 'Attorney', 'Bond Originator', 'Other Contact'));

alter table if exists public.appointment_participants drop constraint if exists appointment_participants_rsvp_check;
alter table if exists public.appointment_participants
  add constraint appointment_participants_rsvp_check
  check (rsvp_status in ('Pending', 'Accepted', 'Declined', 'Proposed New Time'));

create index if not exists appointment_participants_org_idx on public.appointment_participants (organisation_id);
create index if not exists appointment_participants_appointment_idx on public.appointment_participants (appointment_id);
