begin;

alter table if exists public.private_listing_document_requirements
  add column if not exists satisfied_by_document_id uuid references public.private_listing_documents(id) on delete set null,
  add column if not exists satisfaction_verified_at timestamptz,
  add column if not exists satisfaction_method text,
  add column if not exists assurance_state text not null default 'unverified',
  add column if not exists assurance_metadata jsonb not null default '{}'::jsonb;

create index if not exists private_listing_requirements_satisfier_idx
  on public.private_listing_document_requirements(satisfied_by_document_id)
  where satisfied_by_document_id is not null;

create index if not exists private_listing_requirements_assurance_idx
  on public.private_listing_document_requirements(private_listing_id, assurance_state, status);

create or replace function public.bridge_normalize_seller_document_key_p0_4(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '_' from lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9]+', '_', 'g')))
$$;

create or replace function public.bridge_validate_private_listing_document_link_p0_4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.private_listing_document_requirements%rowtype;
  v_canonical public.document_requirement_instances%rowtype;
begin
  if new.requirement_id is not null then
    select * into v_requirement
    from public.private_listing_document_requirements
    where id = new.requirement_id;

    if not found then raise exception 'Seller document requirement does not exist.'; end if;
    if v_requirement.private_listing_id is distinct from new.private_listing_id then
      raise exception 'Seller document and requirement must belong to the same listing.';
    end if;
    if v_requirement.is_required is false or v_requirement.status = 'not_applicable' then
      raise exception 'Seller document requirement is no longer applicable.';
    end if;

    if nullif(public.bridge_normalize_seller_document_key_p0_4(new.document_type), '') is not null
       and public.bridge_normalize_seller_document_key_p0_4(new.document_type)
           is distinct from public.bridge_normalize_seller_document_key_p0_4(v_requirement.requirement_key) then
      raise exception 'Seller document type does not match the selected requirement.';
    end if;
    new.document_type := v_requirement.requirement_key;
    new.canonical_requirement_instance_id := coalesce(
      new.canonical_requirement_instance_id,
      v_requirement.canonical_requirement_instance_id
    );
  end if;

  if new.canonical_requirement_instance_id is not null then
    select * into v_canonical
    from public.document_requirement_instances
    where id = new.canonical_requirement_instance_id;
    if not found then raise exception 'Canonical seller document requirement does not exist.'; end if;
    if v_canonical.context_type <> 'private_listing'
       or (new.private_listing_id is distinct from v_canonical.context_id
           and new.private_listing_id is distinct from v_canonical.listing_id) then
      raise exception 'Canonical seller document requirement belongs to another listing.';
    end if;
    if new.requirement_id is not null
       and public.bridge_normalize_seller_document_key_p0_4(v_canonical.document_definition_key)
           is distinct from public.bridge_normalize_seller_document_key_p0_4(v_requirement.requirement_key) then
      raise exception 'Canonical and seller document requirements do not match.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_private_listing_document_link_p0_4
  on public.private_listing_documents;
create trigger trg_validate_private_listing_document_link_p0_4
before insert or update of private_listing_id, requirement_id, document_type, canonical_requirement_instance_id
on public.private_listing_documents
for each row execute function public.bridge_validate_private_listing_document_link_p0_4();

create or replace function public.bridge_sync_private_listing_requirement_assurance_p0_4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement_id uuid := coalesce(new.requirement_id, old.requirement_id);
  v_latest public.private_listing_documents%rowtype;
begin
  if v_requirement_id is null then return coalesce(new, old); end if;

  select * into v_latest
  from public.private_listing_documents
  where requirement_id = v_requirement_id
    and status <> 'not_applicable'
  order by uploaded_at desc nulls last, created_at desc, id desc
  limit 1;

  if not found then
    update public.private_listing_document_requirements
    set assurance_state = 'missing', satisfied_by_document_id = null,
        satisfaction_verified_at = null, satisfaction_method = null
    where id = v_requirement_id;
  elsif v_latest.status in ('approved', 'completed') then
    update public.private_listing_document_requirements
    set status = v_latest.status,
        assurance_state = 'satisfied',
        satisfied_by_document_id = v_latest.id,
        satisfaction_verified_at = coalesce(v_latest.updated_at, now()),
        satisfaction_method = 'approved_exact_requirement_link',
        assurance_metadata = coalesce(assurance_metadata, '{}'::jsonb) || jsonb_build_object(
          'documentId', v_latest.id, 'documentStatus', v_latest.status,
          'assuranceVersion', 'seller_document_satisfaction_assurance_p0_4'
        )
    where id = v_requirement_id;
  else
    update public.private_listing_document_requirements
    set status = case
          when v_latest.status in ('uploaded', 'under_review', 'rejected') then v_latest.status
          else status
        end,
        assurance_state = case
          when v_latest.status = 'rejected' then 'rejected'
          when v_latest.status in ('uploaded', 'under_review') then 'received_pending_approval'
          else 'missing'
        end,
        satisfied_by_document_id = null,
        satisfaction_verified_at = null,
        satisfaction_method = null,
        assurance_metadata = coalesce(assurance_metadata, '{}'::jsonb) || jsonb_build_object(
          'documentId', v_latest.id, 'documentStatus', v_latest.status,
          'assuranceVersion', 'seller_document_satisfaction_assurance_p0_4'
        )
    where id = v_requirement_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_private_listing_requirement_assurance_p0_4
  on public.private_listing_documents;
create trigger trg_sync_private_listing_requirement_assurance_p0_4
after insert or update of status, requirement_id or delete
on public.private_listing_documents
for each row execute function public.bridge_sync_private_listing_requirement_assurance_p0_4();

create or replace function public.bridge_prevent_false_requirement_completion_p0_4()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_evidence boolean := false;
begin
  if new.status not in ('approved', 'completed') then return new; end if;
  if old.status in ('approved', 'completed') and new.status = old.status then return new; end if;

  select exists (
    select 1 from public.private_listing_documents document
    where document.id = new.satisfied_by_document_id
      and document.requirement_id = new.id
      and document.private_listing_id = new.private_listing_id
      and document.status in ('approved', 'completed')
  ) or exists (
    select 1 from public.document_requirement_instances canonical
    where canonical.id = new.canonical_requirement_instance_id
      and canonical.context_type = 'private_listing'
       and (new.private_listing_id = canonical.context_id or new.private_listing_id = canonical.listing_id)
      and canonical.status in ('approved', 'completed')
      and canonical.satisfied_by_document_id is not null
  ) into v_has_evidence;

  if not v_has_evidence then
    raise exception 'A seller document requirement cannot be completed without approved, listing-scoped evidence.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_false_requirement_completion_p0_4
  on public.private_listing_document_requirements;
create trigger trg_prevent_false_requirement_completion_p0_4
before update of status on public.private_listing_document_requirements
for each row execute function public.bridge_prevent_false_requirement_completion_p0_4();

create or replace function public.bridge_private_listing_seller_document_assurance_p0_4(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with required as (
    select requirement.*,
      exists (
        select 1 from public.private_listing_documents document
        where document.requirement_id = requirement.id
          and document.private_listing_id = requirement.private_listing_id
          and document.status in ('approved', 'completed')
      ) or exists (
        select 1 from public.document_requirement_instances canonical
        where canonical.id = requirement.canonical_requirement_instance_id
          and canonical.context_type = 'private_listing'
          and (canonical.context_id = requirement.private_listing_id or canonical.listing_id = requirement.private_listing_id)
          and canonical.status in ('approved', 'completed')
          and canonical.satisfied_by_document_id is not null
      ) as satisfied,
      exists (
        select 1 from public.private_listing_documents document
        where document.requirement_id = requirement.id
          and document.private_listing_id = requirement.private_listing_id
          and document.status in ('uploaded', 'under_review', 'approved', 'completed')
      ) as received
    from public.private_listing_document_requirements requirement
    where requirement.private_listing_id = p_listing_id
      and requirement.is_required
      and requirement.status <> 'not_applicable'
  )
  select jsonb_build_object(
    'listingId', p_listing_id,
    'ready', count(*) filter (where not satisfied) = 0,
    'totalRequired', count(*),
    'satisfiedCount', count(*) filter (where satisfied),
    'receivedCount', count(*) filter (where received),
    'missingCount', count(*) filter (where not satisfied),
    'falseCompletionCount', count(*) filter (where status in ('approved', 'completed') and not satisfied),
    'missingRequirementIds', coalesce(jsonb_agg(id) filter (where not satisfied), '[]'::jsonb)
  ) from required
$$;

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
  v_resolution record;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_canonical public.document_requirement_instances%rowtype;
  v_result jsonb;
  v_document_id uuid;
  v_listing_id uuid;
  v_key text := nullif(public.bridge_normalize_seller_document_key_p0_4(p_requirement_key), '');
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or not v_resolution.token_valid then raise exception 'Seller portal link is invalid or inactive.'; end if;
  select private_listing_id into v_listing_id
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id;
  if v_listing_id is null then raise exception 'Seller portal listing is unavailable.'; end if;

  if v_key is not null then
    select * into v_requirement
    from public.private_listing_document_requirements
    where private_listing_id = v_listing_id
      and public.bridge_normalize_seller_document_key_p0_4(requirement_key) = v_key
      and is_required
      and status <> 'not_applicable'
      and document_visibility = 'seller_visible'
    limit 1;
    if not found then raise exception 'The selected seller document request is no longer valid.'; end if;
  end if;

  if p_canonical_requirement_instance_id is not null then
    select * into v_canonical from public.document_requirement_instances
    where id = p_canonical_requirement_instance_id;
    if not found
       or v_canonical.context_type <> 'private_listing'
       or (v_listing_id is distinct from v_canonical.context_id
           and v_listing_id is distinct from v_canonical.listing_id) then
      raise exception 'Canonical seller document request belongs to another listing.';
    end if;
    if v_key is not null
       and public.bridge_normalize_seller_document_key_p0_4(v_canonical.document_definition_key) <> v_key then
      raise exception 'Canonical and seller document requests do not match.';
    end if;
    if cardinality(v_canonical.uploadable_by_roles) > 0
       and not ('seller' = any(v_canonical.uploadable_by_roles)) then
      raise exception 'This canonical document request cannot be uploaded by the seller.';
    end if;
  end if;

  v_result := public.bridge_upload_private_listing_seller_document_phase1(
    v_resolution.legacy_token, p_requirement_key, p_document_name, p_storage_path,
    p_file_url, coalesce(v_requirement.requirement_key, p_document_type),
    p_canonical_requirement_instance_id, p_category, p_access_token
  );
  v_document_id := nullif(v_result #>> '{document,id}', '')::uuid;
  if v_document_id is not null and p_canonical_requirement_instance_id is not null then
    update public.private_listing_documents
    set canonical_requirement_instance_id = p_canonical_requirement_instance_id
    where id = v_document_id and private_listing_id = v_listing_id;
  end if;
  if jsonb_typeof(v_result -> 'onboarding') = 'object' then
    v_result := jsonb_set(v_result, '{onboarding}',
      (v_result -> 'onboarding') - 'seller_portal_invite_token_hash', true);
  end if;
  return v_result || jsonb_build_object(
    'assurance', public.bridge_private_listing_seller_document_assurance_p0_4(v_listing_id)
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_document_assurance_p0_4(uuid) to authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

update public.private_listing_document_requirements requirement
set
  assurance_state = case
    when exists (
      select 1 from public.private_listing_documents document
      where document.requirement_id = requirement.id
        and document.private_listing_id = requirement.private_listing_id
        and document.status in ('approved', 'completed')
    ) then 'satisfied'
    when exists (
      select 1 from public.private_listing_documents document
      where document.requirement_id = requirement.id
        and document.private_listing_id = requirement.private_listing_id
        and document.status in ('uploaded', 'under_review')
    ) then 'received_pending_approval'
    when requirement.status = 'rejected' then 'rejected'
    else 'missing'
  end,
  assurance_metadata = coalesce(requirement.assurance_metadata, '{}'::jsonb) || jsonb_build_object(
    'backfilledAt', now(), 'assuranceVersion', 'seller_document_satisfaction_assurance_p0_4'
  );

notify pgrst, 'reload schema';
commit;
