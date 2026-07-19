begin;
alter table public.documents
  add column if not exists client_recipient_role text;
alter table public.documents
  drop constraint if exists documents_client_recipient_role_check;
alter table public.documents
  add constraint documents_client_recipient_role_check
  check (client_recipient_role is null or client_recipient_role in ('buyer', 'seller'));
alter table public.transaction_attorney_client_financial_document_metadata
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists recipient_role text,
  add column if not exists publication_status text not null default 'internal',
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by uuid references public.profiles(id) on delete set null;
alter table public.transaction_attorney_client_financial_document_metadata
  drop constraint if exists transaction_attorney_client_financial_metadata_recipient_check;
alter table public.transaction_attorney_client_financial_document_metadata
  add constraint transaction_attorney_client_financial_metadata_recipient_check
  check (recipient_role is null or recipient_role in ('buyer', 'seller'));
alter table public.transaction_attorney_client_financial_document_metadata
  drop constraint if exists transaction_attorney_client_financial_metadata_publication_check;
alter table public.transaction_attorney_client_financial_document_metadata
  add constraint transaction_attorney_client_financial_metadata_publication_check
  check (publication_status in ('internal', 'published', 'withdrawn'));
create table if not exists public.attorney_client_financial_document_publication_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  recipient_role text not null check (recipient_role in ('buyer', 'seller')),
  action text not null check (action in ('published', 'withdrawn')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists attorney_client_financial_publication_events_scope_idx
  on public.attorney_client_financial_document_publication_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    document_definition_key,
    created_at desc
  );
alter table public.attorney_client_financial_document_publication_events enable row level security;
drop policy if exists attorney_client_financial_publication_events_select
  on public.attorney_client_financial_document_publication_events;
create policy attorney_client_financial_publication_events_select
on public.attorney_client_financial_document_publication_events
for select to authenticated
using (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
);
revoke all on public.attorney_client_financial_document_publication_events from public, anon;
grant select on public.attorney_client_financial_document_publication_events to authenticated;
grant all on public.attorney_client_financial_document_publication_events to service_role;
create or replace function public.bridge_set_attorney_client_financial_document_publication(
  p_organisation_id uuid,
  p_attorney_firm_id uuid,
  p_transaction_id uuid,
  p_document_definition_key text,
  p_document_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_document_definition_key, '')));
  v_action text := lower(trim(coalesce(p_action, '')));
  v_recipient_role text;
  v_role text;
  v_previous_document_id uuid;
  v_document public.documents%rowtype;
  v_metadata public.transaction_attorney_client_financial_document_metadata%rowtype;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_key not in ('buyer_transfer_cost_invoice', 'seller_attorney_invoice', 'buyer_final_statement', 'seller_final_statement') then
    raise exception 'Unsupported attorney client financial document type.' using errcode = '22023';
  end if;
  if v_action not in ('published', 'withdrawn') then
    raise exception 'Publication action must be published or withdrawn.' using errcode = '22023';
  end if;
  if not public.bridge_conveyancer_can_access_record(p_organisation_id, p_attorney_firm_id, p_transaction_id) then
    raise exception 'Matter access denied.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.attorney_firm_members member
  where member.firm_id = p_attorney_firm_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;
  if v_role not in ('firm_admin', 'director_partner', 'transfer_attorney', 'conveyancing_secretary') then
    raise exception 'Document publication authority is required.' using errcode = '42501';
  end if;

  v_recipient_role := case when v_key like 'buyer_%' then 'buyer' else 'seller' end;
  select * into v_document
  from public.documents document_row
  where document_row.id = p_document_id
    and document_row.transaction_id = p_transaction_id
    and lower(coalesce(document_row.document_type, '')) = v_key
  limit 1;
  if not found then
    raise exception 'The selected document is not available for publication.' using errcode = '22023';
  end if;

  select metadata.document_id into v_previous_document_id
  from public.transaction_attorney_client_financial_document_metadata metadata
  where metadata.transaction_id = p_transaction_id
    and metadata.document_definition_key = v_key
  limit 1;

  insert into public.transaction_attorney_client_financial_document_metadata (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    document_definition_key,
    document_id,
    recipient_role,
    publication_status,
    published_at,
    published_by,
    withdrawn_at,
    withdrawn_by,
    updated_by,
    updated_at
  ) values (
    p_organisation_id,
    p_attorney_firm_id,
    p_transaction_id,
    v_key,
    p_document_id,
    v_recipient_role,
    v_action,
    case when v_action = 'published' then now() else null end,
    case when v_action = 'published' then auth.uid() else null end,
    case when v_action = 'withdrawn' then now() else null end,
    case when v_action = 'withdrawn' then auth.uid() else null end,
    auth.uid(),
    now()
  )
  on conflict (transaction_id, document_definition_key) do update
  set document_id = excluded.document_id,
      recipient_role = excluded.recipient_role,
      publication_status = excluded.publication_status,
      published_at = case when excluded.publication_status = 'published' then now() else transaction_attorney_client_financial_document_metadata.published_at end,
      published_by = case when excluded.publication_status = 'published' then auth.uid() else transaction_attorney_client_financial_document_metadata.published_by end,
      withdrawn_at = case when excluded.publication_status = 'withdrawn' then now() else null end,
      withdrawn_by = case when excluded.publication_status = 'withdrawn' then auth.uid() else null end,
      updated_by = auth.uid(),
      updated_at = now()
  returning * into v_metadata;

  if v_previous_document_id is not null and v_previous_document_id <> p_document_id then
    update public.documents
    set is_client_visible = false,
        visibility_scope = 'internal'
    where id = v_previous_document_id;
  end if;

  update public.documents
  set is_client_visible = (v_action = 'published'),
      visibility_scope = case when v_action = 'published' then 'shared' else 'internal' end,
      client_recipient_role = v_recipient_role
  where id = p_document_id;

  insert into public.attorney_client_financial_document_publication_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    document_definition_key,
    document_id,
    recipient_role,
    action,
    actor_user_id
  ) values (
    p_organisation_id,
    p_attorney_firm_id,
    p_transaction_id,
    v_key,
    p_document_id,
    v_recipient_role,
    v_action,
    auth.uid()
  );

  return to_jsonb(v_metadata);
end;
$$;
revoke all on function public.bridge_set_attorney_client_financial_document_publication(uuid, uuid, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.bridge_set_attorney_client_financial_document_publication(uuid, uuid, uuid, text, uuid, text)
  to authenticated;
create or replace function public.bridge_attorney_client_financial_documents_by_token(
  p_token text,
  p_recipient_role text,
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
  v_transaction_id uuid;
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_result jsonb;
begin
  if v_token is null or v_recipient_role not in ('buyer', 'seller') then
    return '[]'::jsonb;
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
      return '[]'::jsonb;
    end if;
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  if v_transaction_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', document_row.id,
    'transaction_id', document_row.transaction_id,
    'name', document_row.name,
    'file_path', document_row.file_path,
    'category', document_row.category,
    'document_type', document_row.document_type,
    'visibility_scope', 'client',
    'is_client_visible', true,
    'client_recipient_role', metadata.recipient_role,
    'publication_status', metadata.publication_status,
    'published_at', metadata.published_at,
    'invoice_reference', metadata.invoice_reference,
    'amount', metadata.amount,
    'document_date', metadata.document_date,
    'payment_due_date', metadata.payment_due_date,
    'notes', metadata.notes,
    'created_at', document_row.created_at
  ) order by metadata.published_at desc), '[]'::jsonb)
  into v_result
  from public.transaction_attorney_client_financial_document_metadata metadata
  join public.documents document_row on document_row.id = metadata.document_id
  where metadata.transaction_id = v_transaction_id
    and metadata.recipient_role = v_recipient_role
    and metadata.publication_status = 'published';

  return coalesce(v_result, '[]'::jsonb);
end;
$$;
revoke all on function public.bridge_attorney_client_financial_documents_by_token(text, text, text)
  from public;
grant execute on function public.bridge_attorney_client_financial_documents_by_token(text, text, text)
  to anon, authenticated;
comment on table public.attorney_client_financial_document_publication_events is
  'Immutable Phase 3 audit history for publishing and withdrawing buyer/seller attorney financial documents.';
comment on function public.bridge_attorney_client_financial_documents_by_token(text, text, text) is
  'Returns published attorney financial documents only after validating the matching buyer or seller portal token.';
notify pgrst, 'reload schema';
commit;
