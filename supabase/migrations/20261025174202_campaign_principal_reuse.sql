begin;

-- Preserve created_by as the campaign owner so copied drafts use the existing
-- edit, asset and enquiry permissions. Managers may create a fresh draft for an
-- active agency member, never transfer an existing campaign's ownership.
alter table public.marketing_campaigns
  add column copied_from_id uuid,
  add column copied_from_revision integer,
  add column copied_by uuid references auth.users(id),
  add constraint marketing_campaign_copy_source foreign key(copied_from_id,organisation_id) references public.marketing_campaigns(id,organisation_id),
  add constraint marketing_campaign_copy_metadata check (
    (copied_from_id is null and copied_from_revision is null and copied_by is null)
    or (copied_from_id is not null and copied_from_revision is not null and copied_from_revision>0 and copied_by is not null)
  );

create function public.marketing_campaign_copy_target(p_org uuid,p_agent uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select public.bridge_is_active_member(p_org) and public.email_campaign_can_send(p_org)
    and exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=p_agent
      and lower(btrim(coalesce(u.membership_status,u.status,''))) in ('active','accepted'));
$$;
revoke all on function public.marketing_campaign_copy_target(uuid,uuid) from public,anon;
grant execute on function public.marketing_campaign_copy_target(uuid,uuid) to authenticated;

create function public.marketing_campaign_copy_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare source public.marketing_campaigns;
begin
  if tg_op='UPDATE' then
    if (new.copied_from_id,new.copied_from_revision,new.copied_by) is distinct from (old.copied_from_id,old.copied_from_revision,old.copied_by) then
      raise exception 'Campaign copy history cannot be changed.' using errcode='42501';
    end if;
    return new;
  end if;
  if new.copied_from_id is null then
    if new.copied_from_revision is not null or new.copied_by is not null then raise exception 'Choose a source campaign.' using errcode='22023'; end if;
    return new;
  end if;
  if auth.uid() is null or not public.marketing_campaign_copy_target(new.organisation_id,new.created_by) then
    raise exception 'Choose an active agent in this agency. Only agency managers may copy campaigns to agents.' using errcode='42501';
  end if;
  select * into source from public.marketing_campaigns where id=new.copied_from_id and organisation_id=new.organisation_id for share;
  if source.id is null or source.revision is distinct from new.copied_from_revision or new.id=source.id then
    raise exception 'The source campaign changed. Refresh before copying it.' using errcode='40001';
  end if;
  if new.status<>'draft' or new.revision<>1 or new.listing_builder is not null or new.campaign_builder is not null
    or new.planned_budget is not null or new.cover_url<>''
    or (new.playbook is not null and new.playbook->>'sourceRevision'<>'0') then
    raise exception 'Create a fresh campaign plan without recipients, results or source artwork.' using errcode='22023';
  end if;
  new.copied_by:=auth.uid();
  return new;
end; $$;
revoke all on function public.marketing_campaign_copy_guard() from public,anon,authenticated;
create trigger marketing_campaign_copy_guard before insert or update on public.marketing_campaigns for each row execute function public.marketing_campaign_copy_guard();
grant insert(created_by,copied_from_id,copied_from_revision) on public.marketing_campaigns to authenticated;
create policy marketing_campaign_copy_create on public.marketing_campaigns for insert to authenticated with check (
  copied_from_id is not null and copied_by=auth.uid() and status='draft' and revision=1
  and public.marketing_campaign_copy_target(organisation_id,created_by)
);

-- An invoker transaction retains source RLS, manager checks and all constraints.
-- Stable request IDs recover a committed copy after an interrupted response.
create function public.marketing_campaign_copy(p_org uuid,p_source uuid,p_revision integer,p_target uuid,p_id uuid,p_draft jsonb)
returns public.marketing_campaigns language plpgsql security invoker set search_path='' as $$
declare source public.marketing_campaigns; saved public.marketing_campaigns;
begin
  if auth.uid() is null or not public.marketing_campaign_copy_target(p_org,p_target) then raise exception 'Only agency managers can copy to active agents in this agency.' using errcode='42501'; end if;
  if p_id is null or p_source is null or p_id=p_source or p_revision is null then raise exception 'Reopen the campaign copy.' using errcode='22023'; end if;
  -- Recovery reads only this caller's original copy and never overwrites edits.
  select * into saved from public.marketing_campaigns where id=p_id and organisation_id=p_org;
  if saved.id is not null then
    if saved.copied_by is distinct from auth.uid() or saved.copied_from_id is distinct from p_source or saved.copied_from_revision is distinct from p_revision or saved.created_by is distinct from p_target then
      raise exception 'This request identifier belongs to another campaign.' using errcode='23505';
    end if;
    return saved;
  end if;
  select * into source from public.marketing_campaigns where id=p_source and organisation_id=p_org for share;
  if source.id is null or source.revision is distinct from p_revision then raise exception 'The source campaign changed. Refresh before copying it.' using errcode='40001'; end if;
  if jsonb_typeof(p_draft) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_draft) k where k not in ('name','objective','audience','offer','area','start_date','end_date','channel_content','playbook')) then
    raise exception 'Choose only reusable campaign content.' using errcode='22023';
  end if;
  insert into public.marketing_campaigns(id,organisation_id,created_by,copied_from_id,copied_from_revision,name,goal,objective,audience,offer,area,start_date,end_date,status,planned_channels,channel_content,playbook)
    values(p_id,p_org,p_target,p_source,p_revision,p_draft->>'name',source.goal,p_draft->>'objective',coalesce(p_draft->>'audience',''),coalesce(p_draft->>'offer',''),p_draft->>'area',nullif(p_draft->>'start_date','')::date,nullif(p_draft->>'end_date','')::date,'draft',source.planned_channels,p_draft->'channel_content',nullif(p_draft->'playbook','null'::jsonb))
    on conflict(id) do nothing returning * into saved;
  if saved.id is null then
    select * into saved from public.marketing_campaigns where id=p_id and organisation_id=p_org;
    if saved.id is null or saved.copied_by is distinct from auth.uid() or saved.copied_from_id is distinct from p_source or saved.copied_from_revision is distinct from p_revision or saved.created_by is distinct from p_target then raise exception 'This request identifier belongs to another campaign.' using errcode='23505'; end if;
  end if;
  return saved;
end; $$;
revoke all on function public.marketing_campaign_copy(uuid,uuid,integer,uuid,uuid,jsonb) from public,anon;
grant execute on function public.marketing_campaign_copy(uuid,uuid,integer,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
