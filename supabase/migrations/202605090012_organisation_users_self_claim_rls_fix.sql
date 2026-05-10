begin;

-- Allow invited users to safely claim their own org membership row without requiring org-admin rights.
-- This specifically unblocks onboarding bootstrap paths that run membership upserts.

drop policy if exists organisation_users_agency_update on public.organisation_users;
create policy organisation_users_agency_update on public.organisation_users
for update to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or (
    status = 'invited'
    and lower(email) = public.bridge_current_email()
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    auth.uid() is not null
    and user_id = auth.uid()
    and lower(email) = public.bridge_current_email()
    and status = 'active'
  )
);

create or replace function public.bridge_guard_org_user_self_claim_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Org admins keep full control via policy + existing app permissions.
  if public.bridge_is_org_admin(old.organisation_id) then
    return new;
  end if;

  -- For self-claim updates from invited rows, lock down mutable fields.
  if old.status = 'invited' and lower(coalesce(old.email, '')) = public.bridge_current_email() then
    if auth.uid() is null or new.user_id is distinct from auth.uid() then
      raise exception 'Invited membership claim must bind to the signed-in user.';
    end if;

    if lower(coalesce(new.email, '')) <> lower(coalesce(old.email, '')) then
      raise exception 'Invited membership claim cannot change email.';
    end if;

    new.organisation_id := old.organisation_id;
    new.role := old.role;
    new.status := 'active';
    new.accepted_at := coalesce(new.accepted_at, now());
    new.joined_at := coalesce(new.joined_at, now());
    new.updated_at := now();

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bridge_guard_org_user_self_claim_update on public.organisation_users;
create trigger trg_bridge_guard_org_user_self_claim_update
before update on public.organisation_users
for each row
execute function public.bridge_guard_org_user_self_claim_update();

commit;
