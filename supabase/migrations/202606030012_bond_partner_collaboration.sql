create table if not exists public.bond_partner_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  partner_id uuid,
  application_id uuid,
  region_id uuid,
  branch_id uuid,
  owner_consultant_id uuid,
  request_type text not null,
  category text,
  priority text not null default 'normal',
  status text not null default 'new',
  title text not null,
  message text,
  source_key text,
  source_id text,
  document_id uuid,
  support_ticket_id uuid,
  assigned_at timestamptz,
  due_at timestamptz,
  resolved_at timestamptz,
  escalated boolean not null default false,
  escalation_reason text,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bond_partner_requests_type_check check (request_type in ('comment', 'document_review', 'support_ticket', 'escalation')),
  constraint bond_partner_requests_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint bond_partner_requests_status_check check (status in ('new', 'assigned', 'in_progress', 'waiting_on_partner', 'resolved', 'closed'))
);

create unique index if not exists bond_partner_requests_source_key_idx
  on public.bond_partner_requests (organisation_id, source_key)
  where source_key is not null and source_key <> '';

create index if not exists bond_partner_requests_owner_idx
  on public.bond_partner_requests (organisation_id, owner_consultant_id, status, due_at);

create index if not exists bond_partner_requests_branch_idx
  on public.bond_partner_requests (organisation_id, branch_id, status, due_at);

create index if not exists bond_partner_requests_region_idx
  on public.bond_partner_requests (organisation_id, region_id, status, due_at);

create table if not exists public.bond_partner_request_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  request_id uuid not null references public.bond_partner_requests(id) on delete cascade,
  application_id uuid,
  partner_id uuid,
  actor_user_id uuid,
  actor_name text,
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  visible_to_partner boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_internal_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  request_id uuid not null references public.bond_partner_requests(id) on delete cascade,
  application_id uuid,
  partner_id uuid,
  actor_user_id uuid,
  actor_name text,
  note text not null,
  visible_to_partner boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_request_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  request_id uuid references public.bond_partner_requests(id) on delete cascade,
  partner_id uuid,
  application_id uuid,
  event_type text not null,
  actor_user_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_request_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  request_id uuid references public.bond_partner_requests(id) on delete cascade,
  recipient_user_id uuid,
  recipient_role text,
  type text not null,
  title text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bond_partner_requests enable row level security;
alter table public.bond_partner_request_messages enable row level security;
alter table public.bond_partner_internal_notes enable row level security;
alter table public.bond_partner_request_activity enable row level security;
alter table public.bond_partner_request_notifications enable row level security;

drop policy if exists "bond_partner_requests_member_select" on public.bond_partner_requests;
create policy "bond_partner_requests_member_select"
  on public.bond_partner_requests for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_requests_member_modify" on public.bond_partner_requests;
create policy "bond_partner_requests_member_modify"
  on public.bond_partner_requests for all
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_request_messages_member_select" on public.bond_partner_request_messages;
create policy "bond_partner_request_messages_member_select"
  on public.bond_partner_request_messages for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_request_messages_member_modify" on public.bond_partner_request_messages;
create policy "bond_partner_request_messages_member_modify"
  on public.bond_partner_request_messages for all
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_internal_notes_member_select" on public.bond_partner_internal_notes;
create policy "bond_partner_internal_notes_member_select"
  on public.bond_partner_internal_notes for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_internal_notes_member_modify" on public.bond_partner_internal_notes;
create policy "bond_partner_internal_notes_member_modify"
  on public.bond_partner_internal_notes for all
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_request_activity_member_select" on public.bond_partner_request_activity;
create policy "bond_partner_request_activity_member_select"
  on public.bond_partner_request_activity for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_request_activity_member_modify" on public.bond_partner_request_activity;
create policy "bond_partner_request_activity_member_modify"
  on public.bond_partner_request_activity for all
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_request_notifications_member_select" on public.bond_partner_request_notifications;
create policy "bond_partner_request_notifications_member_select"
  on public.bond_partner_request_notifications for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_request_notifications_member_modify" on public.bond_partner_request_notifications;
create policy "bond_partner_request_notifications_member_modify"
  on public.bond_partner_request_notifications for all
  using (public.bridge_is_active_member(organisation_id))
  with check (public.bridge_is_active_member(organisation_id));
