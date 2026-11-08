begin;

-- Consent is mutable. Delivery and engagement are historical facts.
create table public.email_preference_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  preference_id uuid not null references public.contact_marketing_preferences(id) on delete cascade,
  campaign_id uuid references public.email_campaigns(id) on delete cascade,
  recipient_id uuid references public.email_campaign_recipients(id) on delete cascade,
  selected_types uuid[] not null,
  opted_out boolean not null,
  source text not null check (source in ('preference_centre','campaign_unsubscribe','mailbox_one_click')),
  occurred_at timestamptz not null default now(),
  check ((campaign_id is null) = (recipient_id is null))
);
alter table public.email_preference_events enable row level security;
revoke all on public.email_preference_events from public, anon, authenticated;
grant select on public.email_preference_events to authenticated;
grant select, insert on public.email_preference_events to service_role;
create policy email_preference_events_member_read on public.email_preference_events for select to authenticated
  using (public.bridge_has_organisation_membership(organisation_id));
create trigger email_preference_events_organisation_guard before insert on public.email_preference_events
  for each row execute function public.email_campaign_guard_organisation();
create index email_preference_events_campaign on public.email_preference_events(campaign_id,recipient_id,occurred_at) where campaign_id is not null;

alter table public.email_events add column engagement_class text not null default 'unknown'
  check (engagement_class in ('unknown','known_automation','known_proxy'));
create index email_events_recipient_measurement on public.email_events(recipient_id,event_type,occurred_at);

create function public.marketing_engagement_class(p_user_agent text,p_purpose text default '')
returns text language sql immutable security invoker set search_path='' as $$
  select case
    when coalesce(p_purpose,'') ~* '(prefetch|preview)' or coalesce(p_user_agent,'') ~* '(bot([^a-z]|$)|crawler|spider|slurp|headless|phantomjs|selenium|playwright|puppeteer|barracuda|proofpoint|mimecast|safelinks|urlscan|linkchecker|security.?scan|curl/|wget/)' then 'known_automation'
    when coalesce(p_user_agent,'') ~* '(googleimageproxy|yahoo.?mail.?proxy|apple.?mail.?privacy)' then 'known_proxy'
    else 'unknown' end
$$;
revoke all on function public.marketing_engagement_class(text,text) from public,anon,authenticated;
grant execute on function public.marketing_engagement_class(text,text) to service_role;

-- Classify retained evidence without changing receipt identity or event history.
update public.email_events set engagement_class=public.marketing_engagement_class(
  coalesce(payload#>>'{data,click,userAgent}',payload#>>'{data,open,userAgent}',payload#>>'{tracking,userAgent}'),
  coalesce(payload#>>'{tracking,purpose}','')) where event_type in ('opened','clicked');

alter table public.email_events drop constraint email_events_event_type_check;
alter table public.email_events add constraint email_events_event_type_check check
  (event_type in ('sent','delivered','delivery_delayed','opened','clicked','bounced','complained','unsubscribed','failed','suppressed'));
alter table public.email_campaign_provider_receipts drop constraint email_campaign_provider_receipts_event_type_check;
alter table public.email_campaign_provider_receipts add constraint email_campaign_provider_receipts_event_type_check check
  (event_type in ('email.sent','email.delivered','email.delivery_delayed','email.opened','email.clicked','email.bounced','email.complained','email.failed','email.suppressed'));

-- A valid preference capability always controls consent. Campaign credit also
-- requires the recipient capability, the same organisation/address and a send.
create function public.email_campaign_change_preferences(p_token text,p_selected uuid[],p_recipient_id uuid,p_recipient_token text,p_source text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare pref public.contact_marketing_preferences%rowtype; r public.email_campaign_recipients%rowtype;
  subscribed boolean:=cardinality(p_selected)>0; previous_types uuid[]; selected_types uuid[];
  changed boolean; event_id uuid; context_campaign uuid; context_recipient uuid;
begin
  if p_source not in ('preference_centre','campaign_unsubscribe','mailbox_one_click') then raise exception 'Invalid preference source.' using errcode='22023'; end if;
  select * into pref from public.contact_marketing_preferences where unsubscribe_token=p_token for update;
  if not found then return false; end if;
  if p_selected is null or exists(select 1 from unnest(p_selected) chosen where chosen is null or not exists(
    select 1 from public.email_subscription_types t where t.id=chosen and t.organisation_id=pref.organisation_id and t.is_active)) then
    raise exception 'Choose categories from this organisation only.' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into selected_types from unnest(p_selected) x;
  select coalesce(array_agg(subscription_type_id order by subscription_type_id),'{}'::uuid[]) into previous_types
    from public.contact_email_subscriptions where organisation_id=pref.organisation_id and email=pref.email and status='subscribed';
  changed:=pref.marketing_consent_status is distinct from (case when subscribed then 'opted_in' else 'opted_out' end)
    or previous_types is distinct from selected_types;
  if p_recipient_id is not null and coalesce(p_recipient_token,'')<>'' then
    select * into r from public.email_campaign_recipients where id=p_recipient_id and tracking_token=p_recipient_token
      and organisation_id=pref.organisation_id and email=pref.email and (sent_at is not null or provider_message_id is not null);
    if found then context_campaign:=r.campaign_id; context_recipient:=r.id; end if;
  end if;
  update public.contact_marketing_preferences set marketing_consent_status=case when subscribed then 'opted_in' else 'opted_out' end,
    consent_source='preference_centre',consent_captured_at=case when subscribed then now() else consent_captured_at end,
    unsubscribed_at=case when subscribed then null else coalesce(unsubscribed_at,now()) end where id=pref.id;
  insert into public.contact_email_subscriptions(organisation_id,subscription_type_id,email,status,source,consent_captured_at,unsubscribed_at)
    select pref.organisation_id,t.id,pref.email,case when t.id=any(selected_types) then 'subscribed' else 'unsubscribed' end,'preference_centre',
      case when t.id=any(selected_types) then now() end,case when not t.id=any(selected_types) then now() end
    from public.email_subscription_types t where t.organisation_id=pref.organisation_id and t.is_active
    on conflict(organisation_id,subscription_type_id,email) do update set status=excluded.status,source=excluded.source,
      consent_captured_at=excluded.consent_captured_at,unsubscribed_at=excluded.unsubscribed_at;
  if subscribed then
    delete from public.email_suppressions where organisation_id=pref.organisation_id and email=pref.email and reason='unsubscribe'
      and not exists(select 1 from public.email_events e join public.email_campaign_recipients history on history.id=e.recipient_id
        where history.organisation_id=pref.organisation_id and history.email=pref.email and e.event_type in ('complained','bounced','suppressed'));
  else
    update public.contact_email_subscriptions set status='unsubscribed',unsubscribed_at=coalesce(unsubscribed_at,now()) where organisation_id=pref.organisation_id and email=pref.email;
    -- Only unsent work changes state. Never rewrite an accepted message's history.
    update public.email_campaign_recipients set status='unsubscribed' where organisation_id=pref.organisation_id and email=pref.email and status='queued';
    insert into public.email_suppressions(organisation_id,email,reason,source) values(pref.organisation_id,pref.email,'unsubscribe','preference_centre')
      on conflict(organisation_id,email) do nothing;
  end if;
  if changed then
    insert into public.email_preference_events(organisation_id,preference_id,campaign_id,recipient_id,selected_types,opted_out,source)
      values(pref.organisation_id,pref.id,context_campaign,context_recipient,selected_types,not subscribed,p_source) returning id into event_id;
    if not subscribed and context_recipient is not null then
      insert into public.email_events(organisation_id,campaign_id,recipient_id,provider,provider_event_id,event_type,payload)
        values(pref.organisation_id,context_campaign,context_recipient,'arch9','preference:'||event_id::text,'unsubscribed',jsonb_build_object('source',p_source));
    end if;
  end if;
  return true;
end $$;
revoke all on function public.email_campaign_change_preferences(text,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_campaign_change_preferences(text,uuid[],uuid,text,text) to service_role;
create or replace function public.email_campaign_apply_preferences(p_token text,p_selected uuid[])
returns boolean language sql security invoker set search_path='' as $$
  select public.email_campaign_change_preferences(p_token,p_selected,null,null,'preference_centre')
$$;

-- Read-only legacy destination resolution must not depend on an event INSERT.
create function public.email_campaign_resolve_link(p_link_token text,p_recipient_id uuid,p_recipient_token text)
returns text language sql stable security invoker set search_path='' as $$
  select l.target_url from public.email_campaign_recipients r join public.email_campaign_links l
    on l.campaign_id=r.campaign_id and l.organisation_id=r.organisation_id
  where r.id=p_recipient_id and r.tracking_token=p_recipient_token and l.tracking_token=p_link_token
    and l.target_url ~* '^https?://'
$$;
revoke all on function public.email_campaign_resolve_link(text,uuid,text) from public,anon,authenticated;
grant execute on function public.email_campaign_resolve_link(text,uuid,text) to service_role;

create function public.email_campaign_record_click_v2(p_link_token text,p_recipient_id uuid,p_recipient_token text,p_metadata jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare target text; r public.email_campaign_recipients%rowtype; class text;
begin
  target:=public.email_campaign_resolve_link(p_link_token,p_recipient_id,p_recipient_token);
  if target is null then return null; end if;
  select * into strict r from public.email_campaign_recipients where id=p_recipient_id for update;
  class:=public.marketing_engagement_class(p_metadata->>'userAgent',p_metadata->>'purpose');
  insert into public.email_events(organisation_id,campaign_id,recipient_id,provider,provider_event_id,event_type,url,payload,engagement_class)
    values(r.organisation_id,r.campaign_id,r.id,'arch9','click:'||gen_random_uuid()::text,'clicked',target,
      jsonb_build_object('source','campaign_redirect','tracking',jsonb_build_object('userAgent',left(p_metadata->>'userAgent',512),'purpose',left(p_metadata->>'purpose',80))),class);
  if class<>'known_automation' then
    update public.email_campaign_recipients set status='clicked',clicked_at=coalesce(clicked_at,now())
      where id=r.id and status in ('sent','delivered','opened','clicked');
  end if;
  return target;
end $$;
revoke all on function public.email_campaign_record_click_v2(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.email_campaign_record_click_v2(text,uuid,text,jsonb) to service_role;
create or replace function public.email_campaign_record_click(p_link_token text,p_recipient_id uuid,p_recipient_token text)
returns text language sql security invoker set search_path='' as $$
  select public.email_campaign_record_click_v2(p_link_token,p_recipient_id,p_recipient_token,'{}'::jsonb)
$$;


create or replace function public.email_campaign_preserve_delivery_state()
returns trigger language plpgsql security invoker set search_path='' as $$
declare states text[]:=array['queued','sending','sent','failed','delivered','opened','clicked','suppressed','bounced','complained','unsubscribed'];
begin
  if array_position(states,old.status)>array_position(states,new.status) then new.status:=old.status; end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.email_campaign_record_provider_event(p_event_id text, p_provider_id text, p_event_type text, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.email_campaign_recipients%rowtype; receipt public.email_campaign_provider_receipts%rowtype;
  mapped text; occurred timestamptz;
begin
  if coalesce(p_event_id,'')='' or coalesce(p_provider_id,'')='' then raise exception 'Provider event identity is required.'; end if;
  if p_event_type not in ('email.sent','email.delivered','email.delivery_delayed','email.opened','email.clicked','email.bounced','email.complained','email.failed','email.suppressed') then return false; end if;
  insert into public.email_campaign_provider_receipts(event_id,provider_message_id,event_type,payload)
    values(p_event_id,p_provider_id,p_event_type,p_payload) on conflict(event_id) do nothing;
  -- Lock recipients before receipts, also used by the acceptance function.
  select * into r from public.email_campaign_recipients where provider_message_id=p_provider_id for update;
  if r.id is null then return false; end if;
  select * into strict receipt from public.email_campaign_provider_receipts where event_id=p_event_id for update;
  if receipt.provider_message_id<>p_provider_id or receipt.event_type<>p_event_type then raise exception 'Provider event identity conflict.'; end if;
  if receipt.processed_at is not null then return true; end if;
  mapped:=substring(receipt.event_type from 7);
  begin occurred:=(receipt.payload->>'created_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then occurred:=null; end;
  occurred:=coalesce(occurred,receipt.received_at);
  insert into public.email_events(organisation_id,campaign_id,recipient_id,provider,provider_event_id,event_type,url,payload,occurred_at,engagement_class)
    values(r.organisation_id,r.campaign_id,r.id,'resend',receipt.event_id,mapped,
      coalesce(receipt.payload#>>'{data,click,link}',receipt.payload#>>'{data,url}'),receipt.payload,occurred,public.marketing_engagement_class(coalesce(receipt.payload#>>'{data,click,userAgent}',receipt.payload#>>'{data,open,userAgent}'),''))
    on conflict(provider,provider_event_id) do nothing;
  update public.email_campaign_recipients set status=case when mapped='delivery_delayed' then status when mapped='failed' and status in ('sent','sending','queued') then 'failed' when mapped='failed' then status when mapped='clicked' and public.marketing_engagement_class(coalesce(receipt.payload#>>'{data,click,userAgent}',receipt.payload#>>'{data,open,userAgent}'),'')='known_automation' then status else mapped end,updated_at=now(),
    sent_at=case when mapped='sent' then coalesce(sent_at,occurred) else sent_at end,
    delivered_at=case when mapped='delivered' then coalesce(delivered_at,occurred) else delivered_at end,
    opened_at=case when mapped='opened' then coalesce(opened_at,occurred) else opened_at end,
    clicked_at=case when mapped='clicked' and public.marketing_engagement_class(coalesce(receipt.payload#>>'{data,click,userAgent}',receipt.payload#>>'{data,open,userAgent}'),'')<>'known_automation' then coalesce(clicked_at,occurred) else clicked_at end,
    bounced_at=case when mapped='bounced' then coalesce(bounced_at,occurred) else bounced_at end,
    error_reason=case when mapped='suppressed' then 'Suppressed by the email provider.' when mapped in ('failed','delivery_delayed') then left(coalesce(receipt.payload#>>'{data,failed,reason}',receipt.payload#>>'{data,error,message}',receipt.payload#>>'{data,reason}',case mapped when 'failed' then 'The provider reported a sending failure.' else 'The receiving server temporarily delayed delivery.' end),500) when mapped='delivered' then null else error_reason end
    where id=r.id;
  if mapped in ('bounced','complained','suppressed') then
    insert into public.email_suppressions(organisation_id,email,reason,source)
      values(r.organisation_id,r.email,case mapped when 'bounced' then 'hard_bounce' when 'complained' then 'complaint' else 'provider_suppression' end,'resend')
      on conflict(organisation_id,email) do update set
        reason=case when public.email_suppressions.reason='complaint' or excluded.reason='complaint' then 'complaint'
          when public.email_suppressions.reason in ('hard_bounce','provider_suppression') then public.email_suppressions.reason
          else excluded.reason end;
  end if;
  update public.email_campaign_provider_receipts set processed_at=now() where event_id=receipt.event_id;
  return true;
end $function$;

-- Event aggregation remains independent of today's consent/delivery status.
create view public.email_campaign_recipient_facts with (security_invoker=true) as
select r.id,r.organisation_id,r.campaign_id,
  coalesce(r.sent_at,c.sent_at,c.created_at) cohort_at,
  (r.sent_at is not null or r.provider_message_id is not null or coalesce(e.accepted,false)) accepted,
  (r.delivered_at is not null or coalesce(e.delivered,false)) delivered,
  (coalesce(e.filtered_opened,false) or (r.opened_at is not null and not coalesce(e.opened,false))) opened,
  (r.opened_at is not null or coalesce(e.opened,false)) raw_opened,
  (coalesce(e.filtered_clicked,false) or (r.clicked_at is not null and not coalesce(e.raw_clicked,false))) clicked,
  (r.clicked_at is not null or coalesce(e.raw_clicked,false)) raw_clicked,
  (r.bounced_at is not null or coalesce(e.bounced,false)) bounced,
  coalesce(e.complained,false) complained,
  coalesce(e.unsubscribed,false) unsubscribed,
  (r.status='failed' or coalesce(e.failed,false)) failed,
  (r.status='suppressed' or coalesce(e.suppressed,false)) suppressed,
  (coalesce(e.delayed,false) and r.delivered_at is null and not coalesce(e.delivered or e.failed or e.bounced or e.suppressed,false)) delivery_delayed,
  coalesce(e.automated_clicks,0) automated_clicks,
  coalesce(e.unknown_opens,0) unknown_opens,coalesce(e.proxy_opens,0) proxy_opens,coalesce(e.automated_opens,0) automated_opens
from public.email_campaign_recipients r join public.email_campaigns c on c.id=r.campaign_id and c.organisation_id=r.organisation_id
left join (
  select recipient_id,
    bool_or(event_type='sent') accepted,bool_or(event_type='delivered') delivered,
    bool_or(event_type='opened') opened,bool_or(event_type='opened' and engagement_class='unknown') filtered_opened,bool_or(event_type='clicked') raw_clicked,
    bool_or(event_type='clicked' and engagement_class<>'known_automation') filtered_clicked,
    bool_or(event_type='bounced') bounced,bool_or(event_type='complained') complained,
    bool_or(event_type='unsubscribed') unsubscribed,bool_or(event_type='failed') failed,
    bool_or(event_type='suppressed') suppressed,bool_or(event_type='delivery_delayed') delayed,
    count(*) filter(where event_type='clicked' and engagement_class='known_automation')::integer automated_clicks,
    count(*) filter(where event_type='opened' and engagement_class='unknown')::integer unknown_opens,
    count(*) filter(where event_type='opened' and engagement_class='known_proxy')::integer proxy_opens,
    count(*) filter(where event_type='opened' and engagement_class='known_automation')::integer automated_opens
  from public.email_events group by recipient_id
) e on e.recipient_id=r.id;
grant select on public.email_campaign_recipient_facts to authenticated,service_role;

create or replace view public.email_campaign_performance with (security_invoker=true) as
select c.id campaign_id,c.organisation_id,count(f.id)::integer recipients,
  count(*) filter(where f.delivered)::integer delivered,count(*) filter(where f.opened)::integer opened,
  count(*) filter(where f.clicked)::integer clicked,count(*) filter(where f.bounced)::integer bounced,
  count(*) filter(where f.unsubscribed)::integer unsubscribed,count(*) filter(where f.failed)::integer failed,
  count(*) filter(where f.accepted)::integer accepted,count(*) filter(where f.complained)::integer complaints,
  count(*) filter(where f.suppressed)::integer suppressed,count(*) filter(where f.delivery_delayed)::integer delivery_delayed,
  count(*) filter(where f.raw_clicked)::integer raw_clicked,coalesce(sum(f.automated_clicks),0)::integer automated_clicks,
  coalesce(sum(f.unknown_opens),0)::integer unknown_open_events,
  count(*) filter(where f.raw_opened)::integer raw_opened,coalesce(sum(f.proxy_opens),0)::integer proxy_open_events,coalesce(sum(f.automated_opens),0)::integer automated_open_events
from public.email_campaigns c left join public.email_campaign_recipient_facts f on f.campaign_id=c.id group by c.id,c.organisation_id;

create or replace view public.email_deliverability_health with (security_invoker=true) as
select c.organisation_id,c.sender_identity_id,count(f.id)::integer recipients,
  count(*) filter(where f.accepted)::integer sent,count(*) filter(where f.delivered)::integer delivered,
  count(*) filter(where f.bounced)::integer bounced,count(*) filter(where f.complained)::integer complaints,
  count(*) filter(where f.unsubscribed)::integer unsubscribed,
  case when count(*) filter(where f.accepted)=0 then 'warming'
    when count(*) filter(where f.complained)::numeric/nullif(count(*) filter(where f.accepted),0)>0.001 then 'paused'
    when count(*) filter(where f.bounced)::numeric/nullif(count(*) filter(where f.accepted),0)>0.05 then 'warning'
    else 'healthy' end health_status
from public.email_campaigns c left join public.email_campaign_recipient_facts f on f.campaign_id=c.id group by c.organisation_id,c.sender_identity_id;

create or replace view public.email_campaign_daily_performance with (security_invoker=true) as
select c.organisation_id,(f.cohort_at at time zone 'Africa/Johannesburg')::date metric_date,
  count(f.id)::integer recipients,count(*) filter(where f.accepted)::integer sent,
  count(*) filter(where f.delivered)::integer delivered,count(*) filter(where f.opened)::integer opened,
  count(*) filter(where f.clicked)::integer clicked,count(*) filter(where f.bounced)::integer bounced,
  count(*) filter(where f.unsubscribed)::integer unsubscribed
from public.email_campaigns c left join public.email_campaign_recipient_facts f on f.campaign_id=c.id
where c.status<>'draft' and f.id is not null group by c.organisation_id,(f.cohort_at at time zone 'Africa/Johannesburg')::date;

create or replace view public.email_campaign_category_performance with (security_invoker=true) as
select c.organisation_id,st.id subscription_type_id,st.name subscription_type,count(f.id)::integer recipients,
  count(*) filter(where f.delivered)::integer delivered,count(*) filter(where f.opened)::integer opened,
  count(*) filter(where f.clicked)::integer clicked,count(*) filter(where f.bounced)::integer bounced,
  count(*) filter(where f.unsubscribed)::integer unsubscribed
from public.email_campaigns c join public.email_subscription_types st on st.id=c.subscription_type_id
left join public.email_campaign_recipient_facts f on f.campaign_id=c.id group by c.organisation_id,st.id,st.name;

create or replace view public.email_campaign_link_performance with (security_invoker=true) as
select l.campaign_id,l.organisation_id,l.target_url,
  count(e.id) filter(where e.engagement_class<>'known_automation')::integer clicks,
  count(distinct e.recipient_id) filter(where e.engagement_class<>'known_automation')::integer unique_clickers,
  max(e.occurred_at) filter(where e.engagement_class<>'known_automation') last_clicked_at,
  count(e.id)::integer raw_clicks,count(e.id) filter(where e.engagement_class='known_automation')::integer automated_clicks
from public.email_campaign_links l left join public.email_events e on e.campaign_id=l.campaign_id and e.event_type='clicked' and e.url=l.target_url
group by l.campaign_id,l.organisation_id,l.target_url;

create index email_events_recipient_latest on public.email_events(recipient_id,occurred_at desc,id desc);
create index email_preference_events_organisation_time on public.email_preference_events(organisation_id,occurred_at desc);
create view public.email_campaign_recipient_activity with (security_invoker=true) as
select r.id,r.organisation_id,r.campaign_id,r.email,r.recipient_snapshot,r.status,r.error_reason,r.sent_at,
  r.delivered_at,r.opened_at,r.clicked_at,r.bounced_at,r.created_at,
  e.event_type latest_event_type,e.occurred_at latest_event_at,e.url latest_event_url,e.engagement_class latest_engagement_class
from public.email_campaign_recipients r left join lateral (
  select event_type,occurred_at,url,engagement_class from public.email_events
  where recipient_id=r.id order by occurred_at desc,id desc limit 1
) e on true;
grant select on public.email_campaign_recipient_activity to authenticated,service_role;

commit;
