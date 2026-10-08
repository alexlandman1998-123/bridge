begin;

-- Planned joining choices do not create membership, deliver messages or alter
-- application/review/contract evidence. Older records remain untouched.
alter table public.recruitment_leads
  add column joining_json jsonb not null default '{}' check (jsonb_typeof(joining_json) = 'object'),
  add column joining_invite_id uuid references public.invites(id);
create unique index recruitment_joining_invite_unique on public.recruitment_leads(joining_invite_id) where joining_invite_id is not null;
create index recruitment_joining_email_idx on public.recruitment_leads(organisation_id,lower(trim(email))) where email <> '';

-- Managers may inspect only the link-to-lead relationship. Sender fingerprints,
-- consent payloads, submission keys and applicant sessions remain private.
grant select(lead_id,link_id) on public.recruitment_application_receipts,public.recruitment_contact_receipts to authenticated;
create policy recruitment_application_joining_read on public.recruitment_application_receipts for select to authenticated using (
  exists(select 1 from public.recruitment_leads l where l.id=recruitment_application_receipts.lead_id)
);
create policy recruitment_contact_joining_read on public.recruitment_contact_receipts for select to authenticated using (
  exists(select 1 from public.recruitment_leads l where l.id=recruitment_contact_receipts.lead_id)
);

create function public.recruitment_assert_joining_manager(p_organisation_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.organisation_users m
    where m.organisation_id=p_organisation_id and m.user_id=auth.uid()
    and m.status='active' and m.role in ('principal','admin','super_admin')) then
    raise exception 'Organisation management access required' using errcode='42501';
  end if;
end;
$$;

create function public.recruitment_find_joining_matches(p_organisation_id uuid,p_email text,p_exclude_lead_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_email text:=lower(trim(coalesce(p_email,''))); result jsonb;
begin
  perform public.recruitment_assert_joining_manager(p_organisation_id);
  if v_email='' then return jsonb_build_object('leads','[]'::jsonb,'members','[]'::jsonb,'invites','[]'::jsonb); end if;
  select jsonb_build_object(
    'leads',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'status',l.status)) from public.recruitment_leads l
      where l.organisation_id=p_organisation_id and l.email<>'' and lower(trim(l.email))=v_email and l.id is distinct from p_exclude_lead_id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'userId',m.user_id,'role',coalesce(nullif(m.workspace_role,''),nullif(m.organisation_role,''),m.role))) from public.organisation_users m
      where m.organisation_id=p_organisation_id and lower(trim(m.email))=v_email and m.status='active'),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'type',i.invite_type,'role',i.target_workspace_role,'branchId',i.target_branch_id,'expiresAt',i.expires_at,
      'linkedLeadId',(select l.id from public.recruitment_leads l where l.organisation_id=p_organisation_id and (l.joining_invite_id=i.id or l.activation_json->>'inviteId'=i.id::text) limit 1))) from public.invites i
      where i.target_workspace_id=p_organisation_id and lower(trim(i.email))=v_email and i.status='pending'
      and i.invite_type in ('workspace_invite','branch_invite') and (i.expires_at is null or i.expires_at>now())),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.recruitment_joining_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb:=new.joining_json; origin jsonb; matches jsonb; choice text; invitation public.invites%rowtype;
begin
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
      and lower(trim(i.email))=lower(trim(new.email)) and i.invite_type in ('workspace_invite','branch_invite') and i.target_workspace_role in ('agent','senior_agent','sales_agent') for update;
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
create trigger g_recruitment_joining_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_joining_guard();

create function public.recruitment_joining_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.joining_json is distinct from old.joining_json or new.joining_invite_id is distinct from old.joining_invite_id then
    new.activity_json:=new.activity_json||jsonb_build_array(jsonb_build_object('type','joining_choices_saved','at',now(),'actorId',auth.uid()));
  end if;
  return new;
end;
$$;
create trigger z_recruitment_joining_audit before update on public.recruitment_leads for each row execute function public.recruitment_joining_audit();

create function public.recruitment_create_joining_lead(p_organisation_id uuid,p_lead jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; matches jsonb; v_email text:=lower(trim(coalesce(p_lead->>'email',''))); v_key uuid:=(p_lead->>'intake_key')::uuid;
begin
  perform public.recruitment_assert_joining_manager(p_organisation_id);
  if v_key is null then raise exception 'A recruitment receipt key is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text||':'||coalesce(nullif(v_email,''),v_key::text),0));
  select * into candidate from public.recruitment_leads l where l.organisation_id=p_organisation_id and l.intake_key=v_key;
  if candidate.id is not null then return jsonb_build_object('outcome','reused','lead',to_jsonb(candidate)); end if;
  matches:=public.recruitment_find_joining_matches(p_organisation_id,v_email);
  if jsonb_array_length(matches->'members')>0 then return jsonb_build_object('outcome','existing_member','matches',matches); end if;
  if jsonb_array_length(matches->'leads')+jsonb_array_length(matches->'invites')>0 and p_lead->'joining_json'->'reviewedMatches' is distinct from 'true'::jsonb then
    return jsonb_build_object('outcome','review_required','matches',matches);
  end if;
  insert into public.recruitment_leads(organisation_id,name,email,phone,area,source,details_json,intake_key,joining_json,joining_invite_id)
    values(p_organisation_id,trim(p_lead->>'name'),v_email,trim(coalesce(p_lead->>'phone','')),trim(coalesce(p_lead->>'area','')),
      trim(coalesce(p_lead->>'source','Manual')),coalesce(p_lead->'details_json','{}'::jsonb),v_key,
      coalesce(p_lead->'joining_json','{}'::jsonb),nullif(p_lead->>'joining_invite_id','')::uuid) returning * into candidate;
  return jsonb_build_object('outcome','created','lead',to_jsonb(candidate));
end;
$$;

create function public.recruitment_joining_options(p_organisation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform public.recruitment_assert_joining_manager(p_organisation_id);
  return jsonb_build_object(
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name) from public.organisation_branches b where b.organisation_id=p_organisation_id and b.is_active),'[]'::jsonb),
    'commissionStructures',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name) from public.organisation_commission_structures c where c.organisation_id=p_organisation_id and c.is_active),'[]'::jsonb));
end;
$$;

create function public.recruitment_joining_connections(p_organisation_id uuid,p_lead_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype; invitation_ids uuid[];
begin
  perform public.recruitment_assert_joining_manager(p_organisation_id);
  select * into candidate from public.recruitment_leads l where l.organisation_id=p_organisation_id and l.id=p_lead_id;
  if candidate.id is null then raise exception 'Recruitment record not found or access removed' using errcode='42501'; end if;
  select array_agg(distinct id) into invitation_ids from (
    select candidate.joining_invite_id id union select nullif(candidate.activation_json->>'inviteId','')::uuid
    union select (v->>'inviteId')::uuid from jsonb_array_elements(coalesce(candidate.activation_json->'history','[]'::jsonb)) v
  ) ids where id is not null;
  return jsonb_build_object(
    'applications',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'channel',l.channel,'createdAt',l.created_at,'expiresAt',l.expires_at,'revokedAt',l.revoked_at,'submittedAt',coalesce(l.submitted_at,candidate.application_submitted_at)) order by l.created_at)
      from public.recruitment_intake_links l where l.organisation_id=p_organisation_id and (l.lead_id=p_lead_id or l.id in (
        select r.link_id from public.recruitment_application_receipts r where r.lead_id=p_lead_id
        union select r.link_id from public.recruitment_contact_receipts r where r.lead_id=p_lead_id
      ))),'[]'::jsonb),
    'workspace',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'type',i.invite_type,'status',i.status,'expiresAt',i.expires_at,'branchId',i.target_branch_id) order by i.created_at)
      from public.invites i where i.target_workspace_id=p_organisation_id and i.id=any(invitation_ids)),'[]'::jsonb));
end;
$$;

revoke all on function public.recruitment_joining_guard(),public.recruitment_joining_audit() from public,anon,authenticated,service_role;
revoke all on function public.recruitment_assert_joining_manager(uuid),public.recruitment_find_joining_matches(uuid,text,uuid),public.recruitment_create_joining_lead(uuid,jsonb),public.recruitment_joining_options(uuid),public.recruitment_joining_connections(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.recruitment_assert_joining_manager(uuid),public.recruitment_find_joining_matches(uuid,text,uuid),public.recruitment_create_joining_lead(uuid,jsonb),public.recruitment_joining_options(uuid),public.recruitment_joining_connections(uuid,uuid) to authenticated;
commit;
