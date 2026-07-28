-- Normalize ambiguous bond finance document metadata and seed the canonical bond grant requirement.

update public.transaction_required_documents
set
  group_key = 'finance',
  group_label = 'Finance',
  required_from_role = 'bond_originator',
  visibility_scope = case
    when lower(coalesce(document_key, '') || ' ' || coalesce(document_label, '')) ~ '(guarantee)'
      then 'shared'
    else 'client'
  end,
  description = coalesce(
    nullif(description, ''),
    case
      when lower(coalesce(document_key, '') || ' ' || coalesce(document_label, '')) ~ '(guarantee)'
        then 'Purchase price guarantee required in the form approved by the transferring attorney.'
      else 'Formal bond grant or approval letter from the bond originator.'
    end
  ),
  updated_at = now()
where lower(coalesce(document_key, '') || ' ' || coalesce(document_label, '')) ~
  '(bond.?grant|grant.?letter|approved.?grant|bond.?approval|bond.?pre.?approval|home.?loan.?approval|loan.?approval|purchase.?price.?guarantee|bank.?guarantee|guarantee)';

insert into public.transaction_required_documents (
  transaction_id,
  document_key,
  document_label,
  is_required,
  is_uploaded,
  status,
  enabled,
  group_key,
  group_label,
  description,
  required_from_role,
  visibility_scope,
  allow_multiple,
  sort_order,
  created_at,
  updated_at
)
select
  t.id,
  'bond_grant',
  'Bond grant',
  true,
  false,
  'missing',
  true,
  'finance',
  'Finance',
  'Formal bond grant or approval letter from the bond originator.',
  'bond_originator',
  'client',
  false,
  coalesce((
    select max(trd.sort_order) + 1
    from public.transaction_required_documents trd
    where trd.transaction_id = t.id
  ), 80),
  now(),
  now()
from public.transactions t
where lower(coalesce(t.finance_type, '')) ~ '(bond|hybrid|mortgage|home.?loan)'
  and lower(coalesce(t.current_main_stage, '')) not in ('cancelled', 'complete', 'completed', 'registered', 'registration', 'post_registration')
  and not exists (
    select 1
    from public.transaction_required_documents existing
    where existing.transaction_id = t.id
      and lower(coalesce(existing.document_key, '')) in ('bond_grant', 'grant_letter', 'bond_grant_letter')
  )
on conflict (transaction_id, document_key) do nothing;

update public.documents
set
  category = coalesce(nullif(category, ''), 'Guarantees'),
  document_type = case
    when lower(coalesce(document_type, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '')) ~
      '(bond.?grant|grant.?letter|approved.?grant|bond.?approval|bond.?pre.?approval|home.?loan.?approval|loan.?approval)'
      then 'bond_grant'
    when lower(coalesce(document_type, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '')) ~ '(guarantee)'
      then 'purchase_price_guarantee'
    else document_type
  end,
  visibility_scope = case
    when lower(coalesce(document_type, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '')) ~ '(guarantee)'
      then coalesce(nullif(visibility_scope, ''), 'shared')
    else coalesce(nullif(visibility_scope, ''), 'client')
  end,
  uploaded_by_party = coalesce(nullif(uploaded_by_party, ''), 'bond_originator'),
  bucket_key = coalesce(nullif(bucket_key, ''), 'finance'),
  finance_lane = coalesce(nullif(finance_lane, ''), 'bond')
where lower(coalesce(document_type, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '')) ~
  '(bond.?grant|grant.?letter|approved.?grant|bond.?approval|bond.?pre.?approval|home.?loan.?approval|loan.?approval|purchase.?price.?guarantee|bank.?guarantee|guarantee)';
