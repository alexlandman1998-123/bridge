-- Phase 6 makes professional request propagation explicit and fail-closed.
-- Existing RLS policies remain authoritative; this migration only guarantees
-- the shared request-container columns used by every workspace.

alter table if exists public.document_requests
  add column if not exists request_type text,
  add column if not exists requested_from text,
  add column if not exists visibility_scope text,
  add column if not exists notes text,
  add column if not exists created_by_role text,
  add column if not exists request_group_id uuid,
  add column if not exists requested_document_id uuid;

do $$
begin
  if to_regclass('public.document_requests') is null then
    return;
  end if;

  update public.document_requests
  set
    request_type = coalesce(nullif(trim(request_type), ''), 'additional_document_request'),
    requested_from = coalesce(nullif(trim(requested_from), ''), 'buyer'),
    visibility_scope = coalesce(nullif(trim(visibility_scope), ''), 'shared_role_players')
  where request_type is null
     or requested_from is null
     or visibility_scope is null;

  alter table public.document_requests
    alter column request_type set default 'additional_document_request',
    alter column request_type set not null,
    alter column requested_from set default 'buyer',
    alter column requested_from set not null,
    alter column visibility_scope set default 'shared_role_players',
    alter column visibility_scope set not null;

  alter table public.document_requests
    drop constraint if exists document_requests_requested_from_check;

  alter table public.document_requests
    add constraint document_requests_requested_from_check
    check (requested_from in (
      'buyer', 'seller', 'buyer_and_seller', 'client', 'agent', 'developer',
      'attorney', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney',
      'bond_originator', 'internal', 'other'
    ));

  alter table public.document_requests
    drop constraint if exists document_requests_visibility_scope_check;

  alter table public.document_requests
    add constraint document_requests_visibility_scope_check
    check (visibility_scope in ('client_visible', 'internal_only', 'shared_role_players'));

  create index if not exists document_requests_visibility_scope_idx
    on public.document_requests (visibility_scope);

  create index if not exists document_requests_requested_from_idx
    on public.document_requests (requested_from);

  comment on column public.document_requests.visibility_scope is
    'Authoritative audience boundary. Client parties are visible only when this value is client_visible.';
end
$$;
