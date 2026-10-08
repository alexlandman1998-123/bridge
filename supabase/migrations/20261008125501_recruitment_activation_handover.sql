begin;

-- Derive access solely from the saved plan. The browser cannot supply roles or membership ids.
create function public.recruitment_activation_plan(p_organisation_id uuid,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb:=p_plan; choice text; branch_name text; commission_name text;
begin
  if plan->>'version' is distinct from 'recruitment-joining-v1' or coalesce(plan->>'branchId','')='' or coalesce(plan->>'startDate','')='' then raise exception 'Save the joining branch and date in Agent Details before preparing access'; end if;
  if plan->>'role' not in ('agent','senior_agent') or plan->>'role' is null then raise exception 'Commercial broker handover is not available yet. Choose a supported agent role'; end if;
  if jsonb_typeof(plan->'businessWorkspaces') is distinct from 'array' then raise exception 'Save valid joining business access before preparing access'; end if;
  if jsonb_array_length(plan->'businessWorkspaces')=0 or exists(select 1 from jsonb_array_elements(plan->'businessWorkspaces') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' not in ('sales','rentals','short_term_rentals')) or (select count(*) from jsonb_array_elements(plan->'businessWorkspaces'))<>(select count(distinct v) from jsonb_array_elements(plan->'businessWorkspaces') v) then raise exception 'Save supported joining business access before preparing access. Commercial handover is not available yet'; end if;
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

-- Verification never transfers an existing member, changes their role or overwrites commission.
create function public.recruitment_verify_joining_membership(p_organisation_id uuid,p_membership_id uuid,p_plan jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare member public.organisation_users%rowtype; profile public.organisation_user_commission_profiles%rowtype; profile_count integer;
begin
  select * into member from public.organisation_users where id=p_membership_id and organisation_id=p_organisation_id and status='active' and user_id is not null for share;
  if member.id is null or coalesce(nullif(member.workspace_role,''),nullif(member.organisation_role,''),member.role) is distinct from p_plan->>'role' or member.branch_id is distinct from (p_plan->>'branchId')::uuid or member.primary_branch_id is distinct from (p_plan->>'branchId')::uuid then raise exception 'Agent membership branch or role differs from the joining plan. Review the existing staff profile'; end if;
  if member.module_metadata->'businessWorkspaces' is null or not ((member.module_metadata->'businessWorkspaces') @> (p_plan->'businessWorkspaces') and (member.module_metadata->'businessWorkspaces') <@ (p_plan->'businessWorkspaces')) or member.module_metadata->>'joiningStartDate' is distinct from p_plan->>'startDate' then raise exception 'Agent membership business access or joining date differs from the joining plan. Review the existing staff profile'; end if;
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

-- Canonical acceptance grants membership. This narrowly scoped trigger applies the
-- immutable, management-reviewed plan in that same transaction, before it commits.
-- Definer privileges are needed because the accepting applicant cannot read private recruitment.
create function public.recruitment_apply_accepted_joining() returns trigger language plpgsql security definer set search_path='' as $$
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
  select count(*) into profile_count from public.organisation_user_commission_profiles c where c.organisation_id=candidate.organisation_id and c.is_active and (c.organisation_user_id=member.id or c.user_id=member.user_id or lower(trim(c.email_address))=lower(trim(member.email)));
  if plan->>'commissionStructureId'<>'' and profile_count=0 then
    insert into public.organisation_user_commission_profiles(organisation_id,organisation_user_id,user_id,email_address,commission_structure_id,effective_from,is_active,created_by) values(candidate.organisation_id,member.id,member.user_id,candidate.email,(plan->>'commissionStructureId')::uuid,(plan->>'startDate')::date,true,(candidate.activation_json->>'preparedBy')::uuid);
  end if;
  perform public.recruitment_verify_joining_membership(candidate.organisation_id,member.id,plan);
  return new;
end;
$$;
revoke all on function public.recruitment_apply_accepted_joining() from public,anon,authenticated,service_role;
create trigger zz_recruitment_acceptance_handover after update of status on public.invites for each row execute function public.recruitment_apply_accepted_joining();

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
    select * into membership from public.organisation_users m where m.id=(item->>'membershipId')::uuid and m.organisation_id=old.organisation_id and lower(trim(m.email))=v_email and m.status='active' and m.user_id is not null and coalesce(nullif(m.workspace_role,''),nullif(m.organisation_role,''),m.role) in ('agent','senior_agent','sales_agent') for share;
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
    if membership.user_id is null or coalesce(nullif(membership.workspace_role,''),nullif(membership.organisation_role,''),membership.role) not in ('agent','senior_agent','sales_agent') then raise exception 'This email belongs to an active non-agent member. Manage their role in the agent directory'; end if;
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
  result:=public.bridge_create_invite(jsonb_build_object('invite_type','workspace_invite','target_workspace_id',p_organisation_id,'target_workspace_role',expected_role,'target_branch_id',expected_branch,'email',v_email,'phone',candidate.phone,'expires_at',now()+interval '14 days','metadata',jsonb_build_object('source','recruitment_activation','recruitment_lead_id',candidate.id,'first_name',split_part(candidate.name,' ',1),'last_name',trim(substr(candidate.name,length(split_part(candidate.name,' ',1))+1)),'mobile',candidate.phone,'role',expected_role,'role_label',case when expected_role='senior_agent' then 'Senior agent' else 'Agent' end,'joining_plan',plan,'branch_id',expected_branch,'branch_name',plan->>'branchName','commission_structure_id',plan->>'commissionStructureId','commission_structure_name',plan->>'commissionName','organisation_name',coalesce(org_json->>'display_name',org_json->>'name'))));
  if result->>'success' is distinct from 'true' and result->>'code' is distinct from 'duplicate_pending_invite' then raise exception 'Agent invitation could not be prepared. Check workspace invitation authority'; end if;
  invite_id:=(result->>'invite_id')::uuid;
  if invite_id is null then raise exception 'Agent invitation could not be prepared'; end if;
  return query update public.recruitment_leads set activation_json=jsonb_build_object('state','awaiting_acceptance','inviteId',invite_id,'notes',trim(p_notes),'confirmed',true) where id=candidate.id returning *;
end;
$$;

revoke all on function public.recruitment_activation_plan(uuid,jsonb),public.recruitment_verify_joining_membership(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_activation_plan(uuid,jsonb),public.recruitment_verify_joining_membership(uuid,uuid,jsonb) to authenticated;
-- A distinct endpoint makes frontend preparation fail closed until this migration exists.
create function public.recruitment_activate_joining_agent(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_notes text,p_confirmed boolean)
returns setof public.recruitment_leads language sql security invoker set search_path='' as $$
  select * from public.recruitment_activate_agent(p_organisation_id,p_lead_id,p_version,p_notes,p_confirmed);
$$;
revoke all on function public.recruitment_activate_joining_agent(uuid,uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_activate_joining_agent(uuid,uuid,integer,text,boolean) to authenticated;
commit;
