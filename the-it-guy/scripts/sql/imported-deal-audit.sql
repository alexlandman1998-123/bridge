-- Read-only inventory. Set the organisation in scope before executing.
-- This organisation is the Produktive batch discussed on 1 October 2026.
-- No buyer matching, attachment changes, date inference or backfill occurs.
with scope as (
  select 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'::uuid as organisation_id
), snapshot as (
  select jsonb_build_object(
    'transaction', jsonb_build_object(
      'id', t.id, 'organisation_id', t.organisation_id,
      'transaction_reference', t.transaction_reference,
      'transaction_origin_source', t.transaction_origin_source, 'comment', t.comment,
      'buyer_id', t.buyer_id, 'buyer_name', t.buyer_name,
      'primary_buyer_participant_id', t.primary_buyer_participant_id,
      'buyer_parties_model_version', t.buyer_parties_model_version,
      'purchaser_type', t.purchaser_type, 'finance_type', t.finance_type,
      'finance_managed_by', t.finance_managed_by,
      'purchase_price', t.purchase_price, 'deposit_amount', t.deposit_amount,
      'cash_amount', t.cash_amount, 'bond_amount', t.bond_amount,
      'sale_date', t.sale_date, 'stage_date', t.stage_date,
      'stage', t.stage, 'current_main_stage', t.current_main_stage
    ),
    'buyerProfile', (select jsonb_build_object('id', b.id, 'name', b.name) from public.buyers b where b.id = t.buyer_id),
    'buyerParties', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'buyer_party_id', p.buyer_party_id, 'is_primary_buyer', p.is_primary_buyer
    ) order by p.id) from public.transaction_participants p
      where p.transaction_id = t.id and p.transaction_role = 'buyer' and p.removed_at is null), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'file_name', d.file_name, 'document_type', d.document_type,
      'file_path', d.file_path, 'file_bucket', d.file_bucket,
      'available', exists(select 1 from storage.objects o
        where o.bucket_id = coalesce(nullif(d.file_bucket, ''), 'documents') and o.name = d.file_path)
    ) order by d.id) from public.documents d where d.transaction_id = t.id), '[]'::jsonb)
  ) as record
  from public.transactions t join scope s on t.organisation_id = s.organisation_id
)
select jsonb_build_object(
  'organisationId', (select organisation_id from scope),
  'records', coalesce((select jsonb_agg(record order by record #>> '{transaction,transaction_reference}') from snapshot), '[]'::jsonb)
) as audit_input;
