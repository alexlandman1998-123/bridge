begin;

-- -------------------------------------------------------------------
-- Packet signing foundation (field/signer model, no public signer flow)
-- -------------------------------------------------------------------

create table if not exists public.document_packet_signers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_document_id uuid references public.documents(id) on delete set null,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  signer_role text not null,
  signer_name text not null,
  signer_email text not null,
  signing_order integer,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_version_id, signer_role, signer_email)
);

create table if not exists public.document_signing_fields (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_document_id uuid references public.documents(id) on delete set null,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  signer_role text not null,
  signer_name text,
  signer_email text,
  field_type text not null,
  page_number integer not null check (page_number > 0),
  x_position numeric(10, 3) not null,
  y_position numeric(10, 3) not null,
  width numeric(10, 3) not null,
  height numeric(10, 3) not null,
  required boolean not null default true,
  status text not null default 'pending',
  completed_at timestamptz,
  completed_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------
-- Constraints
-- -------------------------------------------------------------------

alter table public.document_packets
  drop constraint if exists document_packets_status_check;
alter table public.document_packets
  add constraint document_packets_status_check
  check (status in ('draft', 'ready_for_generation', 'generated', 'signing_prep', 'sent', 'partially_signed', 'completed', 'voided', 'archived'));

alter table public.document_packet_signers
  drop constraint if exists document_packet_signers_signer_role_check;
alter table public.document_packet_signers
  add constraint document_packet_signers_signer_role_check
  check (signer_role in ('purchaser_1', 'purchaser_2', 'seller', 'agent', 'contractor', 'witness_1', 'witness_2', 'other'));

alter table public.document_packet_signers
  drop constraint if exists document_packet_signers_status_check;
alter table public.document_packet_signers
  add constraint document_packet_signers_status_check
  check (status in ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired'));

alter table public.document_signing_fields
  drop constraint if exists document_signing_fields_signer_role_check;
alter table public.document_signing_fields
  add constraint document_signing_fields_signer_role_check
  check (signer_role in ('purchaser_1', 'purchaser_2', 'seller', 'agent', 'contractor', 'witness_1', 'witness_2', 'other'));

alter table public.document_signing_fields
  drop constraint if exists document_signing_fields_field_type_check;
alter table public.document_signing_fields
  add constraint document_signing_fields_field_type_check
  check (field_type in ('initial', 'signature', 'date', 'text'));

alter table public.document_signing_fields
  drop constraint if exists document_signing_fields_status_check;
alter table public.document_signing_fields
  add constraint document_signing_fields_status_check
  check (status in ('pending', 'completed', 'skipped'));

-- -------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------

create index if not exists document_packet_signers_packet_idx
  on public.document_packet_signers (packet_id, packet_version_id);

create index if not exists document_packet_signers_org_status_idx
  on public.document_packet_signers (organisation_id, status, created_at desc);

create index if not exists document_signing_fields_packet_idx
  on public.document_signing_fields (packet_id, packet_version_id, page_number);

create index if not exists document_signing_fields_org_status_idx
  on public.document_signing_fields (organisation_id, status, created_at desc);

create index if not exists document_signing_fields_signer_idx
  on public.document_signing_fields (packet_version_id, signer_role, field_type);

-- -------------------------------------------------------------------
-- Updated-at triggers
-- -------------------------------------------------------------------

drop trigger if exists trg_document_packet_signers_updated_at on public.document_packet_signers;
create trigger trg_document_packet_signers_updated_at
before update on public.document_packet_signers
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_document_signing_fields_updated_at on public.document_signing_fields;
create trigger trg_document_signing_fields_updated_at
before update on public.document_signing_fields
for each row
execute function public.set_updated_at_timestamp();

-- -------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------

alter table if exists public.document_packet_signers enable row level security;
alter table if exists public.document_signing_fields enable row level security;

drop policy if exists document_packet_signers_select on public.document_packet_signers;
create policy document_packet_signers_select on public.document_packet_signers
for select to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_signers.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

drop policy if exists document_packet_signers_write on public.document_packet_signers;
create policy document_packet_signers_write on public.document_packet_signers
for all to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_packet_signers.packet_id
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
    where p.id = document_packet_signers.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

drop policy if exists document_signing_fields_select on public.document_signing_fields;
create policy document_signing_fields_select on public.document_signing_fields
for select to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_signing_fields.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

drop policy if exists document_signing_fields_write on public.document_signing_fields;
create policy document_signing_fields_write on public.document_signing_fields
for all to authenticated
using (
  exists (
    select 1
    from public.document_packets p
    where p.id = document_signing_fields.packet_id
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
    where p.id = document_signing_fields.packet_id
      and (
        public.bridge_is_org_admin(p.organisation_id)
        or public.bridge_can_access_assignment(p.organisation_id, p.assigned_agent_id, null)
        or p.created_by = auth.uid()
      )
  )
);

commit;
