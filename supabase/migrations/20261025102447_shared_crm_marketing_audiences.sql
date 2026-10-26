begin;

-- Shared CRM definitions; channel contacts, consent and dispatch stay channel-owned.
create table public.marketing_audiences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 120),
  description text not null default '' check(length(description)<=600),
  visibility text not null default 'personal' check(visibility in ('personal','agency')),
  definition jsonb not null,
  revision integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(id,organisation_id)
);
create index marketing_audiences_library on public.marketing_audiences(organisation_id,updated_at desc,id) where archived_at is null;
alter table public.marketing_audiences enable row level security;
revoke all on public.marketing_audiences from public,anon,authenticated;
grant select on public.marketing_audiences to authenticated;
grant insert(organisation_id,name,description,visibility,definition) on public.marketing_audiences to authenticated;
grant update(name,description,visibility,definition,revision,updated_at,archived_at) on public.marketing_audiences to authenticated;
grant all on public.marketing_audiences to service_role;
create policy marketing_audiences_read on public.marketing_audiences for select to authenticated using(public.bridge_is_active_member(organisation_id) and (created_by=auth.uid() or visibility='agency'));
create policy marketing_audiences_insert on public.marketing_audiences for insert to authenticated with check(public.bridge_is_active_member(organisation_id) and created_by=auth.uid() and (visibility='personal' or public.email_campaign_can_send(organisation_id)));
create policy marketing_audiences_update on public.marketing_audiences for update to authenticated using(public.bridge_is_active_member(organisation_id) and (created_by=auth.uid() or (visibility='agency' and public.email_campaign_can_send(organisation_id)))) with check(public.bridge_is_active_member(organisation_id) and (created_by=auth.uid() or public.email_campaign_can_send(organisation_id)) and ((visibility='personal' and created_by=auth.uid()) or (visibility='agency' and public.email_campaign_can_send(organisation_id))));

create function public.marketing_audience_validate(p_definition jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; v text;
begin
  if octet_length(p_definition::text)>16384 or jsonb_typeof(p_definition) is distinct from 'object' or p_definition->>'match' is null or p_definition->>'match' not in ('all','any')
    or jsonb_typeof(p_definition->'rules') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_definition->'rules') not between 1 and 12 or jsonb_typeof(p_definition->'quietDays') is distinct from 'number' or coalesce(p_definition->>'quietDays','') !~ '^\d{1,3}$' then return false; end if;
  if (p_definition->>'quietDays')::integer>365 or jsonb_typeof(p_definition->'excludeClosed') is distinct from 'boolean' then return false; end if;
  for r in select value from jsonb_array_elements(p_definition->'rules') loop
    if r->>'field' is null or r->>'field' not in ('role','stage','area','owner','tags','budget') or r->>'operator' is null or jsonb_typeof(r->'values') is distinct from 'array' then return false; end if;
    if jsonb_array_length(r->'values') not between 1 and 10 then return false; end if;
    if r->>'field'='owner' and r->>'operator' not in ('in','not_in') then return false; end if;
    if r->>'field'='budget' then
      if r->>'operator' not in ('gte','lte') or jsonb_array_length(r->'values')<>1 or r->'values'->>0 !~ '^\d{1,15}(\.\d{1,2})?$' then return false; end if;
    elsif r->>'operator' not in ('in','not_in','contains') then return false; end if;
    if exists(select 1 from jsonb_array_elements(r->'values') value where jsonb_typeof(value)<>'string') then return false; end if;
    for v in select jsonb_array_elements_text(r->'values') loop
      if v is null or length(btrim(v)) not between 1 and 120 then return false; end if;
      if r->>'field'='owner' and v not in ('me','unassigned') and v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
    end loop;
  end loop;
  return true;
end; $$;
create function public.marketing_audience_protect() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not public.marketing_audience_validate(new.definition) then raise exception 'Complete the audience rules before saving.'; end if;
  if tg_op='UPDATE' and new.revision<>old.revision+1 then raise exception 'This audience changed. Refresh before saving.' using errcode='40001'; end if;
  new.updated_at:=now(); return new;
end; $$;
revoke all on function public.marketing_audience_protect() from public,anon,authenticated;
create trigger marketing_audience_protect before insert or update on public.marketing_audiences for each row execute function public.marketing_audience_protect();

create function public.marketing_audience_matches(p_row jsonb,p_definition jsonb) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare r jsonb; result boolean:=p_definition->>'match'='all'; matched boolean; actual text; wanted text;
begin
  if not public.marketing_audience_validate(p_definition) then return false; end if;
  for r in select value from jsonb_array_elements(p_definition->'rules') loop
    matched:=false;
    if r->>'field'='budget' then
      if p_row->>'budget' is not null then
        matched:=case when r->>'operator'='gte' then (p_row->>'budget')::numeric >= (r->'values'->>0)::numeric else (p_row->>'budget')::numeric <= (r->'values'->>0)::numeric end;
      end if;
    elsif r->>'field' in ('role','area','tags') then
      for actual in select jsonb_array_elements_text(coalesce(p_row->(r->>'field'),'[]'::jsonb)) loop
        for wanted in select jsonb_array_elements_text(r->'values') loop
          matched:=matched or case when r->>'operator'='contains' then position(lower(wanted) in lower(actual))>0 else lower(actual)=lower(wanted) end;
        end loop;
      end loop;
      if r->>'operator'='not_in' then matched:=not matched; end if;
    else
      actual:=coalesce(p_row->>(r->>'field'),'');
      for wanted in select jsonb_array_elements_text(r->'values') loop
        if r->>'field'='owner' then wanted:=case wanted when 'me' then auth.uid()::text when 'unassigned' then '' else wanted end; end if;
        matched:=matched or case when r->>'operator'='contains' then position(lower(wanted) in lower(actual))>0 else lower(actual)=lower(wanted) end;
      end loop;
      if r->>'operator'='not_in' then matched:=not matched; end if;
    end if;
    if p_definition->>'match'='all' then result:=result and matched; else result:=result or matched; end if;
  end loop;
  return result;
end; $$;

-- Invoker reads retain every source table's RLS. A shared definition never
-- grants the viewer additional CRM or channel access.
create function public.marketing_audience_members(p_org uuid,p_definition jsonb,p_subscription uuid default null)
returns table(contact_id uuid,name text,email text,phone text,role text,stage text,area text,owner_id uuid,last_contacted_at timestamptz,email_id uuid,whatsapp_id uuid,email_reason text,whatsapp_reason text,recent boolean)
language sql stable security invoker set search_path='' as $$
 with candidates as (
  select c.contact_id,coalesce(nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),'Unnamed contact') name,lower(trim(c.email)) email,
    regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') phone,l.lead_id,
    lower(coalesce(nullif(l.lead_category,''),c.contact_type,'')) role,coalesce(l.stage,'') stage,
    coalesce(to_jsonb(l)->>'area_interest','') area,coalesce(l.assigned_user_id,l.assigned_agent_id,c.assigned_agent_id) owner_id,
    coalesce(lower(l.status),'') in ('closed','closed_won','closed_lost','won','lost','archived','deleted','converted') or coalesce(lower(l.stage),'') in ('closed','closed_won','closed_lost','won','lost','archived','deleted','converted') closed,
    em.id email_id,em.is_valid_email,coalesce(em.tags,'{}') tags,l.budget,
    wm.id whatsapp_id,wm.consent_status wa_consent,wm.opted_out_at,wm.consent_at,
    pref.marketing_consent_status email_consent,pref.unsubscribed_at,
    exists(select 1 from public.email_suppressions s where s.organisation_id=p_org and s.email=lower(trim(c.email))) suppressed,
    exists(select 1 from public.contact_email_subscriptions s join public.email_subscription_types t on t.id=s.subscription_type_id and t.organisation_id=s.organisation_id and t.is_active where s.organisation_id=p_org and s.email=lower(trim(c.email)) and s.subscription_type_id=p_subscription and s.status='subscribed') subscribed,
    greatest(
      (select max(a.activity_date) from public.lead_activities a join public.leads al on al.lead_id=a.lead_id and al.organisation_id=a.organisation_id where a.organisation_id=p_org and al.contact_id=c.contact_id and lower(a.activity_type) in ('call','phone call','email','whatsapp','meeting','viewing') and lower(a.outcome) in ('contacted','connected','sent','delivered','completed','replied')),
      (select max(r.sent_at) from public.email_campaign_recipients r where r.organisation_id=p_org and r.email=lower(trim(c.email))),
      (select max(r.sent_at) from public.whatsapp_campaign_recipients r where r.organisation_id=p_org and r.phone=regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'))
    ) direct_last_contacted_at,
    to_jsonb(array_remove(array[lower(c.contact_type),lower(l.lead_category)],null)) roles
  from public.contacts c left join public.leads l on l.contact_id=c.contact_id and l.organisation_id=c.organisation_id and coalesce(l.lead_domain,'agency')='agency'
  left join public.email_marketing_contacts em on em.organisation_id=c.organisation_id and em.email=lower(trim(c.email))
  left join public.contact_marketing_preferences pref on pref.organisation_id=c.organisation_id and pref.email=lower(trim(c.email))
  left join public.whatsapp_marketing_contacts wm on wm.organisation_id=c.organisation_id and wm.phone=regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')
  where c.organisation_id=p_org and auth.uid() is not null and public.bridge_is_active_member(p_org)
    and (not exists(select 1 from public.leads other where other.contact_id=c.contact_id and other.organisation_id=p_org and coalesce(other.lead_domain,'agency')<>'agency') or l.lead_id is not null)
 ), contacted as (
  select c.*,greatest(
    max(direct_last_contacted_at) over(partition by coalesce(nullif(email,''),contact_id::text)),
    max(direct_last_contacted_at) over(partition by coalesce(nullif(phone,''),contact_id::text))
  ) last_contacted_at from candidates c
 ), matched as (
  select distinct on(c.contact_id) c.* from contacted c
  where (not (p_definition->>'excludeClosed')::boolean or not c.closed)
    and public.marketing_audience_matches(jsonb_build_object('role',c.roles,'stage',c.stage,'area',array[c.area],'owner',c.owner_id,'tags',c.tags,'budget',c.budget),p_definition)
  order by c.contact_id,c.lead_id nulls last
 ), reasoned as (
  select m.*,
   case when not public.email_campaign_can_send(p_org) then 'Email sending access required'
     when nullif(m.email,'') is null then 'No email address'
     when m.email_id is null or not coalesce(m.is_valid_email,false) then 'Not a valid email marketing contact'
     when m.suppressed then 'Email suppressed'
     when m.email_consent is distinct from 'opted_in' or m.unsubscribed_at is not null then 'Email permission not recorded'
     when p_subscription is null then 'Choose an email subscription category'
     when not m.subscribed then 'Not subscribed to this category' else null end er,
   case when m.phone !~ '^[1-9][0-9]{7,14}$' then 'Use an international phone number'
     when m.whatsapp_id is null then 'Not a WhatsApp marketing contact'
     when m.wa_consent is distinct from 'opted_in' or m.opted_out_at is not null or m.consent_at is null or m.consent_at>now() then 'WhatsApp permission not recorded' else null end wr,
   m.last_contacted_at >= now()-make_interval(days=>case when (p_definition->>'quietDays')::integer=0 then 7 else (p_definition->>'quietDays')::integer end) recent
  from matched m
 )
 select r.contact_id,r.name,r.email,r.phone,r.role,r.stage,r.area,r.owner_id,r.last_contacted_at,r.email_id,r.whatsapp_id,
   case when (p_definition->>'quietDays')::integer>0 and coalesce(r.recent,false) then 'Contacted within the quiet period' else r.er end,
   case when (p_definition->>'quietDays')::integer>0 and coalesce(r.recent,false) then 'Contacted within the quiet period' else r.wr end,
   coalesce(r.recent,false)
 from reasoned r;
$$;

create function public.marketing_audience_library(p_org uuid,p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; total integer; categories jsonb;
begin
 if auth.uid() is null or not public.bridge_is_active_member(p_org) then raise exception 'Choose an active agency workspace.' using errcode='42501'; end if;
 select count(*) into total from public.marketing_audiences where organisation_id=p_org and archived_at is null and (p_search='' or position(lower(left(p_search,120)) in lower(name||' '||description))>0);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc,a.id),'[]') into items from (select * from public.marketing_audiences where organisation_id=p_org and archived_at is null and (p_search='' or position(lower(left(p_search,120)) in lower(name||' '||description))>0) order by updated_at desc,id limit 20 offset greatest(0,p_offset)) a;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') into categories from public.email_subscription_types where organisation_id=p_org and is_active;
 return jsonb_build_object('audiences',items,'total',total,'actorId',auth.uid(),'canShare',public.email_campaign_can_send(p_org),'subscriptionTypes',categories);
end; $$;

create function public.marketing_audience_preview(p_org uuid,p_audience uuid default null,p_definition jsonb default null,p_channel text default 'crm',p_subscription uuid default null,p_offset integer default 0,p_revision integer default null,p_review_hash text default null,p_resolve boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.marketing_audiences; d jsonb; members jsonb; page jsonb; ids jsonb; matched integer; email_count integer; wa_count integer; recent_count integer; fingerprint text; cap integer;
begin
 if auth.uid() is null or not public.bridge_is_active_member(p_org) then raise exception 'Choose an active agency workspace.' using errcode='42501'; end if;
 if p_channel not in ('crm','email','whatsapp') or p_channel is null then raise exception 'Choose an audience channel.'; end if;
 if p_audience is not null then
  select * into a from public.marketing_audiences where id=p_audience and organisation_id=p_org and archived_at is null;
  if a.id is null then raise exception 'This audience is not available to you.' using errcode='42501'; end if;
  if p_revision is not null and a.revision<>p_revision then raise exception 'This audience changed. Refresh its preview.'; end if;
  d:=a.definition;
 else d:=p_definition; end if;
 if not public.marketing_audience_validate(d) then raise exception 'Complete the audience rules before previewing.'; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by contact_id),'[]') into members from public.marketing_audience_members(p_org,d,p_subscription) m;
 select count(*),count(distinct item->>'email_id') filter(where item->>'email_reason' is null),count(distinct item->>'whatsapp_id') filter(where item->>'whatsapp_reason' is null),count(*) filter(where (item->>'recent')::boolean)
 into matched,email_count,wa_count,recent_count from jsonb_array_elements(members) item;
 fingerprint:=md5(members::text||d::text||coalesce(a.revision,0)::text||p_channel||coalesce(p_subscription::text,''));
 if p_resolve then
  if p_audience is null or p_channel='crm' or p_review_hash is distinct from fingerprint then raise exception 'Audience membership or eligibility changed. Refresh and review before applying.'; end if;
  cap:=case when p_channel='whatsapp' then 500 else 10000 end;
  if (case when p_channel='whatsapp' then wa_count else email_count end)>cap then raise exception 'This selection exceeds the channel review limit. Narrow the audience first.'; end if;
  select coalesce(jsonb_agg(recipient_id order by recipient_id),'[]') into ids from (
    select distinct item->>(case when p_channel='email' then 'email_id' else 'whatsapp_id' end) recipient_id from jsonb_array_elements(members) item where item->>(case when p_channel='email' then 'email_reason' else 'whatsapp_reason' end) is null
  ) chosen;
  if jsonb_array_length(ids)=0 then raise exception 'There are no eligible recipients in this selection.'; end if;
  return jsonb_build_object('recipientIds',ids,'audienceId',a.id,'revision',a.revision);
 end if;
 select coalesce(jsonb_agg(item order by item->>'name',item->>'contact_id'),'[]') into page from (select item from jsonb_array_elements(members) item order by item->>'name',item->>'contact_id' limit 25 offset greatest(0,p_offset)) paged;
 return jsonb_build_object('matched',matched,'emailEligible',email_count,'whatsappEligible',wa_count,'recent',recent_count,'rows',page,'reviewHash',fingerprint,'revision',a.revision,'audienceId',a.id,'audience',case when a.id is not null then to_jsonb(a) else null end);
end; $$;

create table public.marketing_campaign_audiences (
 campaign_id uuid primary key,organisation_id uuid not null,audience_id uuid not null,updated_at timestamptz not null default now(),
 foreign key(campaign_id,organisation_id) references public.marketing_campaigns(id,organisation_id) on delete cascade,
 foreign key(audience_id,organisation_id) references public.marketing_audiences(id,organisation_id)
);
alter table public.marketing_campaign_audiences enable row level security;
revoke all on public.marketing_campaign_audiences from public,anon,authenticated;
grant select,delete on public.marketing_campaign_audiences to authenticated;
grant insert(campaign_id,organisation_id,audience_id) on public.marketing_campaign_audiences to authenticated;
grant update(audience_id,updated_at) on public.marketing_campaign_audiences to authenticated;
grant all on public.marketing_campaign_audiences to service_role;
create policy campaign_audience_read on public.marketing_campaign_audiences for select to authenticated using(public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_audiences.organisation_id) and exists(select 1 from public.marketing_audiences a where a.id=audience_id and a.organisation_id=marketing_campaign_audiences.organisation_id));
create policy campaign_audience_insert on public.marketing_campaign_audiences for insert to authenticated with check(public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_audiences.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id))) and exists(select 1 from public.marketing_audiences a where a.id=audience_id and a.organisation_id=marketing_campaign_audiences.organisation_id and a.archived_at is null));
create policy campaign_audience_update on public.marketing_campaign_audiences for update to authenticated using(public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_audiences.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id)))) with check(public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_audiences.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id))) and exists(select 1 from public.marketing_audiences a where a.id=audience_id and a.organisation_id=marketing_campaign_audiences.organisation_id and a.archived_at is null));
create policy campaign_audience_delete on public.marketing_campaign_audiences for delete to authenticated using(public.bridge_is_active_member(organisation_id) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_audiences.organisation_id and (c.created_by=auth.uid() or public.email_campaign_can_send(c.organisation_id))));

revoke all on function public.marketing_audience_validate(jsonb),public.marketing_audience_matches(jsonb,jsonb),public.marketing_audience_members(uuid,jsonb,uuid),public.marketing_audience_library(uuid,text,integer),public.marketing_audience_preview(uuid,uuid,jsonb,text,uuid,integer,integer,text,boolean) from public,anon;
grant execute on function public.marketing_audience_validate(jsonb),public.marketing_audience_matches(jsonb,jsonb),public.marketing_audience_members(uuid,jsonb,uuid),public.marketing_audience_library(uuid,text,integer),public.marketing_audience_preview(uuid,uuid,jsonb,text,uuid,integer,integer,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
