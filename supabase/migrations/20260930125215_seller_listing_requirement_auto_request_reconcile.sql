begin;

-- The 202607170002 seller request file collided with a different production
-- migration version. Restore the listing-only triggers under a fresh version.
-- Existing requirements are deliberately not backfilled or emailed.
-- Any historical backfill requires a separate reviewed release.

create or replace function journey_private.request_new_seller_listing_requirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := lower(regexp_replace(coalesce(new.requirement_key, ''), '[^a-zA-Z0-9]+', '_', 'g'));
  v_group text := lower(regexp_replace(coalesce(new.requirement_group, ''), '[^a-zA-Z0-9]+', '_', 'g'));
  v_due_date date := current_date;
  v_business_days integer := 0;
begin
  if new.status is distinct from 'required'
     or new.is_required is false
     or new.document_visibility is distinct from 'seller_visible'
     or new.private_listing_id is null
     or coalesce(new.generated_from ->> 'reason', '') = 'agent_document_request'
     or v_key = '' then
    return new;
  end if;

  -- Historical active rows remain for an agent to request deliberately.
  -- An ordinary upsert of those rows must not launch a bulk request.
  if tg_op = 'UPDATE' then
    if old.is_required is true
       and old.document_visibility = 'seller_visible'
       and old.status <> 'not_applicable' then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.private_listing_documents document
    where document.private_listing_id = new.private_listing_id
      and document.status in ('uploaded', 'under_review', 'approved', 'completed')
      and (
        document.requirement_id = new.id
        or lower(regexp_replace(coalesce(document.document_type, ''), '[^a-zA-Z0-9]+', '_', 'g')) = v_key
      )
  ) then
    return new;
  end if;

  new.status := 'requested';
  new.requested_from_role := 'seller';
  new.request_stage := case
    when v_group in ('mandate', 'seller_identity', 'fica', 'marital', 'company', 'trust')
      then 'mandate_ready'
    else 'listing_ready'
  end;
  new.request_priority := case when v_key = 'signed_mandate' then 'blocker' else 'required' end;
  if new.request_due_date is null then
    while v_business_days < 5 loop
      v_due_date := v_due_date + 1;
      if extract(isodow from v_due_date) < 6 then
        v_business_days := v_business_days + 1;
      end if;
    end loop;
    new.request_due_date := v_due_date;
  end if;
  if coalesce(array_length(new.request_delivery_channels, 1), 0) = 0 then
    new.request_delivery_channels := array['in_app']::text[];
  end if;
  new.request_dedupe_key := coalesce(
    nullif(new.request_dedupe_key, ''),
    'seller-document-request:' || new.private_listing_id::text || ':' || v_key || ':v1'
  );
  new.request_source := coalesce(nullif(new.request_source, ''), 'listing_requirement_trigger');
  new.requested_at := coalesce(new.requested_at, now());
  new.request_revision := greatest(coalesce(new.request_revision, 0), 1);
  new.last_request_reason := coalesce(nullif(new.last_request_reason, ''), 'requirement_became_applicable');
  new.request_metadata := coalesce(new.request_metadata, '{}'::jsonb) ||
    jsonb_build_object('issued_automatically', true, 'orchestration_version', 'seller_listing_requirement_v1');
  return new;
end;
$$;

revoke all on function journey_private.request_new_seller_listing_requirement() from public, anon, authenticated;

drop trigger if exists trg_request_new_seller_listing_requirement
  on public.private_listing_document_requirements;
create trigger trg_request_new_seller_listing_requirement
before insert or update of status, is_required, document_visibility, requirement_key, requirement_group
on public.private_listing_document_requirements
for each row
execute function journey_private.request_new_seller_listing_requirement();

create or replace function journey_private.log_seller_listing_requirement_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'requested' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'requested' then return new; end if;
  end if;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    performed_by, visibility, metadata
  ) values (
    new.private_listing_id,
    'seller_document_requested',
    coalesce(new.requirement_name, 'Seller document') || ' requested',
    coalesce(new.requirement_description, 'A document is required to progress the property file.'),
    null,
    'client_visible',
    jsonb_build_object(
      'requirementId', new.id,
      'requirementKey', new.requirement_key,
      'requestedFromRole', new.requested_from_role,
      'requestStage', new.request_stage,
      'requestPriority', new.request_priority,
      'requestDueDate', new.request_due_date,
      'deliveryChannels', new.request_delivery_channels,
      'requestDedupeKey', new.request_dedupe_key,
      'requestSource', new.request_source,
      'requestedAt', new.requested_at
    )
  );
  return new;
end;
$$;

revoke all on function journey_private.log_seller_listing_requirement_request() from public, anon, authenticated;

drop trigger if exists trg_log_seller_listing_requirement_request
  on public.private_listing_document_requirements;
create trigger trg_log_seller_listing_requirement_request
after insert or update of status
on public.private_listing_document_requirements
for each row
execute function journey_private.log_seller_listing_requirement_request();

commit;
