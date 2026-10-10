begin;
-- First-screen notifications are separate from verified application submission emails.
-- New receipts only: intentionally no historical backfill or applicant account dependency.
create table public.recruitment_contact_notifications (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null check(organisation_id='2958d402-368e-43c9-b728-0098e10505f1'),
 lead_id uuid not null, receipt_id uuid not null references public.recruitment_contact_receipts(id),
 recipient text not null check(recipient in ('thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za')),
 contact_json jsonb not null check(jsonb_typeof(contact_json)='object'),
 message_json jsonb not null default '{}' check(jsonb_typeof(message_json)='object'),
 status text not null default 'pending' check(status in ('pending','sending','provider_accepted','suppressed','needs_attention')),
 attempts integer not null default 0, lease_id uuid, leased_until timestamptz,
 next_attempt_at timestamptz not null default now(), first_attempt_at timestamptz,
 provider_id text, last_error text, created_at timestamptz not null default now(),
 unique(lead_id,recipient),
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id),
 check(status<>'provider_accepted' or nullif(trim(provider_id),'') is not null)
);
create index recruitment_contact_notifications_pending on public.recruitment_contact_notifications(next_attempt_at,created_at) where status in ('pending','sending');
alter table public.recruitment_contact_notifications enable row level security;
revoke all on public.recruitment_contact_notifications from public,anon,authenticated;
grant select,insert,update on public.recruitment_contact_notifications to service_role;

create function public.recruitment_queue_contact_notifications() returns trigger language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype;
begin
 if new.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' then return new; end if;
 select * into candidate from public.recruitment_leads where id=new.lead_id and organisation_id=new.organisation_id;
 if current_user<>'service_role' or candidate.intake_channel not in ('website','public_link')
  or candidate.contact_capture_json->>'version' is distinct from 'recruitment-contact-v1'
  or candidate.intake_key is distinct from new.submission_key then raise exception 'Saved public recruitment contact required'; end if;
 insert into public.recruitment_contact_notifications(organisation_id,lead_id,receipt_id,recipient,contact_json)
 select new.organisation_id,new.lead_id,new.id,r,candidate.contact_capture_json
 from unnest(array['thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za']) as r
 on conflict(lead_id,recipient) do nothing;
 return new;
end; $$;
create trigger zz_recruitment_contact_notifications after insert on public.recruitment_contact_receipts for each row execute function public.recruitment_queue_contact_notifications();

create function public.recruitment_claim_contact_notifications(p_limit integer default 3) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 -- Resend remembers idempotency keys for 24h. Stop uncertain retries before that window ends.
 update public.recruitment_contact_notifications set status='needs_attention',last_error='retry_window_ended',lease_id=null,leased_until=null
  where status in ('pending','sending') and first_attempt_at<=now()-interval '23 hours';
 with claimed as (
  update public.recruitment_contact_notifications q set status='sending',lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes',attempts=q.attempts+1
  where q.id in (select id from public.recruitment_contact_notifications where status in ('pending','sending') and next_attempt_at<=now()
   and (leased_until is null or leased_until<=now()) order by created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,3),9))) returning *
 ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end; $$;

create function public.recruitment_prepare_contact_notification(p_id uuid,p_lease_id uuid,p_message jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.recruitment_contact_notifications%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 select * into q from public.recruitment_contact_notifications where id=p_id for update;
 if q.id is null or q.status<>'sending' or q.lease_id is distinct from p_lease_id or q.leased_until<=now()
  or q.first_attempt_at<=now()-interval '23 hours' then raise exception 'Claim the saved notification first'; end if;
 if q.message_json<>'{}'::jsonb then return q.message_json; end if;
 if jsonb_typeof(p_message) is distinct from 'object' or p_message->>'to' is distinct from q.recipient
  or nullif(trim(p_message->>'from'),'') is null or nullif(trim(p_message->>'subject'),'') is null
  or nullif(trim(p_message->>'html'),'') is null or nullif(trim(p_message->>'text'),'') is null
  or length(p_message::text)>200000 then raise exception 'Saved notification recipient and content required'; end if;
 update public.recruitment_contact_notifications set first_attempt_at=now(),message_json=jsonb_build_object(
  'to',q.recipient,'from',p_message->>'from','subject',p_message->>'subject','html',p_message->>'html','text',p_message->>'text') where id=q.id returning message_json into p_message;
 return p_message;
end; $$;

create function public.recruitment_complete_contact_notification(p_id uuid,p_lease_id uuid,p_provider_id text,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 update public.recruitment_contact_notifications set
  status=case when nullif(trim(p_provider_id),'') is not null then 'provider_accepted'
   when p_error='controlled_test_recipient' then 'suppressed'
   when p_error in ('invalid_saved_recipient','provider_rejected') then 'needs_attention' else 'pending' end,
  provider_id=nullif(trim(p_provider_id),''),last_error=case when nullif(trim(p_provider_id),'') is not null then null else left(p_error,80) end,
  next_attempt_at=now()+interval '5 minutes',lease_id=null,leased_until=null
 where id=p_id and status='sending' and lease_id=p_lease_id
  and (nullif(trim(p_provider_id),'') is null or (first_attempt_at is not null and message_json<>'{}'::jsonb));
 return found;
end; $$;

revoke all on function public.recruitment_queue_contact_notifications(),public.recruitment_claim_contact_notifications(integer),public.recruitment_prepare_contact_notification(uuid,uuid,jsonb),public.recruitment_complete_contact_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.recruitment_queue_contact_notifications(),public.recruitment_claim_contact_notifications(integer),public.recruitment_prepare_contact_notification(uuid,uuid,jsonb),public.recruitment_complete_contact_notification(uuid,uuid,text,text) to service_role;

create function public.recruitment_run_contact_dispatcher() returns jsonb language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; request_id bigint;
begin
 if not exists(select 1 from public.recruitment_contact_notifications where status in ('pending','sending') and next_attempt_at<=now() and (leased_until is null or leased_until<=now())) then
  return jsonb_build_object('scheduled',false,'reason','no_pending_notifications'); end if;
 select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
 select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
 if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing'); end if;
 select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/recruitment-contact-dispatcher',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key,'apikey',service_key),body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return jsonb_build_object('scheduled',true,'requestId',request_id);
end; $$;
revoke all on function public.recruitment_run_contact_dispatcher() from public,anon,authenticated;
grant execute on function public.recruitment_run_contact_dispatcher() to service_role;
do $$ begin
 if to_regclass('cron.job') is not null then execute $cron$select cron.schedule('arch9-recruitment-contact-dispatcher-1m','* * * * *','select public.recruitment_run_contact_dispatcher();')$cron$; end if;
end $$;
commit;
