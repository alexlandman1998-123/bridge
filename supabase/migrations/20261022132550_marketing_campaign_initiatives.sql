begin;

-- A campaign is a coordinated initiative. Channel delivery remains owned by
-- the existing email/WhatsApp workflows; changing this plan never sends mail.
create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  goal text not null check (goal in ('seller_leads','buyer_leads','promote_listing','reengage','custom')),
  objective text not null check (length(btrim(objective)) between 1 and 240),
  audience text not null default '' check (length(audience)<=600),
  offer text not null default '' check (length(offer)<=600),
  area text not null default '' check (length(area)<=120),
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft','scheduled','active','completed')),
  planned_channels text[] not null default array['email']::text[],
  cover_url text not null default '' check (cover_url='' or (length(cover_url)<=2048 and cover_url ~ '^https://[^[:space:]]+$')),
  revision integer not null default 1 check (revision>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organisation_id),
  check (start_date is null or end_date is null or end_date>=start_date),
  check (status<>'scheduled' or start_date is not null),
  check (cardinality(planned_channels) between 1 and 3 and array_position(planned_channels,null) is null and planned_channels <@ array['email','whatsapp','meta']::text[])
);
create index marketing_campaigns_org_updated on public.marketing_campaigns(organisation_id,updated_at desc,id);

create table public.marketing_campaign_activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  campaign_id uuid not null,
  channel text not null check (channel in ('email','whatsapp')),
  email_campaign_id uuid unique references public.email_campaigns(id) on delete cascade,
  whatsapp_campaign_id uuid unique references public.whatsapp_campaigns(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(campaign_id,organisation_id) references public.marketing_campaigns(id,organisation_id) on delete cascade,
  check ((channel='email' and email_campaign_id is not null and whatsapp_campaign_id is null)
      or (channel='whatsapp' and whatsapp_campaign_id is not null and email_campaign_id is null))
);
create index marketing_campaign_activities_org_plan on public.marketing_campaign_activities(organisation_id,campaign_id);

create function public.marketing_campaign_protect_plan()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if (new.id,new.organisation_id,new.created_by,new.created_at) is distinct from (old.id,old.organisation_id,old.created_by,old.created_at) then
      raise exception 'Campaign ownership cannot be changed.' using errcode='42501';
    end if;
    if new.revision<>old.revision+1 then raise exception 'This campaign changed. Reload it before saving.' using errcode='40001'; end if;
    if exists(select 1 from public.marketing_campaign_activities a where a.campaign_id=old.id and not (a.channel=any(new.planned_channels))) then
      raise exception 'Unlink channel activity before removing that channel.' using errcode='22023';
    end if;
  end if;
  if cardinality(new.planned_channels)<>(select count(distinct value) from unnest(new.planned_channels) value) then
    raise exception 'Choose each channel once.' using errcode='22023';
  end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function public.marketing_campaign_protect_plan() from public,anon,authenticated;
create trigger marketing_campaign_protect_plan before insert or update on public.marketing_campaigns for each row execute function public.marketing_campaign_protect_plan();

create function public.marketing_campaign_validate_activity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare linked_org uuid; channels text[];
begin
  -- The plan lock also serialises channel removal against new links.
  select c.planned_channels into channels from public.marketing_campaigns c where c.id=new.campaign_id and c.organisation_id=new.organisation_id for update;
  if not found or not (new.channel=any(channels)) then raise exception 'Choose a planned channel for this campaign.' using errcode='22023'; end if;
  if new.channel='email' then
    select e.organisation_id into linked_org from public.email_campaigns e where e.id=new.email_campaign_id;
  else
    select w.organisation_id into linked_org from public.whatsapp_campaigns w where w.id=new.whatsapp_campaign_id;
  end if;
  if linked_org is null or linked_org<>new.organisation_id then raise exception 'Channel activity must belong to this agency and be available to you.' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function public.marketing_campaign_validate_activity() from public,anon,authenticated;
create trigger marketing_campaign_validate_activity before insert on public.marketing_campaign_activities for each row execute function public.marketing_campaign_validate_activity();

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_activities enable row level security;
revoke all on public.marketing_campaigns,public.marketing_campaign_activities from public,anon,authenticated;
grant select on public.marketing_campaigns,public.marketing_campaign_activities to authenticated;
grant insert(id,organisation_id,name,goal,objective,audience,offer,area,start_date,end_date,status,planned_channels,cover_url) on public.marketing_campaigns to authenticated;
grant update(name,goal,objective,audience,offer,area,start_date,end_date,status,planned_channels,cover_url,revision) on public.marketing_campaigns to authenticated;
grant insert(organisation_id,campaign_id,channel,email_campaign_id,whatsapp_campaign_id) on public.marketing_campaign_activities to authenticated;
grant delete on public.marketing_campaign_activities to authenticated;
grant all on public.marketing_campaigns,public.marketing_campaign_activities to service_role;

create policy marketing_campaign_read on public.marketing_campaigns for select to authenticated using(public.bridge_is_active_member(organisation_id));
create policy marketing_campaign_create on public.marketing_campaigns for insert to authenticated with check(public.bridge_is_active_member(organisation_id) and created_by=(select auth.uid()) and revision=1);
create policy marketing_campaign_edit on public.marketing_campaigns for update to authenticated using(public.bridge_is_active_member(organisation_id) and (created_by=(select auth.uid()) or public.email_campaign_can_send(organisation_id))) with check(public.bridge_is_active_member(organisation_id) and (created_by=(select auth.uid()) or public.email_campaign_can_send(organisation_id)));
create policy marketing_campaign_activity_read on public.marketing_campaign_activities for select to authenticated using(public.bridge_is_active_member(organisation_id));
create policy marketing_campaign_activity_link on public.marketing_campaign_activities for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_activities.organisation_id and public.bridge_is_active_member(c.organisation_id) and (c.created_by=(select auth.uid()) or public.email_campaign_can_send(c.organisation_id))));
create policy marketing_campaign_activity_unlink on public.marketing_campaign_activities for delete to authenticated using(exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_activities.organisation_id and public.bridge_is_active_member(c.organisation_id) and (c.created_by=(select auth.uid()) or public.email_campaign_can_send(c.organisation_id))));
notify pgrst,'reload schema';
commit;
