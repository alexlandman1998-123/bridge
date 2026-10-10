begin;
-- Route verified Home Seekers drafts and submitted applications through My Profile.
-- Approval or an accepted invitation does not grant the agent workspace before
-- activation. Decisions use the linked Auth identity, never editable metadata.
create or replace function public.recruitment_applicant_portal_required() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select l.status not in ('closed_lost','agent_activated','legacy_joined')
  from public.recruitment_applicant_links b join public.recruitment_leads l on l.organisation_id=b.organisation_id and l.id=b.lead_id
  join auth.users u on u.id=b.user_id where b.user_id=(select auth.uid()) and b.organisation_id='2958d402-368e-43c9-b728-0098e10505f1'
   and l.email_verification_status='verified'
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)
  order by coalesce(l.application_submitted_at,l.created_at) desc,l.id limit 1),false);
$$;

create or replace function public.recruitment_applicant_account_receipt(p_user_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare receipt uuid;
begin
 if current_user<>'service_role' then raise exception 'Server applicant access required' using errcode='42501'; end if;
 select r.submission_key into receipt from public.recruitment_applicant_links b
  join public.recruitment_leads l on l.organisation_id=b.organisation_id and l.id=b.lead_id join auth.users u on u.id=b.user_id
  join public.recruitment_contact_receipts r on r.organisation_id=l.organisation_id and r.lead_id=l.id
  where b.user_id=p_user_id and b.organisation_id='2958d402-368e-43c9-b728-0098e10505f1'
   and l.email_verification_status='verified' and l.status not in ('closed_lost','agent_activated','legacy_joined') and u.email_confirmed_at is not null
   and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)
  order by coalesce(l.application_submitted_at,l.created_at) desc,r.created_at desc,r.id limit 1;
 return receipt;
end; $$;
revoke all on function public.recruitment_applicant_portal_required() from public,anon;
grant execute on function public.recruitment_applicant_portal_required() to authenticated;
revoke all on function public.recruitment_applicant_account_receipt(uuid) from public,anon,authenticated;
grant execute on function public.recruitment_applicant_account_receipt(uuid) to service_role;
commit;
