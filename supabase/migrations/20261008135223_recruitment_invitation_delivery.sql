begin;
-- Provider acceptance is distinct from delivery to an inbox and from agency membership.
create table public.recruitment_invitation_deliveries (
 id uuid primary key,
 organisation_id uuid not null,
 lead_id uuid not null,
 kind text not null check(kind in ('application','workspace')),
 reference_id uuid not null,
 recipient text not null,
 status text not null default 'sending' check(status in ('sending','provider_accepted','failed','unknown')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 requested_by uuid not null,
 lease_id uuid not null default gen_random_uuid(),
 leased_at timestamptz not null default now(),
 provider_id text,
 error_code text,
 -- Immutable provider request; includes the private link. Never granted to browser clients.
 message_json jsonb not null check(jsonb_typeof(message_json)='object'),
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id)
);
create index recruitment_invitation_delivery_reference_idx on public.recruitment_invitation_deliveries(organisation_id,lead_id,kind,reference_id,created_at desc);
alter table public.recruitment_invitation_deliveries enable row level security;
revoke all on public.recruitment_invitation_deliveries from public,anon,authenticated,service_role;
grant select(id,organisation_id,lead_id,kind,reference_id,recipient,status,created_at,updated_at,requested_by,provider_id,error_code) on public.recruitment_invitation_deliveries to authenticated;
create policy recruitment_invitation_delivery_read on public.recruitment_invitation_deliveries for select to authenticated using(exists(
 select 1 from public.organisation_users m where m.organisation_id=recruitment_invitation_deliveries.organisation_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','principal','admin','super_admin')
));

-- Only the email server can claim or finish an attempt. It supplies a verified Auth user id.
create function public.recruitment_begin_invitation_email(p_actor uuid,p_organisation_id uuid,p_lead_id uuid,p_kind text,p_reference_id uuid,p_request_id uuid,p_token_hash text,p_message jsonb,p_allow_duplicate boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.recruitment_leads%rowtype; i public.invites%rowtype; k public.recruitment_intake_links%rowtype; a public.recruitment_invitation_deliveries%rowtype; latest public.recruitment_invitation_deliveries%rowtype;
begin
 if p_actor is null or not exists(select 1 from public.organisation_users m where m.user_id=p_actor and m.organisation_id=p_organisation_id and m.status='active' and m.role in ('owner','principal','admin','super_admin')) then raise exception 'Organisation management access required' using errcode='42501'; end if;
 select * into l from public.recruitment_leads where id=p_lead_id and organisation_id=p_organisation_id for update;
 if l.id is null then raise exception 'Recruitment record unavailable'; end if;
 if l.email is null or lower(trim(l.email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Save a valid applicant email before sending'; end if;
 if p_kind='application' then
  select * into k from public.recruitment_intake_links where id=p_reference_id and organisation_id=p_organisation_id and lead_id=l.id for share;
  if l.status<>'lead_received' or k.id is null or k.channel<>'private_link' or k.revoked_at is not null or k.submitted_at is not null or k.expires_at<=now() or k.token_hash is distinct from p_token_hash then raise exception 'Application invitation is unavailable, expired or does not match this record'; end if;
 elsif p_kind='workspace' then
  select * into i from public.invites where id=p_reference_id for share;
  if l.status<>'onboarding_complete' or l.onboarding_completed_at is null or l.activation_json->>'state' is distinct from 'awaiting_acceptance' or l.activation_json->>'inviteId' is distinct from p_reference_id::text or i.id is null or i.target_workspace_id is distinct from p_organisation_id or i.status<>'pending' or i.token is null or (i.expires_at is not null and i.expires_at<=now()) or i.invite_type not in ('workspace_invite','branch_invite') or lower(trim(i.email)) is distinct from lower(trim(l.email)) or i.target_workspace_role is distinct from coalesce(l.activation_json->'joiningPlan'->>'role','agent') or (l.activation_json ? 'joiningPlan' and i.target_branch_id is distinct from (l.activation_json->'joiningPlan'->>'branchId')::uuid) then raise exception 'Workspace invitation is unavailable, expired or does not match the reviewed access'; end if;
  if l.activation_json ? 'joiningPlan' then perform public.recruitment_activation_plan(p_organisation_id,l.activation_json->'joiningPlan'); end if;
 else raise exception 'Choose an application or workspace invitation'; end if;
 select * into a from public.recruitment_invitation_deliveries where id=p_request_id;
 if a.id is not null and (a.organisation_id<>p_organisation_id or a.lead_id<>p_lead_id or a.kind<>p_kind or a.reference_id<>p_reference_id or a.recipient<>lower(trim(l.email))) then raise exception 'Sending request belongs to another invitation'; end if;
 select * into latest from public.recruitment_invitation_deliveries where organisation_id=p_organisation_id and lead_id=p_lead_id and kind=p_kind and reference_id=p_reference_id order by created_at desc limit 1;
 if a.id is not null and a.status<>'provider_accepted' and latest.id is distinct from a.id then a:=latest; end if;
 if a.id is null and latest.status in ('sending','unknown','failed') then
  if latest.created_at>now()-interval '23 hours' then a:=latest;
  elsif latest.status<>'failed' and p_allow_duplicate is distinct from true then raise exception 'Previous email result is uncertain. Review it before explicitly sending another email'; end if;
 end if;
 if a.status='provider_accepted' then return jsonb_build_object('send',false,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
 if a.id is not null then
  if a.created_at<=now()-interval '23 hours' then raise exception 'Retry window ended. Review the previous result and explicitly send another email'; end if;
  if a.recipient is distinct from lower(trim(l.email)) then raise exception 'Recipient changed. Review the saved record before sending again'; end if;
  if a.status='sending' and a.leased_at>now()-interval '60 seconds' then return jsonb_build_object('send',false,'busy',true,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
  update public.recruitment_invitation_deliveries set status='sending',lease_id=gen_random_uuid(),leased_at=now(),updated_at=now() where id=a.id returning * into a;
 else
  if p_request_id is null or p_message is null or jsonb_typeof(p_message)<>'object' or p_message->>'to' is distinct from lower(trim(l.email)) then raise exception 'Email request is incomplete'; end if;
  if latest.created_at>now()-interval '60 seconds' then raise exception 'Please wait a minute before sending another email'; end if;
  insert into public.recruitment_invitation_deliveries(id,organisation_id,lead_id,kind,reference_id,recipient,requested_by,message_json) values(p_request_id,p_organisation_id,p_lead_id,p_kind,p_reference_id,lower(trim(l.email)),p_actor,p_message) returning * into a;
 end if;
 return jsonb_build_object('send',true,'attempt',to_jsonb(a));
end;
$$;
revoke all on function public.recruitment_begin_invitation_email(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.recruitment_begin_invitation_email(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,boolean) to service_role;

create function public.recruitment_finish_invitation_email(p_request_id uuid,p_lease_id uuid,p_status text,p_provider_id text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('provider_accepted','failed','unknown') or (p_status='provider_accepted' and nullif(trim(p_provider_id),'') is null) then raise exception 'Invalid provider result'; end if;
 update public.recruitment_invitation_deliveries set status=p_status,provider_id=p_provider_id,error_code=left(p_error_code,80),updated_at=now() where id=p_request_id and lease_id=p_lease_id and status='sending';
 return found;
end;
$$;
revoke all on function public.recruitment_finish_invitation_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.recruitment_finish_invitation_email(uuid,uuid,text,text,text) to service_role;

create function public.recruitment_invitation_status(p_organisation_id uuid,p_lead_id uuid,p_kind text,p_reference_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.recruitment_leads%rowtype; i public.invites%rowtype; k public.recruitment_intake_links%rowtype; a public.recruitment_invitation_deliveries%rowtype; state text; expiry timestamptz;
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 select * into l from public.recruitment_leads where id=p_lead_id and organisation_id=p_organisation_id;
 if l.id is null then raise exception 'Recruitment record unavailable'; end if;
 if p_kind='application' then
  select * into k from public.recruitment_intake_links where id=p_reference_id and lead_id=l.id and organisation_id=p_organisation_id;
  if k.id is null then raise exception 'Application invitation unavailable'; end if;
  state:=case when k.submitted_at is not null then 'submitted' when k.revoked_at is not null then 'revoked' when k.expires_at<=now() then 'expired' when l.status<>'lead_received' then 'unavailable' else 'prepared' end; expiry:=k.expires_at;
 elsif p_kind='workspace' then
  select * into i from public.invites where id=p_reference_id and target_workspace_id=p_organisation_id;
  if i.id is null or not coalesce((p_reference_id=l.joining_invite_id or p_reference_id::text=l.activation_json->>'inviteId' or exists(select 1 from jsonb_array_elements(coalesce(l.activation_json->'inviteHistory','[]')) h where h->>'inviteId'=p_reference_id::text)),false) then raise exception 'Workspace invitation unavailable'; end if;
  state:=case when i.status='pending' and i.expires_at<=now() then 'expired' when i.status='pending' then 'prepared' else i.status end; expiry:=i.expires_at;
 else raise exception 'Unknown invitation type'; end if;
 select * into a from public.recruitment_invitation_deliveries where organisation_id=p_organisation_id and lead_id=p_lead_id and kind=p_kind and reference_id=p_reference_id order by created_at desc limit 1;
 return jsonb_build_object('referenceStatus',state,'expiresAt',expiry,'recipient',l.email,'attempt',case when a.id is null then null else (to_jsonb(a)-'message_json'-'lease_id'-'leased_at')||jsonb_build_object('reviewRequired',a.status in ('unknown','sending') and a.created_at<=now()-interval '23 hours','retryWindowEnded',a.created_at<=now()-interval '23 hours') end);
end;
$$;
revoke all on function public.recruitment_invitation_status(uuid,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.recruitment_invitation_status(uuid,uuid,text,uuid) to authenticated;
-- One safe progress projection for Agents, Branch staff and Commercial directories.
create function public.recruitment_joining_progress(p_organisation_id uuid,p_branch_id uuid default null,p_offset integer default 0,p_commercial boolean default false,p_limited boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limited then perform recruitment_private.assert_branch(p_organisation_id,p_branch_id);
 else perform public.recruitment_assert_joining_manager(p_organisation_id); end if;
 select coalesce(jsonb_agg(row_value order by created_at desc,id),'[]'::jsonb) into result from (
  select l.id,l.created_at,jsonb_build_object('id',l.id,'name',l.name,'status',l.status,'joining_branch_id',l.joining_json->>'branchId','activation_state',l.activation_json->>'state',
   'invitation_state',case
    when i.status='accepted' then 'access_accepted'
    when i.status='revoked' then 'access_revoked'
    when i.status='expired' or (i.expires_at<=now() and i.status='pending') then 'access_expired'
    when l.application_submitted_at is not null and i.id is null then 'application_submitted'
    when k.submitted_at is not null and i.id is null then 'application_submitted'
    when k.revoked_at is not null and i.id is null then 'application_revoked'
    when k.expires_at<=now() and i.id is null then 'application_expired'
    when a.status='failed' then 'email_failed'
    when a.status in ('sending','unknown') then 'email_uncertain'
    when a.status='provider_accepted' then 'email_provider_accepted'
    when i.status='pending' then 'access_prepared'
    when k.id is not null then 'application_prepared'
    else 'not_prepared' end)||case when p_limited then '{}'::jsonb else jsonb_build_object('email',l.email,'phone',l.phone) end row_value
  from public.recruitment_leads l
  left join public.invites i on i.id=(l.activation_json->>'inviteId')::uuid and i.target_workspace_id=l.organisation_id
  left join lateral(select * from public.recruitment_intake_links x where x.organisation_id=l.organisation_id and x.lead_id=l.id and x.channel='private_link' order by x.created_at desc,x.id limit 1) k on true
  left join lateral(select x.status from public.recruitment_invitation_deliveries x where x.organisation_id=l.organisation_id and x.lead_id=l.id and x.reference_id=coalesce(i.id,k.id) and x.kind=case when i.id is not null then 'workspace' else 'application' end order by x.created_at desc,x.id limit 1) a on true
  where l.organisation_id=p_organisation_id and l.status in ('lead_received','application_submitted','under_review','application_approved','contract_sent','contract_signed','onboarding_complete')
   and (p_branch_id is null or l.joining_json->>'branchId'=p_branch_id::text)
   and (not p_commercial or l.joining_json->>'role'='commercial_broker' or l.joining_json->'origin'->>'entryPoint'='commercial_brokers')
  order by l.created_at desc,l.id limit 200 offset greatest(coalesce(p_offset,0),0)
 ) rows;
 return result;
end;
$$;
revoke all on function public.recruitment_joining_progress(uuid,uuid,integer,boolean,boolean) from public,anon,service_role;
grant execute on function public.recruitment_joining_progress(uuid,uuid,integer,boolean,boolean) to authenticated;
commit;
