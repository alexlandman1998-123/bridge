-- A transaction may only originate from a reviewed, fully executed wet-ink
-- offer. The checks live in the database so legacy clients cannot bypass the
-- workflow by changing an offer status or inserting a transaction directly.
create or replace function public.bridge_offer_wet_ink_execution_ready(
  p_offer_id uuid,
  p_organisation_id uuid,
  p_listing_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.offer_wet_ink_execution_records execution
    join public.offers offer on offer.id = execution.offer_id
    where execution.offer_id = p_offer_id
      and execution.organisation_id = p_organisation_id
      and offer.organisation_id = p_organisation_id
      and execution.listing_id = offer.listing_id
      and (p_listing_id is null or execution.listing_id = p_listing_id)
      and execution.status = 'fully_executed'
      and execution.printable_pack_document_id is not null
      and execution.buyer_signed_document_id is not null
      and execution.seller_signed_document_id is not null
      and execution.reviewed_by is not null
      and execution.reviewed_at is not null
  );
$$;

create or replace function public.bridge_assert_wet_ink_offer_transaction_ready(
  p_organisation_id uuid,
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers%rowtype;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'An active organisation member is required.' using errcode = '42501';
  end if;

  select * into v_offer
  from public.offers
  where id = p_offer_id and organisation_id = p_organisation_id;

  if v_offer.id is null then
    raise exception 'The offer is not available in this organisation.' using errcode = '22023';
  end if;

  if not public.bridge_offer_wet_ink_execution_ready(v_offer.id, v_offer.organisation_id, v_offer.listing_id) then
    raise exception 'A reviewed, fully executed wet-ink OTP is required before creating a transaction.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'offerId', v_offer.id,
    'listingId', v_offer.listing_id,
    'executionReady', true
  );
end;
$$;

create or replace function public.bridge_enforce_wet_ink_offer_transaction_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.accepted_offer_id is null then
    return new;
  end if;

  if not public.bridge_offer_wet_ink_execution_ready(new.accepted_offer_id, new.organisation_id, new.listing_id) then
    raise exception 'A reviewed, fully executed wet-ink OTP is required before creating a transaction.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists bridge_enforce_wet_ink_offer_transaction_creation_trigger on public.transactions;
create trigger bridge_enforce_wet_ink_offer_transaction_creation_trigger
before insert or update of accepted_offer_id, organisation_id, listing_id
on public.transactions
for each row
when (new.accepted_offer_id is not null)
execute function public.bridge_enforce_wet_ink_offer_transaction_creation();

create or replace function public.bridge_enforce_wet_ink_offer_transaction_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'converted_to_transaction' or new.transaction_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.transaction_id is not distinct from old.transaction_id then
    return new;
  end if;

  if not public.bridge_offer_wet_ink_execution_ready(new.id, new.organisation_id, new.listing_id) then
    raise exception 'A reviewed, fully executed wet-ink OTP is required before linking this offer to a transaction.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.id = new.transaction_id
      and transaction_row.organisation_id = new.organisation_id
      and transaction_row.accepted_offer_id = new.id
  ) then
    raise exception 'The transaction must be created from this fully executed offer.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists bridge_enforce_wet_ink_offer_transaction_link_trigger on public.offers;
create trigger bridge_enforce_wet_ink_offer_transaction_link_trigger
before update of status, transaction_id
on public.offers
for each row
when (new.status = 'converted_to_transaction' and new.transaction_id is not null)
execute function public.bridge_enforce_wet_ink_offer_transaction_link();

create or replace function public.bridge_prevent_wet_ink_execution_mutation_after_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.accepted_offer_id = old.offer_id
      and transaction_row.organisation_id = old.organisation_id
  ) then
    raise exception 'Wet-ink OTP evidence is locked after its offer has created a transaction.' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_prevent_wet_ink_execution_mutation_after_transaction_trigger on public.offer_wet_ink_execution_records;
create trigger bridge_prevent_wet_ink_execution_mutation_after_transaction_trigger
before update or delete
on public.offer_wet_ink_execution_records
for each row
execute function public.bridge_prevent_wet_ink_execution_mutation_after_transaction();

-- A reviewed physical OTP is the acceptance event. This replaces any
-- client-side status promotion before conversion.
create or replace function public.bridge_review_wet_ink_offer_execution(p_offer_id uuid, p_decision text, p_review_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_review_note, '')), '');
  v_record public.offer_wet_ink_execution_records%rowtype;
begin
  select * into v_record
  from public.offer_wet_ink_execution_records
  where offer_id = p_offer_id
  for update;

  if v_record.offer_id is null or not public.bridge_offer_wet_ink_reviewer_authorized(v_record.organisation_id) then
    raise exception 'Wet-ink execution review requires an authorised organisation reviewer.' using errcode = '42501';
  end if;
  if v_decision not in ('approve', 'reject') or v_note is null or char_length(v_note) < 20 then
    raise exception 'Record an approve/reject decision and a review note of at least 20 characters.' using errcode = '22023';
  end if;
  if v_record.status <> 'awaiting_review' then
    raise exception 'Wet-ink execution evidence must be awaiting review before an execution decision.' using errcode = '22023';
  end if;
  if v_decision = 'approve' and (v_record.buyer_signed_document_id is null or v_record.seller_signed_document_id is null) then
    raise exception 'Both buyer and seller wet-ink evidence must be received before approval.' using errcode = '22023';
  end if;

  update public.offer_wet_ink_execution_records
  set status = case when v_decision = 'approve' then 'fully_executed' else 'rejected' end,
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_note = v_note,
      updated_at = now()
  where offer_id = v_record.offer_id;

  if v_decision = 'approve' then
    update public.offers
    set status = case when status = 'converted_to_transaction' then status else 'accepted' end,
        accepted_at = coalesce(accepted_at, now()),
        updated_at = now()
    where id = v_record.offer_id
      and organisation_id = v_record.organisation_id;
  end if;

  insert into public.offer_wet_ink_execution_events (offer_id, organisation_id, actor_id, event_type, note)
  values (
    v_record.offer_id,
    v_record.organisation_id,
    v_actor,
    case when v_decision = 'approve' then 'execution_approved' else 'execution_rejected' end,
    v_note
  );

  return jsonb_build_object(
    'offerId', v_record.offer_id,
    'status', case when v_decision = 'approve' then 'fully_executed' else 'rejected' end,
    'offerStatus', case when v_decision = 'approve' then 'accepted' else null end
  );
end;
$$;

update public.offers offer
set status = case when offer.status = 'converted_to_transaction' then offer.status else 'accepted' end,
    accepted_at = coalesce(offer.accepted_at, execution.reviewed_at, now()),
    updated_at = now()
from public.offer_wet_ink_execution_records execution
where execution.offer_id = offer.id
  and execution.organisation_id = offer.organisation_id
  and execution.status = 'fully_executed'
  and offer.transaction_id is null;

revoke all on function public.bridge_offer_wet_ink_execution_ready(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.bridge_assert_wet_ink_offer_transaction_ready(uuid, uuid) from public, anon;
revoke all on function public.bridge_enforce_wet_ink_offer_transaction_creation() from public, anon, authenticated;
revoke all on function public.bridge_enforce_wet_ink_offer_transaction_link() from public, anon, authenticated;
revoke all on function public.bridge_prevent_wet_ink_execution_mutation_after_transaction() from public, anon, authenticated;
revoke all on function public.bridge_review_wet_ink_offer_execution(uuid, text, text) from public, anon;
grant execute on function public.bridge_assert_wet_ink_offer_transaction_ready(uuid, uuid) to authenticated;
grant execute on function public.bridge_review_wet_ink_offer_execution(uuid, text, text) to authenticated;
