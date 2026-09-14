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
    where lower(domain.hostname) = 'kingdomrealestate.co.za'
      and domain.website_site_id <> '0160e45a-2268-4875-91d7-275c43f574d0'::uuid
  ) then
    raise exception 'The Kingdom root hostname is already assigned to another website.';
  end if;
end;
$$;

insert into public.website_domains (
  website_site_id, hostname, domain_kind, status, is_primary, dns_instructions, verified_at
)
values (
  '0160e45a-2268-4875-91d7-275c43f574d0'::uuid,
  'kingdomrealestate.co.za',
  'custom',
  'active',
  false,
  jsonb_build_object('provider', 'vercel', 'managedBy', 'Arch9', 'emailDnsChangesAllowed', false, 'nameserverChangesAllowed', false),
  now()
)
on conflict (lower(hostname)) do update
set domain_kind = 'custom',
    status = 'active',
    dns_instructions = excluded.dns_instructions,
    verified_at = coalesce(public.website_domains.verified_at, excluded.verified_at),
    updated_at = now()
where public.website_domains.website_site_id = '0160e45a-2268-4875-91d7-275c43f574d0'::uuid;

commit;
