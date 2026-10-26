begin;

create function public.marketing_campaign_setup_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare k text; v jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  for k,v in select * from jsonb_each(value) loop
    if k not in ('metaObjective','customGoal','target','audienceId','placeId') or jsonb_typeof(v) <> 'string' then return false; end if;
    if length(v #>> '{}') > (case k when 'metaObjective' then 40 when 'customGoal' then 120 when 'target' then 240 when 'audienceId' then 36 else 300 end) then return false; end if;
  end loop;
  if coalesce(value->>'metaObjective','') not in ('','OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_SALES','OUTCOME_APP_PROMOTION') then return false; end if;
  if coalesce(value->>'audienceId','') <> '' and (value->>'audienceId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  return true;
end $$;
revoke all on function public.marketing_campaign_setup_valid(jsonb) from public, anon;
grant execute on function public.marketing_campaign_setup_valid(jsonb) to authenticated, service_role;

alter table public.marketing_campaigns add column campaign_setup jsonb not null default '{}'::jsonb
  check (public.marketing_campaign_setup_valid(campaign_setup));
grant insert(campaign_setup), update(campaign_setup) on public.marketing_campaigns to authenticated;

alter table public.marketing_campaign_templates add column campaign_setup jsonb not null default '{}'::jsonb
  check (public.marketing_campaign_setup_valid(campaign_setup));
grant insert(campaign_setup), update(campaign_setup) on public.marketing_campaign_templates to authenticated;

comment on column public.marketing_campaigns.campaign_setup is 'Structured planning intent: exact Meta objective, measurable target, custom goal and Google region reference. Audience ID is an intent reference; the shared audience association retains its own RLS.';
-- Audience selection is saved atomically under the existing audience RLS.
-- Agent copies retain provider intent without inheriting a CRM segment or
-- Google region belonging to the original campaign's audience/area.
create function public.marketing_campaign_setup_copy_intent()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare source_setup jsonb; source_id uuid := nullif(to_jsonb(new)->>'copied_from_id','')::uuid;
begin
  if source_id is not null and new.campaign_setup = '{}'::jsonb then
    select campaign_setup - 'audienceId' - 'placeId' into source_setup from public.marketing_campaigns
      where id=source_id and organisation_id=new.organisation_id;
    new.campaign_setup := coalesce(source_setup,'{}'::jsonb);
  end if;
  return new;
end $$;
revoke all on function public.marketing_campaign_setup_copy_intent() from public,anon;
grant execute on function public.marketing_campaign_setup_copy_intent() to authenticated,service_role;
create trigger marketing_campaign_setup_copy_intent before insert on public.marketing_campaigns
  for each row execute function public.marketing_campaign_setup_copy_intent();

create function public.marketing_campaign_setup_audience_sync()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare audience uuid := nullif(new.campaign_setup->>'audienceId','')::uuid;
begin
  if tg_op = 'UPDATE' then
    if coalesce(old.campaign_setup->>'audienceId','') = coalesce(new.campaign_setup->>'audienceId','') then return new; end if;
  end if;
  if audience is not null then
    insert into public.marketing_campaign_audiences(campaign_id,organisation_id,audience_id)
      values(new.id,new.organisation_id,audience)
      on conflict(campaign_id) do update set audience_id=excluded.audience_id,updated_at=now();
  elsif tg_op = 'UPDATE' then
    delete from public.marketing_campaign_audiences where campaign_id=new.id and organisation_id=new.organisation_id;
  end if;
  return new;
end $$;
revoke all on function public.marketing_campaign_setup_audience_sync() from public,anon;
grant execute on function public.marketing_campaign_setup_audience_sync() to authenticated,service_role;
create trigger marketing_campaign_setup_audience_sync after insert or update of campaign_setup on public.marketing_campaigns
  for each row execute function public.marketing_campaign_setup_audience_sync();
notify pgrst, 'reload schema';
commit;
