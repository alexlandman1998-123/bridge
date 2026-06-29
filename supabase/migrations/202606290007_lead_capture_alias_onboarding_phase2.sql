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
  v_source text;
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
    jsonb_build_object('created_by', 'membership_onboarding')
  );

  foreach v_source in array array['Property24', 'Private Property', 'Website', 'Facebook']
  loop
    perform public.bridge_create_lead_capture_alias(
      new.organisation_id,
      new.user_id,
      new.branch_id,
      null,
      v_source,
      'agent_source',
      'leads.arch9.co.za',
      jsonb_build_object('created_by', 'membership_onboarding')
    );
  end loop;

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists trg_bridge_auto_create_agent_lead_capture_aliases on public.organisation_users;
create trigger trg_bridge_auto_create_agent_lead_capture_aliases
after insert or update of user_id, branch_id, role, workspace_role, organisation_role, organization_role, status, membership_status
on public.organisation_users
for each row
execute function public.bridge_auto_create_agent_lead_capture_aliases();

do $$
declare
  v_member record;
begin
  if to_regclass('public.organisation_users') is null then
    return;
  end if;

  for v_member in
    select
      organisation_id,
      user_id,
      branch_id,
      coalesce(workspace_role, organization_role, organisation_role, role, '') as role,
      coalesce(membership_status, status, '') as status
    from public.organisation_users
    where organisation_id is not null
      and user_id is not null
      and lower(trim(coalesce(membership_status, status, ''))) in ('active', 'accepted')
      and lower(trim(coalesce(workspace_role, organization_role, organisation_role, role, ''))) in ('agent', 'principal', 'admin', 'branch_manager', 'owner', 'super_admin')
  loop
    begin
      perform public.bridge_create_lead_capture_alias(
        v_member.organisation_id,
        v_member.user_id,
        v_member.branch_id,
        null,
        'General',
        'agent',
        'leads.arch9.co.za',
        jsonb_build_object('created_by', 'phase2_backfill')
      );
      perform public.bridge_create_lead_capture_alias(
        v_member.organisation_id,
        v_member.user_id,
        v_member.branch_id,
        null,
        'Property24',
        'agent_source',
        'leads.arch9.co.za',
        jsonb_build_object('created_by', 'phase2_backfill')
      );
      perform public.bridge_create_lead_capture_alias(
        v_member.organisation_id,
        v_member.user_id,
        v_member.branch_id,
        null,
        'Private Property',
        'agent_source',
        'leads.arch9.co.za',
        jsonb_build_object('created_by', 'phase2_backfill')
      );
      perform public.bridge_create_lead_capture_alias(
        v_member.organisation_id,
        v_member.user_id,
        v_member.branch_id,
        null,
        'Website',
        'agent_source',
        'leads.arch9.co.za',
        jsonb_build_object('created_by', 'phase2_backfill')
      );
      perform public.bridge_create_lead_capture_alias(
        v_member.organisation_id,
        v_member.user_id,
        v_member.branch_id,
        null,
        'Facebook',
        'agent_source',
        'leads.arch9.co.za',
        jsonb_build_object('created_by', 'phase2_backfill')
      );
    exception
      when others then
        null;
    end;
  end loop;
end $$;

commit;
