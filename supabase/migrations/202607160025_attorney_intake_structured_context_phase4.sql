begin;

alter table public.transactions
  add column if not exists attorney_intake_context_json jsonb not null default '{}'::jsonb;

alter table public.transactions
  drop constraint if exists transactions_attorney_intake_context_json_check;
alter table public.transactions
  add constraint transactions_attorney_intake_context_json_check
  check (
    jsonb_typeof(attorney_intake_context_json) = 'object'
    and octet_length(attorney_intake_context_json::text) <= 8192
  );

create or replace function public.bridge_sanitize_attorney_intake_context(p_context jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source jsonb := case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end;
  v_result jsonb := '{}'::jsonb;
  v_value text;
begin
  v_value := lower(trim(coalesce(v_source->>'journey_key', '')));
  if v_value in ('transfer_calculator','transfer_quote','buying_home','selling_property','bond_registration','bond_cancellation','property_advice') then
    v_result := v_result || jsonb_build_object('journey_key', v_value);
  end if;
  v_value := lower(trim(coalesce(v_source->>'practice_key', '')));
  if v_value in ('litigation','family_law','contract_law','trusts_estates','notarial','general_enquiry') then
    v_result := v_result || jsonb_build_object('practice_key', v_value);
  end if;
  v_value := lower(trim(coalesce(v_source->>'goal', '')));
  if v_value in ('calculate_transfer_duty','request_transfer_quote') then v_result := v_result || jsonb_build_object('goal', v_value); end if;
  v_value := lower(trim(coalesce(v_source->>'finance_type', '')));
  if v_value in ('bond','cash','unsure') then v_result := v_result || jsonb_build_object('finance_type', v_value); end if;
  v_value := lower(trim(coalesce(v_source->>'existing_bond', '')));
  if v_value in ('yes','no','unsure') then v_result := v_result || jsonb_build_object('existing_bond', v_value); end if;
  v_value := lower(trim(coalesce(v_source->>'cancellation_reason', '')));
  if v_value in ('selling_property','bond_paid_off','refinancing','other') then v_result := v_result || jsonb_build_object('cancellation_reason', v_value); end if;
  v_value := lower(trim(coalesce(v_source->>'cancellation_notice', '')));
  if v_value in ('yes','no','unsure') then v_result := v_result || jsonb_build_object('cancellation_notice', v_value); end if;
  v_value := lower(trim(coalesce(v_source->>'preferred_contact', '')));
  if v_value in ('phone','email','whatsapp') then v_result := v_result || jsonb_build_object('preferred_contact', v_value); end if;
  foreach v_value in array array['matter_stage','timing'] loop
    if lower(trim(coalesce(v_source->>v_value, ''))) ~ '^[a-z0-9][a-z0-9_-]{0,79}$' then
      v_result := v_result || jsonb_build_object(v_value, lower(trim(v_source->>v_value)));
    end if;
  end loop;
  v_value := nullif(trim(coalesce(v_source->>'bank_name', '')), '');
  if v_value is not null then v_result := v_result || jsonb_build_object('bank_name', left(v_value, 160)); end if;
  return v_result;
end;
$$;

revoke all on function public.bridge_sanitize_attorney_intake_context(jsonb) from public, anon, authenticated;

create or replace function public.bridge_enrich_attorney_lead_intake_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission_id text := coalesce(new.metadata_json->>'submission_id', '');
  v_context jsonb := '{}'::jsonb;
begin
  if v_submission_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select public.bridge_sanitize_attorney_intake_context(submission.request_metadata_json->'intake_context')
      into v_context
    from public.public_intake_submissions submission
    where submission.id = v_submission_id::uuid
      and submission.organisation_id = new.organisation_id;
  end if;
  if coalesce(v_context, '{}'::jsonb) <> '{}'::jsonb then
    new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb) || jsonb_build_object('intake_context', v_context);
  end if;
  return new;
end;
$$;

revoke all on function public.bridge_enrich_attorney_lead_intake_context() from public, anon, authenticated;
drop trigger if exists trg_enrich_attorney_lead_intake_context on public.attorney_lead_details;
create trigger trg_enrich_attorney_lead_intake_context
before insert on public.attorney_lead_details
for each row execute function public.bridge_enrich_attorney_lead_intake_context();

update public.attorney_lead_details detail
set metadata_json = detail.metadata_json || jsonb_build_object(
  'intake_context',
  public.bridge_sanitize_attorney_intake_context(submission.request_metadata_json->'intake_context')
)
from public.public_intake_submissions submission
where detail.metadata_json->>'submission_id' = submission.id::text
  and detail.organisation_id = submission.organisation_id
  and public.bridge_sanitize_attorney_intake_context(submission.request_metadata_json->'intake_context') <> '{}'::jsonb
  and coalesce(detail.metadata_json->'intake_context', '{}'::jsonb) = '{}'::jsonb;

create or replace function public.bridge_sync_attorney_intake_context_to_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := '{}'::jsonb;
begin
  if new.originating_lead_id is null then return new; end if;
  select public.bridge_sanitize_attorney_intake_context(detail.metadata_json->'intake_context')
    into v_context
  from public.attorney_lead_details detail
  where detail.lead_id = new.originating_lead_id
    and detail.organisation_id = new.organisation_id;
  v_context := coalesce(v_context, '{}'::jsonb);
  new.attorney_intake_context_json := v_context;
  if v_context->>'finance_type' in ('bond','cash') then new.finance_type := v_context->>'finance_type'; end if;
  if v_context ? 'existing_bond' then new.seller_has_existing_bond := v_context->>'existing_bond' = 'yes'; end if;
  return new;
end;
$$;

revoke all on function public.bridge_sync_attorney_intake_context_to_transaction() from public, anon, authenticated;
drop trigger if exists trg_sync_attorney_intake_context_to_transaction on public.transactions;
drop trigger if exists trg_sync_attorney_intake_context_to_transaction_insert on public.transactions;
drop trigger if exists trg_sync_attorney_intake_context_to_transaction_update on public.transactions;
create trigger trg_sync_attorney_intake_context_to_transaction_insert
before insert on public.transactions
for each row execute function public.bridge_sync_attorney_intake_context_to_transaction();
create trigger trg_sync_attorney_intake_context_to_transaction_update
before update of originating_lead_id on public.transactions
for each row execute function public.bridge_sync_attorney_intake_context_to_transaction();

update public.transactions tx
set attorney_intake_context_json = public.bridge_sanitize_attorney_intake_context(detail.metadata_json->'intake_context'),
    finance_type = case when detail.metadata_json->'intake_context'->>'finance_type' in ('bond','cash') then detail.metadata_json->'intake_context'->>'finance_type' else tx.finance_type end,
    seller_has_existing_bond = case when detail.metadata_json->'intake_context' ? 'existing_bond' then detail.metadata_json->'intake_context'->>'existing_bond' = 'yes' else tx.seller_has_existing_bond end
from public.attorney_lead_details detail
where tx.originating_lead_id = detail.lead_id
  and tx.organisation_id = detail.organisation_id
  and tx.transaction_type = 'attorney_originated_matter';

create or replace function public.bridge_derive_attorney_lane_keys(
  p_attorney_originated boolean,
  p_matter_type text,
  p_finance_type text,
  p_seller_has_existing_bond boolean,
  p_profile jsonb,
  p_intake_context jsonb
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_profile jsonb := case when jsonb_typeof(p_profile) = 'object' then p_profile else '{}'::jsonb end;
  v_context jsonb := public.bridge_sanitize_attorney_intake_context(p_intake_context);
  v_matter_type text := lower(trim(coalesce(p_matter_type, '')));
  v_finance_type text := lower(coalesce(nullif(v_context->>'finance_type',''), v_profile->>'financeType', p_finance_type, ''));
  v_lanes text[];
  v_requires_bond boolean;
  v_requires_cancellation boolean;
begin
  if coalesce(p_attorney_originated, false) and v_matter_type = 'bond' then return array['bond']::text[]; end if;
  if coalesce(p_attorney_originated, false) and v_matter_type = 'cancellation' then return array['cancellation']::text[]; end if;
  v_lanes := array['transfer']::text[];
  v_requires_bond := v_finance_type in ('bond','hybrid','combination')
    or lower(coalesce(v_profile->>'requiresBondAttorney','false')) in ('true','yes','1');
  v_requires_cancellation := coalesce(p_seller_has_existing_bond, false)
    or v_context->>'existing_bond' = 'yes'
    or lower(coalesce(v_profile->>'requiresCancellationAttorney','false')) in ('true','yes','1')
    or lower(coalesce(v_profile->>'sellerHasExistingBond','false')) in ('true','yes','1');
  if v_requires_bond then v_lanes := array_append(v_lanes, 'bond'); end if;
  if v_requires_cancellation then v_lanes := array_append(v_lanes, 'cancellation'); end if;
  return v_lanes;
end;
$$;

revoke all on function public.bridge_derive_attorney_lane_keys(boolean,text,text,boolean,jsonb,jsonb) from public, anon;
grant execute on function public.bridge_derive_attorney_lane_keys(boolean,text,text,boolean,jsonb,jsonb) to authenticated;

create or replace function public.bridge_prepare_agent_legal_handoff(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_profile jsonb := '{}'::jsonb;
  v_intake_context jsonb := '{}'::jsonb;
  v_matter_type text := '';
  v_required_lanes text[];
  v_required_roles text[] := array[]::text[];
  v_assigned_roles text[] := array[]::text[];
  v_missing_roles text[] := array[]::text[];
  v_lane text;
  v_role text;
  v_created_count integer := 0;
  v_seeded_step_count integer := 0;
begin
  if v_actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_transaction_id is null then raise exception 'Transaction id is required.' using errcode = '22023'; end if;
  if not public.bridge_can_access_transaction_spine(p_transaction_id) then raise exception 'Transaction not found or access denied.' using errcode = '42501'; end if;

  select transaction.* into v_transaction from public.transactions transaction where transaction.id = p_transaction_id for update;
  if not found then raise exception 'Transaction not found or access denied.' using errcode = 'P0002'; end if;

  select lower(coalesce(nullif(assignment.matter_type,''), nullif(assignment.assignment_type,''), ''))
    into v_matter_type
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and coalesce(assignment.assignment_status, assignment.status, 'active') not in ('removed','declined','cancelled')
  order by assignment.is_primary desc nulls last, assignment.created_at asc
  limit 1;

  v_profile := coalesce(to_jsonb(v_transaction)->'routing_profile_json', '{}'::jsonb);
  v_intake_context := coalesce(v_transaction.attorney_intake_context_json, '{}'::jsonb);
  v_required_lanes := public.bridge_derive_attorney_lane_keys(
    v_transaction.transaction_type = 'attorney_originated_matter', v_matter_type,
    v_transaction.finance_type, v_transaction.seller_has_existing_bond, v_profile, v_intake_context
  );
  select coalesce(array_agg(case lane when 'bond' then 'bond_attorney' when 'cancellation' then 'cancellation_attorney' else 'transfer_attorney' end order by ord), array[]::text[])
    into v_required_roles from unnest(v_required_lanes) with ordinality required(lane, ord);

  foreach v_lane in array v_required_lanes loop
    v_role := case v_lane when 'bond' then 'bond_attorney' when 'cancellation' then 'cancellation_attorney' else 'transfer_attorney' end;
    insert into public.transaction_subprocesses (transaction_id, process_type, owner_type, status, attorney_role, current_stage, lane_status, lane_metadata)
    values (p_transaction_id, v_lane, 'attorney', 'not_started', v_role, 'instruction_received', 'not_started',
      jsonb_build_object('source','attorney_intake_structured_context_phase4','transactionId',p_transaction_id,'intakeContext',v_intake_context))
    on conflict (transaction_id, process_type) do nothing;
    get diagnostics v_created_count = row_count;
    if v_created_count > 0 then
      insert into public.transaction_events (transaction_id,event_type,event_data,created_by,created_by_role,visibility_scope)
      values (p_transaction_id,'AttorneyLaneCreated',jsonb_build_object('laneKey',v_lane,'attorneyRole',v_role,'source','attorney_intake_structured_context_phase4'),v_actor_id,'attorney','internal');
    end if;
  end loop;

  insert into public.transaction_subprocess_steps (subprocess_id,step_key,step_label,status,owner_type,sort_order,visibility_scope)
  select lane.id,template.step_key,template.step_label,'not_started','attorney',template.sort_order,'internal'
  from public.transaction_subprocesses lane
  join public.bridge_attorney_workflow_step_templates_v1 template on template.process_type = lane.process_type
  where lane.transaction_id = p_transaction_id and lane.process_type = any(v_required_lanes)
    and not exists (select 1 from public.transaction_subprocess_steps existing where existing.subprocess_id = lane.id and existing.step_key = template.step_key);
  get diagnostics v_seeded_step_count = row_count;

  select coalesce(array_agg(distinct assignment.attorney_role), array[]::text[]) into v_assigned_roles
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id and coalesce(assignment.assignment_status,assignment.status,'active') not in ('removed','declined','cancelled');
  select coalesce(array_agg(role_name),array[]::text[]) into v_missing_roles
  from unnest(v_required_roles) role_name where not (role_name = any(v_assigned_roles));

  return jsonb_build_object('prepared',true,'transactionId',p_transaction_id,'matterType',v_matter_type,
    'requiredLaneKeys',to_jsonb(v_required_lanes),'assignedAttorneyRoles',to_jsonb(v_assigned_roles),
    'missingAttorneyRoles',to_jsonb(v_missing_roles),'laneCount',cardinality(v_required_lanes),'seededStepCount',v_seeded_step_count);
end;
$$;

revoke all on function public.bridge_prepare_agent_legal_handoff(uuid) from public, anon;
grant execute on function public.bridge_prepare_agent_legal_handoff(uuid) to authenticated;

comment on column public.transactions.attorney_intake_context_json is 'Allowlisted structured public-intake answers propagated from the originating Attorney Lead.';
comment on function public.bridge_derive_attorney_lane_keys(boolean,text,text,boolean,jsonb,jsonb) is 'Deterministic Phase 4 lane matrix for transfer, bond, cancellation, and combined matters.';
comment on function public.bridge_prepare_agent_legal_handoff(uuid) is 'Authorised idempotent handoff using matter-aware structured intake context and canonical Attorney workflow steps.';

commit;
