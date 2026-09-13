-- These functions are service-only. The website-domain Edge Function verifies
-- the authenticated organisation administrator before calling them.
create or replace function public.website_activate_verified_domain(
  p_website_site_id uuid,
  p_domain_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_domain public.website_domains%rowtype;
begin
  select domain.* into strict v_domain
  from public.website_domains domain
  where domain.id = p_domain_id
    and domain.website_site_id = p_website_site_id
    and domain.domain_kind = 'custom'
    and domain.status = 'verified'
  for update;

  update public.website_domains
  set is_primary = false
  where website_site_id = p_website_site_id and is_primary;

  update public.website_domains
  set status = 'active', is_primary = true
  where id = v_domain.id
  returning * into v_domain;

  return pg_catalog.jsonb_build_object('id', v_domain.id, 'hostname', v_domain.hostname, 'status', v_domain.status, 'isPrimary', v_domain.is_primary);
end;
$$;

create or replace function public.website_remove_unconnected_domain(
  p_website_site_id uuid,
  p_domain_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.website_domains domain
  where domain.id = p_domain_id
    and domain.website_site_id = p_website_site_id
    and domain.domain_kind = 'custom'
    and domain.is_primary is false
    and domain.status in ('pending', 'failed', 'disabled');
  if not found then
    raise exception 'Only an unconnected custom domain can be removed.' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.website_activate_verified_domain(uuid, uuid) from public, anon, authenticated;
revoke all on function public.website_remove_unconnected_domain(uuid, uuid) from public, anon, authenticated;
grant execute on function public.website_activate_verified_domain(uuid, uuid) to service_role;
grant execute on function public.website_remove_unconnected_domain(uuid, uuid) to service_role;
