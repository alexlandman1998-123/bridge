begin;

alter table public.website_blog_listing_links
  drop constraint if exists website_blog_listing_links_website_blog_post_id_listing_id_key;

alter table public.website_blog_listing_links
  add constraint website_blog_listing_links_post_listing_position_key unique (website_blog_post_id, listing_id, position);

commit;
