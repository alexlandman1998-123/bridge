begin;
do $patch$ declare definition text; old_clause text:='where listing_id = new.listing_id';begin
definition:=pg_get_functiondef('public.bridge_route_seller_document_delivery_phase7()'::regprocedure);
if position(old_clause||'::text' in definition)=0 then
 if position(old_clause in definition)=0 then raise exception 'Unsupported seller delivery listing identity contract';end if;
 execute replace(definition,old_clause,old_clause||'::text');
end if;
end $patch$;
notify pgrst,'reload schema';
commit;
