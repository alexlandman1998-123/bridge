begin;

-- Draft content is plain text. It contains no recipients, delivery IDs or schedules.
create function public.marketing_campaign_content_valid(content jsonb, channels text[])
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare channel text; draft jsonb; field text; value jsonb;
begin
  if content is null or jsonb_typeof(content)<>'object' or octet_length(content::text)>60000 then return false; end if;
  for channel,draft in select * from jsonb_each(content) loop
    if not (channel=any(channels)) or jsonb_typeof(draft)<>'object' then return false; end if;
    for field,value in select * from jsonb_each(draft) loop
      if field not in ('title','body','timing') or jsonb_typeof(value)<>'string' then return false; end if;
      if length(value #>> '{}') > (case when field='body' then 12000 else 240 end) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function public.marketing_campaign_content_valid(jsonb,text[]) from public,anon;
grant execute on function public.marketing_campaign_content_valid(jsonb,text[]) to authenticated,service_role;

-- Keep existing campaigns working; only add storage for reusable draft content.
alter table public.marketing_campaigns add column channel_content jsonb not null default '{}'::jsonb;
do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint where conrelid='public.marketing_campaigns'::regclass and contype='c' and pg_get_constraintdef(oid) like '%planned_channels%' loop
    execute format('alter table public.marketing_campaigns drop constraint %I',constraint_name);
  end loop;
end $$;
alter table public.marketing_campaigns add constraint marketing_campaign_channels_valid check (
  cardinality(planned_channels) between 1 and 4 and array_position(planned_channels,null) is null
  and planned_channels <@ array['email','whatsapp','meta','social']::text[]
);
alter table public.marketing_campaigns add constraint marketing_campaign_content_valid check (public.marketing_campaign_content_valid(channel_content,planned_channels));
grant insert(channel_content),update(channel_content) on public.marketing_campaigns to authenticated;

create table public.marketing_campaign_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 120),
  goal text not null check(goal in ('seller_leads','buyer_leads','promote_listing','reengage','custom')),
  objective text not null check(length(btrim(objective)) between 1 and 240),
  audience text not null default '' check(length(audience)<=600),
  offer text not null default '' check(length(offer)<=600),
  area text not null default '' check(length(area)<=120),
  cover_url text not null default '' check(cover_url='' or (length(cover_url)<=2048 and cover_url ~ '^https://[^[:space:]]+$')),
  planned_channels text[] not null check(cardinality(planned_channels) between 1 and 4 and array_position(planned_channels,null) is null and planned_channels <@ array['email','whatsapp','meta','social']::text[]),
  run_mode text not null check(run_mode in ('bounded','ongoing')),
  duration_days integer,
  visibility text not null default 'personal' check(visibility in ('personal','agency')),
  channel_content jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check(revision>0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((run_mode='bounded' and duration_days between 1 and 366) or (run_mode='ongoing' and duration_days is null)),
  check(run_mode<>'bounded' or duration_days is not null),
  check(public.marketing_campaign_content_valid(channel_content,planned_channels))
);
create index marketing_campaign_templates_org_updated on public.marketing_campaign_templates(organisation_id,updated_at desc,id);
create function public.marketing_campaign_template_protect()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if (new.id,new.organisation_id,new.created_by,new.created_at) is distinct from (old.id,old.organisation_id,old.created_by,old.created_at) then
      raise exception 'Template ownership cannot be changed.' using errcode='42501';
    end if;
    if new.revision<>old.revision+1 then raise exception 'This template changed. Reload before saving.' using errcode='40001'; end if;
  end if;
  if cardinality(new.planned_channels)<>(select count(distinct channel) from unnest(new.planned_channels) channel) then raise exception 'Choose each channel once.' using errcode='22023'; end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function public.marketing_campaign_template_protect() from public,anon,authenticated;
create trigger marketing_campaign_template_protect before insert or update on public.marketing_campaign_templates for each row execute function public.marketing_campaign_template_protect();
alter table public.marketing_campaign_templates enable row level security;
revoke all on public.marketing_campaign_templates from public,anon,authenticated;
grant select on public.marketing_campaign_templates to authenticated;
grant insert(id,organisation_id,name,goal,objective,audience,offer,area,cover_url,planned_channels,run_mode,duration_days,visibility,channel_content) on public.marketing_campaign_templates to authenticated;
grant update(name,goal,objective,audience,offer,area,cover_url,planned_channels,run_mode,duration_days,visibility,channel_content,revision) on public.marketing_campaign_templates to authenticated;
grant all on public.marketing_campaign_templates to service_role;
create policy marketing_template_read on public.marketing_campaign_templates for select to authenticated using(
  public.bridge_is_active_member(organisation_id) and (visibility='agency' or created_by=(select auth.uid()))
);
create policy marketing_template_create on public.marketing_campaign_templates for insert to authenticated with check(
  public.bridge_is_active_member(organisation_id) and created_by=(select auth.uid()) and revision=1
  and (visibility='personal' or public.email_campaign_can_send(organisation_id))
);
create policy marketing_template_edit on public.marketing_campaign_templates for update to authenticated using(
  public.bridge_is_active_member(organisation_id) and ((visibility='personal' and created_by=(select auth.uid())) or (visibility='agency' and public.email_campaign_can_send(organisation_id)))
) with check(
  public.bridge_is_active_member(organisation_id) and ((visibility='personal' and created_by=(select auth.uid())) or (visibility='agency' and public.email_campaign_can_send(organisation_id)))
);
notify pgrst,'reload schema';
commit;
