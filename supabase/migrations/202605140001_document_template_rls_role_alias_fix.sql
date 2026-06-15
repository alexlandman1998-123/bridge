begin;
create or replace function public.bridge_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case lower(trim(coalesce(ou.role, '')))
      when 'administrator' then 'admin'
      when 'owner' then 'principal'
      when 'superadmin' then 'super_admin'
      when 'branch_admin' then 'branch_manager'
      when 'branch manager' then 'branch_manager'
      when 'principal / owner' then 'principal'
      else lower(trim(coalesce(ou.role, '')))
    end
  from public.organisation_users ou
  where ou.organisation_id = target_org
    and ou.user_id = auth.uid()
    and ou.status = 'active'
  order by ou.created_at asc
  limit 1;
$$;
grant execute on function public.bridge_membership_role(uuid) to authenticated;
grant execute on function public.bridge_is_org_admin(uuid) to authenticated;
grant select, insert, update, delete on table public.document_packet_templates to authenticated;
grant select, insert, update, delete on table public.document_template_sections to authenticated;
grant select, insert, update, delete on table public.document_placeholder_registry to authenticated;
commit;
