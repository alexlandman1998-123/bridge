begin;
-- Applicant setup remains separate from workspace membership and public agent media.
alter table public.recruitment_leads add column applicant_photo_json jsonb not null default '{}'::jsonb;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('recruitment-profile-photos','recruitment-profile-photos',false,2097152,array['image/jpeg','image/png']) on conflict(id) do nothing;
create table public.recruitment_applicant_photo_uploads(
 id uuid primary key,organisation_id uuid not null,lead_id uuid not null,path text not null unique,
 name text not null,mime_type text not null,size integer not null check(size between 1 and 2097152),
 created_at timestamptz not null default now(),committed_at timestamptz,
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id));
alter table public.recruitment_applicant_photo_uploads enable row level security;
revoke all on public.recruitment_applicant_photo_uploads from public,anon,authenticated;
grant select,insert,update on public.recruitment_applicant_photo_uploads to service_role;
-- Existing authenticated column grants do not include applicant_photo_json.
create function public.recruitment_applicant_setup_photo(p_organisation_id uuid,p_token_hash text)
returns jsonb language sql security invoker set search_path='' as $$
 select applicant_photo_json from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
$$;
create function public.recruitment_prepare_applicant_photo(p_organisation_id uuid,p_token_hash text,p_request_id uuid,p_photo jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; a public.recruitment_applicant_photo_uploads%rowtype;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null then return '{"unavailable":true}'::jsonb; end if;
 select * into l from public.recruitment_leads where id=l.id for update;
 if l.approved_at is not null or l.status not in ('application_submitted','documents_uploaded','under_review') then return '{"unavailable":true}'::jsonb; end if;
 if p_request_id is null or jsonb_typeof(p_photo) is distinct from 'object'
  or coalesce(p_photo->>'mimeType','') not in ('image/jpeg','image/png')
  or length(trim(coalesce(p_photo->>'name',''))) not between 1 and 254 or coalesce(p_photo->>'name','')~'[/\\]'
  or coalesce(p_photo->>'size','')!~'^[0-9]{1,7}$' or (p_photo->>'size')::integer not between 1 and 2097152 then raise exception 'Choose a JPG or PNG up to 2 MB'; end if;
 select * into a from public.recruitment_applicant_photo_uploads where id=p_request_id;
 if a.id is not null then
  if a.organisation_id<>p_organisation_id or a.lead_id<>l.id or a.name<>p_photo->>'name'
   or a.mime_type<>p_photo->>'mimeType' or a.size<>(p_photo->>'size')::integer then raise exception 'Upload request belongs to different photo details'; end if;
 else
  if (select count(*) from public.recruitment_applicant_photo_uploads where lead_id=l.id and created_at>now()-interval '1 hour')>=10 then raise exception 'Photo upload limit reached'; end if;
  insert into public.recruitment_applicant_photo_uploads(id,organisation_id,lead_id,path,name,mime_type,size)
   values(p_request_id,p_organisation_id,l.id,p_organisation_id::text||'/'||l.id::text||'/'||p_request_id::text,p_photo->>'name',p_photo->>'mimeType',(p_photo->>'size')::integer) returning * into a;
 end if;
 return jsonb_build_object('path',a.path,'committed',a.committed_at is not null);
end; $$;
create function public.recruitment_commit_applicant_photo(p_organisation_id uuid,p_token_hash text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; a public.recruitment_applicant_photo_uploads%rowtype; metadata jsonb;
begin
 select * into l from public.recruitment_applicant_document_access(p_organisation_id,p_token_hash);
 if l.id is null then return '{"unavailable":true}'::jsonb; end if;
 select * into l from public.recruitment_leads where id=l.id for update;
 select * into a from public.recruitment_applicant_photo_uploads where id=p_request_id and organisation_id=p_organisation_id and lead_id=l.id for update;
 if a.id is null then raise exception 'Prepare this photo upload first'; end if;
 if a.committed_at is not null then return '{"saved":true,"duplicate":true}'::jsonb; end if;
 if l.approved_at is not null or l.status not in ('application_submitted','documents_uploaded','under_review') then return '{"unavailable":true}'::jsonb; end if;
 select s.metadata into metadata from storage.objects s where s.bucket_id='recruitment-profile-photos' and s.name=a.path;
 if metadata is null or (metadata->>'size')::bigint is distinct from a.size::bigint or metadata->>'mimetype' is distinct from a.mime_type then raise exception 'The uploaded picture could not be verified'; end if;
 update public.recruitment_leads set applicant_photo_json=jsonb_build_object('path',a.path,'name',a.name,'uploadedAt',now()) where id=l.id;
 update public.recruitment_applicant_photo_uploads set committed_at=now() where id=a.id;
 return '{"saved":true,"duplicate":false}'::jsonb;
end; $$;
create function public.recruitment_applicant_photo_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.applicant_photo_json<>'{}'::jsonb) or
  (tg_op='UPDATE' and new.applicant_photo_json is distinct from old.applicant_photo_json and
   (current_user<>'service_role' or not exists(select 1 from public.recruitment_applicant_photo_uploads a
     join storage.objects s on s.bucket_id='recruitment-profile-photos' and s.name=a.path
     where a.lead_id=new.id and a.organisation_id=new.organisation_id and a.path=new.applicant_photo_json->>'path'
      and a.name=new.applicant_photo_json->>'name' and (s.metadata->>'size')::bigint=a.size and s.metadata->>'mimetype'=a.mime_type))) then
  raise exception 'Use the verified applicant photo upload'; end if;
 return new;
end; $$;
create trigger h_recruitment_applicant_photo_guard before insert or update on public.recruitment_leads for each row execute function public.recruitment_applicant_photo_guard();
revoke all on function public.recruitment_applicant_setup_photo(uuid,text),public.recruitment_prepare_applicant_photo(uuid,text,uuid,jsonb),public.recruitment_commit_applicant_photo(uuid,text,uuid),public.recruitment_applicant_photo_guard() from public,anon,authenticated;
grant execute on function public.recruitment_applicant_setup_photo(uuid,text),public.recruitment_prepare_applicant_photo(uuid,text,uuid,jsonb),public.recruitment_commit_applicant_photo(uuid,text,uuid) to service_role;

-- Queue only newly submitted, verified Home Seekers questionnaires. No historical backfill.
create table public.recruitment_submission_email_queue(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,lead_id uuid not null unique,actor_id uuid not null,
 status text not null default 'pending' check(status in ('pending','sending','provider_accepted','needs_attention')),
 next_attempt_at timestamptz not null default now(),attempts integer not null default 0,
 created_at timestamptz not null default now(),last_error text,
 foreign key(organisation_id,lead_id) references public.recruitment_leads(organisation_id,id));
alter table public.recruitment_submission_email_queue enable row level security;
revoke all on public.recruitment_submission_email_queue from public,anon,authenticated;
grant select,insert,update on public.recruitment_submission_email_queue to service_role;
create function public.recruitment_queue_submission_email() returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;
begin
 if current_user='service_role' and old.application_submitted_at is null and new.application_submitted_at is not null
  and new.organisation_id='2958d402-368e-43c9-b728-0098e10505f1' and new.email_verification_status='verified'
  and new.application_json->>'questionnaireVersion'='recruitment-profile-v1' then
  select b.user_id into owner_id from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
   where b.organisation_id=new.organisation_id and b.lead_id=new.id and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(new.email);
  if owner_id is null then raise exception 'Verified applicant required for submission email'; end if;
  insert into public.recruitment_submission_email_queue(organisation_id,lead_id,actor_id) values(new.organisation_id,new.id,owner_id) on conflict(lead_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.recruitment_queue_submission_email() from public,anon,authenticated;
grant execute on function public.recruitment_queue_submission_email() to service_role;
create trigger zz_recruitment_submission_email after update on public.recruitment_leads for each row execute function public.recruitment_queue_submission_email();
create function public.recruitment_claim_submission_emails(p_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 update public.recruitment_submission_email_queue set status='needs_attention',last_error='retry_window_ended' where status in ('pending','sending') and created_at<now()-interval '23 hours';
 with claimed as (update public.recruitment_submission_email_queue q set status='sending',attempts=q.attempts+1,next_attempt_at=now()+interval '2 minutes'
  where q.id in (select id from public.recruitment_submission_email_queue where status in ('pending','sending') and next_attempt_at<=now()
   order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,3),10))) returning *)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end; $$;
create function public.recruitment_complete_submission_email(p_id uuid,p_accepted boolean,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 update public.recruitment_submission_email_queue set status=case when p_accepted then 'provider_accepted' when p_error='controlled_test_recipient' then 'needs_attention' else 'pending' end,
  last_error=left(p_error,80),next_attempt_at=now()+interval '5 minutes' where id=p_id and status='sending';
 return found;
end; $$;
-- This service-only function admits the queued applicant, without granting them
-- manager rights or weakening the existing manager invitation RPC.
grant select,insert,update on public.recruitment_invitation_deliveries to service_role;
create function public.recruitment_begin_submission_email(p_actor uuid,p_organisation_id uuid,p_lead_id uuid,p_kind text,p_reference_id uuid,p_request_id uuid,p_token_hash text,p_message jsonb,p_allow_duplicate boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; q public.recruitment_submission_email_queue%rowtype; a public.recruitment_invitation_deliveries%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 select * into q from public.recruitment_submission_email_queue where id=p_request_id and organisation_id=p_organisation_id and lead_id=p_lead_id and actor_id=p_actor for update;
 if q.id is null or q.status<>'sending' or q.next_attempt_at<=now() or q.created_at<=now()-interval '23 hours'
  or p_kind is distinct from 'documents_reminder' or p_reference_id is distinct from p_lead_id or p_token_hash is not null or p_allow_duplicate then raise exception 'Claim the saved submission email first'; end if;
 select * into l from public.recruitment_leads where id=p_lead_id and organisation_id=p_organisation_id for update;
 if l.id is null or l.email_verification_status<>'verified' or l.application_submitted_at is null or l.status in ('closed_lost','agent_activated','legacy_joined')
  or not exists(select 1 from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
   where b.organisation_id=l.organisation_id and b.lead_id=l.id and b.user_id=p_actor and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)) then raise exception 'Submitted applicant unavailable'; end if;
 select * into a from public.recruitment_invitation_deliveries where id=q.id for update;
 if a.id is not null and (a.organisation_id<>l.organisation_id or a.lead_id<>l.id or a.kind<>'documents_reminder' or a.recipient<>lower(trim(l.email))) then raise exception 'Email belongs to another submission'; end if;
 if a.status='provider_accepted' then return jsonb_build_object('send',false,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
 if a.id is not null then
  if a.status='sending' and a.leased_at>now()-interval '60 seconds' then return jsonb_build_object('send',false,'busy',true,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
  update public.recruitment_invitation_deliveries set status='sending',lease_id=gen_random_uuid(),leased_at=now(),updated_at=now() where id=a.id returning * into a;
 else
  if jsonb_typeof(p_message) is distinct from 'object' or p_message->>'to' is distinct from lower(trim(l.email)) then raise exception 'Email recipient must be the saved applicant'; end if;
  insert into public.recruitment_invitation_deliveries(id,organisation_id,lead_id,kind,reference_id,recipient,requested_by,message_json)
   values(q.id,l.organisation_id,l.id,'documents_reminder',l.id,lower(trim(l.email)),p_actor,p_message) returning * into a;
 end if;
 return jsonb_build_object('send',true,'attempt',to_jsonb(a));
end; $$;
revoke all on function public.recruitment_claim_submission_emails(integer),public.recruitment_complete_submission_email(uuid,boolean,text),public.recruitment_begin_submission_email(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.recruitment_claim_submission_emails(integer),public.recruitment_complete_submission_email(uuid,boolean,text),public.recruitment_begin_submission_email(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,boolean) to service_role;
create function public.recruitment_run_submission_dispatcher() returns jsonb language plpgsql security definer set search_path='' as $$
declare project_url text; service_key text; request_id bigint;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='arch9_project_url' limit 1;
 select decrypted_secret into service_key from vault.decrypted_secrets where name='arch9_service_role_key' limit 1;
 if nullif(trim(project_url),'') is null or nullif(trim(service_key),'') is null then return jsonb_build_object('scheduled',false,'reason','vault_configuration_missing'); end if;
 select net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/recruitment-submission-dispatcher',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key,'apikey',service_key),body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return jsonb_build_object('scheduled',true,'requestId',request_id);
end; $$;
revoke all on function public.recruitment_run_submission_dispatcher() from public,anon,authenticated;
grant execute on function public.recruitment_run_submission_dispatcher() to service_role;
do $$ begin
 if to_regclass('cron.job') is not null then execute $cron$select cron.schedule('arch9-recruitment-submission-dispatcher-1m','* * * * *','select public.recruitment_run_submission_dispatcher();')$cron$; end if;
end $$;
commit;
