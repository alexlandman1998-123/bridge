create table if not exists public.bond_partner_portal_users (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text,
  role text not null default 'partner_user',
  portal_token text not null unique,
  password_set_at timestamptz,
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bond_partner_portal_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  document_name text not null,
  document_type text,
  storage_path text,
  status text not null default 'received' check (status in ('requested', 'received', 'reviewed', 'approved', 'rejected', 'replaced')),
  uploaded_by uuid references public.bond_partner_portal_users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_portal_document_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  document_name text not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  due_date date,
  status text not null default 'requested' check (status in ('requested', 'uploaded', 'completed', 'unable_to_provide', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bond_partner_portal_comments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  author_user_id uuid,
  author_name text,
  author_role text not null default 'Partner',
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_portal_support_tickets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  ticket_type text not null,
  subject text not null,
  message text,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  created_by uuid references public.bond_partner_portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bond_partner_portal_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid references public.bond_partners(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  event_type text not null check (event_type in (
    'PARTNER_LOGIN',
    'PARTNER_DOCUMENT_UPLOADED',
    'PARTNER_DOCUMENT_DOWNLOADED',
    'PARTNER_COMMENT_ADDED',
    'PARTNER_SUPPORT_CREATED'
  )),
  actor_user_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bond_partner_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.bond_partners(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  notification_type text not null,
  channel text not null default 'portal' check (channel in ('portal', 'email')),
  title text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bond_partner_portal_users_partner_idx on public.bond_partner_portal_users(partner_id);
create index if not exists bond_partner_portal_documents_partner_application_idx on public.bond_partner_portal_documents(partner_id, bond_application_id);
create index if not exists bond_partner_portal_document_requests_partner_application_idx on public.bond_partner_portal_document_requests(partner_id, bond_application_id);
create index if not exists bond_partner_portal_comments_partner_application_idx on public.bond_partner_portal_comments(partner_id, bond_application_id, created_at desc);
create index if not exists bond_partner_portal_support_partner_idx on public.bond_partner_portal_support_tickets(partner_id, created_at desc);
create index if not exists bond_partner_portal_audit_partner_idx on public.bond_partner_portal_audit(partner_id, created_at desc);
create index if not exists bond_partner_portal_notifications_partner_idx on public.bond_partner_portal_notifications(partner_id, created_at desc);

alter table public.bond_partner_portal_users enable row level security;
alter table public.bond_partner_portal_documents enable row level security;
alter table public.bond_partner_portal_document_requests enable row level security;
alter table public.bond_partner_portal_comments enable row level security;
alter table public.bond_partner_portal_support_tickets enable row level security;
alter table public.bond_partner_portal_audit enable row level security;
alter table public.bond_partner_portal_notifications enable row level security;

drop policy if exists "bond_partner_portal_users_member_access" on public.bond_partner_portal_users;
create policy "bond_partner_portal_users_member_access" on public.bond_partner_portal_users
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_portal_documents_member_access" on public.bond_partner_portal_documents;
create policy "bond_partner_portal_documents_member_access" on public.bond_partner_portal_documents
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_portal_document_requests_member_access" on public.bond_partner_portal_document_requests;
create policy "bond_partner_portal_document_requests_member_access" on public.bond_partner_portal_document_requests
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_portal_comments_member_access" on public.bond_partner_portal_comments;
create policy "bond_partner_portal_comments_member_access" on public.bond_partner_portal_comments
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_portal_support_member_access" on public.bond_partner_portal_support_tickets;
create policy "bond_partner_portal_support_member_access" on public.bond_partner_portal_support_tickets
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_portal_audit_member_access" on public.bond_partner_portal_audit;
create policy "bond_partner_portal_audit_member_access" on public.bond_partner_portal_audit
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists "bond_partner_portal_notifications_member_access" on public.bond_partner_portal_notifications;
create policy "bond_partner_portal_notifications_member_access" on public.bond_partner_portal_notifications
for all using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));
