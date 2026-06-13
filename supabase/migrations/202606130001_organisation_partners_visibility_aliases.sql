begin;

alter table if exists public.organisation_partners
  drop constraint if exists organisation_partners_visibility_check;

alter table if exists public.organisation_partners
  add constraint organisation_partners_visibility_check
  check (
    visibility_level in (
      'private',
      'connected_partners',
      'connected_partners_only',
      'preferred_partners',
      'preferred_partners_only',
      'public_ecosystem',
      'public',
      'invite_only',
      'hidden'
    )
  );

commit;
