begin;
-- Portal contexts store listing IDs as text; listing requirements use UUIDs.
do $patch$ declare definition text; old_clause text:='client_context.listing_id = requirement.private_listing_id'; begin
definition:=pg_get_functiondef('public.bridge_queue_seller_document_follow_ups_p0_3(integer,timestamptz,boolean,uuid)'::regprocedure);
if position(old_clause||'::text' in definition)=0 then
 if position(old_clause in definition)=0 then raise exception 'Unsupported seller follow-up listing identity contract';end if;
 execute replace(definition,old_clause,old_clause||'::text');
end if;
end $patch$;
notify pgrst,'reload schema';
commit;
