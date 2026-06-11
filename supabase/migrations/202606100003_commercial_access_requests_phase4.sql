begin;

create table if not exists public.commercial_access_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_membership_id uuid references public.organisation_users(id) on delete set null,
  requester_email text not null,
  requester_name text,
  module_key text not null default 'commercial',
  status text not null default 'pending',
  request_message text,
  principal_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_access_requests_module_key_check check (module_key in ('commercial')),
  constraint commercial_access_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index if not exists commercial_access_requests_org_status_idx
  on public.commercial_access_requests (organisation_id, status, created_at desc);

create index if not exists commercial_access_requests_requester_status_idx
  on public.commercial_access_requests (requester_user_id, status, created_at desc);

create unique index if not exists commercial_access_requests_one_pending_idx
  on public.commercial_access_requests (organisation_id, requester_user_id, module_key)
  where status = 'pending';

drop trigger if exists trg_commercial_access_requests_updated_at on public.commercial_access_requests;
create trigger trg_commercial_access_requests_updated_at
before update on public.commercial_access_requests
for each row
execute function public.set_updated_at_timestamp();

alter table public.commercial_access_requests enable row level security;

drop policy if exists commercial_access_requests_select_requester_or_admin on public.commercial_access_requests;
create policy commercial_access_requests_select_requester_or_admin
  on public.commercial_access_requests for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or public.bridge_is_org_admin(organisation_id)
  );

drop policy if exists commercial_access_requests_insert_self_member on public.commercial_access_requests;
create policy commercial_access_requests_insert_self_member
  on public.commercial_access_requests for insert
  to authenticated
  with check (
    requester_user_id = auth.uid()
    and lower(requester_email) = public.bridge_current_email()
    and public.bridge_is_active_member(organisation_id)
  );

drop policy if exists commercial_access_requests_update_requester_or_admin on public.commercial_access_requests;
create policy commercial_access_requests_update_requester_or_admin
  on public.commercial_access_requests for update
  to authenticated
  using (
    public.bridge_is_org_admin(organisation_id)
    or (
      requester_user_id = auth.uid()
      and status = 'pending'
    )
  )
  with check (
    public.bridge_is_org_admin(organisation_id)
    or (
      requester_user_id = auth.uid()
      and status = 'cancelled'
    )
  );

grant select, insert, update on public.commercial_access_requests to authenticated;

commit;
