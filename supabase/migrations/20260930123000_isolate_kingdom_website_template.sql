begin;

alter table public.website_sites
  drop constraint if exists website_sites_template_key_check;

alter table public.website_sites
  add constraint website_sites_template_key_check
  check (template_key in ('property-standard-v1', 'home-seekers-v1', 'kingdom-v1'));

-- Kingdom's published site was initially assigned the Home Seekers template.
-- Give this one site its own design identity without changing its content,
-- hostname, published revision, organisation, or lead destination.
do $$
declare
  v_site public.website_sites%rowtype;
begin
  select * into v_site
  from public.website_sites
  where id = '0160e45a-2268-4875-91d7-275c43f574d0'
  for update;

  if found then
    if v_site.organisation_id <> '13c6b79f-1d8b-4886-aabf-42ea49565ef5' then
      raise exception 'Kingdom website organisation mismatch.';
    end if;
    if v_site.template_key not in ('home-seekers-v1', 'kingdom-v1') then
      raise exception 'Kingdom website template changed unexpectedly.';
    end if;
    update public.website_sites
    set template_key = 'kingdom-v1', updated_at = now()
    where id = v_site.id and template_key <> 'kingdom-v1';
  end if;
end;
$$;

-- New Kingdom sites may use this template; another agency cannot select it
-- through the authenticated draft-template API.
create or replace function public.website_set_draft_template(
  p_website_site_id uuid,
  p_template_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_template_key text := lower(trim(coalesce(p_template_key, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication is required to select a website template.' using errcode = '42501';
  end if;
  if v_template_key not in ('property-standard-v1', 'home-seekers-v1', 'kingdom-v1') then
    raise exception 'Unsupported website template.' using errcode = '22023';
  end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can select a website template.' using errcode = '42501';
  end if;
  if v_template_key = 'kingdom-v1' and v_site.organisation_id <> '13c6b79f-1d8b-4886-aabf-42ea49565ef5' then
    raise exception 'This website template is reserved for Kingdom.' using errcode = '42501';
  end if;
  if v_site.status <> 'draft' or v_site.published_revision_id is not null then
    raise exception 'A template can only be changed before the first website publication.' using errcode = '23514';
  end if;
  update public.website_sites set template_key = v_template_key, updated_at = now() where id = v_site.id;
  return v_template_key;
end;
$$;

revoke all on function public.website_set_draft_template(uuid, text) from public, anon;
grant execute on function public.website_set_draft_template(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
