begin;

do $$
begin
  if not exists (
    select 1
    from public.website_sites site
    join public.website_pilot_enrolments pilot
      on pilot.organisation_id = site.organisation_id
     and pilot.status = 'active'
    where site.id = '0160e45a-2268-4875-91d7-275c43f574d0'::uuid
      and site.organisation_id = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'::uuid
      and site.status = 'published'
      and site.published_revision_id is not null
  ) then
    raise exception 'Kingdom published website pilot is not eligible for a custom domain.';
  end if;

  if exists (
    select 1
    from public.website_domains domain
    where lower(domain.hostname) in ('kingdomrealestate.co.za', 'www.kingdomrealestate.co.za')
      and domain.website_site_id <> '0160e45a-2268-4875-91d7-275c43f574d0'::uuid
  ) then
    raise exception 'A Kingdom hostname is already assigned to another website.';
  end if;
end;
$$;

insert into public.website_domains (
  website_site_id, hostname, domain_kind, status, is_primary, dns_instructions, verified_at
)
values
  (
    '0160e45a-2268-4875-91d7-275c43f574d0'::uuid,
    'kingdomrealestate.co.za',
    'custom',
    'active',
    true,
    jsonb_build_object('provider', 'vercel', 'managedBy', 'Arch9', 'emailDnsChangesAllowed', false, 'nameserverChangesAllowed', false),
    now()
  ),
  (
    '0160e45a-2268-4875-91d7-275c43f574d0'::uuid,
    'www.kingdomrealestate.co.za',
    'custom',
    'active',
    false,
    jsonb_build_object('provider', 'vercel', 'managedBy', 'Arch9', 'emailDnsChangesAllowed', false, 'nameserverChangesAllowed', false),
    now()
  )
on conflict do nothing;

update public.website_domains
set is_primary = false,
    updated_at = now()
where website_site_id = '0160e45a-2268-4875-91d7-275c43f574d0'::uuid
  and hostname <> 'kingdomrealestate.co.za'
  and is_primary;

update public.website_domains
set domain_kind = 'custom',
    status = 'active',
    is_primary = hostname = 'kingdomrealestate.co.za',
    dns_instructions = jsonb_build_object('provider', 'vercel', 'managedBy', 'Arch9', 'emailDnsChangesAllowed', false, 'nameserverChangesAllowed', false),
    verified_at = coalesce(verified_at, now()),
    updated_at = now()
where website_site_id = '0160e45a-2268-4875-91d7-275c43f574d0'::uuid
  and hostname in ('kingdomrealestate.co.za', 'www.kingdomrealestate.co.za');

commit;
