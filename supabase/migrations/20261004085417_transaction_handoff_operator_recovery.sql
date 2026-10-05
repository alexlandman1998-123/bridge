begin;
-- Recovery extends a bounded retry allowance; it never changes provider keys or clocks.
alter table public.transaction_handoff_dispatch_jobs add column max_attempts integer not null default 8 check(max_attempts between 8 and 24);
do $limits$
declare signature text; definition text;
begin
  foreach signature in array array['public.claim_transaction_handoff_dispatch(integer)','public.complete_transaction_handoff_dispatch(uuid,integer,uuid,text,text,text)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position('attempt_count>=8' in definition)=0 then raise exception 'Unexpected dispatch attempt guard'; end if;
    definition:=replace(definition,'j.attempt_count>=8','j.attempt_count>=j.max_attempts');
    execute replace(definition,'when attempt_count>=8','when attempt_count>=max_attempts');
  end loop;
end $limits$;
create table handoff_private.recovery_decisions (
  request_id uuid primary key, handoff_id uuid not null references public.transaction_handoffs(id) on delete cascade,
  actor_id uuid not null, action text not null, generation bigint not null, reason text not null,
  result jsonb not null, created_at timestamptz not null default now()
);
alter table handoff_private.recovery_decisions enable row level security;
revoke all on handoff_private.recovery_decisions from public,anon,authenticated;
create index handoff_recovery_history on handoff_private.recovery_decisions(handoff_id,created_at);
create function handoff_private.can_manage_recovery(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.organisation_users u
    where u.organisation_id=p_org and u.user_id=auth.uid() and u.status='active'
      and coalesce(to_jsonb(u)->>'membership_status','active')='active'
      and lower(coalesce(u.role,'')) in ('owner','admin','administrator','manager','principal')
      and coalesce(to_jsonb(u)->>'scope_level','workspace_hq') in ('workspace_hq','organisation','organization')
      and (to_jsonb(u)->>'scope_level' is not null or coalesce(to_jsonb(u)->>'branch_id',to_jsonb(u)->>'primary_branch_id') is null));
$$;
create function handoff_private.recovery_actions(p_handoff uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select case
   when not handoff_private.can_manage_recovery(h.owner_organisation_id) or not h.required or h.instruction_status<>'ready'
     or h.nomination_status<>'nominated' or cardinality(h.exception_keys)>0
     or not exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and handoff_private.job_current(j)) then '[]'::jsonb
   when h.assignment_cleanup_status='review_required' or h.dispatch_reason='historical_delivery_review_required' then '["release_review"]'::jsonb
   when h.dispatch_status in ('failed','blocked') and h.dispatch_reason in ('retries_exhausted','delivery_failed','organisation_contact_missing','attorney_firm_not_linked','domain_destination_conflict') then '["retry"]'::jsonb
   else '[]'::jsonb end from public.transaction_handoffs h where h.id=p_handoff),'[]'::jsonb);
$$;
-- Add capabilities to the existing matter register without exposing private job payloads.
create or replace function public.bridge_read_transaction_handoffs(p_transaction_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version','transaction_handoff_register_v1','items',coalesce(jsonb_agg(
   to_jsonb(h)||jsonb_build_object('recovery_actions',handoff_private.recovery_actions(h.id),
     'last_recovery',case when handoff_private.can_manage_recovery(h.owner_organisation_id) then
       (select jsonb_build_object('action',d.action,'reason',d.reason,'created_at',d.created_at) from handoff_private.recovery_decisions d
        where d.handoff_id=h.id order by d.created_at desc limit 1) else null end)||
   case when h.invitation_status='pending' and h.invitation_expires_at<=now() then
     jsonb_build_object('invitation_status','expired','exception_keys',to_jsonb(h.exception_keys||array['invitation_expired'])) else '{}'::jsonb end
   order by h.role_type),'[]'::jsonb))
 from public.transaction_handoffs h where h.transaction_id=p_transaction_id and public.bridge_can_access_transaction_spine(p_transaction_id);
$$;
create function public.bridge_recover_transaction_handoff(p_handoff_id uuid,p_generation bigint,p_action text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.transaction_handoffs; prior handoff_private.recovery_decisions; result jsonb; changes integer; tx_id uuid;
begin
  select transaction_id into tx_id from public.transaction_handoffs where id=p_handoff_id;
  -- Use the same lock order as source reconciliation and workspace preparation.
  perform 1 from public.transactions where id=tx_id for no key update;
  select * into h from public.transaction_handoffs where id=p_handoff_id for update;
  if h.id is null or not handoff_private.can_manage_recovery(h.owner_organisation_id) then
    return jsonb_build_object('success',false,'code','organisation_authority_required'); end if;
  if p_request_id is null or length(trim(coalesce(p_reason,''))) not between 10 and 1000 then
    return jsonb_build_object('success',false,'code','review_reason_required'); end if;
  select * into prior from handoff_private.recovery_decisions where request_id=p_request_id;
  if found then
    if prior.handoff_id=h.id and prior.actor_id=auth.uid() and prior.action=p_action and prior.generation=p_generation and prior.reason=trim(p_reason) then return prior.result; end if;
    return jsonb_build_object('success',false,'code','request_conflict');
  end if;
  if h.dispatch_generation is distinct from p_generation then return jsonb_build_object('success',false,'code','handoff_changed'); end if;
  if p_action is null or not (handoff_private.recovery_actions(h.id) ? p_action) then return jsonb_build_object('success',false,'code','recovery_not_available'); end if;
  if exists(select 1 from public.transactions t where t.id=h.transaction_id and
    (lower(coalesce(to_jsonb(t)->>'status','')) in ('cancelled','canceled','terminated','archived','completed')
     or nullif(to_jsonb(t)->>'archived_at','') is not null or coalesce(to_jsonb(t)->>'is_archived','false')='true')) then
    return jsonb_build_object('success',false,'code','matter_closed'); end if;
  if exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation
    and (j.status='leased' or (j.status not in ('sent','superseded') and j.first_provider_attempt_at<=now()-interval '23 hours'))) then
    return jsonb_build_object('success',false,'code','delivery_confirmation_required'); end if;
  if p_action='release_review' then
    if h.role_type='bond_originator' and exists(select 1 from public.transaction_bond_applications a where a.transaction_id=h.transaction_id
      and a.assigned_organisation_id is distinct from h.destination_organisation_id
      and (a.application_type='bank_application' or a.status not in ('pending','draft')
        or coalesce(to_jsonb(a)->>'assigned_user_id',to_jsonb(a)->>'assigned_branch_id',to_jsonb(a)->>'assigned_region_id',to_jsonb(a)->>'assigned_team_id',to_jsonb(a)->>'assigned_workspace_unit_id') is not null)) then
      return jsonb_build_object('success',false,'code','existing_finance_owner_required'); end if;
    -- Restore only an intake belonging to the current organisation; never move a bank application.
    update public.transaction_handoffs set assignment_cleanup_status='retired' where id=h.id;
    if h.role_type='bond_originator' then
      update public.transaction_bond_applications a set assignment_status=coalesce(
        (select r.prior_state->>'assignmentStatus' from handoff_private.retired_native_records r where r.record_id=a.id and r.record_type='bond_application' and r.prior_state->>'assignmentStatus'<>'inactive' order by r.retired_at desc limit 1),'organisation_queue')
        where a.transaction_id=h.transaction_id and a.application_type='originator_intake'
          and a.assigned_organisation_id=h.destination_organisation_id and a.assignment_status='inactive';
    end if;
  end if;
  update public.transaction_handoff_dispatch_jobs j set status='queued',reason=null,next_attempt_at=now(),updated_at=now(),
    max_attempts=case when j.status='exhausted' then least(24,greatest(j.max_attempts,j.attempt_count+4)) else j.max_attempts end
    where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.status in ('blocked','retry','exhausted')
      and j.attempt_count<24;
  get diagnostics changes=row_count;
  if changes=0 then raise exception 'No recoverable dispatch work remains' using errcode='P0001'; end if;
  perform handoff_private.refresh_dispatch(h.id);
  result:=jsonb_build_object('success',true,'code','queued','handoffId',h.id,'generation',h.dispatch_generation,'jobs',changes);
  insert into handoff_private.recovery_decisions values(p_request_id,h.id,auth.uid(),p_action,h.dispatch_generation,trim(p_reason),result,now());
  insert into public.transaction_events(transaction_id,event_type,event_data) values(h.transaction_id,'organisation_handoff_recovery_requested',
    jsonb_build_object('handoffId',h.id,'actorId',auth.uid(),'action',p_action,'reason',trim(p_reason),'generation',h.dispatch_generation,'visibility','internal'));
  return result;
end $$;
revoke all on function handoff_private.can_manage_recovery(uuid),handoff_private.recovery_actions(uuid) from public,anon,authenticated;
revoke all on function public.bridge_recover_transaction_handoff(uuid,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.bridge_recover_transaction_handoff(uuid,bigint,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
