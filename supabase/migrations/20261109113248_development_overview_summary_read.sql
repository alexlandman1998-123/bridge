-- One bounded, read-only overview. All underlying SELECT policies still apply.
-- Detailed inventory, documents and configuration retain their existing readers.
begin;

create function public.bridge_development_overview_summary(
  p_development_id uuid,
  p_after_unit_id uuid default null
) returns jsonb
language sql stable security invoker
set search_path = ''
as $function$
with permitted_development as (
  select d.id from public.developments d
  where d.id = p_development_id and (select auth.uid()) is not null
), facts as materialized (
  select u.id, u.unit_number, u.status,
    t.id as transaction_id, coalesce(t.updated_at, t.created_at) as changed_at,
    coalesce(t.sales_price, t.purchase_price, u.list_price, u.price, 0) as value,
    t.onboarding_status, t.attorney, t.bond_originator,
    case
      when lower(trim(u.status)) in ('not released', 'blocked') then 'BLOCKED'
      when lower(trim(u.status)) = 'reserved' then 'DEP'
      when lower(trim(u.status)) in ('otp signed', 'sold') then 'OTP'
      when lower(trim(u.status)) = 'finance pending' then 'FIN'
      when lower(trim(u.status)) = 'proceed to attorneys' then 'ATTY'
      when lower(trim(u.status)) = 'transfer in progress' then 'XFER'
      when lower(trim(u.status)) in ('registered', 'complete', 'completed') then 'REG'
      when upper(trim(t.current_main_stage)) in ('AVAIL','DEP','OTP','FIN','ATTY','XFER','REG') then upper(trim(t.current_main_stage))
      when lower(t.stage) like '%registered%' then 'REG'
      when lower(t.stage) = 'reserved' or lower(t.stage) like '%deposit%' then 'DEP'
      when lower(t.stage) like '%otp%' then 'OTP'
      when lower(t.stage) like '%finance%' or lower(t.stage) like '%bond%' then 'FIN'
      when lower(t.stage) like '%attorney%' or lower(t.stage) like '%transfer preparation%' or lower(t.stage) like '%proceed to attorneys%' then 'ATTY'
      when lower(t.stage) like '%transfer%' then 'XFER'
      else 'AVAIL'
    end as stage_key
  from public.units u
  join permitted_development d on d.id = u.development_id
  left join lateral (
    select t.* from public.transactions t
    where t.unit_id = u.id and t.development_id = p_development_id
      and t.is_active is distinct from false
      and t.archived_at is null and t.cancelled_at is null
      and (to_jsonb(t)->>'deleted_at') is null
      and lower(trim(coalesce(t.lifecycle_state, ''))) not in ('archived','cancelled','canceled','deleted')
    order by t.created_at desc nulls last, t.id desc limit 1
  ) t on true
), totals as (
  select count(*) as total_units,
    count(*) filter(where stage_key = 'AVAIL') as available,
    count(*) filter(where stage_key = 'REG') as registered,
    count(*) filter(where stage_key in ('DEP','OTP','FIN','ATTY','XFER')) as in_progress,
    count(*) filter(where stage_key in ('ATTY','XFER')) as in_transfer,
    coalesce(sum(value) filter(where stage_key = 'REG'), 0) as registered_value,
    coalesce(sum(value) filter(where stage_key in ('DEP','OTP','FIN','ATTY','XFER')), 0) as pipeline_value,
    count(*) filter(where transaction_id is not null and nullif(trim(onboarding_status), '') is not null
      and lower(trim(onboarding_status)) not in ('complete','completed','submitted','client_onboarding_complete')) as onboarding_attention,
    coalesce(bool_or(nullif(trim(attorney), '') is not null), false) as attorney_connected,
    coalesce(bool_or(nullif(trim(bond_originator), '') is not null), false) as bond_connected
  from facts
), stages as (
  select coalesce(jsonb_object_agg(stage_key, n), '{}'::jsonb) as counts
  from (select stage_key, count(*) as n from facts group by stage_key) s
), attention as (
  select *, greatest(0, floor(extract(epoch from (now() - changed_at)) / 86400)) as days_in_stage
  from facts where transaction_id is not null and stage_key in ('DEP','OTP','FIN','ATTY','XFER')
), flagged as (
  select * from attention where days_in_stage > case stage_key when 'DEP' then 7 when 'OTP' then 7 when 'FIN' then 14 when 'ATTY' then 21 when 'XFER' then 14 end
), page_candidates as (
  select * from facts where p_after_unit_id is null or id > p_after_unit_id order by id limit 26
), page as (
  select * from page_candidates order by id limit 25
), attention_cards as (
  select id, days_in_stage from flagged order by days_in_stage desc, id limit 3
), recent_cards as (
  select id, changed_at from facts where transaction_id is not null order by changed_at desc nulls last, id limit 4
), card_ids as (
  select id from page union select id from attention_cards union select id from recent_cards
), cards as materialized (
  -- Serialize details only for the page and bounded samples, not every unit.
  select f.id, f.stage_key,
    jsonb_build_object(
      'id', u.id, 'development_id', u.development_id, 'unit_number', u.unit_number,
      'unit_label', u.unit_label, 'phase', u.phase, 'block', u.block, 'unit_type', u.unit_type,
      'bedrooms', u.bedrooms, 'bathrooms', u.bathrooms, 'parking_count', u.parking_count,
      'size_sqm', u.size_sqm, 'list_price', u.list_price, 'current_price', u.current_price,
      'price', u.price, 'status', u.status, 'vat_applicable', u.vat_applicable,
      'floorplan_id', u.floorplan_id, 'catalogue_floorplan_id', u.catalogue_floorplan_id,
      'unit_type_id', u.unit_type_id, 'structure_node_id', u.structure_node_id
    ) as unit,
    case when t.id is not null then jsonb_build_object(
      'id', t.id, 'unit_id', t.unit_id, 'development_id', t.development_id,
      'stage', t.stage, 'current_main_stage', t.current_main_stage,
      'sales_price', t.sales_price, 'purchase_price', t.purchase_price,
      'finance_type', t.finance_type, 'onboarding_status', t.onboarding_status,
      'attorney', left(t.attorney, 200), 'bond_originator', left(t.bond_originator, 200),
      'next_action', left(t.next_action, 300), 'created_at', t.created_at, 'updated_at', t.updated_at
    ) end as transaction,
    case when b.id is not null then jsonb_build_object('id', b.id, 'name', left(b.name, 200)) end as buyer
  from card_ids ids join facts f on f.id = ids.id
  join public.units u on u.id = f.id and u.development_id = p_development_id
  left join public.transactions t on t.id = f.transaction_id
  left join public.buyers b on b.id = t.buyer_id
)
select case when not exists(select 1 from permitted_development) then null else jsonb_build_object(
  'contract', 'development-overview-v1', 'developmentId', p_development_id,
  'summary', jsonb_build_object(
    'totalUnits', total_units, 'available', available, 'registered', registered,
    'inProgress', in_progress, 'inTransfer', in_transfer,
    'registeredValue', registered_value, 'pipelineValue', pipeline_value,
    'stageCounts', stages.counts, 'onboardingAttentionCount', onboarding_attention,
    'attorneyConnected', attorney_connected, 'bondOriginatorConnected', bond_connected,
    'attentionCount', (select count(*) from flagged)
  ),
  'rows', coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'transaction', transaction, 'buyer', buyer, 'mainStage', stage_key) order by id) from cards where id in (select id from page)), '[]'::jsonb),
  'nextCursor', case when (select count(*) from page_candidates) > 25 then (select id from page order by id desc limit 1) else null end,
  'attentionRows', coalesce((select jsonb_agg(jsonb_build_object('unit', c.unit, 'transaction', c.transaction, 'buyer', c.buyer, 'mainStage', c.stage_key, 'daysInStage', a.days_in_stage) order by a.days_in_stage desc, c.id)
    from cards c join attention_cards a on a.id = c.id), '[]'::jsonb),
  'recentRows', coalesce((select jsonb_agg(jsonb_build_object('unit', c.unit, 'transaction', c.transaction, 'buyer', c.buyer, 'mainStage', c.stage_key) order by r.changed_at desc nulls last, c.id)
    from cards c join recent_cards r on r.id = c.id), '[]'::jsonb)
) end from totals cross join stages;
$function$;

revoke all on function public.bridge_development_overview_summary(uuid, uuid) from public, anon;
grant execute on function public.bridge_development_overview_summary(uuid, uuid) to authenticated;
comment on function public.bridge_development_overview_summary(uuid, uuid) is
  'RLS-preserving development totals, 25 units, at most three attention rows and four recent rows. No writes or document/storage access.';
commit;
