begin;

-- Party users keep their explicit sharing access. Staff access must end when
-- their organisation membership ends, even if a case still lists them.
drop policy if exists knowledge_factory_fica_cases_read on public.knowledge_factory_fica_cases;
create policy knowledge_factory_fica_cases_read
on public.knowledge_factory_fica_cases for select to authenticated
using (
  subject_user_id = (select auth.uid())
  or (select auth.uid()) = any(shared_party_user_ids)
  or (
    (select auth.uid()) = any(assigned_staff_user_ids)
    and public.knowledge_factory_is_active_member(organisation_id)
  )
  or public.knowledge_factory_fica_is_privileged(organisation_id)
);

drop policy if exists knowledge_factory_fica_cases_update on public.knowledge_factory_fica_cases;
create policy knowledge_factory_fica_cases_update
on public.knowledge_factory_fica_cases for update to authenticated
using (
  (
    (created_by = (select auth.uid()) or (select auth.uid()) = any(assigned_staff_user_ids))
    and public.knowledge_factory_is_active_member(organisation_id)
  )
  or public.knowledge_factory_fica_is_privileged(organisation_id)
)
with check (
  (
    (created_by = (select auth.uid()) or (select auth.uid()) = any(assigned_staff_user_ids))
    and public.knowledge_factory_is_active_member(organisation_id)
  )
  or public.knowledge_factory_fica_is_privileged(organisation_id)
);

drop policy if exists knowledge_factory_fica_audit_events_read on public.knowledge_factory_fica_audit_events;
create policy knowledge_factory_fica_audit_events_read
on public.knowledge_factory_fica_audit_events for select to authenticated
using (exists (
  select 1 from public.knowledge_factory_fica_cases case_row
  where case_row.id = fica_case_id
    and (
      case_row.subject_user_id = (select auth.uid())
      or (select auth.uid()) = any(case_row.shared_party_user_ids)
      or (
        (select auth.uid()) = any(case_row.assigned_staff_user_ids)
        and public.knowledge_factory_is_active_member(case_row.organisation_id)
      )
      or public.knowledge_factory_fica_is_privileged(case_row.organisation_id)
    )
));

commit;
