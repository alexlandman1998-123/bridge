begin;

create or replace function public.recruitment_activation_plan(p_organisation_id uuid,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb:=p_plan; choice text; branch_name text; commission_name text;
begin
  if plan->>'version' is distinct from 'recruitment-joining-v1' or coalesce(plan->>'branchId','')='' or coalesce(plan->>'startDate','')='' then raise exception 'Save the joining branch and date in Agent Details before preparing access'; end if;
  if plan->>'role' not in ('agent','senior_agent','commercial_broker') or plan->>'role' is null then raise exception 'Choose a supported joining role'; end if;
  if jsonb_typeof(plan->'businessWorkspaces') is distinct from 'array' then raise exception 'Save valid joining business access before preparing access'; end if;
  if jsonb_array_length(plan->'businessWorkspaces')=0 or exists(select 1 from jsonb_array_elements(plan->'businessWorkspaces') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' not in ('sales','rentals','short_term_rentals','commercial')) or (select count(*) from jsonb_array_elements(plan->'businessWorkspaces'))<>(select count(distinct v) from jsonb_array_elements(plan->'businessWorkspaces') v) then raise exception 'Save supported joining business access before preparing access'; end if;
  if (plan->>'role'='commercial_broker') is distinct from (plan->'businessWorkspaces' ? 'commercial') then raise exception 'Commercial broker joining requires Commercial business access and the broker role'; end if;
  if plan->'businessWorkspaces' ? 'commercial' and not exists(select 1 from public.organisation_modules m where m.organisation_id=p_organisation_id and m.module_key='commercial' and m.status='active') then raise exception 'Enable the Commercial module before preparing broker joining access'; end if;
  select b.name into branch_name from public.organisation_branches b where b.id=(plan->>'branchId')::uuid and b.organisation_id=p_organisation_id and b.is_active for share;
  if not found then raise exception 'Choose an active joining branch in this organisation'; end if;
  if coalesce(plan->>'commissionStructureId','')<>'' then
    select c.name into commission_name from public.organisation_commission_structures c where c.id=(plan->>'commissionStructureId')::uuid and c.organisation_id=p_organisation_id and c.is_active for share;
    if not found then raise exception 'Choose an active joining commission structure in this organisation'; end if;
  end if;
  choice:=plan->>'startDate';
  if choice!~'^\d{4}-\d{2}-\d{2}$' or choice::date::text<>choice then raise exception 'Choose a valid joining date'; end if;
  return jsonb_build_object('version','recruitment-joining-v1','origin',plan->'origin','branchId',plan->>'branchId','role',plan->>'role','businessWorkspaces',plan->'businessWorkspaces','commissionStructureId',coalesce(plan->>'commissionStructureId',''),'startDate',choice,'branchName',branch_name,'commissionName',commission_name);
end;
$$;

create or replace function public.recruitment_verify_joining_membership(p_organisation_id uuid,p_membership_id uuid,p_plan jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare member public.organisation_users%rowtype; profile public.organisation_user_commission_profiles%rowtype; profile_count integer;
begin
  select * into member from public.organisation_users where id=p_membership_id and organisation_id=p_organisation_id and status='active' and user_id is not null for share;
  if member.id is null or coalesce(nullif(member.workspace_role,''),nullif(member.organisation_role,''),member.role) is distinct from p_plan->>'role' or member.branch_id is distinct from (p_plan->>'branchId')::uuid or member.primary_branch_id is distinct from (p_plan->>'branchId')::uuid then raise exception 'Agent membership branch or role differs from the joining plan. Review the existing staff profile'; end if;
  if member.module_metadata->'businessWorkspaces' is null or not ((member.module_metadata->'businessWorkspaces') @> (p_plan->'businessWorkspaces') and (member.module_metadata->'businessWorkspaces') <@ (p_plan->'businessWorkspaces')) or member.module_metadata->>'joiningStartDate' is distinct from p_plan->>'startDate' then raise exception 'Agent membership business access or joining date differs from the joining plan. Review the existing staff profile'; end if;
  if p_plan->>'role'='commercial_broker' and (member.module_context is distinct from 'commercial' or member.module_metadata->>'commercial_role' is distinct from 'commercial_broker') then raise exception 'Commercial membership differs from the joining plan'; end if;
  select count(*) into profile_count from public.organisation_user_commission_profiles c where c.organisation_id=p_organisation_id and c.is_active and (c.organisation_user_id=member.id or c.user_id=member.user_id or lower(trim(c.email_address))=lower(trim(member.email)));
  if p_plan->>'commissionStructureId'='' then
    if profile_count<>0 then raise exception 'Existing agent commission differs from the joining plan. Review the staff commission profile'; end if;
    return null;
  end if;
  select * into profile from public.organisation_user_commission_profiles c where c.organisation_id=p_organisation_id and c.is_active and c.organisation_user_id=member.id and c.user_id=member.user_id and c.commission_structure_id=(p_plan->>'commissionStructureId')::uuid and c.effective_from=(p_plan->>'startDate')::date and c.override_agent_split_percentage is null for share;
  if profile_count<>1 or profile.id is null then raise exception 'Agent commission differs from the joining plan. Review the staff commission profile'; end if;
  return profile.id;
end;
$$;

create or replace function public.recruitment_apply_accepted_joining() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; member public.organisation_users%rowtype; plan jsonb; profile_count integer;
begin
  if old.status='accepted' or new.status<>'accepted' then return new; end if;
  select * into candidate from public.recruitment_leads l where l.organisation_id=new.target_workspace_id and l.activation_json->>'inviteId'=new.id::text and l.activation_json->'joiningPlan' is not null;
  if candidate.id is null then return new; end if;
  if auth.uid() is null or new.accepted_by_user_id is distinct from auth.uid() or candidate.status<>'onboarding_complete' or candidate.activation_json->>'state'<>'awaiting_acceptance' or lower(trim(new.email)) is distinct from candidate.activation_json->>'email' then raise exception 'The prepared joining invitation must be accepted by the matching account'; end if;
  plan:=public.recruitment_activation_plan(candidate.organisation_id,candidate.activation_json->'joiningPlan');
  if new.target_workspace_role is distinct from plan->>'role' or new.target_branch_id is distinct from (plan->>'branchId')::uuid or new.invite_type not in ('workspace_invite','branch_invite') then raise exception 'The accepted invitation differs from the joining plan'; end if;
  select * into member from public.organisation_users m where m.organisation_id=candidate.organisation_id and m.user_id=new.accepted_by_user_id and lower(trim(m.email))=candidate.activation_json->>'email' and m.status='active' for update;
  if member.id is null or coalesce(nullif(member.workspace_role,''),nullif(member.organisation_role,''),member.role) is distinct from plan->>'role' or member.branch_id is distinct from new.target_branch_id or member.primary_branch_id is distinct from new.target_branch_id then raise exception 'Agent membership branch or role differs from the joining plan. Review the existing staff profile'; end if;
  -- Preserve unrelated module metadata. Do not rewrite existing operational access.
  if member.module_metadata ? 'businessWorkspaces' and member.module_metadata->'businessWorkspaces' is distinct from plan->'businessWorkspaces' then raise exception 'Existing agent business access differs from the joining plan'; end if;
  if member.module_metadata ? 'business_workspaces' and member.module_metadata->'business_workspaces' is distinct from plan->'businessWorkspaces' then raise exception 'Existing agent business access differs from the joining plan'; end if;
  if member.module_metadata ? 'joiningStartDate' and member.module_metadata->>'joiningStartDate' is distinct from plan->>'startDate' then raise exception 'Existing agent joining date differs from the joining plan'; end if;
  update public.organisation_users set module_metadata=coalesce(module_metadata,'{}'::jsonb)||jsonb_build_object('businessWorkspaces',plan->'businessWorkspaces','business_workspaces',plan->'businessWorkspaces','joiningStartDate',plan->>'startDate') where id=member.id;
  if plan->>'role'='commercial_broker' then
    if member.module_context is not null and member.module_context not in ('','commercial') then raise exception 'Existing membership module differs from the joining plan'; end if;
    update public.organisation_users set module_context='commercial',module_metadata=module_metadata||jsonb_build_object('module','commercial','module_context','commercial','commercial_role','commercial_broker') where id=member.id;
  end if;
  select count(*) into profile_count from public.organisation_user_commission_profiles c where c.organisation_id=candidate.organisation_id and c.is_active and (c.organisation_user_id=member.id or c.user_id=member.user_id or lower(trim(c.email_address))=lower(trim(member.email)));
  if plan->>'commissionStructureId'<>'' and profile_count=0 then
    insert into public.organisation_user_commission_profiles(organisation_id,organisation_user_id,user_id,email_address,commission_structure_id,effective_from,is_active,created_by) values(candidate.organisation_id,member.id,member.user_id,candidate.email,(plan->>'commissionStructureId')::uuid,(plan->>'startDate')::date,true,(candidate.activation_json->>'preparedBy')::uuid);
  end if;
  perform public.recruitment_verify_joining_membership(candidate.organisation_id,member.id,plan);
  return new;
end;
$$;

create or replace function public.recruitment_activation_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; invitation public.invites%rowtype; membership public.organisation_users%rowtype; v_email text; history jsonb; plan jsonb; expected_role text; commission_id uuid;
begin
  if tg_op='INSERT' then
    if new.activation_json<>'{}'::jsonb or new.activated_at is not null or new.activated_by is not null then raise exception 'Activate agents only after onboarding is completed'; end if;
    return new;
  end if;
  if old.activation_json<>'{}'::jsonb and lower(trim(new.email)) is distinct from old.activation_json->>'email' then raise exception 'The prepared agent access email cannot be changed'; end if;
  if old.activated_at is not null then
    if new.activation_json is distinct from old.activation_json or new.activated_at is distinct from old.activated_at or new.activated_by is distinct from old.activated_by then raise exception 'Agent activation records cannot be changed'; end if;
    return new;
  end if;
  if new.activated_at is distinct from old.activated_at or new.activated_by is distinct from old.activated_by then raise exception 'Agent activation metadata is authored by the database'; end if;
  if new.activation_json is not distinct from old.activation_json then return new; end if;
  if new.email is distinct from old.email then raise exception 'Save the candidate email before preparing agent access'; end if;
  if auth.uid() is null or old.status<>'onboarding_complete' or old.onboarding_completed_at is null or old.onboarding_snapshot->>'version' is distinct from 'recruitment-onboarding-completion-v1' or new.status not in ('onboarding_complete','agent_activated') then raise exception 'Complete onboarding before preparing agent access'; end if;
  item:=new.activation_json; v_email:=lower(trim(old.email));
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 or jsonb_typeof(item->'notes') is distinct from 'string' or length(trim(item->>'notes')) not between 5 and 3000 or item->'confirmed' is distinct from 'true'::jsonb then raise exception 'Confirm agent identity and record activation findings'; end if;
  if not exists(select 1 from storage.objects s where s.bucket_id='recruitment-signed-contracts' and s.name=old.contract_signature_json->>'path') or exists(select 1 from jsonb_array_elements(old.onboarding_documents_json) d where not exists(select 1 from storage.objects s where s.bucket_id='recruitment-onboarding-documents' and s.name=d->>'path')) then raise exception 'Retain the signed contract and onboarding evidence before activation'; end if;
  history:=coalesce(old.activation_json->'history','[]'::jsonb);
  -- Already prepared legacy invitations retain their original standard-agent contract.
  if old.activation_json->>'inviteId' is not null and not (old.activation_json ? 'joiningPlan') then plan:=null;
  else plan:=public.recruitment_activation_plan(old.organisation_id,coalesce(old.activation_json->'joiningPlan',old.joining_json)); end if;
  expected_role:=coalesce(plan->>'role','agent');
  if item->>'state'='awaiting_acceptance' and new.status='onboarding_complete' then
    select * into invitation from public.invites where id=(item->>'inviteId')::uuid and target_workspace_id=old.organisation_id and lower(trim(invites.email))=v_email and target_workspace_role=expected_role and invite_type in ('workspace_invite','branch_invite') and status='pending' and (expires_at is null or expires_at>now()) for share;
    if invitation.id is null or (plan is not null and invitation.target_branch_id is distinct from (plan->>'branchId')::uuid) then raise exception 'Prepare a pending agent invitation matching the joining branch and role'; end if;
    if old.activation_json->>'inviteId' is not null then
      if invitation.id::text=old.activation_json->>'inviteId' or exists(select 1 from public.invites i where i.id=(old.activation_json->>'inviteId')::uuid and i.status='pending' and (i.expires_at is null or i.expires_at>now())) then raise exception 'Use the already prepared agent invitation'; end if;
      history:=history||jsonb_build_array(old.activation_json-'history');
    end if;
    new.activation_json:=jsonb_build_object('state','awaiting_acceptance','inviteId',invitation.id,'email',v_email,'role',expected_role,'joiningPlan',plan,'preparedAt',now(),'preparedBy',auth.uid(),'notes',trim(item->>'notes'),'history',history);
  elsif item->>'state'='active' and new.status='agent_activated' then
    select * into membership from public.organisation_users m where m.id=(item->>'membershipId')::uuid and m.organisation_id=old.organisation_id and lower(trim(m.email))=v_email and m.status='active' and m.user_id is not null and coalesce(nullif(m.workspace_role,''),nullif(m.organisation_role,''),m.role) in ('agent','senior_agent','sales_agent','commercial_broker') for share;
    if membership.id is null then raise exception 'The matching agent must have an active organisation membership before activation'; end if;
    if old.activation_json->>'inviteId' is not null and not exists(select 1 from public.invites i where i.id=(old.activation_json->>'inviteId')::uuid and i.target_workspace_id=old.organisation_id and lower(trim(i.email))=v_email and i.status='accepted' and i.accepted_by_user_id=membership.user_id and i.target_workspace_role=expected_role) then raise exception 'The prepared agent invitation must be accepted by the matching account'; end if;
    if plan is not null then commission_id:=public.recruitment_verify_joining_membership(old.organisation_id,membership.id,plan); end if;
    new.activated_at:=now(); new.activated_by:=auth.uid();
    new.activation_json:=jsonb_build_object('state','active','joiningPlan',plan,'commissionProfileId',commission_id,'membershipId',membership.id,'userId',membership.user_id,'email',v_email,'role',coalesce(nullif(membership.workspace_role,''),nullif(membership.organisation_role,''),membership.role),'notes',trim(item->>'notes'),'activatedAt',now(),'activatedBy',auth.uid(),'onboardingCompletedAt',old.onboarding_completed_at,'inviteId',old.activation_json->'inviteId','preparedAt',old.activation_json->'preparedAt','preparedBy',old.activation_json->'preparedBy','history',history,'source',case when old.activation_json->>'inviteId' is null then 'existing_active_member' else 'accepted_agent_invite' end);
  else raise exception 'Invalid agent activation state'; end if;
  if plan is null then new.activation_json:=new.activation_json-'joiningPlan'-'commissionProfileId'; end if;
  return new;
end;
$$;

create or replace function public.recruitment_activate_agent(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_notes text,p_confirmed boolean)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; membership public.organisation_users%rowtype; invitation public.invites%rowtype; result jsonb; v_email text; member_count integer; invite_id uuid; org_json jsonb; plan jsonb; expected_role text; expected_branch uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.organisation_users m where m.organisation_id=p_organisation_id and m.user_id=auth.uid() and m.status='active' and m.role in ('principal','admin','super_admin')) then raise exception 'Organisation management access required' using errcode='42501'; end if;
  if not exists(select 1 from public.organisations o where o.id=p_organisation_id and coalesce(o.type,'agency')='agency') then raise exception 'Agent recruitment requires an agency workspace'; end if;
  select * into candidate from public.recruitment_leads where organisation_id=p_organisation_id and id=p_lead_id for update;
  if candidate.id is null then raise exception 'Recruitment record changed or access was removed' using errcode='40001'; end if;
  -- Recover an uncertain successful response without creating another agent or audit.
  if candidate.status='agent_activated' and candidate.activated_at is not null then return next candidate; return; end if;
  if candidate.version is distinct from p_version then raise exception 'Recruitment record changed. Reload before activation' using errcode='40001'; end if;
  if candidate.status<>'onboarding_complete' or candidate.onboarding_completed_at is null then raise exception 'Complete onboarding before agent activation'; end if;
  if p_confirmed is distinct from true or p_notes is null or length(trim(p_notes)) not between 5 and 3000 then raise exception 'Confirm agent identity and record activation findings'; end if;
  v_email:=lower(trim(candidate.email));
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then raise exception 'Save a valid agent email before activation'; end if;
  if candidate.activation_json->>'inviteId' is not null and not (candidate.activation_json ? 'joiningPlan') then plan:=null;
  else plan:=public.recruitment_activation_plan(p_organisation_id,coalesce(candidate.activation_json->'joiningPlan',candidate.joining_json)); end if;
  expected_role:=coalesce(plan->>'role','agent'); expected_branch:=(plan->>'branchId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text||':'||v_email,0));
  select count(*) into member_count from public.organisation_users m where m.organisation_id=p_organisation_id and lower(trim(m.email))=v_email and m.status='active';
  if member_count>1 then raise exception 'Multiple active memberships match this email. Resolve the agent directory first'; end if;
  select * into membership from public.organisation_users m where m.organisation_id=p_organisation_id and lower(trim(m.email))=v_email and m.status='active' for share;
  if membership.id is not null then
    if membership.user_id is null or coalesce(nullif(membership.workspace_role,''),nullif(membership.organisation_role,''),membership.role) not in ('agent','senior_agent','sales_agent','commercial_broker') then raise exception 'This email belongs to an active non-agent member. Manage their role in the agent directory'; end if;
    return query update public.recruitment_leads set status='agent_activated',activation_json=jsonb_build_object('state','active','membershipId',membership.id,'notes',trim(p_notes),'confirmed',true) where id=candidate.id returning *;
    return;
  end if;
  if candidate.activation_json->>'inviteId' is not null then
    select * into invitation from public.invites where id=(candidate.activation_json->>'inviteId')::uuid;
    if invitation.status='pending' and (invitation.expires_at is null or invitation.expires_at>now()) then return next candidate; return; end if;
    if invitation.status='accepted' then raise exception 'Accepted invitation has no active agent membership. Resolve the agent directory first'; end if;
  end if;
  if candidate.joining_invite_id is not null and candidate.activation_json->>'inviteId' is null then
    select * into invitation from public.invites where id=candidate.joining_invite_id for share;
    if invitation.status='pending' and (invitation.expires_at is null or invitation.expires_at>now()) then
      return query update public.recruitment_leads set activation_json=jsonb_build_object('state','awaiting_acceptance','inviteId',invitation.id,'notes',trim(p_notes),'confirmed',true) where id=candidate.id returning *; return;
    end if;
    if invitation.status='accepted' then raise exception 'Accepted invitation has no active agent membership. Resolve the agent directory first'; end if;
  end if;
  -- Do not create a second live invitation to work around a different branch/type/role.
  if (select count(*) from public.invites where target_workspace_id=p_organisation_id and lower(trim(email))=v_email and invite_type in ('workspace_invite','branch_invite') and status='pending' and (expires_at is null or expires_at>now()))>1 then raise exception 'Multiple pending agent invitations match. Review existing invitations before handover'; end if;
  select * into invitation from public.invites where target_workspace_id=p_organisation_id and lower(trim(email))=v_email and invite_type in ('workspace_invite','branch_invite') and status='pending' and (expires_at is null or expires_at>now()) for share;
  if invitation.id is not null then
    return query update public.recruitment_leads set activation_json=jsonb_build_object('state','awaiting_acceptance','inviteId',invitation.id,'notes',trim(p_notes),'confirmed',true) where id=candidate.id returning *; return;
  end if;
  select to_jsonb(o) into org_json from public.organisations o where o.id=p_organisation_id;
  result:=public.bridge_create_invite(jsonb_build_object('invite_type','workspace_invite','target_workspace_id',p_organisation_id,'target_workspace_role',expected_role,'target_branch_id',expected_branch,'email',v_email,'phone',candidate.phone,'expires_at',now()+interval '14 days','metadata',jsonb_build_object('source','recruitment_activation','recruitment_lead_id',candidate.id,'first_name',split_part(candidate.name,' ',1),'last_name',trim(substr(candidate.name,length(split_part(candidate.name,' ',1))+1)),'mobile',candidate.phone,'role',expected_role,'role_label',case when expected_role='senior_agent' then 'Senior agent' when expected_role='commercial_broker' then 'Commercial broker' else 'Agent' end,'module_context',case when expected_role='commercial_broker' then 'commercial' end,'commercial_role',case when expected_role='commercial_broker' then 'commercial_broker' end,'joining_plan',plan,'branch_id',expected_branch,'branch_name',plan->>'branchName','commission_structure_id',plan->>'commissionStructureId','commission_structure_name',plan->>'commissionName','organisation_name',coalesce(org_json->>'display_name',org_json->>'name'))));
  if result->>'success' is distinct from 'true' and result->>'code' is distinct from 'duplicate_pending_invite' then raise exception 'Agent invitation could not be prepared. Check workspace invitation authority'; end if;
  invite_id:=(result->>'invite_id')::uuid;
  if invite_id is null then raise exception 'Agent invitation could not be prepared'; end if;
  return query update public.recruitment_leads set activation_json=jsonb_build_object('state','awaiting_acceptance','inviteId',invite_id,'notes',trim(p_notes),'confirmed',true) where id=candidate.id returning *;
end;
$$;

create function public.recruitment_activate_joining_agent_v2(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_notes text,p_confirmed boolean)
returns setof public.recruitment_leads language sql security invoker set search_path='' as $$
 select * from public.recruitment_activate_agent(p_organisation_id,p_lead_id,p_version,p_notes,p_confirmed);
$$;
revoke all on function public.recruitment_activate_joining_agent_v2(uuid,uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_activate_joining_agent_v2(uuid,uuid,integer,text,boolean) to authenticated;

-- Private definer functions intentionally read/write private recruitment without
-- widening table or evidence RLS. Every call rechecks active membership and branch.
create schema if not exists recruitment_private;
revoke all on schema recruitment_private from public,anon,service_role;
grant usage on schema recruitment_private to authenticated;
create function recruitment_private.assert_branch(p_org uuid,p_branch uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or p_branch is null or not exists(select 1 from public.organisation_users m join public.organisation_branches b on b.id=p_branch and b.organisation_id=m.organisation_id and b.is_active where m.organisation_id=p_org and m.user_id=auth.uid() and m.status='active' and m.role='branch_manager' and coalesce(m.primary_branch_id,m.branch_id)=p_branch) then raise exception 'Active management of this joining branch is required' using errcode='42501'; end if;
end;
$$;
create function recruitment_private.capture_branch(p_org uuid,p_branch uuid,p_contact jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.recruitment_leads%rowtype; receipt uuid:=(p_contact->>'intake_key')::uuid; v_email text:=lower(trim(coalesce(p_contact->>'email',''))); phone text:=trim(coalesce(p_contact->>'phone',''));
begin
 perform recruitment_private.assert_branch(p_org,p_branch);
 if receipt is null or length(trim(coalesce(p_contact->>'name',''))) not between 2 and 120 or length(v_email)>254 or (v_email='' and phone='') or (v_email<>'' and v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or length(phone)>40 then raise exception 'Enter a name and valid joining email or phone number'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||coalesce(nullif(v_email,''),receipt::text),0));
 select * into row from public.recruitment_leads where organisation_id=p_org and intake_key=receipt;
 if row.id is not null then
   if row.captured_by is distinct from auth.uid() or row.joining_json->>'branchId' is distinct from p_branch::text then raise exception 'Joining receipt belongs to a different request' using errcode='42501'; end if;
   return jsonb_build_object('id',row.id,'name',row.name,'status',row.status);
 end if;
 if v_email<>'' and (exists(select 1 from public.recruitment_leads where organisation_id=p_org and lower(trim(recruitment_leads.email))=v_email) or exists(select 1 from public.organisation_users m where m.organisation_id=p_org and lower(trim(m.email))=v_email and m.status='active') or exists(select 1 from public.invites i where i.target_workspace_id=p_org and lower(trim(i.email))=v_email and i.status='pending' and (i.expires_at is null or i.expires_at>now()))) then raise exception 'An existing joining or staff record needs principal review. Ask your principal to continue the existing record'; end if;
 insert into public.recruitment_leads(organisation_id,name,email,phone,source,intake_key,joining_json) values(p_org,trim(p_contact->>'name'),v_email,phone,'Manual',receipt,jsonb_build_object('branchId',p_branch,'role',case when p_contact->>'entryPoint'='commercial_brokers' then 'commercial_broker' else 'agent' end,'businessWorkspaces',case when p_contact->>'entryPoint'='commercial_brokers' then '["commercial"]'::jsonb else '[]'::jsonb end,'origin',jsonb_build_object('entryPoint',case when p_contact->>'entryPoint'='commercial_brokers' then 'commercial_brokers' else 'branch' end))) returning * into row;
 return jsonb_build_object('id',row.id,'name',row.name,'status',row.status);
end;
$$;
create function recruitment_private.branch_progress(p_org uuid,p_branch uuid,p_offset integer,p_commercial boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform recruitment_private.assert_branch(p_org,p_branch);
 if p_offset is null or p_offset<0 then raise exception 'Invalid joining page'; end if;
 return coalesce((select jsonb_agg(to_jsonb(rows)) from (select l.id,l.name,l.status,l.joining_json->>'branchId' joining_branch_id,l.activation_json->>'state' activation_state from public.recruitment_leads l where l.organisation_id=p_org and l.joining_json->>'branchId'=p_branch::text and (not p_commercial or l.joining_json->>'role'='commercial_broker' or l.joining_json->'origin'->>'entryPoint'='commercial_brokers') and l.status in ('lead_received','application_submitted','under_review','application_approved','contract_sent','contract_signed','onboarding_complete') order by l.created_at desc,l.id limit 200 offset p_offset) rows),'[]'::jsonb);
end;
$$;
revoke all on all functions in schema recruitment_private from public,anon,authenticated,service_role;
grant execute on function recruitment_private.capture_branch(uuid,uuid,jsonb),recruitment_private.branch_progress(uuid,uuid,integer,boolean) to authenticated;
create function public.recruitment_capture_branch_joining(p_organisation_id uuid,p_branch_id uuid,p_contact jsonb) returns jsonb language sql security invoker set search_path='' as $$ select recruitment_private.capture_branch(p_organisation_id,p_branch_id,p_contact); $$;
create function public.recruitment_branch_joining_progress(p_organisation_id uuid,p_branch_id uuid,p_offset integer default 0,p_commercial boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select recruitment_private.branch_progress(p_organisation_id,p_branch_id,p_offset,p_commercial); $$;
revoke all on function public.recruitment_capture_branch_joining(uuid,uuid,jsonb),public.recruitment_branch_joining_progress(uuid,uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_capture_branch_joining(uuid,uuid,jsonb),public.recruitment_branch_joining_progress(uuid,uuid,integer,boolean) to authenticated;

create or replace function public.recruitment_joining_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb:=new.joining_json; origin jsonb; matches jsonb; choice text; invitation public.invites%rowtype;
begin
  -- Branch capture is available only through the bounded private definer below.
  -- Table RLS still rejects every direct branch-manager INSERT/UPDATE/SELECT.
  if tg_op='INSERT' and current_user not in ('authenticated','service_role','anon') then
  if current_user=(select pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='recruitment_private' and p.proname='capture_branch') and exists(select 1 from public.organisation_users m where m.user_id=auth.uid() and m.organisation_id=new.organisation_id and m.status='active' and m.role='branch_manager' and coalesce(m.primary_branch_id,m.branch_id)::text=new.joining_json->>'branchId') then
    if new.status<>'lead_received' or new.intake_channel<>'manual' or new.joining_invite_id is not null or new.joining_json->>'role' not in ('agent','commercial_broker') or new.joining_json->'businessWorkspaces' is distinct from (case when new.joining_json->>'role'='commercial_broker' then '["commercial"]'::jsonb else '[]'::jsonb end) or coalesce(new.joining_json->>'commissionStructureId','')<>'' or coalesce(new.joining_json->>'startDate','')<>'' or new.details_json<>'{}'::jsonb or new.documents_json<>'[]'::jsonb then raise exception 'Branch joining capture must remain an unapproved enquiry'; end if;
    new.joining_json:=jsonb_build_object('version','recruitment-joining-v1','origin',jsonb_build_object('entryPoint',case when new.joining_json->'origin'->>'entryPoint'='commercial_brokers' then 'commercial_brokers' else 'branch' end,'source',new.source,'recordedAt',now(),'recordedBy',auth.uid()),'branchId',new.joining_json->>'branchId','role',new.joining_json->>'role','businessWorkspaces',new.joining_json->'businessWorkspaces','commissionStructureId','','startDate','');
    return new;
  end if;
  end if;
  if tg_op='UPDATE' and new.activation_json->>'inviteId' is not null
    and new.activation_json->>'inviteId' is distinct from old.activation_json->>'inviteId' then
    -- Serialize linking with the existing activation RPC's invitation row lock.
    perform 1 from public.invites i where i.id=(new.activation_json->>'inviteId')::uuid for update;
    if exists(select 1 from public.recruitment_leads l where l.id<>new.id and l.joining_invite_id=(new.activation_json->>'inviteId')::uuid) then
      raise exception 'Existing invitation is already linked to another recruitment record';
    end if;
  end if;
  if tg_op='UPDATE' and old.joining_invite_id is not null and lower(trim(new.email)) is distinct from lower(trim(old.email)) then
    raise exception 'The email linked to an existing invitation cannot be changed';
  end if;
  if tg_op='UPDATE' and new.joining_json is not distinct from old.joining_json
    and new.joining_invite_id is not distinct from old.joining_invite_id then
    -- A linked legacy invitation must be resolved or reused, never replaced by
    -- another live invitation as a side effect of the existing activation RPC.
    if new.activation_json is distinct from old.activation_json and new.activation_json->>'state'='awaiting_acceptance'
      and old.joining_invite_id is not null and new.activation_json->>'inviteId' is distinct from old.joining_invite_id::text
      and exists(select 1 from public.invites i where i.id=old.joining_invite_id and i.status='pending' and (i.expires_at is null or i.expires_at>now())) then
      raise exception 'Resolve the linked existing invitation before preparing agent access';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    if old.activated_at is not null or old.activation_json->>'inviteId' is not null then raise exception 'Joining choices are locked after agent access is prepared'; end if;
    if old.joining_invite_id is not null and new.joining_invite_id is distinct from old.joining_invite_id then raise exception 'Existing invitation history cannot be replaced'; end if;
    if old.joining_json<>'{}'::jsonb and item->'origin' is distinct from old.joining_json->'origin' then raise exception 'Joining origin cannot be changed'; end if;
  end if;
  -- Anonymous/server intake cannot supply staff choices. Empty server intake is
  -- assigned only its true intake channel and receipt; no staff access is added.
  if current_user='service_role' then
    if item<>'{}'::jsonb or new.joining_invite_id is not null then raise exception 'Joining choices require organisation management' using errcode='42501'; end if;
  else
    perform public.recruitment_assert_joining_manager(new.organisation_id);
  end if;
  if jsonb_typeof(item) is distinct from 'object' or length(item::text)>12000 then raise exception 'Invalid joining choices'; end if;
  if item<>'{}'::jsonb and item->>'version' is distinct from 'recruitment-joining-v1' then raise exception 'Invalid joining record version'; end if;
  origin:=case when tg_op='UPDATE' and old.joining_json<>'{}'::jsonb then old.joining_json->'origin'
    else jsonb_build_object('entryPoint',case when tg_op='UPDATE' then 'legacy'
      when new.intake_channel<>'manual' then new.intake_channel else coalesce(item->'origin'->>'entryPoint','recruitment') end,
      'source',case when tg_op='UPDATE' then old.source else new.source end,'recordedAt',now(),'recordedBy',auth.uid()) end;
  if origin->>'entryPoint' not in ('recruitment','agents','branch','settings_users','agency_setup','commercial_brokers','website','public_link','private_link','legacy') then raise exception 'Invalid joining entry point'; end if;
  item:=jsonb_build_object('version','recruitment-joining-v1','origin',origin,
    'branchId',coalesce(item->>'branchId',''),'role',coalesce(item->>'role','agent'),
    'businessWorkspaces',coalesce(item->'businessWorkspaces','[]'::jsonb),
    'commissionStructureId',coalesce(item->>'commissionStructureId',''),'startDate',coalesce(item->>'startDate',''));
  if item->>'role' not in ('agent','senior_agent','commercial_broker') then raise exception 'Choose an agent joining role'; end if;
  if jsonb_typeof(item->'businessWorkspaces') is distinct from 'array' or jsonb_array_length(item->'businessWorkspaces')>4
    or exists(select 1 from jsonb_array_elements(item->'businessWorkspaces') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' not in ('sales','rentals','short_term_rentals','commercial'))
    or (select count(*) from jsonb_array_elements(item->'businessWorkspaces'))<>(select count(distinct v) from jsonb_array_elements(item->'businessWorkspaces') v) then raise exception 'Choose valid business areas'; end if;
  if item->>'branchId'<>'' then
    if not exists(select 1 from public.organisation_branches b where b.id=(item->>'branchId')::uuid and b.organisation_id=new.organisation_id and b.is_active) then raise exception 'Choose an active branch in this organisation'; end if;
  end if;
  if item->>'commissionStructureId'<>'' then
    if not exists(select 1 from public.organisation_commission_structures c where c.id=(item->>'commissionStructureId')::uuid and c.organisation_id=new.organisation_id and c.is_active) then raise exception 'Choose an active commission structure in this organisation'; end if;
  end if;
  choice:=item->>'startDate';
  if choice<>'' and (choice!~'^\d{4}-\d{2}-\d{2}$' or choice::date::text<>choice) then raise exception 'Choose a valid joining date'; end if;
  if new.joining_invite_id is not null then
    select * into invitation from public.invites i where i.id=new.joining_invite_id and i.target_workspace_id=new.organisation_id
      and lower(trim(i.email))=lower(trim(new.email)) and i.invite_type in ('workspace_invite','branch_invite') and i.target_workspace_role in ('agent','senior_agent','sales_agent','commercial_broker') for update;
    if invitation.id is null then raise exception 'Existing invitation must match this organisation, agent email and role'; end if;
    if invitation.target_branch_id is not null and item->>'branchId'<>'' and invitation.target_branch_id::text<>item->>'branchId' then raise exception 'Existing invitation belongs to another branch'; end if;
    if (tg_op='INSERT' or old.joining_invite_id is null) and (invitation.status<>'pending' or invitation.expires_at<=now()) then raise exception 'Link only a pending unexpired invitation'; end if;
    if exists(select 1 from public.recruitment_leads l where l.id<>new.id and (l.joining_invite_id=invitation.id or l.activation_json->>'inviteId'=invitation.id::text)) then raise exception 'Existing invitation is already linked to another recruitment record'; end if;
    if tg_op='INSERT' or old.joining_invite_id is null then item:=item||jsonb_build_object('inviteLinkedAt',now(),'inviteLinkedBy',auth.uid());
    else item:=item||(old.joining_json-'version'-'origin'-'branchId'-'role'-'businessWorkspaces'-'commissionStructureId'-'startDate'); end if;
  end if;
  if tg_op='INSERT' and current_user<>'service_role' then
    perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text||':'||lower(trim(coalesce(nullif(new.email,''),new.intake_key::text))),0));
    matches:=public.recruitment_find_joining_matches(new.organisation_id,new.email);
    if jsonb_array_length(matches->'members')>0 then raise exception 'This person is already an active agency member. Manage their existing profile'; end if;
    if jsonb_array_length(matches->'leads')+jsonb_array_length(matches->'invites')>0 then
      if new.joining_json->'reviewedMatches' is distinct from 'true'::jsonb then raise exception 'Review existing recruitment records and invitations before creating a separate enquiry'; end if;
      item:=item||jsonb_build_object('matchReview',jsonb_build_object('at',now(),'by',auth.uid(),'matches',matches));
    end if;
  elsif tg_op='UPDATE' and old.joining_json?'matchReview' then item:=item||jsonb_build_object('matchReview',old.joining_json->'matchReview');
  end if;
  new.joining_json:=item;
  return new;
end;
$$;

create function public.recruitment_capture_setup_joining(p_organisation_id uuid,p_contact jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare branch uuid; result jsonb; commercial boolean:=coalesce((p_contact->>'commercial')::boolean,false);
begin
 perform public.recruitment_assert_joining_manager(p_organisation_id);
 if coalesce(p_contact->>'receipt','')='' then raise exception 'Joining setup receipt is required'; end if;
 if (select count(*) from public.organisation_branches where organisation_id=p_organisation_id and name=p_contact->>'branchName' and is_active)<>1 then raise exception 'Choose a unique active joining branch before saving agency recruits'; end if;
 select id into branch from public.organisation_branches where organisation_id=p_organisation_id and name=p_contact->>'branchName' and is_active;
 result:=public.recruitment_create_joining_lead(p_organisation_id,jsonb_build_object('name',p_contact->>'name','email',p_contact->>'email','phone','','area','','source','Manual','details_json','{}'::jsonb,'intake_key',md5(p_organisation_id::text||':'||(p_contact->>'receipt'))::uuid,'joining_json',jsonb_build_object('version','recruitment-joining-v1','origin',jsonb_build_object('entryPoint','agency_setup'),'branchId',branch,'role',case when commercial then 'commercial_broker' else 'agent' end,'businessWorkspaces',case when commercial then '["commercial"]'::jsonb else '[]'::jsonb end,'commissionStructureId','','startDate','')));
 return jsonb_build_object('outcome',result->>'outcome','id',result->'lead'->>'id');
end;
$$;
revoke all on function public.recruitment_capture_setup_joining(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_capture_setup_joining(uuid,jsonb) to authenticated;
-- Owners are the existing top agency authority. Give them the same recruitment
-- boundaries as principals, including evidence RLS and guarded action RPCs.
-- Restrict the replacements to recruitment functions/policies only.
do $$
declare item record; definition text; predicate text; check_predicate text;
begin
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'recruitment\_%' escape '\' loop
   definition:=pg_get_functiondef(item.oid);
   if definition ~ '\(''principal'',[[:space:]]*''admin'',[[:space:]]*''super_admin''\)' then
     definition:=regexp_replace(definition,'\(''principal'',[[:space:]]*''admin'',[[:space:]]*''super_admin''\)','(''owner'',''principal'',''admin'',''super_admin'')','g');
     execute definition;
   end if;
 end loop;
 for item in select p.polname,p.polrelid,pg_get_expr(p.polqual,p.polrelid) using_expr,pg_get_expr(p.polwithcheck,p.polrelid) check_expr from pg_policy p join pg_class t on t.oid=p.polrelid join pg_namespace n on n.oid=t.relnamespace where (n.nspname='public' and t.relname like 'recruitment\_%' escape '\') or (n.nspname='storage' and p.polname like 'recruitment\_%' escape '\') loop
   predicate:=replace(item.using_expr,'''principal''::text','''owner''::text, ''principal''::text');
   check_predicate:=replace(item.check_expr,'''principal''::text','''owner''::text, ''principal''::text');
   if predicate is distinct from item.using_expr or check_predicate is distinct from item.check_expr then
     execute format('alter policy %I on %s %s %s',item.polname,item.polrelid::regclass,case when predicate is not null then 'using ('||predicate||')' else '' end,case when check_predicate is not null then 'with check ('||check_predicate||')' else '' end);
   end if;
 end loop;
end;
$$;
commit;
