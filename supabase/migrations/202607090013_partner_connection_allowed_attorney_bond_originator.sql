begin;

create or replace function public.bridge_partner_connection_allowed(source_type text, target_type text)
returns boolean
language sql
immutable
as $$
  select case public.bridge_normalize_workspace_type(source_type)
    when 'agency' then public.bridge_normalize_workspace_type(target_type) in ('attorney_firm', 'bond_originator', 'developer_company')
    when 'attorney_firm' then public.bridge_normalize_workspace_type(target_type) in ('agency', 'developer_company', 'bond_originator')
    when 'developer_company' then public.bridge_normalize_workspace_type(target_type) in ('agency', 'attorney_firm', 'bond_originator')
    when 'bond_originator' then public.bridge_normalize_workspace_type(target_type) in ('agency', 'developer_company', 'attorney_firm')
    else false
  end;
$$;

comment on function public.bridge_partner_connection_allowed(text, text) is
  'Workspace relationship allow-list. Attorney firms and bond originators may connect for transaction finance handoffs.';

commit;
