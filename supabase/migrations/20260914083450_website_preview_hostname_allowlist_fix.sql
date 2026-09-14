begin;

-- Arch9-managed wildcard previews resolve through Vercel but are not Vercel
-- hostnames themselves. Permit only this owned namespace alongside the
-- existing staging preview namespaces; client domains remain excluded.
create or replace function public.website_bind_pilot_hostname(
  p_organisation_id uuid,
  p_hostname text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hostname text := lower(trim(coalesce(p_hostname, '')));
  v_site_id uuid;
  v_existing public.website_domains%rowtype;
begin
  if v_hostname !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or not (
      v_hostname like '%.vercel.app'
      or v_hostname like '%.sites.propdata.co.za'
      or v_hostname like '%.preview.arch9.co.za'
    ) then
    raise exception 'Pilot preview hostnames must use the Arch9, Vercel, or managed PropData preview namespace.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.website_pilot_enrolments enrolment
    where enrolment.organisation_id = p_organisation_id
      and enrolment.status = 'active'
  ) then
    raise exception 'Activate this organisation in the Phase 7 pilot before binding a hostname.' using errcode = '42501';
  end if;

  select site.id into v_site_id
  from public.website_sites site
  where site.organisation_id = p_organisation_id;
  if v_site_id is null then
    raise exception 'Create the pilot website before binding its staging hostname.' using errcode = 'P0002';
  end if;

  select domain.* into v_existing
  from public.website_domains domain
  where pg_catalog.lower(domain.hostname) = v_hostname
  for update;
  if v_existing.id is not null and v_existing.website_site_id <> v_site_id then
    raise exception 'That hostname is already assigned to another website.' using errcode = '23505';
  end if;

  if v_existing.id is null then
    insert into public.website_domains (
      website_site_id, hostname, domain_kind, status, is_primary, dns_instructions
    ) values (
      v_site_id, v_hostname, 'preview', 'active', false,
      pg_catalog.jsonb_build_object(
        'managedBy', 'Arch9',
        'environment', 'staging',
        'clientDnsRequired', false,
        'emailDnsRequired', false
      )
    ) returning * into v_existing;
  else
    update public.website_domains domain
    set domain_kind = 'preview',
        status = 'active',
        is_primary = false,
        dns_instructions = pg_catalog.jsonb_build_object(
          'managedBy', 'Arch9',
          'environment', 'staging',
          'clientDnsRequired', false,
          'emailDnsRequired', false
        )
    where domain.id = v_existing.id
    returning * into v_existing;
  end if;

  return pg_catalog.jsonb_build_object(
    'websiteSiteId', v_site_id,
    'hostname', v_existing.hostname,
    'status', v_existing.status,
    'domainKind', v_existing.domain_kind
  );
end;
$$;

revoke all on function public.website_bind_pilot_hostname(uuid, text) from public, anon, authenticated;
grant execute on function public.website_bind_pilot_hostname(uuid, text) to service_role;

comment on function public.website_bind_pilot_hostname(uuid, text) is
  'Binds only a managed Arch9, Vercel, or PropData staging hostname. It cannot alter client DNS or email records.';

commit;
