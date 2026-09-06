begin;

with candidate_links as (
  select distinct on (link.transaction_id)
    link.id
  from public.client_portal_links link
  join public.transactions tx
    on tx.id = link.transaction_id
   and tx.development_id = link.development_id
   and tx.unit_id = link.unit_id
   and (link.buyer_id is null or tx.buyer_id = link.buyer_id)
  left join public.development_settings settings
    on settings.development_id = tx.development_id
  where tx.created_at >= now() - interval '24 hours'
    and coalesce(settings.client_portal_enabled, true) is true
    and link.is_active is false
    and not exists (
      select 1
      from public.client_portal_links active_link
      where active_link.transaction_id = link.transaction_id
        and active_link.is_active is true
    )
  order by link.transaction_id, link.updated_at desc nulls last, link.created_at desc nulls last
)
update public.client_portal_links link
set is_active = true,
    updated_at = now()
from candidate_links candidate
where link.id = candidate.id;

notify pgrst, 'reload schema';

commit;
