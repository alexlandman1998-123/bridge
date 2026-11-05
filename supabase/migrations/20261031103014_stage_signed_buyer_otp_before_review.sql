begin;

-- The legacy received/uploaded statuses release attorney instructions. A
-- capture receipt must wait for the existing legal-review completion action.
do $patch$
declare
  definition text := pg_get_functiondef('public.bridge_create_mvp_transaction(jsonb)'::regprocedure);
  old_fragment text := '''onboarding_status'', ''signed_otp_received''';
  new_fragment text := '''onboarding_status'', ''signed_otp_uploaded_for_review''';
begin
  if strpos(definition, 'signed_otp_capture') = 0 then
    raise exception 'Signed buyer OTP capture must be installed before staging its review status.';
  end if;
  if strpos(definition, new_fragment) > 0 then return; end if;
  if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
    raise exception 'The signed OTP capture status does not match the reviewed patch scope.';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end;
$patch$;

commit;
