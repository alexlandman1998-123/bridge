begin;

do $$
declare
  v_org_id uuid;
  v_tx_ids uuid[] := array[]::uuid[];
  v_lead_ids uuid[] := array[]::uuid[];
  v_contact_ids uuid[] := array[]::uuid[];
  v_listing_ids uuid[] := array[]::uuid[];
  v_buyer_ids uuid[] := array[]::uuid[];
  v_subprocess_ids uuid[] := array[]::uuid[];
begin
  -- Reset the workspace the real demo login is currently scoped to first. This
  -- mirrors the seed script and prevents wiping/reseeding an invisible fallback
  -- organisation while the app is looking at the authenticated membership org.
  select ou.organisation_id
    into v_org_id
  from public.organisation_users ou
  left join public.profiles p on p.id = ou.user_id
  where lower(coalesce(ou.email, p.email, '')) = lower('principal.demo@bridgenine.co.za')
    and lower(coalesce(ou.status, 'active')) = 'active'
  order by
    case when lower(coalesce(ou.role, ou.workspace_role, ou.organisation_role, '')) = 'principal' then 0 else 1 end,
    ou.updated_at desc nulls last,
    ou.created_at desc nulls last
  limit 1;

  if v_org_id is null then
    select o.id
      into v_org_id
    from public.organisations o
    where lower(coalesce(o.company_email, '')) = lower('principal.demo@bridgenine.co.za')
       or lower(o.name) = lower('Bridge9 Realty')
    order by o.created_at desc nulls last
    limit 1;
  end if;

  if v_org_id is null then
    raise notice 'Bridge9 principal demo reset skipped: Bridge9 Realty demo organisation was not found.';
    return;
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_tx_ids
  from public.transactions
  where organisation_id = v_org_id
    and is_demo_data = true;

  select coalesce(array_agg(distinct buyer_id), array[]::uuid[])
    into v_buyer_ids
  from public.transactions
  where id = any(v_tx_ids)
    and buyer_id is not null;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_subprocess_ids
  from public.transaction_subprocesses
  where transaction_id = any(v_tx_ids)
    and is_demo_data = true;

  delete from public.transaction_notifications where transaction_id = any(v_tx_ids) and is_demo_data = true;
  if to_regclass('public.transaction_readiness_states') is not null then
    delete from public.transaction_readiness_states where transaction_id = any(v_tx_ids) and is_demo_data = true;
  end if;
  delete from public.transaction_status_links where transaction_id = any(v_tx_ids) and is_demo_data = true;
  delete from public.transaction_events where transaction_id = any(v_tx_ids) and is_demo_data = true;
  delete from public.transaction_comments where transaction_id = any(v_tx_ids) and is_demo_data = true;
  delete from public.document_requests where transaction_id = any(v_tx_ids) and is_demo_data = true;
  delete from public.documents where transaction_id = any(v_tx_ids) and is_demo_data = true;
  delete from public.transaction_participants where transaction_id = any(v_tx_ids) and is_demo_data = true;
  delete from public.transaction_subprocess_steps where subprocess_id = any(v_subprocess_ids) and is_demo_data = true;
  delete from public.transaction_subprocesses where id = any(v_subprocess_ids) and is_demo_data = true;
  if to_regclass('public.transaction_finance_details') is not null then
    delete from public.transaction_finance_details where transaction_id = any(v_tx_ids) and is_demo_data = true;
  end if;
  if to_regclass('public.transaction_role_players') is not null then
    delete from public.transaction_role_players where transaction_id = any(v_tx_ids) and is_demo_data = true;
  end if;
  if to_regclass('public.transaction_onboarding') is not null then
    delete from public.transaction_onboarding where transaction_id = any(v_tx_ids) and is_demo_data = true;
  end if;
  if to_regclass('public.onboarding_form_data') is not null then
    delete from public.onboarding_form_data where transaction_id = any(v_tx_ids) and is_demo_data = true;
  end if;
  delete from public.transactions where id = any(v_tx_ids) and is_demo_data = true;
  delete from public.buyers where id = any(v_buyer_ids) and is_demo_data = true;

  if to_regclass('public.client_portal_notifications') is not null then
    execute 'delete from public.client_portal_notifications where is_demo_data = true and transaction_id = any($1)' using v_tx_ids;
  end if;

  select coalesce(array_agg(lead_id), array[]::uuid[])
    into v_lead_ids
  from public.leads
  where organisation_id = v_org_id
    and is_demo_data = true;

  select coalesce(array_agg(contact_id), array[]::uuid[])
    into v_contact_ids
  from public.contacts
  where organisation_id = v_org_id
    and is_demo_data = true;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_listing_ids
  from public.private_listings
  where organisation_id = v_org_id
    and is_demo_data = true;

  delete from public.private_listing_activity where private_listing_id = any(v_listing_ids) and is_demo_data = true;
  delete from public.private_listing_seller_onboarding where private_listing_id = any(v_listing_ids) and is_demo_data = true;
  delete from public.private_listings where id = any(v_listing_ids) and is_demo_data = true;

  delete from public.demo_canvassing_activities where organisation_id = v_org_id and is_demo_data = true;
  delete from public.demo_canvassing_records where organisation_id = v_org_id and is_demo_data = true;
  delete from public.canvassing_activities where organisation_id = v_org_id and is_demo_data = true;
  delete from public.canvassing_prospects where organisation_id = v_org_id and is_demo_data = true;
  delete from public.appointments where organisation_id = v_org_id and is_demo_data = true;
  delete from public.tasks where organisation_id = v_org_id and is_demo_data = true;
  delete from public.lead_activities where organisation_id = v_org_id and is_demo_data = true;
  delete from public.leads where lead_id = any(v_lead_ids) and is_demo_data = true;
  delete from public.contacts where contact_id = any(v_contact_ids) and is_demo_data = true;
  if to_regclass('public.organisation_preferred_partners') is not null then
    delete from public.organisation_preferred_partners where organisation_id = v_org_id and is_demo_data = true;
  end if;
  delete from public.organisation_users where organisation_id = v_org_id and is_demo_data = true;
  delete from public.organisation_branches where organisation_id = v_org_id and is_demo_data = true;
  delete from public.organisation_settings where organisation_id = v_org_id and is_demo_data = true;

  update public.demo_seed_manifests
  set status = 'needs_reset',
      updated_at = now()
  where demo_key = 'bridge9_principal_demo';

  raise notice 'Bridge9 principal demo reset complete for organisation %.', v_org_id;
end $$;

commit;
