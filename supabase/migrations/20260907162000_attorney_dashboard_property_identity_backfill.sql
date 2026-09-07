-- Remove transactions that were reset or deleted from attorney active-work
-- queues. The write path already performs this update; this repairs legacy
-- records created before that contract was enforced consistently.
update public.transactions
set is_active = false,
    updated_at = now()
where is_active = true
  and (
    lower(coalesce(lifecycle_state, '')) in ('archived', 'cancelled', 'deleted')
    or lower(coalesce(stage, '')) = 'available'
    or lower(coalesce(current_main_stage, '')) in ('avail', 'available')
    or lower(coalesce(next_action, '')) like 'transaction deleted%'
    or lower(coalesce(next_action, '')) like 'transaction reset to available%'
  );

-- Backfill only data that is proven by a linked development unit. This gives
-- legacy sectional-title matters the same scheme/unit label and sale value as
-- new matters, without guessing links for reset records.
update public.transactions transaction
set property_tenure = coalesce(nullif(transaction.property_tenure, ''), 'sectional_title'),
    property_description = coalesce(
      nullif(transaction.property_description, ''),
      concat_ws(' · ', development.name, concat('Unit ', unit.unit_number))
    ),
    purchase_price = coalesce(nullif(transaction.purchase_price, 0), nullif(unit.price, 0)),
    sales_price = coalesce(nullif(transaction.sales_price, 0), nullif(unit.price, 0)),
    updated_at = now()
from public.units unit
join public.developments development on development.id = unit.development_id
where transaction.unit_id = unit.id
  and coalesce(transaction.transaction_type, '') in ('developer_sale', 'development')
  and transaction.is_active = true;

-- Populate the legacy transaction contact only where a live attorney
-- assignment already identifies the responsible user.
with ranked_assignments as (
  select distinct on (assignment.transaction_id)
    assignment.transaction_id,
    profile.email
  from public.transaction_attorney_assignments assignment
  join public.profiles profile
    on profile.id = coalesce(assignment.attorney_user_id, assignment.primary_attorney_id)
  where coalesce(assignment.assignment_status, assignment.status, 'active') in ('pending', 'active', 'paused')
    and nullif(trim(coalesce(profile.email, '')), '') is not null
  order by assignment.transaction_id, assignment.updated_at desc nulls last
)
update public.transactions transaction
set assigned_attorney_email = ranked_assignments.email,
    updated_at = now()
from ranked_assignments
where transaction.id = ranked_assignments.transaction_id
  and nullif(trim(coalesce(transaction.assigned_attorney_email, '')), '') is null;

-- Private/full-title matters take their canonical address from their linked
-- listing when the transaction itself has no captured address.
update public.transactions transaction
set property_address_line_1 = coalesce(
      nullif(transaction.property_address_line_1, ''),
      nullif(listing.formatted_address, ''),
      nullif(listing.street_address, ''),
      nullif(listing.address_line_1, '')
    ),
    property_description = coalesce(nullif(transaction.property_description, ''), nullif(listing.title, '')),
    updated_at = now()
from public.private_listings listing
where transaction.listing_id = listing.id
  and transaction.is_active = true;

-- The hot-path RPC may already be installed when this migration runs. Recreate
-- that exact v1 function definition with the linked property projection and
-- active-work guard used by new installations above.
do $$
declare
  function_sql text;
  original_sql text;
begin
  select pg_get_functiondef('public.get_attorney_dashboard_snapshot(uuid, text, integer)'::regprocedure)
    into function_sql;
  original_sql := function_sql;

  if position('left join public.units u on u.id = t.unit_id' in function_sql) > 0 then
    return;
  end if;

  function_sql := replace(
      function_sql,
      E'      t.id,\n      t.buyer_id,',
      E'      t.id,\n      t.buyer_id,\n      t.listing_id,\n      t.development_id,\n      t.unit_id,'
  );
  function_sql := replace(
      function_sql,
      E'      t.matter_number,\n      t.transaction_reference,',
      E'      t.matter_number,\n      t.transaction_reference,\n      t.transaction_type,\n      t.property_type,\n      t.property_tenure,'
  );
  function_sql := replace(
      function_sql,
      E'      t.updated_at\n    from matter_roles mr\n    join public.transactions t on t.id = mr.transaction_id\n    where t.is_active = true',
      E'      t.updated_at,\n      u.unit_number,\n      u.price as unit_price,\n      d.name as development_name,\n      d.location as development_address,\n      listing.title as listing_title,\n      listing.formatted_address as listing_formatted_address,\n      listing.street_address as listing_street_address,\n      listing.address_line_1 as listing_address_line_1\n    from matter_roles mr\n    join public.transactions t on t.id = mr.transaction_id\n    left join public.units u on u.id = t.unit_id\n    left join public.developments d on d.id = coalesce(t.development_id, u.development_id)\n    left join public.private_listings listing on listing.id = t.listing_id\n    where t.is_active = true\n      and lower(coalesce(t.lifecycle_state, \'active\')) not in (\'archived\', \'cancelled\', \'deleted\')\n      and lower(coalesce(t.stage, \'\')) <> \'available\'\n      and lower(coalesce(t.current_main_stage, \'\')) not in (\'avail\', \'available\')\n      and lower(coalesce(t.next_action, \'\')) not like \'transaction deleted%\'\n      and lower(coalesce(t.next_action, \'\')) not like \'transaction reset to available%\''
  );

  if function_sql = original_sql then
    raise exception 'Could not upgrade get_attorney_dashboard_snapshot to the property identity projection.';
  end if;

  execute function_sql;
end;
$$;
