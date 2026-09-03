-- An organisation suspension is a workspace-wide lock. It preserves all
-- records while preventing member-scoped RLS policies from treating the
-- membership as operationally active. Public development landing pages do not
-- use this helper and remain available.
create or replace function public.bridge_has_organisation_membership(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    join public.organisations organisation on organisation.id = ou.organisation_id
    where ou.organisation_id = target_organisation_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and coalesce(lower(organisation.status), 'active') not in ('suspended', 'locked')
  )
$$;

notify pgrst, 'reload schema';
