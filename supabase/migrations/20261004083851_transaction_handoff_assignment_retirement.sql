begin;
alter table public.transaction_handoffs add column assignment_cleanup_status text not null default 'not_needed'
  check(assignment_cleanup_status in ('not_needed','retired','review_required'));
create table handoff_private.retired_partner_lanes (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_type text not null,
  organisation_id uuid not null,
  actor_ids uuid[] not null default '{}',
  retired boolean not null default true,
  retired_at timestamptz not null default now(),
  primary key(transaction_id,role_type,organisation_id)
);
create table handoff_private.retired_partner_invitations (
  invitation_id uuid primary key references public.transaction_partner_invitations(id) on delete cascade,
  retired_at timestamptz not null default now()
);
create table handoff_private.retired_portal_tokens (
  token_digest text primary key,retired_at timestamptz not null default now()
);
create table handoff_private.retired_access_grants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  access_id uuid not null,
  user_id uuid not null,
  role_type text not null,
  invitation_id uuid not null,
  organisation_id uuid not null,
  retired_at timestamptz not null default now(),
  unique(access_id,invitation_id)
);
create table handoff_private.retired_native_records (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_type text not null,organisation_id uuid not null,record_type text not null,record_id uuid not null,
  prior_state jsonb not null,retired_at timestamptz not null default now()
);
alter table handoff_private.retired_partner_lanes enable row level security;
alter table handoff_private.retired_partner_invitations enable row level security;
alter table handoff_private.retired_portal_tokens enable row level security;
alter table handoff_private.retired_access_grants enable row level security;
alter table handoff_private.retired_native_records enable row level security;
revoke all on handoff_private.retired_partner_lanes,handoff_private.retired_partner_invitations,handoff_private.retired_access_grants,handoff_private.retired_native_records,handoff_private.retired_portal_tokens from public,anon,authenticated;

-- Preserve each environment's access rules and original public function OIDs.
-- Existing RLS dependencies must continue calling the guarded public functions.
do $copy$
declare signature text; definition text; name text;
begin
  foreach signature in array array['bridge_can_access_transaction_spine(uuid)',
    'bridge_can_access_bond_application_scope(uuid)', 'bridge_lookup_partner_portal_by_token(text)',
    'bridge_activate_partner_portal_onboarding(text,jsonb)',
    'bridge_accept_transaction_partner_invitation(text,jsonb,uuid)','bridge_get_partner_handoff_invitation(text)'] loop
    name:=split_part(signature,'(',1);
    definition:=pg_get_functiondef(('public.'||signature)::regprocedure);
    definition:=replace(definition,'FUNCTION public.'||name||'(','FUNCTION handoff_private.'||name||'_before_retirement(');
    if definition=pg_get_functiondef(('public.'||signature)::regprocedure) then raise exception 'Could not preserve handoff access function'; end if;
    execute definition;
  end loop;
end $copy$;

-- An old invitation remains as evidence, but cannot nominate or restore access.
do $reconcile$
declare original text; revised text;
begin
  original:=pg_get_functiondef('handoff_private.reconcile(uuid)'::regprocedure);
  revised:=replace(original,'where i.transaction_id=p_transaction_id and i.role_type=lane',
    'where i.transaction_id=p_transaction_id and i.role_type=lane and not exists(select 1 from handoff_private.retired_partner_invitations retired where retired.invitation_id=i.id)');
  if revised=original then raise exception 'Could not guard retired handoff invitations'; end if;
  execute revised;
end $reconcile$;

create function handoff_private.retired_lane(p_tx uuid,p_role text,p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from handoff_private.retired_partner_lanes r where r.transaction_id=p_tx and r.role_type=p_role and r.organisation_id=p_org and r.retired);
$$;
create function handoff_private.actor_from_retired_org(p_tx uuid,p_role text,p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from handoff_private.retired_partner_lanes r
    where r.transaction_id=p_tx and r.role_type=p_role and r.organisation_id=p_org and r.retired
      and (auth.uid()=any(r.actor_ids) or exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=auth.uid())
        or exists(select 1 from public.attorney_firm_members m join public.attorney_firms f on f.id=m.firm_id where f.organisation_id=p_org and m.user_id=auth.uid())));
$$;
create function handoff_private.retired_actor_only(p_tx uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from handoff_private.retired_partner_lanes r where r.transaction_id=p_tx
    and handoff_private.actor_from_retired_org(p_tx,r.role_type,r.organisation_id))
  and not public.bridge_transaction_scope_is_internal_user()
  and not exists(select 1 from public.transactions t where t.id=p_tx and (auth.uid()::text in
    (to_jsonb(t)->>'owner_user_id',to_jsonb(t)->>'assigned_user_id',to_jsonb(t)->>'created_by')
    or exists(select 1 from public.organisation_users u where u.organisation_id=t.organisation_id and u.user_id=auth.uid() and u.status='active')))
  and not exists(select 1 from public.transaction_user_access a where a.transaction_id=p_tx and a.user_id=auth.uid())
  and not exists(select 1 from public.transaction_participants p where p.transaction_id=p_tx and p.status='active' and p.removed_at is null
    and (p.user_id=auth.uid() or nullif(to_jsonb(p)->>'assigned_user_id','')::uuid=auth.uid()))
  and not exists(select 1 from public.transaction_role_players p where p.transaction_id=p_tx and p.status='active' and p.removed_at is null
    and (p.user_id=auth.uid() or p.assigned_user_id=auth.uid()))
  and not exists(select 1 from public.transaction_handoffs h join public.organisation_users u on u.organisation_id=h.destination_organisation_id
    where h.transaction_id=p_tx and h.required and h.nomination_status='nominated' and u.user_id=auth.uid() and u.status='active'
      and not handoff_private.retired_lane(p_tx,h.role_type,h.destination_organisation_id));
$$;
create or replace function public.bridge_can_access_transaction_spine(target_transaction_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not handoff_private.retired_actor_only(target_transaction_id)
    and handoff_private.bridge_can_access_transaction_spine_before_retirement(target_transaction_id);
$$;
create or replace function public.bridge_can_access_bond_application_scope(application_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.transaction_bond_applications a where a.id=application_id
    and handoff_private.actor_from_retired_org(a.transaction_id,'bond_originator',a.assigned_organisation_id))
    and handoff_private.bridge_can_access_bond_application_scope_before_retirement(application_id);
$$;
create or replace function public.bridge_lookup_partner_portal_by_token(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from handoff_private.retired_portal_tokens r where r.token_digest=md5(trim(p_token)))
    or exists(select 1 from public.transaction_partner_assignments a where a.portal_token=trim(p_token) and a.assignment_status in ('cancelled','declined','completed'))
    or exists(select 1 from public.invites i where i.token=trim(p_token) and i.status in ('revoked','expired')) then
    return jsonb_build_object('success',false,'code','partner_assignment_retired'); end if;
  return handoff_private.bridge_lookup_partner_portal_by_token_before_retirement(p_token);
end $$;
create or replace function public.bridge_activate_partner_portal_onboarding(p_token text,p_profile jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.bridge_lookup_partner_portal_by_token(p_token);
  if result->>'code'='partner_assignment_retired' then return result; end if;
  return handoff_private.bridge_activate_partner_portal_onboarding_before_retirement(p_token,p_profile);
end $$;
create or replace function public.bridge_accept_transaction_partner_invitation(p_token text,p_profile jsonb default '{}',p_organisation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from handoff_private.retired_partner_invitations r where r.invitation_id=handoff_private.partner_invitation_id(p_token)) then
    return jsonb_build_object('success',false,'code','nomination_changed'); end if;
  return handoff_private.bridge_accept_transaction_partner_invitation_before_retirement(p_token,p_profile,p_organisation_id);
end $$;
create or replace function public.bridge_get_partner_handoff_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from handoff_private.retired_partner_invitations r where r.invitation_id=handoff_private.partner_invitation_id(p_token)) then
    return jsonb_build_object('ok',false,'reason','superseded'); end if;
  return handoff_private.bridge_get_partner_handoff_invitation_before_retirement(p_token);
end $$;

create function handoff_private.retire_partner_lane(p_tx uuid,p_role text,p_org uuid,p_actors uuid[] default '{}',p_invitations uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare actors uuid[]; invitations uuid[]; progressed boolean; tx public.transactions; previous_guard text;
begin
  if p_org is null and not exists(select 1 from unnest(p_invitations) i where i is not null) then return; end if;
  select * into tx from public.transactions where id=p_tx for no key update;
  if not found then return; end if;
  previous_guard:=current_setting('arch9.handoff_retiring',true);
  perform set_config('arch9.handoff_retiring','true',true);
  select coalesce(array_agg(distinct actor),'{}') into actors from (
    select unnest(p_actors) actor
    union select user_id actor from public.organisation_users where organisation_id=p_org
    union select i.accepted_user_id from public.transaction_partner_invitations i where i.transaction_id=p_tx and i.role_type=p_role and i.organisation_id=p_org
    union select user_id from public.transaction_role_players p where p.transaction_id=p_tx and p.role_type=p_role and coalesce(p.assigned_organisation_id,p.partner_organisation_id,p.organisation_id)=p_org
  ) people where actor is not null;
  if p_org is not null then
    insert into handoff_private.retired_partner_lanes(transaction_id,role_type,organisation_id,actor_ids) values(p_tx,p_role,p_org,actors)
      on conflict(transaction_id,role_type,organisation_id) do update set retired=true,retired_at=now(),
        actor_ids=handoff_private.retired_partner_lanes.actor_ids||excluded.actor_ids;
  end if;
  select coalesce(array_agg(i.id),'{}') into invitations from public.transaction_partner_invitations i
    where i.transaction_id=p_tx and i.role_type=p_role and (i.organisation_id=p_org or i.id=any(p_invitations)
      or exists(select 1 from public.transaction_role_players r where r.transaction_partner_invitation_id=i.id and coalesce(r.assigned_organisation_id,r.partner_organisation_id,r.organisation_id)=p_org));
  insert into handoff_private.retired_partner_invitations(invitation_id) select unnest(invitations) on conflict do nothing;
  insert into handoff_private.retired_access_grants(transaction_id,access_id,user_id,role_type,invitation_id,organisation_id)
    select a.transaction_id,a.id,a.user_id,a.access_role,a.created_by_invitation_id,p_org from public.transaction_user_access a
      where a.transaction_id=p_tx and a.access_role=p_role and a.created_by_invitation_id=any(invitations) and p_org is not null on conflict do nothing;
  delete from public.transaction_user_access where transaction_id=p_tx and access_role=p_role and created_by_invitation_id=any(invitations);
  update public.transaction_participants set status='removed',removed_at=coalesce(removed_at,now()),updated_at=now()
    where transaction_id=p_tx and transaction_role=p_role and partner_organisation_id=p_org and removed_at is null;
  update public.transaction_role_players set status='removed',assignment_status='removed',removed_at=coalesce(removed_at,now()),updated_at=now()
    where transaction_id=p_tx and role_type=p_role and coalesce(assigned_organisation_id,partner_organisation_id,organisation_id)=p_org
      and coalesce(status,'') not in ('removed','declined','rejected');
  insert into handoff_private.retired_portal_tokens(token_digest)
    select md5(portal_token) from public.transaction_partner_assignments
      where transaction_id=p_tx and partner_role=p_role and partner_organisation_id=p_org
        and assignment_status not in ('cancelled','declined','completed') and portal_token is not null on conflict do nothing;
  update public.transaction_partner_assignments set portal_token=gen_random_uuid()::text,
    assignment_status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now()
    where transaction_id=p_tx and partner_role=p_role and partner_organisation_id=p_org and assignment_status not in ('cancelled','declined','completed');
  update public.invites set status='revoked',revoked_at=coalesce(revoked_at,now()),updated_at=now()
    where target_transaction_id=p_tx and (coalesce(metadata->>'transaction_partner_invitation_id',metadata->>'transactionPartnerInvitationId') in (select unnest(invitations)::text)
      or id in(select onboarding_invite_id from public.transaction_partner_assignments where transaction_id=p_tx and partner_role=p_role and partner_organisation_id=p_org))
      and status in ('pending','accepted');
  if p_role='bond_originator' then
    select exists(select 1 from public.transaction_bond_applications a where a.transaction_id=p_tx and a.assigned_organisation_id=p_org
      and (a.application_type='bank_application' or a.status not in ('pending','draft') or a.assignment_status in ('consultant_assigned','fully_assigned') or coalesce(to_jsonb(a)->>'assigned_user_id',to_jsonb(a)->>'assigned_branch_id',to_jsonb(a)->>'assigned_region_id',to_jsonb(a)->>'assigned_team_id',to_jsonb(a)->>'assigned_workspace_unit_id') is not null)) into progressed;
    insert into handoff_private.retired_native_records(transaction_id,role_type,organisation_id,record_type,record_id,prior_state)
      select p_tx,p_role,p_org,'bond_application',id,jsonb_build_object('status',status,'assignmentStatus',assignment_status,'assignedOrganisationId',assigned_organisation_id)
      from public.transaction_bond_applications where transaction_id=p_tx and application_type='originator_intake' and assigned_organisation_id=p_org;
    update public.transaction_bond_applications set assignment_status='inactive'
      where transaction_id=p_tx and application_type='originator_intake' and assigned_organisation_id=p_org;
    update public.transactions set bond_workspace_id=null,bond_assignment_status=null,bond_assignment_source=null,updated_at=now()
      where id=p_tx and bond_workspace_id=p_org;
  else
    progressed:=false;
    insert into handoff_private.retired_native_records(transaction_id,role_type,organisation_id,record_type,record_id,prior_state)
      select p_tx,p_role,p_org,'attorney_assignment',a.id,jsonb_build_object('status',a.status,'assignmentStatus',a.assignment_status,'firmAcceptanceStatus',a.firm_acceptance_status)
      from public.transaction_attorney_assignments a join public.attorney_firms f on f.id=coalesce(a.attorney_firm_id,a.firm_id)
      where a.transaction_id=p_tx and a.attorney_role=p_role and f.organisation_id=p_org;
    update public.transaction_attorney_assignments a set assignment_status='removed',status='removed',updated_at=now()
      from public.attorney_firms f where a.transaction_id=p_tx and a.attorney_role=p_role
        and f.id=coalesce(a.attorney_firm_id,a.firm_id) and f.organisation_id=p_org and coalesce(a.assignment_status,a.status,'')<>'removed';
  end if;
  update public.transaction_handoffs set assignment_cleanup_status=case when progressed or assignment_cleanup_status='review_required' then 'review_required' else 'retired' end
    where transaction_id=p_tx and role_type=p_role;
  perform handoff_private.reconcile(p_tx);
  insert into public.transaction_events(transaction_id,event_type,event_data) values(p_tx,'organisation_handoff_retired',
    jsonb_build_object('roleType',p_role,'organisationId',p_org,'visibility','client_visible','audience','buyer',
      'title','Previous partner handoff retired','description','The previous organisation assignment has ended. Its matter records and delivery history are retained.','reviewRequired',progressed));
  perform set_config('arch9.handoff_retiring',coalesce(previous_guard,''),true);
end $$;

create function handoff_private.roleplayer_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
declare former uuid; destination uuid;
begin
  if current_setting('arch9.handoff_retiring',true)='true' then return null; end if;
  if tg_op<>'INSERT' and old.role_type in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator') then
    former:=coalesce(old.assigned_organisation_id,old.partner_organisation_id,old.organisation_id);
    if tg_op='DELETE' or old.role_type<>new.role_type or former is distinct from coalesce(new.assigned_organisation_id,new.partner_organisation_id,new.organisation_id)
      or coalesce(new.status,'') in ('removed','declined','rejected','inactive','cancelled') or new.removed_at is not null then
      if not exists(select 1 from public.transaction_role_players r where r.transaction_id=old.transaction_id and r.role_type=old.role_type
        and coalesce(r.assigned_organisation_id,r.partner_organisation_id,r.organisation_id)=former and r.status in ('selected','active') and r.removed_at is null) then
        perform handoff_private.retire_partner_lane(old.transaction_id,old.role_type,former,array[old.user_id,old.assigned_user_id],array[old.transaction_partner_invitation_id]);
      end if;
    end if;
  end if;
  if tg_op<>'DELETE' and new.role_type in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator')
    and new.status in ('selected','active') and new.removed_at is null then
    destination:=coalesce(new.assigned_organisation_id,new.partner_organisation_id,new.organisation_id);
    if exists(select 1 from public.transactions t where t.id=new.transaction_id and
      (lower(coalesce(to_jsonb(t)->>'status','')) in ('cancelled','canceled','terminated','archived','completed')
       or nullif(to_jsonb(t)->>'archived_at','') is not null or coalesce(to_jsonb(t)->>'is_archived','false')='true')) then
      perform handoff_private.retire_partner_lane(new.transaction_id,new.role_type,destination,
        array[new.user_id,new.assigned_user_id],array[new.transaction_partner_invitation_id]);
      return null;
    end if;
    if tg_op='UPDATE' and former is distinct from destination then
      update public.transaction_role_players r set
        transaction_partner_invitation_id=case when r.transaction_partner_invitation_id is distinct from old.transaction_partner_invitation_id then r.transaction_partner_invitation_id end,
        partner_connection_id=case when r.partner_connection_id is distinct from old.partner_connection_id then r.partner_connection_id end,
        user_id=case when exists(select 1 from public.organisation_users u where u.organisation_id=destination and u.user_id=r.user_id and u.status='active') then r.user_id end,
        assigned_user_id=case when exists(select 1 from public.organisation_users u where u.organisation_id=destination and u.user_id=r.assigned_user_id and u.status='active') then r.assigned_user_id end
        where r.id=new.id;
    end if;
    update handoff_private.retired_partner_lanes set retired=false where transaction_id=new.transaction_id and role_type=new.role_type and organisation_id=destination;
  end if;
  return null;
end $$;
create trigger a_handoff_roleplayer_retirement after insert or update or delete on public.transaction_role_players
  for each row execute function handoff_private.roleplayer_retirement();

-- Prevent the pre-existing materialiser from recreating removed/declined rows.
do $materialiser$
declare original text; revised text;
begin
  original:=pg_get_functiondef('public.bridge_materialize_transaction_partner_workspace_assignment()'::regprocedure);
  revised:=replace(original,$match$coalesce(new.status, '') in ('removed', 'cancelled')$match$,
    $replace$(coalesce(new.status, '') in ('removed', 'cancelled', 'declined', 'rejected', 'inactive') or new.removed_at is not null or not exists(select 1 from public.transaction_role_players current_player where current_player.id=new.id and current_player.status in ('selected','active') and current_player.removed_at is null))$replace$);
  if revised=original then raise exception 'Could not guard retired partner materialisation'; end if;
  revised:=replace(revised,'new.partner_connection_id',
    '(select r.partner_connection_id from public.transaction_role_players r where r.id=new.id)');
  execute revised;
end $materialiser$;

-- Reuse a pristine intake only; progressed finance work always needs review.
create or replace function handoff_private.prepare_retirement_intake() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('selected','active') and new.role_type='bond_originator' and new.removed_at is null then
    update public.transaction_bond_applications a set assigned_organisation_id=coalesce(new.assigned_organisation_id,new.partner_organisation_id,new.organisation_id),
      assignment_status='organisation_queue'
      where a.transaction_id=new.transaction_id and a.application_type='originator_intake' and a.assignment_status='inactive'
        and a.status in ('pending','draft') and not exists(select 1 from public.transaction_bond_applications b where b.transaction_id=a.transaction_id and b.application_type='bank_application')
        and exists(select 1 from public.transaction_handoffs h where h.transaction_id=a.transaction_id and h.role_type='bond_originator' and h.assignment_cleanup_status='retired');
  end if;
  return null;
end $$;
create trigger b_handoff_retirement_intake after insert or update on public.transaction_role_players
  for each row execute function handoff_private.prepare_retirement_intake();

create function handoff_private.block_retirement_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.assignment_cleanup_status='review_required' then
    update public.transaction_handoff_dispatch_attempts a set status='superseded',reason='retirement_review_required',completed_at=now()
      from public.transaction_handoff_dispatch_jobs j where a.job_id=j.id and j.handoff_id=new.id and j.generation=new.dispatch_generation and a.status='claimed';
    update public.transaction_handoff_dispatch_jobs set status='blocked',reason='retirement_review_required',lease_token=null,lease_expires_at=null
      where handoff_id=new.id and generation=new.dispatch_generation and status in ('queued','retry','leased');
    if found then perform handoff_private.refresh_dispatch(new.id); end if;
  end if;
  return null;
end $$;
create trigger z_handoff_retirement_review after insert or update on public.transaction_handoffs
  for each row execute function handoff_private.block_retirement_review();

create function handoff_private.closed_matter_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
declare lane record;
begin
  if current_setting('arch9.handoff_retiring',true)='true' then return null; end if;
  if lower(coalesce(to_jsonb(new)->>'status','')) in ('cancelled','canceled','terminated','archived','completed')
    or nullif(to_jsonb(new)->>'archived_at','') is not null or coalesce(to_jsonb(new)->>'is_archived','false')='true' then
    for lane in select distinct role_type,coalesce(assigned_organisation_id,partner_organisation_id,organisation_id) org
      from public.transaction_role_players where transaction_id=new.id and status in ('selected','active') and removed_at is null
      union select partner_role,partner_organisation_id from public.transaction_partner_assignments
        where transaction_id=new.id and assignment_status not in ('cancelled','declined','completed') loop
      perform handoff_private.retire_partner_lane(new.id,lane.role_type,lane.org);
    end loop;
  end if;
  return null;
end $$;
create trigger a_handoff_closed_matter_retirement after update on public.transactions
  for each row execute function handoff_private.closed_matter_retirement();

create function handoff_private.actor_from_retired_firm(p_tx uuid,p_role text,p_firm uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select handoff_private.actor_from_retired_org(p_tx,p_role,f.organisation_id)
    from public.attorney_firms f where f.id=p_firm),false);
$$;
create function handoff_private.retired_portal_actor(p_assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select handoff_private.actor_from_retired_org(a.transaction_id,a.partner_role,a.partner_organisation_id)
    from public.transaction_partner_assignments a where a.id=p_assignment),false);
$$;
-- Fence direct portal child reads and writes as well as token-based RPCs.
do $portal_policies$
declare child text;
begin
  foreach child in array array['partner_portal_uploads','partner_portal_document_requests','partner_portal_comments',
    'partner_portal_support_tickets','partner_portal_audit_logs','partner_portal_notifications',
    'bond_partner_portal_documents','bond_partner_portal_document_requests','bond_partner_portal_comments',
    'bond_partner_portal_support_tickets','bond_partner_portal_audit','bond_partner_portal_notifications'] loop
    if to_regclass('public.'||child) is not null then
      execute format('create policy retired_handoff_portal_access on public.%I as restrictive for all to authenticated using (not handoff_private.retired_portal_actor(transaction_partner_assignment_id)) with check (not handoff_private.retired_portal_actor(transaction_partner_assignment_id))',child);
    end if;
  end loop;
end $portal_policies$;
create policy retired_handoff_assignment_access on public.transaction_partner_assignments as restrictive for all to authenticated
  using (not handoff_private.actor_from_retired_org(transaction_id,partner_role,partner_organisation_id))
  with check (not handoff_private.actor_from_retired_org(transaction_id,partner_role,partner_organisation_id));
-- Alternate permissive policies cannot keep stale partner-only access alive.
create policy retired_handoff_transaction_visibility on public.transactions as restrictive for select to authenticated
  using (not handoff_private.retired_actor_only(id));
create policy retired_handoff_attorney_visibility on public.transaction_attorney_assignments as restrictive for select to authenticated
  using (not handoff_private.actor_from_retired_firm(transaction_id,attorney_role,coalesce(attorney_firm_id,firm_id)));
create policy retired_handoff_bond_visibility on public.transaction_bond_applications as restrictive for select to authenticated
  using (not handoff_private.actor_from_retired_org(transaction_id,'bond_originator',assigned_organisation_id));

revoke all on function public.bridge_can_access_transaction_spine(uuid),public.bridge_can_access_bond_application_scope(uuid),
 public.bridge_accept_transaction_partner_invitation(text,jsonb,uuid) from public,anon;
grant execute on function public.bridge_can_access_transaction_spine(uuid),public.bridge_can_access_bond_application_scope(uuid),
 public.bridge_accept_transaction_partner_invitation(text,jsonb,uuid) to authenticated;
do $revoke_private$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='handoff_private' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $revoke_private$;
-- RLS expressions need these read-only predicates, never the mutating helpers.
grant usage on schema handoff_private to authenticated;
grant execute on function handoff_private.retired_actor_only(uuid),handoff_private.actor_from_retired_org(uuid,text,uuid),
 handoff_private.actor_from_retired_firm(uuid,text,uuid),handoff_private.retired_portal_actor(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
