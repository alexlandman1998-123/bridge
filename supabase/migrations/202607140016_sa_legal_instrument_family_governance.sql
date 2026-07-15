-- Phase 1: South African legal instrument-family routing and template governance.
-- This migration is additive. Existing OTP templates become residential resale
-- templates and retain legacy publication compatibility.

alter table if exists public.document_packet_templates
  add column if not exists instrument_family text,
  add column if not exists jurisdiction_code text not null default 'ZA',
  add column if not exists language_code text not null default 'en-ZA',
  add column if not exists effective_from timestamptz,
  add column if not exists effective_until timestamptz,
  add column if not exists governance_version integer not null default 0,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists superseded_by uuid references public.profiles(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists withdrawn_by uuid references public.profiles(id) on delete set null,
  add column if not exists withdrawn_at timestamptz;

update public.document_packet_templates
set instrument_family = case
  when packet_type = 'otp' then 'residential_resale'
  when packet_type = 'mandate' then 'residential_mandate'
  when packet_type = 'commercial_sale' then 'commercial_sale'
  else packet_type
end
where instrument_family is null or btrim(instrument_family) = '';

update public.document_packet_templates
set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
  'instrument_family', instrument_family,
  'jurisdiction_code', jurisdiction_code,
  'language_code', language_code,
  'governance_version', governance_version
)
where not (coalesce(metadata_json, '{}'::jsonb) ? 'instrument_family');

alter table if exists public.document_packet_templates
  alter column instrument_family set not null;

alter table if exists public.document_packet_templates
  drop constraint if exists document_packet_templates_status_check;
alter table if exists public.document_packet_templates
  add constraint document_packet_templates_status_check
  check (status in ('draft', 'attorney_review', 'approved', 'published', 'superseded', 'withdrawn', 'archived'));

alter table if exists public.document_packet_templates
  drop constraint if exists document_packet_templates_instrument_family_check;
alter table if exists public.document_packet_templates
  add constraint document_packet_templates_instrument_family_check
  check (instrument_family = lower(instrument_family) and instrument_family ~ '^[a-z][a-z0-9_]*$');

alter table if exists public.document_packet_templates
  drop constraint if exists document_packet_templates_effective_window_check;
alter table if exists public.document_packet_templates
  add constraint document_packet_templates_effective_window_check
  check (effective_until is null or effective_from is null or effective_until >= effective_from);

alter table if exists public.document_packet_template_versions
  add column if not exists instrument_family text,
  add column if not exists jurisdiction_code text not null default 'ZA',
  add column if not exists language_code text not null default 'en-ZA',
  add column if not exists effective_from timestamptz,
  add column if not exists effective_until timestamptz,
  add column if not exists governance_version integer not null default 0,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists superseded_by uuid references public.profiles(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists withdrawn_by uuid references public.profiles(id) on delete set null,
  add column if not exists withdrawn_at timestamptz;

update public.document_packet_template_versions v
set
  instrument_family = coalesce(nullif(t.instrument_family, ''), case
    when v.packet_type = 'otp' then 'residential_resale'
    when v.packet_type = 'mandate' then 'residential_mandate'
    else v.packet_type
  end),
  jurisdiction_code = coalesce(nullif(t.jurisdiction_code, ''), 'ZA'),
  language_code = coalesce(nullif(t.language_code, ''), 'en-ZA'),
  effective_from = coalesce(v.effective_from, t.effective_from),
  effective_until = coalesce(v.effective_until, t.effective_until),
  governance_version = coalesce(v.governance_version, t.governance_version, 0),
  approved_by = coalesce(v.approved_by, t.approved_by),
  approved_at = coalesce(v.approved_at, t.approved_at)
from public.document_packet_templates t
where t.id = v.template_id
  and (v.instrument_family is null or btrim(v.instrument_family) = '');

alter table if exists public.document_packet_template_versions
  alter column instrument_family set not null;

alter table if exists public.document_packet_template_versions
  drop constraint if exists document_packet_template_versions_status_check;
alter table if exists public.document_packet_template_versions
  add constraint document_packet_template_versions_status_check
  check (status in ('draft', 'attorney_review', 'approved', 'published', 'superseded', 'withdrawn', 'archived'));

alter table if exists public.document_packet_template_versions
  drop constraint if exists document_packet_template_versions_effective_window_check;
alter table if exists public.document_packet_template_versions
  add constraint document_packet_template_versions_effective_window_check
  check (effective_until is null or effective_from is null or effective_until >= effective_from);

create index if not exists document_packet_templates_family_routing_idx
  on public.document_packet_templates (
    organisation_id,
    packet_type,
    instrument_family,
    status,
    effective_from,
    effective_until
  );

create index if not exists document_packet_template_versions_family_idx
  on public.document_packet_template_versions (
    organisation_id,
    packet_type,
    instrument_family,
    status,
    created_at desc
  );

create or replace function public.prevent_published_legal_template_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'published' and (
    new.template_key is distinct from old.template_key or
    new.template_label is distinct from old.template_label or
    new.template_format is distinct from old.template_format or
    new.version_tag is distinct from old.version_tag or
    new.storage_bucket is distinct from old.storage_bucket or
    new.storage_path is distinct from old.storage_path or
    new.file_name is distinct from old.file_name or
    new.content_hash is distinct from old.content_hash or
    new.description is distinct from old.description or
    new.sections_snapshot_json is distinct from old.sections_snapshot_json or
    new.placeholder_keys is distinct from old.placeholder_keys or
    new.metadata_json is distinct from old.metadata_json or
    new.instrument_family is distinct from old.instrument_family or
    new.jurisdiction_code is distinct from old.jurisdiction_code or
    new.language_code is distinct from old.language_code or
    new.effective_from is distinct from old.effective_from or
    new.effective_until is distinct from old.effective_until
  ) then
    raise exception 'Published legal template versions are immutable; create a new draft version.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists document_packet_template_versions_immutable_published
  on public.document_packet_template_versions;
create trigger document_packet_template_versions_immutable_published
before update on public.document_packet_template_versions
for each row execute function public.prevent_published_legal_template_version_mutation();

comment on column public.document_packet_templates.instrument_family is
  'Agreement family resolved before scenario/conditional-clause routing.';
comment on column public.document_packet_templates.governance_version is
  '0 identifies migrated legacy records; 1+ uses attorney approval governance.';
