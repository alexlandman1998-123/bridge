begin;

insert into public.onboarding_form_data (
  transaction_id,
  purchaser_type,
  form_data,
  created_at,
  updated_at
)
select
  tx.id,
  case
    when tx.purchaser_type in ('individual', 'married_anc', 'married_coc', 'company', 'trust', 'foreign_purchaser')
      then tx.purchaser_type
    else 'individual'
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'source', 'transaction_setup_backfill',
    'buyerId', tx.buyer_id,
    'backfilledAt', now()
  )),
  now(),
  now()
from public.transactions tx
where tx.created_at >= now() - interval '24 hours'
  and not exists (
    select 1
    from public.onboarding_form_data existing
    where existing.transaction_id = tx.id
  )
on conflict (transaction_id) do nothing;

insert into public.transaction_finance_details (
  transaction_id,
  created_at,
  updated_at
)
select
  tx.id,
  now(),
  now()
from public.transactions tx
where tx.created_at >= now() - interval '24 hours'
  and not exists (
    select 1
    from public.transaction_finance_details existing
    where existing.transaction_id = tx.id
  )
on conflict (transaction_id) do nothing;

insert into public.client_portal_links (
  development_id,
  unit_id,
  transaction_id,
  buyer_id,
  token,
  is_active,
  created_at,
  updated_at
)
select
  tx.development_id,
  tx.unit_id,
  tx.id,
  tx.buyer_id,
  'clp' || replace(gen_random_uuid()::text, '-', ''),
  true,
  now(),
  now()
from public.transactions tx
where tx.created_at >= now() - interval '24 hours'
  and tx.development_id is not null
  and tx.unit_id is not null
  and not exists (
    select 1
    from public.client_portal_links existing
    where existing.transaction_id = tx.id
      and existing.is_active is true
  )
on conflict (transaction_id) where is_active do nothing;

notify pgrst, 'reload schema';

commit;
