alter table if exists public.profiles
  add column if not exists bio text,
  add column if not exists department text,
  add column if not exists office text,
  add column if not exists language text not null default 'en-ZA',
  add column if not exists theme text not null default 'system';

comment on column public.profiles.bio is
  'Short user biography shown in profile and collaboration surfaces.';
comment on column public.profiles.department is
  'Optional department or team label for profile settings.';
comment on column public.profiles.office is
  'Optional office or branch label for profile settings.';
comment on column public.profiles.language is
  'Preferred interface language for profile settings.';
comment on column public.profiles.theme is
  'Preferred interface theme for profile settings.';
