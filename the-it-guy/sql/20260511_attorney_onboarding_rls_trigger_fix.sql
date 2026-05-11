begin;

create or replace function public.seed_default_attorney_departments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values
    (new.id, 'Transfer Department', 'transfer', true),
    (new.id, 'Bond Department', 'bond', true),
    (new.id, 'Admin Department', 'admin', true),
    (new.id, 'Management', 'management', true)
  on conflict (firm_id, department_type) do nothing;

  return new;
end;
$$;

create or replace function public.seed_attorney_firm_branding_from_firm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_firm_branding (
    firm_id,
    logo_url,
    primary_colour,
    secondary_colour,
    created_by
  )
  values (
    new.id,
    new.logo_url,
    new.primary_colour,
    new.secondary_colour,
    new.created_by
  )
  on conflict (firm_id) do nothing;

  return new;
end;
$$;

commit;
