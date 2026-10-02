-- Promote the existing foundation module to every agency without moving or
-- resetting any Home Seekers results. Retain the legacy storage/helper names
-- so existing clients and row policies remain compatible.
create or replace function public.home_seekers_fic_training_is_enabled(p_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.bridge_is_active_member(p_organisation_id)
    and exists (
      select 1
      from public.organisations organisation
      where organisation.id = p_organisation_id
        and (
          coalesce(organisation.type, 'agency') = 'agency'
          or lower(trim(coalesce(organisation.name, ''))) = 'home seekers'
        )
    );
$$;

revoke execute on function public.home_seekers_fic_training_is_enabled(uuid) from public, anon;
grant execute on function public.home_seekers_fic_training_is_enabled(uuid) to authenticated;

comment on table public.home_seekers_fic_training_results is
  'Agency-scoped FIC foundation training completion and score records. Legacy table name retained to preserve existing results.';
comment on function public.home_seekers_fic_training_is_enabled(uuid) is
  'FIC foundation training is available to active members of every agency; legacy Home Seekers name retained for policy compatibility.';
