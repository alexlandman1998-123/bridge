-- A lifecycle action and its audit must commit together even when it retires
-- the caller's external access. No grants are reactivated by restoration.
create or replace function public.bridge_enforce_appointed_firm_staff_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_appointment public.transaction_legal_role_appointments%rowtype;
begin
 if new.attorney_role not in ('bond_attorney','cancellation_attorney') then return new;end if;
 -- Only the nested closed-matter retirement trigger can take this path.
 -- Firm, staff, appointment identity and all other fields stay in history.
 if tg_op='UPDATE' and new.assignment_status='removed'
 and current_setting('arch9.handoff_retiring',true)='true' and pg_catalog.pg_trigger_depth()>1
 and (to_jsonb(new)-array['assignment_status','status','updated_at']) is not distinct from
     (to_jsonb(old)-array['assignment_status','status','updated_at'])
 and exists(select 1 from public.transactions t where t.id=new.transaction_id and (
   lower(coalesce(t.lifecycle_state,'')) in ('archived','cancelled','terminated') or t.archived_at is not null
   or lower(coalesce(to_jsonb(t)->>'status','')) in ('cancelled','canceled','terminated','archived','completed'))) then return new;end if;
 select a.* into v_appointment from public.transaction_legal_role_appointments a
 where a.transaction_id=new.transaction_id and a.role_type=new.attorney_role order by a.updated_at desc limit 1;
 if new.assignment_status='removed' and v_appointment.coordination_state='replacement_required' then return new;end if;
 if new.assignment_status='removed' then
 raise exception 'A bank-appointed firm cannot be removed through staff assignment. Start the appointment replacement workflow instead.' using errcode='42501';end if;
 if v_appointment.id is null or v_appointment.accepted_firm_id is null or v_appointment.coordination_state not in ('invite_accepted','instruction_confirmed','active') then
 raise exception 'The bank-appointed firm must accept its invitation before staff can be assigned.' using errcode='42501';end if;
 if coalesce(new.attorney_firm_id,new.firm_id) is distinct from v_appointment.accepted_firm_id then
 raise exception 'Bond and cancellation staff must be assigned from the bank-appointed firm.' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function public.bridge_enforce_appointed_firm_staff_assignment() from public,anon,authenticated;

create or replace function handoff_private.closed_matter_retirement()
returns trigger language plpgsql security definer set search_path='' as $$
declare lane record;
begin
 if current_setting('arch9.handoff_retiring',true)='true' then return null;end if;
 if lower(coalesce(to_jsonb(new)->>'status','')) in ('cancelled','canceled','terminated','archived','completed')
 or lower(coalesce(new.lifecycle_state,'')) in ('cancelled','archived','terminated')
 or new.archived_at is not null or coalesce(to_jsonb(new)->>'is_archived','false')='true' then
 for lane in select distinct role_type,coalesce(assigned_organisation_id,partner_organisation_id,organisation_id) org
 from public.transaction_role_players where transaction_id=new.id and status in ('selected','active') and removed_at is null
 union select partner_role,partner_organisation_id from public.transaction_partner_assignments
 where transaction_id=new.id and assignment_status not in ('cancelled','declined','completed') loop
 perform handoff_private.retire_partner_lane(new.id,lane.role_type,lane.org);
 end loop;
 end if;
 return null;
end;$$;
revoke all on function handoff_private.closed_matter_retirement() from public,anon,authenticated;

create function public.bridge_apply_transaction_lifecycle_action(p_transaction_id uuid,p_action text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tx public.transactions;v_actor uuid:=auth.uid();v_role text;v_now timestamptz:=now();v_next text;v_current text;
begin
 if v_actor is null or p_action is null or p_action not in ('archive','unarchive','cancel') then raise exception 'An authorised lifecycle action is required.' using errcode='42501';end if;
 select * into v_tx from public.transactions where id=p_transaction_id for update;
 if not found then raise exception 'Transaction is not available for this lifecycle action.' using errcode='42501';end if;
 v_current:=coalesce(nullif(v_tx.lifecycle_state,''),case when v_tx.completed_at is not null then 'completed' when v_tx.registered_at is not null or v_tx.current_main_stage='REG' then 'registered' else 'active' end);
 if public.bridge_current_profile_role()='internal_admin' then v_role:='internal_admin';
 elsif exists(select 1 from public.organisation_users u where u.organisation_id=v_tx.organisation_id and u.user_id=v_actor and u.status='active' and u.app_role='developer') then v_role:='developer';
 elsif public.bridge_can_mutate_attorney_lane(v_tx.id,'transfer_attorney','workflow') then v_role:='attorney';
 else raise exception 'Transaction is not available for this lifecycle action.' using errcode='42501';end if;
 if p_action='archive' then
 if v_current not in ('registered','completed') then raise exception 'Only Registered or Completed transactions can be archived.' using errcode='23514';end if;
 update public.transactions set lifecycle_state='archived',archived_at=v_now,archived_by_user_id=v_actor,archive_reason=nullif(btrim(p_reason),''),updated_at=v_now where id=v_tx.id returning * into v_tx;
 elsif p_action='unarchive' then
 if v_current is distinct from 'archived' then raise exception 'This transaction is not archived.' using errcode='23514';end if;
 v_next:=case when v_tx.completed_at is not null then 'completed' when v_tx.registered_at is not null or v_tx.current_main_stage='REG' then 'registered' else 'active' end;
 update public.transactions set lifecycle_state=v_next,archived_at=null,archived_by_user_id=null,archive_reason=null,updated_at=v_now where id=v_tx.id returning * into v_tx;
 else
 if nullif(btrim(p_reason),'') is null then raise exception 'A cancellation reason is required.' using errcode='23514';end if;
 if v_tx.registered_at is not null or v_tx.completed_at is not null or v_current in ('registered','completed','archived') then raise exception 'Undo registration or reopen the archived transaction before cancelling it.' using errcode='23514';end if;
 update public.transactions set lifecycle_state='cancelled',cancelled_at=v_now,cancelled_by_user_id=v_actor,cancelled_reason=btrim(p_reason),archived_at=null,archived_by_user_id=null,archive_reason=null,updated_at=v_now where id=v_tx.id returning * into v_tx;
 end if;
 insert into public.transaction_events(transaction_id,event_type,event_data,created_by,created_by_role)
 values(v_tx.id,'TransactionUpdated',jsonb_build_object('source',case when p_action='cancel' then 'cancellation_flow' else 'archive_flow' end,'action',case p_action when 'archive' then 'archived' when 'unarchive' then 'unarchived' else 'cancelled' end,'reason',nullif(btrim(p_reason),''),'nextState',v_tx.lifecycle_state),v_actor,v_role);
 return jsonb_build_object('id',v_tx.id,'lifecycle_state',v_tx.lifecycle_state,'registered_at',v_tx.registered_at,'completed_at',v_tx.completed_at,'archived_at',v_tx.archived_at,'cancelled_at',v_tx.cancelled_at);
end;$$;
revoke all on function public.bridge_apply_transaction_lifecycle_action(uuid,text,text) from public,anon;
grant execute on function public.bridge_apply_transaction_lifecycle_action(uuid,text,text) to authenticated;
