begin;

-- Persist a tracked click and its state transition together. The hosted route
-- must never claim success when event storage failed, or mix bearer capabilities.
create function public.email_campaign_record_click(p_link_token text,p_recipient_id uuid,p_recipient_token text)
returns text language plpgsql security invoker set search_path='' as $$
declare recipient public.email_campaign_recipients%rowtype; link public.email_campaign_links%rowtype;
begin
  select * into recipient from public.email_campaign_recipients where id=p_recipient_id and tracking_token=p_recipient_token for update;
  if not found then return null; end if;
  select * into link from public.email_campaign_links where tracking_token=p_link_token
    and campaign_id=recipient.campaign_id and organisation_id=recipient.organisation_id;
  if not found or link.target_url !~* '^https?://' then return null; end if;
  insert into public.email_events(organisation_id,campaign_id,recipient_id,provider,provider_event_id,event_type,url,payload)
    values(recipient.organisation_id,recipient.campaign_id,recipient.id,'arch9','click:'||gen_random_uuid()::text,'clicked',link.target_url,'{"source":"campaign_redirect"}');
  update public.email_campaign_recipients set status='clicked',clicked_at=coalesce(clicked_at,now()) where id=recipient.id and status in ('sent','delivered','opened','clicked');
  return link.target_url;
end $$;
revoke all on function public.email_campaign_record_click(text,uuid,text) from public,anon,authenticated;
grant execute on function public.email_campaign_record_click(text,uuid,text) to service_role;

-- Return only own usage plus a generic account availability flag. Capacity that
-- has already been allocated must not still appear available for new work.
create or replace function public.email_campaign_controls_status(p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare used bigint; legacy_used bigint; daily_used bigint; monthly_used bigint;
  account public.email_campaign_account_limits%rowtype;
  day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
  if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  select * into account from public.email_campaign_account_limits where singleton;
  select count(*) into used from public.email_send_reservations where organisation_id=p_organisation_id and budget_reserved_at>=day_start;
  select count(*) into legacy_used from public.email_campaign_recipients r where r.organisation_id=p_organisation_id and r.sent_at>=day_start
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=r.organisation_id and s.reservation_key='recipient:'||r.id::text);
  select count(*) filter(where budget_reserved_at>=day_start),count(*) into daily_used,monthly_used
    from public.email_send_reservations where budget_reserved_at>=month_start;
  select daily_used+count(*) filter(where r.sent_at>=day_start),monthly_used+count(*) into daily_used,monthly_used
    from public.email_campaign_recipients r where r.sent_at>=month_start
    and not exists(select 1 from public.email_send_reservations s where s.organisation_id=r.organisation_id and s.reservation_key='recipient:'||r.id::text);
  return jsonb_build_object('reserved_today',used+legacy_used,'account_ready',coalesce(account.enabled,false)
    and account.daily_limit>daily_used and account.monthly_limit>monthly_used and (account.blocked_until is null or account.blocked_until<=now()));
end $$;

-- PostgreSQL count(*) is bigint; the quote RPC accepts integer. Use an
-- explicit cast so a valid schedule commits its recipients, job and quote.
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
  if not exists(select 1 from public.email_sending_policies p where p.organisation_id=v_campaign.organisation_id and p.approved_at is not null and p.paused_at is null and p.manual_paused_at is null and not p.self_service_blocked) then raise exception 'Organisation sending is not approved and active.' using errcode='42501'; end if;
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
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*)::integer from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

commit;
