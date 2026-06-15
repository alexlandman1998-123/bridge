begin;
create table if not exists public.signup_intents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  app_role text not null,
  workspace_type text,
  intended_org_role text not null,
  authority_level text not null,
  onboarding_path text not null,
  workspace_action text not null,
  invite_token text,
  status text not null default 'pending_email_verification',
  source text not null default 'public_signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint signup_intents_app_role_check check (app_role in ('agent', 'developer', 'attorney', 'bond_originator', 'client', 'platform_admin')),
  constraint signup_intents_workspace_type_check check (workspace_type is null or workspace_type in ('agency', 'developer_company', 'attorney_firm', 'bond_originator')),
  constraint signup_intents_authority_level_check check (authority_level in ('owner_management', 'branch_management', 'operational', 'external')),
  constraint signup_intents_workspace_action_check check (workspace_action in ('create_workspace', 'join_or_request_workspace', 'accept_invite', 'accept_client_access')),
  constraint signup_intents_status_check check (status in ('pending_email_verification', 'ready_for_onboarding', 'consumed', 'abandoned', 'expired'))
);
create unique index if not exists signup_intents_auth_user_unique_idx
  on public.signup_intents (auth_user_id);
create index if not exists signup_intents_email_status_idx
  on public.signup_intents (lower(email), status);
create index if not exists signup_intents_invite_token_idx
  on public.signup_intents (invite_token)
  where invite_token is not null;
drop trigger if exists trg_signup_intents_updated_at on public.signup_intents;
create trigger trg_signup_intents_updated_at
before update on public.signup_intents
for each row
execute function public.set_updated_at_timestamp();
alter table public.signup_intents enable row level security;
drop policy if exists signup_intents_select_own on public.signup_intents;
create policy signup_intents_select_own on public.signup_intents
for select to authenticated
using (auth.uid() = auth_user_id);
drop policy if exists signup_intents_insert_own on public.signup_intents;
create policy signup_intents_insert_own on public.signup_intents
for insert to authenticated
with check (auth.uid() = auth_user_id);
drop policy if exists signup_intents_update_own on public.signup_intents;
create policy signup_intents_update_own on public.signup_intents
for update to authenticated
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);
grant select, insert, update on public.signup_intents to authenticated;
commit;
