begin;

alter table public.website_pages drop constraint if exists website_pages_page_kind_check;
alter table public.website_pages add constraint website_pages_page_kind_check
  check (page_kind in ('home', 'about', 'contact', 'valuation', 'campaign', 'blog'));

create or replace function public.website_save_draft_blog(
  p_website_site_id uuid, p_revision_id uuid, p_page_id uuid,
  p_slug text, p_title text, p_seo_title text, p_seo_description text,
  p_social_image_url text, p_content_blocks jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_site public.website_sites%rowtype; v_page public.website_pages%rowtype; v_slug text := lower(trim(coalesce(p_slug, ''))); v_title text := left(trim(coalesce(p_title, '')), 160);
begin
  if auth.uid() is null then raise exception 'Authentication is required to edit blog articles.' using errcode = '42501'; end if;
  select * into v_site from public.website_sites where id = p_website_site_id;
  if not found then raise exception 'Website site not found.' using errcode = 'P0002'; end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then raise exception 'Only organisation administrators can edit blog articles.' using errcode = '42501'; end if;
  if not exists (select 1 from public.website_site_revisions where id = p_revision_id and website_site_id = v_site.id and status = 'draft') then raise exception 'An editable website draft was not found.' using errcode = 'P0002'; end if;
  if v_title = '' or v_slug = '' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug) > 80 then raise exception 'Article title and URL must use lowercase words and hyphens.' using errcode = '22023'; end if;
  perform public.website_validate_page_content('about', p_content_blocks);
  if p_page_id is null then
    insert into public.website_pages (website_site_id, revision_id, page_kind, slug, title, seo_title, seo_description, social_image_url, content_blocks)
    values (v_site.id, p_revision_id, 'blog', v_slug, v_title, nullif(trim(coalesce(p_seo_title,'')),''), nullif(trim(coalesce(p_seo_description,'')),''), nullif(trim(coalesce(p_social_image_url,'')),''), p_content_blocks) returning * into v_page;
  else
    update public.website_pages set slug=v_slug, title=v_title, seo_title=nullif(trim(coalesce(p_seo_title,'')),''), seo_description=nullif(trim(coalesce(p_seo_description,'')),''), social_image_url=nullif(trim(coalesce(p_social_image_url,'')),''), content_blocks=p_content_blocks, updated_at=now()
    where id=p_page_id and website_site_id=v_site.id and revision_id=p_revision_id and page_kind='blog' returning * into v_page;
    if not found then raise exception 'An editable blog article was not found.' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', v_page.id, 'slug', v_page.slug, 'pageKind', v_page.page_kind, 'title', v_page.title, 'updatedAt', v_page.updated_at);
exception when unique_violation then raise exception 'That article URL is already in use in this draft.' using errcode = '23505'; end;
$$;
revoke all on function public.website_save_draft_blog(uuid,uuid,uuid,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.website_save_draft_blog(uuid,uuid,uuid,text,text,text,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
