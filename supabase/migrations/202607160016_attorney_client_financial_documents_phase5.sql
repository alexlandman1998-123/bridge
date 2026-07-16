begin;

create table if not exists public.attorney_client_financial_document_access_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  publication_event_id uuid not null references public.attorney_client_financial_document_publication_events(id) on delete cascade,
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  recipient_role text not null check (recipient_role in ('buyer', 'seller')),
  event_type text not null check (event_type in ('viewed', 'downloaded')),
  portal_token_fingerprint text not null check (length(portal_token_fingerprint) = 64),
  created_at timestamptz not null default now(),
  constraint attorney_client_financial_access_event_once
    unique (publication_event_id, recipient_role, event_type)
);

create index if not exists attorney_client_financial_access_events_scope_idx
  on public.attorney_client_financial_document_access_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    document_definition_key,
    created_at desc
  );

alter table public.attorney_client_financial_document_access_events enable row level security;

drop policy if exists attorney_client_financial_access_events_select
  on public.attorney_client_financial_document_access_events;
create policy attorney_client_financial_access_events_select
on public.attorney_client_financial_document_access_events
for select to authenticated
using (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
);

revoke all on public.attorney_client_financial_document_access_events from public, anon;
grant select on public.attorney_client_financial_document_access_events to authenticated;
grant all on public.attorney_client_financial_document_access_events to service_role;

create or replace function public.bridge_record_attorney_client_financial_document_access(
  p_token text,
  p_recipient_role text,
  p_document_id uuid,
  p_event_type text default 'viewed',
  p_seller_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_recipient_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_event_type text := lower(trim(coalesce(p_event_type, 'viewed')));
  v_transaction_id uuid;
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_metadata public.transaction_attorney_client_financial_document_metadata%rowtype;
  v_publication_event public.attorney_client_financial_document_publication_events%rowtype;
  v_access_event public.attorney_client_financial_document_access_events%rowtype;
begin
  if v_token is null or p_document_id is null then
    raise exception 'Portal token and document are required.' using errcode = '22023';
  end if;
  if v_recipient_role not in ('buyer', 'seller') then
    raise exception 'Recipient role must be buyer or seller.' using errcode = '22023';
  end if;
  if v_event_type not in ('viewed', 'downloaded') then
    raise exception 'Access event must be viewed or downloaded.' using errcode = '22023';
  end if;

  if v_recipient_role = 'buyer' then
    select link.transaction_id into v_transaction_id
    from public.client_portal_links link
    where link.token = v_token
      and coalesce(link.is_active, true) = true
    order by link.created_at desc
    limit 1;
  else
    v_seller_payload := public.bridge_private_listing_seller_portal_payload(v_token, p_seller_access_token, true);
    if v_seller_payload is null or coalesce((v_seller_payload ->> 'authRequired')::boolean, false) then
      raise exception 'Seller portal access is required.' using errcode = '42501';
    end if;
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  if v_transaction_id is null then
    raise exception 'Portal transaction could not be resolved.' using errcode = '42501';
  end if;

  select metadata.* into v_metadata
  from public.transaction_attorney_client_financial_document_metadata metadata
  join public.documents document_row
    on document_row.id = metadata.document_id
   and document_row.transaction_id = metadata.transaction_id
  where metadata.transaction_id = v_transaction_id
    and metadata.document_id = p_document_id
    and metadata.recipient_role = v_recipient_role
    and metadata.publication_status = 'published'
    and coalesce(document_row.is_client_visible, false) = true
    and document_row.client_recipient_role = v_recipient_role
  limit 1;

  if not found then
    raise exception 'This published document is not available to the portal recipient.' using errcode = '42501';
  end if;

  select publication_event.* into v_publication_event
  from public.attorney_client_financial_document_publication_events publication_event
  where publication_event.transaction_id = v_transaction_id
    and publication_event.document_id = p_document_id
    and publication_event.document_definition_key = v_metadata.document_definition_key
    and publication_event.recipient_role = v_recipient_role
    and publication_event.action = 'published'
    and publication_event.created_at >= coalesce(v_metadata.published_at, '-infinity'::timestamptz)
  order by publication_event.created_at desc
  limit 1;

  if not found then
    raise exception 'The active publication event could not be verified.' using errcode = '42501';
  end if;

  insert into public.attorney_client_financial_document_access_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    publication_event_id,
    document_definition_key,
    document_id,
    recipient_role,
    event_type,
    portal_token_fingerprint
  ) values (
    v_metadata.organisation_id,
    v_metadata.attorney_firm_id,
    v_transaction_id,
    v_publication_event.id,
    v_metadata.document_definition_key,
    p_document_id,
    v_recipient_role,
    v_event_type,
    encode(digest(v_token, 'sha256'), 'hex')
  )
  on conflict (publication_event_id, recipient_role, event_type) do update
  set portal_token_fingerprint = excluded.portal_token_fingerprint
  returning * into v_access_event;

  return jsonb_build_object(
    'id', v_access_event.id,
    'publication_event_id', v_access_event.publication_event_id,
    'document_definition_key', v_access_event.document_definition_key,
    'document_id', v_access_event.document_id,
    'recipient_role', v_access_event.recipient_role,
    'event_type', v_access_event.event_type,
    'created_at', v_access_event.created_at
  );
end;
$$;

revoke all on function public.bridge_record_attorney_client_financial_document_access(text, text, uuid, text, text)
  from public;
grant execute on function public.bridge_record_attorney_client_financial_document_access(text, text, uuid, text, text)
  to anon, authenticated;

comment on table public.attorney_client_financial_document_access_events is
  'Phase 5 recipient access receipts. Raw portal credentials are never retained; only a one-way token fingerprint is stored.';
comment on function public.bridge_record_attorney_client_financial_document_access(text, text, uuid, text, text) is
  'Records an idempotent view or download receipt only after validating the active publication and matching buyer or seller portal session.';

notify pgrst, 'reload schema';

commit;
