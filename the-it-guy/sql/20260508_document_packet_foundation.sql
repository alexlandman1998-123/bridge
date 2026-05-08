begin;

-- -------------------------------------------------------------------
-- Document packet foundation (generation/send backbone, no e-sign yet)
-- -------------------------------------------------------------------

create table if not exists public.document_packet_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  module_type text not null default 'agency',
  packet_type text not null,
  template_key text not null,
  template_label text not null,
  template_format text not null default 'docx',
  template_storage_path text,
  version_tag text not null default 'v1',
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_packet_templates(id) on delete cascade,
  section_key text not null,
  section_label text not null,
  section_type text not null default 'legal_text',
  sort_order integer not null default 0,
  is_required boolean not null default true,
  is_repeatable boolean not null default false,
  condition_json jsonb not null default '{}'::jsonb,
  placeholder_keys text[] not null default '{}'::text[],
  legal_text text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, section_key)
);

create table if not exists public.document_placeholder_registry (
  id uuid primary key default gen_random_uuid(),
  packet_type text not null,
  placeholder_key text not null,
  entity_scope text not null default 'transaction',
  data_type text not null default 'text',
  description text,
  normalization_rule text,
  example_value text,
  is_required_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_type, placeholder_key)
);

create table if not exists public.document_packets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  packet_type text not null,
  title text,
  status text not null default 'draft',
  template_id uuid references public.document_packet_templates(id) on delete set null,
  template_key_snapshot text,
  template_label_snapshot text,
  transaction_id uuid references public.transactions(id) on delete set null,
  lead_id uuid references public.leads(lead_id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  deal_id uuid references public.crm_deals(deal_id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  current_version_number integer not null default 0,
  source_context_json jsonb not null default '{}'::jsonb,
  branding_snapshot_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_packet_versions (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  version_number integer not null,
  render_status text not null default 'draft',
  rendered_document_id uuid references public.documents(id) on delete set null,
  rendered_file_path text,
  rendered_file_name text,
  rendered_file_url text,
  placeholders_resolved_json jsonb not null default '{}'::jsonb,
  placeholders_missing_json jsonb not null default '[]'::jsonb,
  section_manifest_json jsonb not null default '[]'::jsonb,
  validation_summary_json jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_id, version_number)
);

create table if not exists public.document_packet_events (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  version_id uuid references public.document_packet_versions(id) on delete set null,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------
-- Constraints
-- -------------------------------------------------------------------

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_module_type_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_module_type_check
  check (module_type in ('agency', 'developer', 'attorney', 'bond_originator', 'shared'));

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_packet_type_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_packet_type_check
  check (packet_type in ('otp', 'mandate', 'addendum', 'supporting_legal', 'custom'));

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_template_format_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_template_format_check
  check (template_format in ('docx', 'pdf', 'html'));

alter table public.document_template_sections
  drop constraint if exists document_template_sections_section_type_check;
alter table public.document_template_sections
  add constraint document_template_sections_section_type_check
  check (section_type in ('legal_text', 'dynamic_fields', 'conditional_clause', 'annexure', 'signature_zone', 'metadata'));

alter table public.document_placeholder_registry
  drop constraint if exists document_placeholder_registry_entity_scope_check;
alter table public.document_placeholder_registry
  add constraint document_placeholder_registry_entity_scope_check
  check (entity_scope in ('organisation', 'transaction', 'property', 'buyer', 'seller', 'agent', 'branch', 'custom'));

alter table public.document_placeholder_registry
  drop constraint if exists document_placeholder_registry_data_type_check;
alter table public.document_placeholder_registry
  add constraint document_placeholder_registry_data_type_check
  check (data_type in ('text', 'number', 'currency', 'date', 'boolean', 'enum', 'json'));

alter table public.document_packets
  drop constraint if exists document_packets_packet_type_check;
alter table public.document_packets
  add constraint document_packets_packet_type_check
  check (packet_type in ('otp', 'mandate', 'addendum', 'supporting_legal', 'custom'));

alter table public.document_packets
  drop constraint if exists document_packets_status_check;
alter table public.document_packets
  add constraint document_packets_status_check
  check (status in ('draft', 'ready_for_generation', 'generated', 'sent', 'partially_signed', 'completed', 'voided', 'archived'));

alter table public.document_packet_versions
  drop constraint if exists document_packet_versions_render_status_check;
alter table public.document_packet_versions
  add constraint document_packet_versions_render_status_check
  check (render_status in ('draft', 'generated', 'failed', 'superseded'));

-- -------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------

create unique index if not exists document_packet_templates_org_key_version_idx
  on public.document_packet_templates (organisation_id, template_key, version_tag);

create unique index if not exists document_packet_templates_global_key_version_idx
  on public.document_packet_templates (template_key, version_tag)
  where organisation_id is null;

create index if not exists document_packet_templates_org_packet_type_idx
  on public.document_packet_templates (organisation_id, packet_type, is_active);

create index if not exists document_template_sections_template_sort_idx
  on public.document_template_sections (template_id, sort_order);

create index if not exists document_placeholder_registry_packet_type_idx
  on public.document_placeholder_registry (packet_type, is_active);

create index if not exists document_packets_org_status_idx
  on public.document_packets (organisation_id, status, updated_at desc);

create index if not exists document_packets_org_agent_idx
  on public.document_packets (organisation_id, assigned_agent_id, updated_at desc);

create index if not exists document_packets_transaction_idx
  on public.document_packets (transaction_id);

create index if not exists document_packets_lead_idx
  on public.document_packets (lead_id);

create index if not exists document_packets_deal_idx
  on public.document_packets (deal_id);

create index if not exists document_packet_versions_packet_version_idx
  on public.document_packet_versions (packet_id, version_number desc);

create index if not exists document_packet_versions_org_status_idx
  on public.document_packet_versions (organisation_id, render_status, created_at desc);

create index if not exists document_packet_events_packet_created_idx
  on public.document_packet_events (packet_id, created_at desc);

create index if not exists document_packet_events_org_type_idx
  on public.document_packet_events (organisation_id, event_type, created_at desc);

-- -------------------------------------------------------------------
-- Updated-at triggers
-- -------------------------------------------------------------------

drop trigger if exists trg_document_packet_templates_updated_at on public.document_packet_templates;
create trigger trg_document_packet_templates_updated_at
before update on public.document_packet_templates
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_document_template_sections_updated_at on public.document_template_sections;
create trigger trg_document_template_sections_updated_at
before update on public.document_template_sections
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_document_placeholder_registry_updated_at on public.document_placeholder_registry;
create trigger trg_document_placeholder_registry_updated_at
before update on public.document_placeholder_registry
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_document_packets_updated_at on public.document_packets;
create trigger trg_document_packets_updated_at
before update on public.document_packets
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_document_packet_versions_updated_at on public.document_packet_versions;
create trigger trg_document_packet_versions_updated_at
before update on public.document_packet_versions
for each row
execute function public.set_updated_at_timestamp();

-- -------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------

alter table if exists public.document_packet_templates enable row level security;
alter table if exists public.document_template_sections enable row level security;
alter table if exists public.document_placeholder_registry enable row level security;
alter table if exists public.document_packets enable row level security;
alter table if exists public.document_packet_versions enable row level security;
alter table if exists public.document_packet_events enable row level security;

drop policy if exists document_packet_templates_select on public.document_packet_templates;
create policy document_packet_templates_select on public.document_packet_templates
for select to authenticated
using (
  organisation_id is null
  or public.bridge_is_active_member(organisation_id)
);

drop policy if exists document_packet_templates_write on public.document_packet_templates;
create policy document_packet_templates_write on public.document_packet_templates
for all to authenticated
using (
  organisation_id is not null
  and public.bridge_is_org_admin(organisation_id)
)
with check (
  organisation_id is not null
  and public.bridge_is_org_admin(organisation_id)
);

drop policy if exists document_template_sections_select on public.document_template_sections;
create policy document_template_sections_select on public.document_template_sections
for select to authenticated
using (
  exists (
    select 1
    from public.document_packet_templates t
    where t.id = document_template_sections.template_id
      and (t.organisation_id is null or public.bridge_is_active_member(t.organisation_id))
  )
);

drop policy if exists document_template_sections_write on public.document_template_sections;
create policy document_template_sections_write on public.document_template_sections
for all to authenticated
using (
  exists (
    select 1
    from public.document_packet_templates t
    where t.id = document_template_sections.template_id
      and t.organisation_id is not null
      and public.bridge_is_org_admin(t.organisation_id)
  )
)
with check (
  exists (
    select 1
    from public.document_packet_templates t
    where t.id = document_template_sections.template_id
      and t.organisation_id is not null
      and public.bridge_is_org_admin(t.organisation_id)
  )
);

drop policy if exists document_placeholder_registry_select on public.document_placeholder_registry;
create policy document_placeholder_registry_select on public.document_placeholder_registry
for select to authenticated
using (true);

drop policy if exists document_placeholder_registry_write on public.document_placeholder_registry;
create policy document_placeholder_registry_write on public.document_placeholder_registry
for all to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and ou.status = 'active'
      and lower(ou.role) in ('super_admin', 'principal', 'admin', 'developer')
  )
)
with check (
  exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and ou.status = 'active'
      and lower(ou.role) in ('super_admin', 'principal', 'admin', 'developer')
  )
);

drop policy if exists document_packets_select on public.document_packets;
create policy document_packets_select on public.document_packets
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
  or created_by = auth.uid()
);

drop policy if exists document_packets_write on public.document_packets;
create policy document_packets_write on public.document_packets
for all to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
  or created_by = auth.uid()
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or public.bridge_can_access_assignment(organisation_id, assigned_agent_id, null)
  or created_by = auth.uid()
);

drop policy if exists document_packet_versions_select on public.document_packet_versions;
create policy document_packet_versions_select on public.document_packet_versions
for select to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_versions.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

drop policy if exists document_packet_versions_write on public.document_packet_versions;
create policy document_packet_versions_write on public.document_packet_versions
for all to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_versions.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_versions.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

drop policy if exists document_packet_events_select on public.document_packet_events;
create policy document_packet_events_select on public.document_packet_events
for select to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_events.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

drop policy if exists document_packet_events_write on public.document_packet_events;
create policy document_packet_events_write on public.document_packet_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_events.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

commit;
