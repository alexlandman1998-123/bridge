begin;

alter table public.website_domains
  drop constraint if exists website_domains_hostname_check;

alter table public.website_domains
  add constraint website_domains_hostname_check check (
    hostname = lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  );

comment on constraint website_domains_hostname_check on public.website_domains is
  'Accepts lowercase DNS hostnames with two or more labels; repaired after the foundation pattern escaped the label separator twice.';

commit;
