begin;

alter table public.whatsapp_campaigns add column scheduled_at timestamptz;

-- Only explicitly confirmed campaigns receive a job. Existing unfinished sends
-- remain untouched until a member chooses Resume in campaign results.
create table public.whatsapp_campaign_jobs (
  campaign_id uuid primary key,
  organisation_id uuid not null,
  scheduled_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued','running','paused','completed','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  started_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  foreign key (organisation_id,campaign_id) references public.whatsapp_campaigns(organisation_id,id) on delete cascade
);
create index whatsapp_campaign_jobs_due_idx on public.whatsapp_campaign_jobs(scheduled_for, campaign_id) where status in ('queued','running');
alter table public.whatsapp_campaign_jobs enable row level security;
create policy whatsapp_campaign_jobs_read on public.whatsapp_campaign_jobs for select to authenticated using (public.bridge_is_active_member(organisation_id));
revoke all on public.whatsapp_campaign_jobs from public, anon, authenticated;
grant select on public.whatsapp_campaign_jobs to authenticated;
grant all on public.whatsapp_campaign_jobs to service_role;

-- Keep existing view columns in their original order; append schedule metadata.
create or replace view public.whatsapp_campaign_performance with (security_invoker = true) as
select c.id,c.organisation_id,c.name,c.sender_id,c.template,c.parameter_values,c.contact_ids,c.status,c.revision,c.phone_number_id,c.waba_id,c.created_by,c.created_at,c.updated_at,c.sent_at,
  count(r.id)::integer as recipients,
  count(r.id) filter (where r.status in ('sent','delivered','read'))::integer as accepted,
  count(r.id) filter (where r.delivered_at is not null or r.read_at is not null)::integer as delivered,
  count(r.id) filter (where r.read_at is not null)::integer as read,
  count(r.id) filter (where r.status = 'failed')::integer as failed,
  count(r.id) filter (where r.status = 'skipped')::integer as skipped,
  count(r.id) filter (where r.status = 'unknown' or (r.status = 'processing' and r.attempted_at < now() - interval '2 minutes'))::integer as uncertain,
  count(r.id) filter (where r.status = 'queued')::integer as queued,
  case when c.status = 'draft' then 'draft'
    when j.status = 'cancelled' then 'cancelled'
    when j.status = 'paused' then 'paused'
    when j.status = 'queued' and j.started_at is null and j.scheduled_for > now() then 'scheduled'
    when count(r.id) filter (where r.status = 'queued' or (r.status = 'processing' and r.attempted_at >= now() - interval '2 minutes')) > 0 then 'sending'
    when count(r.id) filter (where r.status in ('unknown','processing')) > 0 then 'needs_attention'
    when count(r.id) filter (where r.status in ('failed','skipped')) = count(r.id) then 'failed'
    when count(r.id) filter (where r.status in ('failed','skipped')) > 0 then 'partial'
    else 'sent' end as display_status,
  c.scheduled_at,j.status as delivery_state,j.last_error as delivery_error
from public.whatsapp_campaigns c
left join public.whatsapp_campaign_recipients r on r.campaign_id = c.id
left join public.whatsapp_campaign_jobs j on j.campaign_id = c.id
group by c.id,j.campaign_id;

create function public.whatsapp_campaign_enqueue(p_id uuid,p_org uuid,p_revision integer,p_template jsonb,p_messages jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare c public.whatsapp_campaigns;
begin
  select * into c from public.whatsapp_campaigns where id=p_id and organisation_id=p_org for update;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status <> 'draft' then return c.id; end if;
  if c.scheduled_at is not null and c.scheduled_at <= now() then raise exception 'Choose a future sending time and check readiness again.'; end if;
  perform public.whatsapp_campaign_prepare(p_id,p_org,p_revision,p_template,p_messages);
  insert into public.whatsapp_campaign_jobs(campaign_id,organisation_id,scheduled_for) values(p_id,p_org,coalesce(c.scheduled_at,now()));
  update public.whatsapp_campaigns set sent_at=null where id=p_id;
  return p_id;
end $$;

create function public.whatsapp_campaign_job_control(p_id uuid,p_org uuid,p_action text)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.whatsapp_campaigns; j public.whatsapp_campaign_jobs;
begin
  select * into c from public.whatsapp_campaigns where id=p_id and organisation_id=p_org for update;
  if not found or c.status <> 'sending' then raise exception 'Confirm the campaign before managing delivery.'; end if;
  if p_action not in ('pause','resume','cancel') then raise exception 'Invalid delivery action'; end if;
  select * into j from public.whatsapp_campaign_jobs where campaign_id=p_id and organisation_id=p_org for update;
  if not found then
    if p_action <> 'resume' then raise exception 'Resume this unfinished campaign first.'; end if;
    if not exists(select 1 from public.whatsapp_campaign_recipients where campaign_id=p_id and status='queued') then raise exception 'No unsent recipients remain.'; end if;
    insert into public.whatsapp_campaign_jobs(campaign_id,organisation_id,scheduled_for) values(p_id,p_org,now());
    return;
  end if;
  if j.status in ('cancelled','completed') then raise exception 'This campaign has finished.'; end if;
  if p_action='resume' and j.status <> 'paused' then return; end if;
  update public.whatsapp_campaign_jobs set status=case p_action when 'resume' then 'queued' when 'pause' then 'paused' else 'cancelled' end,
    lease_token=null,lease_until=null,last_error=null,updated_at=now() where campaign_id=p_id;
  if p_action='cancel' then
    update public.whatsapp_campaign_recipients set status='skipped',error_message='Campaign cancelled before sending.',updated_at=now() where campaign_id=p_id and status='queued';
  end if;
end $$;

create function public.whatsapp_campaign_jobs_claim(p_limit integer default 3)
returns setof public.whatsapp_campaign_jobs language plpgsql security invoker set search_path = '' as $$
declare c public.whatsapp_campaigns;
begin
  -- A worker that died after its last claim leaves an uncertain recipient, never
  -- a retry. Close its job after the lease expires so it stops being polled.
  update public.whatsapp_campaign_jobs j set status='completed',lease_token=null,lease_until=null,updated_at=now()
    where j.status in ('queued','running') and (j.lease_until is null or j.lease_until < now())
    and not exists(select 1 from public.whatsapp_campaign_recipients r where r.campaign_id=j.campaign_id and r.status='queued');
  for c in select campaign.* from public.whatsapp_campaigns campaign join public.whatsapp_campaign_jobs j on j.campaign_id=campaign.id
    where j.status in ('queued','running') and j.scheduled_for <= now() and (j.lease_until is null or j.lease_until < now())
    order by j.scheduled_for,j.campaign_id limit greatest(1,least(coalesce(p_limit,3),5)) for update of campaign skip locked
  loop
    -- Recheck after obtaining the campaign lock: pause/cancel may have won it.
    return query update public.whatsapp_campaign_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',started_at=coalesce(started_at,now()),updated_at=now()
      where campaign_id=c.id and status in ('queued','running') and (lease_until is null or lease_until < now()) returning *;
    if found then update public.whatsapp_campaigns set sent_at=coalesce(sent_at,now()),updated_at=now() where id=c.id; end if;
  end loop;
end $$;

-- An old browser cannot bypass scheduled times or a paused/cancelled job. The
-- optional token keeps the legacy no-job claim compatible during deployment.
drop function public.whatsapp_campaign_claim(uuid,uuid);
create function public.whatsapp_campaign_claim(p_id uuid,p_org uuid,p_token uuid default null)
returns setof public.whatsapp_campaign_recipients language plpgsql security invoker set search_path = '' as $$
declare r public.whatsapp_campaign_recipients; person public.whatsapp_marketing_contacts; j public.whatsapp_campaign_jobs;
begin
  select * into r from public.whatsapp_campaign_recipients where id=p_id and organisation_id=p_org;
  if not found then return; end if;
  select * into j from public.whatsapp_campaign_jobs where campaign_id=r.campaign_id for update;
  if found and (j.status <> 'running' or j.scheduled_for > now() or j.lease_until is null or j.lease_until <= now() or j.lease_token is distinct from p_token) then return; end if;
  select * into r from public.whatsapp_campaign_recipients where id=p_id and organisation_id=p_org and status='queued' for update;
  if not found then return; end if;
  -- Check sender ownership and identity again immediately before each attempt.
  if not exists(select 1 from public.whatsapp_campaigns c join public.organisation_communication_channels ch on ch.id=c.sender_id and ch.organisation_id=c.organisation_id
    where c.id=r.campaign_id and c.organisation_id=p_org and ch.connection_status='connected' and ch.provider='meta' and ch.channel_type='whatsapp' and ch.phone_number_id=c.phone_number_id and ch.waba_id=c.waba_id) then return; end if;
  select * into person from public.whatsapp_marketing_contacts where id=r.contact_id and organisation_id=p_org for share;
  if not found or person.consent_status <> 'opted_in' or person.opted_out_at is not null or person.phone <> r.phone then
    update public.whatsapp_campaign_recipients set status='skipped',error_message='Recipient consent or phone changed.',updated_at=now() where id=r.id;
    return;
  end if;
  return query update public.whatsapp_campaign_recipients set status='processing',attempted_at=now(),updated_at=now() where id=r.id returning *;
end $$;

create function public.whatsapp_campaign_job_finish(p_id uuid,p_org uuid,p_token uuid,p_error text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.whatsapp_campaign_jobs j set status=case when p_error is not null then 'paused'
    when exists(select 1 from public.whatsapp_campaign_recipients r where r.campaign_id=p_id and r.status='queued') then 'queued' else 'completed' end,
    last_error=left(p_error,1000),lease_token=null,lease_until=null,updated_at=now()
    where campaign_id=p_id and organisation_id=p_org and status='running' and lease_token=p_token;
end $$;

revoke all on function public.whatsapp_campaign_enqueue(uuid,uuid,integer,jsonb,jsonb),public.whatsapp_campaign_job_control(uuid,uuid,text),public.whatsapp_campaign_jobs_claim(integer),public.whatsapp_campaign_claim(uuid,uuid,uuid),public.whatsapp_campaign_job_finish(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.whatsapp_campaign_enqueue(uuid,uuid,integer,jsonb,jsonb),public.whatsapp_campaign_job_control(uuid,uuid,text),public.whatsapp_campaign_jobs_claim(integer),public.whatsapp_campaign_claim(uuid,uuid,uuid),public.whatsapp_campaign_job_finish(uuid,uuid,uuid,text) to service_role;

-- Reuse the project's existing Vault names and minute scheduler. No provider
-- credentials are stored in job rows, SQL text or browser-visible configuration.
create schema if not exists private;
create function private.run_whatsapp_campaign_worker()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare project_url text; service_key text; request_id bigint; headers jsonb;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required'; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
  if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then
    raise warning 'WhatsApp campaign worker is missing Vault configuration.';
    return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing');
  end if;
  if not exists(select 1 from public.whatsapp_campaign_jobs where status in ('queued','running') and scheduled_for <= now()) then return jsonb_build_object('scheduled',false,'reason','no_due_campaigns'); end if;
  headers := jsonb_build_object('Content-Type','application/json','apikey',service_key);
  if left(service_key,10) <> 'sb_secret_' then headers := headers || jsonb_build_object('Authorization','Bearer ' || service_key); end if;
  select net.http_post(url:=rtrim(project_url,'/') || '/functions/v1/whatsapp-campaign-worker',headers:=headers,body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
  return jsonb_build_object('scheduled',true,'request_id',request_id);
end $$;
revoke all on function private.run_whatsapp_campaign_worker() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.run_whatsapp_campaign_worker() to service_role;
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('whatsapp-campaign-worker','* * * * *','select private.run_whatsapp_campaign_worker();');
  else
    raise notice 'Enable pg_cron and pg_net, then schedule private.run_whatsapp_campaign_worker() every minute.';
  end if;
end $$;

commit;
