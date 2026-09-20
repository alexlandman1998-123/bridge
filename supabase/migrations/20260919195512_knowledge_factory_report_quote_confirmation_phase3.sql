begin;

-- A quote is a cost-only UAT validation of the fixed package query for one
-- selected property. It deliberately stores only aggregate cost metrics, never
-- a supplier response or property/party data.
alter table public.knowledge_factory_report_purchase_intents
  drop constraint if exists knowledge_factory_report_purchase_intents_status_check;

alter table public.knowledge_factory_report_purchase_intents
  add column quoted_supplier_credits integer check (quoted_supplier_credits is null or quoted_supplier_credits >= 0),
  add column quoted_field_cost integer check (quoted_field_cost is null or quoted_field_cost >= 0),
  add column quoted_type_cost integer check (quoted_type_cost is null or quoted_type_cost >= 0),
  add column quoted_price_surcharge integer check (quoted_price_surcharge is null or quoted_price_surcharge >= 0),
  add column quote_expires_at timestamptz,
  add column confirmation_attested_at timestamptz,
  add column confirmed_at timestamptz;

-- Preserve the audit history of older confirmed/executed UAT intents while
-- making their legacy confirmation explicit for the new lifecycle rule.
update public.knowledge_factory_report_purchase_intents
set
  quote_expires_at = coalesce(quote_expires_at, created_at + interval '20 minutes'),
  confirmation_attested_at = case
    when status in ('confirmed_pending_execution', 'executing', 'executed', 'execution_failed')
      then coalesce(confirmation_attested_at, created_at)
    else confirmation_attested_at
  end,
  confirmed_at = case
    when status in ('confirmed_pending_execution', 'executing', 'executed', 'execution_failed')
      then coalesce(confirmed_at, created_at)
    else confirmed_at
  end;

alter table public.knowledge_factory_report_purchase_intents
  add constraint knowledge_factory_report_purchase_intents_status_check check (
    status in ('quoted', 'confirmed_pending_execution', 'executing', 'executed', 'execution_failed', 'cancelled', 'expired')
  ),
  add constraint knowledge_factory_report_purchase_intents_quote_check check (
    (status = 'quoted' and quote_expires_at is not null and confirmation_attested_at is null)
    or (status in ('confirmed_pending_execution', 'executing', 'executed', 'execution_failed') and quote_expires_at is not null and confirmation_attested_at is not null and confirmed_at is not null)
    or status in ('cancelled', 'expired')
  );

create index knowledge_factory_report_purchase_intents_quote_expiry_idx
  on public.knowledge_factory_report_purchase_intents (organisation_id, status, quote_expires_at);

comment on column public.knowledge_factory_report_purchase_intents.quoted_supplier_credits is
  'Aggregate UAT cost-only quote for the fixed package query; not a supplier response payload.';
comment on column public.knowledge_factory_report_purchase_intents.confirmation_attested_at is
  'Timestamp at which the requesting user attested that the stated business purpose and authority are valid.';

commit;
