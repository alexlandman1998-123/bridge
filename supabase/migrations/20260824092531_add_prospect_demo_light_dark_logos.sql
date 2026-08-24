alter table public.prospect_demo_configs
  add column if not exists logo_light_url text,
  add column if not exists logo_dark_url text;

update public.prospect_demo_configs
set
  logo_light_url = coalesce(nullif(trim(logo_light_url), ''), logo_url),
  logo_dark_url = coalesce(nullif(trim(logo_dark_url), ''), logo_url)
where nullif(trim(logo_url), '') is not null
  and (
    nullif(trim(logo_light_url), '') is null
    or nullif(trim(logo_dark_url), '') is null
  );

notify pgrst, 'reload schema';
