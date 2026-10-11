begin;

-- Email assets are append-only. A sent email can be reopened years later, so
-- public URLs must not expire or change when a draft/template is edited.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-campaign-images', 'email-campaign-images', true, 5242880,
  array['image/jpeg','image/png','image/gif','image/webp']::text[]);

create table public.email_campaign_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  original_name text not null check (length(btrim(original_name)) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/gif','image/webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint email_campaign_asset_path check (
    storage_path = 'organisations/' || organisation_id::text || '/' || id::text ||
      case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png'
        when 'image/gif' then '.gif' when 'image/webp' then '.webp' end
  )
);
alter table public.email_campaign_assets enable row level security;
revoke all on public.email_campaign_assets from public, anon, authenticated;
grant select on public.email_campaign_assets to authenticated;
grant all on public.email_campaign_assets to service_role;
create policy email_campaign_assets_member_read on public.email_campaign_assets
  for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create index email_campaign_assets_org_time on public.email_campaign_assets(organisation_id, created_at desc);

-- Reserve ownership before sending bytes. No browser can forge the path,
-- overwrite asset metadata or use another agency's upload reservation.
create function public.email_campaign_reserve_asset(
  p_organisation_id uuid, p_original_name text, p_mime_type text, p_byte_size integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_asset public.email_campaign_assets%rowtype; v_id uuid := gen_random_uuid(); v_extension text;
begin
  if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) then
    raise exception 'Choose an agency you belong to before uploading images.' using errcode = '42501';
  end if;
  v_extension := case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png'
    when 'image/gif' then '.gif' when 'image/webp' then '.webp' end;
  if v_extension is null or p_byte_size is null or p_byte_size not between 1 and 5242880
    or p_original_name is null or length(btrim(p_original_name)) not between 1 and 180 then
    raise exception 'Choose a JPG, PNG, GIF or WebP image, 5 MB or smaller.' using errcode = '22023';
  end if;
  insert into public.email_campaign_assets(id, organisation_id, created_by, original_name, mime_type, byte_size, storage_path)
  values(v_id, p_organisation_id, auth.uid(), btrim(p_original_name), p_mime_type, p_byte_size,
    'organisations/' || p_organisation_id::text || '/' || v_id::text || v_extension)
  returning * into v_asset;
  return to_jsonb(v_asset);
end $$;

create function public.email_campaign_asset_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.email_campaign_assets a where a.storage_path = p_path
      and a.created_by = auth.uid() and public.bridge_has_organisation_membership(a.organisation_id)
  )
$$;

-- A reservation is not an uploaded image. Only expose assets for which Storage
-- has recorded the expected object, content type and actual byte count.
create function public.email_campaign_list_assets(p_organisation_id uuid, p_asset_id uuid default null)
returns setof public.email_campaign_assets language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) then
    raise exception 'Not authorised to view these campaign images.' using errcode = '42501';
  end if;
  return query select a.* from public.email_campaign_assets a
  join storage.objects o on o.bucket_id = 'email-campaign-images' and o.name = a.storage_path
  where a.organisation_id = p_organisation_id and (p_asset_id is null or a.id = p_asset_id)
    and o.metadata->>'mimetype' = a.mime_type
    and o.metadata->>'size' = a.byte_size::text
  order by a.created_at desc, a.id limit 100;
end $$;

revoke all on function public.email_campaign_reserve_asset(uuid,text,text,integer),
  public.email_campaign_asset_upload_allowed(text), public.email_campaign_list_assets(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.email_campaign_reserve_asset(uuid,text,text,integer),
  public.email_campaign_asset_upload_allowed(text), public.email_campaign_list_assets(uuid,uuid) to authenticated;

create policy email_campaign_image_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'email-campaign-images' and public.email_campaign_asset_upload_allowed(name));
create policy email_campaign_image_select on storage.objects for select to authenticated
  using (bucket_id = 'email-campaign-images' and exists (
    select 1 from public.email_campaign_assets a where a.storage_path = name
      and public.bridge_has_organisation_membership(a.organisation_id)
  ));

-- Restrictive guards also defeat unrelated broad permissive Storage policies.
-- Public image downloads bypass SELECT RLS by design; bucket listing does not.
create policy email_campaign_image_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'email-campaign-images' or public.email_campaign_asset_upload_allowed(name));
create policy email_campaign_image_anon_insert_guard on storage.objects as restrictive for insert to anon
  with check (bucket_id <> 'email-campaign-images');
create policy email_campaign_image_select_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'email-campaign-images' or exists (
    select 1 from public.email_campaign_assets a where a.storage_path = name
      and public.bridge_has_organisation_membership(a.organisation_id)
  ));
create policy email_campaign_image_anon_select_guard on storage.objects as restrictive for select to anon
  using (bucket_id <> 'email-campaign-images');
create policy email_campaign_image_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'email-campaign-images') with check (bucket_id <> 'email-campaign-images');
create policy email_campaign_image_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'email-campaign-images');

notify pgrst, 'reload schema';
commit;
