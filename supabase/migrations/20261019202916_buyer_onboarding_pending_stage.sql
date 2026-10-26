-- Restore the onboarding draft stage removed by canonical stage normalisation.
-- Preserve the installed stage mapping, ACL and function attributes.
do $patch$
declare
  definition text := pg_get_functiondef('public.bridge_normalize_transaction_stage(text)'::regprocedure);
  anchor text := $old$    when 'available' then 'Available'$old$;
  addition text := $new$    when 'buyer onboarding pending' then 'Buyer Onboarding Pending'
    when 'available' then 'Available'$new$;
begin
  if strpos(definition, $check$when 'buyer onboarding pending' then 'Buyer Onboarding Pending'$check$) > 0 then return; end if;
  if strpos(definition, anchor) = 0 then
    raise exception 'Onboarding draft stage requires review: installed stage mapping differs.';
  end if;
  execute replace(definition, anchor, addition);
end;
$patch$;
