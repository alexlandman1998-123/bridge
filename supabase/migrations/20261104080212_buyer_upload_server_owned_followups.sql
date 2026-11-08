begin;

-- A buyer upload already owns an authorised atomic database transaction. Keep
-- request reconciliation and staff notifications there; never ask the portal
-- browser to write professional workflow tables or approve its own evidence.
create table if not exists document_security.buyer_upload_followups (
  document_id uuid primary key references public.documents(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  notification_count integer not null default 0,
  processed_at timestamptz not null default now()
);
alter table document_security.buyer_upload_followups enable row level security;
revoke all on document_security.buyer_upload_followups from public,anon,authenticated;
grant all on document_security.buyer_upload_followups to service_role;
do $policy$ begin
 if not exists(select 1 from pg_policies where schemaname='document_security' and tablename='buyer_upload_followups' and policyname='buyer_upload_followups_service') then
  create policy buyer_upload_followups_service on document_security.buyer_upload_followups
   for all to service_role using(true) with check(true);
 end if;
end $policy$;

create or replace function document_security.record_buyer_upload_followup(p_document_id uuid)
returns void language plpgsql security definer set search_path='' as $followup$
declare d public.documents%rowtype; claimed uuid; notices integer;
begin
 select document_row.* into d
 from public.documents document_row join public.client_portal_links link
  on link.transaction_id=document_row.transaction_id
 where document_row.id=p_document_id and link.token=public.bridge_client_portal_request_token()
  and public.bridge_client_portal_request_token()<>'' and link.is_active
  and (link.expires_at is null or link.expires_at>now())
  and document_row.uploaded_by_party='buyer'
  and document_row.source in ('client_portal_atomic_upload','client_portal_requested_document_upload')
 limit 1;
 if not found then raise exception 'Buyer upload context is unavailable.' using errcode='42501';end if;

 insert into document_security.buyer_upload_followups(document_id,transaction_id)
 values(d.id,d.transaction_id) on conflict(document_id) do nothing returning document_id into claimed;
 if claimed is null then return;end if;

 -- The canonical requirement controls matching. A similarly named file can
 -- never satisfy another person's request, and completed reviews stay closed.
 if d.canonical_requirement_instance_id is not null then
  update public.document_requests request
  set requested_document_id=d.id,
      status=case when coalesce(request.requires_review,true) then 'uploaded' else 'completed' end,
      completed_at=case when coalesce(request.requires_review,true) then null else now() end,
      rejected_reason=null,updated_at=now()
  where request.transaction_id=d.transaction_id
    and request.canonical_requirement_instance_id=d.canonical_requirement_instance_id
    and request.status not in ('completed','cancelled','waived');
 end if;

 -- This is an in-app notification, not an external email/WhatsApp dispatch.
 -- Recipients and wording are server-owned and the document identity dedupes it.
 notices:=public.bridge_create_transaction_notifications_for_roles(
  d.transaction_id,array['agent','developer','attorney','bond_originator'],
  'document_uploaded','Buyer document uploaded','A buyer document is ready for review.',
  'DocumentUploaded',jsonb_build_object('documentId',d.id,'documentType',d.document_type,
    'canonicalRequirementInstanceId',d.canonical_requirement_instance_id,'source','buyer_upload_atomic_followup'),
  'buyer-upload:'||d.id::text);
 update document_security.buyer_upload_followups set notification_count=coalesce(notices,0)
 where document_id=d.id;
end $followup$;
revoke all on function document_security.record_buyer_upload_followup(uuid) from public,anon,authenticated;

do $patch$ declare target regprocedure; definition text; anchor text:='  return to_jsonb(v_document)'; changed integer:=0;
begin
 for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('bridge_upload_buyer_portal_document','bridge_upload_buyer_portal_requested_document') loop
  definition:=pg_get_functiondef(target);
  if position('perform document_security.record_buyer_upload_followup(v_document.id)' in definition)=0 then
   if position(anchor in definition)=0 then raise exception 'Unsupported buyer upload contract: %',target;end if;
   definition:=replace(definition,anchor,E'  perform document_security.record_buyer_upload_followup(v_document.id);\n\n'||anchor);
  end if;
  -- Requested-file uploads must prove the same saved Storage object as the
  -- canonical upload route before acknowledging document metadata.
  if target::text like 'bridge_upload_buyer_portal_requested_document(%'
     and position('storage.objects' in definition)=0 then
   definition:=replace(definition,'  insert into public.documents (',
    E'  if not exists(select 1 from storage.objects o where o.bucket_id=\'documents\' and o.name=trim(p_file_path)) then\n'
    ||E'    raise exception \'The uploaded buyer document was not found in storage. Retry the same file.\' using errcode=\'22023\';\n  end if;\n\n  insert into public.documents (');
  end if;
  execute definition;changed:=changed+1;
 end loop;
 if changed<>2 then raise exception 'Both atomic buyer upload contracts are required.';end if;
end $patch$;

notify pgrst,'reload schema';
commit;
