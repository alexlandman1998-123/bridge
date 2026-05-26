create or replace function public.bridge_sync_organisation_workspace_kind()
returns trigger
language plpgsql
as $$
declare
  v_settings_kind text := nullif(trim(coalesce(new.settings_json->>'workspaceKind', new.settings_json->>'workspace_kind', '')), '');
begin
  if v_settings_kind = 'bond_originator' or v_settings_kind = 'bond' then
    v_settings_kind := 'bond_company';
  elsif v_settings_kind = 'developer' then
    v_settings_kind := 'developer_company';
  elsif v_settings_kind = 'personal' and coalesce(new.type, '') = 'bond_originator' then
    v_settings_kind := 'personal_originator';
  end if;

  if v_settings_kind is not null then
    new.workspace_kind := v_settings_kind;
    return new;
  end if;

  if coalesce(nullif(trim(coalesce(new.workspace_kind, '')), ''), '') = '' then
    new.workspace_kind := case
      when new.type = 'bond_originator' then 'bond_company'
      when new.type = 'developer_company' then 'developer_company'
      when new.type = 'attorney_firm' then 'attorney_firm'
      when new.type = 'agency' then 'agency'
      else new.workspace_kind
    end;
  elsif new.workspace_kind = 'bond_originator' then
    new.workspace_kind := 'bond_company';
  elsif new.workspace_kind = 'developer' then
    new.workspace_kind := 'developer_company';
  end if;

  return new;
end;
$$;

drop trigger if exists organisations_sync_workspace_kind on public.organisations;
create trigger organisations_sync_workspace_kind
before insert or update of type, settings_json, workspace_kind on public.organisations
for each row
execute function public.bridge_sync_organisation_workspace_kind();

update public.organisations
set workspace_kind = case
  when nullif(trim(coalesce(settings_json->>'workspaceKind', settings_json->>'workspace_kind', '')), '') in ('bond_originator', 'bond') then 'bond_company'
  when nullif(trim(coalesce(settings_json->>'workspaceKind', settings_json->>'workspace_kind', '')), '') = 'developer' then 'developer_company'
  when nullif(trim(coalesce(settings_json->>'workspaceKind', settings_json->>'workspace_kind', '')), '') = 'personal'
    and type = 'bond_originator' then 'personal_originator'
  when nullif(trim(coalesce(settings_json->>'workspaceKind', settings_json->>'workspace_kind', '')), '') is not null
    then nullif(trim(coalesce(settings_json->>'workspaceKind', settings_json->>'workspace_kind', '')), '')
  when coalesce(nullif(trim(coalesce(workspace_kind, '')), ''), '') = '' and type = 'bond_originator' then 'bond_company'
  when workspace_kind = 'bond_originator' then 'bond_company'
  when workspace_kind = 'developer' then 'developer_company'
  else workspace_kind
end
where
  workspace_kind is null
  or trim(workspace_kind) = ''
  or workspace_kind in ('bond_originator', 'developer');
