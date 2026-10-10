begin;
-- Extend the existing workers. Only future form/upload events queue mail;
-- applying this migration never emails historical contacts or applications.
alter table public.recruitment_contact_notifications
 add column event_kind text not null default 'lead_received'
  check(event_kind in ('lead_received','application_received','documents_received')),
 alter column receipt_id drop not null,
 drop constraint recruitment_contact_notifications_lead_id_recipient_key,
 add unique(lead_id,event_kind,recipient),
 add check(event_kind<>'lead_received' or receipt_id is not null);

create or replace function public.recruitment_queue_contact_notifications() returns trigger language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype;
begin
 if new.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' then return new; end if;
 select * into candidate from public.recruitment_leads where id=new.lead_id and organisation_id=new.organisation_id;
 if current_user<>'service_role' or candidate.intake_channel not in ('website','public_link')
  or candidate.contact_capture_json->>'version' is distinct from 'recruitment-contact-v1'
  or candidate.intake_key is distinct from new.submission_key then raise exception 'Saved public recruitment contact required'; end if;
 insert into public.recruitment_contact_notifications(organisation_id,lead_id,receipt_id,recipient,contact_json,event_kind)
 select new.organisation_id,new.lead_id,new.id,r,candidate.contact_capture_json,'lead_received'
 from unnest(array['thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za']) r
 on conflict(lead_id,event_kind,recipient) do nothing;
 return new;
end; $$;

create function public.recruitment_requested_documents_complete(p_organisation_id uuid,p_documents jsonb,p_waivers jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select public.recruitment_documents_complete(p_documents,p_waivers)
 and (p_organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' or
  exists(select 1 from jsonb_array_elements(p_documents) d where d->>'type'='Other' and nullif(trim(d->>'path'),'') is not null));
$$;
revoke all on function public.recruitment_requested_documents_complete(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.recruitment_requested_documents_complete(uuid,jsonb,jsonb) to authenticated,service_role;

-- The separate Home Seekers proof-of-address slot is stored as Other for
-- compatibility with retained uploads. It cannot be waived as a generic file.
create function public.recruitment_requested_pack_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.organisation_id='2958d402-368e-43c9-b728-0098e10505f1' and new.status='under_review'
  and old.status in ('application_submitted','documents_uploaded')
  and not public.recruitment_requested_documents_complete(new.organisation_id,new.documents_json,new.document_waivers_json)
 then raise exception 'Complete the required document pack, including proof of address, before starting review'; end if;
 return new;
end; $$;
revoke all on function public.recruitment_requested_pack_guard() from public,anon,authenticated;
grant execute on function public.recruitment_requested_pack_guard() to service_role;
create trigger a0a_recruitment_requested_pack_guard before update on public.recruitment_leads
 for each row execute function public.recruitment_requested_pack_guard();

alter table public.recruitment_submission_email_queue
 add column email_kind text not null default 'documents_reminder'
  check(email_kind in ('application_thanks','documents_reminder','documents_followup')),
 add column first_attempt_at timestamptz,
 add column lease_id uuid,
 add column leased_until timestamptz,
 drop constraint recruitment_submission_email_queue_lead_id_key,
 add unique(lead_id,email_kind),
 drop constraint recruitment_submission_email_queue_status_check,
 add check(status in ('pending','sending','provider_accepted','needs_attention','cancelled','suppressed'));
-- Preserve the retry window of old attempts rather than resetting it on upgrade.
update public.recruitment_submission_email_queue q set first_attempt_at=a.created_at
 from public.recruitment_invitation_deliveries a where a.id=q.id;
alter table public.recruitment_invitation_deliveries drop constraint recruitment_invitation_deliveries_kind_check;
alter table public.recruitment_invitation_deliveries add constraint recruitment_invitation_deliveries_kind_check
 check(kind in ('application','workspace','documents_reminder','approval','application_thanks','documents_followup'));

create or replace function public.recruitment_queue_submission_email() returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;
begin
 if current_user='service_role' and old.application_submitted_at is null and new.application_submitted_at is not null
  and new.organisation_id='2958d402-368e-43c9-b728-0098e10505f1' and new.email_verification_status='verified'
  and new.application_json->>'questionnaireVersion'='recruitment-profile-v1' then
  select b.user_id into owner_id from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
   where b.organisation_id=new.organisation_id and b.lead_id=new.id and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(new.email);
  if owner_id is null then raise exception 'Verified applicant required for submission email'; end if;
  insert into public.recruitment_submission_email_queue(organisation_id,lead_id,actor_id,email_kind,next_attempt_at)
  select new.organisation_id,new.id,owner_id,k,
   case when k='documents_followup' then new.application_submitted_at+interval '24 hours' else now() end
  from unnest(array['application_thanks','documents_reminder','documents_followup']) k
  on conflict(lead_id,email_kind) do nothing;
 end if;
 return new;
end; $$;

create function public.recruitment_queue_application_notifications() returns trigger language plpgsql security invoker set search_path='' as $$
declare event text; receipt uuid; contact jsonb;
begin
 if new.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' or new.application_submitted_at is null
  or new.email_verification_status<>'verified' or new.application_json->>'questionnaireVersion' is distinct from 'recruitment-profile-v1'
  or new.status in ('closed_lost','legacy_joined') then return new; end if;
 if old.application_submitted_at is null then event:='application_received';
 elsif (new.documents_json is distinct from old.documents_json or new.document_waivers_json is distinct from old.document_waivers_json)
  and public.recruitment_requested_documents_complete(new.organisation_id,new.documents_json,new.document_waivers_json)
  and not public.recruitment_requested_documents_complete(old.organisation_id,old.documents_json,old.document_waivers_json)
 then event:='documents_received'; end if;
 if event is null then return new; end if;
 select id into receipt from public.recruitment_contact_receipts where organisation_id=new.organisation_id and lead_id=new.id order by created_at desc limit 1;
 contact:=new.contact_capture_json||jsonb_build_object('email',new.email,'name',new.name);
 insert into public.recruitment_contact_notifications(organisation_id,lead_id,receipt_id,recipient,contact_json,event_kind)
 select new.organisation_id,new.id,receipt,r,contact,event
 from unnest(array['thomas@homeseekers.co.za','admin@homeseekers.co.za','alex@arch9.co.za']) r
 on conflict(lead_id,event_kind,recipient) do nothing;
 if event='documents_received' then
  update public.recruitment_submission_email_queue set status='cancelled',last_error='documents_complete',lease_id=null,leased_until=null
   where lead_id=new.id and email_kind='documents_followup' and status in ('pending','sending');
 end if;
 return new;
end; $$;
revoke all on function public.recruitment_queue_application_notifications() from public,anon,authenticated;
grant execute on function public.recruitment_queue_application_notifications() to service_role;
-- Staff uploads run as authenticated managers: they may queue canonical events,
-- but never read/edit queues or set recipients. Privilege is limited to this trigger.
alter function public.recruitment_queue_application_notifications() security definer;
create trigger zz_recruitment_application_notifications after update on public.recruitment_leads
 for each row execute function public.recruitment_queue_application_notifications();

create or replace function public.recruitment_claim_submission_emails(p_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 update public.recruitment_submission_email_queue q set status='cancelled',last_error='application_unavailable',lease_id=null,leased_until=null
  from public.recruitment_leads l where q.lead_id=l.id and q.status in ('pending','sending')
   and (l.status in ('closed_lost','agent_activated','legacy_joined') or
    (q.email_kind='documents_followup' and (l.approved_at is not null or public.recruitment_requested_documents_complete(l.organisation_id,l.documents_json,l.document_waivers_json))));
 -- The 24h reminder's retry clock begins when sending starts, not on submission.
 update public.recruitment_submission_email_queue set status='needs_attention',last_error='retry_window_ended',lease_id=null,leased_until=null
  where status in ('pending','sending') and first_attempt_at<=now()-interval '23 hours';
 with claimed as (update public.recruitment_submission_email_queue q
  set status='sending',attempts=q.attempts+1,next_attempt_at=now()+interval '2 minutes',lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes'
  where q.id in (select j.id from public.recruitment_submission_email_queue j
   where j.status in ('pending','sending') and j.next_attempt_at<=now() and (j.leased_until is null or j.leased_until<=now())
    and (j.email_kind<>'documents_reminder' or not exists(select 1 from public.recruitment_submission_email_queue t
     where t.lead_id=j.lead_id and t.email_kind='application_thanks' and t.status in ('pending','sending')))
    and (j.email_kind<>'documents_followup' or exists(select 1 from public.recruitment_submission_email_queue d
     where d.lead_id=j.lead_id and d.email_kind='documents_reminder' and d.status='provider_accepted'))
   order by j.next_attempt_at,j.created_at,j.id for update of j skip locked limit greatest(1,least(coalesce(p_limit,3),10))) returning *)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end; $$;

drop function public.recruitment_complete_submission_email(uuid,boolean,text);
create function public.recruitment_complete_submission_email(p_id uuid,p_accepted boolean,p_error text default null,p_lease_id uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 update public.recruitment_submission_email_queue set status=case when p_accepted then 'provider_accepted'
  when p_error='controlled_test_recipient' then 'suppressed' else 'pending' end,
  last_error=left(p_error,80),next_attempt_at=now()+interval '5 minutes',lease_id=null,leased_until=null
 where id=p_id and status='sending' and lease_id=p_lease_id
  and (not p_accepted or exists(select 1 from public.recruitment_invitation_deliveries a where a.id=p_id and a.status='provider_accepted' and nullif(trim(a.provider_id),'') is not null));
 return found;
end; $$;
revoke all on function public.recruitment_complete_submission_email(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.recruitment_complete_submission_email(uuid,boolean,text,uuid) to service_role;

create or replace function public.recruitment_begin_submission_email(p_actor uuid,p_organisation_id uuid,p_lead_id uuid,p_kind text,p_reference_id uuid,p_request_id uuid,p_token_hash text,p_message jsonb,p_allow_duplicate boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.recruitment_leads%rowtype; q public.recruitment_submission_email_queue%rowtype; a public.recruitment_invitation_deliveries%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Server dispatch required' using errcode='42501'; end if;
 select * into q from public.recruitment_submission_email_queue where id=p_request_id and organisation_id=p_organisation_id and lead_id=p_lead_id and actor_id=p_actor for update;
 if q.id is null or q.status<>'sending' or q.leased_until<=now() or q.lease_id is null or q.first_attempt_at<=now()-interval '23 hours'
  or p_kind is distinct from q.email_kind or p_reference_id is distinct from p_lead_id or p_token_hash is not null or p_allow_duplicate then raise exception 'Claim the saved submission email first'; end if;
 select * into l from public.recruitment_leads where id=p_lead_id and organisation_id=p_organisation_id for update;
 if l.id is null or l.organisation_id<>'2958d402-368e-43c9-b728-0098e10505f1' or l.email_verification_status<>'verified' or l.application_submitted_at is null
  or l.status in ('closed_lost','agent_activated','legacy_joined')
  or not exists(select 1 from public.recruitment_applicant_links b join auth.users u on u.id=b.user_id
   where b.organisation_id=l.organisation_id and b.lead_id=l.id and b.user_id=p_actor and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)) then raise exception 'Submitted applicant unavailable'; end if;
 if q.email_kind='documents_followup' and (now()<l.application_submitted_at+interval '24 hours' or l.approved_at is not null
  or public.recruitment_requested_documents_complete(l.organisation_id,l.documents_json,l.document_waivers_json)) then
  return jsonb_build_object('send',false,'cancelled',true); end if;
 select * into a from public.recruitment_invitation_deliveries where id=q.id for update;
 if a.id is not null and (a.organisation_id<>l.organisation_id or a.lead_id<>l.id or a.kind<>q.email_kind or a.recipient<>lower(trim(l.email))) then raise exception 'Email belongs to another submission'; end if;
 if a.status='provider_accepted' then return jsonb_build_object('send',false,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
 if a.id is not null then
  if a.status='sending' and a.leased_at>now()-interval '60 seconds' then return jsonb_build_object('send',false,'busy',true,'attempt',to_jsonb(a)-'message_json'-'lease_id'-'leased_at'); end if;
  update public.recruitment_invitation_deliveries set status='sending',lease_id=gen_random_uuid(),leased_at=now(),updated_at=now() where id=a.id returning * into a;
 else
  if jsonb_typeof(p_message) is distinct from 'object' or p_message->>'to' is distinct from lower(trim(l.email)) then raise exception 'Email recipient must be the saved applicant'; end if;
  insert into public.recruitment_invitation_deliveries(id,organisation_id,lead_id,kind,reference_id,recipient,requested_by,message_json)
   values(q.id,l.organisation_id,l.id,q.email_kind,l.id,lower(trim(l.email)),p_actor,p_message) returning * into a;
  update public.recruitment_submission_email_queue set first_attempt_at=now() where id=q.id;
 end if;
 return jsonb_build_object('send',true,'attempt',to_jsonb(a));
end; $$;
create or replace function public.recruitment_resume_applicant(p_organisation_id uuid,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate public.recruitment_leads%rowtype;
begin
  if current_user<>'service_role' then raise exception 'Server authentication required' using errcode='42501'; end if;
  select l.* into candidate from public.recruitment_applicant_sessions s
    join public.recruitment_leads l on l.organisation_id=s.organisation_id and l.id=s.lead_id
    join auth.users u on u.id=s.user_id
    where s.token_hash=p_token_hash and s.organisation_id=p_organisation_id and s.expires_at>now()
      and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and lower(u.email)=lower(l.contact_capture_json->>'email') and l.email_verification_status='verified'
      and l.status not in ('closed_lost','agent_activated','legacy_joined');
  if not found then return null; end if;
  return jsonb_build_object('emailVerification','verified','stage',candidate.status,'applicationSubmitted',candidate.application_submitted_at is not null,'profile',case when candidate.applicant_draft_json='{}'::jsonb then null else candidate.applicant_draft_json end,'profileRevision',candidate.applicant_draft_revision,'profileSavedAt',candidate.applicant_draft_saved_at,
    'applicationSubmittedAt',candidate.application_submitted_at,'documents',candidate.documents_json,'documentWaivers',candidate.document_waivers_json,'documentsEditable',candidate.application_submitted_at is not null and candidate.approved_at is null,'documentsComplete',public.recruitment_requested_documents_complete(candidate.organisation_id,candidate.documents_json,candidate.document_waivers_json),'submittedApplication',case when candidate.application_json->>'questionnaireVersion'='recruitment-profile-v1' then jsonb_build_object('answers',candidate.application_json->'answers','submittedAt',candidate.application_submitted_at,'consentVersion',candidate.application_json->>'consentVersion') else null end,
    'contact',jsonb_build_object('firstName',candidate.contact_capture_json->>'firstName','lastName',candidate.contact_capture_json->>'lastName',
      'email',candidate.contact_capture_json->>'email','phone',candidate.contact_capture_json->>'phone'));
end; $$;
commit;
