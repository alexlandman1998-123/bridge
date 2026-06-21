begin;

-- Phase 1: shared organisation legal template registry.
-- This extends the existing packet template system so the admin panel can
-- manage residential and commercial legal templates without creating a
-- parallel document model.

alter table public.document_packet_templates
  add column if not exists status text not null default 'published',
  add column if not exists template_storage_bucket text,
  add column if not exists template_file_name text,
  add column if not exists content_hash text,
  add column if not exists change_summary text,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz;

update public.document_packet_templates
set
  status = coalesce(
    status,
    case
      when coalesce(is_active, true) then 'published'
      else 'archived'
    end
  ),
  published_at = case
    when coalesce(
      status,
      case
        when coalesce(is_active, true) then 'published'
        else 'archived'
      end
    ) = 'published' then coalesce(published_at, created_at, now())
    else published_at
  end,
  archived_at = case
    when coalesce(
      status,
      case
        when coalesce(is_active, true) then 'published'
        else 'archived'
      end
    ) = 'archived' then coalesce(archived_at, updated_at, now())
    else archived_at
  end
where status is null
   or (
    coalesce(
      status,
      case
        when coalesce(is_active, true) then 'published'
        else 'archived'
      end
    ) = 'published'
    and published_at is null
  )
   or (
    coalesce(
      status,
      case
        when coalesce(is_active, true) then 'published'
        else 'archived'
      end
    ) = 'archived'
    and archived_at is null
  );

update public.document_packet_templates
set
  template_storage_bucket = coalesce(
    nullif(template_storage_bucket, ''),
    nullif(metadata_json->>'template_storage_bucket', ''),
    nullif(metadata_json->>'template_bucket', ''),
    nullif(metadata_json->>'templateBucket', '')
  ),
  template_file_name = coalesce(
    nullif(template_file_name, ''),
    nullif(metadata_json->>'template_file_name', ''),
    nullif(metadata_json->>'template_filename', ''),
    nullif(metadata_json->>'templateFilename', '')
  )
where metadata_json is not null;

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_module_type_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_module_type_check
  check (
    module_type = lower(module_type)
    and module_type ~ '^[a-z][a-z0-9_]*$'
  );

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_packet_type_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_packet_type_check
  check (
    packet_type = lower(packet_type)
    and packet_type ~ '^[a-z][a-z0-9_]*$'
  );

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_template_format_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_template_format_check
  check (template_format in ('docx', 'pdf', 'html', 'structured', 'json'));

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_status_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_status_check
  check (status in ('draft', 'published', 'archived'));

alter table if exists public.document_packets
  drop constraint if exists document_packets_packet_type_check;
alter table if exists public.document_packets
  add constraint document_packets_packet_type_check
  check (
    packet_type = lower(packet_type)
    and packet_type ~ '^[a-z][a-z0-9_]*$'
  );

create table if not exists public.document_packet_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_packet_templates(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  module_type text not null,
  packet_type text not null,
  template_key text not null,
  template_label text not null,
  template_format text not null default 'docx',
  version_tag text not null default 'v1',
  status text not null default 'draft',
  storage_bucket text,
  storage_path text,
  file_name text,
  content_hash text,
  description text,
  change_summary text,
  sections_snapshot_json jsonb not null default '[]'::jsonb,
  placeholder_keys text[] not null default '{}'::text[],
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  constraint document_packet_template_versions_status_check
    check (status in ('draft', 'published', 'archived', 'superseded')),
  constraint document_packet_template_versions_module_type_check
    check (module_type = lower(module_type) and module_type ~ '^[a-z][a-z0-9_]*$'),
  constraint document_packet_template_versions_packet_type_check
    check (packet_type = lower(packet_type) and packet_type ~ '^[a-z][a-z0-9_]*$'),
  constraint document_packet_template_versions_template_format_check
    check (template_format in ('docx', 'pdf', 'html', 'structured', 'json')),
  constraint document_packet_template_versions_template_version_unique
    unique (template_id, version_tag)
);

create table if not exists public.document_packet_template_audit (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.document_packet_templates(id) on delete set null,
  template_version_id uuid references public.document_packet_template_versions(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete cascade,
  module_type text,
  packet_type text,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  change_summary text,
  event_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.document_packet_template_versions (
  template_id,
  organisation_id,
  module_type,
  packet_type,
  template_key,
  template_label,
  template_format,
  version_tag,
  status,
  storage_bucket,
  storage_path,
  file_name,
  content_hash,
  description,
  change_summary,
  sections_snapshot_json,
  placeholder_keys,
  metadata_json,
  created_by,
  updated_by,
  published_by,
  archived_by,
  created_at,
  updated_at,
  published_at,
  archived_at
)
select
  t.id,
  t.organisation_id,
  t.module_type,
  t.packet_type,
  t.template_key,
  t.template_label,
  t.template_format,
  t.version_tag,
  case
    when t.status = 'draft' then 'draft'
    when t.status = 'archived' then 'archived'
    else 'published'
  end,
  t.template_storage_bucket,
  t.template_storage_path,
  t.template_file_name,
  t.content_hash,
  t.description,
  coalesce(t.change_summary, 'Initial template registry snapshot'),
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'section_key', s.section_key,
        'section_label', s.section_label,
        'section_type', s.section_type,
        'sort_order', s.sort_order,
        'is_required', s.is_required,
        'is_repeatable', s.is_repeatable,
        'condition_json', s.condition_json,
        'placeholder_keys', s.placeholder_keys,
        'legal_text', s.legal_text,
        'metadata_json', s.metadata_json
      )
      order by s.sort_order asc, s.created_at asc
    )
    from public.document_template_sections s
    where s.template_id = t.id
  ), '[]'::jsonb),
  coalesce((
    select array_agg(distinct pk.placeholder_key order by pk.placeholder_key)
    from public.document_template_sections s
    cross join unnest(s.placeholder_keys) as pk(placeholder_key)
    where s.template_id = t.id
  ), '{}'::text[]),
  t.metadata_json,
  t.created_by,
  t.updated_by,
  t.published_by,
  t.archived_by,
  t.created_at,
  t.updated_at,
  t.published_at,
  t.archived_at
from public.document_packet_templates t
on conflict (template_id, version_tag)
do update set
  organisation_id = excluded.organisation_id,
  module_type = excluded.module_type,
  packet_type = excluded.packet_type,
  template_key = excluded.template_key,
  template_label = excluded.template_label,
  template_format = excluded.template_format,
  status = excluded.status,
  storage_bucket = excluded.storage_bucket,
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  content_hash = excluded.content_hash,
  description = excluded.description,
  sections_snapshot_json = excluded.sections_snapshot_json,
  placeholder_keys = excluded.placeholder_keys,
  metadata_json = excluded.metadata_json,
  updated_by = excluded.updated_by,
  updated_at = now(),
  published_by = excluded.published_by,
  archived_by = excluded.archived_by,
  published_at = excluded.published_at,
  archived_at = excluded.archived_at;

create index if not exists document_packet_templates_registry_lookup_idx
  on public.document_packet_templates (organisation_id, module_type, packet_type, status, is_default, updated_at desc);

create index if not exists document_packet_templates_published_idx
  on public.document_packet_templates (module_type, packet_type, updated_at desc)
  where status = 'published' and is_active = true;

create index if not exists document_packet_template_versions_template_created_idx
  on public.document_packet_template_versions (template_id, created_at desc);

create index if not exists document_packet_template_versions_org_lookup_idx
  on public.document_packet_template_versions (organisation_id, module_type, packet_type, status, created_at desc);

create index if not exists document_packet_template_versions_published_idx
  on public.document_packet_template_versions (organisation_id, module_type, packet_type, published_at desc)
  where status = 'published';

create index if not exists document_packet_template_audit_template_created_idx
  on public.document_packet_template_audit (template_id, created_at desc);

create index if not exists document_packet_template_audit_org_created_idx
  on public.document_packet_template_audit (organisation_id, created_at desc);

drop trigger if exists document_packet_template_versions_set_updated_at on public.document_packet_template_versions;
create trigger document_packet_template_versions_set_updated_at
before update on public.document_packet_template_versions
for each row
execute function public.bridge_set_updated_at();

create or replace function public.bridge_document_packet_template_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_version_id uuid;
  v_organisation_id uuid;
  v_module_type text;
  v_packet_type text;
  v_event_type text;
  v_change_summary text;
  v_payload jsonb;
begin
  if TG_TABLE_NAME = 'document_packet_template_versions' then
    v_template_id := coalesce(new.template_id, old.template_id);
    v_version_id := coalesce(new.id, old.id);
    v_organisation_id := coalesce(new.organisation_id, old.organisation_id);
    v_module_type := coalesce(new.module_type, old.module_type);
    v_packet_type := coalesce(new.packet_type, old.packet_type);
    v_change_summary := coalesce(new.change_summary, old.change_summary);

    if TG_OP = 'INSERT' then
      v_event_type := 'template_version_created';
      v_payload := jsonb_build_object('new', to_jsonb(new));
    elsif TG_OP = 'DELETE' then
      v_event_type := 'template_version_deleted';
      v_payload := jsonb_build_object('old', to_jsonb(old));
    else
      v_event_type := case
        when old.status is distinct from new.status and new.status = 'published' then 'template_version_published'
        when old.status is distinct from new.status and new.status = 'archived' then 'template_version_archived'
        else 'template_version_updated'
      end;
      v_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    end if;
  else
    v_template_id := coalesce(new.id, old.id);
    v_version_id := null;
    v_organisation_id := coalesce(new.organisation_id, old.organisation_id);
    v_module_type := coalesce(new.module_type, old.module_type);
    v_packet_type := coalesce(new.packet_type, old.packet_type);
    v_change_summary := coalesce(new.change_summary, old.change_summary);

    if TG_OP = 'INSERT' then
      v_event_type := 'template_created';
      v_payload := jsonb_build_object('new', to_jsonb(new));
    elsif TG_OP = 'DELETE' then
      v_event_type := 'template_deleted';
      v_payload := jsonb_build_object('old', to_jsonb(old));
    else
      v_event_type := case
        when old.status is distinct from new.status and new.status = 'published' then 'template_published'
        when old.status is distinct from new.status and new.status = 'archived' then 'template_archived'
        when old.is_default is distinct from new.is_default then 'template_default_changed'
        else 'template_updated'
      end;
      v_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    end if;
  end if;

  insert into public.document_packet_template_audit (
    template_id,
    template_version_id,
    organisation_id,
    module_type,
    packet_type,
    event_type,
    actor_user_id,
    actor_role,
    change_summary,
    event_payload_json
  )
  values (
    v_template_id,
    v_version_id,
    v_organisation_id,
    v_module_type,
    v_packet_type,
    v_event_type,
    auth.uid(),
    case
      when v_organisation_id is not null then public.bridge_membership_role(v_organisation_id)
      else null
    end,
    v_change_summary,
    v_payload
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists document_packet_templates_audit on public.document_packet_templates;
create trigger document_packet_templates_audit
after insert or update or delete on public.document_packet_templates
for each row
execute function public.bridge_document_packet_template_audit();

drop trigger if exists document_packet_template_versions_audit on public.document_packet_template_versions;
create trigger document_packet_template_versions_audit
after insert or update or delete on public.document_packet_template_versions
for each row
execute function public.bridge_document_packet_template_audit();

alter table public.document_packet_templates enable row level security;
alter table public.document_packet_template_versions enable row level security;
alter table public.document_packet_template_audit enable row level security;

drop policy if exists document_packet_templates_select on public.document_packet_templates;
create policy document_packet_templates_select on public.document_packet_templates
for select to authenticated
using (
  organisation_id is null
  or public.bridge_is_org_admin(organisation_id)
  or (
    status = 'published'
    and is_active = true
    and public.bridge_is_active_member(organisation_id)
  )
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

drop policy if exists document_packet_template_versions_select on public.document_packet_template_versions;
create policy document_packet_template_versions_select on public.document_packet_template_versions
for select to authenticated
using (
  organisation_id is null
  or public.bridge_is_org_admin(organisation_id)
  or (
    status = 'published'
    and public.bridge_is_active_member(organisation_id)
  )
);

drop policy if exists document_packet_template_versions_write on public.document_packet_template_versions;
create policy document_packet_template_versions_write on public.document_packet_template_versions
for all to authenticated
using (
  organisation_id is not null
  and public.bridge_is_org_admin(organisation_id)
)
with check (
  organisation_id is not null
  and public.bridge_is_org_admin(organisation_id)
);

drop policy if exists document_packet_template_audit_select on public.document_packet_template_audit;
create policy document_packet_template_audit_select on public.document_packet_template_audit
for select to authenticated
using (
  organisation_id is null
  or public.bridge_is_org_admin(organisation_id)
  or public.bridge_is_active_member(organisation_id)
);

drop policy if exists document_packet_template_audit_insert on public.document_packet_template_audit;
create policy document_packet_template_audit_insert on public.document_packet_template_audit
for insert to authenticated
with check (
  organisation_id is not null
  and public.bridge_is_org_admin(organisation_id)
);

grant select, insert, update, delete on table public.document_packet_templates to authenticated;
grant select, insert, update, delete on table public.document_packet_template_versions to authenticated;
grant select, insert on table public.document_packet_template_audit to authenticated;

commit;
