-- Public callers retain their own RLS identity. Mandatory lifecycle facts,
-- workflow evidence and audit commit in one short transaction, without email
-- or other external I/O while a transaction row is locked.
create or replace function public.bridge_get_transaction_lifecycle_permissions(p_transaction_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object(
  'canRegister', p.is_admin or p.is_transfer_writer,
  'canComplete', p.is_admin or p.is_transfer_writer,
  'canUndoRegistration', p.is_admin)
 from public.transactions t cross join lateral (select
  coalesce(public.bridge_current_profile_role()='internal_admin',false) or exists(
   select 1 from public.organisation_users m where m.organisation_id=t.organisation_id
    and m.user_id=auth.uid() and m.status='active' and m.removed_at is null
    and lower(coalesce(nullif(m.membership_status,''),m.status,'')) in ('active','accepted') and m.app_role='developer') as is_admin,
  coalesce(public.bridge_can_mutate_attorney_lane(t.id,'transfer_attorney','workflow'),false) as is_transfer_writer
 ) p where t.id=p_transaction_id and auth.uid() is not null),
 jsonb_build_object('canRegister',false,'canComplete',false,'canUndoRegistration',false));
$$;

create or replace function public.bridge_commit_transaction_lifecycle(
 p_transaction_id uuid,p_action text,p_registration_date date default null,
 p_title_deed_number text default null,p_confirmation_document_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
 tx public.transactions%rowtype; permissions jsonb; step_id uuid; instance_id uuid;
 v_now timestamptz:=clock_timestamp(); replayed boolean:=false; projection_id uuid;
 v_date date; v_title text; v_document uuid; v_canonical boolean; finance_key text;
begin
 if auth.uid() is null or p_action is null or p_action not in ('register','complete') then
  raise exception 'An authorised registration or completion action is required.' using errcode='42501';
 end if;
 select * into tx from public.transactions where id=p_transaction_id for update;
 if not found then raise exception 'This transaction is not available for this change. Refresh and check your access.' using errcode='42501'; end if;
 permissions:=public.bridge_get_transaction_lifecycle_permissions(p_transaction_id);
 if not coalesce((permissions->>case when p_action='register' then 'canRegister' else 'canComplete' end)::boolean,false) then
  raise exception 'Only the assigned transfer legal team or an authorised developer can make this change.' using errcode='42501';
 end if;
 if lower(coalesce(tx.lifecycle_state,'')) in ('cancelled','archived','terminated') then
  raise exception 'Reopen the transaction before changing registration or completion.' using errcode='23514';
 end if;

 if p_action='register' then
  v_date:=coalesce(p_registration_date,tx.registration_date);
  v_title:=nullif(btrim(coalesce(p_title_deed_number,tx.title_deed_number)),'');
  v_document:=coalesce(p_confirmation_document_id,tx.registration_confirmation_document_id);
  if v_date is null or v_title is null or v_document is null then
   raise exception 'Registration date, title deed number and confirmation evidence are required.' using errcode='23514';
  end if;
  if tx.registered_at is not null then
   if (v_date,v_title,v_document) is distinct from (tx.registration_date,tx.title_deed_number,tx.registration_confirmation_document_id) then
    raise exception 'Registration is already recorded with different details. Review it before making another change.' using errcode='23514';
   end if;
   replayed:=true;
  else
   v_canonical:=coalesce(tx.routing_profile_json#>>'{workflowPlan,status}'='active',false);
   finance_key:=case when lower(btrim(coalesce(tx.finance_type,''))) in ('hybrid','combination') then 'finance_hybrid'
    when lower(coalesce(tx.finance_type,'')) like '%cash%' and lower(coalesce(tx.finance_type,'')) ~ '(bond|mortgage)' then 'finance_hybrid'
    when lower(coalesce(tx.finance_type,'')) ~ '(bond|mortgage)' then 'finance_bond'
    when lower(coalesce(tx.finance_type,'')) like '%cash%' then 'finance_cash' else null end;
   if not v_canonical and (finance_key is null or exists(
    select 1 from unnest(array['sales_otp',finance_key,'attorney_transfer','registration']) required_workflow
    where not exists(select 1 from public.transaction_workflow_instances i
      where i.transaction_id=p_transaction_id and i.workflow_key=required_workflow))) then
    raise exception 'Sale, finance and transfer workflow setup must be confirmed before registration.' using errcode='23514';
   end if;
   -- The existing registration trigger validates canonical legal milestones
   -- and stored document ownership. Legacy lanes also need their prerequisites.
   if not v_canonical and exists(select 1 from public.transaction_workflow_steps s
    join public.transaction_workflow_instances i on i.id=s.workflow_instance_id
    where s.transaction_id=p_transaction_id and coalesce(s.required,true) and coalesce(i.status,'not_started')<>'skipped'
     and i.workflow_key in ('sales_otp','finance_cash','finance_bond','finance_hybrid','attorney_transfer','bond_registration','seller_bond_cancellation','registration')
     and not(s.workflow_key='registration' and s.step_key='registration_confirmed')
     and coalesce(s.status,'not_started') not in ('complete','completed','skipped','not_applicable')) then
    raise exception 'Complete the required sale, finance and transfer steps before registration.' using errcode='23514';
   end if;
   update public.transaction_workflow_steps set status='complete',completed_at=v_now,completed_by=auth.uid(),updated_at=v_now
    where transaction_id=p_transaction_id and workflow_key='registration' and step_key='registration_confirmed'
    returning id,workflow_instance_id into step_id,instance_id;
   if step_id is null and not v_canonical then raise exception 'Registration workflow setup is not ready. Refresh and ask an administrator to review it.' using errcode='23514';end if;
   if step_id is not null then
    insert into public.transaction_workflow_evidence(transaction_id,workflow_step_id,workflow_key,step_key,evidence_type,evidence_id,evidence_status)
     values(p_transaction_id,step_id,'registration','registration_confirmed','document',v_document::text,'accepted')
     on conflict(workflow_step_id,evidence_type,evidence_id) do update set evidence_status='accepted';
    update public.transaction_workflow_instances set status='complete',completed_at=v_now,updated_at=v_now
     where id=instance_id and not exists(select 1 from public.transaction_workflow_steps s where s.workflow_instance_id=instance_id
      and coalesce(s.required,true) and coalesce(s.status,'not_started') not in ('complete','completed','skipped','not_applicable'));
   end if;
   update public.transactions set lifecycle_state='registered',stage='Registered',current_main_stage='REG',attorney_stage='registered',registration_date=v_date,title_deed_number=v_title,
    registration_confirmation_document_id=v_document,registered_by_user_id=auth.uid(),registered_at=v_now,
    cancelled_at=null,cancelled_by_user_id=null,cancelled_reason=null,archived_at=null,archived_by_user_id=null,archive_reason=null,
    last_meaningful_activity_at=v_now,updated_at=v_now where id=p_transaction_id returning * into tx;
   if not found then raise exception 'Registration could not be confirmed. Refresh and check your access.' using errcode='42501';end if;
   insert into public.transaction_workflow_events(transaction_id,workflow_key,step_key,action_key,event_type,new_status,payload_json,source,created_by)
    values(p_transaction_id,'registration','registration_confirmed','MARK_REGISTERED','workflow_action_completed','complete',
     jsonb_build_object('registrationDate',v_date,'titleDeedNumber',v_title,'registrationConfirmationDocumentId',v_document),'registration_flow',auth.uid());
  end if;
 else
  if tx.completed_at is not null and tx.lifecycle_state='completed' then replayed:=true;
  else
   -- Existing actor, registration, legal closeout and finance-closeout triggers
   -- remain authoritative and can reject this update atomically.
   update public.transactions set stage='Registered',current_main_stage='REG',lifecycle_state='completed',attorney_stage='registered',
    completed_at=v_now,completed_by_user_id=auth.uid(),archived_at=null,archived_by_user_id=null,archive_reason=null,
    cancelled_at=null,cancelled_by_user_id=null,cancelled_reason=null,is_active=true,last_meaningful_activity_at=v_now,updated_at=v_now
    where id=p_transaction_id returning * into tx;
   if not found then raise exception 'Completion could not be confirmed. Refresh and check your access.' using errcode='42501';end if;
   insert into public.transaction_events(transaction_id,event_type,created_by,created_by_role,event_data)
    values(p_transaction_id,'TransactionUpdated',auth.uid(),public.bridge_current_profile_role(),jsonb_build_object('source','completion_flow','action','marked_completed'));
  end if;
 end if;
 if not replayed then
  insert into public.transaction_lifecycle_workflows(transaction_id,current_stage,status,last_updated_by,last_updated_at,completed_at)
   values(p_transaction_id,'registration',case when p_action='complete' then 'completed' else 'active' end,auth.uid(),v_now,case when p_action='complete' then v_now else null end)
   on conflict(transaction_id) do update set current_stage=excluded.current_stage,status=excluded.status,last_updated_by=excluded.last_updated_by,
    last_updated_at=excluded.last_updated_at,completed_at=excluded.completed_at,updated_at=v_now returning id into projection_id;
  if projection_id is null then raise exception 'The saved lifecycle view could not be confirmed. Check your access and refresh.' using errcode='42501';end if;
 end if;
 return jsonb_build_object('transactionId',tx.id,'action',p_action,'lifecycleState',tx.lifecycle_state,'registeredAt',tx.registered_at,
  'completedAt',tx.completed_at,'registrationDate',tx.registration_date,'titleDeedNumber',tx.title_deed_number,
  'registrationConfirmationDocumentId',tx.registration_confirmation_document_id,'replayed',replayed);
end;
$$;
revoke all on function public.bridge_get_transaction_lifecycle_permissions(uuid),public.bridge_commit_transaction_lifecycle(uuid,text,date,text,uuid) from public,anon;
grant execute on function public.bridge_get_transaction_lifecycle_permissions(uuid),public.bridge_commit_transaction_lifecycle(uuid,text,date,text,uuid) to authenticated;

-- Lifecycle authority also needs to save/read the mandatory projection. The
-- older coordinator policies require a participant row and otherwise block an
-- authorised organisation Developer or internal administrator at final commit.
drop policy if exists lifecycle_authorised_actor_select on public.transaction_lifecycle_workflows;
create policy lifecycle_authorised_actor_select on public.transaction_lifecycle_workflows for select to authenticated
 using(coalesce((public.bridge_get_transaction_lifecycle_permissions(transaction_id)->>'canRegister')::boolean,false));
drop policy if exists lifecycle_authorised_actor_insert on public.transaction_lifecycle_workflows;
create policy lifecycle_authorised_actor_insert on public.transaction_lifecycle_workflows for insert to authenticated
 with check(coalesce((public.bridge_get_transaction_lifecycle_permissions(transaction_id)->>'canRegister')::boolean,false));
drop policy if exists lifecycle_authorised_actor_update on public.transaction_lifecycle_workflows;
create policy lifecycle_authorised_actor_update on public.transaction_lifecycle_workflows for update to authenticated
 using(coalesce((public.bridge_get_transaction_lifecycle_permissions(transaction_id)->>'canRegister')::boolean,false))
 with check(coalesce((public.bridge_get_transaction_lifecycle_permissions(transaction_id)->>'canRegister')::boolean,false));

-- Keep direct writes and the command consistent for supported finance aliases.
-- Retain the existing guard, including its historical archive-restoration path.
do $finance_aliases$
declare definition text; previous text := 'lower(coalesce(new.finance_type,'''')) in (''bond'',''hybrid'',''combination'')';
 replacement text := '(lower(btrim(coalesce(new.finance_type,''''))) in (''hybrid'',''combination'') or lower(coalesce(new.finance_type,'''')) ~ ''(bond|mortgage)'')';
begin
 definition:=pg_get_functiondef('journey_private.guard_transaction_registration_readiness()'::regprocedure);
 if position(previous in definition)>0 then execute replace(definition,previous,replacement);
 elsif position(replacement in definition)=0 then raise exception 'Registration readiness definition changed; review finance alias validation before release.';end if;
end
$finance_aliases$;
notify pgrst,'reload schema';
