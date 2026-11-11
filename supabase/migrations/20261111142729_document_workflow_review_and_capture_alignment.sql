begin;

-- Extend the existing receipt/revision-checked command, retaining its context
-- access checks, locks, immutable envelope and refresh events for every route.
do $patch$
declare body text; marker text := E'    elsif p_action=''upload'' then'; branch text := $branch$
    elsif p_action='review' then
      v_upload:=coalesce(r.satisfied_by_document_id,r.latest_upload_id);
      v_reason:=nullif(btrim(p_payload->>'reason'),'');
      if r.applicability_override='removed' or r.status='not_applicable' then
        raise exception 'Restore this requirement before reviewing it.' using errcode='22023'; end if;
      if v_upload is null or nullif(p_payload->>'documentId','')::uuid is distinct from v_upload then
        raise exception 'The current file changed. Reload before reviewing it.' using errcode='40001'; end if;
      if not exists(select 1 from jsonb_array_elements(document_requirement_private.read_context(p_context_type,p_context_id)->'documents') evidence
        where evidence->>'id'=v_upload::text and (evidence->>'is_current_evidence')::boolean is true) then
        raise exception 'The current file is not available to this reviewer.' using errcode='42501'; end if;
      if r.status not in ('uploaded','under_review') then
        raise exception 'Only current uploaded evidence can be reviewed.' using errcode='23514'; end if;
      if coalesce(p_payload->>'decision','') not in ('start_review','approve','reject') then
        raise exception 'Choose start review, approve or reject.' using errcode='22023'; end if;
      if length(coalesce(v_reason,''))>2000 or (p_payload->>'decision'='reject' and length(coalesce(v_reason,''))<5) then
        raise exception 'A clear rejection reason of 5 to 2000 characters is required.' using errcode='22023'; end if;
      -- Visibility/upload access is not review authority. Keep legal review in
      -- its assigned attorney lane and do not let an agent claim another role.
      if coalesce(r.reviewer_role,'agent') in ('transferring_attorney','transfer_attorney','bond_attorney','cancellation_attorney') then
        v_lane:=case when r.reviewer_role='bond_attorney' then 'bond_attorney' when r.reviewer_role='cancellation_attorney' then 'cancellation_attorney' else 'transfer_attorney' end;
        if r.transaction_id is null or not coalesce(public.bridge_can_mutate_attorney_lane(r.transaction_id,v_lane,'documents'),false) then
          raise exception 'Only the assigned legal team may review this file.' using errcode='42501'; end if;
      elsif v_role not in ('admin','internal_admin') and not (
        v_role=coalesce(r.reviewer_role,'agent') or
        (coalesce(r.reviewer_role,'agent') in ('agent','agency','agency_admin') and v_role in ('agent','agency_admin'))
      ) then raise exception 'This file requires its assigned reviewer.' using errcode='42501'; end if;
      if not exists(select 1 from public.documents proof where proof.id=v_upload and
        proof.canonical_requirement_instance_id=r.id and proof.transaction_id=r.transaction_id)
        and not exists(select 1 from document_requirement_private.uploads u where u.id=v_upload and u.requirement_id=r.id)
        then raise exception 'The saved evidence could not be verified.' using errcode='23514'; end if;
      insert into public.document_requirement_reviews(requirement_instance_id,document_id,review_status,reviewer_role,reviewer_user_id,review_notes,rejection_reason,reviewed_at)
        values(r.id,v_upload,case p_payload->>'decision' when 'start_review' then 'pending' when 'approve' then 'approved' else 'needs_reupload' end,
          v_role,v_actor,case when p_payload->>'decision'<>'reject' then v_reason end,case when p_payload->>'decision'='reject' then v_reason end,
          case when p_payload->>'decision'<>'start_review' then now() end);
      update public.documents set status=case p_payload->>'decision' when 'start_review' then 'pending_review' when 'approve' then 'approved' else 'rejected' end,
        review_status=case p_payload->>'decision' when 'start_review' then 'under_review' when 'approve' then 'approved' else 'rejected' end
        where id=v_upload and canonical_requirement_instance_id=r.id;
      update public.document_requirement_instances set status=case p_payload->>'decision' when 'start_review' then 'under_review' when 'approve' then 'approved' else 'rejected' end,
        rejection_reason=case when p_payload->>'decision'='reject' then v_reason end where id=r.id returning * into r;
      update public.document_requests set status=case p_payload->>'decision' when 'approve' then 'completed' when 'reject' then 'rejected' else 'under_review' end,
        rejected_reason=case when p_payload->>'decision'='reject' then v_reason end,updated_at=now()
        where canonical_requirement_instance_id=r.id and requested_document_id=v_upload and status<>'cancelled';
      update public.transaction_required_documents set status=r.status,updated_at=now()
        where canonical_requirement_instance_id=r.id and uploaded_document_id=v_upload;
$branch$;
begin
  select pg_get_functiondef('document_requirement_private.execute_command(uuid,text,text,uuid,uuid,bigint,jsonb)'::regprocedure) into body;
  if position('p_action=''review''' in body)=0 then
    if position(marker in body)=0 or position('(''add'',''remove'',''restore'',''upload'',''withdraw'')' in body)=0 then
      raise exception 'Unexpected requirement command source; review before extending review.'; end if;
    body:=replace(body,'(''add'',''remove'',''restore'',''upload'',''withdraw'')','(''add'',''remove'',''restore'',''upload'',''withdraw'',''review'')');
    body:=replace(body,'when ''upload'' then array[''filePath''',E'when ''review'' then array[''decision'',''reason'',''documentId'']\n    when ''upload'' then array[''filePath''');
    if position('when ''review'' then array[''decision'',''reason'',''documentId'']' in body)=0 then
      raise exception 'Unexpected requirement review payload validation.'; end if;
    execute replace(body,marker,branch||marker);
  end if;
end; $patch$;

notify pgrst,'reload schema';
commit;
