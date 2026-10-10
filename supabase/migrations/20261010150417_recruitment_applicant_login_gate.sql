begin;
create or replace function public.recruitment_applicant_photo_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.applicant_photo_json<>'{}'::jsonb then raise exception 'Use the verified applicant photo upload'; end if;
 elsif new.applicant_photo_json is distinct from old.applicant_photo_json then
  if current_user<>'service_role' then raise exception 'Use the verified applicant photo upload'; end if;
  if not exists(select 1 from public.recruitment_applicant_photo_uploads a join storage.objects s on s.bucket_id='recruitment-profile-photos' and s.name=a.path
   where a.lead_id=new.id and a.organisation_id=new.organisation_id and a.path=new.applicant_photo_json->>'path'
    and a.name=new.applicant_photo_json->>'name' and (s.metadata->>'size')::bigint=a.size and s.metadata->>'mimetype'=a.mime_type) then
   raise exception 'Use the verified applicant photo upload'; end if;
 end if;
 return new;
end; $$;
-- Return a boolean about the signed-in user only; applicants cannot enumerate
-- recruitment records or claim a role through Auth metadata.
create function public.recruitment_applicant_portal_required() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recruitment_applicant_links b join public.recruitment_leads l on l.organisation_id=b.organisation_id and l.id=b.lead_id
  join auth.users u on u.id=b.user_id where b.user_id=(select auth.uid()) and b.organisation_id='2958d402-368e-43c9-b728-0098e10505f1'
   and l.application_submitted_at is not null and l.email_verification_status='verified' and l.status not in ('closed_lost','agent_activated','legacy_joined')
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)
   and not exists(select 1 from public.organisation_users m where m.organisation_id=l.organisation_id and m.user_id=b.user_id and m.status='active'));
$$;
revoke all on function public.recruitment_applicant_portal_required() from public,anon;
grant execute on function public.recruitment_applicant_portal_required() to authenticated;
create function public.recruitment_applicant_account_receipt(p_user_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare receipt uuid;
begin
 if current_user<>'service_role' then raise exception 'Server applicant access required' using errcode='42501'; end if;
 select r.submission_key into receipt from public.recruitment_applicant_links b
  join public.recruitment_leads l on l.organisation_id=b.organisation_id and l.id=b.lead_id join auth.users u on u.id=b.user_id
  join public.recruitment_contact_receipts r on r.organisation_id=l.organisation_id and r.lead_id=l.id
  where b.user_id=p_user_id and b.organisation_id='2958d402-368e-43c9-b728-0098e10505f1' and l.application_submitted_at is not null
   and l.email_verification_status='verified' and l.status not in ('closed_lost','agent_activated','legacy_joined') and u.email_confirmed_at is not null
   and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)
  order by l.application_submitted_at desc,r.created_at desc limit 1;
 return receipt;
end; $$;
revoke all on function public.recruitment_applicant_account_receipt(uuid) from public,anon,authenticated;
grant execute on function public.recruitment_applicant_account_receipt(uuid) to service_role;
commit;
