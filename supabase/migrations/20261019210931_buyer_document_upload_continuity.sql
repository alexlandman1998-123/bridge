-- Keep the installed token checks and grants while repairing the older buyer
-- upload command. No historical files or approvals are changed by this release.
do $patch$
declare
  definition text;
  old_status text := $old$if v_requirement.document_definition_key is not null and v_previous_status in ('approved', 'completed', 'waived') then$old$;
  original_status text := $old$if v_previous_status in ('approved', 'completed', 'waived') then$old$;
begin
  select pg_get_functiondef('public.bridge_upload_buyer_portal_document(uuid,text,text,text,text,text,text,uuid,uuid,text,text,text,uuid)'::regprocedure) into definition;
  if position('buyer_upload_continuity_v1' in definition)>0 then return; end if;
  if position('    uploaded_by_party,' in definition)=0
     or position(E'    ''buyer'',\n    v_bucket_key,' in definition)=0
     or position('or lower(trim(document_key)) in (v_required_key, v_requirement.document_definition_key)' in definition)=0
     or (position(old_status in definition)=0 and position(original_status in definition)=0) then
    raise exception 'Buyer upload command changed; review continuity patch before applying.';
  end if;
  definition := replace(definition, '    uploaded_by_party,', '    uploaded_by_party,
    client_recipient_role,');
  definition := replace(definition, E'    ''buyer'',\n    v_bucket_key,', E'    ''buyer'',\n    (case when ''seller'' = any(coalesce(v_requirement.visible_to_roles, ''{}''::text[])) then null else ''buyer'' end),\n    v_bucket_key,');
  definition := replace(definition, old_status, 'if v_previous_status = ''waived'' then');
  definition := replace(definition, original_status, 'if v_previous_status = ''waived'' then');
  -- Exact requirement identity is the only authority. A matching generic key
  -- must not overwrite another seller or co-buyer requirement's projection.
  definition := replace(definition,
    'or lower(trim(document_key)) in (v_required_key, v_requirement.document_definition_key)',
    '');
  definition := replace(definition, '  insert into public.documents (', $new$
  -- buyer_upload_continuity_v1: never acknowledge metadata without saved bytes.
  if not exists (select 1 from storage.objects object_row
      where object_row.bucket_id = 'documents' and object_row.name = trim(p_file_path)) then
    raise exception 'The uploaded buyer document was not found in storage. Retry the same file.' using errcode = '22023';
  end if;

  insert into public.documents ($new$);
  -- A type can belong to several co-buyers. Only an explicit instance or a
  -- single unambiguous candidate may resolve an upload made by legacy key.
  if position(E'    select requirement.id\n      into v_requirement_instance_id\n    from public.document_requirement_instances requirement' in definition)=0 then
    raise exception 'Buyer upload requirement lookup changed; review continuity patch.';
  end if;
  definition := replace(definition,
    E'    select requirement.id\n      into v_requirement_instance_id\n    from public.document_requirement_instances requirement',
    E'    select (array_agg(requirement.id))[1]\n      into v_requirement_instance_id\n    from public.document_requirement_instances requirement');
  definition := replace(definition,
    E'    order by requirement.created_at\n    limit 1;',
    '    having count(*) = 1;');
  execute definition;
end;
$patch$;

-- Repair audience metadata only where exact provenance and the canonical
-- requirement prove this is private buyer evidence. Shared agreements such as
-- signed OTPs retain their existing cross-party audience. No bytes are moved.
update public.documents document_row
set client_recipient_role = 'buyer'
from public.document_requirement_instances requirement
where document_row.canonical_requirement_instance_id = requirement.id
  and document_row.transaction_id = requirement.transaction_id
  and document_row.source = 'client_portal_atomic_upload'
  and document_row.uploaded_by_party = 'buyer'
  and document_row.client_recipient_role is null
  and 'buyer' = any(coalesce(requirement.visible_to_roles, '{}'::text[]))
  and not ('seller' = any(coalesce(requirement.visible_to_roles, '{}'::text[])));
