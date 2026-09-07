begin;

alter table public.website_sites
  drop constraint if exists website_sites_template_key_check;

alter table public.website_sites
  add constraint website_sites_template_key_check
  check (template_key in ('property-standard-v1', 'home-seekers-v1'));

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
  if v_template_key not in ('property-standard-v1', 'home-seekers-v1') then
    raise exception 'Unsupported website template.' using errcode = '22023';
  end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id for update;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can select a website template.' using errcode = '42501';
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
comment on function public.website_set_draft_template(uuid, text) is
  'Selects an allowed template before a tenant website has its first published revision.';

notify pgrst, 'reload schema';
commit;
