begin;
create or replace function public.bridge_can_manage_attorney_closeout(p_transaction_id uuid,p_firm_id uuid)
returns boolean language sql stable security definer set search_path='' as $scope$
 select auth.uid() is not null and p_firm_id is not null and exists(
  select 1 from public.transactions t join public.transaction_attorney_assignments a on a.transaction_id=t.id
  join public.profiles actor on actor.id=auth.uid() and actor.role in ('attorney','conveyancer')
  where t.id=p_transaction_id and t.registered_at is not null and t.lifecycle_state in ('registered','completed')
   and coalesce(a.attorney_firm_id,a.firm_id)=p_firm_id
   and (a.attorney_role='transfer_attorney' or a.assignment_type in ('transfer','transfer_and_bond'))
   and coalesce(a.assignment_status,a.status)='active' and coalesce(a.status,'active') not in ('removed','revoked','inactive','paused')
   and coalesce(a.can_update_workflow_lane,true)
   and public.bridge_attorney_matter_team_access(t.id,p_firm_id,'workflow')
   and public.bridge_can_mutate_attorney_lane(t.id,'transfer_attorney','workflow')
 )
$scope$;
revoke all on function public.bridge_can_manage_attorney_closeout(uuid,uuid) from public,anon;
grant execute on function public.bridge_can_manage_attorney_closeout(uuid,uuid) to authenticated,service_role;

create or replace function document_security.attorney_closeout_document_allowed(p_closeout uuid,p_path text)
returns boolean language sql stable security definer set search_path='' as $scope$
 select exists(select 1 from public.transaction_attorney_closeouts c
 where c.id=p_closeout and public.bridge_can_manage_attorney_closeout(c.transaction_id,c.attorney_firm_id)
 and (p_path is null or (starts_with(p_path,'transaction-'||c.transaction_id::text||'/closeout-'||c.id::text||'/')
   and exists(select 1 from storage.objects o where o.bucket_id='documents' and o.name=p_path))))
$scope$;
revoke all on function document_security.attorney_closeout_document_allowed(uuid,text) from public,anon;
grant execute on function document_security.attorney_closeout_document_allowed(uuid,text) to authenticated,service_role;

drop policy if exists attorney_closeout_responsible_insert on public.transaction_attorney_closeouts;
create policy attorney_closeout_responsible_insert on public.transaction_attorney_closeouts for insert to authenticated
 with check(public.bridge_can_manage_attorney_closeout(transaction_id,attorney_firm_id));
drop policy if exists attorney_closeout_responsible_update on public.transaction_attorney_closeouts;
create policy attorney_closeout_responsible_update on public.transaction_attorney_closeouts for update to authenticated
 using(public.bridge_can_manage_attorney_closeout(transaction_id,attorney_firm_id))
 with check(public.bridge_can_manage_attorney_closeout(transaction_id,attorney_firm_id));
drop policy if exists attorney_closeout_document_responsible_insert on public.transaction_attorney_closeout_documents;
create policy attorney_closeout_document_responsible_insert on public.transaction_attorney_closeout_documents for insert to authenticated
 with check(document_security.attorney_closeout_document_allowed(transaction_attorney_closeout_id,file_path));
drop policy if exists attorney_closeout_document_responsible_update on public.transaction_attorney_closeout_documents;
create policy attorney_closeout_document_responsible_update on public.transaction_attorney_closeout_documents for update to authenticated
 using(document_security.attorney_closeout_document_allowed(transaction_attorney_closeout_id,null))
 with check(document_security.attorney_closeout_document_allowed(transaction_attorney_closeout_id,file_path));
grant insert,update on public.transaction_attorney_closeouts,public.transaction_attorney_closeout_documents to authenticated;

create or replace function document_security.guard_attorney_closeout_identity()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
 if tg_table_name='transaction_attorney_closeout_documents' then
  if (new.transaction_attorney_closeout_id,new.document_type_key) is distinct from (old.transaction_attorney_closeout_id,old.document_type_key) then
   raise exception 'A closeout file cannot be moved to another closeout or document type.' using errcode='22023';end if;
 else
  if tg_op='UPDATE' and (new.transaction_id,new.attorney_firm_id) is distinct from (old.transaction_id,old.attorney_firm_id) then
   raise exception 'A closeout cannot be moved to another transaction or firm.' using errcode='22023';end if;
  if new.close_out_status='closed' and (new.actual_billed_amount is null or new.actual_billed_amount<0
   or nullif(trim(new.invoice_reference),'') is null or not exists(select 1 from public.transaction_attorney_closeout_documents d
      where d.transaction_attorney_closeout_id=new.id and d.is_required)
   or exists(select 1 from public.transaction_attorney_closeout_documents d where d.transaction_attorney_closeout_id=new.id and d.is_required
     and (d.status not in ('uploaded','accepted') or d.file_path is null or not exists(
       select 1 from storage.objects o where o.bucket_id='documents' and o.name=d.file_path)))) then
   raise exception 'Complete the billed amount, invoice reference and required saved closeout files before closing.' using errcode='22023';end if;
 end if;
 return new;
end $guard$;
revoke all on function document_security.guard_attorney_closeout_identity() from public,anon,authenticated;
drop trigger if exists guard_attorney_closeout_identity on public.transaction_attorney_closeouts;
create trigger guard_attorney_closeout_identity before insert or update on public.transaction_attorney_closeouts
 for each row execute function document_security.guard_attorney_closeout_identity();
drop trigger if exists guard_attorney_closeout_document_identity on public.transaction_attorney_closeout_documents;
create trigger guard_attorney_closeout_document_identity before update on public.transaction_attorney_closeout_documents
 for each row execute function document_security.guard_attorney_closeout_identity();
notify pgrst,'reload schema';
commit;
