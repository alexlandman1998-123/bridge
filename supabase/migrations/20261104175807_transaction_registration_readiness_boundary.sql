-- A display label containing "registration" is not necessarily proof of deeds
-- registration (company/CIPC certificates must never satisfy this milestone).
create or replace function journey_private.is_registration_confirmation_document(d public.documents)
returns boolean language sql immutable set search_path='' as $$
 select lower(coalesce(d.document_type,'')) in
   ('registration_confirmation','registration_confirmation_document','deeds_registration_confirmation',
    'deeds_office_registration_confirmation','registration_proof','deeds_registration_proof','registered_title_deed')
 or (lower(coalesce(d.category,''))='registration_confirmation')
 or ((coalesce(d.name,'') ~* '(registration confirmation|confirmation of registration|proof of deeds registration|deeds office registration)')
   and coalesce(d.name,'') !~* '(company|companies|cipc|trust registration)');
$$;
revoke all on function journey_private.is_registration_confirmation_document(public.documents) from public,anon,authenticated;

create or replace function journey_private.guard_transaction_registration_readiness()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_canonical boolean := coalesce(new.routing_profile_json#>>'{workflowPlan,status}'='active',false);
begin
 -- Server maintenance is separate from ordinary professional/portal writes.
 if auth.uid() is null and (session_user in ('postgres','supabase_admin') or auth.role()='service_role') then return new; end if;
 if new.registered_at is not null and old.registered_at is null then
   if v_canonical then
     if not exists(select 1 from public.transaction_subprocesses lane
       join public.transaction_subprocess_steps step on step.subprocess_id=lane.id
       where lane.transaction_id=new.id and lane.process_type='transfer'
         and step.step_key='registered' and step.status in ('completed','completed_externally')) then
       raise exception 'Complete the legal registration milestone before recording registration.' using errcode='23514';
     end if;
   elsif not exists(select 1 from public.transaction_workflow_steps step
     join public.transaction_workflow_instances workflow on workflow.id=step.workflow_instance_id
     where workflow.transaction_id=new.id and workflow.workflow_key='registration'
       and step.step_key='registration_confirmed' and step.status in ('complete','completed')) then
     raise exception 'Complete the registration workflow before recording registration.' using errcode='23514';
   end if;
   if new.registration_date is null or nullif(btrim(new.title_deed_number),'') is null then
     raise exception 'A registration date and title deed number are required.' using errcode='23514';
   end if;
   if not exists(select 1 from public.documents d
     join storage.objects o on o.bucket_id=coalesce(nullif(d.file_bucket,''),'documents') and o.name=d.file_path
     where d.id=new.registration_confirmation_document_id and d.transaction_id=new.id
       and coalesce(d.status,'uploaded') not in ('archived','deleted','superseded','rejected')
       and journey_private.is_registration_confirmation_document(d)) then
     raise exception 'Registration confirmation must be a stored document from this transaction.' using errcode='23514';
   end if;
 end if;
 if (new.completed_at is not null and old.completed_at is null)
    or (new.lifecycle_state='completed' and old.lifecycle_state is distinct from 'completed') then
   if new.registered_at is null then
     raise exception 'Register the transaction before completing closeout.' using errcode='23514';
   end if;
   if v_canonical and not exists(select 1 from public.transaction_subprocesses lane
     join public.transaction_subprocess_steps step on step.subprocess_id=lane.id
     where lane.transaction_id=new.id and lane.process_type='transfer'
       and step.step_key='matter_closed' and step.status in ('completed','completed_externally')) then
     raise exception 'Complete the legal closeout milestone before completing the transaction.' using errcode='23514';
   end if;
   if not exists(select 1 from public.transaction_attorney_closeouts c where c.transaction_id=new.id and c.close_out_status='closed') then
     raise exception 'Attorney financial closeout is still pending.' using errcode='23514';
   end if;
   if lower(coalesce(new.finance_type,'')) in ('bond','hybrid','combination') and not exists(
     select 1 from public.transaction_bond_closeouts c where c.transaction_id=new.id and c.close_out_status='closed') then
     raise exception 'Bond-originator financial closeout is still pending.' using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function journey_private.guard_transaction_registration_readiness() from public,anon,authenticated;
create trigger guard_transaction_registration_readiness before update of registered_at,completed_at,lifecycle_state on public.transactions
for each row execute function journey_private.guard_transaction_registration_readiness();
