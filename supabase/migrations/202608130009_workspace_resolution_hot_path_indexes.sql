begin;

create index if not exists organisation_users_user_lookup_idx
  on public.organisation_users (user_id)
  where user_id is not null;

create index if not exists organisation_users_invite_email_lookup_idx
  on public.organisation_users (lower(email))
  where email is not null;

commit;
