begin;

-- Guard only new professional add commands. Existing historical duplicates and
-- matrix reconciliation are not rewritten. The command already holds the
-- transaction/source lock, and checks its replay receipt before reaching here.
create function document_requirement_private.assert_new_requirement(
 p_context_type text,p_context_id uuid,p_party text,p_kind text,p_subject uuid,p_definition text,p_label text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists (
  select 1 from public.document_requirement_context_links link
  join public.document_requirement_instances r on r.id=link.requirement_instance_id
  left join public.document_definitions d on d.key=r.document_definition_key
  where link.context_type=p_context_type and link.context_id=p_context_id
   and r.context_type=p_context_type and r.context_id=p_context_id
   and r.requested_from_role=p_party
   and (r.status<>'not_applicable' or r.applicability_override='removed')
   and (case when r.subject_id is not null then r.subject_kind when r.requested_from_contact_id is not null then 'person' else 'party' end)=p_kind
   and coalesce(r.subject_id,r.requested_from_contact_id) is not distinct from p_subject
   and (case when p_definition is not null and r.document_definition_key is not null then r.document_definition_key=p_definition
     else lower(regexp_replace(btrim(coalesce(r.custom_label,d.display_label)), '[[:space:]]+', ' ', 'g')) =
          lower(regexp_replace(btrim(p_label), '[[:space:]]+', ' ', 'g')) end)
 ) then
  raise exception 'This document is already requested for this subject. Use or restore the existing requirement.'
    using errcode='P0001', detail='document_requirement_duplicate';
 end if;
end $$;
revoke all on function document_requirement_private.assert_new_requirement(text,uuid,text,text,uuid,text,text) from public,anon,authenticated;

-- Preserve the established authorization, locks, receipts and upload command.
do $patch$
declare body text; anchor text := '    insert into public.document_requirement_instances(context_type,context_id,transaction_id,listing_id,document_definition_key,';
begin
 select pg_get_functiondef('document_requirement_private.execute_command(uuid,text,text,uuid,uuid,bigint,jsonb)'::regprocedure) into body;
 if position(anchor in body)=0 then raise exception 'Review document add command compatibility before applying duplicate prevention.'; end if;
 execute replace(body,anchor,
  '    perform document_requirement_private.assert_new_requirement(p_context_type,p_context_id,v_party,v_kind,v_subject,d.key,coalesce(v_label,d.display_label));' || chr(10) || anchor);
end $patch$;
notify pgrst,'reload schema';
commit;
