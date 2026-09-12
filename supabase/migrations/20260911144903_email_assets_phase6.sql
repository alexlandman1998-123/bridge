begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.email_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  alt_text text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists email_assets_org_created_idx on public.email_assets (organisation_id, created_at desc);
alter table public.email_assets enable row level security;
grant select,insert,update,delete on public.email_assets to authenticated;
create policy email_assets_member on public.email_assets for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));

create or replace function public.email_asset_path_organisation_id(p_path text)
returns uuid language sql immutable set search_path='' as $$
  select case when p_path ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/' then split_part(p_path,'/',1)::uuid else null end
$$;

drop policy if exists email_assets_member_insert on storage.objects;
create policy email_assets_member_insert on storage.objects for insert to authenticated with check (
  bucket_id='email-assets' and public.bridge_has_organisation_membership(public.email_asset_path_organisation_id(name))
);
drop policy if exists email_assets_member_update on storage.objects;
create policy email_assets_member_update on storage.objects for update to authenticated using (
  bucket_id='email-assets' and public.bridge_has_organisation_membership(public.email_asset_path_organisation_id(name))
) with check (bucket_id='email-assets' and public.bridge_has_organisation_membership(public.email_asset_path_organisation_id(name)));
drop policy if exists email_assets_member_delete on storage.objects;
create policy email_assets_member_delete on storage.objects for delete to authenticated using (
  bucket_id='email-assets' and public.bridge_has_organisation_membership(public.email_asset_path_organisation_id(name))
);

commit;
