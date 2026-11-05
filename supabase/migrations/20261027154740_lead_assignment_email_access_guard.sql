begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Preserve the existing assignment/admin/support paths. An absent JWT email
-- must never equal a blank legacy assignment email and grant access to a lead.
do $guard$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.leads'::regclass
      and polname = 'leads_support_role_select'
      and polcmd = 'r' and polpermissive
      and polroles = array['authenticated'::regrole::oid]
  ) then
    raise exception 'Expected authenticated lead SELECT policy is missing or changed';
  end if;
end;
$guard$;

alter policy leads_support_role_select on public.leads
using (
  auth.uid() is not null
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_user_id = auth.uid()
    or assigned_agent_id = auth.uid()
    or (
      nullif(btrim(assigned_agent_email), '') is not null
      and nullif(btrim(auth.jwt() ->> 'email'), '') is not null
      and lower(assigned_agent_email) = lower(auth.jwt() ->> 'email')
    )
    or public.bridge_support_can_access_record(
      organisation_id, branch_id, 'lead', assigned_user_id, assigned_agent_id, null
    )
  )
);

commit;
