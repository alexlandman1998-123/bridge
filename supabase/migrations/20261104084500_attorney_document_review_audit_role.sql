begin;
-- Keep the detailed reviewer lane for authorisation; audit rows use the app role.
do $patch$ declare definition text; needle text:='auth.uid(), p_actor_role, ''internal''';begin
 definition:=pg_get_functiondef('public.bridge_review_attorney_document(uuid,uuid,text,text,text,uuid)'::regprocedure);
 if position(needle in definition)>0 then
  execute replace(definition,needle,'auth.uid(), ''attorney'', ''internal''');
 elsif position('auth.uid(), ''attorney'', ''internal''' in definition)=0 then
  raise exception 'Unsupported attorney document review audit contract';
 end if;
end $patch$;
notify pgrst,'reload schema';
commit;
