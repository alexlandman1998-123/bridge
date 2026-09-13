begin;

create or replace function public.website_blog_capture_slug_redirect()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.slug is distinct from new.slug and old.slug <> '' then
    insert into public.website_blog_slug_redirects (organisation_id, website_site_id, revision_id, from_slug, to_slug)
    values (new.organisation_id, new.website_site_id, new.revision_id, old.slug, new.slug)
    on conflict (website_site_id, revision_id, from_slug) do update set to_slug = excluded.to_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists website_blog_posts_capture_slug_redirect on public.website_blog_posts;
create trigger website_blog_posts_capture_slug_redirect
after update of slug on public.website_blog_posts
for each row execute function public.website_blog_capture_slug_redirect();

revoke all on function public.website_blog_capture_slug_redirect() from public, anon, authenticated;
commit;
