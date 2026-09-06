begin;

create or replace function public.website_validate_page_content(
  p_page_kind text,
  p_content_blocks jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_block jsonb;
  v_type text;
  v_key text;
  v_item jsonb;
  v_index integer := 0;
  v_count integer;
  v_heading_count integer;
  v_collection_count integer;
  v_form_count integer;
  v_href text;
  v_allowed_keys text[];
begin
  if p_page_kind is null or p_page_kind not in ('home', 'about', 'contact', 'valuation', 'campaign') then
    raise exception 'Unsupported website page type.' using errcode = '22023';
  end if;

  if p_content_blocks is null or jsonb_typeof(p_content_blocks) <> 'array' then
    raise exception 'Website page content must be an array.' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_content_blocks);
  if v_count < 1 or v_count > 12 then
    raise exception 'Website pages require between 1 and 12 sections.' using errcode = '22023';
  end if;

  for v_block in select value from jsonb_array_elements(p_content_blocks) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'Website section % must be an object.', v_index using errcode = '22023';
    end if;

    v_type := v_block ->> 'type';
    if v_type is null or v_type not in ('hero', 'rich_text', 'property_collection', 'benefits', 'faq', 'lead_form', 'cta') then
      raise exception 'Website section % has an unsupported type.', v_index using errcode = '22023';
    end if;

    v_allowed_keys := case v_type
      when 'hero' then array['type', 'hidden', 'eyebrow', 'heading', 'body', 'ctaLabel', 'ctaHref']
      when 'rich_text' then array['type', 'hidden', 'heading', 'body', 'ctaLabel', 'ctaHref']
      when 'property_collection' then array['type', 'hidden', 'heading', 'maxItems', 'transactionType']
      when 'benefits' then array['type', 'hidden', 'heading', 'items']
      when 'faq' then array['type', 'hidden', 'heading', 'items']
      when 'lead_form' then array['type', 'hidden', 'heading', 'body', 'purpose']
      else array['type', 'hidden', 'heading', 'body', 'ctaLabel', 'ctaHref']
    end;
    if (v_block - v_allowed_keys) <> '{}'::jsonb then
      raise exception 'Website section % contains unsupported fields.', v_index using errcode = '22023';
    end if;

    if v_block ? 'hidden' and jsonb_typeof(v_block -> 'hidden') <> 'boolean' then
      raise exception 'Website section % visibility must be true or false.', v_index using errcode = '22023';
    end if;

    foreach v_key in array array['eyebrow', 'heading', 'body', 'ctaLabel', 'ctaHref', 'transactionType', 'purpose'] loop
      if v_block ? v_key and jsonb_typeof(v_block -> v_key) <> 'string' then
        raise exception 'Website section % field % must be text.', v_index, v_key using errcode = '22023';
      end if;
    end loop;

    if length(coalesce(v_block ->> 'eyebrow', '')) > 80
      or length(coalesce(v_block ->> 'heading', '')) > 180
      or length(coalesce(v_block ->> 'body', '')) > 2000
      or length(coalesce(v_block ->> 'ctaLabel', '')) > 80
      or length(coalesce(v_block ->> 'ctaHref', '')) > 240 then
      raise exception 'Website section % exceeds the allowed text length.', v_index using errcode = '22023';
    end if;

    if v_type in ('hero', 'cta') and nullif(trim(v_block ->> 'heading'), '') is null then
      raise exception 'Website section % requires a heading.', v_index using errcode = '22023';
    end if;
    if v_type = 'rich_text' and nullif(trim(v_block ->> 'body'), '') is null then
      raise exception 'Website section % requires body copy.', v_index using errcode = '22023';
    end if;

    if (v_block ? 'ctaLabel') <> (v_block ? 'ctaHref') then
      raise exception 'Website section % CTA requires both a label and destination.', v_index using errcode = '22023';
    end if;
    if v_block ? 'ctaHref' then
      v_href := trim(v_block ->> 'ctaHref');
      if left(v_href, 1) <> '/' or left(v_href, 2) = '//' then
        raise exception 'Website section % CTA must use a local website path.', v_index using errcode = '22023';
      end if;
    end if;

    if v_type = 'property_collection' then
      if v_block ? 'maxItems' and (
        jsonb_typeof(v_block -> 'maxItems') <> 'number'
        or (v_block ->> 'maxItems')::numeric <> trunc((v_block ->> 'maxItems')::numeric)
        or (v_block ->> 'maxItems')::integer not between 1 and 6
      ) then
        raise exception 'Property collections may show between 1 and 6 listings.' using errcode = '22023';
      end if;
      if coalesce(v_block ->> 'transactionType', '') not in ('', 'sale', 'rental') then
        raise exception 'Property collection transaction type is invalid.' using errcode = '22023';
      end if;
    end if;

    if v_type in ('benefits', 'faq') then
      if not (v_block ? 'items') or jsonb_typeof(v_block -> 'items') <> 'array'
        or jsonb_array_length(v_block -> 'items') not between 1 and 12 then
        raise exception 'Website section % requires a supported item list.', v_index using errcode = '22023';
      end if;
      for v_item in select value from jsonb_array_elements(v_block -> 'items') loop
        if jsonb_typeof(v_item) <> 'object' then
          raise exception 'Website section % contains an invalid item.', v_index using errcode = '22023';
        end if;
        if v_type = 'benefits' then
          if (v_item - array['title', 'body']) <> '{}'::jsonb
            or jsonb_typeof(v_item -> 'title') <> 'string'
            or jsonb_typeof(v_item -> 'body') <> 'string'
            or nullif(trim(v_item ->> 'title'), '') is null
            or nullif(trim(v_item ->> 'body'), '') is null
            or length(v_item ->> 'title') > 120
            or length(v_item ->> 'body') > 600 then
            raise exception 'Website benefit items require a short title and body.' using errcode = '22023';
          end if;
        else
          if (v_item - array['question', 'answer']) <> '{}'::jsonb
            or jsonb_typeof(v_item -> 'question') <> 'string'
            or jsonb_typeof(v_item -> 'answer') <> 'string'
            or nullif(trim(v_item ->> 'question'), '') is null
            or nullif(trim(v_item ->> 'answer'), '') is null
            or length(v_item ->> 'question') > 180
            or length(v_item ->> 'answer') > 1200 then
            raise exception 'Website FAQ items require a question and answer.' using errcode = '22023';
          end if;
        end if;
      end loop;
    elsif v_block ? 'items' then
      raise exception 'Website section % does not support an item list.', v_index using errcode = '22023';
    end if;

    if v_type = 'lead_form' then
      if coalesce(v_block ->> 'purpose', '') not in ('general_enquiry', 'valuation_request', 'campaign_enquiry') then
        raise exception 'Website section % has an invalid enquiry purpose.', v_index using errcode = '22023';
      end if;
      if p_page_kind = 'valuation' and v_block ->> 'purpose' <> 'valuation_request' then
        raise exception 'Valuation pages must use the valuation request form.' using errcode = '22023';
      end if;
      if p_page_kind = 'campaign' and v_block ->> 'purpose' <> 'campaign_enquiry' then
        raise exception 'Campaign pages must use the campaign enquiry form.' using errcode = '22023';
      end if;
      if p_page_kind not in ('valuation', 'campaign') and v_block ->> 'purpose' <> 'general_enquiry' then
        raise exception 'This page must use the general enquiry form.' using errcode = '22023';
      end if;
    end if;
  end loop;

  select count(*) filter (where value ->> 'type' = 'hero' and not coalesce((value ->> 'hidden')::boolean, false)),
         count(*) filter (where value ->> 'type' = 'property_collection' and not coalesce((value ->> 'hidden')::boolean, false)),
         count(*) filter (where value ->> 'type' = 'lead_form' and not coalesce((value ->> 'hidden')::boolean, false))
  into v_heading_count, v_collection_count, v_form_count
  from jsonb_array_elements(p_content_blocks);

  if p_page_kind = 'home' and (v_heading_count < 1 or v_collection_count < 1 or v_form_count < 1) then
    raise exception 'Home pages require a hero, property collection and enquiry form.' using errcode = '22023';
  end if;
  if p_page_kind in ('contact', 'valuation') and v_form_count < 1 then
    raise exception 'This page requires an enquiry form.' using errcode = '22023';
  end if;
  if p_page_kind = 'campaign' and (
    v_count <> 3
    or p_content_blocks -> 0 ->> 'type' <> 'hero'
    or p_content_blocks -> 1 ->> 'type' <> 'property_collection'
    or p_content_blocks -> 2 ->> 'type' <> 'lead_form'
    or coalesce((p_content_blocks -> 0 ->> 'hidden')::boolean, false)
    or coalesce((p_content_blocks -> 1 ->> 'hidden')::boolean, false)
    or coalesce((p_content_blocks -> 2 ->> 'hidden')::boolean, false)
  ) then
    raise exception 'Campaign pages use the fixed hero, property collection and enquiry layout.' using errcode = '22023';
  end if;

  return true;
end;
$$;

create or replace function public.website_save_draft_page(
  p_website_site_id uuid,
  p_revision_id uuid,
  p_page_id uuid,
  p_page_kind text,
  p_slug text,
  p_title text,
  p_seo_title text,
  p_seo_description text,
  p_social_image_url text,
  p_content_blocks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_site public.website_sites%rowtype;
  v_page public.website_pages%rowtype;
  v_title text := left(trim(coalesce(p_title, '')), 160);
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_social_image_url text := nullif(trim(coalesce(p_social_image_url, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication is required to edit website pages.' using errcode = '42501';
  end if;

  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id;
  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_site.organisation_id) then
    raise exception 'Only organisation administrators can edit website pages.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.website_site_revisions revision
    where revision.id = p_revision_id
      and revision.website_site_id = v_site.id
      and revision.status = 'draft'
  ) then
    raise exception 'An editable website draft was not found.' using errcode = 'P0002';
  end if;

  if p_page_kind is null or p_page_kind not in ('home', 'about', 'contact', 'valuation', 'campaign') then
    raise exception 'Unsupported website page type.' using errcode = '22023';
  end if;
  if v_title = '' then
    raise exception 'Page title is required.' using errcode = '22023';
  end if;
  if length(coalesce(p_seo_title, '')) > 180 or length(coalesce(p_seo_description, '')) > 320 then
    raise exception 'Page search metadata is too long.' using errcode = '22023';
  end if;
  if v_social_image_url is not null and (
    length(v_social_image_url) > 2048 or v_social_image_url !~* '^https://[^[:space:]]+$'
  ) then
    raise exception 'Social image must use a valid HTTPS URL.' using errcode = '22023';
  end if;

  if p_page_kind = 'home' then v_slug := '';
  elsif p_page_kind in ('about', 'contact', 'valuation') then v_slug := p_page_kind;
  elsif v_slug = '' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug) > 80 then
    raise exception 'Campaign URL must contain only lowercase words and hyphens.' using errcode = '22023';
  end if;

  perform public.website_validate_page_content(p_page_kind, p_content_blocks);

  if p_page_id is null then
    if p_page_kind <> 'campaign' then
      raise exception 'Only campaign pages can be added to the standard template.' using errcode = '22023';
    end if;
    insert into public.website_pages (
      website_site_id, revision_id, page_kind, slug, title, seo_title,
      seo_description, social_image_url, content_blocks
    ) values (
      v_site.id, p_revision_id, p_page_kind, v_slug, v_title,
      nullif(trim(coalesce(p_seo_title, '')), ''),
      nullif(trim(coalesce(p_seo_description, '')), ''),
      v_social_image_url, p_content_blocks
    ) returning * into v_page;
  else
    select page.* into v_page
    from public.website_pages page
    where page.id = p_page_id
      and page.website_site_id = v_site.id
      and page.revision_id = p_revision_id
      and page.page_kind = p_page_kind
    for update;
    if not found then
      raise exception 'An editable website page was not found.' using errcode = 'P0002';
    end if;

    update public.website_pages page
    set slug = v_slug,
        title = v_title,
        seo_title = nullif(trim(coalesce(p_seo_title, '')), ''),
        seo_description = nullif(trim(coalesce(p_seo_description, '')), ''),
        social_image_url = v_social_image_url,
        content_blocks = p_content_blocks,
        updated_at = now()
    where page.id = v_page.id
    returning * into v_page;
  end if;

  return jsonb_build_object(
    'id', v_page.id,
    'slug', v_page.slug,
    'pageKind', v_page.page_kind,
    'title', v_page.title,
    'updatedAt', v_page.updated_at
  );
exception
  when unique_violation then
    raise exception 'That page URL is already in use in this draft.' using errcode = '23505';
end;
$$;

create or replace function public.website_delete_draft_campaign(
  p_website_site_id uuid,
  p_revision_id uuid,
  p_page_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organisation_id uuid;
  v_deleted_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to delete a campaign page.' using errcode = '42501';
  end if;

  select site.organisation_id into v_organisation_id
  from public.website_sites site
  where site.id = p_website_site_id;
  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;
  if not public.bridge_is_org_admin(v_organisation_id) then
    raise exception 'Only organisation administrators can delete campaign pages.' using errcode = '42501';
  end if;

  delete from public.website_pages page
  using public.website_site_revisions revision
  where page.id = p_page_id
    and page.website_site_id = p_website_site_id
    and page.revision_id = p_revision_id
    and page.page_kind = 'campaign'
    and revision.id = page.revision_id
    and revision.website_site_id = page.website_site_id
    and revision.status = 'draft'
  returning page.id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'An editable campaign page was not found.' using errcode = 'P0002';
  end if;
  return v_deleted_id;
end;
$$;

revoke insert, update, delete on table public.website_pages from authenticated;

revoke all on function public.website_validate_page_content(text, jsonb) from public, anon, authenticated;
revoke all on function public.website_save_draft_page(uuid, uuid, uuid, text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.website_delete_draft_campaign(uuid, uuid, uuid) from public, anon;
grant execute on function public.website_save_draft_page(uuid, uuid, uuid, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.website_delete_draft_campaign(uuid, uuid, uuid) to authenticated;

comment on function public.website_save_draft_page(uuid, uuid, uuid, text, text, text, text, text, text, jsonb) is
  'Creates or updates one allow-listed structured page inside an organisation-admin-owned website draft.';
comment on function public.website_delete_draft_campaign(uuid, uuid, uuid) is
  'Deletes only a campaign page from an organisation-admin-owned website draft; standard pages remain fixed.';

notify pgrst, 'reload schema';

commit;
