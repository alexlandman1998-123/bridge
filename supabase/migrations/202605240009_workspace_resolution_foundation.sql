begin;
create table if not exists public.user_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id uuid references public.organisations(id) on delete set null,
  active_workspace_source text not null default 'user_selected',
  updated_at timestamptz not null default now(),
  constraint user_workspace_preferences_source_check check (
    active_workspace_source in ('user_selected', 'auth_boot', 'system_recovery')
  )
);
create index if not exists user_workspace_preferences_active_workspace_idx
  on public.user_workspace_preferences(active_workspace_id)
  where active_workspace_id is not null;
drop trigger if exists user_workspace_preferences_set_updated_at on public.user_workspace_preferences;
create trigger user_workspace_preferences_set_updated_at
before update on public.user_workspace_preferences
for each row
execute function public.bridge_set_updated_at();
alter table public.user_workspace_preferences enable row level security;
drop policy if exists user_workspace_preferences_select_self on public.user_workspace_preferences;
create policy user_workspace_preferences_select_self
  on public.user_workspace_preferences
  for select
  to authenticated
  using (user_id = auth.uid());
drop policy if exists user_workspace_preferences_insert_self on public.user_workspace_preferences;
create policy user_workspace_preferences_insert_self
  on public.user_workspace_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());
drop policy if exists user_workspace_preferences_update_self on public.user_workspace_preferences;
create policy user_workspace_preferences_update_self
  on public.user_workspace_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update on public.user_workspace_preferences to authenticated;
commit;
