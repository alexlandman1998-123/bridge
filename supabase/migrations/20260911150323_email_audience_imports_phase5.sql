begin;

-- The original file is never stored in the browser-accessible database. We
-- retain an auditable import summary and mapping, while the validated rows are
-- merged into the existing, deduplicated marketing-contact projection.
create table if not exists public.email_audience_imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  status text not null default 'completed' check (status in ('draft', 'processing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  mapping_json jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (accepted_rows + rejected_rows <= total_rows)
);

create index if not exists email_audience_imports_org_created_idx
  on public.email_audience_imports (organisation_id, created_at desc);

alter table public.email_audience_imports enable row level security;
grant select, insert, update on public.email_audience_imports to authenticated;
create policy email_audience_imports_member on public.email_audience_imports for all to authenticated
  using (public.bridge_has_organisation_membership(organisation_id))
  with check (public.bridge_has_organisation_membership(organisation_id));

-- This is an invoker function: RLS and the caller's organisation membership
-- still apply. It centralises deduplication and, critically, can never turn a
-- prior opt-out back into an opt-in through a spreadsheet upload.
create or replace function public.email_audience_import_apply(
  p_import_id uuid,
  p_rows jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import public.email_audience_imports%rowtype;
  v_row jsonb;
  v_email text;
  v_consent text;
  v_count integer := 0;
begin
  select * into v_import from public.email_audience_imports where id = p_import_id for update;
  if not found or not public.bridge_has_organisation_membership(v_import.organisation_id) then
    raise exception 'Not authorised to import this audience.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Import rows must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Import no more than 500 valid contacts at a time.' using errcode = '22023';
  end if;

  update public.email_audience_imports set status = 'processing' where id = v_import.id;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_email := lower(btrim(coalesce(v_row->>'email', '')));
    v_consent := coalesce(nullif(v_row->>'consent_status', ''), 'unknown');
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Every submitted row must have a valid email address.' using errcode = '22023';
    end if;
    if v_consent not in ('opted_in', 'opted_out', 'unknown') then
      raise exception 'Consent status is invalid.' using errcode = '22023';
    end if;

    insert into public.email_marketing_contacts (
      organisation_id, source_type, email, first_name, last_name, full_name,
      role_type, lead_stage, area, tags, is_valid_email
    ) values (
      v_import.organisation_id, 'csv', v_email,
      nullif(btrim(v_row->>'first_name'), ''), nullif(btrim(v_row->>'last_name'), ''),
      nullif(btrim(v_row->>'full_name'), ''), nullif(btrim(v_row->>'role_type'), ''),
      nullif(btrim(v_row->>'lead_stage'), ''), nullif(btrim(v_row->>'area'), ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_row->'tags', '[]'::jsonb))), '{}'::text[]), true
    ) on conflict (organisation_id, email) do update set
      first_name = coalesce(excluded.first_name, public.email_marketing_contacts.first_name),
      last_name = coalesce(excluded.last_name, public.email_marketing_contacts.last_name),
      full_name = coalesce(excluded.full_name, public.email_marketing_contacts.full_name),
      role_type = coalesce(excluded.role_type, public.email_marketing_contacts.role_type),
      lead_stage = coalesce(excluded.lead_stage, public.email_marketing_contacts.lead_stage),
      area = coalesce(excluded.area, public.email_marketing_contacts.area),
      tags = (select array_agg(distinct tag) from unnest(public.email_marketing_contacts.tags || excluded.tags) as tag),
      updated_at = now();

    insert into public.contact_marketing_preferences (
      organisation_id, email, marketing_consent_status, consent_source, consent_captured_at
    ) values (
      v_import.organisation_id, v_email, v_consent, 'csv_import',
      case when v_consent = 'opted_in' then now() else null end
    ) on conflict (organisation_id, email) do update set
      marketing_consent_status = case
        when public.contact_marketing_preferences.marketing_consent_status = 'opted_out' then 'opted_out'
        when excluded.marketing_consent_status = 'opted_out' then 'opted_out'
        when public.contact_marketing_preferences.marketing_consent_status = 'unknown' and excluded.marketing_consent_status = 'opted_in' then 'opted_in'
        else public.contact_marketing_preferences.marketing_consent_status
      end,
      consent_source = case
        when public.contact_marketing_preferences.marketing_consent_status = 'unknown' and excluded.marketing_consent_status = 'opted_in' then 'csv_import'
        else public.contact_marketing_preferences.consent_source
      end,
      consent_captured_at = case
        when public.contact_marketing_preferences.marketing_consent_status = 'unknown' and excluded.marketing_consent_status = 'opted_in' then now()
        else public.contact_marketing_preferences.consent_captured_at
      end,
      updated_at = now();
    v_count := v_count + 1;
  end loop;

  update public.email_audience_imports
  set status = 'completed', accepted_rows = v_count, completed_at = now()
  where id = v_import.id;
  return v_count;
end $$;

grant execute on function public.email_audience_import_apply(uuid, jsonb) to authenticated;
commit;
