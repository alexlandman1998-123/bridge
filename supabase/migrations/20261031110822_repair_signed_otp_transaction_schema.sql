begin;

-- Keep the capture mode in the validated routing profile. The live transaction
-- table has no creation_mode column; all other insert columns were checked
-- against the production catalog before this correction.
do $patch$
declare
  definition text := pg_get_functiondef('public.bridge_create_mvp_transaction(jsonb)'::regprocedure);
  old_columns text := 'agency_commission_amount, creation_idempotency_key, creation_mode,';
  new_columns text := 'agency_commission_amount, creation_idempotency_key,';
  old_values text := 'v_idempotency_key, v_creation_mode, now(), now()';
  new_values text := 'v_idempotency_key, now(), now()';
begin
  if strpos(definition, 'signed_otp_capture') = 0 then
    raise exception 'Signed buyer OTP capture must be installed before repairing its transaction insert.';
  end if;
  if strpos(definition, old_columns) = 0 and strpos(definition, old_values) = 0 then
    if strpos(definition, new_columns) > 0 and strpos(definition, new_values) > 0 then return; end if;
    raise exception 'The transaction insert does not match the reviewed schema correction.';
  end if;
  if (length(definition)-length(replace(definition,old_columns,'')))/length(old_columns) <> 1
    or (length(definition)-length(replace(definition,old_values,'')))/length(old_values) <> 1 then
    raise exception 'The transaction insert does not match the reviewed schema correction.';
  end if;
  execute replace(replace(definition,old_columns,new_columns),old_values,new_values);
end;
$patch$;

commit;
