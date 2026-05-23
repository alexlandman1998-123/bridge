create or replace function public.bridge_audit_offer_transaction_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'converted_to_transaction' or new.transaction_id is null then
    return new;
  end if;

  if old.status = new.status and old.transaction_id is not distinct from new.transaction_id then
    return new;
  end if;

  if to_regclass('public.transaction_events') is not null then
    if not exists (
      select 1
      from public.transaction_events te
      where te.transaction_id = new.transaction_id
        and te.event_type = 'TransactionCreated'
        and te.event_data->>'source' = 'accepted_offer_conversion'
        and te.event_data->>'offerId' = new.id::text
    ) then
      insert into public.transaction_events (
        transaction_id,
        event_type,
        event_data,
        created_by,
        created_by_role,
        created_at,
        updated_at
      )
      values (
        new.transaction_id,
        'TransactionCreated',
        jsonb_strip_nulls(jsonb_build_object(
          'source', 'accepted_offer_conversion',
          'offerId', new.id,
          'buyerLeadId', new.buyer_lead_id,
          'buyerContactId', new.buyer_contact_id,
          'listingId', new.listing_id,
          'offerAmount', new.offer_amount,
          'financeType', new.finance_type,
          'convertedToTransactionAt', coalesce(new.converted_to_transaction_at, now())
        )),
        new.agent_id,
        'agent',
        now(),
        now()
      );
    end if;
  end if;

  if to_regclass('public.workflow_audit_log') is not null then
    if not exists (
      select 1
      from public.workflow_audit_log wal
      where wal.offer_id = new.id
        and wal.transaction_id = new.transaction_id
        and wal.event_type = 'offer_converted_to_transaction'
    ) then
      insert into public.workflow_audit_log (
        organisation_id,
        workflow_type,
        entity_type,
        entity_id,
        lead_id,
        transaction_id,
        offer_id,
        from_stage,
        to_stage,
        event_type,
        actor_id,
        actor_role,
        allowed,
        metadata_json,
        created_at
      )
      values (
        new.organisation_id,
        'buyer_lifecycle',
        'offer',
        new.id,
        new.buyer_lead_id,
        new.transaction_id,
        new.id,
        old.status,
        new.status,
        'offer_converted_to_transaction',
        new.agent_id,
        'agent',
        true,
        jsonb_strip_nulls(jsonb_build_object(
          'source', 'accepted_offer_conversion',
          'listingId', new.listing_id,
          'buyerContactId', new.buyer_contact_id,
          'offerAmount', new.offer_amount,
          'financeType', new.finance_type,
          'convertedToTransactionAt', coalesce(new.converted_to_transaction_at, now())
        )),
        now()
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists offers_audit_transaction_conversion on public.offers;
create trigger offers_audit_transaction_conversion
after update of status, transaction_id on public.offers
for each row
execute function public.bridge_audit_offer_transaction_conversion();
