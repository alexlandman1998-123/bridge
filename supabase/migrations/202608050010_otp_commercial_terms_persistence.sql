-- Phase 24 OTP commercial terms persistence.
--
-- Additive persistence for the commercial gaps reconciled in Phase 23:
-- 1. OTP commission variation approval records, preserving mandate commission.
-- 2. Route-scoped buyer cost obligation items for resale and new-development.
-- 3. Matter-level attorney transfer-cost quote state, scoped to transaction attorney assignments.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.otp_commission_variations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  route_variant text not null,
  mandate_commission_snapshot jsonb not null default '{}'::jsonb,
  proposed_otp_commission jsonb not null default '{}'::jsonb,
  final_otp_commission jsonb,
  variation_required boolean not null default false,
  approval_status text not null default 'pending_approval',
  approval_reference text,
  approval_reason text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  lock_state text not null default 'blocked_pending_approval',
  preserves_mandate_commission boolean not null default true,
  is_current boolean not null default true,
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint otp_commission_variations_route_check
    check (route_variant in ('resale_existing_property', 'new_development')),
  constraint otp_commission_variations_status_check
    check (approval_status in ('not_required', 'pending_approval', 'approved', 'rejected')),
  constraint otp_commission_variations_lock_state_check
    check (lock_state in ('ready_to_lock', 'blocked_pending_approval', 'blocked_rejected_variation')),
  constraint otp_commission_variations_preserve_mandate_check
    check (preserves_mandate_commission = true),
  constraint otp_commission_variations_approval_reference_check
    check (approval_status <> 'approved' or nullif(approval_reference, '') is not null),
  constraint otp_commission_variations_final_commission_check
    check (
      (approval_status in ('approved', 'not_required') and final_otp_commission is not null)
      or (approval_status in ('pending_approval', 'rejected') and final_otp_commission is null)
    )
);

create unique index if not exists otp_commission_variations_current_route_idx
  on public.otp_commission_variations (transaction_id, route_variant)
  where is_current = true;

create index if not exists otp_commission_variations_org_status_idx
  on public.otp_commission_variations (organisation_id, approval_status, updated_at desc);

drop trigger if exists otp_commission_variations_set_updated_at
  on public.otp_commission_variations;
create trigger otp_commission_variations_set_updated_at
before update on public.otp_commission_variations
for each row execute function public.set_updated_at_timestamp();

create table if not exists public.otp_cost_obligation_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  route_variant text not null,
  item_key text not null,
  category text not null,
  label text not null,
  amount numeric(14, 2),
  amount_status text not null default 'pending',
  payer_role text not null default 'buyer',
  payee_role text,
  payee_name text,
  due_event text not null default 'on_demand',
  source text not null default 'manual',
  include_in_otp boolean not null default true,
  document_keys text[] not null default '{}'::text[],
  notes text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint otp_cost_obligation_items_route_check
    check (route_variant in ('resale_existing_property', 'new_development')),
  constraint otp_cost_obligation_items_category_check
    check (category in (
      'transfer_costs',
      'bond_costs',
      'transfer_duty',
      'municipal_rates',
      'levies',
      'hoa',
      'utilities',
      'development_charges',
      'occupation_charges',
      'compliance',
      'other'
    )),
  constraint otp_cost_obligation_items_amount_status_check
    check (amount_status in ('known', 'estimated', 'pending', 'not_applicable')),
  constraint otp_cost_obligation_items_amount_check
    check (amount is null or amount >= 0),
  constraint otp_cost_obligation_items_status_check
    check (status in ('active', 'superseded', 'cancelled')),
  constraint otp_cost_obligation_items_pending_amount_check
    check (amount_status <> 'known' or amount is not null)
);

create unique index if not exists otp_cost_obligation_items_active_key_idx
  on public.otp_cost_obligation_items (transaction_id, route_variant, item_key)
  where status = 'active';

create index if not exists otp_cost_obligation_items_org_route_idx
  on public.otp_cost_obligation_items (organisation_id, route_variant, include_in_otp, updated_at desc);

drop trigger if exists otp_cost_obligation_items_set_updated_at
  on public.otp_cost_obligation_items;
create trigger otp_cost_obligation_items_set_updated_at
before update on public.otp_cost_obligation_items
for each row execute function public.set_updated_at_timestamp();

create table if not exists public.matter_attorney_cost_quote_states (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  transaction_attorney_assignment_id uuid not null references public.transaction_attorney_assignments(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  route_variant text not null,
  quote_status text not null default 'pending_upload',
  source_scope text not null default 'transaction_matter',
  document_definition_key text not null default 'buyer_transfer_cost_invoice',
  financial_document_metadata_id uuid references public.transaction_attorney_client_financial_document_metadata(id) on delete set null,
  file_url text,
  amount numeric(14, 2),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz,
  buyer_query_count integer not null default 0,
  revision_count integer not null default 0,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matter_attorney_cost_quote_states_route_check
    check (route_variant in ('resale_existing_property', 'new_development')),
  constraint matter_attorney_cost_quote_states_status_check
    check (quote_status in (
      'pending_upload',
      'uploaded',
      'buyer_viewed',
      'buyer_queried',
      'revised',
      'acknowledged',
      'superseded'
    )),
  constraint matter_attorney_cost_quote_states_source_scope_check
    check (source_scope = 'transaction_matter'),
  constraint matter_attorney_cost_quote_states_definition_check
    check (document_definition_key in ('buyer_transfer_cost_invoice', 'buyer_final_statement')),
  constraint matter_attorney_cost_quote_states_amount_check
    check (amount is null or amount >= 0),
  constraint matter_attorney_cost_quote_states_counts_check
    check (buyer_query_count >= 0 and revision_count >= 0)
);

create unique index if not exists matter_attorney_cost_quote_states_current_idx
  on public.matter_attorney_cost_quote_states (
    transaction_id,
    transaction_attorney_assignment_id,
    document_definition_key
  )
  where quote_status <> 'superseded';

create index if not exists matter_attorney_cost_quote_states_scope_idx
  on public.matter_attorney_cost_quote_states (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    quote_status,
    updated_at desc
  );

drop trigger if exists matter_attorney_cost_quote_states_set_updated_at
  on public.matter_attorney_cost_quote_states;
create trigger matter_attorney_cost_quote_states_set_updated_at
before update on public.matter_attorney_cost_quote_states
for each row execute function public.set_updated_at_timestamp();

create table if not exists public.otp_commercial_term_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  route_variant text,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint otp_commercial_term_events_entity_type_check
    check (entity_type in ('commission_variation', 'cost_obligation_item', 'matter_attorney_cost_quote')),
  constraint otp_commercial_term_events_route_check
    check (route_variant is null or route_variant in ('resale_existing_property', 'new_development'))
);

create index if not exists otp_commercial_term_events_transaction_idx
  on public.otp_commercial_term_events (transaction_id, created_at desc);

create index if not exists otp_commercial_term_events_entity_idx
  on public.otp_commercial_term_events (entity_type, entity_id, created_at desc);

create or replace function public.bridge_otp_commercial_terms_transaction_org(
  p_transaction_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select transaction_record.organisation_id
  from public.transactions transaction_record
  where transaction_record.id = p_transaction_id
  limit 1
$$;

revoke all on function public.bridge_otp_commercial_terms_transaction_org(uuid)
  from public, anon, authenticated;

create or replace function public.bridge_record_otp_commission_variation(
  p_transaction_id uuid,
  p_route_variant text,
  p_mandate_commission_snapshot jsonb,
  p_proposed_otp_commission jsonb,
  p_approval_status text default 'pending_approval',
  p_approval_reference text default null,
  p_reason text default null,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_status text := coalesce(nullif(p_approval_status, ''), 'pending_approval');
  v_variation_required boolean := coalesce(p_mandate_commission_snapshot, '{}'::jsonb) <> coalesce(p_proposed_otp_commission, '{}'::jsonb);
  v_final jsonb;
  v_lock_state text;
  v_record_id uuid;
begin
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;
  if p_route_variant not in ('resale_existing_property', 'new_development') then
    return jsonb_build_object('success', false, 'code', 'invalid_route_variant');
  end if;
  if v_status not in ('not_required', 'pending_approval', 'approved', 'rejected') then
    return jsonb_build_object('success', false, 'code', 'invalid_approval_status');
  end if;

  v_organisation_id := public.bridge_otp_commercial_terms_transaction_org(p_transaction_id);
  if v_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.bridge_is_active_member(v_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if v_status = 'approved' and nullif(p_approval_reference, '') is null then
    return jsonb_build_object('success', false, 'code', 'approval_reference_required');
  end if;

  v_final := case
    when v_status = 'approved' then coalesce(p_proposed_otp_commission, '{}'::jsonb)
    when v_status = 'not_required' then coalesce(nullif(p_proposed_otp_commission, '{}'::jsonb), p_mandate_commission_snapshot, '{}'::jsonb)
    else null
  end;

  v_lock_state := case
    when v_status in ('approved', 'not_required') then 'ready_to_lock'
    when v_status = 'rejected' then 'blocked_rejected_variation'
    else 'blocked_pending_approval'
  end;

  update public.otp_commission_variations
     set is_current = false,
         superseded_at = now(),
         updated_at = now()
   where transaction_id = p_transaction_id
     and route_variant = p_route_variant
     and is_current = true;

  insert into public.otp_commission_variations (
    organisation_id,
    transaction_id,
    route_variant,
    mandate_commission_snapshot,
    proposed_otp_commission,
    final_otp_commission,
    variation_required,
    approval_status,
    approval_reference,
    approval_reason,
    requested_by,
    approved_by,
    approved_at,
    rejected_by,
    rejected_at,
    lock_state,
    metadata
  )
  values (
    v_organisation_id,
    p_transaction_id,
    p_route_variant,
    coalesce(p_mandate_commission_snapshot, '{}'::jsonb),
    coalesce(p_proposed_otp_commission, '{}'::jsonb),
    v_final,
    v_variation_required,
    v_status,
    nullif(p_approval_reference, ''),
    nullif(p_reason, ''),
    p_actor_id,
    case when v_status = 'approved' then p_actor_id else null end,
    case when v_status = 'approved' then now() else null end,
    case when v_status = 'rejected' then p_actor_id else null end,
    case when v_status = 'rejected' then now() else null end,
    v_lock_state,
    jsonb_build_object('source', 'otp_commercial_terms_phase24')
  )
  returning id into v_record_id;

  insert into public.otp_commercial_term_events (
    organisation_id,
    transaction_id,
    route_variant,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    event_payload
  )
  values (
    v_organisation_id,
    p_transaction_id,
    p_route_variant,
    'commission_variation',
    v_record_id,
    'otp_commission_variation_recorded',
    p_actor_id,
    jsonb_build_object('approval_status', v_status, 'lock_state', v_lock_state)
  );

  return jsonb_build_object(
    'success', true,
    'code', 'otp_commission_variation_recorded',
    'id', v_record_id,
    'approval_status', v_status,
    'lock_state', v_lock_state,
    'preserves_mandate_commission', true
  );
end;
$$;

create or replace function public.bridge_upsert_otp_cost_obligation_item(
  p_transaction_id uuid,
  p_route_variant text,
  p_item jsonb,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_item_key text := nullif(p_item->>'key', '');
  v_category text := coalesce(nullif(p_item->>'category', ''), 'other');
  v_amount_status text := coalesce(nullif(p_item->>'amountStatus', ''), nullif(p_item->>'amount_status', ''), 'pending');
  v_record_id uuid;
begin
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;
  if p_route_variant not in ('resale_existing_property', 'new_development') then
    return jsonb_build_object('success', false, 'code', 'invalid_route_variant');
  end if;
  if v_item_key is null then
    return jsonb_build_object('success', false, 'code', 'item_key_required');
  end if;
  if v_category not in ('transfer_costs', 'bond_costs', 'transfer_duty', 'municipal_rates', 'levies', 'hoa', 'utilities', 'development_charges', 'occupation_charges', 'compliance', 'other') then
    return jsonb_build_object('success', false, 'code', 'invalid_cost_category');
  end if;
  if v_amount_status not in ('known', 'estimated', 'pending', 'not_applicable') then
    return jsonb_build_object('success', false, 'code', 'invalid_amount_status');
  end if;

  v_organisation_id := public.bridge_otp_commercial_terms_transaction_org(p_transaction_id);
  if v_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.bridge_is_active_member(v_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  update public.otp_cost_obligation_items
     set category = v_category,
         label = coalesce(nullif(p_item->>'label', ''), v_item_key),
         amount = nullif(p_item->>'amount', '')::numeric,
         amount_status = v_amount_status,
         payer_role = coalesce(nullif(p_item->>'payerRole', ''), nullif(p_item->>'payer_role', ''), 'buyer'),
         payee_role = coalesce(nullif(p_item->>'payeeRole', ''), nullif(p_item->>'payee_role', '')),
         payee_name = nullif(p_item->>'payeeName', ''),
         due_event = coalesce(nullif(p_item->>'dueEvent', ''), nullif(p_item->>'due_event', ''), 'on_demand'),
         source = coalesce(nullif(p_item->>'source', ''), 'manual'),
         include_in_otp = coalesce((p_item->>'includeInOtp')::boolean, (p_item->>'include_in_otp')::boolean, true),
         document_keys = coalesce(array(select jsonb_array_elements_text(p_item->'documentKeys')), '{}'::text[]),
         notes = nullif(p_item->>'notes', ''),
         metadata = coalesce(p_item->'metadata', '{}'::jsonb),
         updated_by = p_actor_id,
         updated_at = now()
   where transaction_id = p_transaction_id
     and route_variant = p_route_variant
     and item_key = v_item_key
     and status = 'active'
  returning id into v_record_id;

  if v_record_id is null then
    insert into public.otp_cost_obligation_items (
      organisation_id,
      transaction_id,
      route_variant,
      item_key,
      category,
      label,
      amount,
      amount_status,
      payer_role,
      payee_role,
      payee_name,
      due_event,
      source,
      include_in_otp,
      document_keys,
      notes,
      metadata,
      created_by,
      updated_by
    )
    values (
      v_organisation_id,
      p_transaction_id,
      p_route_variant,
      v_item_key,
      v_category,
      coalesce(nullif(p_item->>'label', ''), v_item_key),
      nullif(p_item->>'amount', '')::numeric,
      v_amount_status,
      coalesce(nullif(p_item->>'payerRole', ''), nullif(p_item->>'payer_role', ''), 'buyer'),
      coalesce(nullif(p_item->>'payeeRole', ''), nullif(p_item->>'payee_role', '')),
      nullif(p_item->>'payeeName', ''),
      coalesce(nullif(p_item->>'dueEvent', ''), nullif(p_item->>'due_event', ''), 'on_demand'),
      coalesce(nullif(p_item->>'source', ''), 'manual'),
      coalesce((p_item->>'includeInOtp')::boolean, (p_item->>'include_in_otp')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(p_item->'documentKeys')), '{}'::text[]),
      nullif(p_item->>'notes', ''),
      coalesce(p_item->'metadata', '{}'::jsonb),
      p_actor_id,
      p_actor_id
    )
    returning id into v_record_id;
  end if;

  insert into public.otp_commercial_term_events (
    organisation_id,
    transaction_id,
    route_variant,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    event_payload
  )
  values (
    v_organisation_id,
    p_transaction_id,
    p_route_variant,
    'cost_obligation_item',
    v_record_id,
    'otp_cost_obligation_item_upserted',
    p_actor_id,
    jsonb_build_object('item_key', v_item_key, 'amount_status', v_amount_status)
  );

  return jsonb_build_object('success', true, 'code', 'otp_cost_obligation_item_upserted', 'id', v_record_id);
end;
$$;

create or replace function public.bridge_upsert_matter_attorney_cost_quote_state(
  p_transaction_id uuid,
  p_transaction_attorney_assignment_id uuid,
  p_route_variant text,
  p_quote_status text,
  p_document_definition_key text default 'buyer_transfer_cost_invoice',
  p_financial_document_metadata_id uuid default null,
  p_file_url text default null,
  p_amount numeric default null,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_assignment public.transaction_attorney_assignments%rowtype;
  v_record_id uuid;
  v_document_key text := coalesce(nullif(p_document_definition_key, ''), 'buyer_transfer_cost_invoice');
begin
  if p_transaction_id is null or p_transaction_attorney_assignment_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_and_assignment_required');
  end if;
  if p_route_variant not in ('resale_existing_property', 'new_development') then
    return jsonb_build_object('success', false, 'code', 'invalid_route_variant');
  end if;
  if p_quote_status not in ('pending_upload', 'uploaded', 'buyer_viewed', 'buyer_queried', 'revised', 'acknowledged', 'superseded') then
    return jsonb_build_object('success', false, 'code', 'invalid_quote_status');
  end if;
  if v_document_key not in ('buyer_transfer_cost_invoice', 'buyer_final_statement') then
    return jsonb_build_object('success', false, 'code', 'invalid_document_definition_key');
  end if;

  v_organisation_id := public.bridge_otp_commercial_terms_transaction_org(p_transaction_id);
  if v_organisation_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  select *
    into v_assignment
  from public.transaction_attorney_assignments
  where id = p_transaction_attorney_assignment_id
    and transaction_id = p_transaction_id
  limit 1;

  if v_assignment.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_attorney_assignment_not_found');
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.bridge_conveyancer_can_access_record(v_organisation_id, v_assignment.firm_id, p_transaction_id) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  update public.matter_attorney_cost_quote_states
     set quote_status = p_quote_status,
         financial_document_metadata_id = p_financial_document_metadata_id,
         file_url = nullif(p_file_url, ''),
         amount = p_amount,
         uploaded_by = case when p_quote_status in ('uploaded', 'revised') then p_actor_id else uploaded_by end,
         uploaded_at = case when p_quote_status in ('uploaded', 'revised') then now() else uploaded_at end,
         buyer_query_count = case when p_quote_status = 'buyer_queried' then buyer_query_count + 1 else buyer_query_count end,
         revision_count = case when p_quote_status = 'revised' then revision_count + 1 else revision_count end,
         acknowledged_by = case when p_quote_status = 'acknowledged' then p_actor_id else acknowledged_by end,
         acknowledged_at = case when p_quote_status = 'acknowledged' then now() else acknowledged_at end,
         superseded_at = case when p_quote_status = 'superseded' then now() else superseded_at end,
         updated_by = p_actor_id,
         updated_at = now()
   where transaction_id = p_transaction_id
     and transaction_attorney_assignment_id = p_transaction_attorney_assignment_id
     and document_definition_key = v_document_key
     and quote_status <> 'superseded'
  returning id into v_record_id;

  if v_record_id is null then
    insert into public.matter_attorney_cost_quote_states (
      organisation_id,
      transaction_id,
      transaction_attorney_assignment_id,
      attorney_firm_id,
      route_variant,
      quote_status,
      source_scope,
      document_definition_key,
      financial_document_metadata_id,
      file_url,
      amount,
      uploaded_by,
      uploaded_at,
      acknowledged_by,
      acknowledged_at,
      superseded_at,
      created_by,
      updated_by
    )
    values (
      v_organisation_id,
      p_transaction_id,
      p_transaction_attorney_assignment_id,
      v_assignment.firm_id,
      p_route_variant,
      p_quote_status,
      'transaction_matter',
      v_document_key,
      p_financial_document_metadata_id,
      nullif(p_file_url, ''),
      p_amount,
      case when p_quote_status in ('uploaded', 'revised') then p_actor_id else null end,
      case when p_quote_status in ('uploaded', 'revised') then now() else null end,
      case when p_quote_status = 'acknowledged' then p_actor_id else null end,
      case when p_quote_status = 'acknowledged' then now() else null end,
      case when p_quote_status = 'superseded' then now() else null end,
      p_actor_id,
      p_actor_id
    )
    returning id into v_record_id;
  end if;

  insert into public.otp_commercial_term_events (
    organisation_id,
    transaction_id,
    route_variant,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    event_payload
  )
  values (
    v_organisation_id,
    p_transaction_id,
    p_route_variant,
    'matter_attorney_cost_quote',
    v_record_id,
    'matter_attorney_cost_quote_state_upserted',
    p_actor_id,
    jsonb_build_object('quote_status', p_quote_status, 'document_definition_key', v_document_key, 'source_scope', 'transaction_matter')
  );

  return jsonb_build_object(
    'success', true,
    'code', 'matter_attorney_cost_quote_state_upserted',
    'id', v_record_id,
    'source_scope', 'transaction_matter'
  );
end;
$$;

create or replace view public.otp_commercial_terms_persistence_readiness_v1 as
select
  transaction_record.id as transaction_id,
  transaction_record.organisation_id,
  count(distinct commission.id) filter (where commission.is_current = true) as current_commission_variations,
  count(distinct cost_item.id) filter (where cost_item.status = 'active' and cost_item.include_in_otp = true) as visible_cost_obligations,
  count(distinct quote_state.id) filter (where quote_state.quote_status <> 'superseded') as active_matter_attorney_quote_states,
  bool_or(commission.lock_state = 'blocked_pending_approval') as has_pending_commission_approval,
  bool_or(cost_item.amount_status = 'pending' and cost_item.include_in_otp = true) as has_pending_costs
from public.transactions transaction_record
left join public.otp_commission_variations commission
  on commission.transaction_id = transaction_record.id
left join public.otp_cost_obligation_items cost_item
  on cost_item.transaction_id = transaction_record.id
left join public.matter_attorney_cost_quote_states quote_state
  on quote_state.transaction_id = transaction_record.id
group by transaction_record.id, transaction_record.organisation_id;

alter table public.otp_commission_variations enable row level security;
alter table public.otp_cost_obligation_items enable row level security;
alter table public.matter_attorney_cost_quote_states enable row level security;
alter table public.otp_commercial_term_events enable row level security;

drop policy if exists otp_commission_variations_member_select on public.otp_commission_variations;
create policy otp_commission_variations_member_select
on public.otp_commission_variations
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists otp_commission_variations_admin_write on public.otp_commission_variations;
create policy otp_commission_variations_admin_write
on public.otp_commission_variations
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));

drop policy if exists otp_cost_obligation_items_member_select on public.otp_cost_obligation_items;
create policy otp_cost_obligation_items_member_select
on public.otp_cost_obligation_items
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists otp_cost_obligation_items_member_write on public.otp_cost_obligation_items;
create policy otp_cost_obligation_items_member_write
on public.otp_cost_obligation_items
for all to authenticated
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

drop policy if exists matter_attorney_cost_quote_states_select on public.matter_attorney_cost_quote_states;
create policy matter_attorney_cost_quote_states_select
on public.matter_attorney_cost_quote_states
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
);

drop policy if exists matter_attorney_cost_quote_states_write on public.matter_attorney_cost_quote_states;
create policy matter_attorney_cost_quote_states_write
on public.matter_attorney_cost_quote_states
for all to authenticated
using (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id))
with check (public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id));

drop policy if exists otp_commercial_term_events_member_select on public.otp_commercial_term_events;
create policy otp_commercial_term_events_member_select
on public.otp_commercial_term_events
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

revoke all on public.otp_commission_variations from public, anon;
revoke all on public.otp_cost_obligation_items from public, anon;
revoke all on public.matter_attorney_cost_quote_states from public, anon;
revoke all on public.otp_commercial_term_events from public, anon;

grant select, insert, update on public.otp_commission_variations to authenticated;
grant select, insert, update on public.otp_cost_obligation_items to authenticated;
grant select, insert, update on public.matter_attorney_cost_quote_states to authenticated;
grant select on public.otp_commercial_term_events to authenticated;
grant select on public.otp_commercial_terms_persistence_readiness_v1 to authenticated;

grant all on public.otp_commission_variations to service_role;
grant all on public.otp_cost_obligation_items to service_role;
grant all on public.matter_attorney_cost_quote_states to service_role;
grant all on public.otp_commercial_term_events to service_role;

grant execute on function public.bridge_record_otp_commission_variation(uuid, text, jsonb, jsonb, text, text, text, uuid) to authenticated;
grant execute on function public.bridge_upsert_otp_cost_obligation_item(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.bridge_upsert_matter_attorney_cost_quote_state(uuid, uuid, text, text, text, uuid, text, numeric, uuid) to authenticated;

comment on table public.otp_commission_variations is
  'OTP-stage negotiated commission variation records. These preserve the mandate commission snapshot and do not mutate transaction_commissions or mandate records.';
comment on table public.otp_cost_obligation_items is
  'Route-scoped buyer cost obligation items rendered into OTP review/generation as known, estimated, pending or not applicable.';
comment on table public.matter_attorney_cost_quote_states is
  'Transaction matter-scoped attorney transfer-cost quote and statement state. This intentionally excludes attorney lead quote scope.';
comment on view public.otp_commercial_terms_persistence_readiness_v1 is
  'Transaction-level persistence readiness summary for OTP commercial terms Phase 24.';

notify pgrst, 'reload schema';
commit;
