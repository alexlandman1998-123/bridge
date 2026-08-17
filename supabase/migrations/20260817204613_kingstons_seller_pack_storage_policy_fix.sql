begin;

create or replace function public.bridge_storage_authenticated_can_write(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_root text := coalesce((storage.foldername(p_name))[1], '');
  v_second text := coalesce((storage.foldername(p_name))[2], '');
  v_third text := coalesce((storage.foldername(p_name))[3], '');
  v_transaction_id uuid;
  v_listing_id uuid;
  v_development_id uuid;
  v_organisation_id uuid;
  v_lead_id uuid;
  v_assigned_agent_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if v_root ~ '^transaction-[0-9a-fA-F-]{36}$' then
    return public.bridge_can_access_transaction_spine(substring(v_root from 13)::uuid);
  end if;

  if v_root in ('transaction-financial-invoices', 'matter-financial-documents')
     and v_second ~ '^[0-9a-fA-F-]{36}$' then
    v_transaction_id := v_second::uuid;
    return public.bridge_can_access_transaction_spine(v_transaction_id);
  end if;

  if v_root = 'private-listings'
     and v_second ~ '^[0-9a-fA-F-]{36}$' then
    v_listing_id := v_second::uuid;
    return public.bridge_can_access_private_listing(v_listing_id);
  end if;

  if v_root in ('kingstons-formal-valuations', 'kingstons-seller-pack')
     and v_second ~ '^[0-9a-fA-F-]{36}$'
     and v_third ~ '^[0-9a-fA-F-]{36}$'
     and coalesce(storage.filename(p_name), '') <> '' then
    v_organisation_id := v_second::uuid;
    v_lead_id := v_third::uuid;
    select lead.assigned_agent_id
      into v_assigned_agent_id
      from public.leads lead
     where lead.organisation_id = v_organisation_id
       and lead.lead_id = v_lead_id
     limit 1;
    return v_assigned_agent_id is not null
      and public.bridge_can_access_assignment(v_organisation_id, v_assigned_agent_id, null);
  end if;

  if v_root = 'developments'
     and v_second ~ '^[0-9a-fA-F-]{36}$'
     and coalesce(storage.filename(p_name), '') <> '' then
    v_development_id := v_second::uuid;
    return public.bridge_is_admin()
      or public.bridge_has_development_org_access(v_development_id)
      or public.bridge_has_development_access(v_development_id);
  end if;

  if v_root = 'alteration-requests'
     and v_second ~ '^[0-9a-fA-F-]{36}$'
     and coalesce(storage.filename(p_name), '') <> '' then
    select alteration.transaction_id
      into v_transaction_id
      from public.alteration_requests alteration
     where alteration.id = v_second::uuid;
    return v_transaction_id is not null
      and public.bridge_can_access_transaction_spine(v_transaction_id);
  end if;

  if v_root = 'commercial' then
    return public.bridge_storage_authenticated_commercial_can_write(p_name);
  end if;

  if v_root = 'mandates' then
    return public.bridge_storage_authenticated_mandate_can_write(p_name);
  end if;

  if v_root = 'organisations'
     and v_second ~ '^[0-9a-fA-F-]{36}$' then
    v_organisation_id := v_second::uuid;
    return public.bridge_is_active_member(v_organisation_id);
  end if;

  if v_root = 'attorney-firms'
     and v_second = auth.uid()::text
     and coalesce((storage.foldername(p_name))[3], '') = 'branding'
     and coalesce(storage.filename(p_name), '') <> '' then
    return true;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.bridge_storage_authenticated_can_write(text) from public;
grant execute on function public.bridge_storage_authenticated_can_write(text) to authenticated;

commit;
