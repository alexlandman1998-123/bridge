begin;

do $$
declare
  v_site_id constant uuid := '357961db-9af1-4c9c-aedd-812b829d2a4f'::uuid;
  v_hostname constant text := 'lwp.preview.arch9.co.za';
begin
  if not exists (
    select 1 from public.website_domains
    where website_site_id = v_site_id
      and hostname = v_hostname
      and domain_kind = 'preview'
      and status = 'active'
  ) then
    raise exception 'The active LWP public preview hostname was not found.';
  end if;

  update public.website_domains
  set is_primary = false, updated_at = now()
  where website_site_id = v_site_id and is_primary;

  update public.website_domains
  set is_primary = true, updated_at = now()
  where website_site_id = v_site_id and hostname = v_hostname;

  if not exists (
    select 1 from public.website_domains
    where website_site_id = v_site_id and hostname = v_hostname and is_primary
  ) then
    raise exception 'The LWP public preview hostname could not be made primary.';
  end if;
end;
$$;

commit;
