-- Read-only proof for the assigned consultant's accepted signed original.
-- Keep original tables private; never grant direct browser access to uploads.
create function public.bridge_bond_submission_pack_original(p_transaction uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; s public.transaction_bond_application_submissions; evidence jsonb;
begin
 select * into a from public.bond_applications where transaction_id=p_transaction;
 if a.id is null or not public.bridge_bond_wet_ink_consultant(a.id) then
  raise exception 'This submission pack is not accessible.' using errcode='42501';
 end if;
 select * into s from public.transaction_bond_application_submissions where id=a.active_submission_id and transaction_id=p_transaction;
 if s.metadata->>'signingMethod'='wet_ink_upload' then
  select jsonb_build_object('id',u.id,'documentId',u.document_id,'filePath',u.file_path,'bytes',u.bytes,'sha256',u.sha256,'status',u.status,'submissionId',v.submission_id)
  into evidence from public.bond_wet_ink_uploads u join public.bond_wet_ink_versions v on v.id=u.version_id
  where u.id::text=s.metadata->>'originalUploadId' and u.document_id=s.signed_document_id
  and u.status='accepted' and v.status='accepted' and v.submission_id=s.id and v.transaction_id=p_transaction;
 end if;
 return jsonb_build_object('submissionId',s.id,'originalEvidence',evidence,'statementHandoff',jsonb_build_object('status','not_connected'));
end $$;
revoke all on function public.bridge_bond_submission_pack_original(uuid) from public,anon;
grant execute on function public.bridge_bond_submission_pack_original(uuid) to authenticated;

create function public.bridge_bond_submission_pack_queue()
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by signed_at desc),'[]'::jsonb) from (
  select s.signed_at,jsonb_build_object('transactionId',a.transaction_id,'submissionId',s.id,'version',s.submission_version,'applicantNames',coalesce((select string_agg(signer->>'fullName',' and ') from jsonb_array_elements(coalesce(s.signer_manifest_json,'[]'::jsonb)) signer),'Bond application')) item
  from public.bond_applications a join public.transaction_bond_application_submissions s on s.id=a.active_submission_id and s.transaction_id=a.transaction_id
  where public.bridge_bond_wet_ink_consultant(a.id) and s.status in ('signed','submitted') and s.signed_document_id is not null
  order by s.signed_at desc limit 500
 ) available
$$;
revoke all on function public.bridge_bond_submission_pack_queue() from public,anon;
grant execute on function public.bridge_bond_submission_pack_queue() to authenticated;
