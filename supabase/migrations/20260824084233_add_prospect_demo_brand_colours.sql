alter table public.prospect_demo_configs
  add column if not exists secondary_colour text,
  add column if not exists accent_colour text;
