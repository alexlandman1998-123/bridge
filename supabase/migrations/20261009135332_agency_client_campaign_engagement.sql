-- Primary agency workspace: recipient evidence follows reviewed client identities.
-- Requires the client identity/activity migrations and existing email campaigns.
begin;
create table public.agency_client_campaign_recipients (
  recipient_id uuid primary key references public.email_campaign_recipients(id) on delete cascade,
  organisation_id uuid not null,
  client_id uuid not null,
  recorded_at timestamptz not null default now(),
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id)
);
create index agency_client_campaign_profile on public.agency_client_campaign_recipients(organisation_id,client_id,recipient_id);
create index email_events_client_recipient on public.email_events(organisation_id,recipient_id,event_type,occurred_at);
create table public.agency_client_campaign_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  recipient_id uuid not null references public.agency_client_campaign_recipients(recipient_id) on delete cascade,
  request_id uuid not null,
  response_kind text not null check (response_kind in ('email_reply','phone_reply','enquiry','rsvp','other')),
  detail text not null check (length(trim(detail)) between 1 and 4000),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_id uuid not null,
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id),
  unique (organisation_id,request_id)
);
create index agency_client_campaign_response_profile on public.agency_client_campaign_responses(organisation_id,client_id);
create index agency_client_campaign_response_recipient on public.agency_client_campaign_responses(recipient_id,occurred_at desc,id desc);
alter table public.agency_client_campaign_recipients enable row level security;
alter table public.agency_client_campaign_responses enable row level security;
revoke all on public.agency_client_campaign_recipients,public.agency_client_campaign_responses from public,anon,authenticated;
grant select on public.agency_client_campaign_recipients,public.agency_client_campaign_responses to authenticated;
grant all on public.agency_client_campaign_recipients,public.agency_client_campaign_responses to service_role;

-- Invoker preserves campaign and recipient RLS. Matching uses known email aliases
-- within one agency, never a name/phone or a guessed UTM campaign-name match.
create function arch9_client_private.campaign_recipient_visible(p_org uuid,p_recipient uuid,p_client uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select arch9_client_private.can_read_client(p_client) and exists (
    select 1 from public.email_campaign_recipients r
    join public.email_campaigns c on c.id=r.campaign_id and c.organisation_id=r.organisation_id
    join public.agency_client_identifiers i on i.organisation_id=r.organisation_id and i.kind='email' and i.value=lower(trim(r.email))
    join public.agency_client_profiles p on p.id=p_client and p.organisation_id=i.organisation_id
    where r.id=p_recipient and r.organisation_id=p_org and i.client_id=coalesce(p.merged_into,p.id)
  );
$$;
revoke all on function arch9_client_private.campaign_recipient_visible(uuid,uuid,uuid) from public,anon;
grant execute on function arch9_client_private.campaign_recipient_visible(uuid,uuid,uuid) to authenticated;
create policy agency_client_campaign_read on public.agency_client_campaign_recipients for select to authenticated using (
  arch9_client_private.campaign_recipient_visible(organisation_id,recipient_id,client_id));
create policy agency_client_campaign_response_read on public.agency_client_campaign_responses for select to authenticated using (
  arch9_client_private.campaign_recipient_visible(organisation_id,recipient_id,client_id));

create function arch9_client_private.capture_client_campaign(p_recipient uuid,p_historical boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r public.email_campaign_recipients; c public.email_campaigns; b public.agency_client_campaign_recipients; v_client uuid; v_event record;
begin
  select * into r from public.email_campaign_recipients where id=p_recipient;
  select * into c from public.email_campaigns where id=r.campaign_id and organisation_id=r.organisation_id;
  if r.id is null or c.id is null or r.recipient_snapshot->>'is_demo_data'='true' then return; end if;
  select client_id into v_client from public.agency_client_identifiers where organisation_id=r.organisation_id and kind='email' and value=lower(trim(r.email));
  if v_client is null then return; end if;
  insert into public.agency_client_campaign_recipients(recipient_id,organisation_id,client_id) values(r.id,r.organisation_id,v_client) on conflict do nothing;
  select * into b from public.agency_client_campaign_recipients where recipient_id=r.id;
  -- A source reassigned to another person must not move old history to them.
  if not exists(select 1 from public.agency_client_profiles p where p.id=b.client_id and coalesce(p.merged_into,p.id)=v_client and p.organisation_id=r.organisation_id) then return; end if;
  for v_event in
    select kind,min(at) as occurred_at from (
      values ('sent',r.sent_at),('delivered',r.delivered_at),('opened',r.opened_at),('clicked',r.clicked_at),('bounced',r.bounced_at)
    ) cached(kind,at) where at is not null group by kind
    union all
    select e.event_type,min(e.occurred_at) from public.email_events e where e.recipient_id=r.id and e.organisation_id=r.organisation_id and e.campaign_id=r.campaign_id
      and e.event_type in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed') group by e.event_type
  loop
    insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,detail,actor_kind,origin_table,origin_id,event_key,occurred_at,historical)
    values(b.organisation_id,b.client_id,'interaction','campaign.'||v_event.kind,'Campaign '||v_event.kind,left(c.name,180),
      case when p_historical then 'historical' else 'system' end,'email_campaign_recipients',r.id,'campaign:'||r.id||':'||v_event.kind,v_event.occurred_at,p_historical)
    on conflict do nothing;
  end loop;
end;
$$;
create function arch9_client_private.client_campaign_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if tg_table_name='email_campaign_recipients' then perform arch9_client_private.capture_client_campaign(new.id);
  elsif tg_table_name='email_events' then
    -- A provider event must belong to this exact agency/campaign recipient.
    if exists(select 1 from public.email_campaign_recipients where id=new.recipient_id and organisation_id=new.organisation_id and campaign_id=new.campaign_id) then perform arch9_client_private.capture_client_campaign(new.recipient_id); end if;
  elsif new.kind='email' then
    for r in select id,created_at from public.email_campaign_recipients where organisation_id=new.organisation_id and email=new.value loop
      perform arch9_client_private.capture_client_campaign(r.id,r.created_at<transaction_timestamp());
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function arch9_client_private.capture_client_campaign(uuid,boolean),arch9_client_private.client_campaign_trigger() from public,anon,authenticated;
create trigger agency_client_campaign_recipient after insert or update on public.email_campaign_recipients for each row execute function arch9_client_private.client_campaign_trigger();
create trigger agency_client_campaign_event after insert or update on public.email_events for each row execute function arch9_client_private.client_campaign_trigger();
create trigger agency_client_campaign_identity after insert or update on public.agency_client_identifiers for each row execute function arch9_client_private.client_campaign_trigger();

create or replace function arch9_client_private.activity_origin_visible(p_table text,p_id uuid) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare v_key text; v_visible boolean;
begin
  if p_table='email_campaign_recipients' then return exists(select 1 from public.agency_client_campaign_recipients where recipient_id=p_id); end if;
  if p_table='agency_client_campaign_responses' then return exists(select 1 from public.agency_client_campaign_responses where id=p_id); end if;
  if p_table in ('manual','profile','portal_visit','source_removal') then return true; end if;
  v_key:=case p_table when 'leads' then 'lead_id' when 'contacts' then 'contact_id'
    when 'lead_activities' then 'activity_id' when 'tasks' then 'task_id'
    when 'appointments' then 'appointment_id' when 'appointment_participants' then 'participant_id'
    when 'buyers' then 'id' when 'canvassing_prospects' then 'id'
    when 'transactions' then 'id' when 'transaction_events' then 'id' when 'transaction_comments' then 'id'
    when 'documents' then 'id' when 'offers' then 'id' when 'private_listing_activity' then 'id'
    when 'private_listing_seller_onboarding' then 'id' when 'buyer_viewing_preference_links' then 'id'
    when 'seller_viewing_coordination_links' then 'id' end;
  if p_table in ('client_issues','alteration_requests','service_reviews','transaction_handover','transaction_onboarding','transaction_bond_applications','client_portal_notifications','private_listing_documents') then v_key:='id'; end if;
  if v_key is null then return false; end if;
  execute format('select exists(select 1 from public.%I where %I=$1)',p_table,v_key) into v_visible using p_id;
  return v_visible;
exception when insufficient_privilege then return false;
end;
$$;

-- Safe projection excludes message bodies, tracking tokens, provider payloads,
-- redirect URLs and errors. One row represents one addressed campaign delivery.
create function arch9_client_private.client_campaign_rows(p_client_id uuid)
returns table(id uuid,campaign_id uuid,campaign_name text,subject text,email text,status text,created_at timestamptz,sent_at timestamptz,delivered_at timestamptz,opened_at timestamptz,clicked_at timestamptz,open_count bigint,click_count bigint,response_count bigint,responses jsonb)
language sql stable security invoker set search_path='' as $$
  select r.id,c.id,c.name,c.subject,r.email,r.status,r.created_at,
    least(r.sent_at,e.sent_at),least(r.delivered_at,e.delivered_at),least(r.opened_at,e.opened_at),least(r.clicked_at,e.clicked_at),
    greatest(e.open_count,case when r.opened_at is not null then 1 else 0 end),greatest(e.click_count,case when r.clicked_at is not null then 1 else 0 end),
    (select count(*) from public.agency_client_campaign_responses s where s.recipient_id=r.id and s.organisation_id=r.organisation_id),
    coalesce((select jsonb_agg(to_jsonb(s) order by s.occurred_at desc,s.id desc) from (
      select s.id,s.response_kind,s.detail,s.occurred_at,s.recorded_at,'staff_confirmed'::text as evidence_kind
      from public.agency_client_campaign_responses s where s.recipient_id=r.id and s.organisation_id=r.organisation_id order by s.occurred_at desc,s.id desc limit 20
    ) s),'[]'::jsonb)
  from public.agency_client_profiles requested
  join public.agency_client_profiles p on p.organisation_id=requested.organisation_id and coalesce(p.merged_into,p.id)=coalesce(requested.merged_into,requested.id)
  join public.agency_client_campaign_recipients b on b.organisation_id=p.organisation_id and b.client_id=p.id
  join public.email_campaign_recipients r on r.id=b.recipient_id and r.organisation_id=b.organisation_id
  join public.email_campaigns c on c.id=r.campaign_id and c.organisation_id=r.organisation_id
  left join lateral (
    select min(occurred_at) filter(where event_type='sent') as sent_at,min(occurred_at) filter(where event_type='delivered') as delivered_at,
      min(occurred_at) filter(where event_type='opened') as opened_at,min(occurred_at) filter(where event_type='clicked') as clicked_at,
      count(*) filter(where event_type='opened') as open_count,count(*) filter(where event_type='clicked') as click_count
    from public.email_events where recipient_id=r.id and organisation_id=r.organisation_id and campaign_id=r.campaign_id
  ) e on true where requested.id=p_client_id;
$$;
create function public.agency_client_campaign_page(p_client_id uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 26)
returns table(id uuid,campaign_id uuid,campaign_name text,subject text,email text,status text,created_at timestamptz,sent_at timestamptz,delivered_at timestamptz,opened_at timestamptz,clicked_at timestamptz,open_count bigint,click_count bigint,response_count bigint,responses jsonb)
language sql stable security invoker set search_path='' as $$
  select * from arch9_client_private.client_campaign_rows(p_client_id) r
  where ((p_before_at is null and p_before_id is null) or (r.created_at,r.id)<(p_before_at,p_before_id))
  order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(p_limit,26),101));
$$;
create function public.agency_client_campaign_summary(p_client_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select case when exists(select 1 from public.agency_client_profiles where id=p_client_id) then (
    select jsonb_build_object('campaignCount',count(distinct campaign_id),'sentCount',count(*) filter(where sent_at is not null),
      'deliveredCount',count(*) filter(where delivered_at is not null),'openedCount',count(*) filter(where opened_at is not null),
      'clickedCount',count(*) filter(where clicked_at is not null),'respondedCount',count(distinct campaign_id) filter(where response_count>0))
    from arch9_client_private.client_campaign_rows(p_client_id)
  ) end;
$$;
revoke all on function arch9_client_private.client_campaign_rows(uuid),public.agency_client_campaign_page(uuid,timestamptz,uuid,integer),public.agency_client_campaign_summary(uuid) from public,anon;
grant execute on function arch9_client_private.client_campaign_rows(uuid),public.agency_client_campaign_page(uuid,timestamptz,uuid,integer),public.agency_client_campaign_summary(uuid) to authenticated;

create function arch9_client_private.log_campaign_response(p_client_id uuid,p_recipient_id uuid,p_request_id uuid,p_kind text,p_detail text,p_occurred_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.agency_client_profiles; r public.email_campaign_recipients; campaign public.email_campaigns; b public.agency_client_campaign_recipients; existing public.agency_client_campaign_responses; v_id uuid; v_sent_at timestamptz;
begin
  select * into c from public.agency_client_profiles where id=p_client_id;
  if c.id is null or auth.uid() is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c.organisation_id::text,0));
  select * into c from public.agency_client_profiles where id=p_client_id;
  if c.merged_into is not null then select * into c from public.agency_client_profiles where id=c.merged_into; end if;
  select * into r from public.email_campaign_recipients where id=p_recipient_id and organisation_id=c.organisation_id;
  select * into campaign from public.email_campaigns where id=r.campaign_id and organisation_id=c.organisation_id;
  select * into b from public.agency_client_campaign_recipients where recipient_id=r.id and organisation_id=c.organisation_id;
  -- Explicit caller authorization here is essential: this mutator bypasses RLS.
  if not arch9_client_private.can_read_client(c.id) or r.id is null or campaign.id is null or b.recipient_id is null
    or not (public.email_campaign_can_send(c.organisation_id) or campaign.created_by=auth.uid())
    or not exists(select 1 from public.agency_client_profiles p where p.id=b.client_id and coalesce(p.merged_into,p.id)=c.id)
    or not exists(select 1 from public.agency_client_identifiers i where i.client_id=c.id and i.organisation_id=c.organisation_id and i.kind='email' and i.value=lower(trim(r.email))) then
    raise exception 'Campaign recipient access required.' using errcode='42501'; end if;
  select least(r.sent_at,min(e.occurred_at)) into v_sent_at from public.email_events e where e.recipient_id=r.id and e.campaign_id=r.campaign_id and e.organisation_id=r.organisation_id and e.event_type='sent';
  if p_request_id is null or p_kind is null or p_kind not in ('email_reply','phone_reply','enquiry','rsvp','other') or length(trim(coalesce(p_detail,''))) not between 1 and 4000
    or p_occurred_at is null or v_sent_at is null or p_occurred_at<v_sent_at or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'Record a confirmed response with details and a time after this campaign was sent.' using errcode='22023'; end if;
  select * into existing from public.agency_client_campaign_responses where organisation_id=c.organisation_id and request_id=p_request_id;
  if existing.id is not null then
    if existing.recipient_id<>r.id or existing.actor_id<>auth.uid() or existing.response_kind<>p_kind or existing.detail<>trim(p_detail) or existing.occurred_at<>p_occurred_at then
      raise exception 'This request ID already records another response.' using errcode='22023'; end if;
    return existing.id;
  end if;
  insert into public.agency_client_campaign_responses(organisation_id,client_id,recipient_id,request_id,response_kind,detail,occurred_at,actor_id)
    values(c.organisation_id,c.id,r.id,p_request_id,p_kind,trim(p_detail),p_occurred_at,auth.uid()) returning id into v_id;
  insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,detail,actor_id,actor_name,actor_kind,origin_table,origin_id,event_key,occurred_at)
    values(c.organisation_id,c.id,'interaction','campaign.response','Campaign response recorded',left(campaign.name||': '||trim(p_detail),4000),auth.uid(),arch9_client_private.activity_actor_name(auth.uid()),'staff','agency_client_campaign_responses',v_id,'campaign-response:'||v_id,p_occurred_at);
  return v_id;
end;
$$;
create function public.agency_client_log_campaign_response(p_client_id uuid,p_recipient_id uuid,p_request_id uuid,p_kind text,p_detail text,p_occurred_at timestamptz) returns uuid
language sql security invoker set search_path='' as $$ select arch9_client_private.log_campaign_response(p_client_id,p_recipient_id,p_request_id,p_kind,p_detail,p_occurred_at); $$;
revoke all on function arch9_client_private.log_campaign_response(uuid,uuid,uuid,text,text,timestamptz),public.agency_client_log_campaign_response(uuid,uuid,uuid,text,text,timestamptz) from public,anon;
grant execute on function arch9_client_private.log_campaign_response(uuid,uuid,uuid,text,text,timestamptz),public.agency_client_log_campaign_response(uuid,uuid,uuid,text,text,timestamptz) to authenticated;
do $$ declare r record; begin
  for r in select id from public.email_campaign_recipients loop perform arch9_client_private.capture_client_campaign(r.id,true); end loop;
end $$;
commit;
