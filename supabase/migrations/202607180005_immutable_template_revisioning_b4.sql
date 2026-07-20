begin;

-- B4: a published template is an immutable revision. A successor is a new row,
-- while document packets retain the exact revision and definition they started with.

alter table public.document_packet_templates
  add column if not exists revision_root_template_id uuid references public.document_packet_templates(id) on delete set null,
  add column if not exists revision_parent_template_id uuid references public.document_packet_templates(id) on delete set null,
  add column if not exists revision_number integer not null default 1,
  add column if not exists superseded_by_template_id uuid references public.document_packet_templates(id) on delete set null;

alter table public.document_packet_templates
  drop constraint if exists document_packet_templates_revision_number_b4_check;
alter table public.document_packet_templates
  add constraint document_packet_templates_revision_number_b4_check check (revision_number > 0);

-- The revision-family backfill is a system migration, not a user edit. Avoid
-- copying historical orphan organisation IDs into the stricter audit table.
alter table public.document_packet_templates
  disable trigger document_packet_templates_audit;

update public.document_packet_templates
set
  revision_root_template_id = coalesce(revision_root_template_id, id),
  revision_number = greatest(
    1,
    coalesce(nullif(substring(coalesce(version_tag, '') from '[0-9]+'), '')::integer, 1)
  )
where revision_root_template_id is null
   or revision_number is null;

alter table public.document_packet_templates
  enable trigger document_packet_templates_audit;

create index if not exists document_packet_templates_revision_family_b4_idx
  on public.document_packet_templates (revision_root_template_id, revision_number desc);

alter table public.document_packets
  add column if not exists template_revision_id uuid references public.document_packet_templates(id) on delete set null,
  add column if not exists template_version_tag_snapshot text,
  add column if not exists template_definition_snapshot_json jsonb not null default '{}'::jsonb;

update public.document_packets p
set
  template_revision_id = p.template_id,
  template_version_tag_snapshot = t.version_tag,
  template_definition_snapshot_json = coalesce(t.definition_json, '{}'::jsonb)
from public.document_packet_templates t
where t.id = p.template_id
  and (
    p.template_revision_id is null
    or p.template_version_tag_snapshot is null
    or p.template_definition_snapshot_json = '{}'::jsonb
  );

create or replace function public.bridge_capture_packet_template_revision_b4()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_template public.document_packet_templates%rowtype;
begin
  if tg_op = 'UPDATE' and new.template_id is not distinct from old.template_id then
    new.template_revision_id := old.template_revision_id;
    new.template_version_tag_snapshot := old.template_version_tag_snapshot;
    new.template_definition_snapshot_json := old.template_definition_snapshot_json;
    return new;
  end if;

  if new.template_id is null then
    new.template_revision_id := null;
    new.template_version_tag_snapshot := null;
    new.template_definition_snapshot_json := '{}'::jsonb;
    return new;
  end if;

  select * into v_template
  from public.document_packet_templates
  where id = new.template_id;
  if not found then
    raise exception 'Template revision % does not exist.', new.template_id;
  end if;

  new.template_revision_id := v_template.id;
  new.template_version_tag_snapshot := v_template.version_tag;
  new.template_definition_snapshot_json := coalesce(v_template.definition_json, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists trg_capture_packet_template_revision_b4 on public.document_packets;
create trigger trg_capture_packet_template_revision_b4
before insert or update of template_id, template_revision_id, template_version_tag_snapshot, template_definition_snapshot_json
on public.document_packets
for each row execute function public.bridge_capture_packet_template_revision_b4();

create or replace function public.bridge_guard_published_template_revision_b4()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'archived' and new.status is distinct from old.status then
    raise exception 'Archived template revisions are immutable. Create a new draft revision.'
      using errcode = '55000';
  end if;

  if old.status in ('published', 'archived') and (
    new.organisation_id is distinct from old.organisation_id
    or new.module_type is distinct from old.module_type
    or new.packet_type is distinct from old.packet_type
    or new.template_key is distinct from old.template_key
    or new.template_label is distinct from old.template_label
    or new.template_format is distinct from old.template_format
    or new.template_storage_bucket is distinct from old.template_storage_bucket
    or new.template_storage_path is distinct from old.template_storage_path
    or new.template_file_name is distinct from old.template_file_name
    or new.version_tag is distinct from old.version_tag
    or new.description is distinct from old.description
    or new.metadata_json is distinct from old.metadata_json
    or (
      new.definition_json is distinct from old.definition_json
      and new.definition_json is distinct from public.bridge_build_template_definition_b1(old.id)
    )
    or new.revision_root_template_id is distinct from old.revision_root_template_id
    or new.revision_parent_template_id is distinct from old.revision_parent_template_id
    or new.revision_number is distinct from old.revision_number
  ) then
    raise exception 'Published template revisions are immutable. Create a new draft revision.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_published_template_revision_b4 on public.document_packet_templates;
create trigger trg_guard_published_template_revision_b4
before update on public.document_packet_templates
for each row execute function public.bridge_guard_published_template_revision_b4();

create or replace function public.bridge_guard_published_template_sections_b4()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_template_id uuid := case when tg_op = 'DELETE' then old.template_id else new.template_id end;
  v_status text;
begin
  select status into v_status from public.document_packet_templates where id = v_template_id;
  if v_status in ('published', 'archived') then
    raise exception 'Published or archived template revision sections are immutable. Create a new draft revision.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_published_template_sections_b4 on public.document_template_sections;
create trigger trg_guard_published_template_sections_b4
before insert or update or delete on public.document_template_sections
for each row execute function public.bridge_guard_published_template_sections_b4();

create or replace function public.bridge_publish_template_revision_b4(
  p_template_id uuid,
  p_make_default boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target public.document_packet_templates%rowtype;
  v_root_id uuid;
  v_now timestamptz := now();
begin
  select * into v_target
  from public.document_packet_templates
  where id = p_template_id
  for update;

  if not found or v_target.organisation_id is null then
    raise exception 'Company template revision not found.';
  end if;
  if not public.bridge_is_org_admin(v_target.organisation_id) then
    raise exception 'Only an organisation administrator can publish this template.' using errcode = '42501';
  end if;
  if v_target.status = 'archived' then
    raise exception 'An archived template cannot be published. Create a draft revision.';
  end if;
  if coalesce(v_target.definition_json, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'Template definition is empty and cannot be published.';
  end if;

  v_root_id := coalesce(v_target.revision_root_template_id, v_target.id);

  if p_make_default then
    update public.document_packet_templates
    set is_default = false, updated_by = auth.uid()
    where organisation_id = v_target.organisation_id
      and packet_type = v_target.packet_type
      and id <> v_target.id
      and is_default = true;
  end if;

  update public.document_packet_templates
  set
    status = 'archived',
    is_active = false,
    is_default = false,
    superseded_by_template_id = v_target.id,
    archived_by = auth.uid(),
    archived_at = v_now,
    updated_by = auth.uid()
  where revision_root_template_id = v_root_id
    and id <> v_target.id
    and status = 'published';

  update public.document_packet_templates
  set
    revision_root_template_id = v_root_id,
    status = 'published',
    is_active = true,
    is_default = p_make_default,
    published_by = auth.uid(),
    published_at = v_now,
    archived_by = null,
    archived_at = null,
    updated_by = auth.uid()
  where id = v_target.id;

  select * into v_target from public.document_packet_templates where id = v_target.id;

  insert into public.document_packet_template_versions (
    template_id, organisation_id, module_type, packet_type, template_key, template_label,
    template_format, version_tag, status, storage_bucket, storage_path, file_name,
    description, sections_snapshot_json, placeholder_keys, metadata_json,
    definition_schema_version, definition_json, created_by, updated_by, published_by,
    created_at, updated_at, published_at
  ) values (
    v_target.id, v_target.organisation_id, v_target.module_type, v_target.packet_type,
    v_target.template_key, v_target.template_label, v_target.template_format,
    v_target.version_tag, 'published', v_target.template_storage_bucket,
    v_target.template_storage_path, v_target.template_file_name, v_target.description,
    coalesce(v_target.definition_json->'sections', '[]'::jsonb),
    coalesce((select array_agg(distinct k) from public.document_template_sections s cross join lateral unnest(s.placeholder_keys) k where s.template_id = v_target.id), '{}'::text[]),
    v_target.metadata_json, v_target.definition_schema_version, v_target.definition_json,
    v_target.created_by, auth.uid(), auth.uid(), v_target.created_at, v_now, v_now
  )
  on conflict (template_id, version_tag) do update set
    status = 'published',
    sections_snapshot_json = excluded.sections_snapshot_json,
    placeholder_keys = excluded.placeholder_keys,
    metadata_json = excluded.metadata_json,
    definition_schema_version = excluded.definition_schema_version,
    definition_json = excluded.definition_json,
    updated_by = excluded.updated_by,
    published_by = excluded.published_by,
    updated_at = excluded.updated_at,
    published_at = excluded.published_at;

  return jsonb_build_object(
    'id', v_target.id,
    'revisionRootTemplateId', v_root_id,
    'revisionNumber', v_target.revision_number,
    'versionTag', v_target.version_tag,
    'status', v_target.status,
    'isDefault', v_target.is_default
  );
end;
$$;

grant execute on function public.bridge_publish_template_revision_b4(uuid, boolean) to authenticated;

comment on column public.document_packets.template_definition_snapshot_json is
  'B4 immutable canonical template definition captured when the packet selects its template revision.';

commit;
