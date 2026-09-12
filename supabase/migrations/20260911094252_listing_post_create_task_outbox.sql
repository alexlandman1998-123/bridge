begin;

create table if not exists public.private_listing_post_create_tasks (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  task_key text not null,
  status text not null default 'pending',
  progress jsonb not null default '{}'::jsonb,
  last_error text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint private_listing_post_create_tasks_status_check
    check (status in ('pending', 'in_progress', 'complete', 'failed')),
  constraint private_listing_post_create_tasks_key_unique unique (private_listing_id, task_key)
);

create index if not exists private_listing_post_create_tasks_queue_idx
  on public.private_listing_post_create_tasks (status, updated_at asc);

create index if not exists private_listing_post_create_tasks_listing_idx
  on public.private_listing_post_create_tasks (private_listing_id, updated_at desc);

alter table public.private_listing_post_create_tasks enable row level security;

revoke all on table public.private_listing_post_create_tasks from anon;
grant select, insert, update on table public.private_listing_post_create_tasks to authenticated;

drop policy if exists private_listing_post_create_tasks_select_member on public.private_listing_post_create_tasks;
create policy private_listing_post_create_tasks_select_member
on public.private_listing_post_create_tasks
for select
to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists private_listing_post_create_tasks_insert_member on public.private_listing_post_create_tasks;
create policy private_listing_post_create_tasks_insert_member
on public.private_listing_post_create_tasks
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and created_by = (select auth.uid())
);

drop policy if exists private_listing_post_create_tasks_update_member on public.private_listing_post_create_tasks;
create policy private_listing_post_create_tasks_update_member
on public.private_listing_post_create_tasks
for update
to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

commit;
