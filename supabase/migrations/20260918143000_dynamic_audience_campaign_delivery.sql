begin;

-- A campaign stores the saved-audience reference in its existing filter JSON.
-- This keeps old flat filters working while letting new rule-based audiences
-- be resolved immediately before recipients are snapshotted.
create or replace function public.email_campaign_resolve_audience_rules(
  p_organisation_id uuid,
  p_filter jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audience_id uuid;
  v_rules jsonb;
begin
  v_audience_id := nullif(p_filter ->> 'saved_audience_id', '')::uuid;
  if v_audience_id is null then return coalesce(p_filter, '{}'::jsonb); end if;
  select filter_json into v_rules
  from public.email_saved_audiences
  where id = v_audience_id
    and organisation_id = p_organisation_id
    and archived_at is null;
  if v_rules is null then raise exception 'The selected audience is unavailable.' using errcode = '22023'; end if;
  return v_rules;
end;
$$;

create or replace function public.email_campaign_preview_audience(
  p_organisation_id uuid,
  p_subscription_type_id uuid,
  p_filter jsonb default '{}'::jsonb
) returns integer language plpgsql stable security definer set search_path = public as $$
declare v_count integer; v_rules jsonb;
begin
  if p_organisation_id is null or p_subscription_type_id is null then return 0; end if;
  if not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode = '42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(p_organisation_id, p_filter);
  select count(*)::integer into v_count
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email and p.marketing_consent_status='opted_in'
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=p_subscription_type_id and cs.status='subscribed'
  where c.organisation_id=p_organisation_id and c.is_valid_email and s.id is null
    and (coalesce(jsonb_typeof(v_rules->'rules'), '') <> 'array' or public.email_audience_rule_matches(c, v_rules))
    and (v_rules->>'role_type' is null or c.role_type=v_rules->>'role_type')
    and (v_rules->>'branch_id' is null or c.branch_id::text=v_rules->>'branch_id')
    and (v_rules->>'assigned_user_id' is null or c.assigned_user_id::text=v_rules->>'assigned_user_id')
    and (v_rules->>'lead_stage' is null or c.lead_stage=v_rules->>'lead_stage')
    and (v_rules->>'area' is null or c.area=v_rules->>'area')
    and (v_rules->>'tag' is null or v_rules->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_rules->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_rules->'contact_ids')));
  return coalesce(v_count,0);
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
  if not exists (select 1 from public.email_sender_identities i where i.id=v_campaign.sender_identity_id and i.organisation_id=v_campaign.organisation_id and i.verification_status = 'verified') then raise exception 'A verified sender identity is required.' using errcode = '22023'; end if;
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

grant execute on function public.email_campaign_resolve_audience_rules(uuid,jsonb), public.email_campaign_preview_audience(uuid,uuid,jsonb), public.email_campaign_prepare_dispatch(uuid,timestamptz) to authenticated;

commit;
