begin;

-- Older active plans can predate the current provisional-plan check. A saved
-- "unknown" must not silently mean cash finance or no seller bond at any
-- attorney's readiness, lodgement, or registration milestone.
create or replace function journey_private.enforce_known_attorney_lodgement_facts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_profile jsonb;
  v_finance text;
  v_seller_bond text;
begin
  if new.status <> 'completed' or new.step_key not in (
    'lodgement_ready', 'lodged_at_deeds_office', 'registered',
    'bond_lodgement_ready', 'bond_lodged', 'bond_registered',
    'cancellation_lodgement_ready', 'cancellation_lodged', 'cancellation_registered'
  ) then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.comment is not distinct from new.comment then return new; end if;

  select t.routing_profile_json into v_profile
  from public.transaction_subprocesses lane
  join public.transactions t on t.id = lane.transaction_id
  where lane.id = new.subprocess_id and lane.process_type in ('transfer', 'bond', 'cancellation');
  if not found then return new; end if;

  v_finance := pg_catalog.lower(pg_catalog.btrim(coalesce(
    v_profile ->> 'financeType', v_profile #>> '{workflowPlan,configuration,financeType}', 'unknown')));
  v_seller_bond := pg_catalog.lower(pg_catalog.btrim(coalesce(
    v_profile #>> '{mvpProfile,sellerExistingBond}', '')));
  if v_finance in ('', 'unknown') then
    raise exception 'Confirm buyer finance before attorney lodgement readiness.' using errcode = '22023';
  end if;
  if v_seller_bond in ('unknown', 'not_confirmed') then
    raise exception 'Confirm whether the seller has an existing bond before attorney lodgement readiness.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function journey_private.enforce_known_attorney_lodgement_facts()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_attorney_known_lodgement_facts on public.transaction_subprocess_steps;
create trigger trg_enforce_attorney_known_lodgement_facts
before insert or update of status, comment on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_known_attorney_lodgement_facts();

commit;
