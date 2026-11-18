begin;

-- A bounded ownership transfer avoids weakening ordinary agent row policies.
create function private.inbox_refer_listing_lead(p_org uuid,p_lead uuid,p_listing uuid,p_expected_agent uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); source public.leads%rowtype; listing public.private_listings%rowtype;
 recipient public.organisation_users%rowtype; member_id uuid; audit_id uuid; now_at timestamptz:=clock_timestamp();
begin
 if actor is null or not exists(select 1 from public.organisations where id=p_org and type='agency') then
  raise exception using errcode='42501',message='A signed-in agency member is required.';
 end if;
 select id into member_id from public.organisation_users where organisation_id=p_org and user_id=actor
  and lower(coalesce(membership_status,status,'')) in ('active','accepted');
 if member_id is null then raise exception using errcode='42501',message='Active organisation membership is required.';end if;
 select * into listing from public.private_listings where id=p_listing and organisation_id=p_org for share;
 if not found or listing.assigned_agent_id is null or listing.assigned_agent_id is distinct from p_expected_agent then
  raise exception using errcode='PT409',message='The listing agent changed. Review the listing before referring this lead.';
 end if;
 select * into recipient from public.organisation_users where organisation_id=p_org
  and (user_id=listing.assigned_agent_id or id=listing.assigned_agent_id)
  and lower(coalesce(membership_status,status,'')) in ('active','accepted')
  and lower(coalesce(nullif(workspace_role,''),role,'')) in ('agent','senior_agent','principal','owner','director','manager','branch_manager','admin','agency_admin')
  order by (user_id=listing.assigned_agent_id) desc limit 1;
 if recipient.user_id is null then raise exception 'The listing agent is not an active Revo team member.';end if;
 select * into source from public.leads where lead_id=p_lead and organisation_id=p_org for update;
 if not found or source.listing_id is distinct from p_listing::text or coalesce(source.lead_domain,'agency')='attorney' then
  raise exception using errcode='42501',message='This lead does not match the selected listing.';
 end if;
 -- Lost responses may be retried by the original owner, without a second transfer.
 if source.assigned_user_id=recipient.user_id and source.assigned_agent_id=recipient.user_id then
  select assignment_id into audit_id from public.lead_assignment_history where organisation_id=p_org and lead_id=p_lead
   and new_agent_id=recipient.user_id and assigned_by=actor and assignment_source='inbox_referral'
   order by created_at desc limit 1;
  if audit_id is not null then return jsonb_build_object('leadId',p_lead,'agentId',recipient.user_id,'assignmentId',audit_id,'alreadyReferred',true);end if;
 end if;
 if not public.bridge_agency_open_operations(p_org) and coalesce(source.assigned_user_id,source.assigned_agent_id) not in (actor,member_id) then
  raise exception using errcode='42501',message='Only the current lead owner or a principal can refer this lead.';
 end if;
 if not public.bridge_agency_open_operations(p_org) and coalesce(source.assigned_user_id,source.assigned_agent_id) is null then
  raise exception using errcode='42501',message='Only a principal can allocate an unassigned lead.';
 end if;
 update public.leads set assigned_user_id=recipient.user_id,assigned_agent_id=recipient.user_id,
  assigned_agent_email=nullif(lower(trim(recipient.email)),''),assigned_queue_id=null,assigned_at=now_at,
  ownership_status='assigned',sla_due_at=now_at+interval '24 hours',updated_at=now_at where lead_id=p_lead;
 insert into public.lead_assignment_history(organisation_id,lead_id,previous_agent_id,new_agent_id,previous_queue_id,new_queue_id,reason,assignment_source,assigned_by)
 values(p_org,p_lead,coalesce(source.assigned_user_id,source.assigned_agent_id),recipient.user_id,source.assigned_queue_id,null,
  'Referred from Inbox to the listing’s assigned agent','inbox_referral',actor) returning assignment_id into audit_id;
 insert into public.lead_activities(organisation_id,lead_id,activity_type,activity_note,outcome,activity_date,is_demo_data)
 values(p_org,p_lead,'Lead referred','Referred to '||coalesce(nullif(trim(to_jsonb(recipient)->>'full_name'),''),nullif(trim(recipient.email),''),recipient.user_id::text),
  'lead_referred',now_at,coalesce(source.is_demo_data,false));
 return jsonb_build_object('leadId',p_lead,'agentId',recipient.user_id,'assignmentId',audit_id,'alreadyReferred',false);
end $$;
revoke all on function private.inbox_refer_listing_lead(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.inbox_refer_listing_lead(uuid,uuid,uuid,uuid) to authenticated;

create function public.bridge_inbox_refer_listing_lead(p_org uuid,p_lead uuid,p_listing uuid,p_expected_agent uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.inbox_refer_listing_lead(p_org,p_lead,p_listing,p_expected_agent)
$$;
revoke all on function public.bridge_inbox_refer_listing_lead(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.bridge_inbox_refer_listing_lead(uuid,uuid,uuid,uuid) to authenticated;
commit;
