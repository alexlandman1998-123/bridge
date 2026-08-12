-- Add VAT basis to organisation commission structures.
--
-- Commission templates can now state whether the configured commission value is
-- inclusive or exclusive of VAT. Existing templates default to inclusive.

begin;

alter table if exists public.organisation_commission_structures
  add column if not exists commission_vat_basis text not null default 'inclusive';

alter table if exists public.organisation_commission_structures
  drop constraint if exists organisation_commission_structures_vat_basis_check;

alter table if exists public.organisation_commission_structures
  add constraint organisation_commission_structures_vat_basis_check
    check (commission_vat_basis in ('inclusive', 'exclusive'));

create or replace function public.bridge_sync_legacy_commission_structure(p_legacy_structure_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy_row public.organisation_commission_structures%rowtype;
  v_structure_id uuid;
  v_status text;
  v_listing_type text;
  v_listing_percentage numeric(7,4);
  v_listing_amount numeric(14,2);
  v_vat_basis text;
begin
  select *
    into legacy_row
  from public.organisation_commission_structures
  where id = p_legacy_structure_id
  limit 1;

  if legacy_row.id is null then
    return null;
  end if;

  if pg_trigger_depth() = 0
     and coalesce(auth.role(), '') <> 'service_role'
     and not (
       public.bridge_is_org_admin(legacy_row.organisation_id)
       or public.bridge_is_active_member(legacy_row.organisation_id)
     ) then
    raise exception 'Organisation membership is required to sync commission structures.'
      using errcode = '42501';
  end if;

  v_status := case when legacy_row.is_active then 'active' else 'archived' end;
  v_listing_type := coalesce(nullif(legacy_row.listing_commission_type, ''), 'percentage');
  v_listing_percentage := case when v_listing_type = 'percentage' then legacy_row.listing_commission_percentage else null end;
  v_listing_amount := case when v_listing_type = 'fixed' then legacy_row.listing_commission_amount else null end;
  v_vat_basis := case when legacy_row.commission_vat_basis = 'exclusive' then 'exclusive' else 'inclusive' end;

  if legacy_row.is_default and legacy_row.is_active then
    update public.commission_structures
      set is_default = false,
          updated_at = now()
    where organisation_id = legacy_row.organisation_id
      and id <> legacy_row.id
      and transaction_type = 'default'
      and coalesce(property_type, '') = ''
      and coalesce(mandate_type, '') = ''
      and is_default = true
      and status = 'active';
  end if;

  insert into public.commission_structures (
    id,
    organisation_id,
    name,
    transaction_type,
    version,
    status,
    is_default,
    effective_from,
    created_by,
    activated_by,
    activated_at,
    archived_at,
    metadata
  )
  values (
    legacy_row.id,
    legacy_row.organisation_id,
    legacy_row.name,
    'default',
    1,
    case when v_status = 'active' then 'draft' else v_status end,
    legacy_row.is_default,
    current_date,
    legacy_row.created_by,
    null,
    null,
    case when v_status = 'archived' then now() else null end,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'phase_3_legacy_structure_sync',
      'legacy_structure_id', legacy_row.id,
      'listing_commission_type', v_listing_type,
      'listing_commission_percentage', v_listing_percentage,
      'listing_commission_amount', v_listing_amount,
      'commission_vat_basis', v_vat_basis,
      'allow_sales_commission_override', legacy_row.allow_sales_commission_override,
      'notes', legacy_row.notes
    ))
  )
  on conflict (id) do update
    set organisation_id = excluded.organisation_id,
        name = excluded.name,
        status = excluded.status,
        is_default = excluded.is_default,
        archived_at = excluded.archived_at,
        metadata = coalesce(public.commission_structures.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
  returning id into v_structure_id;

  insert into public.commission_structure_rules (
    commission_structure_id,
    allocation_type,
    participant_role,
    scope,
    calculation_basis,
    allocation_pool,
    percentage,
    priority,
    requires_approval,
    metadata
  )
  values
    (
      v_structure_id,
      'selling_commission',
      'selling_agent',
      'internal',
      'gross_commission',
      'gross_commission_pool',
      coalesce(legacy_row.agent_split_percentage, 60),
      20,
      false,
      jsonb_build_object('source', 'phase_3_legacy_structure_sync')
    ),
    (
      v_structure_id,
      'agency_share',
      'agency',
      'agency',
      'gross_commission',
      'gross_commission_pool',
      coalesce(legacy_row.agency_split_percentage, 40),
      30,
      false,
      jsonb_build_object('source', 'phase_3_legacy_structure_sync')
    )
  on conflict (
    commission_structure_id,
    allocation_type,
    participant_role,
    scope,
    calculation_basis,
    allocation_pool,
    priority
  ) do update
    set percentage = excluded.percentage,
        fixed_amount = null,
        metadata = coalesce(public.commission_structure_rules.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now();

  if v_status = 'active' then
    update public.commission_structures
      set status = 'active',
          is_default = legacy_row.is_default,
          activated_by = coalesce(activated_by, legacy_row.created_by, auth.uid()),
          activated_at = coalesce(activated_at, now()),
          archived_at = null,
          updated_at = now()
    where id = v_structure_id;
  end if;

  return v_structure_id;
end;
$$;

drop trigger if exists trg_legacy_commission_structure_canonical_sync on public.organisation_commission_structures;
create trigger trg_legacy_commission_structure_canonical_sync
after insert or update of
  name,
  listing_commission_type,
  listing_commission_percentage,
  listing_commission_amount,
  commission_vat_basis,
  agent_split_percentage,
  agency_split_percentage,
  allow_sales_commission_override,
  is_default,
  is_active,
  notes
on public.organisation_commission_structures
for each row
execute function public.bridge_sync_legacy_commission_structure_after_write();

update public.commission_structures canonical
set metadata = coalesce(canonical.metadata, '{}'::jsonb) || jsonb_build_object(
    'commission_vat_basis',
    case when legacy.commission_vat_basis = 'exclusive' then 'exclusive' else 'inclusive' end
  ),
  updated_at = now()
from public.organisation_commission_structures legacy
where canonical.id = legacy.id;

commit;
