begin;

-- An explicit, user-recorded response association. Existing CRM records retain
-- ownership, contact history and tasks; clicks/reads never create enquiries.
create table public.marketing_campaign_enquiries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  channel text not null check(channel in ('email','whatsapp','facebook','instagram','form','phone','other')),
  responded_at timestamptz not null check(responded_at <= now() + interval '5 minutes'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(campaign_id,organisation_id) references public.marketing_campaigns(id,organisation_id) on delete cascade,
  unique(campaign_id,lead_id)
);
create index marketing_campaign_enquiries_scope on public.marketing_campaign_enquiries(organisation_id,campaign_id,responded_at desc,id);
create index marketing_campaign_enquiries_lead on public.marketing_campaign_enquiries(lead_id);

create function public.marketing_campaign_can_work_enquiry(p_org uuid,p_campaign uuid,p_lead uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and public.bridge_is_active_member(p_org) and exists(
    select 1 from public.marketing_campaigns c join public.leads l on l.organisation_id=c.organisation_id
    where c.id=p_campaign and c.organisation_id=p_org and l.lead_id=p_lead
      and coalesce(l.lead_domain,'agency')='agency'
      and (c.created_by=auth.uid() or public.email_campaign_can_send(p_org)
        or l.assigned_agent_id=auth.uid() or l.assigned_user_id=auth.uid())
  );
$$;
revoke all on function public.marketing_campaign_can_work_enquiry(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketing_campaign_can_work_enquiry(uuid,uuid,uuid) to authenticated;

alter table public.marketing_campaign_enquiries enable row level security;
revoke all on public.marketing_campaign_enquiries from public,anon,authenticated;
grant select on public.marketing_campaign_enquiries to authenticated;
grant insert(organisation_id,campaign_id,lead_id,channel,responded_at,created_by) on public.marketing_campaign_enquiries to authenticated;
grant all on public.marketing_campaign_enquiries to service_role;
create policy campaign_enquiries_read on public.marketing_campaign_enquiries for select to authenticated using (
  public.bridge_is_active_member(organisation_id)
  and exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and c.organisation_id=marketing_campaign_enquiries.organisation_id)
  and exists(select 1 from public.leads l where l.lead_id=marketing_campaign_enquiries.lead_id and l.organisation_id=marketing_campaign_enquiries.organisation_id and coalesce(l.lead_domain,'agency')='agency')
);
create policy campaign_enquiries_insert on public.marketing_campaign_enquiries for insert to authenticated with check (
  created_by=auth.uid() and public.marketing_campaign_can_work_enquiry(organisation_id,campaign_id,lead_id)
);

-- All writes run with the caller's RLS permissions. Contact/task creation and
-- audit activity are atomic, with client request IDs making retries harmless.
create function public.marketing_campaign_enquiry_action(p_org uuid,p_campaign uuid,p_lead uuid,p_action text,p_payload jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  enquiry public.marketing_campaign_enquiries;
  lead public.leads;
  task public.tasks;
  activity public.lead_activities;
  result_id uuid;
  wrote integer;
  title text;
  channel text;
  occurred_at timestamptz;
  note text;
  due_on date;
begin
  if not public.marketing_campaign_can_work_enquiry(p_org,p_campaign,p_lead) then
    raise exception 'This enquiry is not available to you or you cannot manage its follow-up.' using errcode='42501';
  end if;
  if p_action='record' then
    occurred_at:=(p_payload->>'respondedAt')::timestamptz;
    insert into public.marketing_campaign_enquiries(organisation_id,campaign_id,lead_id,channel,responded_at,created_by)
      values(p_org,p_campaign,p_lead,p_payload->>'channel',occurred_at,auth.uid())
      on conflict(campaign_id,lead_id) do nothing;
    select id into result_id from public.marketing_campaign_enquiries where organisation_id=p_org and campaign_id=p_campaign and lead_id=p_lead;
    return result_id;
  end if;
  select * into enquiry from public.marketing_campaign_enquiries where organisation_id=p_org and campaign_id=p_campaign and lead_id=p_lead;
  if enquiry.id is null then raise exception 'Record this campaign enquiry first.'; end if;
  select * into lead from public.leads where organisation_id=p_org and lead_id=p_lead;
  result_id:=(p_payload->>'id')::uuid;
  if result_id is null then raise exception 'A request identifier is required.'; end if;

  if p_action='follow_up' then
    title:=btrim(p_payload->>'title');
    due_on:=(p_payload->>'dueDate')::date;
    if title is null or length(title) not between 1 and 180 or due_on is null then raise exception 'Enter a follow-up title and due date.'; end if;
    insert into public.tasks(task_id,organisation_id,lead_id,assigned_agent_id,created_by,title,due_date,status,priority,metadata)
      values(result_id,p_org,p_lead,coalesce(lead.assigned_user_id,lead.assigned_agent_id,auth.uid()),auth.uid(),title,due_on,'Pending','Medium',jsonb_build_object('marketing_campaign_id',p_campaign,'campaign_enquiry_id',enquiry.id))
      on conflict(task_id) do nothing;
    get diagnostics wrote=row_count;
    select * into task from public.tasks where task_id=result_id and organisation_id=p_org and lead_id=p_lead;
    if task.task_id is null or task.title is distinct from title or task.due_date is distinct from due_on or task.metadata->>'campaign_enquiry_id' is distinct from enquiry.id::text then
      raise exception 'This request identifier was already used. Refresh before trying again.';
    end if;
    if wrote=1 then
      insert into public.lead_activities(activity_id,organisation_id,lead_id,agent_id,activity_type,activity_note,outcome)
        values(gen_random_uuid(),p_org,p_lead,auth.uid(),'Follow-up','Task created: '||title,'Pending');
    end if;
  elsif p_action='complete' then
    update public.tasks set status='Completed',updated_at=now()
      where task_id=result_id and organisation_id=p_org and lead_id=p_lead and lower(status) not in ('completed','cancelled','canceled','done');
    get diagnostics wrote=row_count;
    select * into task from public.tasks where task_id=result_id and organisation_id=p_org and lead_id=p_lead;
    if task.task_id is null then raise exception 'This task is not available to you.'; end if;
    if lower(task.status) not in ('completed','done') then raise exception 'This task is no longer open. Refresh before trying again.'; end if;
    if wrote=1 then
      insert into public.lead_activities(activity_id,organisation_id,lead_id,agent_id,activity_type,activity_note,outcome)
        values(gen_random_uuid(),p_org,p_lead,auth.uid(),'Follow-up','Task completed: '||task.title,'Completed');
    end if;
  elsif p_action='contact' then
    channel:=p_payload->>'channel';
    occurred_at:=(p_payload->>'contactedAt')::timestamptz;
    note:=btrim(coalesce(p_payload->>'note',''));
    if channel is null or channel not in ('Call','Email','WhatsApp','Meeting') or occurred_at is null or occurred_at>now()+interval '5 minutes' or length(note)>2000 then
      raise exception 'Choose a contact method, a past contact time and a note of up to 2,000 characters.';
    end if;
    insert into public.lead_activities(activity_id,organisation_id,lead_id,agent_id,activity_type,activity_date,activity_note,outcome)
      values(result_id,p_org,p_lead,auth.uid(),channel,occurred_at,'Campaign follow-up: '||case when note='' then 'Contact recorded' else note end,'Contacted')
      on conflict(activity_id) do nothing;
    select * into activity from public.lead_activities where activity_id=result_id and organisation_id=p_org and lead_id=p_lead;
    if activity.activity_id is null or activity.activity_type is distinct from channel or activity.activity_date is distinct from occurred_at or activity.activity_note is distinct from ('Campaign follow-up: '||case when note='' then 'Contact recorded' else note end) or activity.outcome is distinct from 'Contacted' then
      raise exception 'This request identifier was already used. Refresh before trying again.';
    end if;
  else raise exception 'Choose a supported enquiry action.';
  end if;
  return result_id;
end;
$$;
revoke all on function public.marketing_campaign_enquiry_action(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.marketing_campaign_enquiry_action(uuid,uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
