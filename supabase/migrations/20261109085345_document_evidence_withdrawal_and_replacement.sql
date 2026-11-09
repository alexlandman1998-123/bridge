begin;

-- Keep saved bytes and reviews as protected history. Current-evidence identity
-- follows the canonical pointer, rather than a filename or upload timestamp.
alter table public.documents add column if not exists is_current_evidence boolean not null default true;
alter table public.private_listing_documents add column if not exists is_current_evidence boolean not null default true;
create index if not exists document_current_evidence_pointer_idx
  on public.document_requirement_instances(satisfied_by_document_id)
  where satisfied_by_document_id is not null and coalesce(applicability_override,'')<>'removed' and status<>'not_applicable';
create index if not exists transaction_current_registration_proof_idx
  on public.transactions(registration_confirmation_document_id)
  where registered_at is not null;
create or replace function document_requirement_private.sync_current_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  with flags as (select d.id,exists(select 1 from public.document_requirement_instances r where r.satisfied_by_document_id=d.id
    and coalesce(r.applicability_override,'')<>'removed' and r.status<>'not_applicable')
    or exists(select 1 from public.transactions t where t.registration_confirmation_document_id=d.id and t.registered_at is not null) as current_file from public.documents d where d.id in (old.satisfied_by_document_id,new.satisfied_by_document_id))
  update public.documents target set is_current_evidence=flags.current_file from flags
    where target.id=flags.id and target.is_current_evidence is distinct from flags.current_file;
  with flags as (select p.id,exists(select 1 from public.document_requirement_instances r
    where r.id=p.canonical_requirement_instance_id and coalesce(r.applicability_override,'')<>'removed' and r.status<>'not_applicable'
      and (p.id=r.satisfied_by_document_id or p.promoted_document_id=r.satisfied_by_document_id or exists(
        select 1 from public.documents d where d.id=r.satisfied_by_document_id
          and d.file_path=p.storage_path and coalesce(d.file_bucket,'documents')='documents'))) as current_file from public.private_listing_documents p where p.canonical_requirement_instance_id=new.id)
  update public.private_listing_documents target set is_current_evidence=flags.current_file from flags
    where target.id=flags.id and target.is_current_evidence is distinct from flags.current_file;
  return new;
end; $$;
revoke all on function document_requirement_private.sync_current_evidence() from public,anon,authenticated;
drop trigger if exists zz_document_current_evidence on public.document_requirement_instances;
create trigger zz_document_current_evidence after update of satisfied_by_document_id,applicability_override,status
on public.document_requirement_instances for each row execute function document_requirement_private.sync_current_evidence();

with flags as (select d.id,exists(select 1 from public.document_requirement_instances r where r.satisfied_by_document_id=d.id
    and coalesce(r.applicability_override,'')<>'removed' and r.status<>'not_applicable')
    or exists(select 1 from public.transactions t where t.registration_confirmation_document_id=d.id and t.registered_at is not null) as current_file from public.documents d where d.canonical_requirement_instance_id is not null)
  update public.documents target set is_current_evidence=flags.current_file from flags
    where target.id=flags.id and target.is_current_evidence is distinct from flags.current_file;

with flags as (select p.id,exists(select 1 from public.document_requirement_instances r
    where r.id=p.canonical_requirement_instance_id and coalesce(r.applicability_override,'')<>'removed' and r.status<>'not_applicable'
      and (p.id=r.satisfied_by_document_id or p.promoted_document_id=r.satisfied_by_document_id or exists(
        select 1 from public.documents d where d.id=r.satisfied_by_document_id
          and d.file_path=p.storage_path and coalesce(d.file_bucket,'documents')='documents'))) as current_file from public.private_listing_documents p where p.canonical_requirement_instance_id is not null)
  update public.private_listing_documents target set is_current_evidence=flags.current_file from flags
    where target.id=flags.id and target.is_current_evidence is distinct from flags.current_file;

-- Extend the established actor-scoped receipts, revision checks, authorisation,
-- transaction locks and audit event mechanism. Do not invent a second mutation
-- path which could race a review or replay an uncertain delete.
do $patch$
declare body text; read_function regprocedure; marker text := E'    elsif p_action=''upload'' then'; branch text := $branch$
    elsif p_action='withdraw' then
      v_reason:=btrim(p_payload->>'reason');
      if v_reason is null or length(v_reason) not between 1 and 2000 then
        raise exception 'A reason of 1 to 2000 characters is required.' using errcode='22023'; end if;
      v_upload:=coalesce(r.satisfied_by_document_id,r.latest_upload_id);
      if v_upload is null or nullif(p_payload->>'documentId','')::uuid is distinct from v_upload then
        raise exception 'The current file changed. Reload before removing it.' using errcode='40001'; end if;
      if r.applicability_override='removed' or r.status='not_applicable' then
        raise exception 'Restore this requirement before changing its file.' using errcode='22023'; end if;
      if exists(select 1 from public.transactions t
        where t.registration_confirmation_document_id=v_upload
          and t.registered_at is not null) then
        raise exception 'Replace the transaction registration proof before removing its current file.' using errcode='23514'; end if;
      -- An uploaded/completed solicitation is history. Reopen only active ones;
      -- clearing the authoritative pointer below prevents historical fallback.
      update public.document_requests set requested_document_id=null,status='requested',updated_at=now()
        where canonical_requirement_instance_id=r.id and requested_document_id=v_upload
          and status not in ('completed','cancelled');
      update public.document_requirement_instances set latest_upload_id=null,satisfied_by_document_id=null,
        status=case when r.status='waived' then 'waived' else 'pending' end,rejection_reason=null
        where id=r.id returning * into r;
      update public.private_listing_document_requirements set status='required',satisfied_by_document_id=null,
        assurance_state='missing',satisfaction_verified_at=null,satisfaction_method=null
        where canonical_requirement_instance_id=r.id;
      update public.transaction_required_documents set is_uploaded=false,uploaded_document_id=null,
        status='pending',uploaded_at=null,updated_at=now()
        where canonical_requirement_instance_id=r.id;
$branch$;
begin
  select pg_get_functiondef('document_requirement_private.execute_command(uuid,text,text,uuid,uuid,bigint,jsonb)'::regprocedure) into body;
  if position('p_action=''withdraw''' in body)=0 then
    if position(marker in body)=0 or position('(''add'',''remove'',''restore'',''upload'')' in body)=0 then
      raise exception 'Unexpected requirement command source; review before extending withdrawal.'; end if;
    body:=replace(body,'(''add'',''remove'',''restore'',''upload'')','(''add'',''remove'',''restore'',''upload'',''withdraw'')');
    body:=replace(body,'when ''upload'' then array[''filePath''',E'when ''withdraw'' then array[''reason'',''documentId'']\n    when ''upload'' then array[''filePath''');
    if position('when ''withdraw'' then array[''reason'',''documentId'']' in body)=0 then
      raise exception 'Unexpected requirement command payload validation.'; end if;
    body:=replace(body,marker,branch||marker);
    execute body;
  end if;
  -- A cleared pointer must be FALSE, not SQL NULL: clients distinguish explicit
  -- history from legacy rows which have no current-evidence annotation at all.
  read_function:=coalesce(to_regprocedure('document_requirement_private.read_context_before_delivery(text,uuid)'),
    to_regprocedure('document_requirement_private.read_context(text,uuid)'));
  select pg_get_functiondef(read_function) into body;
  if position('''is_current_evidence'',d.id=r.satisfied_by_document_id' in body)>0 then
    body:=replace(body,'''is_current_evidence'',d.id=r.satisfied_by_document_id','''is_current_evidence'',coalesce(d.id=r.satisfied_by_document_id,false)');
    body:=replace(body,'''is_current_evidence'',u.id=r.latest_upload_id','''is_current_evidence'',coalesce(u.id=r.latest_upload_id,false)');
    execute body;
  elsif position('coalesce(d.id=r.satisfied_by_document_id,false)' in body)=0 then
    raise exception 'Unexpected document context source; review current-evidence projection.';
  end if;
end; $patch$;

-- A later legacy assurance event must not resurrect a withdrawn seller file.
do $patch$
declare body text; marker text:=E'    and status <> ''not_applicable''';
begin
  select pg_get_functiondef('public.bridge_sync_private_listing_requirement_assurance_p0_4()'::regprocedure) into body;
  if position('and is_current_evidence' in body)=0 then
    if position(marker in body)=0 then raise exception 'Unexpected seller evidence selector; review before filtering history.'; end if;
    execute replace(body,marker,marker||E'\n    and is_current_evidence');
  end if;
end; $patch$;

-- Development replacements are new version rows. Archive the old reference in
-- the same transaction; failed inserts roll this archive back automatically.
-- SECURITY INVOKER retains the existing row-level edit boundary.
create or replace function public.bridge_archive_replaced_development_document()
returns trigger language plpgsql security invoker set search_path='' as $$
declare previous public.development_documents;
begin
  if new.supersedes_document_id is null then return new; end if;
  select * into previous from public.development_documents
    where id=new.supersedes_document_id and development_id=new.development_id and archived_at is null for update;
  if previous.id is null or previous.id=new.id then
    raise exception 'The development document changed or access was denied. Reload before replacing it.' using errcode='40001'; end if;
  update public.development_documents set archived_at=now() where id=previous.id and development_id=new.development_id;
  if not found then raise exception 'Not authorised to replace this development document.' using errcode='42501'; end if;
  new.version:=coalesce(previous.version,1)+1;
  new.approval_status:='pending_approval';
  return new;
end; $$;
revoke all on function public.bridge_archive_replaced_development_document() from public,anon,authenticated;
drop trigger if exists development_document_version_archive on public.development_documents;
create trigger development_document_version_archive before insert on public.development_documents
for each row execute function public.bridge_archive_replaced_development_document();

commit;
