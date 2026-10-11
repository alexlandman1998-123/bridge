-- Client attribution depends on the agency identity and activity migrations.
-- Campaign evidence describes an enquiry, never an identity-matching rule.
begin;

create table public.agency_client_attribution (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  lead_id uuid not null,
  touch_type text not null check (touch_type in ('first','enquiry')),
  evidence_kind text not null check (evidence_kind in ('browser_session','enquiry_record')),
  utm_source text check (length(utm_source)<=160),
  utm_medium text check (length(utm_medium)<=160),
  utm_campaign text check (length(utm_campaign)<=160),
  utm_term text check (length(utm_term)<=160),
  utm_content text check (length(utm_content)<=160),
  source_channel text check (length(source_channel)<=160),
  campaign_code text check (length(campaign_code)<=80),
  landing_host text check (length(landing_host)<=253),
  referrer_host text check (length(referrer_host)<=253),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  historical boolean not null default false,
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id),
  unique (organisation_id,lead_id,touch_type)
);
create index agency_client_attribution_profile on public.agency_client_attribution(organisation_id,client_id,touch_type,occurred_at desc,id desc);
alter table public.agency_client_attribution enable row level security;
revoke all on public.agency_client_attribution from public,anon,authenticated;
grant select on public.agency_client_attribution to authenticated;
grant all on public.agency_client_attribution to service_role;
create policy agency_client_attribution_read on public.agency_client_attribution for select to authenticated using (
  arch9_client_private.can_read_client(client_id)
  and arch9_client_private.source_visible(organisation_id,'lead',lead_id)
  -- Reassigning an enquiry to a different person must not expose their evidence.
  and exists(select 1 from public.agency_client_links l join public.agency_client_profiles original on original.id=agency_client_attribution.client_id
    where l.organisation_id=agency_client_attribution.organisation_id and l.source_kind='lead' and l.source_id=agency_client_attribution.lead_id
      and l.client_id=coalesce(original.merged_into,original.id))
);

create function arch9_client_private.attribution_text(p_value jsonb,p_limit integer default 160) returns text
language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(p_value)='string' then nullif(left(trim(regexp_replace(p_value#>>'{}','[[:cntrl:]]','','g')),p_limit),'') end;
$$;
create function arch9_client_private.attribution_utm(p_value jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'utm_source',coalesce(arch9_client_private.attribution_text(p_value->'utm_source'),arch9_client_private.attribution_text(p_value->'utmSource')),
    'utm_medium',coalesce(arch9_client_private.attribution_text(p_value->'utm_medium'),arch9_client_private.attribution_text(p_value->'utmMedium')),
    'utm_campaign',coalesce(arch9_client_private.attribution_text(p_value->'utm_campaign'),arch9_client_private.attribution_text(p_value->'utmCampaign')),
    'utm_term',coalesce(arch9_client_private.attribution_text(p_value->'utm_term'),arch9_client_private.attribution_text(p_value->'utmTerm')),
    'utm_content',coalesce(arch9_client_private.attribution_text(p_value->'utm_content'),arch9_client_private.attribution_text(p_value->'utmContent'))));
$$;
create function arch9_client_private.attribution_host(p_value text) returns text
language sql immutable security invoker set search_path='' as $$
  select left((regexp_match(lower(trim(p_value)),'^(?:https?://)?([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]+)?(?:[/?#]|$)'))[1],253);
$$;
create function arch9_client_private.attribution_merge(p_preferred jsonb,p_fallback jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select case when p_preferred='{}'::jsonb then p_fallback
    when not exists(select 1 from jsonb_each_text(p_preferred) f where f.key in ('utm_source','utm_medium','utm_campaign')
      and p_fallback ? f.key and p_fallback->>f.key<>f.value)
      and ((p_preferred ? 'utm_source' and p_preferred->>'utm_source'=p_fallback->>'utm_source')
        or (p_preferred ? 'utm_campaign' and p_preferred->>'utm_campaign'=p_fallback->>'utm_campaign'))
    then p_fallback||p_preferred else p_preferred end;
$$;
create function arch9_client_private.attribution_time(p_value text,p_enquiry_at timestamptz) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare v_time timestamptz;
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then return p_enquiry_at; end if;
  v_time:=p_value::timestamptz;
  if v_time between p_enquiry_at-interval '30 days' and p_enquiry_at+interval '5 minutes' then return least(v_time,p_enquiry_at); end if;
  return p_enquiry_at;
exception when invalid_datetime_format or datetime_field_overflow then return p_enquiry_at;
end;
$$;

create function arch9_client_private.capture_client_attribution(p_lead_id uuid,p_historical boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb; l public.agency_client_links; s jsonb; w jsonb; u jsonb; first_touch jsonb; t jsonb; v_type text;
  v_at timestamptz; v_kind text; v_enquiry_at timestamptz; v_id uuid;
begin
  select to_jsonb(lead) into r from public.leads lead where lead.lead_id=p_lead_id;
  if r is null or coalesce(r->>'is_demo_data','false')='true'
    or r->'demo_metadata' @> '{"seedData":true}' or r->'demo_metadata' @> '{"isDemoData":true}'
    or r->'demo_metadata' @> '{"seed_data":true}' or r->'demo_metadata' @> '{"is_demo_data":true}'
    or r->'demo_metadata' @> '{"migratedFromLocalStorage":true}' then return; end if;
  select * into l from public.agency_client_links where organisation_id=(r->>'organisation_id')::uuid and source_kind='lead' and source_id=p_lead_id;
  if l.id is null then return; end if;
  -- Receipts can be linked after lead creation. Agency + lead predicates prevent
  -- borrowing tracking from another agency, even if a malformed receipt exists.
  select to_jsonb(receipt) into s from public.agency_public_intake_submissions receipt
    where receipt.organisation_id=l.organisation_id and receipt.lead_id=p_lead_id and receipt.status not in ('spam','failed') order by receipt.created_at,receipt.id limit 1;
  select to_jsonb(receipt) into w from public.website_lead_submissions receipt
    where receipt.organisation_id=l.organisation_id and receipt.lead_id=p_lead_id and receipt.status not in ('spam','failed') order by receipt.created_at,receipt.id limit 1;
  u:=arch9_client_private.attribution_utm(r->'raw_enquiry_payload'->'utm');
  u:=arch9_client_private.attribution_merge(u,arch9_client_private.attribution_utm(r->'raw_enquiry_payload'->'context'->'utm'));
  u:=arch9_client_private.attribution_merge(u,arch9_client_private.attribution_utm(r->'raw_enquiry_payload'->'utm_json'));
  u:=arch9_client_private.attribution_merge(u,arch9_client_private.attribution_utm(r->'raw_enquiry_payload'->'attribution'));
  u:=arch9_client_private.attribution_merge(u,arch9_client_private.attribution_utm(s->'utm_json'));
  u:=arch9_client_private.attribution_merge(u,arch9_client_private.attribution_utm(w->'attribution_json'));
  v_enquiry_at:=coalesce((r->>'source_received_at')::timestamptz,(r->>'created_at')::timestamptz,now());
  first_touch:=coalesce(r->'raw_enquiry_payload'->'context'->'clientAttribution'->'firstTouch',s->'request_metadata_json'->'clientAttribution'->'firstTouch');
  foreach v_type in array array['first','enquiry'] loop
    v_kind:='enquiry_record'; v_at:=v_enquiry_at; t:=u;
    if v_type='first' and jsonb_typeof(first_touch)='object' and
      (arch9_client_private.attribution_utm(first_touch->'utm')<>'{}'::jsonb or arch9_client_private.attribution_text(first_touch->'sourceChannel') is not null) then
      v_kind:='browser_session'; t:=arch9_client_private.attribution_utm(first_touch->'utm');
      v_at:=arch9_client_private.attribution_time(first_touch->>'capturedAt',v_enquiry_at);
    end if;
    insert into public.agency_client_attribution(organisation_id,client_id,lead_id,touch_type,evidence_kind,
      utm_source,utm_medium,utm_campaign,utm_term,utm_content,source_channel,campaign_code,landing_host,referrer_host,occurred_at,historical)
    values(l.organisation_id,l.client_id,p_lead_id,v_type,v_kind,t->>'utm_source',t->>'utm_medium',t->>'utm_campaign',t->>'utm_term',t->>'utm_content',
      case when v_kind='browser_session' then arch9_client_private.attribution_text(first_touch->'sourceChannel')
        else coalesce(arch9_client_private.attribution_text(r->'source_channel'),arch9_client_private.attribution_text(s->'source_channel'),arch9_client_private.attribution_text(r->'lead_source')) end,
      case when v_kind='browser_session' then arch9_client_private.attribution_text(first_touch->'campaignCode',80)
        else coalesce(arch9_client_private.attribution_text(r->'campaign_code',80),arch9_client_private.attribution_text(s->'campaign_code',80)) end,
      arch9_client_private.attribution_host(case when v_kind='browser_session' then first_touch->>'landingHost' else coalesce(r->'raw_enquiry_payload'->'context'->>'pageUrl',r->'raw_enquiry_payload'->>'sourcePageUrl',s->'request_metadata_json'->>'pageUrl') end),
      arch9_client_private.attribution_host(case when v_kind='browser_session' then first_touch->>'referrerHost' else coalesce(r->'raw_enquiry_payload'->'context'->>'referrer',r->'raw_enquiry_payload'->'attribution'->>'referrer',s->'request_metadata_json'->>'referrer',w->'attribution_json'->>'referrer') end),v_at,p_historical)
    on conflict (organisation_id,lead_id,touch_type) do update set
      utm_source=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.utm_source else coalesce(agency_client_attribution.utm_source,excluded.utm_source) end,
      utm_medium=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.utm_medium else coalesce(agency_client_attribution.utm_medium,excluded.utm_medium) end,
      utm_campaign=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.utm_campaign else coalesce(agency_client_attribution.utm_campaign,excluded.utm_campaign) end,
      utm_term=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.utm_term else coalesce(agency_client_attribution.utm_term,excluded.utm_term) end,
      utm_content=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.utm_content else coalesce(agency_client_attribution.utm_content,excluded.utm_content) end,
      source_channel=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.source_channel else coalesce(agency_client_attribution.source_channel,excluded.source_channel) end,
      campaign_code=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.campaign_code else coalesce(agency_client_attribution.campaign_code,excluded.campaign_code) end,
      landing_host=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.landing_host else coalesce(agency_client_attribution.landing_host,excluded.landing_host) end,
      referrer_host=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.referrer_host else coalesce(agency_client_attribution.referrer_host,excluded.referrer_host) end,
      occurred_at=case when agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session' then excluded.occurred_at else agency_client_attribution.occurred_at end,
      evidence_kind=case when excluded.evidence_kind='browser_session' then excluded.evidence_kind else agency_client_attribution.evidence_kind end
    where exists(select 1 from public.agency_client_profiles p where p.id=agency_client_attribution.client_id and coalesce(p.merged_into,p.id)=l.client_id)
      and (agency_client_attribution.evidence_kind=excluded.evidence_kind or excluded.evidence_kind='browser_session')
      and ((agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session')
        or arch9_client_private.attribution_merge(arch9_client_private.attribution_utm(to_jsonb(agency_client_attribution)),arch9_client_private.attribution_utm(to_jsonb(excluded)))
          =arch9_client_private.attribution_utm(to_jsonb(excluded))||arch9_client_private.attribution_utm(to_jsonb(agency_client_attribution)))
      and ((agency_client_attribution.evidence_kind='enquiry_record' and excluded.evidence_kind='browser_session')
        or exists(select 1 from jsonb_each(to_jsonb(excluded)) f where f.key in ('utm_source','utm_medium','utm_campaign','utm_term','utm_content','source_channel','campaign_code','landing_host','referrer_host')
          and f.value<>'null'::jsonb and to_jsonb(agency_client_attribution)->f.key='null'::jsonb))
    returning id into v_id;
  end loop;
  if u<>'{}'::jsonb then
    perform arch9_client_private.emit_activity('leads',r,p_lead_id,'enquiry','enquiry.attributed','Enquiry campaign source recorded',
      concat_ws(' · ',u->>'utm_source',u->>'utm_medium',u->>'utm_campaign'),v_enquiry_at,'attribution:'||p_lead_id,p_historical);
  end if;
end;
$$;

create function arch9_client_private.client_attribution_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='leads' then
    perform arch9_client_private.capture_client_attribution(new.lead_id);
  elsif tg_table_name='agency_client_links' then
    if new.source_kind='lead' then
      perform arch9_client_private.capture_client_attribution(new.source_id,exists(select 1 from public.leads where lead_id=new.source_id and created_at<transaction_timestamp()));
    end if;
  elsif new.lead_id is not null then perform arch9_client_private.capture_client_attribution(new.lead_id); end if;
  return new;
end;
$$;

-- Reads and merge redirects use invoker RLS. No public write/identity API exists.
create function public.agency_client_attribution_summary(p_client_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with touches as (
    select a.* from public.agency_client_profiles requested
      join public.agency_client_profiles p on p.organisation_id=requested.organisation_id and coalesce(p.merged_into,p.id)=coalesce(requested.merged_into,requested.id)
      join public.agency_client_attribution a on a.organisation_id=p.organisation_id and a.client_id=p.id where requested.id=p_client_id
  ) select case when exists(select 1 from public.agency_client_profiles where id=p_client_id) then jsonb_build_object(
    'firstTouch',(select to_jsonb(t) from touches t where t.touch_type='first' and coalesce(t.utm_source,t.utm_medium,t.utm_campaign,t.source_channel,t.campaign_code) is not null order by t.occurred_at,t.id limit 1),
    'latestTouch',(select to_jsonb(t) from touches t where t.touch_type='enquiry' and coalesce(t.utm_source,t.utm_medium,t.utm_campaign,t.source_channel,t.campaign_code) is not null order by t.occurred_at desc,t.id desc limit 1),
    'enquiryCount',(select count(*) from touches where touch_type='enquiry'),
    'taggedEnquiryCount',(select count(*) from touches where touch_type='enquiry' and coalesce(utm_source,utm_medium,utm_campaign,utm_term,utm_content) is not null)) end;
$$;
create function public.agency_client_attribution_page(p_client_id uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 26)
returns setof public.agency_client_attribution language sql stable security invoker set search_path='' as $$
  select a.* from public.agency_client_profiles requested
    join public.agency_client_profiles p on p.organisation_id=requested.organisation_id and coalesce(p.merged_into,p.id)=coalesce(requested.merged_into,requested.id)
    join public.agency_client_attribution a on a.organisation_id=p.organisation_id and a.client_id=p.id
    where requested.id=p_client_id and a.touch_type='enquiry'
      and ((p_before_at is null and p_before_id is null) or (a.occurred_at,a.id)<(p_before_at,p_before_id))
    order by a.occurred_at desc,a.id desc limit greatest(1,least(coalesce(p_limit,26),101));
$$;

revoke all on function arch9_client_private.attribution_text(jsonb,integer),arch9_client_private.attribution_utm(jsonb),arch9_client_private.attribution_host(text),arch9_client_private.attribution_merge(jsonb,jsonb),arch9_client_private.attribution_time(text,timestamptz),arch9_client_private.capture_client_attribution(uuid,boolean),arch9_client_private.client_attribution_trigger() from public,anon,authenticated;
revoke all on function public.agency_client_attribution_summary(uuid),public.agency_client_attribution_page(uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.agency_client_attribution_summary(uuid),public.agency_client_attribution_page(uuid,timestamptz,uuid,integer) to authenticated;

do $$ declare r record; begin
  for r in select lead_id from public.leads loop perform arch9_client_private.capture_client_attribution(r.lead_id,true); end loop;
end $$;
create trigger zzz_agency_client_attribution after insert or update on public.leads for each row execute function arch9_client_private.client_attribution_trigger();
create trigger agency_client_attribution_link after insert or update of client_id on public.agency_client_links for each row execute function arch9_client_private.client_attribution_trigger();
create trigger agency_client_attribution_intake after insert or update on public.agency_public_intake_submissions for each row execute function arch9_client_private.client_attribution_trigger();
create trigger agency_client_attribution_website after insert or update on public.website_lead_submissions for each row execute function arch9_client_private.client_attribution_trigger();
commit;
