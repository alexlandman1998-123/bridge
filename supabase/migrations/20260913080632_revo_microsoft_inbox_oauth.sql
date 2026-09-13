begin;

-- OAuth state is short lived and never readable through the Data API. It holds
-- only a hashed browser state and ephemeral PKCE verifier, never a mailbox token.
create table public.revo_inbox_oauth_states (
  state_hash text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  connection_id uuid not null references public.revo_inbox_provider_connections(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  provider_key text not null check (provider_key = 'microsoft_365'),
  return_url text not null,
  code_verifier text not null check (char_length(code_verifier) between 43 and 128),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index revo_inbox_oauth_states_connection_expiry_idx
  on public.revo_inbox_oauth_states (connection_id, expires_at desc);

alter table public.revo_inbox_oauth_states enable row level security;

-- Atomically writes or rotates a Vault-backed credential. It is intentionally
-- not executable by browser roles; only server-side service code calls it.
create or replace function public.revo_store_inbox_connection_credential(
  p_connection_id uuid,
  p_secret jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
  connection_org_id uuid;
begin
  select organisation_id into connection_org_id
  from public.revo_inbox_provider_connections
  where id = p_connection_id;

  if connection_org_id is distinct from '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid then
    raise exception 'Revo inbox connection not found';
  end if;

  if p_secret is null or p_secret = '{}'::jsonb then
    raise exception 'A non-empty provider credential is required';
  end if;

  select vault_secret_id into existing_secret_id
  from private.revo_inbox_connection_credentials
  where connection_id = p_connection_id;

  if existing_secret_id is null then
    next_secret_id := vault.create_secret(
      p_secret::text,
      'revo_inbox_connection_' || p_connection_id::text,
      'Revo provider credential; managed only by server-side connector functions.'
    );
    insert into private.revo_inbox_connection_credentials (connection_id, vault_secret_id)
    values (p_connection_id, next_secret_id);
  else
    perform vault.update_secret(
      existing_secret_id,
      p_secret::text,
      'revo_inbox_connection_' || p_connection_id::text,
      'Revo provider credential; managed only by server-side connector functions.'
    );
    update private.revo_inbox_connection_credentials
    set updated_at = now()
    where connection_id = p_connection_id;
  end if;
end;
$$;

revoke all on function public.revo_store_inbox_connection_credential(uuid, jsonb) from public;
grant execute on function public.revo_store_inbox_connection_credential(uuid, jsonb) to service_role;

comment on table public.revo_inbox_oauth_states is
  'Short-lived, non-readable Microsoft OAuth state and PKCE verifier for Revo inbox connections.';
comment on function public.revo_store_inbox_connection_credential(uuid, jsonb) is
  'Server-only Revo provider credential writer backed by Supabase Vault.';

commit;
