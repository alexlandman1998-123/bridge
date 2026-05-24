begin;

alter table if exists public.organisation_users
  add column if not exists permissions_json jsonb not null default '{}'::jsonb,
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz,
  add column if not exists joined_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists last_active_at timestamptz;

create index if not exists organisation_users_invited_by_user_idx
  on public.organisation_users (invited_by_user_id)
  where invited_by_user_id is not null;

create index if not exists organisation_users_last_active_idx
  on public.organisation_users (organisation_id, last_active_at desc)
  where last_active_at is not null;

commit;
