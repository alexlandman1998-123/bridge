create or replace function public.bridge_sync_offer_portal_delivery_opened_phase7()
returns trigger
language plpgsql
as $$
declare
  v_opened_at timestamptz := coalesce(new.viewed_at, new.submitted_at, now());
begin
  if new.id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.viewed_at is not null and old.viewed_at is not null and new.submitted_at is not distinct from old.submitted_at and new.status is not distinct from old.status then
    return new;
  end if;

  update public.communication_deliveries
     set status = case when status = 'failed' then status else 'delivered' end,
         delivered_at = coalesce(delivered_at, v_opened_at),
         opened_at = coalesce(opened_at, v_opened_at),
         metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
           jsonb_strip_nulls(jsonb_build_object(
             'offerPortalStatus', new.status,
             'offerPortalViewedAt', new.viewed_at,
             'offerPortalSubmittedAt', new.submitted_at
           ))
   where portal_session_id = new.id
     and communication_type in ('buyer_verification_link', 'buyer_offer_link', 'offer_link', 'post_viewing_offer_link');

  return new;
end;
$$;
