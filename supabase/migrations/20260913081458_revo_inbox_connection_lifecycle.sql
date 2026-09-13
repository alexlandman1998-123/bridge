begin;

-- These functions are the sole route by which the server-side lifecycle
-- function can read, rotate, or forget OAuth credentials. Browser roles have
-- no execute permission and never receive decrypted credential material.
create or replace function public.revo_read_inbox_connection_credential(
  p_connection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  credential jsonb;
begin
  if not exists (
    select 1 from public.revo_inbox_provider_connections
    where id = p_connection_id
      and organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  ) then
    raise exception 'Revo inbox connection not found';
  end if;

  select decrypted_secret::jsonb into credential
  from private.revo_inbox_connection_credentials credential_map
  join vault.decrypted_secrets secret on secret.id = credential_map.vault_secret_id
  where credential_map.connection_id = p_connection_id;

  if credential is null then
    raise exception 'Revo inbox credential not found';
  end if;
  return credential;
end;
$$;

create or replace function public.revo_clear_inbox_connection_credential(
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  secret_id uuid;
begin
  if not exists (
    select 1 from public.revo_inbox_provider_connections
    where id = p_connection_id
      and organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  ) then
    raise exception 'Revo inbox connection not found';
  end if;

  select vault_secret_id into secret_id
  from private.revo_inbox_connection_credentials
  where connection_id = p_connection_id;

  if secret_id is not null then
    perform vault.update_secret(
      secret_id,
      '{"revoked":true}'::text,
      'revo_inbox_connection_' || p_connection_id::text,
      'Revo provider credential cleared after disconnection.'
    );
    delete from private.revo_inbox_connection_credentials
    where connection_id = p_connection_id;
  end if;
end;
$$;

revoke all on function public.revo_read_inbox_connection_credential(uuid) from public;
revoke all on function public.revo_clear_inbox_connection_credential(uuid) from public;
grant execute on function public.revo_read_inbox_connection_credential(uuid) to service_role;
grant execute on function public.revo_clear_inbox_connection_credential(uuid) to service_role;

comment on function public.revo_read_inbox_connection_credential(uuid) is
  'Server-only reader of a Revo inbox OAuth credential from Supabase Vault.';
comment on function public.revo_clear_inbox_connection_credential(uuid) is
  'Server-only credential erasure for a disconnected Revo inbox provider connection.';

commit;
