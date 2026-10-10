begin;
-- Invitation acceptance can create membership before the staff activation step.
-- The latest submitted application still controls the applicant shell then.
create or replace function public.recruitment_applicant_portal_required() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select l.status not in ('closed_lost','agent_activated','legacy_joined')
  from public.recruitment_applicant_links b join public.recruitment_leads l on l.organisation_id=b.organisation_id and l.id=b.lead_id
  join auth.users u on u.id=b.user_id where b.user_id=(select auth.uid()) and b.organisation_id='2958d402-368e-43c9-b728-0098e10505f1'
   and l.application_submitted_at is not null and l.email_verification_status='verified'
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and lower(u.email)=lower(l.email)
  order by l.application_submitted_at desc,l.created_at desc,l.id limit 1),false);
$$;
commit;
