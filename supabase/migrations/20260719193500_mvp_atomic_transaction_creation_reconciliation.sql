-- Historical reconciliation for the MVP atomic transaction path.
--
-- Do not replay 202607180046. That migration is absent from the target ledger
-- and is not standalone-safe there: it omits transactions.mandate_packet_id, does not
-- revoke helper execution, and uses status values rejected by the live schema.
-- This migration is additive, idempotent, and intentionally limited to the MVP
-- creation boundary.

alter table if exists public.transactions
  add column if not exists creation_idempotency_key text,
  add column if not exists property_tenure text,
  add column if not exists seller_type text,
  add column if not exists seller_has_existing_bond boolean not null default false,
  add column if not exists existing_bond boolean not null default false,
  add column if not exists cancellation_required boolean not null default false,
  add column if not exists vat_treatment text,
  add column if not exists routing_profile_version text,
  add column if not exists routing_profile_json jsonb not null default '{}'::jsonb,
  add column if not exists otp_packet_id uuid,
  add column if not exists mandate_packet_id uuid,
  add column if not exists commission_snapshot_id uuid,
  add column if not exists gross_commission_percentage numeric,
  add column if not exists gross_commission_amount numeric,
  add column if not exists agent_split_percentage_snapshot numeric,
  add column if not exists agency_split_percentage_snapshot numeric,
  add column if not exists agent_commission_amount numeric,
  add column if not exists agency_commission_amount numeric;

create unique index if not exists transactions_mvp_creation_idempotency_uidx
  on public.transactions (organisation_id, creation_idempotency_key)
  where creation_idempotency_key is not null;

create table if not exists public.transaction_participant_requirements (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_key text not null,
  role_type text not null,
  legal_role text not null default 'none',
  transaction_role text not null,
  required_by text not null,
  required_at_creation boolean not null default false,
  status text not null default 'pending_assignment',
  label text not null,
  reason text,
  participant_id uuid references public.transaction_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, role_key)
);

alter table public.transaction_participant_requirements enable row level security;

drop policy if exists transaction_participant_requirements_member_select on public.transaction_participant_requirements;
create policy transaction_participant_requirements_member_select
on public.transaction_participant_requirements
for select to authenticated
using (
  exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.id = transaction_participant_requirements.transaction_id
      and public.bridge_is_active_member(transaction_row.organisation_id)
  )
);

create or replace function public.bridge_seed_mvp_transaction_participants(
  p_transaction_id uuid,
  p_bootstrap jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_participant_id uuid;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_bootstrap->'requirements', '[]'::jsonb)) loop
    insert into public.transaction_participant_requirements (
      transaction_id, role_key, role_type, legal_role, transaction_role, required_by,
      required_at_creation, label, reason
    ) values (
      p_transaction_id, v_item->>'roleKey', v_item->>'roleType', coalesce(v_item->>'legalRole', 'none'),
      v_item->>'transactionRole', v_item->>'requiredBy', coalesce((v_item->>'requiredAtCreation')::boolean, false),
      v_item->>'label', nullif(v_item->>'reason', '')
    ) on conflict (transaction_id, role_key) do update set
      role_type = excluded.role_type,
      legal_role = excluded.legal_role,
      transaction_role = excluded.transaction_role,
      required_by = excluded.required_by,
      required_at_creation = excluded.required_at_creation,
      label = excluded.label,
      reason = excluded.reason,
      updated_at = now();
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bootstrap->'participants', '[]'::jsonb)) loop
    insert into public.transaction_participants (
      transaction_id, user_id, role_type, legal_role, transaction_role, status,
      visibility_scope, is_internal, participant_name, participant_email,
      can_view, can_comment, can_upload_documents, can_edit_finance_workflow,
      can_edit_attorney_workflow, can_edit_core_transaction
    ) values (
      p_transaction_id, nullif(v_item->>'userId', '')::uuid, v_item->>'roleType',
      coalesce(v_item->>'legalRole', 'none'), v_item->>'transactionRole', 'active',
      'shared', false, nullif(v_item->>'name', ''), nullif(lower(v_item->>'email'), ''),
      true, true, true, false, false, false
    ) on conflict (transaction_id, role_type, legal_role) do update set
      user_id = coalesce(excluded.user_id, public.transaction_participants.user_id),
      participant_name = coalesce(excluded.participant_name, public.transaction_participants.participant_name),
      participant_email = coalesce(excluded.participant_email, public.transaction_participants.participant_email),
      transaction_role = excluded.transaction_role,
      status = excluded.status,
      visibility_scope = excluded.visibility_scope,
      updated_at = now()
    returning id into v_participant_id;

    update public.transaction_participant_requirements
    set participant_id = v_participant_id, status = 'captured', updated_at = now()
    where transaction_id = p_transaction_id and role_key = v_item->>'roleKey';
  end loop;
end;
$$;

create or replace function public.bridge_seed_mvp_transaction_documents(
  p_transaction_id uuid,
  p_bootstrap jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_position integer := 0;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_bootstrap->'requirements', '[]'::jsonb)) loop
    v_position := v_position + 1;
    insert into public.transaction_required_documents (
      transaction_id, document_key, document_label, is_required, is_uploaded,
      status, enabled, group_key, group_label, description, required_from_role,
      visibility_scope, allow_multiple, sort_order
    ) values (
      p_transaction_id, v_item->>'key', v_item->>'label', coalesce((v_item->>'required')::boolean, true), false,
      'requested', true, v_item->>'groupKey', initcap(replace(v_item->>'groupKey', '_', ' ')), v_item->>'description',
      v_item->>'requiredFromRole', 'client', false, v_position
    ) on conflict (transaction_id, document_key) do update set
      document_label = excluded.document_label,
      is_required = excluded.is_required,
      group_key = excluded.group_key,
      group_label = excluded.group_label,
      description = excluded.description,
      required_from_role = excluded.required_from_role,
      visibility_scope = excluded.visibility_scope,
      sort_order = excluded.sort_order,
      updated_at = now();
  end loop;
end;
$$;

create or replace function public.bridge_seed_mvp_transaction_workflow_lanes(
  p_transaction_id uuid,
  p_organisation_id uuid,
  p_bootstrap jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lane jsonb;
begin
  for v_lane in select value from jsonb_array_elements(coalesce(p_bootstrap->'lanes', '[]'::jsonb)) loop
    insert into public.transaction_workflow_lanes (
      organisation_id, transaction_id, lane_type, current_stage, status, blocked, owner_role, metadata_json
    ) values (
      p_organisation_id, p_transaction_id, v_lane->>'laneType', v_lane->>'currentStage',
      v_lane->>'status', coalesce((v_lane->>'blocked')::boolean, false), v_lane->>'ownerRole',
      jsonb_build_object('source', 'mvp_transaction_creation', 'bootstrap_version', coalesce(p_bootstrap->>'version', 'unknown'))
    ) on conflict (transaction_id, lane_type) do update set
      current_stage = excluded.current_stage,
      status = excluded.status,
      blocked = excluded.blocked,
      owner_role = excluded.owner_role,
      metadata_json = public.transaction_workflow_lanes.metadata_json || excluded.metadata_json,
      updated_at = now();
  end loop;
end;
$$;

create or replace function public.bridge_create_mvp_transaction(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_profile jsonb := coalesce(p_payload->'routing_profile_json', '{}'::jsonb);
  v_organisation_id uuid := nullif(trim(v_payload->>'organisation_id'), '')::uuid;
  v_lead_id uuid := nullif(trim(v_payload->>'originating_lead_id'), '')::uuid;
  v_listing_id uuid := nullif(trim(v_payload->>'listing_id'), '')::uuid;
  v_offer_id uuid := nullif(trim(v_payload->>'accepted_offer_id'), '')::uuid;
  v_idempotency_key text := nullif(trim(v_payload->>'creation_idempotency_key'), '');
  v_transaction_type text := lower(nullif(trim(v_profile->>'transactionType'), ''));
  v_finance_type text := lower(nullif(trim(v_profile->>'financeType'), ''));
  v_property_tenure text := lower(nullif(trim(v_profile->>'propertyTenure'), ''));
  v_buyer_entity_type text := lower(nullif(trim(v_profile->>'buyerEntityType'), ''));
  v_seller_entity_type text := lower(nullif(trim(v_profile->>'sellerEntityType'), ''));
  v_buyer_id uuid := nullif(trim(v_payload->>'buyer_id'), '')::uuid;
  v_buyer_email text := lower(nullif(trim(v_payload->>'buyer_email'), ''));
  v_buyer_name text := coalesce(nullif(trim(v_payload->>'buyer_name'), ''), 'Buyer pending');
  v_buyer_phone text := nullif(trim(v_payload->>'buyer_phone'), '');
  v_offer_status text;
  v_offer_lead_id uuid;
  v_offer_listing_id uuid;
  v_lead_domain text;
  v_transaction public.transactions%rowtype;
  v_existing boolean := false;
  v_live_transaction_count integer := 0;
begin
  if auth.uid() is null or v_organisation_id is null or not public.bridge_is_active_member(v_organisation_id) then
    raise exception 'You do not have access to create a transaction in this organisation.' using errcode = '42501';
  end if;

  if v_lead_id is null or v_listing_id is null or v_offer_id is null or v_idempotency_key is null then
    raise exception 'MVP transaction creation requires a buyer lead, listing, accepted offer and idempotency key.' using errcode = '22023';
  end if;

  if v_transaction_type not in ('resale', 'private_sale', 'development_sale')
    or v_finance_type not in ('cash', 'bond', 'hybrid')
    or v_property_tenure not in ('freehold', 'sectional_title', 'estate_hoa')
    or v_buyer_entity_type not in ('individual', 'company', 'trust')
    or v_seller_entity_type not in ('individual', 'company', 'trust', 'developer')
    or (v_seller_entity_type = 'developer' and v_transaction_type <> 'development_sale') then
    raise exception 'Transaction facts are incomplete or outside the Arch9 MVP launch scope.' using errcode = '22023';
  end if;

  select lead_domain into v_lead_domain
  from public.leads
  where lead_id = v_lead_id and organisation_id = v_organisation_id;
  if not found or v_lead_domain <> 'agency' then
    raise exception 'The buyer lead is not an agency lead in this organisation.' using errcode = '22023';
  end if;

  perform 1
  from public.private_listings
  where id = v_listing_id and organisation_id = v_organisation_id;
  if not found then
    raise exception 'The listing is not available in this organisation.' using errcode = '22023';
  end if;

  select status, buyer_lead_id, listing_id
  into v_offer_status, v_offer_lead_id, v_offer_listing_id
  from public.offers
  where id = v_offer_id and organisation_id = v_organisation_id;
  if not found or v_offer_lead_id is distinct from v_lead_id or v_offer_listing_id is distinct from v_listing_id then
    raise exception 'The accepted offer does not match the buyer lead and listing.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_organisation_id::text || ':' || v_offer_id::text));
  -- Serialise new conversion attempts per agency so two parallel accepted
  -- offers cannot both pass the controlled-pilot capacity check.
  perform pg_advisory_xact_lock(hashtext('mvp-pilot-cap:' || v_organisation_id::text));

  select * into v_transaction
  from public.transactions
  where organisation_id = v_organisation_id
    and (
      accepted_offer_id = v_offer_id
      or creation_idempotency_key = v_idempotency_key
    )
  order by (accepted_offer_id = v_offer_id) desc
  limit 1;
  v_existing := found;

  if not v_existing and v_offer_status <> 'accepted' then
    raise exception 'Only an accepted offer can create an MVP transaction.' using errcode = '22023';
  end if;

  if not v_existing then
    select count(*) into v_live_transaction_count
    from public.transactions
    where organisation_id = v_organisation_id
      and coalesce(lifecycle_state, 'active') not in ('completed', 'registered', 'archived', 'cancelled');

    if v_live_transaction_count >= 2 then
      raise exception 'This agency has reached the controlled-pilot limit of two live transactions. Complete, register, archive, or cancel an existing transaction before creating another.'
        using errcode = '55000';
    end if;
  end if;

  if not v_existing and v_buyer_id is null and v_buyer_email is not null then
    select id into v_buyer_id
    from public.buyers
    where organisation_id = v_organisation_id and lower(email) = v_buyer_email
    order by id
    limit 1;
  end if;

  if not v_existing and v_buyer_id is null then
    insert into public.buyers (organisation_id, name, phone, email)
    values (v_organisation_id, v_buyer_name, v_buyer_phone, v_buyer_email)
    returning id into v_buyer_id;
  end if;

  if not v_existing then
    insert into public.transactions (
      organisation_id, buyer_id, transaction_reference, transaction_type,
      property_type, property_tenure, property_address_line_1, suburb, city,
      province, property_description, sales_price, purchase_price, finance_type,
      cash_amount, bond_amount, deposit_amount, purchaser_type, seller_type,
      seller_has_existing_bond, existing_bond, cancellation_required, vat_treatment,
      routing_profile_version, routing_profile_json, stage, current_main_stage,
      next_action, comment, onboarding_status, assigned_agent, assigned_agent_email,
      assigned_agent_id, owner_user_id, is_active, lifecycle_state, listing_id,
      originating_lead_id, originating_buyer_lead_id, accepted_offer_id,
      buyer_contact_id, seller_contact_id, otp_packet_id, mandate_packet_id,
      commission_snapshot_id, gross_commission_percentage, gross_commission_amount,
      agent_split_percentage_snapshot, agency_split_percentage_snapshot,
      agent_commission_amount, agency_commission_amount, creation_idempotency_key,
      created_at, updated_at
    ) values (
      v_organisation_id, v_buyer_id,
      nullif(trim(v_payload->>'transaction_reference'), ''),
      nullif(trim(v_payload->>'transaction_type'), ''),
      nullif(trim(v_payload->>'property_type'), ''),
      nullif(trim(v_payload->>'property_tenure'), ''),
      nullif(trim(v_payload->>'property_address_line_1'), ''),
      nullif(trim(v_payload->>'suburb'), ''), nullif(trim(v_payload->>'city'), ''),
      nullif(trim(v_payload->>'province'), ''), nullif(trim(v_payload->>'property_description'), ''),
      nullif(trim(v_payload->>'sales_price'), '')::numeric,
      nullif(trim(v_payload->>'purchase_price'), '')::numeric,
      nullif(trim(v_payload->>'finance_type'), ''),
      nullif(trim(v_payload->>'cash_amount'), '')::numeric,
      nullif(trim(v_payload->>'bond_amount'), '')::numeric,
      nullif(trim(v_payload->>'deposit_amount'), '')::numeric,
      nullif(trim(v_payload->>'purchaser_type'), ''), nullif(trim(v_payload->>'seller_type'), ''),
      coalesce((v_payload->>'seller_has_existing_bond')::boolean, false),
      coalesce((v_payload->>'existing_bond')::boolean, false),
      coalesce((v_payload->>'cancellation_required')::boolean, false),
      nullif(trim(v_payload->>'vat_treatment'), ''), nullif(trim(v_payload->>'routing_profile_version'), ''),
      v_profile, nullif(trim(v_payload->>'stage'), ''), nullif(trim(v_payload->>'current_main_stage'), ''),
      nullif(trim(v_payload->>'next_action'), ''), nullif(trim(v_payload->>'comment'), ''),
      nullif(trim(v_payload->>'onboarding_status'), ''), nullif(trim(v_payload->>'assigned_agent'), ''),
      nullif(trim(v_payload->>'assigned_agent_email'), ''),
      nullif(trim(v_payload->>'assigned_agent_id'), '')::uuid,
      nullif(trim(v_payload->>'owner_user_id'), '')::uuid, true,
      coalesce(nullif(trim(v_payload->>'lifecycle_state'), ''), 'active'),
      v_listing_id, v_lead_id, v_lead_id, v_offer_id,
      nullif(trim(v_payload->>'buyer_contact_id'), '')::uuid,
      nullif(trim(v_payload->>'seller_contact_id'), '')::uuid,
      nullif(trim(v_payload->>'otp_packet_id'), '')::uuid,
      nullif(trim(v_payload->>'mandate_packet_id'), '')::uuid,
      nullif(trim(v_payload->>'commission_snapshot_id'), '')::uuid,
      nullif(trim(v_payload->>'gross_commission_percentage'), '')::numeric,
      nullif(trim(v_payload->>'gross_commission_amount'), '')::numeric,
      nullif(trim(v_payload->>'agent_split_percentage_snapshot'), '')::numeric,
      nullif(trim(v_payload->>'agency_split_percentage_snapshot'), '')::numeric,
      nullif(trim(v_payload->>'agent_commission_amount'), '')::numeric,
      nullif(trim(v_payload->>'agency_commission_amount'), '')::numeric,
      v_idempotency_key, now(), now()
    )
    on conflict (organisation_id, creation_idempotency_key)
      where creation_idempotency_key is not null
      do update set updated_at = excluded.updated_at
    returning * into v_transaction;
  end if;

  update public.leads
  set converted_transaction_id = v_transaction.id,
      converted_at = coalesce(converted_at, now()),
      current_stage = 'Onboarding',
      stage = 'Onboarding',
      status = 'Onboarding',
      updated_at = now()
  where organisation_id = v_organisation_id and lead_id = v_lead_id;

  update public.offers
  set transaction_id = v_transaction.id,
      status = case when status = 'accepted' then 'converted_to_transaction' else status end,
      converted_to_transaction_at = coalesce(converted_to_transaction_at, now())
  where id = v_offer_id and organisation_id = v_organisation_id;

  perform public.bridge_seed_mvp_transaction_participants(v_transaction.id, v_payload->'participant_bootstrap');
  perform public.bridge_seed_mvp_transaction_documents(v_transaction.id, v_payload->'document_bootstrap');
  perform public.bridge_seed_mvp_transaction_workflow_lanes(v_transaction.id, v_organisation_id, v_payload->'workflow_bootstrap');

  return jsonb_build_object('transaction', to_jsonb(v_transaction), 'existing', v_existing);
end;
$$;

-- This fallback is deliberately not a second creation implementation. It is
-- an operator-only route to the same atomic command when the normal UI path is
-- unavailable, with an immutable database audit of every successful use.
create table if not exists public.mvp_transaction_creation_fallback_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_offer_id uuid not null references public.offers(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) >= 10),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mvp_transaction_creation_fallback_audit_organisation_created_idx
  on public.mvp_transaction_creation_fallback_audit (organisation_id, created_at desc);

alter table public.mvp_transaction_creation_fallback_audit enable row level security;

drop policy if exists mvp_transaction_creation_fallback_audit_member_select on public.mvp_transaction_creation_fallback_audit;
create policy mvp_transaction_creation_fallback_audit_member_select
on public.mvp_transaction_creation_fallback_audit
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

create or replace function public.bridge_create_mvp_transaction_operator_fallback(
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_organisation_id uuid := nullif(trim(v_payload->>'organisation_id'), '')::uuid;
  v_offer_id uuid := nullif(trim(v_payload->>'accepted_offer_id'), '')::uuid;
  v_actor_id uuid := auth.uid();
  v_reason text := nullif(trim(p_reason), '');
  v_result jsonb;
  v_transaction_id uuid;
  v_audit_id uuid;
begin
  if v_actor_id is null or v_organisation_id is null or v_offer_id is null or v_reason is null then
    raise exception 'Operator fallback requires an authenticated operator, organisation, accepted offer, and recorded reason.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organisation_users membership
    where membership.organisation_id = v_organisation_id
      and membership.user_id = v_actor_id
      and coalesce(membership.membership_status, membership.status) = 'active'
      and coalesce(membership.organization_role, membership.organisation_role, membership.role)
        in ('owner', 'admin', 'super_admin', 'principal')
  ) then
    raise exception 'Only an active agency owner, principal, or administrator may use the controlled transaction-creation fallback.' using errcode = '42501';
  end if;

  v_result := public.bridge_create_mvp_transaction(v_payload);
  v_transaction_id := nullif(v_result->'transaction'->>'id', '')::uuid;
  if v_transaction_id is null then
    raise exception 'The controlled fallback did not return a transaction id.' using errcode = '22023';
  end if;

  insert into public.mvp_transaction_creation_fallback_audit (
    organisation_id, operator_user_id, accepted_offer_id, transaction_id, reason, result
  ) values (
    v_organisation_id, v_actor_id, v_offer_id, v_transaction_id, v_reason,
    jsonb_build_object('existing', coalesce((v_result->>'existing')::boolean, false))
  ) returning id into v_audit_id;

  return v_result || jsonb_build_object(
    'manual_fallback', jsonb_build_object('audit_id', v_audit_id, 'operator_user_id', v_actor_id)
  );
end;
$$;

revoke all on function public.bridge_seed_mvp_transaction_participants(uuid, jsonb) from public;
revoke all on function public.bridge_seed_mvp_transaction_documents(uuid, jsonb) from public;
revoke all on function public.bridge_seed_mvp_transaction_workflow_lanes(uuid, uuid, jsonb) from public;
revoke all on function public.bridge_create_mvp_transaction(jsonb) from public;
revoke all on function public.bridge_create_mvp_transaction_operator_fallback(jsonb, text) from public;
grant execute on function public.bridge_create_mvp_transaction(jsonb) to authenticated;
grant execute on function public.bridge_create_mvp_transaction_operator_fallback(jsonb, text) to authenticated;
