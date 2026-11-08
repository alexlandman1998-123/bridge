-- Buyer selection, the active quote and finance progress must commit together.
-- Older accepted choices remain history when another valid offer is selected.
alter table public.transaction_bond_offer_decisions add column superseded_at timestamptz;
drop index public.transaction_bond_offer_decisions_one_accepted_idx;
create unique index transaction_bond_offer_decisions_one_accepted_idx
 on public.transaction_bond_offer_decisions(transaction_id)
 where decision='accepted' and superseded_at is null;
create or replace function public.bridge_record_bond_offer_decision(p_offer_id uuid,p_decision text,p_notes text default '')
returns jsonb language plpgsql security definer set search_path='' as $function$
declare q public.transaction_bond_quotes%rowtype;t public.transactions%rowtype;w public.transaction_finance_workflows%rowtype;
 buyer_context boolean;decision_id uuid;actor_role text;target_stage text;
begin
 if p_decision not in ('accepted','declined') or p_decision is null then raise exception 'Choose accepted or declined.' using errcode='22023';end if;
 select * into q from public.transaction_bond_quotes where id=p_offer_id;
 if not found then raise exception 'Bond offer is unavailable.' using errcode='42501';end if;
 buyer_context:=coalesce(public.bridge_portal_matter_financial_transaction_id('buyer')=q.transaction_id,false);
 if not buyer_context and not(auth.uid() is not null and (
   public.bridge_can_mutate_bond_transaction_canonical(q.transaction_id,'workflow_mutation')
   or exists(select 1 from public.transaction_participants p where p.transaction_id=q.transaction_id
     and p.user_id=auth.uid() and p.status='active' and p.removed_at is null and p.can_edit_finance_workflow is true)
 )) then raise exception 'Bond offer is unavailable.' using errcode='42501';end if;
 select * into t from public.transactions where id=q.transaction_id for update;
 if lower(coalesce(t.lifecycle_state,'')) in ('registered','completed','archived','cancelled') or t.registered_at is not null
   or t.cancelled_at is not null or t.archived_at is not null then
   raise exception 'A registered, closed or cancelled transaction cannot change its bond offer.' using errcode='22023';end if;
 if coalesce(t.finance_type,'') not in ('bond','hybrid','combination') then raise exception 'This transaction does not use bond finance.' using errcode='22023';end if;
 select * into w from public.transaction_finance_workflows where id=q.workflow_id and transaction_id=t.id for update;
 if not found then raise exception 'The bond offer has no valid finance workflow.' using errcode='22023';end if;
 select * into q from public.transaction_bond_quotes where id=p_offer_id for update;
 if p_decision='accepted' and (q.quote_expiry_at<=now() or nullif(q.valid_until::text,'')::date<current_date
    or q.quote_status in ('expired','withdrawn','declined','declined_by_buyer')) then
   raise exception 'This bond offer has expired or is no longer available.' using errcode='22023';end if;
 select id into decision_id from public.transaction_bond_offer_decisions
   where transaction_id=t.id and bond_offer_id=q.id and decision=p_decision and superseded_at is null
   order by decision_at desc limit 1;
 if decision_id is not null and ((p_decision='accepted' and q.quote_status='approved_by_buyer')
   or (p_decision='declined' and q.quote_status='declined_by_buyer')) then
   return jsonb_build_object('id',decision_id,'transactionId',t.id,'offerId',q.id,'decision',p_decision,'replayed',true);
 end if;
 if w.status='completed' or w.current_stage in ('grant_received','grant_signed','grant_submitted','instruction_sent','complete') then
   raise exception 'Finance has progressed to grant or instruction. Ask the finance team to review it before changing an offer.' using errcode='22023';end if;
 actor_role:=case when buyer_context then 'buyer' else coalesce((select role from public.profiles where id=auth.uid()),'bond_originator') end;
 if p_decision='accepted' then
   update public.transaction_bond_offer_decisions set superseded_at=now()
     where transaction_id=t.id and decision='accepted' and superseded_at is null and bond_offer_id<>q.id;
   update public.transaction_bond_quotes set quote_status='received',approved_at=null
     where workflow_id=w.id and id<>q.id and quote_status in ('approved_by_buyer','accepted');
   update public.transaction_bond_quotes set quote_status='approved_by_buyer',approved_at=now() where id=q.id;
   target_stage:='quote_accepted';
 else
   update public.transaction_bond_offer_decisions set superseded_at=now()
     where transaction_id=t.id and bond_offer_id=q.id and decision='accepted' and superseded_at is null;
   update public.transaction_bond_quotes set quote_status='declined_by_buyer',approved_at=null where id=q.id;
   target_stage:=case when exists(select 1 from public.transaction_bond_quotes where workflow_id=w.id and quote_status='approved_by_buyer') then w.current_stage else 'quote_received' end;
 end if;
 if decision_id is null then
   insert into public.transaction_bond_offer_decisions(transaction_id,bond_offer_id,decision,decided_by,decided_by_role,notes)
     values(t.id,q.id,p_decision,auth.uid(),actor_role,left(p_notes,4000)) returning id into decision_id;
 end if;
 update public.transaction_finance_workflows set current_stage=target_stage,last_updated_by=auth.uid(),last_updated_at=now() where id=w.id;
 update public.transactions set finance_status=case when target_stage='quote_accepted' then 'Quote Accepted' else 'Quote Received' end where id=t.id;
 insert into public.transaction_finance_workflow_events(workflow_id,from_stage,to_stage,event_type,notes,created_by)
 values(w.id,w.current_stage,target_stage,case when p_decision='accepted' then 'quote_approved' else 'stage_changed' end,
  'Bond offer '||p_decision,auth.uid());
 insert into public.transaction_notifications(transaction_id,user_id,role_type,notification_type,title,message,is_read,dedupe_key,event_type,event_data)
 select t.id,r.user_id,r.role_type,'workflow_updated','Bond offer '||p_decision,'The buyer finance offer decision was recorded.',false,
  'bond-offer-decision:'||decision_id::text||':'||r.user_id::text,'TransactionUpdated',jsonb_build_object('source','bond_offer_decision','offerId',q.id,'decision',p_decision)
 from public.bridge_resolve_transaction_notification_targets(t.id,array['bond_originator','agent','attorney']) r
 where r.user_id is distinct from auth.uid() on conflict do nothing;
 return jsonb_build_object('id',decision_id,'transactionId',t.id,'offerId',q.id,'decision',p_decision,'replayed',false);
end $function$;
revoke all on function public.bridge_record_bond_offer_decision(uuid,text,text) from public;
grant execute on function public.bridge_record_bond_offer_decision(uuid,text,text) to anon,authenticated;
notify pgrst,'reload schema';
