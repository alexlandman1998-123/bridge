-- Corrective reconciliation for a split seller-document P0-4/P0-6 baseline.
--
-- Some staging databases record 202607170012 while its P0-6 catalog objects
-- are absent.  This is not a replay of that historical migration: it preserves
-- the newer live promoter (which owns document linking, notifications and
-- readiness) behind a private base, then layers only P0-6 provenance and
-- canonical-continuity enrichment around it.

begin;

do $$
declare
  v_required_relation text;
begin
  foreach v_required_relation in array array[
    'public.documents',
    'public.private_listing_documents',
    'public.private_listing_document_requirements',
    'public.private_listings',
    'public.transactions',
    'public.document_requests',
    'public.transaction_required_documents',
    'public.document_requirement_instances',
    'public.document_definitions'
  ]
  loop
    if to_regclass(v_required_relation) is null then
      raise exception 'Seller-document continuity reconciliation requires relation %', v_required_relation;
    end if;
  end loop;

  if to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is null then
    raise exception 'Seller-document continuity reconciliation requires bridge_resolve_private_listing_transaction_id(uuid)';
  end if;
  if to_regprocedure('public.bridge_is_active_member(uuid)') is null then
    raise exception 'Seller-document continuity reconciliation requires bridge_is_active_member(uuid)';
  end if;
  if to_regprocedure('public.bridge_recalculate_transaction_readiness_from_required_document(uuid)') is null then
    raise exception 'Seller-document continuity reconciliation requires the singular transaction-readiness recalculator';
  end if;
  if to_regprocedure('public.bridge_promote_private_listing_document_row(uuid)') is null then
    raise exception 'Seller-document continuity reconciliation requires the live seller-document promoter';
  end if;
end;
$$;

create or replace function public.bridge_normalize_seller_document_key_p0_4(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '_' from lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9]+', '_', 'g')))
$$;

-- The live promoter calls the historic plural name, while this staging schema
-- only has the singular implementation.  Supply the smallest possible private
-- compatibility bridge before preserving and invoking that promoter.
do $$
begin
  if to_regprocedure('public.bridge_recalculate_transaction_readiness_from_required_documents(uuid)') is null then
    execute $sql$
      create function public.bridge_recalculate_transaction_readiness_from_required_documents(
        p_transaction_id uuid
      )
      returns jsonb
      language sql
      security definer
      set search_path = public
      as $body$
        select public.bridge_recalculate_transaction_readiness_from_required_document(p_transaction_id)
      $body$
    $sql$;
  end if;
end;
$$;

revoke all on function public.bridge_recalculate_transaction_readiness_from_required_documents(uuid)
  from public, anon, authenticated, service_role;

alter table if exists public.documents
  add column if not exists source_requirement_id uuid,
  add column if not exists source_canonical_requirement_instance_id uuid,
  add column if not exists source_approval_status text,
  add column if not exists source_approved_at timestamptz,
  add column if not exists continuity_verified_at timestamptz;

alter table if exists public.private_listing_documents
  add column if not exists promotion_status text not null default 'not_started',
  add column if not exists promotion_error text,
  add column if not exists promotion_attempted_at timestamptz,
  add column if not exists promotion_revision integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'private_listing_documents_promotion_status_check'
      and conrelid = 'public.private_listing_documents'::regclass
  ) then
    alter table public.private_listing_documents
      add constraint private_listing_documents_promotion_status_check
      check (promotion_status in ('not_started', 'pending_transaction', 'promoted', 'failed'));
  end if;
end;
$$;

create index if not exists documents_seller_continuity_source_idx
  on public.documents(transaction_id, source_document_id, source_requirement_id)
  where source = 'seller_portal';

create index if not exists private_listing_documents_promotion_health_idx
  on public.private_listing_documents(private_listing_id, promotion_status, status);

-- This function enriches the projection made by the existing live promoter.
-- It never re-uploads, moves, or replaces the source file and deliberately
-- avoids its legacy event, notification and readiness responsibilities.
create or replace function public.bridge_apply_seller_document_transaction_continuity_p0_6(
  p_private_listing_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.private_listing_documents%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_listing public.private_listings%rowtype;
  v_source_canonical public.document_requirement_instances%rowtype;
  v_transaction_canonical public.document_requirement_instances%rowtype;
  v_definition public.document_definitions%rowtype;
  v_transaction_id uuid;
  v_shared_document public.documents%rowtype;
  v_source_key text;
  v_projected_status text;
  v_shared_status text;
  v_request_status text;
begin
  if p_private_listing_document_id is null then
    return jsonb_build_object('promoted', false, 'reason', 'missing_document_id');
  end if;

  select * into v_document
  from public.private_listing_documents
  where id = p_private_listing_document_id
  for update;
  if not found then
    return jsonb_build_object('promoted', false, 'reason', 'private_listing_document_not_found');
  end if;

  select * into v_listing
  from public.private_listings
  where id = v_document.private_listing_id;
  if not found then
    return jsonb_build_object('promoted', false, 'reason', 'private_listing_not_found');
  end if;

  if v_document.requirement_id is not null then
    select * into v_requirement
    from public.private_listing_document_requirements
    where id = v_document.requirement_id;
    if not found or v_requirement.private_listing_id is distinct from v_document.private_listing_id then
      update public.private_listing_documents
      set promotion_status = 'failed',
          promotion_error = 'requirement_listing_mismatch',
          promotion_attempted_at = now(),
          promotion_revision = greatest(coalesce(promotion_revision, 0), 1)
      where id = v_document.id;
      return jsonb_build_object('promoted', false, 'reason', 'requirement_listing_mismatch');
    end if;
  end if;

  if nullif(trim(coalesce(v_document.storage_path, v_document.file_url, '')), '') is null then
    update public.private_listing_documents
    set promotion_status = 'failed',
        promotion_error = 'missing_file_reference',
        promotion_attempted_at = now(),
        promotion_revision = greatest(coalesce(promotion_revision, 0), 1)
    where id = v_document.id;
    return jsonb_build_object('promoted', false, 'reason', 'missing_file_reference');
  end if;

  v_transaction_id := v_document.promoted_transaction_id;
  if v_transaction_id is not null and not exists (
    select 1 from public.transactions tx where tx.id = v_transaction_id
  ) then
    v_transaction_id := null;
  end if;
  v_transaction_id := coalesce(
    v_transaction_id,
    public.bridge_resolve_private_listing_transaction_id(v_document.private_listing_id)
  );

  if v_transaction_id is null then
    update public.private_listing_documents
    set pending_transaction_promotion = true,
        promotion_status = 'pending_transaction',
        promotion_error = null,
        promotion_attempted_at = now(),
        promotion_revision = greatest(coalesce(promotion_revision, 0), 1)
    where id = v_document.id;
    return jsonb_build_object(
      'promoted', false,
      'reason', 'transaction_not_created',
      'pending_transaction_promotion', true,
      'private_listing_document_id', v_document.id
    );
  end if;

  if v_document.promoted_document_id is not null then
    select * into v_shared_document
    from public.documents
    where id = v_document.promoted_document_id;
  end if;
  if not found then
    select * into v_shared_document
    from public.documents
    where transaction_id = v_transaction_id
      and source = 'seller_portal'
      and source_document_id = v_document.id
    order by updated_at desc nulls last, created_at desc
    limit 1;
  end if;
  if not found then
    update public.private_listing_documents
    set promotion_status = 'failed',
        promotion_error = 'promoted_document_missing',
        promotion_attempted_at = now(),
        promotion_revision = greatest(coalesce(promotion_revision, 0), 1)
    where id = v_document.id;
    return jsonb_build_object(
      'promoted', false,
      'reason', 'promoted_document_missing',
      'transaction_id', v_transaction_id,
      'private_listing_document_id', v_document.id
    );
  end if;

  v_source_key := public.bridge_normalize_seller_document_key_p0_4(
    coalesce(v_requirement.requirement_key, v_document.document_type)
  );
  v_projected_status := case
    when v_document.status in ('approved', 'completed') then 'approved'
    when v_document.status = 'rejected' then 'rejected'
    when v_document.status = 'under_review' then 'under_review'
    else 'uploaded'
  end;
  -- documents.status uses pending_review, whereas the canonical and required
  -- document contracts use under_review.
  v_shared_status := case
    when v_projected_status = 'under_review' then 'pending_review'
    else v_projected_status
  end;
  v_request_status := case when v_projected_status = 'rejected' then 'requested' else 'uploaded' end;

  if v_document.canonical_requirement_instance_id is not null then
    select * into v_source_canonical
    from public.document_requirement_instances
    where id = v_document.canonical_requirement_instance_id
      and context_type = 'private_listing'
      and (context_id = v_document.private_listing_id or listing_id = v_document.private_listing_id);
  end if;

  select * into v_transaction_canonical
  from public.document_requirement_instances canonical
  where canonical.context_type = 'transaction'
    and canonical.context_id = v_transaction_id
    and public.bridge_normalize_seller_document_key_p0_4(canonical.document_definition_key) = v_source_key
    and canonical.status <> 'not_applicable'
  order by canonical.created_at, canonical.id
  limit 1;

  if not found and coalesce(v_requirement.is_required, false) then
    select * into v_definition
    from public.document_definitions definition
    where public.bridge_normalize_seller_document_key_p0_4(definition.key) = v_source_key
      and definition.is_active
    order by case when definition.key = coalesce(v_source_canonical.document_definition_key, v_requirement.requirement_key) then 0 else 1 end
    limit 1;

    if found then
      insert into public.document_requirement_instances (
        document_definition_key, context_type, context_id, transaction_id, listing_id,
        pack_key, requirement_level, status, stage_gates, requested_from_role,
        visible_to_roles, uploadable_by_roles, reviewer_role, resolver_version, source_system
      ) values (
        v_definition.key, 'transaction', v_transaction_id, v_transaction_id, v_document.private_listing_id,
        coalesce(v_source_canonical.pack_key, v_definition.pack_key),
        'required', 'pending', array['attorney_instruction_ready']::text[], 'seller',
        case when cardinality(v_definition.default_visibility) > 0 then v_definition.default_visibility
          else array['seller', 'agent', 'agency_admin', 'transferring_attorney']::text[] end,
        case when cardinality(v_definition.default_upload_roles) > 0 then v_definition.default_upload_roles
          else array['seller', 'agent', 'transferring_attorney']::text[] end,
        'transferring_attorney', 'seller_document_transaction_continuity_p0_6_v1',
        'seller_document_transaction_continuity_p0_6'
      ) on conflict do nothing;

      select * into v_transaction_canonical
      from public.document_requirement_instances canonical
      where canonical.context_type = 'transaction'
        and canonical.context_id = v_transaction_id
        and canonical.document_definition_key = v_definition.key
        and canonical.status <> 'not_applicable'
      order by canonical.created_at, canonical.id
      limit 1;
    end if;
  end if;

  update public.documents
  set status = v_shared_status,
      source_requirement_id = v_document.requirement_id,
      source_canonical_requirement_instance_id = v_document.canonical_requirement_instance_id,
      source_approval_status = v_document.status,
      source_approved_at = case
        when v_document.status in ('approved', 'completed') then coalesce(v_document.updated_at, now())
        else null
      end,
      canonical_requirement_instance_id = v_transaction_canonical.id,
      continuity_verified_at = now(),
      updated_at = now()
  where id = v_shared_document.id
  returning * into v_shared_document;

  update public.private_listing_documents
  set pending_transaction_promotion = false,
      promoted_transaction_id = v_transaction_id,
      promoted_document_id = v_shared_document.id,
      promotion_status = 'promoted',
      promotion_error = null,
      promotion_attempted_at = now(),
      promotion_revision = greatest(coalesce(promotion_revision, 0), 1)
  where id = v_document.id;

  if v_transaction_canonical.id is not null then
    update public.document_requirement_instances
    set status = v_projected_status,
        satisfied_by_document_id = case
          when v_projected_status in ('uploaded', 'under_review', 'approved') then v_shared_document.id
          else null
        end,
        rejection_reason = case
          when v_projected_status = 'rejected' then 'The source seller document was rejected and requires replacement.'
          else null
        end,
        source_system = 'seller_document_transaction_continuity_p0_6',
        updated_at = now()
    where id = v_transaction_canonical.id;
  end if;

  update public.transaction_required_documents transaction_requirement
  set status = v_projected_status,
      uploaded_document_id = case when v_projected_status = 'rejected' then null else v_shared_document.id end,
      is_uploaded = v_projected_status <> 'rejected',
      uploaded_at = case
        when v_projected_status = 'rejected' then null
        else coalesce(transaction_requirement.uploaded_at, v_document.uploaded_at, now())
      end,
      canonical_requirement_instance_id = coalesce(
        v_transaction_canonical.id,
        transaction_requirement.canonical_requirement_instance_id
      ),
      updated_at = now()
  where transaction_requirement.transaction_id = v_transaction_id
    and (
      transaction_requirement.uploaded_document_id = v_shared_document.id
      or (v_transaction_canonical.id is not null
        and transaction_requirement.canonical_requirement_instance_id = v_transaction_canonical.id)
      or public.bridge_normalize_seller_document_key_p0_4(
        coalesce(transaction_requirement.requirement_key, transaction_requirement.document_key)
      ) = v_source_key
    );

  update public.document_requests request
  set status = case
        when v_projected_status = 'rejected' then 'requested'
        when request.status = 'completed' or not coalesce(request.requires_review, true) then 'completed'
        else v_request_status
      end,
      requested_document_id = case when v_projected_status = 'rejected' then null else v_shared_document.id end,
      completed_at = case
        when v_projected_status = 'rejected' or coalesce(request.requires_review, true) then null
        else coalesce(request.completed_at, v_document.updated_at, now())
      end,
      rejection_reason = case
        when v_projected_status = 'rejected' then 'The source seller document was rejected and requires replacement.'
        else null
      end,
      canonical_requirement_instance_id = coalesce(
        v_transaction_canonical.id,
        request.canonical_requirement_instance_id
      ),
      updated_at = now()
  where request.transaction_id = v_transaction_id
    and (
      request.requested_document_id = v_shared_document.id
      or (v_transaction_canonical.id is not null
        and request.canonical_requirement_instance_id = v_transaction_canonical.id)
      or public.bridge_normalize_seller_document_key_p0_4(request.requirement_id) = v_source_key
      or public.bridge_normalize_seller_document_key_p0_4(request.document_type) = v_source_key
      or public.bridge_normalize_seller_document_key_p0_4(request.document_type)
        = public.bridge_normalize_seller_document_key_p0_4(v_shared_document.category)
    );

  return jsonb_build_object(
    'promoted', true,
    'pending_transaction_promotion', false,
    'transaction_id', v_transaction_id,
    'private_listing_document_id', v_document.id,
    'transaction_requirement_instance_id', v_transaction_canonical.id,
    'projected_status', v_projected_status,
    'shared_projected_status', v_shared_status,
    'shared_document', to_jsonb(v_shared_document)
  );
exception when others then
  update public.private_listing_documents
  set promotion_status = 'failed',
      promotion_error = left(sqlerrm, 500),
      promotion_attempted_at = now(),
      promotion_revision = greatest(coalesce(promotion_revision, 0), 1)
  where id = p_private_listing_document_id;
  return jsonb_build_object('promoted', false, 'reason', 'continuity_enrichment_failed', 'error', sqlerrm);
end;
$$;

-- Preserve the live promoter once.  It contains newer transaction-linking and
-- notification behavior that P0-6 must not replace.
do $$
declare
  v_current_promoter oid := to_regprocedure('public.bridge_promote_private_listing_document_row(uuid)');
  v_current_definition text;
begin
  if to_regprocedure('public.bridge_promote_private_listing_document_row_pre_p0_6(uuid)') is null then
    if v_current_promoter is null then
      raise exception 'Seller-document continuity reconciliation requires a current promoter to preserve.';
    end if;
    v_current_definition := pg_get_functiondef(v_current_promoter);
    if position('bridge_promote_private_listing_document_row_pre_p0_6' in v_current_definition) > 0 then
      raise exception 'Refusing to preserve a promoter whose private pre-P0-6 base is missing.';
    end if;
    execute 'alter function public.bridge_promote_private_listing_document_row(uuid) rename to bridge_promote_private_listing_document_row_pre_p0_6';
  end if;
end;
$$;

revoke all on function public.bridge_promote_private_listing_document_row_pre_p0_6(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bridge_apply_seller_document_transaction_continuity_p0_6(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_promote_private_listing_document_row(p_private_listing_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.private_listing_documents%rowtype;
  v_listing public.private_listings%rowtype;
  v_base_result jsonb;
  v_continuity jsonb;
begin
  select * into v_document
  from public.private_listing_documents
  where id = p_private_listing_document_id;

  if found then
    select * into v_listing
    from public.private_listings
    where id = v_document.private_listing_id;
  end if;

  -- The public upload wrapper validates the portal token before it sets this
  -- transaction-local marker.  It permits only that validated legacy path to
  -- reach the preserved promoter at depth zero.
  if found and v_listing.id is not null
     and pg_trigger_depth() = 0
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce(current_setting('bridge.seller_portal_upload_authorized', true), '') <> 'true'
     and not public.bridge_is_active_member(v_listing.organisation_id) then
    raise exception using
      errcode = '42501',
      message = 'Active organisation membership is required to promote seller documents.';
  end if;

  v_base_result := public.bridge_promote_private_listing_document_row_pre_p0_6(p_private_listing_document_id);
  v_continuity := public.bridge_apply_seller_document_transaction_continuity_p0_6(p_private_listing_document_id);
  return coalesce(v_base_result, '{}'::jsonb) || jsonb_build_object(
    'continuity', v_continuity,
    'promoted', coalesce((v_continuity ->> 'promoted')::boolean, false),
    'pending_transaction_promotion', coalesce((v_continuity ->> 'pending_transaction_promotion')::boolean, false)
  );
end;
$$;

revoke all on function public.bridge_promote_private_listing_document_row(uuid)
  from public, anon;
grant execute on function public.bridge_promote_private_listing_document_row(uuid)
  to authenticated, service_role;

-- The preserved pending-promoter resolves the public function name at runtime,
-- so it now uses the wrapper above while retaining its live selection logic.
revoke all on function public.bridge_promote_pending_private_listing_documents(uuid)
  from public, anon;
grant execute on function public.bridge_promote_pending_private_listing_documents(uuid)
  to authenticated, service_role;

create or replace function public.bridge_sync_seller_document_transaction_continuity_p0_6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The public upload wrapper performs one explicit promotion after its
  -- validated base finishes.  A canonical-link update inside that base would
  -- otherwise invoke this trigger and duplicate the live DocumentUploaded
  -- event before the explicit promotion runs.
  if coalesce(current_setting('bridge.seller_portal_upload_authorized', true), '') = 'true' then
    return new;
  end if;
  perform public.bridge_promote_private_listing_document_row(new.id);
  return new;
end;
$$;

-- Do not fire on INSERT: the established seller-upload RPC already calls the
-- promoter and firing here would duplicate transaction events.  Updates to
-- review state, linkage or file reference do need a fresh projection.
drop trigger if exists trg_sync_seller_document_transaction_continuity_p0_6 on public.private_listing_documents;
create trigger trg_sync_seller_document_transaction_continuity_p0_6
after update of status, requirement_id, canonical_requirement_instance_id, storage_path, file_url
on public.private_listing_documents
for each row execute function public.bridge_sync_seller_document_transaction_continuity_p0_6();

create or replace function public.bridge_promote_listing_documents_from_transaction_p0_6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid := nullif(coalesce(to_jsonb(new) ->> 'private_listing_id', to_jsonb(new) ->> 'listing_id'), '')::uuid;
begin
  if v_listing_id is not null then
    perform public.bridge_promote_pending_private_listing_documents(v_listing_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promote_listing_documents_from_transaction_p0_6 on public.transactions;
create trigger trg_promote_listing_documents_from_transaction_p0_6
after insert or update on public.transactions
for each row execute function public.bridge_promote_listing_documents_from_transaction_p0_6();

create or replace function public.bridge_satisfy_new_transaction_seller_request_p0_6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_key text := public.bridge_normalize_seller_document_key_p0_4(coalesce(new.requirement_id, new.document_type));
begin
  select * into v_document
  from public.documents document
  where document.transaction_id = new.transaction_id
    and document.source = 'seller_portal'
    and document.status in ('uploaded', 'pending_review', 'approved')
    and (
      (new.canonical_requirement_instance_id is not null
        and document.canonical_requirement_instance_id = new.canonical_requirement_instance_id)
      or public.bridge_normalize_seller_document_key_p0_4(document.document_type) = v_key
      or public.bridge_normalize_seller_document_key_p0_4(document.category) = v_key
    )
  order by case when document.status = 'approved' then 0 else 1 end,
    document.updated_at desc nulls last, document.created_at desc
  limit 1;

  if found then
    new.status := case when coalesce(new.requires_review, true) then 'uploaded' else 'completed' end;
    new.requested_document_id := v_document.id;
    new.completed_at := case when coalesce(new.requires_review, true) then null else now() end;
    new.rejection_reason := null;
    new.canonical_requirement_instance_id := coalesce(
      new.canonical_requirement_instance_id,
      v_document.canonical_requirement_instance_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_satisfy_new_transaction_seller_request_p0_6 on public.document_requests;
create trigger trg_satisfy_new_transaction_seller_request_p0_6
before insert or update of requirement_id, document_type, canonical_requirement_instance_id
on public.document_requests
for each row execute function public.bridge_satisfy_new_transaction_seller_request_p0_6();

create or replace function public.bridge_satisfy_new_transaction_required_document_p0_6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_key text := public.bridge_normalize_seller_document_key_p0_4(coalesce(new.requirement_key, new.document_key));
begin
  select * into v_document
  from public.documents document
  where document.transaction_id = new.transaction_id
    and document.source = 'seller_portal'
    and document.status in ('uploaded', 'pending_review', 'approved')
    and (
      (new.canonical_requirement_instance_id is not null
        and document.canonical_requirement_instance_id = new.canonical_requirement_instance_id)
      or public.bridge_normalize_seller_document_key_p0_4(document.document_type) = v_key
      or public.bridge_normalize_seller_document_key_p0_4(document.category) = v_key
    )
  order by case when document.status = 'approved' then 0 else 1 end,
    document.updated_at desc nulls last, document.created_at desc
  limit 1;

  if found then
    new.status := case
      when v_document.status = 'pending_review' then 'under_review'
      when v_document.status = 'approved' then 'approved'
      else 'uploaded'
    end;
    new.uploaded_document_id := v_document.id;
    new.is_uploaded := true;
    new.uploaded_at := coalesce(new.uploaded_at, v_document.updated_at, now());
    new.canonical_requirement_instance_id := coalesce(
      new.canonical_requirement_instance_id,
      v_document.canonical_requirement_instance_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_satisfy_new_transaction_required_document_p0_6 on public.transaction_required_documents;
create trigger trg_satisfy_new_transaction_required_document_p0_6
before insert or update of requirement_key, document_key, canonical_requirement_instance_id
on public.transaction_required_documents
for each row execute function public.bridge_satisfy_new_transaction_required_document_p0_6();

-- Preserve the validated portal wrapper once, then use it as the private base
-- for a public wrapper that carries the narrowly scoped upload marker.
do $$
declare
  v_current_upload oid := to_regprocedure('public.bridge_upload_private_listing_seller_document(text,text,text,text,text,text,uuid,text,text)');
  v_current_definition text;
begin
  if to_regprocedure('public.bridge_upload_private_listing_seller_document_p0_4(text,text,text,text,text,text,uuid,text,text)') is null then
    if v_current_upload is null then
      raise exception 'Seller-document continuity reconciliation requires the current nine-argument upload RPC to preserve as its private base.';
    end if;
    v_current_definition := pg_get_functiondef(v_current_upload);
    if position('bridge_upload_private_listing_seller_document_p0_4' in v_current_definition) > 0 then
      raise exception 'Refusing to preserve a wrapper whose P0-4 upload base is missing; restore that base explicitly before retrying.';
    end if;
    execute 'alter function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) rename to bridge_upload_private_listing_seller_document_p0_4';
  end if;
end;
$$;

revoke all on function public.bridge_upload_private_listing_seller_document_p0_4(text, text, text, text, text, text, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_upload_private_listing_seller_document(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null,
  p_canonical_requirement_instance_id uuid default null,
  p_category text default null,
  p_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_document public.private_listing_documents%rowtype;
  v_shared public.documents%rowtype;
  v_document_id uuid;
  v_promotion jsonb;
  v_continuity jsonb;
begin
  -- The private base validates the seller-portal token before it mutates a
  -- listing.  Its phase-one upload calls the public promoter, which can now
  -- safely recognise this transaction-local validated portal flow.
  perform set_config('bridge.seller_portal_upload_authorized', 'true', true);
  v_result := public.bridge_upload_private_listing_seller_document_p0_4(
    p_token, p_requirement_key, p_document_name, p_storage_path, p_file_url,
    p_document_type, p_canonical_requirement_instance_id, p_category, p_access_token
  );
  v_document_id := nullif(v_result #>> '{document,id}', '')::uuid;
  if v_document_id is null then
    return v_result;
  end if;

  v_promotion := public.bridge_promote_private_listing_document_row(v_document_id);
  v_continuity := coalesce(
    v_promotion -> 'continuity',
    public.bridge_apply_seller_document_transaction_continuity_p0_6(v_document_id)
  );
  select * into v_document from public.private_listing_documents where id = v_document_id;
  if v_document.promoted_document_id is not null then
    select * into v_shared from public.documents where id = v_document.promoted_document_id;
  end if;
  return v_result || jsonb_build_object(
    'document', to_jsonb(v_document),
    'pending_transaction_promotion', v_document.pending_transaction_promotion,
    'transaction_id', v_document.promoted_transaction_id,
    'shared_document', case when v_shared.id is not null then to_jsonb(v_shared) else null end,
    'promotion', v_promotion,
    'continuity', v_continuity
  );
end;
$$;

revoke all on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  from public;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  to anon, authenticated;

create or replace view public.seller_document_transaction_continuity_v2
with (security_invoker = true)
as
select
  source.id as private_listing_document_id,
  source.private_listing_id,
  listing.organisation_id,
  source.requirement_id,
  requirement.requirement_key,
  source.status as source_status,
  source.canonical_requirement_instance_id as source_canonical_requirement_instance_id,
  coalesce(source.promoted_transaction_id,
    public.bridge_resolve_private_listing_transaction_id(source.private_listing_id)) as transaction_id,
  source.promoted_transaction_id,
  source.promoted_document_id,
  source.pending_transaction_promotion,
  source.promotion_status,
  source.promotion_error,
  shared.status as promoted_status,
  shared.canonical_requirement_instance_id as transaction_canonical_requirement_instance_id,
  transaction_canonical.context_type as transaction_canonical_context_type,
  transaction_canonical.context_id as transaction_canonical_context_id,
  transaction_canonical.status as transaction_requirement_status,
  transaction_canonical.satisfied_by_document_id as transaction_satisfied_by_document_id,
  (select count(*) from public.documents duplicate
    where duplicate.transaction_id = source.promoted_transaction_id
      and duplicate.source = 'seller_portal' and duplicate.source_document_id = source.id) as promoted_copy_count,
  (select count(*) from public.document_requests request
    where request.transaction_id = source.promoted_transaction_id
      and request.status in ('requested', 'rejected')
      and (
        public.bridge_normalize_seller_document_key_p0_4(request.requirement_id)
          = public.bridge_normalize_seller_document_key_p0_4(coalesce(requirement.requirement_key, source.document_type))
        or public.bridge_normalize_seller_document_key_p0_4(request.document_type)
          = public.bridge_normalize_seller_document_key_p0_4(coalesce(requirement.requirement_key, source.document_type))
      )
  ) as open_duplicate_request_count,
  case
    when coalesce(source.promoted_transaction_id,
      public.bridge_resolve_private_listing_transaction_id(source.private_listing_id)) is null then 'pending'
    when source.promoted_document_id is null or shared.id is null then 'blocked'
    when shared.transaction_id is distinct from source.promoted_transaction_id then 'blocked'
    when shared.status is distinct from case
      when source.status in ('approved', 'completed') then 'approved'
      when source.status = 'rejected' then 'rejected'
      when source.status = 'under_review' then 'pending_review'
      else 'uploaded' end then 'blocked'
    when source.status in ('approved', 'completed') and (
      transaction_canonical.id is null or transaction_canonical.context_type <> 'transaction'
      or transaction_canonical.context_id is distinct from source.promoted_transaction_id
      or transaction_canonical.status not in ('approved', 'completed')
      or transaction_canonical.satisfied_by_document_id is distinct from shared.id
    ) then 'blocked'
    when (select count(*) from public.documents duplicate
      where duplicate.transaction_id = source.promoted_transaction_id
        and duplicate.source = 'seller_portal' and duplicate.source_document_id = source.id) > 1 then 'blocked'
    when source.status in ('approved', 'completed') and (select count(*) from public.document_requests request
      where request.transaction_id = source.promoted_transaction_id
        and request.status in ('requested', 'rejected')
        and (
          public.bridge_normalize_seller_document_key_p0_4(request.requirement_id)
            = public.bridge_normalize_seller_document_key_p0_4(coalesce(requirement.requirement_key, source.document_type))
          or public.bridge_normalize_seller_document_key_p0_4(request.document_type)
            = public.bridge_normalize_seller_document_key_p0_4(coalesce(requirement.requirement_key, source.document_type))
        )) > 0 then 'blocked'
    when source.status in ('uploaded', 'under_review', 'rejected') then 'attention'
    else 'healthy'
  end as continuity_health,
  case
    when coalesce(source.promoted_transaction_id,
      public.bridge_resolve_private_listing_transaction_id(source.private_listing_id)) is null then 'transaction_not_created'
    when source.promoted_document_id is null then 'promotion_missing'
    when shared.id is null then 'promoted_document_missing'
    when shared.transaction_id is distinct from source.promoted_transaction_id then 'promotion_target_mismatch'
    when shared.status is distinct from case
      when source.status in ('approved', 'completed') then 'approved'
      when source.status = 'rejected' then 'rejected'
      when source.status = 'under_review' then 'pending_review'
      else 'uploaded' end then 'promoted_status_mismatch'
    when source.status in ('approved', 'completed') and transaction_canonical.id is null then 'transaction_canonical_link_missing'
    when source.status in ('approved', 'completed') and (
      transaction_canonical.context_type <> 'transaction'
      or transaction_canonical.context_id is distinct from source.promoted_transaction_id) then 'transaction_canonical_context_mismatch'
    when source.status in ('approved', 'completed') and (
      transaction_canonical.status not in ('approved', 'completed')
      or transaction_canonical.satisfied_by_document_id is distinct from shared.id)
      then 'approved_requirement_not_satisfied_in_transaction'
    when (select count(*) from public.documents duplicate
      where duplicate.transaction_id = source.promoted_transaction_id
        and duplicate.source = 'seller_portal' and duplicate.source_document_id = source.id) > 1
      then 'duplicate_transaction_seller_document'
    when source.status in ('approved', 'completed') and (select count(*) from public.document_requests request
      where request.transaction_id = source.promoted_transaction_id
        and request.status in ('requested', 'rejected')
        and (
          public.bridge_normalize_seller_document_key_p0_4(request.requirement_id)
            = public.bridge_normalize_seller_document_key_p0_4(coalesce(requirement.requirement_key, source.document_type))
          or public.bridge_normalize_seller_document_key_p0_4(request.document_type)
            = public.bridge_normalize_seller_document_key_p0_4(coalesce(requirement.requirement_key, source.document_type))
        )) > 0
      then 'approved_document_re_requested'
    when source.status = 'rejected' then 'source_document_rejected'
    when source.status in ('uploaded', 'under_review') then 'source_document_pending_approval'
    else null
  end as continuity_issue,
  case
    when coalesce(source.promoted_transaction_id,
      public.bridge_resolve_private_listing_transaction_id(source.private_listing_id)) is null then 'wait_for_transaction_creation'
    when source.promoted_document_id is null or shared.id is null then 'promote_seller_document'
    when source.status in ('approved', 'completed') and transaction_canonical.id is null then 'resolve_transaction_document_requirements'
    when source.status in ('approved', 'completed') and transaction_canonical.satisfied_by_document_id is distinct from shared.id
      then 'resynchronise_transaction_satisfaction'
    when source.status = 'rejected' then 'collect_replacement_from_seller'
    when source.status in ('uploaded', 'under_review') then 'complete_document_review'
    else null
  end as required_action,
  greatest(source.updated_at, shared.updated_at, transaction_canonical.updated_at) as continuity_updated_at
from public.private_listing_documents source
join public.private_listings listing on listing.id = source.private_listing_id
left join public.private_listing_document_requirements requirement on requirement.id = source.requirement_id
left join public.documents shared on shared.id = source.promoted_document_id
left join public.document_requirement_instances transaction_canonical
  on transaction_canonical.id = shared.canonical_requirement_instance_id;

grant select on public.seller_document_transaction_continuity_v2 to authenticated;

notify pgrst, 'reload schema';
commit;
