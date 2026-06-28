create table if not exists public.demo_enquiries (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new',
  role text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  company text not null,
  business_size text,
  monthly_volume text,
  role_specific_answers jsonb not null default '{}'::jsonb,
  demo_focus text[] not null default '{}'::text[],
  biggest_frustration text,
  preferred_window text[] not null default '{}'::text[],
  source text not null default 'arch9-book-demo-wizard',
  page_url text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  user_agent text,
  raw_payload jsonb not null default '{}'::jsonb,
  notification_status text not null default 'pending',
  notification_result jsonb not null default '{}'::jsonb,
  notified_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_status_check;

alter table public.demo_enquiries
  add constraint demo_enquiries_status_check
  check (status in ('new', 'contacted', 'scheduled', 'closed', 'spam'));

alter table public.demo_enquiries
  drop constraint if exists demo_enquiries_notification_status_check;

alter table public.demo_enquiries
  add constraint demo_enquiries_notification_status_check
  check (notification_status in ('pending', 'sent', 'skipped', 'failed'));

create index if not exists demo_enquiries_created_at_idx on public.demo_enquiries (created_at desc);
create index if not exists demo_enquiries_status_idx on public.demo_enquiries (status);
create index if not exists demo_enquiries_email_idx on public.demo_enquiries (email);
create index if not exists demo_enquiries_company_idx on public.demo_enquiries (company);

alter table public.demo_enquiries enable row level security;

drop policy if exists demo_enquiries_no_public_access on public.demo_enquiries;
create policy demo_enquiries_no_public_access on public.demo_enquiries
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists demo_enquiries_hq_read on public.demo_enquiries;
create policy demo_enquiries_hq_read on public.demo_enquiries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('founder', 'super_admin', 'platform_admin')
    )
    or exists (
      select 1
      from public.organisation_users ou
      where ou.user_id = auth.uid()
        and ou.status = 'active'
        and (
          ou.role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.workspace_role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.organisation_role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.app_role in ('founder', 'super_admin', 'admin', 'platform_admin')
        )
    )
  );

drop policy if exists demo_enquiries_hq_update on public.demo_enquiries;
create policy demo_enquiries_hq_update on public.demo_enquiries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('founder', 'super_admin', 'platform_admin')
    )
    or exists (
      select 1
      from public.organisation_users ou
      where ou.user_id = auth.uid()
        and ou.status = 'active'
        and (
          ou.role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.workspace_role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.organisation_role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.app_role in ('founder', 'super_admin', 'admin', 'platform_admin')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('founder', 'super_admin', 'platform_admin')
    )
    or exists (
      select 1
      from public.organisation_users ou
      where ou.user_id = auth.uid()
        and ou.status = 'active'
        and (
          ou.role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.workspace_role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.organisation_role in ('founder', 'super_admin', 'admin', 'platform_admin')
          or ou.app_role in ('founder', 'super_admin', 'admin', 'platform_admin')
        )
    )
  );
