begin;
alter table public.recruitment_leads
  add column activation_json jsonb not null default '{}' check(jsonb_typeof(activation_json)='object'),
  add column activated_at timestamptz,
  add column activated_by uuid;
create unique index recruitment_activation_email_unique on public.recruitment_leads(organisation_id,lower(activation_json->>'email')) where activated_at is not null;
create unique index recruitment_activation_user_unique on public.recruitment_leads(organisation_id,(activation_json->>'userId')) where activated_at is not null;
create unique index recruitment_activation_invite_unique on public.recruitment_leads((activation_json->>'inviteId')) where activation_json->>'inviteId' is not null;

-- This guard records existing canonical membership; it never grants membership or roles.
create function public.recruitment_activation_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; invitation public.invites%rowtype; membership public.organisation_users%rowtype; v_email text; history jsonb;
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
  if item->>'state'='awaiting_acceptance' and new.status='onboarding_complete' then
    select * into invitation from public.invites where id=(item->>'inviteId')::uuid and target_workspace_id=old.organisation_id and lower(trim(invites.email))=v_email and target_workspace_role='agent' and invite_type='workspace_invite' and status='pending' and (expires_at is null or expires_at>now()) for share;
    if invitation.id is null then raise exception 'Prepare a pending agent invitation for this organisation and email'; end if;
    if old.activation_json->>'inviteId' is not null then
      if invitation.id::text=old.activation_json->>'inviteId' or exists(select 1 from public.invites i where i.id=(old.activation_json->>'inviteId')::uuid and i.status='pending' and (i.expires_at is null or i.expires_at>now())) then raise exception 'Use the already prepared agent invitation'; end if;
      history:=history||jsonb_build_array(old.activation_json-'history');
    end if;
    new.activation_json:=jsonb_build_object('state','awaiting_acceptance','inviteId',invitation.id,'email',v_email,'role','agent','preparedAt',now(),'preparedBy',auth.uid(),'notes',trim(item->>'notes'),'history',history);
  elsif item->>'state'='active' and new.status='agent_activated' then
    select * into membership from public.organisation_users m where m.id=(item->>'membershipId')::uuid and m.organisation_id=old.organisation_id and lower(trim(m.email))=v_email and m.status='active' and m.user_id is not null and coalesce(nullif(m.workspace_role,''),nullif(m.organisation_role,''),m.role) in ('agent','senior_agent','sales_agent') for share;
    if membership.id is null then raise exception 'The matching agent must have an active organisation membership before activation'; end if;
    if old.activation_json->>'inviteId' is not null and not exists(select 1 from public.invites i where i.id=(old.activation_json->>'inviteId')::uuid and i.target_workspace_id=old.organisation_id and lower(trim(i.email))=v_email and i.status='accepted' and i.accepted_by_user_id=membership.user_id and i.target_workspace_role='agent') then raise exception 'The prepared agent invitation must be accepted by the matching account'; end if;
    new.activated_at:=now(); new.activated_by:=auth.uid();
    new.activation_json:=jsonb_build_object('state','active','membershipId',membership.id,'userId',membership.user_id,'email',v_email,'role',coalesce(nullif(membership.workspace_role,''),nullif(membership.organisation_role,''),membership.role),'notes',trim(item->>'notes'),'activatedAt',now(),'activatedBy',auth.uid(),'onboardingCompletedAt',old.onboarding_completed_at,'inviteId',old.activation_json->'inviteId','preparedAt',old.activation_json->'preparedAt','preparedBy',old.activation_json->'preparedBy','history',history,'source',case when old.activation_json->>'inviteId' is null then 'existing_active_member' else 'accepted_agent_invite' end);
  else raise exception 'Invalid agent activation state'; end if;
  return new;
end;
$$;
revoke all on function public.recruitment_activation_guard() from public,anon,authenticated;
create trigger f_recruitment_activation_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_activation_guard();

create or replace function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
declare event_type text; submitting boolean;
begin
  submitting := coalesce(current_user = 'service_role' and new.status = 'application_submitted'
    and new.application_json->>'version' = 'recruitment-application-v1'
    and new.application_json->'answers'->>'privacyAccepted' = 'true'
    and new.application_json->'answers'->>'declarationAccepted' = 'true',false);
  if tg_op = 'INSERT' then
    if new.status <> 'lead_received' and not submitting then raise exception 'New recruitment enquiries must start at Lead Received'; end if;
    if new.intake_channel <> 'manual' and not submitting then raise exception 'Public intake requires a submitted application'; end if;
    if not submitting and (new.application_json <> '{}' or new.application_submitted_at is not null) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    new.received_at := now(); new.created_at := now(); new.updated_at := now(); new.captured_by := auth.uid(); new.version := 1;
    new.activity_json := jsonb_build_array(jsonb_build_object('type','lead_received','at',now(),'actorId',auth.uid(),'source',new.source));
    if submitting then
      new.application_submitted_at := now();
      new.activity_json := new.activity_json || jsonb_build_array(jsonb_build_object('type','application_submitted','at',now(),'channel',new.application_json->>'channel','reviewStatus',new.review_status));
    end if;
  else
    if new.organisation_id <> old.organisation_id then raise exception 'Recruitment leads cannot move organisations'; end if;
    if new.received_at is distinct from old.received_at or new.captured_by is distinct from old.captured_by or new.intake_channel is distinct from old.intake_channel or new.intake_key is distinct from old.intake_key or new.created_at is distinct from old.created_at then raise exception 'Recruitment receipt details cannot be changed'; end if;
    submitting := coalesce(submitting,false) and old.status = 'lead_received' and old.application_submitted_at is null;
    if not submitting and (new.application_json is distinct from old.application_json or new.application_submitted_at is distinct from old.application_submitted_at) then raise exception 'Applications must be submitted through the Join Us form'; end if;
    if new.status is distinct from old.status and not (submitting or
      (old.status = 'application_approved' and new.status = 'contract_sent' and new.contract_delivery_json <> '{}'::jsonb) or
      (old.status = 'onboarding_complete' and new.status = 'agent_activated' and new.activated_at is not null) or
      (old.status = 'contract_signed' and new.status = 'onboarding_complete' and new.onboarding_completed_at is not null) or
      (old.status = 'contract_sent' and new.status = 'contract_signed' and new.contract_signature_json <> '{}'::jsonb) or
      (old.status = 'under_review' and new.status = 'application_approved' and new.approved_at is not null) or
      (old.status = 'application_submitted' and new.status = 'under_review' and new.review_started_at is not null and old.application_submitted_at is not null) or
      (new.status = 'closed_lost' and old.status not in ('agent_activated','legacy_joined')) or
      (old.status = 'closed_lost' and new.status = case when old.onboarding_completed_at is not null then 'onboarding_complete' when old.contract_signature_json <> '{}'::jsonb then 'contract_signed' when old.contract_delivery_json <> '{}'::jsonb then 'contract_sent' when old.approved_at is not null then 'application_approved' when old.review_started_at is not null then 'under_review' when old.application_submitted_at is not null then 'application_submitted' else 'lead_received' end)
    ) then raise exception 'Later recruitment phases are not enabled yet'; end if;
    if submitting then new.application_submitted_at := now(); end if;
    event_type := case when old.activated_at is null and new.activated_at is not null then 'agent_activated' when new.activation_json is distinct from old.activation_json then 'agent_access_prepared' when old.onboarding_completed_at is null and new.onboarding_completed_at is not null then 'onboarding_completed' when new.onboarding_documents_json is distinct from old.onboarding_documents_json then 'onboarding_document_uploaded' when new.onboarding_json is distinct from old.onboarding_json then 'onboarding_updated' when new.contract_signature_json is distinct from old.contract_signature_json then 'contract_signed' when new.contract_delivery_json is distinct from old.contract_delivery_json then 'contract_delivery_recorded' when new.contracts_json is distinct from old.contracts_json then 'contract_prepared' when submitting then 'application_submitted' when old.approved_at is null and new.approved_at is not null then 'application_approved' when old.review_started_at is null and new.review_started_at is not null then 'review_started' when new.review_updated_at is distinct from old.review_updated_at or new.review_json is distinct from old.review_json then 'review_updated' when new.status = 'closed_lost' and old.status <> 'closed_lost' then 'lead_closed' when old.status = 'closed_lost' and new.status <> 'closed_lost' then 'lead_reopened' else 'lead_updated' end;
    new.version := old.version + 1; new.updated_at := now();
    new.activity_json := old.activity_json || jsonb_build_array(jsonb_build_object('type',event_type,'at',now(),'actorId',auth.uid(),'fromStage',old.status,'toStage',new.status,'channel',new.application_json->>'channel','reviewStatus',new.review_status));
  end if;
  new.details_json := jsonb_set(new.details_json,'{onboardingCaptured}',to_jsonb(new.application_submitted_at is not null or coalesce(tg_op = 'UPDATE' and old.details_json->>'onboardingCaptured' = 'true',false)));
  return new;
end;
$$;




-- Recruitment stays invoker-scoped. Invitation creation delegates to the existing,
-- authority-checked canonical invite workflow and does not deliver any message.
create function public.recruitment_activate_agent(p_organisation_id uuid,p_lead_id uuid,p_version integer,p_notes text,p_confirmed boolean)
returns setof public.recruitment_leads language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; membership public.organisation_users%rowtype; invitation public.invites%rowtype; result jsonb; v_email text; member_count integer; invite_id uuid; org_json jsonb;
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
  select to_jsonb(o) into org_json from public.organisations o where o.id=p_organisation_id;
  result:=public.bridge_create_invite(jsonb_build_object('invite_type','workspace_invite','target_workspace_id',p_organisation_id,'target_workspace_role','agent','email',v_email,'phone',candidate.phone,'expires_at',now()+interval '14 days','metadata',jsonb_build_object('source','recruitment_activation','recruitment_lead_id',candidate.id,'first_name',split_part(candidate.name,' ',1),'last_name',trim(substr(candidate.name,length(split_part(candidate.name,' ',1))+1)),'mobile',candidate.phone,'role','agent','role_label','Agent','organisation_name',coalesce(org_json->>'display_name',org_json->>'name'))));
  if result->>'success' is distinct from 'true' and result->>'code' is distinct from 'duplicate_pending_invite' then raise exception 'Agent invitation could not be prepared. Check workspace invitation authority'; end if;
  invite_id:=(result->>'invite_id')::uuid;
  if invite_id is null then raise exception 'Agent invitation could not be prepared'; end if;
  return query update public.recruitment_leads set activation_json=jsonb_build_object('state','awaiting_acceptance','inviteId',invite_id,'notes',trim(p_notes),'confirmed',true) where id=candidate.id returning *;
end;
$$;
revoke all on function public.recruitment_activate_agent(uuid,uuid,integer,text,boolean) from public,anon;
grant execute on function public.recruitment_activate_agent(uuid,uuid,integer,text,boolean) to authenticated;
commit;
