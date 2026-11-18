begin;

-- Sender configuration is managed by active organisation principals/owners.
-- Use the canonical active membership role; never trust browser role labels.
create function public.email_domain_can_manage(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and public.bridge_has_organisation_membership(p_organisation_id)
    and coalesce(public.bridge_membership_role(p_organisation_id) in ('principal','owner','super_admin'), false)
$$;
revoke all on function public.email_domain_can_manage(uuid) from public, anon;
grant execute on function public.email_domain_can_manage(uuid) to authenticated, service_role;

-- Remove legacy table-wide destructive privileges. Writes use guarded RPCs or
-- service-only provider reconciliation, including for principals.
revoke all on public.email_sender_identities, public.email_sending_domains from public, anon, authenticated;
grant select on public.email_sender_identities, public.email_sending_domains to authenticated;
grant all on public.email_sender_identities, public.email_sending_domains to service_role;
alter table public.email_sender_identities enable row level security;
alter table public.email_sending_domains enable row level security;
create policy email_domain_configuration_principal_read on public.email_sending_domains
  for select to authenticated using (public.email_domain_can_manage(organisation_id));
create policy email_sender_configuration_principal_read on public.email_sender_identities
  for select to authenticated using (public.email_domain_can_manage(organisation_id));
create policy email_domain_configuration_principal on public.email_sending_domains
  as restrictive for all to authenticated
  using (public.email_domain_can_manage(organisation_id))
  with check (public.email_domain_can_manage(organisation_id));
create policy email_sender_configuration_principal on public.email_sender_identities
  as restrictive for all to authenticated
  using (public.email_domain_can_manage(organisation_id))
  with check (public.email_domain_can_manage(organisation_id));

-- Report account activation independently of domain proof, even before an
-- organisation has its first policy. Do not enable accounts or raise limits.
create function public.email_domain_setup_status(p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; account public.email_campaign_account_limits%rowtype;
begin
  if not public.email_domain_can_manage(p_organisation_id) then
    raise exception 'Principal access is required to manage sending domains.' using errcode='42501';
  end if;
  select * into account from public.email_campaign_account_limits where singleton;
  select to_jsonb(p) into result from public.email_sending_policies p where organisation_id=p_organisation_id;
  result:=coalesce(result,'{}'::jsonb) || public.email_campaign_controls_status(p_organisation_id);
  return result || jsonb_build_object('account_blocker', case
    when result->>'account_ready'='true' then null
    when not coalesce(account.enabled,false) or coalesce(account.daily_limit,0)=0 or coalesce(account.monthly_limit,0)=0 then 'activation'
    when account.blocked_until>now() then 'safety_stop'
    else 'capacity' end);
end $$;
revoke all on function public.email_domain_setup_status(uuid) from public, anon;
grant execute on function public.email_domain_setup_status(uuid) to authenticated;

create or replace function public.email_save_platform_sender(p_organisation_id uuid,p_display_name text,p_reply_to text,
  p_default boolean default true,p_identity_id uuid default null)
returns public.email_sender_identities language plpgsql security definer set search_path='' as $$
declare result public.email_sender_identities%rowtype;
begin
  if auth.uid() is null or not public.email_domain_can_manage(p_organisation_id) then
    raise exception 'Only an organisation principal can manage senders.' using errcode='42501';
  end if;
  perform 1 from public.organisations where id=p_organisation_id for update;
  p_display_name:=btrim(coalesce(p_display_name,'')); p_reply_to:=lower(btrim(coalesce(p_reply_to,'')));
  if length(p_display_name) not between 1 and 120 or p_display_name ~ '[\r\n<>]'
    or p_reply_to !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Add a display name and a working inbox for replies.' using errcode='22023';
  end if;
  if p_identity_id is not null then
    select * into result from public.email_sender_identities where id=p_identity_id and organisation_id=p_organisation_id and sender_mode='arch9';
    if result.id is null then raise exception 'Arch9 sender not found in this organisation.' using errcode='42501'; end if;
  else
    select * into result from public.email_sender_identities where organisation_id=p_organisation_id and sender_mode='arch9';
  end if;
  if result.verification_status='disabled' then raise exception 'This sender is disabled.' using errcode='22023'; end if;
  p_default:=coalesce(p_default,false) or not exists(select 1 from public.email_sender_identities where organisation_id=p_organisation_id and is_default);
  if p_default then update public.email_sender_identities set is_default=false where organisation_id=p_organisation_id and is_default; end if;
  if result.id is null then
    insert into public.email_sender_identities(organisation_id,sender_mode,display_name,from_email,reply_to_email,verification_status,is_default,created_by)
      values(p_organisation_id,'arch9',p_display_name,'noreply@updates.arch9.co.za',p_reply_to,'verified',p_default,auth.uid()) returning * into result;
  else
    update public.email_sender_identities set display_name=p_display_name,reply_to_email=p_reply_to,is_default=p_default
      where id=result.id returning * into result;
  end if;
  perform public.email_activate_verified_organisation(p_organisation_id);
  return result;
end $$;

create or replace function public.email_save_sender(p_organisation_id uuid, p_domain_id uuid, p_display_name text,
  p_email text, p_reply_to text, p_default boolean default true, p_identity_id uuid default null)
returns public.email_sender_identities language plpgsql security definer set search_path = '' as $$
declare d public.email_sending_domains%rowtype; result public.email_sender_identities%rowtype;
begin
  if auth.uid() is null or not public.email_domain_can_manage(p_organisation_id) then
    raise exception 'Only an organisation principal can manage senders.' using errcode='42501';
  end if;
  -- Serialise changes to the organisation default, including the first sender.
  perform 1 from public.organisations where id=p_organisation_id for update;
  select * into d from public.email_sending_domains where id=p_domain_id and organisation_id=p_organisation_id for update;
  p_email:=lower(btrim(coalesce(p_email,''))); p_reply_to:=lower(btrim(coalesce(p_reply_to,'')));
  p_display_name:=coalesce(p_display_name,'');
  if d.id is null or d.verification_status='disabled' or d.domain_name<>split_part(p_email,'@',2)
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_reply_to !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[\r\n<>]' then
    raise exception 'Use a valid sender, reply address and matching agency domain.' using errcode='22023';
  end if;
  if p_identity_id is not null then
    select * into result from public.email_sender_identities where id=p_identity_id and organisation_id=p_organisation_id and sender_mode='custom';
    if result.id is null then raise exception 'Sender not found.' using errcode='42501'; end if;
    if result.verification_status='disabled' then raise exception 'This sender is disabled.' using errcode='22023'; end if;
  end if;
  p_default:=coalesce(p_default,false) or not exists(select 1 from public.email_sender_identities where organisation_id=p_organisation_id and is_default);
  if p_default then update public.email_sender_identities set is_default=false where organisation_id=p_organisation_id and is_default; end if;
  if p_identity_id is null then
    insert into public.email_sender_identities(organisation_id,email_sending_domain_id,display_name,from_email,reply_to_email,verification_status,verified_at,is_default,created_by)
    values(p_organisation_id,d.id,btrim(p_display_name),p_email,p_reply_to,d.verification_status,d.verified_at,p_default,auth.uid()) returning * into result;
  else
    update public.email_sender_identities set email_sending_domain_id=d.id,display_name=btrim(p_display_name),
      from_email=p_email,reply_to_email=p_reply_to,verification_status=d.verification_status,verified_at=d.verified_at,is_default=p_default
      where id=p_identity_id and organisation_id=p_organisation_id returning * into result;
  end if;
  perform public.email_activate_verified_organisation(p_organisation_id);
  return result;
end $$;

revoke all on function public.email_save_sender(uuid,uuid,text,text,text,boolean,uuid),
  public.email_save_platform_sender(uuid,text,text,boolean,uuid) from public, anon;
grant execute on function public.email_save_sender(uuid,uuid,text,text,text,boolean,uuid),
  public.email_save_platform_sender(uuid,text,text,boolean,uuid) to authenticated;
commit;
