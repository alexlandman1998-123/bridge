begin;
create table if not exists public.transaction_attorney_client_financial_document_metadata (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  invoice_reference text,
  amount numeric(14, 2),
  document_date date,
  payment_due_date date,
  notes text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, document_definition_key),
  constraint transaction_attorney_client_financial_metadata_definition_check check (
    document_definition_key in (
      'buyer_transfer_cost_invoice',
      'seller_attorney_invoice',
      'buyer_final_statement',
      'seller_final_statement'
    )
  ),
  constraint transaction_attorney_client_financial_metadata_amount_check check (
    amount is null or amount >= 0
  ),
  constraint transaction_attorney_client_financial_metadata_invoice_fields_check check (
    document_definition_key in ('buyer_transfer_cost_invoice', 'seller_attorney_invoice')
    or (
      invoice_reference is null
      and amount is null
      and payment_due_date is null
    )
  )
);
create index if not exists transaction_attorney_client_financial_metadata_scope_idx
  on public.transaction_attorney_client_financial_document_metadata (
    organisation_id,
    attorney_firm_id,
    transaction_id
  );
create or replace function public.bridge_validate_transaction_attorney_client_financial_metadata_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.attorney_firms firm
    where firm.id = new.attorney_firm_id
      and firm.organisation_id = new.organisation_id
      and firm.is_active = true
  ) then
    raise exception 'Attorney financial document firm scope is invalid.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.transactions transaction_record
    where transaction_record.id = new.transaction_id
      and transaction_record.organisation_id = new.organisation_id
  ) then
    raise exception 'Attorney financial document transaction scope is invalid.' using errcode = '23514';
  end if;

  return new;
end;
$$;
drop trigger if exists transaction_attorney_client_financial_metadata_scope_guard
  on public.transaction_attorney_client_financial_document_metadata;
create trigger transaction_attorney_client_financial_metadata_scope_guard
before insert or update on public.transaction_attorney_client_financial_document_metadata
for each row execute function public.bridge_validate_transaction_attorney_client_financial_metadata_scope();
revoke all on function public.bridge_validate_transaction_attorney_client_financial_metadata_scope()
  from public, anon, authenticated;
drop trigger if exists transaction_attorney_client_financial_metadata_set_updated_at
  on public.transaction_attorney_client_financial_document_metadata;
create trigger transaction_attorney_client_financial_metadata_set_updated_at
before update on public.transaction_attorney_client_financial_document_metadata
for each row execute function public.bridge_set_updated_at();
alter table public.transaction_attorney_client_financial_document_metadata enable row level security;
drop policy if exists transaction_attorney_client_financial_metadata_select
  on public.transaction_attorney_client_financial_document_metadata;
create policy transaction_attorney_client_financial_metadata_select
on public.transaction_attorney_client_financial_document_metadata
for select to authenticated
using (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
);
drop policy if exists transaction_attorney_client_financial_metadata_write
  on public.transaction_attorney_client_financial_document_metadata;
create policy transaction_attorney_client_financial_metadata_write
on public.transaction_attorney_client_financial_document_metadata
for all to authenticated
using (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
  and exists (
    select 1
    from public.attorney_firm_members member
    where member.firm_id = transaction_attorney_client_financial_document_metadata.attorney_firm_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('firm_admin', 'director_partner', 'transfer_attorney', 'conveyancing_secretary')
  )
)
with check (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
  and exists (
    select 1
    from public.attorney_firm_members member
    where member.firm_id = transaction_attorney_client_financial_document_metadata.attorney_firm_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('firm_admin', 'director_partner', 'transfer_attorney', 'conveyancing_secretary')
  )
);
revoke all on public.transaction_attorney_client_financial_document_metadata from public, anon;
grant select, insert, update, delete on public.transaction_attorney_client_financial_document_metadata to authenticated;
grant all on public.transaction_attorney_client_financial_document_metadata to service_role;
comment on table public.transaction_attorney_client_financial_document_metadata is
  'Internal transaction-level invoice and statement metadata for the Phase 2 attorney workspace. Client publication is intentionally not represented here.';
notify pgrst, 'reload schema';
commit;
