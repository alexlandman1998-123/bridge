begin;

-- A central Resend account needs an explicit platform approval before an
-- organisation can consume its shared sending reputation. A missing policy is
-- deliberately treated as unapproved.
alter table public.email_sending_policies
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id) on delete set null,
  add column approval_note text;

create or replace function public.email_sending_policy_protect_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and tg_op = 'INSERT'
    and (new.approved_at is not null or new.approved_by is not null or new.approval_note is not null) then
    raise exception 'Only Arch9 can approve an organisation for email sending.' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and tg_op = 'UPDATE'
    and (new.approved_at, new.approved_by, new.approval_note)
      is distinct from (old.approved_at, old.approved_by, old.approval_note) then
    raise exception 'Only Arch9 can change email sending approval.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger email_sending_policies_approval_guard
before insert or update on public.email_sending_policies
for each row execute function public.email_sending_policy_protect_approval();

revoke all on function public.email_sending_policy_protect_approval() from public, anon, authenticated;

create or replace function public.email_campaign_preflight(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_campaigns%rowtype; v_eligible integer := 0; v_checks jsonb := '[]'::jsonb; v_ready boolean;
begin
  select * into v_campaign from public.email_campaigns where id=p_campaign_id;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','sender','ok',exists(select 1 from public.email_sender_identities i where i.id=v_campaign.sender_identity_id and i.organisation_id=v_campaign.organisation_id and i.verification_status='verified')));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','subscription','ok',exists(select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active)));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','policy','ok',exists(select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.approved_at is not null and sp.paused_at is null)));
  if v_campaign.subscription_type_id is not null then v_eligible := public.email_campaign_preview_audience(v_campaign.organisation_id,v_campaign.subscription_type_id,v_campaign.audience_filter); end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','audience','ok',v_eligible > 0,'eligible_recipients',v_eligible));
  select bool_and((item->>'ok')::boolean) into v_ready from jsonb_array_elements(v_checks) item;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'preflighted',jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible));
  return jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible,'checks',v_checks);
end $$;

create or replace function public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.email_campaigns%rowtype; v_count integer;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised to schedule this campaign.' using errcode = '42501'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'Only an unsent campaign can be scheduled.' using errcode = '22023'; end if;
  if v_campaign.subscription_type_id is null or not exists (select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active) then raise exception 'Choose an active email subscription type before scheduling.' using errcode = '22023'; end if;
  if not exists (select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.approved_at is not null and sp.paused_at is null) then raise exception 'Arch9 must approve email sending for this organisation before scheduling.' using errcode = '22023'; end if;
  if not exists (select 1 from public.email_sender_identities i where i.id = v_campaign.sender_identity_id and i.organisation_id = v_campaign.organisation_id and i.verification_status = 'verified') then raise exception 'A verified sender identity is required.' using errcode = '22023'; end if;
  insert into public.email_campaign_recipients (organisation_id, campaign_id, contact_id, email, recipient_snapshot)
  select c.organisation_id, v_campaign.id, c.id, c.email, jsonb_build_object('first_name',c.first_name,'last_name',c.last_name,'full_name',c.full_name,'agent_name','', 'agency_name','', 'branch_name','')
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=v_campaign.subscription_type_id and cs.status='subscribed'
  where c.organisation_id=v_campaign.organisation_id and c.is_valid_email and s.id is null and coalesce(p.marketing_consent_status,'unknown') = 'opted_in'
    and (v_campaign.audience_filter->>'role_type' is null or c.role_type = v_campaign.audience_filter->>'role_type')
    and (v_campaign.audience_filter->>'branch_id' is null or c.branch_id::text = v_campaign.audience_filter->>'branch_id')
    and (v_campaign.audience_filter->>'assigned_user_id' is null or c.assigned_user_id::text = v_campaign.audience_filter->>'assigned_user_id')
    and (v_campaign.audience_filter->>'lead_stage' is null or c.lead_stage = v_campaign.audience_filter->>'lead_stage')
    and (v_campaign.audience_filter->>'area' is null or c.area = v_campaign.audience_filter->>'area')
    and (v_campaign.audience_filter->>'tag' is null or v_campaign.audience_filter->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_campaign.audience_filter->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_campaign.audience_filter->'contact_ids')))
  on conflict (campaign_id,email) do nothing;
  get diagnostics v_count = row_count;
  update public.email_campaigns set status = case when p_send_at <= now() then 'sending' else 'scheduled' end, scheduled_for=p_send_at, audience_snapshot_at=coalesce(audience_snapshot_at,now()), updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'scheduled',jsonb_build_object('scheduled_for',p_send_at,'eligible_recipients',v_count));
  insert into public.email_campaign_dispatch_jobs (campaign_id, organisation_id, run_at) values (v_campaign.id, v_campaign.organisation_id, p_send_at) on conflict (campaign_id) do update set run_at=excluded.run_at, status='queued', last_error=null, locked_at=null;
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*) from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

commit;
