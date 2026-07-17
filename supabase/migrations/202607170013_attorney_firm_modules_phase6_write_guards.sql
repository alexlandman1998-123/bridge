begin;

create or replace function public.attorney_assignment_module_keys(
  p_assignment_type text,
  p_matter_type text,
  p_attorney_role text
)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case lower(btrim(coalesce(nullif(p_matter_type, ''), nullif(p_assignment_type, ''), '')))
    when 'transfer' then array['transfer']::text[]
    when 'bond' then array['bond']::text[]
    when 'cancellation' then array['cancellation']::text[]
    when 'transfer_and_bond' then array['transfer', 'bond']::text[]
    else case lower(btrim(coalesce(p_attorney_role, '')))
      when 'transfer_attorney' then array['transfer']::text[]
      when 'bond_attorney' then array['bond']::text[]
      when 'cancellation_attorney' then array['cancellation']::text[]
      else array[]::text[]
    end
  end;
$$;

create or replace function public.enforce_attorney_assignment_module_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm_id uuid := coalesce(new.attorney_firm_id, new.firm_id);
  v_module_key text;
  v_module_keys text[] := public.attorney_assignment_module_keys(
    new.assignment_type,
    new.matter_type,
    new.attorney_role
  );
  v_old_module_keys text[] := case when tg_op = 'UPDATE' then public.attorney_assignment_module_keys(
    old.assignment_type,
    old.matter_type,
    old.attorney_role
  ) else array[]::text[] end;
  v_accepting_instruction boolean := tg_op = 'UPDATE'
    and lower(btrim(coalesce(new.instruction_status, ''))) = 'accepted'
    and lower(btrim(coalesce(old.instruction_status, ''))) <> 'accepted';
  v_existing_matter boolean;
  v_status text;
begin
  if v_firm_id is null or coalesce(array_length(v_module_keys, 1), 0) = 0 then
    return new;
  end if;

  foreach v_module_key in array v_module_keys loop
    -- Reassignment and workflow maintenance on an existing firm matter remain
    -- available while winding down. Only a newly introduced service lane or
    -- acceptance of a pending instruction requires an active module.
    select exists (
      select 1
      from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = new.transaction_id
        and coalesce(assignment.attorney_firm_id, assignment.firm_id) = v_firm_id
        and (tg_op <> 'UPDATE' or assignment.id <> old.id)
        and coalesce(assignment.assignment_status, assignment.status, 'active') <> 'removed'
        and v_module_key = any(public.attorney_assignment_module_keys(
          assignment.assignment_type,
          assignment.matter_type,
          assignment.attorney_role
        ))
    ) into v_existing_matter;

    if not v_accepting_instruction
      and (v_existing_matter or (tg_op = 'UPDATE' and v_module_key = any(v_old_module_keys))) then
      continue;
    end if;

    select module.status
    into v_status
    from public.attorney_firm_modules module
    where module.firm_id = v_firm_id
      and module.module_key = v_module_key;

    -- Preserve rolling-deployment compatibility until the Phase 1 backfill is
    -- visible. Once present, only active modules may take new work.
    if v_status is not null and v_status <> 'active' then
      raise exception '% service is not accepting new matters or instructions.', initcap(v_module_key)
        using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_enforce_attorney_assignment_module_write_guard
  on public.transaction_attorney_assignments;
create trigger trg_enforce_attorney_assignment_module_write_guard
before insert or update on public.transaction_attorney_assignments
for each row execute function public.enforce_attorney_assignment_module_write_guard();

create or replace function public.resolve_attorney_public_intake(p_slug text)
returns table (
  slug text,
  status text,
  heading text,
  introduction text,
  service_types jsonb,
  firm_name text,
  logo_url text,
  primary_colour text,
  secondary_colour text,
  website text,
  contact_email text,
  contact_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    link.slug,
    'active'::text,
    link.heading,
    link.introduction,
    coalesce((
      select jsonb_agg(service.value order by service.ordinality)
      from jsonb_array_elements_text(coalesce(link.service_config_json, '[]'::jsonb))
        with ordinality as service(value, ordinality)
      where case service.value
        when 'transfer_quote' then not exists (
          select 1 from public.attorney_firm_modules module
          where module.firm_id = firm.id and module.module_key = 'transfer' and module.status <> 'active'
        )
        when 'property_transfer' then not exists (
          select 1 from public.attorney_firm_modules module
          where module.firm_id = firm.id and module.module_key = 'transfer' and module.status <> 'active'
        )
        when 'bond_registration' then not exists (
          select 1 from public.attorney_firm_modules module
          where module.firm_id = firm.id and module.module_key = 'bond' and module.status <> 'active'
        )
        when 'bond_cancellation' then not exists (
          select 1 from public.attorney_firm_modules module
          where module.firm_id = firm.id and module.module_key = 'cancellation' and module.status <> 'active'
        )
        else true
      end
    ), '[]'::jsonb),
    firm.name,
    coalesce(branding.logo_url, firm.logo_url),
    coalesce(branding.primary_colour, firm.primary_colour),
    coalesce(branding.secondary_colour, firm.secondary_colour),
    firm.website,
    firm.email,
    firm.phone
  from public.public_intake_links link
  join public.attorney_firms firm
    on firm.id = link.attorney_firm_id
   and firm.organisation_id = link.organisation_id
  left join public.attorney_firm_branding branding on branding.firm_id = firm.id
  join public.organisations organisation on organisation.id = link.organisation_id
  where lower(link.slug) = lower(trim(p_slug))
    and link.status = 'active'
    and link.disabled_at is null
    and firm.is_active = true
    and organisation.status = 'active'
  limit 1
$$;

revoke all on function public.resolve_attorney_public_intake(text) from public;
grant execute on function public.resolve_attorney_public_intake(text) to anon, authenticated;

revoke all on function public.attorney_assignment_module_keys(text, text, text) from public;
grant execute on function public.attorney_assignment_module_keys(text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
