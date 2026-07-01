begin;

create or replace function public.bridge_auto_create_agent_lead_capture_aliases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(trim(coalesce(new.workspace_role, new.organization_role, new.organisation_role, new.role, '')));
  v_status text := lower(trim(coalesce(new.membership_status, new.status, '')));
begin
  if new.organisation_id is null or new.user_id is null then
    return new;
  end if;

  if v_status not in ('active', 'accepted') then
    return new;
  end if;

  if v_role not in ('agent', 'principal', 'admin', 'branch_manager', 'owner', 'super_admin') then
    return new;
  end if;

  perform public.bridge_create_lead_capture_alias(
    new.organisation_id,
    new.user_id,
    new.branch_id,
    null,
    'General',
    'agent',
    'leads.arch9.co.za',
    jsonb_build_object('created_by', 'membership_onboarding', 'alias_strategy', 'single_agent_inbox')
  );

  return new;
exception
  when others then
    return new;
end;
$$;

commit;
