begin;

-- Capabilities contain no contact addresses. Only service code can issue them.
create table public.marketing_attribution_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  channel text not null check(channel in ('email','whatsapp')),
  email_campaign_id uuid references public.email_campaigns(id) on delete cascade,
  whatsapp_campaign_id uuid references public.whatsapp_campaigns(id) on delete cascade,
  email_recipient_id uuid references public.email_campaign_recipients(id) on delete cascade,
  whatsapp_recipient_id uuid references public.whatsapp_campaign_recipients(id) on delete cascade,
  campaign_id uuid generated always as (coalesce(email_campaign_id,whatsapp_campaign_id)) stored,
  recipient_id uuid generated always as (coalesce(email_recipient_id,whatsapp_recipient_id)) stored,
  target_url text not null check(target_url ~* '^https?://' and length(target_url)<=4096),
  -- A compact index key supports long URLs. Equality is also checked below;
  -- this fingerprint is never an authentication capability.
  target_key text generated always as (md5(target_url)) stored,
  created_at timestamptz not null default now(),
  check ((channel='email' and email_campaign_id is not null and whatsapp_campaign_id is null and whatsapp_recipient_id is null)
    or (channel='whatsapp' and whatsapp_campaign_id is not null and email_campaign_id is null and email_recipient_id is null)),
  unique nulls not distinct(channel,campaign_id,recipient_id,target_key)
);
create index marketing_attribution_links_campaign on public.marketing_attribution_links(organisation_id,channel,campaign_id);
alter table public.marketing_attribution_links enable row level security;
revoke all on public.marketing_attribution_links from public,anon,authenticated;
grant all on public.marketing_attribution_links to service_role;
-- Reporting can read identifiers, not bearer tokens or destination URLs.
grant select(id,organisation_id,channel,campaign_id,recipient_id,created_at) on public.marketing_attribution_links to authenticated;
create policy marketing_attribution_links_read on public.marketing_attribution_links for select to authenticated
  using(public.bridge_has_organisation_membership(organisation_id));

create function public.marketing_create_attribution_link(p_channel text,p_campaign_id uuid,p_recipient_id uuid,p_target_url text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare org uuid; recipient_org uuid; recipient_campaign uuid; link public.marketing_attribution_links%rowtype;
begin
  if p_target_url !~* '^https?://' or length(p_target_url)>4096 then raise exception 'Use an HTTP or HTTPS destination.' using errcode='22023'; end if;
  if p_channel='email' then
    select organisation_id into org from public.email_campaigns where id=p_campaign_id;
    if p_recipient_id is not null then select organisation_id,campaign_id into recipient_org,recipient_campaign from public.email_campaign_recipients where id=p_recipient_id; end if;
  elsif p_channel='whatsapp' then
    select organisation_id into org from public.whatsapp_campaigns where id=p_campaign_id;
    if p_recipient_id is not null then select organisation_id,campaign_id into recipient_org,recipient_campaign from public.whatsapp_campaign_recipients where id=p_recipient_id; end if;
  else raise exception 'Invalid marketing channel.' using errcode='22023'; end if;
  if org is null or (p_recipient_id is not null and (recipient_org is distinct from org or recipient_campaign is distinct from p_campaign_id)) then
    raise exception 'Campaign recipient does not match this organisation.' using errcode='23514';
  end if;
  insert into public.marketing_attribution_links(organisation_id,channel,email_campaign_id,whatsapp_campaign_id,email_recipient_id,whatsapp_recipient_id,target_url)
    values(org,p_channel,case when p_channel='email' then p_campaign_id end,case when p_channel='whatsapp' then p_campaign_id end,
      case when p_channel='email' then p_recipient_id end,case when p_channel='whatsapp' then p_recipient_id end,p_target_url)
    on conflict(channel,campaign_id,recipient_id,target_key) do update set target_url=excluded.target_url where public.marketing_attribution_links.target_url=excluded.target_url returning * into link;
  if link.id is null then raise exception 'Destination fingerprint conflict. Use another destination.' using errcode='23505'; end if;
  return jsonb_build_object('token',link.token,'id',link.id,'firstParty',exists(select 1 from public.website_domains d join public.website_sites s on s.id=d.website_site_id where s.organisation_id=org and s.status='published' and d.status='active' and lower(d.hostname)=substring(lower(p_target_url) from '^https?://([^/:?#]+)')));
end $$;
revoke all on function public.marketing_create_attribution_link(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketing_create_attribution_link(text,uuid,uuid,text) to service_role;

create table public.marketing_link_clicks (
  id uuid primary key default gen_random_uuid(),link_id uuid not null references public.marketing_attribution_links(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  engagement_class text not null check(engagement_class in ('unknown','known_automation','known_proxy')),
  occurred_at timestamptz not null default now()
);
alter table public.marketing_link_clicks enable row level security;
revoke all on public.marketing_link_clicks from public,anon,authenticated;
grant all on public.marketing_link_clicks to service_role;
grant select on public.marketing_link_clicks to authenticated;
create policy marketing_link_clicks_read on public.marketing_link_clicks for select to authenticated using(public.bridge_has_organisation_membership(organisation_id));
create index marketing_link_clicks_link on public.marketing_link_clicks(link_id,occurred_at);
create function public.marketing_resolve_attribution_link(p_token text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('url',a.target_url,'firstParty',exists(select 1 from public.website_domains d join public.website_sites s on s.id=d.website_site_id where s.organisation_id=a.organisation_id and s.status='published' and d.status='active' and lower(d.hostname)=substring(lower(a.target_url) from '^https?://([^/:?#]+)'))) from public.marketing_attribution_links a where a.token=p_token
$$;
create function public.marketing_record_link_click(p_token text,p_metadata jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare l public.marketing_attribution_links%rowtype;
begin
  select * into l from public.marketing_attribution_links where token=p_token;
  if not found then return false; end if;
  insert into public.marketing_link_clicks(link_id,organisation_id,engagement_class)
    values(l.id,l.organisation_id,public.marketing_engagement_class(p_metadata->>'userAgent',p_metadata->>'purpose'));
  return true;
end $$;
revoke all on function public.marketing_resolve_attribution_link(text),public.marketing_record_link_click(text,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_resolve_attribution_link(text),public.marketing_record_link_click(text,jsonb) to service_role;

-- Server timestamps define the 30-day window. Recent link creation also
-- covers the short race between redirect and its background click insert.
create function public.marketing_attribution_in_window(p_id uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.marketing_attribution_links a where a.id=p_id and a.created_at<=p_at and
    (a.created_at>=p_at-interval '30 days' or exists(select 1 from public.marketing_link_clicks k where k.link_id=a.id and k.engagement_class<>'known_automation' and k.occurred_at between p_at-interval '30 days' and p_at)))
$$;
revoke all on function public.marketing_attribution_in_window(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_attribution_in_window(uuid,timestamptz) to service_role;

create table public.website_measurement_events (
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  event_id uuid not null,organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text not null check(length(session_id) between 12 and 100),
  event_type text not null check(event_type in ('site_visit','page_view','listing_view')),
  page_path text not null,listing_id uuid,
  first_link_id uuid references public.marketing_attribution_links(id) on delete set null,
  last_link_id uuid references public.marketing_attribution_links(id) on delete set null,
  occurred_at timestamptz not null default now(),
  primary key(website_site_id,event_id)
);
create unique index website_measurement_once_per_session on public.website_measurement_events(website_site_id,session_id) where event_type='site_visit';
create index website_measurement_freshness on public.website_measurement_events(website_site_id,occurred_at desc);
create index website_measurement_attribution on public.website_measurement_events(last_link_id,occurred_at) where last_link_id is not null;
alter table public.website_measurement_events enable row level security;
revoke all on public.website_measurement_events from public,anon,authenticated;
grant all on public.website_measurement_events to service_role;
grant select(website_site_id,event_id,organisation_id,event_type,last_link_id,occurred_at) on public.website_measurement_events to authenticated;
create policy website_measurement_member_read on public.website_measurement_events for select to authenticated using(public.bridge_has_organisation_membership(organisation_id));

create function public.website_record_measurement_event(p_hostname text,p_event_type text,p_page_path text,p_listing_id uuid,p_event_id uuid,p_session_id text,p_context jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare site public.website_sites%rowtype; first_id uuid; last_id uuid; inserted integer;
begin
  if p_session_id !~ '^[a-zA-Z0-9_-]{12,100}$' or jsonb_typeof(p_context) is distinct from 'object' or length(p_context::text)>8192 then
    raise exception 'Invalid measurement context.' using errcode='22023'; end if;
  select s.* into site from public.website_domains d join public.website_sites s on s.id=d.website_site_id
    where lower(d.hostname)=lower(trim(p_hostname)) and d.status='active' and s.status='published'
    order by d.is_primary desc,d.created_at limit 1;
  if site.id is null then raise exception 'Published website not found.' using errcode='P0002'; end if;
  select id into first_id from public.marketing_attribution_links where token=p_context#>>'{firstTouch,token}'
    and organisation_id=site.organisation_id and public.marketing_attribution_in_window(id,now());
  select id into last_id from public.marketing_attribution_links where token=p_context#>>'{lastTouch,token}'
    and organisation_id=site.organisation_id and public.marketing_attribution_in_window(id,now());
  insert into public.website_measurement_events(website_site_id,event_id,organisation_id,session_id,event_type,page_path,listing_id,first_link_id,last_link_id)
    values(site.id,p_event_id,site.organisation_id,p_session_id,p_event_type,p_page_path,p_listing_id,first_id,last_id) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then perform public.website_record_analytics_event(p_hostname,p_event_type,p_page_path,p_listing_id); end if;
end $$;
revoke all on function public.website_record_measurement_event(text,text,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.website_record_measurement_event(text,text,text,uuid,uuid,text,jsonb) to service_role;

-- CRM-confirmed conversions. Personal entity identifiers stay server-only.
create table public.marketing_conversions (
  id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete cascade,
  link_id uuid not null references public.marketing_attribution_links(id) on delete cascade,
  channel text not null check(channel in ('email','whatsapp')),campaign_id uuid not null,
  kind text not null check(kind in ('lead_created','appointment_created','transaction_created','transaction_registered')),
  source_key text not null,lead_id uuid references public.leads(lead_id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  active boolean not null default true,occurred_at timestamptz not null default now(),
  unique(organisation_id,channel,campaign_id,kind,source_key)
);
create index marketing_conversions_lead on public.marketing_conversions(lead_id) where lead_id is not null;
create index marketing_conversions_campaign on public.marketing_conversions(organisation_id,channel,campaign_id,kind);
alter table public.marketing_conversions enable row level security;
revoke all on public.marketing_conversions from public,anon,authenticated;
grant all on public.marketing_conversions to service_role;
grant select(id,organisation_id,channel,campaign_id,kind,active,occurred_at) on public.marketing_conversions to authenticated;
create policy marketing_conversions_member_read on public.marketing_conversions for select to authenticated using(public.bridge_has_organisation_membership(organisation_id));

-- This private trigger is the only privileged writer for authenticated CRM
-- changes. It cannot be called as a browser RPC, accepts no external IDs, and
-- only follows tenant-matching, previously confirmed lead attribution.
create schema if not exists arch9_marketing_internal;
revoke all on schema arch9_marketing_internal from public,anon,authenticated;
create function arch9_marketing_internal.project_conversion()
returns trigger language plpgsql security definer set search_path='' as $$
declare data jsonb:=to_jsonb(new); l public.marketing_attribution_links%rowtype; origin uuid; lead uuid; entity uuid; registered boolean;
begin
  if tg_table_name='website_lead_submissions' then
    if new.status<>'routed' or new.lead_id is null then return new; end if;
    if not exists(select 1 from public.leads where lead_id=new.lead_id and organisation_id=new.organisation_id) then return new; end if;
    select * into l from public.marketing_attribution_links where token=coalesce(new.attribution_json#>>'{measurement,lastTouch,token}',new.attribution_json#>>'{measurement,firstTouch,token}')
      and organisation_id=new.organisation_id and public.marketing_attribution_in_window(id,new.created_at);
    if l.id is not null then
      insert into public.marketing_conversions(organisation_id,link_id,channel,campaign_id,kind,source_key,lead_id,occurred_at)
        values(l.organisation_id,l.id,l.channel,l.campaign_id,'lead_created','lead:'||new.lead_id::text,new.lead_id,coalesce(new.routed_at,now())) on conflict do nothing;
    end if;
  elsif tg_table_name='transactions' then
    entity:=new.id;registered:=new.registered_at is not null and new.registration_reversed_at is null;
    if not registered then update public.marketing_conversions set active=false where organisation_id=new.organisation_id and transaction_id=entity and kind='transaction_registered' and active; end if;
    for l in select distinct a.* from public.marketing_conversions c join public.marketing_attribution_links a on a.id=c.link_id
      where c.kind='lead_created' and c.organisation_id=new.organisation_id
        and c.lead_id in (nullif(data->>'originating_lead_id','')::uuid,nullif(data->>'originating_buyer_lead_id','')::uuid,nullif(data->>'originating_seller_lead_id','')::uuid)
    loop
      insert into public.marketing_conversions(organisation_id,link_id,channel,campaign_id,kind,source_key,transaction_id)
        values(l.organisation_id,l.id,l.channel,l.campaign_id,'transaction_created','transaction:'||entity::text,entity) on conflict do nothing;
      if registered then
        insert into public.marketing_conversions(organisation_id,link_id,channel,campaign_id,kind,source_key,transaction_id,occurred_at)
          values(l.organisation_id,l.id,l.channel,l.campaign_id,'transaction_registered','registered:'||entity::text,entity,new.registered_at)
          on conflict(organisation_id,channel,campaign_id,kind,source_key) do update set active=true;
      else
        update public.marketing_conversions set active=false where organisation_id=new.organisation_id and transaction_id=entity and kind='transaction_registered';
      end if;
    end loop;
  elsif tg_table_name='appointments' then
    lead:=nullif(data->>'lead_id','')::uuid;entity:=coalesce(nullif(data->>'appointment_id',''),nullif(data->>'id',''))::uuid;
    if lead is null or entity is null then return new; end if;
    for l in select distinct a.* from public.marketing_conversions c join public.marketing_attribution_links a on a.id=c.link_id
      where c.kind='lead_created' and c.lead_id=lead and c.organisation_id=new.organisation_id
    loop
      insert into public.marketing_conversions(organisation_id,link_id,channel,campaign_id,kind,source_key,lead_id)
        values(l.organisation_id,l.id,l.channel,l.campaign_id,'appointment_created','appointment:'||entity::text,lead) on conflict do nothing;
    end loop;
  end if;
  return new;
exception when others then
  raise log 'marketing_conversion_projection_failed table=% code=%',tg_table_name,sqlstate;
  return new;
end $$;
revoke all on function arch9_marketing_internal.project_conversion() from public,anon,authenticated,service_role;
create trigger website_marketing_conversion after insert or update on public.website_lead_submissions for each row execute function arch9_marketing_internal.project_conversion();
create trigger transaction_marketing_conversion after insert or update on public.transactions for each row execute function arch9_marketing_internal.project_conversion();
create trigger appointment_marketing_conversion after insert on public.appointments for each row execute function arch9_marketing_internal.project_conversion();

create view public.marketing_campaign_outcomes with(security_invoker=true) as
select organisation_id,channel,campaign_id,
  count(*) filter(where kind='lead_created')::integer leads,
  count(*) filter(where kind='appointment_created')::integer appointments,
  count(*) filter(where kind='transaction_created')::integer transactions,
  count(*) filter(where kind='transaction_registered' and active)::integer registered,
  max(occurred_at) last_conversion_at
from public.marketing_conversions group by organisation_id,channel,campaign_id;
grant select on public.marketing_campaign_outcomes to authenticated,service_role;

create view public.whatsapp_campaign_engagement with(security_invoker=true) as
select c.id campaign_id,c.organisation_id,
  (select count(distinct r.recipient_id)::integer from public.whatsapp_campaign_reply_routes r where r.campaign_id=c.id and r.organisation_id=c.organisation_id) replies,
  (select count(*)::integer from public.marketing_link_clicks k join public.marketing_attribution_links a on a.id=k.link_id
    where a.channel='whatsapp' and a.campaign_id=c.id and k.engagement_class<>'known_automation') tracked_clicks,
  coalesce(o.leads,0) leads,coalesce(o.appointments,0) appointments,coalesce(o.transactions,0) transactions,coalesce(o.registered,0) registered,
  (select count(*)::integer from public.marketing_attribution_links a where a.channel='whatsapp' and a.campaign_id=c.id) tracked_links
from public.whatsapp_campaigns c left join public.marketing_campaign_outcomes o on o.organisation_id=c.organisation_id and o.campaign_id=c.id and o.channel='whatsapp';
grant select on public.whatsapp_campaign_engagement to authenticated,service_role;
-- Future daily counters use the same reporting day as public HomeSeekers and email.
CREATE OR REPLACE FUNCTION public.website_record_analytics_event(p_hostname text, p_event_type text, p_page_path text, p_listing_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_site_id uuid;
  v_host text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_hostname, '')));
  v_type text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_event_type, '')));
  v_path text := pg_catalog.left(pg_catalog.btrim(coalesce(p_page_path, '')), 2048);
  v_dimension text;
begin
  if v_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    or v_type not in ('site_visit', 'page_view', 'listing_view', 'guarantee_opened', 'ppra_letter_opened')
    or v_path !~ '^/[^[:space:]]*$' then
    raise exception 'Invalid website analytics event.' using errcode = '22023';
  end if;

  if v_type in ('guarantee_opened', 'ppra_letter_opened') and v_path <> '/demo/homeseekers/join' then
    raise exception 'Invalid recruitment conversion path.' using errcode = '22023';
  end if;

  select site.id into v_site_id
  from public.website_domains domain
  join public.website_sites site on site.id = domain.website_site_id
  where pg_catalog.lower(domain.hostname) = v_host
    and domain.status = 'active'
    and site.status = 'published'
  order by domain.is_primary desc, domain.created_at
  limit 1;

  if v_site_id is null then
    raise exception 'Published website not found.' using errcode = 'P0002';
  end if;

  if v_type = 'listing_view' then
    if p_listing_id is null or not (exists (
      select 1 from public.website_listing_publications publication
      where publication.website_site_id = v_site_id
        and publication.listing_id = p_listing_id
        and publication.status = 'published'
    ) or exists (
      select 1 from public.website_partner_listing_publications publication
      join public.website_partner_listing_grants grant_row on grant_row.id=publication.grant_id
        and grant_row.website_site_id=publication.website_site_id
      join public.private_listings listing on listing.id=publication.listing_id
        and listing.organisation_id=grant_row.source_organisation_id
      where publication.website_site_id=v_site_id and publication.listing_id=p_listing_id
        and publication.status='published' and grant_row.enabled
    )) then
      raise exception 'Published website listing not found.' using errcode = 'P0002';
    end if;
    v_dimension := 'listing:' || p_listing_id::text;
  else
    if p_listing_id is not null then
      raise exception 'Only listing views may identify a listing.' using errcode = '22023';
    end if;
    v_dimension := 'path:' || v_path;
  end if;

  insert into public.website_analytics_daily (
    website_site_id, event_date, event_type, page_path, dimension_key, listing_id, event_count
  ) values (
    v_site_id, (now() at time zone 'Africa/Johannesburg')::date, v_type, v_path, v_dimension, p_listing_id, 1
  ) on conflict (website_site_id, event_date, event_type, page_path, dimension_key)
  do update set event_count = public.website_analytics_daily.event_count + 1;
end;
$function$;
revoke all on function public.website_record_analytics_event(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.website_record_analytics_event(text,text,text,uuid) to service_role;
commit;
