begin;

create or replace function public.bridge_guard_document_packet_version_insert_i1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
begin
  select * into v_packet from public.document_packets where id=new.packet_id for update;
  if v_packet.id is null then raise exception 'Packet version requires an existing packet.' using errcode='23503'; end if;
  if v_packet.status in ('sent','partially_signed','completed','voided','archived') then
    raise exception 'This packet is locked and cannot receive another version.' using errcode='55000',detail='I1_PACKET_VERSION_LOCKED';
  end if;
  if new.version_number is distinct from coalesce(v_packet.current_version_number,0)+1 then
    raise exception 'Packet versions must be inserted in exact sequence.' using errcode='40001',detail='I1_VERSION_SEQUENCE_INVALID';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_document_packet_version_insert_i1 on public.document_packet_versions;
create trigger trg_guard_document_packet_version_insert_i1
before insert on public.document_packet_versions
for each row execute function public.bridge_guard_document_packet_version_insert_i1();

create or replace function public.bridge_complete_document_packet_version_insert_i1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.document_packets set current_version_number=new.version_number where id=new.packet_id;
  insert into public.document_packet_events (
    packet_id,organisation_id,version_id,event_type,event_payload_json,created_by,created_at
  ) values (
    new.packet_id,new.organisation_id,new.id,'version_created',
    jsonb_build_object(
      'versionNumber',new.version_number,'renderStatus',new.render_status,'renderedDocumentId',new.rendered_document_id,
      'generationAttemptId',coalesce(new.validation_summary_json->>'generationAttemptId',new.validation_summary_json#>>'{generationPayload,generationAttemptId}')
    ),new.generated_by,new.generated_at
  );
  return new;
end;
$$;

drop trigger if exists trg_complete_document_packet_version_insert_i1 on public.document_packet_versions;
create trigger trg_complete_document_packet_version_insert_i1
after insert on public.document_packet_versions
for each row execute function public.bridge_complete_document_packet_version_insert_i1();

-- Keep the public creation contract, but delegate pointer/event completion to the
-- triggers so even a privileged direct insert cannot leave partial lineage.
create or replace function public.bridge_create_document_packet_version_i1(
  p_packet_id uuid,p_render_status text,p_rendered_document_id uuid default null,
  p_rendered_file_path text default null,p_rendered_file_name text default null,p_rendered_file_url text default null,
  p_placeholders_resolved_json jsonb default '{}'::jsonb,p_placeholders_missing_json jsonb default '[]'::jsonb,
  p_section_manifest_json jsonb default '[]'::jsonb,p_validation_summary_json jsonb default '{}'::jsonb,
  p_generated_by uuid default null,p_generated_at timestamptz default now(),p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_next_version integer;
  v_actor uuid:=auth.uid();
begin
  if auth.role()<>'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet version authority is required.' using errcode='42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id for update;
  if v_packet.id is null then raise exception 'Document packet not found.' using errcode='P0002'; end if;
  select coalesce(max(version_number),0)+1 into v_next_version from public.document_packet_versions where packet_id=p_packet_id;
  if p_dry_run then
    return jsonb_build_object('contract','i1-v1','dryRun',true,'packetId',p_packet_id,'nextVersionNumber',v_next_version);
  end if;
  if auth.role()<>'service_role' and v_actor is null then raise exception 'Authenticated generation actor is required.' using errcode='42501'; end if;
  insert into public.document_packet_versions (
    packet_id,organisation_id,version_number,render_status,rendered_document_id,rendered_file_path,rendered_file_name,
    rendered_file_url,placeholders_resolved_json,placeholders_missing_json,section_manifest_json,validation_summary_json,generated_by,generated_at
  ) values (
    v_packet.id,v_packet.organisation_id,v_next_version,coalesce(nullif(trim(p_render_status),''),'draft'),p_rendered_document_id,
    nullif(trim(p_rendered_file_path),''),nullif(trim(p_rendered_file_name),''),nullif(trim(p_rendered_file_url),''),
    coalesce(p_placeholders_resolved_json,'{}'::jsonb),coalesce(p_placeholders_missing_json,'[]'::jsonb),
    coalesce(p_section_manifest_json,'[]'::jsonb),coalesce(p_validation_summary_json,'{}'::jsonb),
    coalesce(v_actor,p_generated_by),coalesce(p_generated_at,now())
  ) returning * into v_version;
  return jsonb_build_object('contract','i1-v1','dryRun',false,'version',to_jsonb(v_version));
end;
$$;

create or replace function public.bridge_probe_document_generator_concurrency_i1(p_packet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version_count integer:=0;
  v_max_version integer:=0;
  v_duplicate_number_count integer:=0;
  v_version_created_event_count integer:=0;
  v_version_event_mismatch_count integer:=0;
  v_orphan_version_event_count integer:=0;
  v_unique_index_present boolean:=false;
  v_insert_guard_present boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'Concurrency diagnostics require the service role.' using errcode='42501'; end if;
  select * into v_packet from public.document_packets where id=p_packet_id for update;
  if v_packet.id is null then raise exception 'Concurrency target was not found.' using errcode='P0002'; end if;
  select count(*),coalesce(max(version_number),0) into v_version_count,v_max_version
    from public.document_packet_versions where packet_id=v_packet.id;
  select count(*) into v_duplicate_number_count from (
    select version_number from public.document_packet_versions where packet_id=v_packet.id
    group by version_number having count(*)>1
  ) duplicate_numbers;
  select count(*) into v_version_created_event_count from public.document_packet_events
    where packet_id=v_packet.id and event_type='version_created';
  select count(*) into v_version_event_mismatch_count from (
    select version.id from public.document_packet_versions version
    left join public.document_packet_events packet_event on packet_event.packet_id=version.packet_id
      and packet_event.version_id=version.id and packet_event.event_type='version_created'
    where version.packet_id=v_packet.id group by version.id having count(packet_event.id)<>1
  ) event_mismatches;
  select count(*) into v_orphan_version_event_count from public.document_packet_events packet_event
    where packet_event.packet_id=v_packet.id and packet_event.version_id is not null and not exists(
      select 1 from public.document_packet_versions version where version.id=packet_event.version_id and version.packet_id=v_packet.id
    );
  select exists(select 1 from pg_indexes where schemaname='public' and tablename='document_packet_versions'
    and indexname='document_packet_versions_packet_version_i1_uq') into v_unique_index_present;
  select exists(select 1 from pg_trigger where tgname='trg_guard_document_packet_version_insert_i1' and not tgisinternal)
    into v_insert_guard_present;
  return jsonb_build_object('contract','i1-generator-v1','packetId',v_packet.id,'packetType',lower(v_packet.packet_type),
    'packetStatus',v_packet.status,'currentVersionNumber',coalesce(v_packet.current_version_number,0),
    'versionCount',v_version_count,'maxVersionNumber',v_max_version,'nextVersionNumber',v_max_version+1,
    'currentPointerMatchesMax',coalesce(v_packet.current_version_number,0)=v_max_version,
    'duplicateVersionNumberCount',v_duplicate_number_count,'versionCreatedEventCount',v_version_created_event_count,
    'versionCreatedEventMismatchCount',v_version_event_mismatch_count,
    'orphanVersionEventCount',v_orphan_version_event_count,'uniqueIndexPresent',v_unique_index_present,
    'insertGuardPresent',v_insert_guard_present,'mutatedData',false,'checkedAt',now());
end;
$$;

revoke all on function public.bridge_probe_document_generator_concurrency_i1(uuid) from public,anon,authenticated;
grant execute on function public.bridge_probe_document_generator_concurrency_i1(uuid) to service_role;

commit;
