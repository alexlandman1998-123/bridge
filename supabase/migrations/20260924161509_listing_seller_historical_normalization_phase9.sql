-- Phase 9: inspect and normalize historical seller data without guessing.
-- This migration deliberately does not update document requirements, mandates,
-- signing sessions, or historical document rows.

create extension if not exists pgcrypto with schema extensions;

create table public.private_listing_seller_normalization_audits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  classification text not null check (classification in ('configured','unconfigured','ambiguous','inconsistent')),
  inferred_profile_type text,
  safe_to_backfill boolean not null default false,
  requires_agent_review boolean not null default true,
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  source_fingerprint text not null,
  audit_version text not null default 'seller_historical_normalization_v1',
  normalization_status text not null default 'audited' check (normalization_status in (
    'audited','backfilled_pending_confirmation','confirmed','dismissed'
  )),
  provenance_json jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance_json) = 'object'),
  audited_at timestamptz not null default now(),
  backfilled_at timestamptz,
  backfilled_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (private_listing_id)
);

create index private_listing_seller_normalization_review_idx
  on public.private_listing_seller_normalization_audits (organisation_id, requires_agent_review, classification, audited_at desc);

alter table public.private_listing_seller_normalization_audits enable row level security;
revoke all on table public.private_listing_seller_normalization_audits from public, anon, authenticated;
grant select on table public.private_listing_seller_normalization_audits to authenticated;
grant all on table public.private_listing_seller_normalization_audits to service_role;

create policy private_listing_seller_normalization_internal_select
  on public.private_listing_seller_normalization_audits for select to authenticated
  using ((select public.bridge_listing_seller_actor_permission(organisation_id, 'manage_participants', 'legal_identity')));

create or replace function public.bridge_normalize_historical_seller_type(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '_', 'g')
    when '' then null when 'unknown' then null when 'not_identified' then null when 'not_captured' then null
    when 'natural_person' then 'individual' when 'single' then 'individual' when 'sole_owner' then 'individual' when 'individual' then 'individual'
    when 'married' then 'married' when 'married_cop' then 'married' when 'married_anc' then 'married'
    when 'married_in_community' then 'married' when 'married_out_of_community' then 'married'
    when 'multiple' then 'multiple_owners' when 'multiple_individuals' then 'multiple_owners' when 'joint' then 'multiple_owners'
    when 'co_owners' then 'multiple_owners' when 'multiple_owners' then 'multiple_owners'
    when 'company' then 'company' when 'pty' then 'company' when 'pty_ltd' then 'company' when 'corporate' then 'company'
    when 'close_corporation' then 'close_corporation' when 'cc' then 'close_corporation'
    when 'trust' then 'trust' when 'family_trust' then 'trust'
    when 'deceased' then 'deceased_estate' when 'estate' then 'deceased_estate' when 'deceased_estate' then 'deceased_estate'
    when 'poa' then 'power_of_attorney' when 'attorney' then 'power_of_attorney' when 'power_of_attorney' then 'power_of_attorney'
    when 'other' then 'other' when 'developer' then 'other' when 'other_entity' then 'other' when 'other_legal_entity' then 'other'
    when 'foreign' then 'foreign_individual' when 'foreign_owner' then 'foreign_individual'
    when 'non_resident' then 'foreign_individual' when 'foreign_individual' then 'foreign_individual'
    when 'foreign_company' then 'foreign_company' when 'foreign_trust' then 'foreign_trust'
    else null
  end;
$$;

create or replace function public.bridge_compute_listing_seller_historical_audit(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_listing public.private_listings%rowtype;
  v_listing_json jsonb;
  v_onboarding_json jsonb := '{}'::jsonb;
  v_form jsonb := '{}'::jsonb;
  v_listing_facts jsonb := '{}'::jsonb;
  v_onboarding_facts jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  v_signals jsonb := '[]'::jsonb;
  v_shapes jsonb := '[]'::jsonb;
  v_types text[] := '{}'::text[];
  v_shape_types text[] := '{}'::text[];
  v_candidate text;
  v_classification text;
  v_confirmed boolean := false;
  v_pending_confirmation boolean := false;
  v_canonical_type text;
  v_safe boolean := false;
  v_document_summary jsonb := '{}'::jsonb;
  v_value text;
  v_source text;
begin
  select * into v_listing from public.private_listings where id = p_listing_id;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if not public.bridge_listing_seller_actor_permission(v_listing.organisation_id, 'manage_participants', 'legal_identity') then
    raise exception 'You do not have access to this listing.' using errcode = '42501';
  end if;

  v_listing_json := to_jsonb(v_listing);
  select to_jsonb(onboarding) into v_onboarding_json
  from public.private_listing_seller_onboarding onboarding
  where onboarding.private_listing_id = p_listing_id
  order by onboarding.updated_at desc nulls last
  limit 1;
  v_onboarding_json := coalesce(v_onboarding_json, '{}'::jsonb);
  v_form := coalesce(v_onboarding_json->'form_data', '{}'::jsonb);
  v_listing_facts := coalesce(v_listing_json->'seller_canonical_facts_json', '{}'::jsonb);
  v_onboarding_facts := coalesce(v_onboarding_json->'canonical_facts_json', '{}'::jsonb);

  v_confirmed := lower(coalesce(
    v_form->>'sellerOwnershipConfirmed', v_form->>'ownershipConfirmed',
    v_listing_facts#>>'{context,ownership_confirmed}', v_onboarding_facts#>>'{context,ownership_confirmed}', 'false'
  )) in ('true','yes','1')
    or nullif(coalesce(v_listing_facts#>>'{context,profile_confirmed_at}', v_onboarding_facts#>>'{context,profile_confirmed_at}', ''), '') is not null;
  v_pending_confirmation := coalesce(v_listing_facts#>>'{context,historical_normalization,status}', '') = 'pending_confirmation'
    or coalesce(v_onboarding_facts#>>'{context,historical_normalization,status}', '') = 'pending_confirmation';

  -- Canonical and explicit onboarding form values are trusted. Bare historical
  -- listing/onboarding defaults are evidence only unless a user confirmed them.
  for v_source, v_value in
    select * from (values
      ('listing_canonical', coalesce(v_listing_facts#>>'{seller,owner_structure_type}', v_listing_facts#>>'{seller,profile_type}', v_listing_facts#>>'{seller,legal_type}')),
      ('onboarding_canonical', coalesce(v_onboarding_facts#>>'{seller,owner_structure_type}', v_onboarding_facts#>>'{seller,profile_type}', v_onboarding_facts#>>'{seller,legal_type}')),
      ('onboarding_form', coalesce(v_form->>'ownerStructureType', v_form->>'ownerEntityType', v_form->>'sellerLegalType', v_form->>'ownershipType', v_form->>'sellerType')),
      ('listing_legacy', coalesce(v_listing_json->>'ownership_structure', v_listing_json->>'seller_type')),
      ('onboarding_legacy', coalesce(v_onboarding_json->>'ownership_structure', v_onboarding_json->>'seller_type'))
    ) as signal(source_name, raw_value)
  loop
    v_candidate := public.bridge_normalize_historical_seller_type(v_value);
    if v_candidate is not null then
      v_signals := v_signals || jsonb_build_array(jsonb_build_object(
        'source', v_source, 'raw', v_value, 'normalized', v_candidate,
        'trusted', v_source in ('listing_canonical','onboarding_canonical','onboarding_form') or v_confirmed
      ));
      if v_source in ('listing_canonical','onboarding_canonical','onboarding_form') or v_confirmed then
        v_types := array_append(v_types, v_candidate);
      end if;
    end if;
  end loop;

  if nullif(coalesce(v_form->>'companyName', v_form->>'companyRegistrationNumber', v_listing_facts#>>'{seller,company,name}', v_onboarding_facts#>>'{seller,company,name}', ''), '') is not null then
    v_shapes := v_shapes || jsonb_build_array(jsonb_build_object('type','company','reason','company fields are populated'));
    v_shape_types := array_append(v_shape_types, 'company');
  end if;
  if nullif(coalesce(v_form->>'trustName', v_form->>'trustRegistrationNumber', v_listing_facts#>>'{seller,trust,name}', v_onboarding_facts#>>'{seller,trust,name}', ''), '') is not null then
    v_shapes := v_shapes || jsonb_build_array(jsonb_build_object('type','trust','reason','trust fields are populated'));
    v_shape_types := array_append(v_shape_types, 'trust');
  end if;
  if nullif(coalesce(v_form->>'estateReference', v_form->>'executorName', v_listing_facts#>>'{seller,deceased_estate,estate_reference}', v_onboarding_facts#>>'{seller,deceased_estate,estate_reference}', ''), '') is not null then
    v_shapes := v_shapes || jsonb_build_array(jsonb_build_object('type','deceased_estate','reason','estate fields are populated'));
    v_shape_types := array_append(v_shape_types, 'deceased_estate');
  end if;
  if jsonb_array_length(coalesce(v_form->'owners', v_listing_facts#>'{seller,owners}', v_onboarding_facts#>'{seller,owners}', '[]'::jsonb)) > 1 then
    v_shapes := v_shapes || jsonb_build_array(jsonb_build_object('type','multiple_owners','reason','multiple owner records are populated'));
    v_shape_types := array_append(v_shape_types, 'multiple_owners');
  end if;

  select array_agg(distinct value order by value) into v_types from unnest(v_types) value;
  select array_agg(distinct value order by value) into v_shape_types from unnest(v_shape_types) value;
  v_types := coalesce(v_types, '{}'::text[]);
  v_shape_types := coalesce(v_shape_types, '{}'::text[]);
  v_candidate := case when cardinality(v_types) = 1 then v_types[1] else null end;
  v_canonical_type := public.bridge_normalize_historical_seller_type(coalesce(
    v_listing_facts#>>'{seller,owner_structure_type}', v_listing_facts#>>'{seller,profile_type}',
    v_onboarding_facts#>>'{seller,owner_structure_type}', v_onboarding_facts#>>'{seller,profile_type}'
  ));

  if cardinality(v_types) > 1
    or (v_candidate is not null and exists (select 1 from unnest(v_shape_types) shape where shape <> v_candidate)) then
    v_classification := 'inconsistent';
  elsif cardinality(v_types) = 1 then
    v_classification := 'configured';
  elsif cardinality(v_shape_types) > 0 or jsonb_array_length(v_signals) > 0 then
    v_classification := 'ambiguous';
  else
    v_classification := 'unconfigured';
  end if;

  -- A safe projection requires one explicit, trusted signal. It still remains
  -- pending agent confirmation and therefore cannot rebuild requirements.
  v_safe := v_classification = 'configured'
    and v_candidate is not null
    and v_canonical_type is null
    and exists (
      select 1 from jsonb_array_elements(v_signals) signal
      where (signal->>'trusted')::boolean and signal->>'normalized' = v_candidate
        and signal->>'source' in ('onboarding_form','listing_canonical','onboarding_canonical')
    );

  select jsonb_build_object(
    'documentCount', count(*),
    'signedDocumentCount', count(*) filter (where lower(coalesce(to_jsonb(document)->>'status','')) in ('signed','completed','complete','approved')),
    'documents', coalesce(jsonb_agg(jsonb_build_object(
      'id', document.id, 'type', to_jsonb(document)->>'document_type', 'status', to_jsonb(document)->>'status',
      'signingSessionId', to_jsonb(document)->>'signing_session_id', 'updatedAt', to_jsonb(document)->>'updated_at'
    ) order by document.id), '[]'::jsonb)
  ) into v_document_summary
  from public.private_listing_documents document
  where document.private_listing_id = p_listing_id;

  v_snapshot := jsonb_build_object(
    'listing', jsonb_build_object(
      'id', v_listing.id, 'seller_type', v_listing_json->'seller_type', 'ownership_structure', v_listing_json->'ownership_structure',
      'seller_canonical_facts_json', v_listing_json->'seller_canonical_facts_json',
      'seller_canonical_fact_readiness_json', v_listing_json->'seller_canonical_fact_readiness_json',
      'updated_at', v_listing_json->'updated_at'
    ),
    'onboarding', jsonb_build_object(
      'id', v_onboarding_json->'id', 'seller_type', v_onboarding_json->'seller_type', 'ownership_structure', v_onboarding_json->'ownership_structure',
      'form_data', v_onboarding_json->'form_data', 'canonical_facts_json', v_onboarding_json->'canonical_facts_json',
      'canonical_fact_readiness_json', v_onboarding_json->'canonical_fact_readiness_json', 'updated_at', v_onboarding_json->'updated_at'
    ),
    'historicalDocuments', coalesce(v_document_summary, jsonb_build_object('documentCount',0,'signedDocumentCount',0,'documents','[]'::jsonb))
  );

  return jsonb_build_object(
    'listingId', v_listing.id,
    'organisationId', v_listing.organisation_id,
    'classification', v_classification,
    'inferredProfileType', v_candidate,
    'safeToBackfill', v_safe,
    'requiresAgentReview', v_classification <> 'configured' or v_pending_confirmation,
    'requirementsRebuildAllowed', v_confirmed and not v_pending_confirmation and v_classification = 'configured',
    'normalizationStatus', case when v_pending_confirmation then 'backfilled_pending_confirmation' else 'audited' end,
    'sourceSnapshot', v_snapshot,
    'sourceFingerprint', encode(extensions.digest(convert_to(v_snapshot::text, 'utf8'), 'sha256'), 'hex'),
    'evidence', jsonb_build_object('signals', v_signals, 'entityShapes', v_shapes, 'ownershipConfirmed', v_confirmed),
    'remediationAction', case v_classification
      when 'inconsistent' then 'review_conflicting_seller_data'
      when 'ambiguous' then 'confirm_legal_owner_type'
      when 'unconfigured' then 'set_up_seller'
      else case when v_pending_confirmation then 'confirm_normalized_seller' else null end
    end
  );
end;
$$;

create or replace function public.bridge_get_listing_seller_historical_audit(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select public.bridge_compute_listing_seller_historical_audit(p_listing_id); $$;

create or replace function public.bridge_audit_listing_seller_history(
  p_organisation_id uuid,
  p_limit integer default 250,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_row record;
  v_audit jsonb;
  v_summary jsonb;
begin
  if not public.bridge_listing_seller_actor_permission(p_organisation_id, 'manage_participants', 'legal_identity') then
    raise exception 'You do not have permission to audit seller records.' using errcode = '42501';
  end if;
  if coalesce(p_limit, 0) < 1 or p_limit > 500 or coalesce(p_offset, 0) < 0 then
    raise exception 'Audit pages must contain 1 to 500 listings and use a non-negative offset.' using errcode = '22023';
  end if;
  for v_row in
    select listing.id
    from public.private_listings listing
    where listing.organisation_id = p_organisation_id
    order by listing.created_at, listing.id
    limit p_limit offset p_offset
  loop
    v_audit := public.bridge_compute_listing_seller_historical_audit(v_row.id);
    -- Bulk results intentionally omit raw source snapshots; those remain
    -- available only for the specific listing review and persisted provenance.
    v_rows := v_rows || jsonb_build_array(v_audit - 'sourceSnapshot');
  end loop;
  select jsonb_object_agg(classification, count_value) into v_summary
  from (
    select value->>'classification' as classification, count(*) as count_value
    from jsonb_array_elements(v_rows)
    group by value->>'classification'
  ) counts;
  return jsonb_build_object(
    'organisationId', p_organisation_id,
    'limit', p_limit,
    'offset', p_offset,
    'count', jsonb_array_length(v_rows),
    'summary', coalesce(v_summary, '{}'::jsonb),
    'records', v_rows
  );
end;
$$;

create or replace function public.bridge_apply_safe_listing_seller_normalization(
  p_listing_ids uuid[],
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_audit jsonb;
  v_listing public.private_listings%rowtype;
  v_candidate text;
  v_results jsonb := '[]'::jsonb;
  v_facts jsonb;
  v_context jsonb;
  v_provenance jsonb;
begin
  if coalesce(cardinality(p_listing_ids), 0) = 0 then
    raise exception 'At least one listing is required.' using errcode = '22023';
  end if;
  if cardinality(p_listing_ids) > 250 then
    raise exception 'Normalize at most 250 listings per batch.' using errcode = '22023';
  end if;

  foreach v_listing_id in array p_listing_ids loop
    select * into v_listing from public.private_listings where id = v_listing_id for update;
    if not found then
      v_results := v_results || jsonb_build_array(jsonb_build_object('listingId',v_listing_id,'status','not_found'));
      continue;
    end if;
    if not public.bridge_listing_seller_actor_permission(v_listing.organisation_id, 'manage_participants', 'legal_identity') then
      raise exception 'You do not have permission to normalize seller records.' using errcode = '42501';
    end if;

    v_audit := public.bridge_compute_listing_seller_historical_audit(v_listing_id);
    v_candidate := v_audit->>'inferredProfileType';
    if p_apply then
      insert into public.private_listing_seller_normalization_audits (
      organisation_id, private_listing_id, classification, inferred_profile_type, safe_to_backfill,
      requires_agent_review, source_snapshot, evidence_json, source_fingerprint, normalization_status,
      provenance_json, audited_at, updated_at
    ) values (
      v_listing.organisation_id, v_listing_id, v_audit->>'classification', v_candidate,
      coalesce((v_audit->>'safeToBackfill')::boolean,false), coalesce((v_audit->>'requiresAgentReview')::boolean,true),
      v_audit->'sourceSnapshot', v_audit->'evidence', v_audit->>'sourceFingerprint', v_audit->>'normalizationStatus',
      jsonb_build_object('auditVersion','seller_historical_normalization_v1','mode',case when p_apply then 'apply' else 'preview' end),
      now(), now()
      ) on conflict (private_listing_id) do update set
        classification = excluded.classification, inferred_profile_type = excluded.inferred_profile_type,
        safe_to_backfill = excluded.safe_to_backfill, requires_agent_review = excluded.requires_agent_review,
        source_snapshot = excluded.source_snapshot, evidence_json = excluded.evidence_json,
        source_fingerprint = excluded.source_fingerprint, audited_at = now(), updated_at = now();
    end if;

    if not coalesce((v_audit->>'safeToBackfill')::boolean,false) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'listingId',v_listing_id,'status','review_required','classification',v_audit->>'classification'
      ));
      continue;
    end if;
    if not p_apply then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'listingId',v_listing_id,'status','safe_preview','profileType',v_candidate,'sourceFingerprint',v_audit->>'sourceFingerprint'
      ));
      continue;
    end if;

    v_provenance := jsonb_build_object(
      'version','seller_historical_normalization_v1', 'status','pending_confirmation',
      'sourceFingerprint',v_audit->>'sourceFingerprint', 'backfilledAt',now(), 'backfilledBy',auth.uid()
    );
    v_facts := coalesce(to_jsonb(v_listing)->'seller_canonical_facts_json','{}'::jsonb);
    v_context := coalesce(v_facts->'context','{}'::jsonb) || jsonb_build_object('historical_normalization',v_provenance);
    v_facts := v_facts
      || jsonb_build_object('seller',coalesce(v_facts->'seller','{}'::jsonb) || jsonb_build_object('profile_type',v_candidate,'owner_structure_type',v_candidate))
      || jsonb_build_object('context',v_context);

    update public.private_listings set
      seller_canonical_facts_json = v_facts,
      seller_canonical_fact_readiness_json = coalesce(seller_canonical_fact_readiness_json,'{}'::jsonb)
        || jsonb_build_object('ownerStructureType',false,'historicalNormalizationPending',true),
      seller_canonical_facts_updated_at = now(),
      updated_at = now()
    where id = v_listing_id;

    update public.private_listing_seller_onboarding set
      canonical_facts_json = coalesce(canonical_facts_json,'{}'::jsonb)
        || jsonb_build_object('seller',coalesce(canonical_facts_json->'seller','{}'::jsonb) || jsonb_build_object('profile_type',v_candidate,'owner_structure_type',v_candidate))
        || jsonb_build_object('context',coalesce(canonical_facts_json->'context','{}'::jsonb) || jsonb_build_object('historical_normalization',v_provenance)),
      canonical_fact_readiness_json = coalesce(canonical_fact_readiness_json,'{}'::jsonb)
        || jsonb_build_object('ownerStructureType',false,'historicalNormalizationPending',true),
      canonical_facts_updated_at = now(),
      updated_at = now()
    where private_listing_id = v_listing_id;

    update public.private_listing_seller_normalization_audits set
      normalization_status = 'backfilled_pending_confirmation', requires_agent_review = true,
      provenance_json = v_provenance, backfilled_at = now(), backfilled_by = auth.uid(), updated_at = now()
    where private_listing_id = v_listing_id;

    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description, performed_by, visibility, metadata
    ) values (
      v_listing_id, 'seller_historical_normalization_backfilled', 'Historical seller data projected for review',
      'One explicit historical seller type was projected. Agent confirmation is still required before document requirements change.',
      auth.uid(), 'internal', jsonb_build_object('profileType',v_candidate,'sourceFingerprint',v_audit->>'sourceFingerprint','requirementsRebuilt',false)
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'listingId',v_listing_id,'status','backfilled_pending_confirmation','profileType',v_candidate,'requirementsRebuilt',false
    ));
  end loop;
  return jsonb_build_object('applied',p_apply,'results',v_results);
end;
$$;

-- Read-only compatibility projection. security_invoker preserves the RLS of the
-- underlying listing, requirement, and document tables. It never replaces a
-- legacy row and labels signed artifacts as immutable history.
create or replace view public.private_listing_seller_document_compatibility_v
with (security_invoker = true)
as
select
  listing.organisation_id,
  listing.id as private_listing_id,
  requirement.id as requirement_id,
  document.id as document_id,
  coalesce(to_jsonb(requirement)->>'requirement_key', to_jsonb(document)->>'document_type') as compatibility_key,
  coalesce(to_jsonb(requirement)->>'requirement_name', to_jsonb(document)->>'document_name', to_jsonb(document)->>'document_type') as display_name,
  coalesce(to_jsonb(requirement)->>'status', 'historical') as requirement_status,
  coalesce(to_jsonb(document)->>'status', 'missing') as document_status,
  lower(coalesce(to_jsonb(document)->>'status','')) in ('signed','completed','complete','approved')
    or nullif(to_jsonb(document)->>'signing_session_id','') is not null as immutable_signed_history,
  case when document.id is null then 'requirement_only'
    when requirement.id is null then 'legacy_document'
    else 'linked_document' end as compatibility_source,
  document.created_at as historical_created_at,
  to_jsonb(document) as historical_document_snapshot
from public.private_listings listing
join public.private_listing_document_requirements requirement on requirement.private_listing_id = listing.id
left join public.private_listing_documents document on document.requirement_id = requirement.id
union all
select
  listing.organisation_id,
  listing.id as private_listing_id,
  null::uuid as requirement_id,
  document.id as document_id,
  to_jsonb(document)->>'document_type' as compatibility_key,
  coalesce(to_jsonb(document)->>'document_name', to_jsonb(document)->>'document_type') as display_name,
  'historical'::text as requirement_status,
  coalesce(to_jsonb(document)->>'status', 'missing') as document_status,
  lower(coalesce(to_jsonb(document)->>'status','')) in ('signed','completed','complete','approved')
    or nullif(to_jsonb(document)->>'signing_session_id','') is not null as immutable_signed_history,
  'legacy_document'::text as compatibility_source,
  document.created_at as historical_created_at,
  to_jsonb(document) as historical_document_snapshot
from public.private_listings listing
join public.private_listing_documents document on document.private_listing_id = listing.id
left join public.private_listing_document_requirements requirement on requirement.id = document.requirement_id
where requirement.id is null;

revoke all on public.private_listing_seller_document_compatibility_v from public, anon, authenticated;
grant select on public.private_listing_seller_document_compatibility_v to authenticated, service_role;

revoke all on function public.bridge_normalize_historical_seller_type(text) from public, anon;
revoke all on function public.bridge_compute_listing_seller_historical_audit(uuid) from public, anon, authenticated;
revoke all on function public.bridge_get_listing_seller_historical_audit(uuid) from public, anon;
revoke all on function public.bridge_audit_listing_seller_history(uuid, integer, integer) from public, anon;
revoke all on function public.bridge_apply_safe_listing_seller_normalization(uuid[], boolean) from public, anon;
grant execute on function public.bridge_normalize_historical_seller_type(text) to authenticated, service_role;
grant execute on function public.bridge_compute_listing_seller_historical_audit(uuid) to service_role;
grant execute on function public.bridge_get_listing_seller_historical_audit(uuid) to authenticated, service_role;
grant execute on function public.bridge_audit_listing_seller_history(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.bridge_apply_safe_listing_seller_normalization(uuid[], boolean) to authenticated, service_role;

comment on table public.private_listing_seller_normalization_audits is
  'Immutable source snapshots and provenance for conservative historical seller normalization. Signed documents are never mutated by this workflow.';
comment on function public.bridge_get_listing_seller_historical_audit(uuid) is
  'Read-only live classification of one listing as configured, unconfigured, ambiguous, or inconsistent.';
comment on function public.bridge_audit_listing_seller_history(uuid, integer, integer) is
  'Read-only paginated organisation audit. Returns classifications and evidence without persisting or modifying listings.';
comment on function public.bridge_apply_safe_listing_seller_normalization(uuid[], boolean) is
  'Audits up to 250 listings; apply mode projects only one explicit trusted type and leaves requirements blocked pending agent confirmation.';
