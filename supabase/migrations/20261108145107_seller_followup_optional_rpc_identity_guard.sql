begin;

-- Some production histories do not install this optional compatibility RPC.
-- Preserve the reminder dispatcher's existing missing-RPC fallback in that case;
-- do not recreate legacy automation or queue notifications during deployment.
do $patch$
declare
  target_oid regprocedure := to_regprocedure('public.bridge_queue_seller_document_follow_ups_p0_3(integer,timestamptz,boolean,uuid)');
  definition text;
  old_clause text := 'client_context.listing_id = requirement.private_listing_id';
begin
  if target_oid is null then
    raise notice 'Optional seller follow-up RPC is absent; its existing fallback is retained.';
    return;
  end if;
  definition := pg_get_functiondef(target_oid);
  if position(old_clause || '::text' in definition) > 0 then
    return;
  end if;
  if position(old_clause in definition) = 0 then
    raise exception 'Unsupported seller follow-up listing identity contract';
  end if;
  execute replace(definition, old_clause, old_clause || '::text');
end;
$patch$;

notify pgrst, 'reload schema';
commit;
