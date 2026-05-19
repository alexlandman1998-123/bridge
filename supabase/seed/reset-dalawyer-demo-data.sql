begin;

do $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_firm_id uuid;
  v_tx_ids uuid[] := array[]::uuid[];
  v_buyer_ids uuid[] := array[]::uuid[];
  v_subprocess_ids uuid[] := array[]::uuid[];
begin
  select p.id
    into v_user_id
  from public.profiles p
  where lower(p.email) = lower('info@yakstack.co')
  limit 1;

  if v_user_id is null then
    raise notice 'Dalawyer demo reset skipped: profile info@yakstack.co was not found.';
    return;
  end if;

  select f.id
    into v_firm_id
  from public.attorney_firms f
  where lower(f.name) = lower('Dalawyer Lawyers')
     or f.id = (select p.primary_attorney_firm_id from public.profiles p where p.id = v_user_id)
  order by case when lower(f.name) = lower('Dalawyer Lawyers') then 0 else 1 end
  limit 1;

  if v_firm_id is null then
    raise notice 'Dalawyer demo reset skipped: attorney firm Dalawyer Lawyers was not found.';
    return;
  end if;

  select f.organisation_id
    into v_org_id
  from public.attorney_firms f
  where f.id = v_firm_id;

  if v_org_id is null then
    select ou.organisation_id
      into v_org_id
    from public.organisation_users ou
    where ou.user_id = v_user_id
      and coalesce(ou.status, 'active') = 'active'
    order by ou.created_at desc nulls last
    limit 1;
  end if;

  select coalesce(array_agg(distinct t.id), array[]::uuid[])
    into v_tx_ids
  from public.transactions t
  where t.is_demo_data = true
    and (
      (v_org_id is not null and t.organisation_id = v_org_id)
      or exists (
        select 1
        from public.transaction_attorney_assignments taa
        where taa.transaction_id = t.id
          and coalesce(taa.attorney_firm_id, taa.firm_id) = v_firm_id
      )
    );

  select coalesce(array_agg(distinct t.buyer_id), array[]::uuid[])
    into v_buyer_ids
  from public.transactions t
  where t.id = any(v_tx_ids)
    and t.buyer_id is not null;

  select coalesce(array_agg(distinct ts.id), array[]::uuid[])
    into v_subprocess_ids
  from public.transaction_subprocesses ts
  where ts.transaction_id = any(v_tx_ids)
    and ts.is_demo_data = true;

  delete from public.transaction_attorney_lane_updates
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.transaction_attorney_lane_history
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.attorney_workflow_blockers
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.document_requests
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.documents
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.transaction_subprocess_steps
  where is_demo_data = true
    and subprocess_id = any(v_subprocess_ids);

  delete from public.transaction_subprocesses
  where is_demo_data = true
    and id = any(v_subprocess_ids);

  delete from public.transaction_events
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.transaction_attorney_assignments
  where is_demo_data = true
    and transaction_id = any(v_tx_ids);

  delete from public.transactions
  where is_demo_data = true
    and id = any(v_tx_ids);

  delete from public.buyers
  where is_demo_data = true
    and id = any(v_buyer_ids);

  delete from public.attorney_firms
  where is_demo_data = true
    and name in ('Tuckers Inc', 'Meyer & Partners Conveyancers', 'Northside Bond Attorneys');

  raise notice 'Dalawyer demo reset complete. Removed % transactions.', coalesce(array_length(v_tx_ids, 1), 0);
end $$;

commit;
