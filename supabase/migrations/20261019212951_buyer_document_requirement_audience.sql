-- Legacy canonical requirements use client/purchaser for buyer ownership.
-- The document table deliberately accepts only buyer or seller audiences.
-- Retain the table constraint and all command identity/receipt/access checks.
do $patch$
declare
  target text;
  definition text;
  owner_expression text;
  old_fragment text;
  new_fragment text;
begin
  foreach target in array array[
    'document_requirement_private.execute_command(uuid,text,text,uuid,uuid,bigint,jsonb)',
    'document_requirement_private.promote_uploads()'
  ] loop
    select pg_get_functiondef(target::regprocedure) into definition;
    if position('buyer_requirement_audience_v1' in definition)>0 then continue; end if;
    owner_expression := case when target like '%execute_command%' then 'r.requested_from_role' else 'new.requested_from_role' end;
    old_fragment := '''client_visible'',true,' || owner_expression || ',''document_requirement_command''';
    if position(old_fragment in definition)=0 then
      raise exception 'Requirement upload audience changed in %; review patch before applying.', target;
    end if;
    new_fragment := '''client_visible'',true,(case'
      || ' when ' || owner_expression || ' in (''buyer'',''client'',''purchaser'',''buying_client'') and ''seller'' = any(coalesce(' || case when target like '%execute_command%' then 'r.visible_to_roles' else 'new.visible_to_roles' end || ',''{}''::text[])) then null'
      || ' when ' || owner_expression || ' in (''seller'',''vendor'',''selling_client'') and ''buyer'' = any(coalesce(' || case when target like '%execute_command%' then 'r.visible_to_roles' else 'new.visible_to_roles' end || ',''{}''::text[])) then null'
      || ' when ' || owner_expression || ' in (''client'',''purchaser'',''buying_client'') then ''buyer'''
      || ' when ' || owner_expression || ' in (''vendor'',''selling_client'') then ''seller'''
      || ' else ' || owner_expression || ' end),''document_requirement_command'' /* buyer_requirement_audience_v1 */';
    execute replace(definition, old_fragment, new_fragment);
  end loop;
end;
$patch$;
