begin;

alter table public.website_blog_posts
  add column if not exists content_blocks jsonb not null default '[]'::jsonb,
  add constraint website_blog_posts_content_blocks_array_check check (jsonb_typeof(content_blocks) = 'array');

update public.website_blog_posts
set content_blocks = case
  when trim(body) = '' then '[]'::jsonb
  else jsonb_build_array(jsonb_build_object('id', 'legacy-body', 'type', 'paragraph', 'text', body, 'order', 0))
end
where content_blocks = '[]'::jsonb;

create or replace function public.website_save_draft_blog_post(
  p_website_site_id uuid, p_revision_id uuid, p_post_id uuid,
  p_title text, p_slug text, p_summary text, p_cover_image_url text, p_cover_image_alt text,
  p_body text, p_content_blocks jsonb, p_author_name text, p_seo_title text, p_seo_description text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_site public.website_sites%rowtype; v_post public.website_blog_posts%rowtype;
  v_slug text := lower(trim(coalesce(p_slug, ''))); v_title text := left(trim(coalesce(p_title, '')), 160);
  v_cover_url text := nullif(trim(coalesce(p_cover_image_url, '')), ''); v_cover_alt text := nullif(trim(coalesce(p_cover_image_alt, '')), '');
  v_block jsonb; v_index integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication is required to edit a website article.' using errcode = '42501'; end if;
  select site.* into v_site from public.website_sites site where site.id = p_website_site_id;
  if not found or not public.bridge_is_org_admin(v_site.organisation_id) then raise exception 'Only organisation administrators can edit website articles.' using errcode = '42501'; end if;
  if not exists (select 1 from public.website_site_revisions revision where revision.id = p_revision_id and revision.website_site_id = v_site.id and revision.status = 'draft') then raise exception 'Create an editable website draft before saving an article.' using errcode = 'P0002'; end if;
  if v_title = '' or v_slug = '' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) > 80 then raise exception 'Article title and URL must use lowercase words and hyphens.' using errcode = '22023'; end if;
  if p_content_blocks is null or jsonb_typeof(p_content_blocks) <> 'array' then raise exception 'Article content must be structured blocks.' using errcode = '22023'; end if;
  for v_block in select value from jsonb_array_elements(p_content_blocks) loop
    if coalesce(v_block->>'id', '') = '' or coalesce(v_block->>'type', '') not in ('paragraph','heading_2','heading_3','bullet_list','numbered_list','quote','divider') then raise exception 'Article content contains an unsupported block.' using errcode = '22023'; end if;
    if v_block->>'type' <> 'divider' and char_length(coalesce(v_block->>'text', '')) > 10000 then raise exception 'An article block is too long.' using errcode = '22023'; end if;
    v_index := v_index + 1;
  end loop;
  if v_index > 200 then raise exception 'An article can contain at most 200 blocks.' using errcode = '22023'; end if;
  if v_cover_url is not null and (v_cover_url !~* '^https://[^[:space:]]+$' or v_cover_alt is null) then raise exception 'Add a secure cover image URL and alt text.' using errcode = '22023'; end if;
  if p_post_id is null then
    insert into public.website_blog_posts (organisation_id,website_site_id,revision_id,title,slug,summary,cover_image_url,cover_image_alt,body,content_blocks,author_name,status,published_at,seo_title,seo_description,created_by,updated_by)
    values (v_site.organisation_id,v_site.id,p_revision_id,v_title,v_slug,left(coalesce(p_summary,''),600),v_cover_url,v_cover_alt,left(coalesce(p_body,''),50000),p_content_blocks,left(coalesce(p_author_name,''),160),'draft',null,nullif(left(trim(coalesce(p_seo_title,'')),180),''),nullif(left(trim(coalesce(p_seo_description,'')),320),''),v_user_id,v_user_id) returning * into v_post;
  else
    update public.website_blog_posts post set title=v_title,slug=v_slug,summary=left(coalesce(p_summary,''),600),cover_image_url=v_cover_url,cover_image_alt=v_cover_alt,body=left(coalesce(p_body,''),50000),content_blocks=p_content_blocks,author_name=left(coalesce(p_author_name,''),160),status='draft',published_at=null,seo_title=nullif(left(trim(coalesce(p_seo_title,'')),180),''),seo_description=nullif(left(trim(coalesce(p_seo_description,'')),320),''),updated_by=v_user_id,updated_at=now() where post.id=p_post_id and post.website_site_id=v_site.id and post.revision_id=p_revision_id returning * into v_post;
    if not found then raise exception 'An editable article was not found in this website draft.' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id',v_post.id,'revisionId',v_post.revision_id,'title',v_post.title,'slug',v_post.slug,'status',v_post.status,'updatedAt',v_post.updated_at);
exception when unique_violation then raise exception 'That article URL is already in use in this website draft.' using errcode = '23505';
end;
$$;

revoke all on function public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text) from public, anon;
grant execute on function public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
