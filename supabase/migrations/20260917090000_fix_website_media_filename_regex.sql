begin;

-- In PostgreSQL string literals, a single backslash is the literal regex
-- escape needed for the filename extension separator. The prior repair
-- accidentally persisted two backslashes and rejected normal image names.
create or replace function public.website_media_storage_path_is_valid(object_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select (storage.foldername(object_name))[1] = 'organisations'
    and public.website_media_storage_org_id(object_name) is not null
    and coalesce((storage.foldername(object_name))[3], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and coalesce(storage.filename(object_name), '') ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpe?g|png|webp|avif)$';
$$;

grant execute on function public.website_media_storage_path_is_valid(text) to authenticated;

commit;
