-- Production trigger captured 31 October 2026. Keep its automatic instruction
-- behaviour in the fixture so an upload receipt cannot accidentally release it.
CREATE OR REPLACE FUNCTION public.bridge_activate_mandate_attorney_on_signed_otp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.onboarding_status, '')) not in ('signed_otp_received', 'otp_uploaded') then
    return new;
  end if;

  if new.listing_id is null then
    return new;
  end if;

  update public.private_listing_role_players allocation
  set
    allocation_status = 'instructed',
    transaction_id = new.id,
    instructed_at = coalesce(allocation.instructed_at, now()),
    instruction_source = coalesce(allocation.instruction_source, 'signed_otp_received'),
    updated_at = now()
  where allocation.private_listing_id = new.listing_id
    and allocation.role_type = 'transfer_attorney'
    and allocation.allocation_status in ('awaiting_buyer', 'under_offer', 'instructed');

  return new;
end;
$function$;
create trigger activate_mandate_attorney_on_signed_otp after insert or update of onboarding_status on transactions for each row execute function bridge_activate_mandate_attorney_on_signed_otp();
