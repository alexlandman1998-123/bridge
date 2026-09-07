begin;

-- Phase 4: a primary-owner flag is authority, not editable member metadata.
-- Ownership RPCs and atomic onboarding mark their transaction explicitly;
-- every other signed-in direct update is rejected.
create or replace function public.bridge_guard_primary_organisation_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_primary_owner is not distinct from old.is_primary_owner then
    return new;
  end if;

  if auth.uid() is null
    or current_setting('bridge.ownership_transfer', true) = 'on' then
    return new;
  end if;

  raise exception 'Primary owner changes must use the organisation ownership controls.' using errcode = '42501';
end;
$$;

drop trigger if exists a02_bridge_guard_primary_organisation_owner_change on public.organisation_users;
create trigger a02_bridge_guard_primary_organisation_owner_change
before update of is_primary_owner on public.organisation_users
for each row execute function public.bridge_guard_primary_organisation_owner_change();

commit;
