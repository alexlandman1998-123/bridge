alter table if exists organisation_users
  add column if not exists invitation_token text;

alter table if exists organisation_users
  add column if not exists invitation_expires_at timestamptz;

create unique index if not exists organisation_users_invitation_token_unique_idx
  on organisation_users (invitation_token)
  where invitation_token is not null;
