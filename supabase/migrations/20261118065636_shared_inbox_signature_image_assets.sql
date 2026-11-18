begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('email-signature-images','email-signature-images',true,5242880,array['image/jpeg','image/png','image/gif','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

create table public.shared_inbox_signature_images (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 channel_id uuid not null,
 created_by uuid not null references auth.users(id) on delete cascade,
 original_name text not null check(length(btrim(original_name)) between 1 and 180),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/gif','image/webp')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 storage_path text not null unique,
 created_at timestamptz not null default now(),
 foreign key(channel_id,organisation_id) references public.revo_inbox_channels(id,organisation_id) on delete cascade,
 constraint shared_inbox_signature_image_path check(storage_path='organisations/'||organisation_id::text||'/mailboxes/'||channel_id::text||'/'||id::text||case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/gif' then '.gif' when 'image/webp' then '.webp' end)
);

create or replace function private.shared_inbox_signature_valid(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item record; run jsonb;
begin
 if value is null or jsonb_typeof(value)<>'object' or octet_length(value::text)>24000 then return false;end if;
 for item in select * from jsonb_each(value) loop
  if item.key='body' then
   if jsonb_typeof(item.value)<>'array' or jsonb_array_length(item.value)>100 then return false;end if;
   for run in select * from jsonb_array_elements(item.value) loop
    if jsonb_typeof(run)<>'object' then return false;end if;
    if run ? 'imageUrl' then
     if exists(select 1 from jsonb_object_keys(run) key where key not in ('imageUrl','alt')) or jsonb_typeof(run->'imageUrl')<>'string' or length(run->>'imageUrl')>2048 or (run->>'imageUrl') !~* '^https://[^[:space:]<>"'']+' or (run ? 'alt' and (jsonb_typeof(run->'alt')<>'string' or length(run->>'alt')>200)) then return false;end if;
    else
     if jsonb_typeof(run->'text') is distinct from 'string' or length(run->>'text')>2000 or exists(select 1 from jsonb_object_keys(run) key where key not in ('text','bold','italic','href')) then return false;end if;
     if (run ? 'bold' and jsonb_typeof(run->'bold')<>'boolean') or (run ? 'italic' and jsonb_typeof(run->'italic')<>'boolean') then return false;end if;
     if run ? 'href' and (jsonb_typeof(run->'href')<>'string' or length(run->>'href')>2048 or (run->>'href') !~* '^(https://[^[:space:]<>"'']+|mailto:[^[:space:]<>"'']+@[^[:space:]<>"'']+|tel:[+0-9().-]+)$') then return false;end if;
    end if;
   end loop;
  elsif item.key in ('name','title','company','phone','email','website','logoUrl') then
   if jsonb_typeof(item.value)<>'string' or length(item.value#>>'{}')>(case when item.key in ('website','logoUrl') then 2048 else 500 end) then return false;end if;
   if item.key in ('website','logoUrl') and (item.value#>>'{}')<>'' and (item.value#>>'{}') !~* '^https://[^[:space:]<>"'']+$' then return false;end if;
  else return false;end if;
 end loop;
 return true;
end; $$;
revoke all on function private.shared_inbox_signature_valid(jsonb) from public,anon;
grant execute on function private.shared_inbox_signature_valid(jsonb) to authenticated,service_role;

alter table public.shared_inbox_signature_images enable row level security;
revoke all on public.shared_inbox_signature_images from public,anon,authenticated;
grant all on public.shared_inbox_signature_images to service_role;

create function public.shared_inbox_reserve_signature_image(p_organisation_id uuid,p_channel_id uuid,p_name text,p_mime text,p_size integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.shared_inbox_signature_images%rowtype; new_id uuid:=gen_random_uuid(); extension text;
begin
 if auth.uid() is null or not private.shared_inbox_can_access(p_organisation_id,p_channel_id,'manage') then raise exception 'Mailbox management access is required to host signature images' using errcode='42501';end if;
 extension:=case p_mime when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/gif' then '.gif' when 'image/webp' then '.webp' end;
 if extension is null or p_size is null or p_size not between 1 and 5242880 or p_name is null or length(btrim(p_name)) not between 1 and 180 then raise exception 'Choose a JPG, PNG, GIF or WebP image, 5 MB or smaller' using errcode='22023';end if;
 insert into public.shared_inbox_signature_images(id,organisation_id,channel_id,created_by,original_name,mime_type,byte_size,storage_path)
 values(new_id,p_organisation_id,p_channel_id,auth.uid(),btrim(p_name),p_mime,p_size,'organisations/'||p_organisation_id::text||'/mailboxes/'||p_channel_id::text||'/'||new_id::text||extension) returning * into item;
 return to_jsonb(item);
end; $$;

create function public.shared_inbox_signature_image_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.shared_inbox_signature_images a where a.storage_path=p_path and a.created_by=auth.uid() and private.shared_inbox_can_access(a.organisation_id,a.channel_id,'manage'));
$$;

create function public.shared_inbox_confirm_signature_image(p_organisation_id uuid,p_channel_id uuid,p_image_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item jsonb;
begin
 if auth.uid() is null or not private.shared_inbox_can_access(p_organisation_id,p_channel_id,'manage') then raise exception 'Mailbox management access is required' using errcode='42501';end if;
 select to_jsonb(a) into item from public.shared_inbox_signature_images a join storage.objects o on o.bucket_id='email-signature-images' and o.name=a.storage_path and o.metadata->>'mimetype'=a.mime_type and o.metadata->>'size'=a.byte_size::text where a.id=p_image_id and a.organisation_id=p_organisation_id and a.channel_id=p_channel_id;
 if item is null then raise exception 'The signature image upload could not be confirmed' using errcode='P0001';end if;
 return item;
end; $$;

revoke all on function public.shared_inbox_reserve_signature_image(uuid,uuid,text,text,integer),public.shared_inbox_signature_image_upload_allowed(text),public.shared_inbox_confirm_signature_image(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.shared_inbox_reserve_signature_image(uuid,uuid,text,text,integer),public.shared_inbox_signature_image_upload_allowed(text),public.shared_inbox_confirm_signature_image(uuid,uuid,uuid) to authenticated;

create policy shared_inbox_signature_image_upload on storage.objects for insert to authenticated with check(bucket_id='email-signature-images' and public.shared_inbox_signature_image_upload_allowed(name));
create policy shared_inbox_signature_image_upload_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'email-signature-images' or public.shared_inbox_signature_image_upload_allowed(name));
create policy shared_inbox_signature_image_anon_upload_guard on storage.objects as restrictive for insert to anon with check(bucket_id<>'email-signature-images');
create policy shared_inbox_signature_image_download_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'email-signature-images');
create policy shared_inbox_signature_image_anon_download_guard on storage.objects as restrictive for select to anon using(bucket_id<>'email-signature-images');
create policy shared_inbox_signature_image_update_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'email-signature-images') with check(bucket_id<>'email-signature-images');
create policy shared_inbox_signature_image_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'email-signature-images');

notify pgrst,'reload schema';
commit;
