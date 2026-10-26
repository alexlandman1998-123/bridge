-- Correct the phone source in the approved participant bootstrap correction.
do $patch$
declare
  definition text := pg_get_functiondef('public.bridge_seed_mvp_transaction_participants(uuid,jsonb)'::regprocedure);
  old_source text := $old$        t.buyer_phone, 'primary_buyer', 0, true,$old$;
  new_source text := $new$        (select b.phone from public.buyers b where b.id = t.buyer_id), 'primary_buyer', 0, true,$new$;
begin
  if strpos(definition, new_source) > 0 then return; end if;
  if strpos(definition, old_source) = 0 then
    raise exception 'Buyer bootstrap phone correction requires review: installed source differs.';
  end if;
  execute replace(definition, old_source, new_source);
end;
$patch$;
