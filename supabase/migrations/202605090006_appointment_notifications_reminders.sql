create table if not exists public.appointment_notification_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  event_type text not null,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_role text,
  recipient_email text,
  visibility text not null default 'shared_role_players',
  title text not null,
  message text,
  email_status text not null default 'pending',
  in_app_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.appointment_notification_events add column if not exists appointment_id uuid references public.appointments(appointment_id) on delete cascade;
alter table if exists public.appointment_notification_events add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
alter table if exists public.appointment_notification_events add column if not exists event_type text not null default 'appointment_updated';
alter table if exists public.appointment_notification_events add column if not exists recipient_id uuid references public.profiles(id) on delete set null;
alter table if exists public.appointment_notification_events add column if not exists recipient_role text;
alter table if exists public.appointment_notification_events add column if not exists recipient_email text;
alter table if exists public.appointment_notification_events add column if not exists visibility text not null default 'shared_role_players';
alter table if exists public.appointment_notification_events add column if not exists title text not null default 'Appointment update';
alter table if exists public.appointment_notification_events add column if not exists message text;
alter table if exists public.appointment_notification_events add column if not exists email_status text not null default 'pending';
alter table if exists public.appointment_notification_events add column if not exists in_app_status text not null default 'pending';
alter table if exists public.appointment_notification_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.appointment_notification_events add column if not exists dedupe_key text;
alter table if exists public.appointment_notification_events add column if not exists created_at timestamptz not null default now();
alter table if exists public.appointment_notification_events add column if not exists updated_at timestamptz not null default now();

alter table if exists public.appointment_notification_events drop constraint if exists appointment_notification_events_visibility_check;
alter table if exists public.appointment_notification_events
  add constraint appointment_notification_events_visibility_check
  check (visibility in ('client_visible', 'internal_only', 'shared_role_players'));

alter table if exists public.appointment_notification_events drop constraint if exists appointment_notification_events_email_status_check;
alter table if exists public.appointment_notification_events
  add constraint appointment_notification_events_email_status_check
  check (email_status in ('pending', 'sent', 'failed', 'skipped'));

alter table if exists public.appointment_notification_events drop constraint if exists appointment_notification_events_in_app_status_check;
alter table if exists public.appointment_notification_events
  add constraint appointment_notification_events_in_app_status_check
  check (in_app_status in ('pending', 'sent', 'failed', 'skipped'));

create index if not exists appointment_notification_events_appointment_idx on public.appointment_notification_events (appointment_id);
create index if not exists appointment_notification_events_transaction_idx on public.appointment_notification_events (transaction_id);
create index if not exists appointment_notification_events_recipient_idx on public.appointment_notification_events (recipient_id, created_at desc);
create unique index if not exists appointment_notification_events_dedupe_idx
  on public.appointment_notification_events (dedupe_key)
  where dedupe_key is not null;

create table if not exists public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(appointment_id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_role text,
  recipient_email text,
  recipient_phone text,
  reminder_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.appointment_reminders add column if not exists appointment_id uuid references public.appointments(appointment_id) on delete cascade;
alter table if exists public.appointment_reminders add column if not exists recipient_id uuid references public.profiles(id) on delete set null;
alter table if exists public.appointment_reminders add column if not exists recipient_role text;
alter table if exists public.appointment_reminders add column if not exists recipient_email text;
alter table if exists public.appointment_reminders add column if not exists recipient_phone text;
alter table if exists public.appointment_reminders add column if not exists reminder_type text not null default 'appointment_reminder_due';
alter table if exists public.appointment_reminders add column if not exists scheduled_for timestamptz;
alter table if exists public.appointment_reminders add column if not exists status text not null default 'pending';
alter table if exists public.appointment_reminders add column if not exists sent_at timestamptz;
alter table if exists public.appointment_reminders add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.appointment_reminders add column if not exists created_at timestamptz not null default now();
alter table if exists public.appointment_reminders add column if not exists updated_at timestamptz not null default now();

update public.appointment_reminders
set scheduled_for = now()
where scheduled_for is null;

alter table if exists public.appointment_reminders alter column scheduled_for set not null;

alter table if exists public.appointment_reminders drop constraint if exists appointment_reminders_status_check;
alter table if exists public.appointment_reminders
  add constraint appointment_reminders_status_check
  check (status in ('pending', 'sent', 'failed', 'cancelled'));

create index if not exists appointment_reminders_appointment_idx on public.appointment_reminders (appointment_id, scheduled_for);
create index if not exists appointment_reminders_status_idx on public.appointment_reminders (status, scheduled_for);
create unique index if not exists appointment_reminders_dedupe_idx
  on public.appointment_reminders (appointment_id, recipient_role, coalesce(recipient_email, ''), reminder_type, scheduled_for);
