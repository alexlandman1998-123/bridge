begin;

-- Phase 2 keeps the existing document_definitions table as the canonical
-- registry and adds an explicit, queryable compatibility layer for producer
-- keys. Existing requirement rows stay intact; later phases change how
-- structured facts are captured and projected.
create table if not exists public.document_definition_aliases (
  alias_key text primary key,
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  source_system text not null default 'seller_document_taxonomy_phase2',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_definition_aliases_alias_key_check check (alias_key = lower(btrim(alias_key))),
  constraint document_definition_aliases_alias_not_empty_check check (alias_key <> '')
);

alter table public.document_definition_aliases enable row level security;
revoke all on table public.document_definition_aliases from public, anon, authenticated;
grant select on table public.document_definition_aliases to authenticated;
grant all on table public.document_definition_aliases to service_role;

drop policy if exists document_definition_aliases_authenticated_read on public.document_definition_aliases;
create policy document_definition_aliases_authenticated_read
on public.document_definition_aliases
for select
to authenticated
using (true);

drop policy if exists document_definition_aliases_service_role_all on public.document_definition_aliases;
create policy document_definition_aliases_service_role_all
on public.document_definition_aliases
for all
to service_role
using (true)
with check (true);

drop trigger if exists trg_document_definition_aliases_updated_at on public.document_definition_aliases;
create trigger trg_document_definition_aliases_updated_at
before update on public.document_definition_aliases
for each row execute function public.bridge_set_updated_at();

insert into public.document_definition_aliases (
  alias_key,
  document_definition_key,
  source_system,
  metadata_json
)
values
  ('sectional_levy_statement', 'levy_statement', 'seller_onboarding_flow_contract', jsonb_build_object('compatibility_reason', 'legacy seller onboarding trigger')),
  ('hoa_contact_details', 'hoa_details', 'seller_document_requirement_engine', jsonb_build_object('compatibility_reason', 'legacy estate requirement producer'))
on conflict (alias_key) do update
set
  document_definition_key = excluded.document_definition_key,
  source_system = excluded.source_system,
  metadata_json = public.document_definition_aliases.metadata_json || excluded.metadata_json,
  updated_at = now();

-- Kind is stored in metadata because document_definitions is already used by
-- canonical requirement and legacy projection code. The compatibility marker
-- makes it explicit that these rows must stop producing Upload actions in
-- Phase 3 without invalidating historical requirements in this migration.
update public.document_definitions definition
set metadata_json = coalesce(definition.metadata_json, '{}'::jsonb) || jsonb_build_object(
  'requirement_kind', case
    when definition.key in (
      'body_corporate_details',
      'hoa_details',
      'bond_bank_details',
      'bond_cancellation_attorney_details',
      'settlement_figure',
      'tenant_details',
      'deposit_details',
      'notice_period_details'
    ) then 'structured_fact'
    when definition.key in ('generated_mandate', 'generated_otp') then 'generated_document'
    else 'upload_document'
  end,
  'taxonomy_version', 'seller_document_taxonomy_v1',
  'legacy_upload_projection', definition.key in (
    'body_corporate_details',
    'hoa_details',
    'bond_bank_details',
    'bond_cancellation_attorney_details',
    'settlement_figure',
    'tenant_details',
    'deposit_details',
    'notice_period_details'
  )
)
where definition.key in (
  'body_corporate_details',
  'hoa_details',
  'bond_bank_details',
  'bond_cancellation_attorney_details',
  'settlement_figure',
  'tenant_details',
  'deposit_details',
  'notice_period_details',
  'generated_mandate',
  'generated_otp',
  'solar_compliance_documents',
  'levy_statement'
);

create or replace function public.resolve_document_definition_key(p_key text)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (
      select alias.document_definition_key
      from public.document_definition_aliases alias
      where alias.alias_key = lower(btrim(coalesce(p_key, '')))
    ),
    lower(btrim(coalesce(p_key, '')))
  );
$$;

revoke all on function public.resolve_document_definition_key(text) from public, anon;
grant execute on function public.resolve_document_definition_key(text) to authenticated, service_role;

comment on table public.document_definition_aliases is
  'Compatibility aliases for legacy document producer keys. New producers must emit document_definitions.key values.';
comment on function public.resolve_document_definition_key(text) is
  'Resolves a legacy document producer key to its canonical document_definitions.key value.';

notify pgrst, 'reload schema';

commit;
