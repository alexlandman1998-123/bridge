begin;

alter table public.email_sender_identities add column sender_mode text not null default 'custom'
  check(sender_mode in ('custom','arch9'));

-- The shared domain is platform infrastructure, never a customer-owned domain.
-- Migration alone does not enable it or assert provider verification.
create table public.email_campaign_platform_sender (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  verification_status text not null default 'pending' check(verification_status in ('pending','verified','failed')),
  provider_domain_id text,
  last_checked_at timestamptz
);
insert into public.email_campaign_platform_sender(singleton) values(true);
alter table public.email_campaign_platform_sender enable row level security;
revoke all on public.email_campaign_platform_sender from public,anon,authenticated;
grant select,update on public.email_campaign_platform_sender to service_role;

create function public.email_campaign_apply_platform_status(p_provider_domain_id text,p_status text,p_enabled boolean)
returns void language sql security invoker set search_path='' as $$
  update public.email_campaign_platform_sender set provider_domain_id=nullif(p_provider_domain_id,''),
    verification_status=p_status,enabled=coalesce(p_enabled,false),last_checked_at=now() where singleton
$$;
revoke all on function public.email_campaign_apply_platform_status(text,text,boolean) from public,anon,authenticated;
grant execute on function public.email_campaign_apply_platform_status(text,text,boolean) to service_role;

create function public.email_campaign_platform_sender_status(p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) then
    raise exception 'Choose an active organisation workspace.' using errcode='42501';
  end if;
  select jsonb_build_object('email','noreply@updates.arch9.co.za','enabled',enabled,
    'status',verification_status,'ready',enabled and verification_status='verified' and provider_domain_id is not null,
    'checkedAt',last_checked_at) into result from public.email_campaign_platform_sender where singleton;
  return result;
end $$;
revoke all on function public.email_campaign_platform_sender_status(uuid) from public,anon;
grant execute on function public.email_campaign_platform_sender_status(uuid) to authenticated;

-- Internal readiness predicate reused by activation, preflight and quota. It
-- is not a browser API; authorised definer RPCs and service workers call it.
create function public.email_campaign_sender_ready(p_organisation_id uuid,p_identity_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.email_sender_identities i
    where i.id=p_identity_id and i.organisation_id=p_organisation_id and i.verification_status='verified'
      and i.sending_paused_at is null and (
        (i.sender_mode='arch9' and i.from_email='noreply@updates.arch9.co.za' and i.email_sending_domain_id is null
          and exists(select 1 from public.email_campaign_platform_sender p where p.singleton and p.enabled
            and p.verification_status='verified' and p.provider_domain_id is not null))
        or (i.sender_mode='custom' and exists(select 1 from public.email_sending_domains d
          where d.id=i.email_sending_domain_id and d.organisation_id=i.organisation_id
            and d.verification_status='verified' and d.provider_domain_id is not null
            and d.domain_name=split_part(i.from_email,'@',2)
            and rtrim(d.domain_name,'.')<>'arch9.co.za' and rtrim(d.domain_name,'.') not like '%.arch9.co.za'))
      ))
$$;
revoke all on function public.email_campaign_sender_ready(uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_campaign_sender_ready(uuid,uuid) to service_role;

create or replace function public.email_sender_identity_enforce_sending_domain()
returns trigger language plpgsql security invoker set search_path='' as $$
declare d public.email_sending_domains%rowtype; sender_domain text:=rtrim(split_part(lower(btrim(new.from_email)),'@',2),'.');
begin
  if tg_op='UPDATE' and new.sender_mode<>old.sender_mode then
    raise exception 'Sender type cannot be changed. Add another sender.' using errcode='23514';
  end if;
  if new.sender_mode='arch9' then
    if new.from_email<>'noreply@updates.arch9.co.za' or new.email_sending_domain_id is not null or new.provider<>'resend' then
      raise exception 'The Arch9 campaign sender address is platform controlled.' using errcode='23514';
    end if;
  else
    if sender_domain='arch9.co.za' or sender_domain like '%.arch9.co.za' then
      raise exception 'Arch9 domains are reserved for the platform sender.' using errcode='23514';
    end if;
    if new.email_sending_domain_id is not null then
      select * into d from public.email_sending_domains where id=new.email_sending_domain_id;
      if d.id is null or d.organisation_id<>new.organisation_id or d.provider<>new.provider or d.domain_name<>sender_domain then
        raise exception 'Sender identity must be linked to its organisation’s matching sending domain.' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger email_sender_identities_sending_domain_guard on public.email_sender_identities;
create trigger email_sender_identities_sending_domain_guard before insert or update of organisation_id,provider,from_email,email_sending_domain_id,sender_mode
  on public.email_sender_identities for each row execute function public.email_sender_identity_enforce_sending_domain();

create function public.email_campaign_reserve_platform_domains()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if rtrim(new.domain_name,'.')='arch9.co.za' or rtrim(new.domain_name,'.') like '%.arch9.co.za' then
    raise exception 'Arch9 domains are reserved for platform sending.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.email_campaign_reserve_platform_domains() from public,anon,authenticated;
create trigger email_campaign_reserved_domain_guard before insert or update of domain_name on public.email_sending_domains
  for each row execute function public.email_campaign_reserve_platform_domains();

create function public.email_save_platform_sender(p_organisation_id uuid,p_display_name text,p_reply_to text,
  p_default boolean default true,p_identity_id uuid default null)
returns public.email_sender_identities language plpgsql security definer set search_path='' as $$
declare result public.email_sender_identities%rowtype;
begin
  if auth.uid() is null or not public.email_campaign_can_send(p_organisation_id) then
    raise exception 'Only an organisation administrator can manage senders.' using errcode='42501';
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
revoke all on function public.email_save_platform_sender(uuid,text,text,boolean,uuid) from public,anon;
grant execute on function public.email_save_platform_sender(uuid,text,text,boolean,uuid) to authenticated;

-- Replacements below preserve existing activation pauses, quota reservations,
-- category consent and dynamic audience resolution while allowing both modes.
create or replace function public.email_activate_verified_organisation(p_organisation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.email_sender_identities i where i.organisation_id=p_organisation_id and public.email_campaign_sender_ready(p_organisation_id,i.id)) then return; end if;
  insert into public.email_sending_policies(organisation_id, approved_at, approval_note, daily_recipient_limit, max_recipients_per_worker_run)
  values(p_organisation_id, now(), 'Automatically activated after domain verification.', 500, 50)
  on conflict(organisation_id) do update set
    approved_at=coalesce(public.email_sending_policies.approved_at, excluded.approved_at),
    approval_note=coalesce(public.email_sending_policies.approval_note, excluded.approval_note)
  where not public.email_sending_policies.self_service_blocked and public.email_sending_policies.paused_at is null;
  perform public.email_campaign_ensure_subscription_types(p_organisation_id);
end $$;

create or replace function public.email_reserve_send(p_organisation_id uuid,p_identity_id uuid,p_key text,p_actor_id uuid default null,p_test boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare policy public.email_sending_policies%rowtype; used integer; legacy_used integer;
begin
  select * into policy from public.email_sending_policies where organisation_id=p_organisation_id for update;
  if policy.organisation_id is null or policy.approved_at is null or policy.paused_at is not null or policy.self_service_blocked then return false; end if;
  if not public.email_campaign_sender_ready(p_organisation_id,p_identity_id) then return false; end if;
  if exists(select 1 from public.email_send_reservations where organisation_id=p_organisation_id and reservation_key=p_key) then return true; end if;
  if p_test and (p_actor_id is null or (select count(*) from public.email_send_reservations
    where organisation_id=p_organisation_id and actor_id=p_actor_id and is_test and created_at>now()-interval '1 hour')>=5) then return false; end if;
  select count(*) into used from public.email_send_reservations where organisation_id=p_organisation_id and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  select count(*) into legacy_used from public.email_campaign_recipients r where r.organisation_id=p_organisation_id
    and r.sent_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=p_organisation_id and s.reservation_key='recipient:'||r.id::text);
  if used+legacy_used>=least(policy.daily_recipient_limit,500) then return false; end if;
  insert into public.email_send_reservations(organisation_id,reservation_key,sender_identity_id,actor_id,is_test)
    values(p_organisation_id,p_key,p_identity_id,p_actor_id,p_test);
  return true;
end $$;

create or replace function public.email_campaign_preflight(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_campaigns%rowtype; v_eligible integer := 0; v_checks jsonb := '[]'::jsonb; v_ready boolean;
begin
  select * into v_campaign from public.email_campaigns where id=p_campaign_id;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','sender','ok',public.email_campaign_sender_ready(v_campaign.organisation_id,v_campaign.sender_identity_id)));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','subscription','ok',exists(select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active)));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','policy','ok',exists(select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.approved_at is not null and sp.paused_at is null and not sp.self_service_blocked)));
  if v_campaign.subscription_type_id is not null then v_eligible := public.email_campaign_preview_audience(v_campaign.organisation_id,v_campaign.subscription_type_id,v_campaign.audience_filter); end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','audience','ok',v_eligible > 0,'eligible_recipients',v_eligible));
  select bool_and((item->>'ok')::boolean) into v_ready from jsonb_array_elements(v_checks) item;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'preflighted',jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible));
  return jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible,'checks',v_checks);
end $$;

create or replace function public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.email_campaigns%rowtype; v_count integer; v_rules jsonb;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised to schedule this campaign.' using errcode = '42501'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'Only an unsent campaign can be scheduled.' using errcode = '22023'; end if;
  if v_campaign.subscription_type_id is null or not exists (select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active) then raise exception 'Choose an active email subscription type before scheduling.' using errcode = '22023'; end if;
  if exists (select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.paused_at is not null) then raise exception 'Sending is paused for this organisation.' using errcode = '22023'; end if;
  if not public.email_campaign_sender_ready(v_campaign.organisation_id,v_campaign.sender_identity_id) then raise exception 'Choose a ready sender before scheduling.' using errcode='22023'; end if;
  if not exists(select 1 from public.email_sending_policies p where p.organisation_id=v_campaign.organisation_id and p.approved_at is not null and p.paused_at is null and not p.self_service_blocked) then raise exception 'Organisation sending is not approved and active.' using errcode='42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(v_campaign.organisation_id, v_campaign.audience_filter);
  insert into public.email_campaign_recipients (organisation_id, campaign_id, contact_id, email, recipient_snapshot)
  select c.organisation_id, v_campaign.id, c.id, c.email, jsonb_build_object('first_name',c.first_name,'last_name',c.last_name,'full_name',c.full_name,'agent_name','', 'agency_name','', 'branch_name','')
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=v_campaign.subscription_type_id and cs.status='subscribed'
  where c.organisation_id=v_campaign.organisation_id and c.is_valid_email and s.id is null and coalesce(p.marketing_consent_status,'unknown') = 'opted_in'
    and (coalesce(jsonb_typeof(v_rules->'rules'), '') <> 'array' or public.email_audience_rule_matches(c, v_rules))
    and (v_rules->>'role_type' is null or c.role_type = v_rules->>'role_type')
    and (v_rules->>'branch_id' is null or c.branch_id::text = v_rules->>'branch_id')
    and (v_rules->>'assigned_user_id' is null or c.assigned_user_id::text = v_rules->>'assigned_user_id')
    and (v_rules->>'lead_stage' is null or c.lead_stage = v_rules->>'lead_stage')
    and (v_rules->>'area' is null or c.area = v_rules->>'area')
    and (v_rules->>'tag' is null or v_rules->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_rules->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_rules->'contact_ids')))
  on conflict (campaign_id,email) do nothing;
  get diagnostics v_count = row_count;
  update public.email_campaigns set status = case when p_send_at <= now() then 'sending' else 'scheduled' end, scheduled_for=p_send_at, audience_snapshot_at=coalesce(audience_snapshot_at,now()), updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'scheduled',jsonb_build_object('scheduled_for',p_send_at,'eligible_recipients',v_count));
  insert into public.email_campaign_dispatch_jobs (campaign_id, organisation_id, run_at) values (v_campaign.id, v_campaign.organisation_id, p_send_at) on conflict (campaign_id) do update set run_at=excluded.run_at, status='queued', last_error=null, locked_at=null;
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*) from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

create or replace function public.email_save_sender(p_organisation_id uuid, p_domain_id uuid, p_display_name text,
  p_email text, p_reply_to text, p_default boolean default true, p_identity_id uuid default null)
returns public.email_sender_identities language plpgsql security definer set search_path = '' as $$
declare d public.email_sending_domains%rowtype; result public.email_sender_identities%rowtype;
begin
  if auth.uid() is null or not public.email_campaign_can_send(p_organisation_id) then
    raise exception 'Only an agency administrator can manage senders.' using errcode='42501';
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

revoke all on function public.email_campaign_preflight(uuid),public.email_campaign_prepare_dispatch(uuid,timestamptz),
 public.email_save_sender(uuid,uuid,text,text,text,boolean,uuid) from public,anon;
grant execute on function public.email_campaign_preflight(uuid),public.email_campaign_prepare_dispatch(uuid,timestamptz),
 public.email_save_sender(uuid,uuid,text,text,text,boolean,uuid) to authenticated;
revoke all on function public.email_activate_verified_organisation(uuid),public.email_reserve_send(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.email_activate_verified_organisation(uuid),public.email_reserve_send(uuid,uuid,text,uuid,boolean) to service_role;

commit;
