begin;

-- Retain a digest of consumed, high-entropy legacy links so the original
-- recipient can resume after a lost response. This is never a new access grant.
create table handoff_private.invitation_bindings (
  invitation_id uuid primary key references public.transaction_partner_invitations(id) on delete cascade,
  legacy_token_digest text unique,
  -- Immutable actor/destination identifiers survive account/org retirement.
  user_id uuid not null,
  organisation_id uuid not null,
  bound_at timestamptz not null default now()
);
alter table handoff_private.invitation_bindings enable row level security;
revoke all on handoff_private.invitation_bindings from public,anon,authenticated,service_role;

create function handoff_private.partner_invitation_id(p_token text) returns uuid
language sql stable security definer set search_path='' as $$
  select (array_agg(id))[1] from (
    select t.id from public.transaction_partner_invitations t where t.invitation_token::text=nullif(trim(p_token),'')
    union
    select t.id from public.invites i join public.transaction_partner_invitations t
      on t.id::text=coalesce(i.metadata->>'transaction_partner_invitation_id',i.metadata->>'transactionPartnerInvitationId')
      and i.target_transaction_id=t.transaction_id and lower(trim(i.email))=lower(trim(t.email))
      where i.token=nullif(trim(p_token),'') and i.invite_type='transaction_invite'
        and i.status in ('pending','accepted') and (i.status='accepted' or i.expires_at>now())
    union
    select b.invitation_id from handoff_private.invitation_bindings b
      where b.legacy_token_digest=md5(nullif(trim(p_token),''))
  ) candidates having count(*)=1;
$$;

create function handoff_private.can_bind_partner_organisation(p_organisation uuid,p_role text,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and p_organisation<>p_owner and exists(
    select 1 from public.organisation_users u join public.organisations o on o.id=u.organisation_id
    where u.user_id=auth.uid() and u.organisation_id=p_organisation
      and coalesce(to_jsonb(u)->>'membership_status',u.status,'pending')='active'
      and lower(coalesce(nullif(to_jsonb(u)->>'workspace_role',''),nullif(to_jsonb(u)->>'organisation_role',''),u.role,''))
        in ('owner','principal','admin','organisation_admin','workspace_admin','firm_admin','director_partner','director','partner','hq_manager','bond_manager','manager')
      and coalesce(to_jsonb(u)->>'scope_level','workspace_hq') in ('workspace_hq','organisation','organization')
      and (to_jsonb(u)->>'scope_level' is not null or coalesce(nullif(to_jsonb(u)->>'branch_id',''),nullif(to_jsonb(u)->>'primary_branch_id','')) is null)
      and case when p_role='bond_originator' then o.type='bond_originator'
        when p_role in ('transfer_attorney','bond_attorney','cancellation_attorney') then o.type in ('attorney_firm','attorney')
          and exists(select 1 from public.attorney_firms f where f.organisation_id=o.id)
        else false end
  );
$$;

create function public.bridge_get_partner_handoff_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.transaction_partner_invitations; tx public.transactions; choices jsonb; state text;
begin
  select * into i from public.transaction_partner_invitations where id=handoff_private.partner_invitation_id(p_token);
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if i.role_type not in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator') then
    return jsonb_build_object('ok',false,'reason','unsupported_role'); end if;
  if i.status not in ('pending','accepted') then return jsonb_build_object('ok',false,'reason',i.status); end if;
  if i.status='pending' and i.expires_at<=now() then return jsonb_build_object('ok',false,'reason','expired'); end if;
  select * into tx from public.transactions where id=i.transaction_id;
  if lower(coalesce(to_jsonb(tx)->>'status','')) in ('cancelled','canceled','terminated','archived','completed')
    or nullif(to_jsonb(tx)->>'archived_at','') is not null or coalesce(to_jsonb(tx)->>'is_archived','false')='true' then
    return jsonb_build_object('ok',false,'reason','transaction_unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name,o.id),'[]') into choices
    from public.organisations o where lower(trim(coalesce(auth.jwt()->>'email','')))=lower(trim(i.email))
      and (i.status<>'accepted' or i.accepted_user_id=auth.uid())
      and handoff_private.can_bind_partner_organisation(o.id,i.role_type,tx.organisation_id)
      and (i.organisation_id is null or i.organisation_id=o.id);
  state:=case when i.status='accepted' and i.organisation_id is not null then 'bound'
    when i.status='accepted' then 'accepted_unbound' else 'pending' end;
  -- Pre-acceptance preview contains no buyer details, documents or bearer tokens.
  return jsonb_build_object('ok',true,'bindingState',state,'organisations',choices,'invitation',jsonb_build_object(
    'id',i.id,'roleType',i.role_type,'companyName',i.company_name,'email',i.email,'expiresAt',i.expires_at,
    'status',i.status,'organisationId',i.organisation_id,'invitedByOrganisation',(select name from public.organisations where id=tx.organisation_id)));
end $$;
revoke all on function public.bridge_get_partner_handoff_invitation(text) from public;
grant execute on function public.bridge_get_partner_handoff_invitation(text) to anon,authenticated;

-- Keep other invitation types on their existing implementation. The legacy
-- helpers are private and callable only through the guarded organisation flow.
alter function public.bridge_accept_transaction_partner_invitation(text,jsonb,uuid) set schema handoff_private;
alter function handoff_private.bridge_accept_transaction_partner_invitation(text,jsonb,uuid) rename to accept_transaction_partner_invitation_legacy;
revoke all on function handoff_private.accept_transaction_partner_invitation_legacy(text,jsonb,uuid) from public,anon,authenticated,service_role;

create function public.bridge_accept_transaction_partner_invitation(p_token text,p_profile jsonb default '{}',p_organisation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.transaction_partner_invitations; tx public.transactions; chosen uuid:=p_organisation_id;
  count_choices integer; result jsonb; repair jsonb; legacy_token uuid; canonical public.invites; target_invitation_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'code','not_authenticated'); end if;
  target_invitation_id:=handoff_private.partner_invitation_id(p_token);
  -- Lock the matter before invitation/roleplayer/register writes.
  select * into tx from public.transactions where transactions.id=(select transaction_id from public.transaction_partner_invitations where transaction_partner_invitations.id=target_invitation_id) for no key update;
  select * into i from public.transaction_partner_invitations where transaction_partner_invitations.id=target_invitation_id for update;
  if not found then return jsonb_build_object('success',false,'code','invitation_not_found'); end if;
  if i.role_type not in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator') then
    return handoff_private.accept_transaction_partner_invitation_legacy(p_token,p_profile,p_organisation_id); end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid()
    and lower(trim(u.email))=lower(trim(i.email))) then
    return jsonb_build_object('success',false,'code','email_mismatch'); end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
    return jsonb_build_object('success',false,'code','email_verification_required'); end if;
  if lower(trim(coalesce(auth.jwt()->>'email','')))= '' or lower(trim(auth.jwt()->>'email'))<>lower(trim(i.email)) then
    return jsonb_build_object('success',false,'code','email_mismatch'); end if;
  if tx.id is null or tx.organisation_id is null then return jsonb_build_object('success',false,'code','transaction_owner_missing'); end if;
  if lower(coalesce(to_jsonb(tx)->>'status','')) in ('cancelled','canceled','terminated','archived','completed')
    or nullif(to_jsonb(tx)->>'archived_at','') is not null or coalesce(to_jsonb(tx)->>'is_archived','false')='true' then
    return jsonb_build_object('success',false,'code','transaction_unavailable'); end if;
  if i.status not in ('pending','accepted') then return jsonb_build_object('success',false,'code','invitation_'||i.status); end if;
  if i.status='pending' and i.expires_at<=now() then return jsonb_build_object('success',false,'code','invitation_expired'); end if;
  if i.status='accepted' and i.accepted_user_id is distinct from auth.uid() then
    return jsonb_build_object('success',false,'code','invitation_accepted'); end if;
  if chosen is null then
    select count(*),(array_agg(o.id order by o.id))[1] into count_choices,chosen from public.organisations o
      where handoff_private.can_bind_partner_organisation(o.id,i.role_type,tx.organisation_id)
        and (i.organisation_id is null or i.organisation_id=o.id);
    if count_choices=0 then return jsonb_build_object('success',false,'code','organisation_required'); end if;
    if count_choices>1 then return jsonb_build_object('success',false,'code','organisation_selection_required'); end if;
  end if;
  if i.organisation_id is not null and i.organisation_id<>chosen then return jsonb_build_object('success',false,'code','wrong_workspace'); end if;
  perform 1 from public.organisation_users where organisation_id=chosen and user_id=auth.uid() for share;
  perform 1 from public.organisations where organisations.id=chosen for share;
  if not handoff_private.can_bind_partner_organisation(chosen,i.role_type,tx.organisation_id) then
    return jsonb_build_object('success',false,'code','organisation_authority_required'); end if;
  -- Refuse stale invitations or a different live nomination. No automatic
  -- reassignment or access cleanup is performed during signup.
  if exists(select 1 from public.transaction_handoffs h where h.transaction_id=i.transaction_id and h.role_type=i.role_type
    and (h.nomination_status='conflicting' or h.destination_organisation_id is not null and h.destination_organisation_id<>chosen))
    or exists(select 1 from public.transaction_partner_invitations n where n.transaction_id=i.transaction_id and n.role_type=i.role_type
    and (n.created_at,n.id)>(i.created_at,i.id)) or exists(select 1 from public.transaction_role_players r
      where r.transaction_id=i.transaction_id and r.role_type=i.role_type
        and coalesce(r.status,'') not in ('removed','cancelled','declined','rejected','inactive')
        and coalesce(r.assignment_status,'') not in ('removed','cancelled','declined','rejected','inactive')
        and (coalesce(nullif(to_jsonb(r)->>'assigned_organisation_id',''),nullif(to_jsonb(r)->>'partner_organisation_id',''),nullif(to_jsonb(r)->>'organisation_id','')) is not null
          and coalesce(nullif(to_jsonb(r)->>'assigned_organisation_id',''),nullif(to_jsonb(r)->>'partner_organisation_id',''),nullif(to_jsonb(r)->>'organisation_id',''))<>chosen::text
          or r.transaction_partner_invitation_id is distinct from i.id and lower(coalesce(r.email_address,''))<>lower(i.email)
            and coalesce(nullif(to_jsonb(r)->>'assigned_organisation_id',''),nullif(to_jsonb(r)->>'partner_organisation_id',''),nullif(to_jsonb(r)->>'organisation_id','')) is distinct from chosen::text)) then
    return jsonb_build_object('success',false,'code','nomination_changed'); end if;
  select * into canonical from public.invites c where c.token=trim(p_token) and c.invite_type='transaction_invite' for update;
  if canonical.id is not null and (canonical.status not in ('pending','accepted') or canonical.status='pending' and canonical.expires_at<=now()) then
    return jsonb_build_object('success',false,'code','invitation_expired'); end if;
  legacy_token:=i.invitation_token;
  if i.status='pending' then
    result:=handoff_private.accept_transaction_partner_invitation_legacy(legacy_token::text,
      coalesce(p_profile,'{}')||jsonb_build_object('role',case when i.role_type='bond_originator' then 'bond_originator' else 'attorney' end),chosen);
    if coalesce((result->>'success')::boolean,false)=false then return result; end if;
  else
    update public.transaction_partner_invitations set organisation_id=chosen where transaction_partner_invitations.id=i.id and organisation_id is null;
  end if;
  -- The existing reconciliation writes missing access, participant, relationship
  -- and roleplayer records. Explicit choice above prevents its org inference.
  repair:=public.bridge_repair_transaction_partner_invitation_acceptance(i.id);
  if coalesce((repair->>'success')::boolean,false)=false then raise exception 'Partner binding could not be persisted' using errcode='P0001'; end if;
  insert into public.user_workspace_preferences(user_id,active_workspace_id,active_workspace_source)
    values(auth.uid(),chosen,'user_selected') on conflict(user_id) do update
      set active_workspace_id=excluded.active_workspace_id,active_workspace_source=excluded.active_workspace_source,updated_at=now();
  insert into handoff_private.invitation_bindings(invitation_id,legacy_token_digest,user_id,organisation_id)
    values(i.id,case when legacy_token is not null then md5(legacy_token::text) end,auth.uid(),chosen)
    on conflict(invitation_id) do nothing;
  if canonical.id is not null then
    update public.invites set status='accepted',accepted_by_user_id=auth.uid(),accepted_at=coalesce(accepted_at,now()),updated_at=now() where invites.id=canonical.id;
  end if;
  if to_regclass('public.signup_intents') is not null then
    update public.signup_intents set invite_token=null,updated_at=now()
      where auth_user_id=auth.uid() and invite_token=trim(p_token)
        and workspace_action in ('create_workspace','join_or_request_workspace') and source='invite_link';
  end if;
  return coalesce(result,'{}')||repair||jsonb_build_object('success',true,'bindingState','bound','deliveryConfirmed',false,
    'nextPath','/transactions/'||i.transaction_id::text,'transaction_id',i.transaction_id,'workspace_id',chosen);
end $$;
revoke all on function public.bridge_accept_transaction_partner_invitation(text,jsonb,uuid) from public,anon;
grant execute on function public.bridge_accept_transaction_partner_invitation(text,jsonb,uuid) to authenticated;

alter function public.bridge_accept_invite(text) set schema handoff_private;
alter function handoff_private.bridge_accept_invite(text) rename to accept_invite_legacy;
revoke all on function handoff_private.accept_invite_legacy(text) from public,anon,authenticated,service_role;
create function public.bridge_accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.invites; linked uuid;
begin
  select * into c from public.invites where token=trim(p_token);
  if c.invite_type='transaction_invite' and (coalesce(c.metadata,'{}') ? 'transaction_partner_invitation_id'
    or coalesce(c.metadata,'{}') ? 'transactionPartnerInvitationId') then
    linked:=handoff_private.partner_invitation_id(p_token);
    if linked is null then return jsonb_build_object('success',false,'code','invitation_not_found'); end if;
    if exists(select 1 from public.transaction_partner_invitations i where i.id=linked
      and i.role_type in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator')) then
      return public.bridge_accept_transaction_partner_invitation(p_token,'{}',null);
    end if;
  end if;
  return handoff_private.accept_invite_legacy(p_token);
end $$;
revoke all on function public.bridge_accept_invite(text) from public,anon;
grant execute on function public.bridge_accept_invite(text) to authenticated;
create function public.bridge_decline_partner_handoff_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.transaction_partner_invitations; target uuid;
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'code','not_authenticated'); end if;
  target:=handoff_private.partner_invitation_id(p_token);
  perform 1 from public.transactions where id=(select transaction_id from public.transaction_partner_invitations where id=target) for no key update;
  select * into i from public.transaction_partner_invitations where id=target for update;
  if not found then return jsonb_build_object('success',false,'code','invitation_not_found'); end if;
  if i.role_type not in ('transfer_attorney','bond_attorney','cancellation_attorney','bond_originator') then
    return jsonb_build_object('success',false,'code','unsupported_role'); end if;
  if i.status<>'pending' or i.expires_at<=now() then return jsonb_build_object('success',false,'code','invitation_unavailable'); end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and lower(trim(email))=lower(trim(i.email))) then
    return jsonb_build_object('success',false,'code','email_mismatch'); end if;
  update public.transaction_partner_invitations set status='declined',declined_at=now(),invitation_token=null,updated_at=now() where id=i.id;
  update public.invites set status='revoked',revoked_at=now(),revoked_by_user_id=auth.uid(),updated_at=now()
    where invite_type='transaction_invite' and target_transaction_id=i.transaction_id
      and coalesce(metadata->>'transaction_partner_invitation_id',metadata->>'transactionPartnerInvitationId')=i.id::text and status='pending';
  return jsonb_build_object('success',true,'transactionId',i.transaction_id,'invitationId',i.id);
end $$;
revoke all on function public.bridge_decline_partner_handoff_invitation(text) from public,anon;
grant execute on function public.bridge_decline_partner_handoff_invitation(text) to authenticated;
revoke all on function handoff_private.partner_invitation_id(text),handoff_private.can_bind_partner_organisation(uuid,text,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
