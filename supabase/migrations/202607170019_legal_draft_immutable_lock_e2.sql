begin;

create or replace function public.bridge_prevent_locked_legal_draft_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version public.document_packet_versions%rowtype;
  v_lock jsonb;
begin
  if tg_op = 'INSERT' then
    select version.* into v_current_version
    from public.document_packets packet
    join public.document_packet_versions version
      on version.packet_id = packet.id
     and version.version_number = packet.current_version_number
    where packet.id = new.packet_id;

    v_lock := coalesce(v_current_version.validation_summary_json->'lock_snapshot', '{}'::jsonb);
    if coalesce(v_lock->>'lockDecision', '') = 'locked'
      and coalesce((v_current_version.validation_summary_json->>'content_locked')::boolean, false) then
      raise exception 'E2 locked legal draft cannot be regenerated or superseded.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  v_lock := coalesce(old.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  if coalesce(v_lock->>'lockDecision', '') = 'locked'
    and coalesce((old.validation_summary_json->>'content_locked')::boolean, false)
    and (
      new.render_status is distinct from old.render_status
      or new.rendered_document_id is distinct from old.rendered_document_id
      or new.rendered_file_path is distinct from old.rendered_file_path
      or new.rendered_file_name is distinct from old.rendered_file_name
      or new.rendered_file_url is distinct from old.rendered_file_url
      or new.placeholders_resolved_json is distinct from old.placeholders_resolved_json
      or new.placeholders_missing_json is distinct from old.placeholders_missing_json
      or new.section_manifest_json is distinct from old.section_manifest_json
      or new.validation_summary_json is distinct from old.validation_summary_json
      or new.generated_by is distinct from old.generated_by
      or new.generated_at is distinct from old.generated_at
    ) then
    raise exception 'E2 locked legal draft content or provenance is immutable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_locked_legal_draft_mutation on public.document_packet_versions;
create trigger trg_prevent_locked_legal_draft_mutation
before insert or update on public.document_packet_versions
for each row execute function public.bridge_prevent_locked_legal_draft_mutation();

create or replace function public.bridge_prevent_locked_legal_draft_pointer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version public.document_packet_versions%rowtype;
  v_lock jsonb;
begin
  if new.current_version_number is not distinct from old.current_version_number then return new; end if;
  select * into v_current_version
  from public.document_packet_versions
  where packet_id = old.id and version_number = old.current_version_number;
  v_lock := coalesce(v_current_version.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  if coalesce(v_lock->>'lockDecision', '') = 'locked'
    and coalesce((v_current_version.validation_summary_json->>'content_locked')::boolean, false) then
    raise exception 'E2 locked legal draft must remain the packet current version.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_locked_legal_draft_pointer_change on public.document_packets;
create trigger trg_prevent_locked_legal_draft_pointer_change
before update of current_version_number on public.document_packets
for each row execute function public.bridge_prevent_locked_legal_draft_pointer_change();

create or replace function public.bridge_enforce_legal_draft_lock_before_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_approval jsonb;
  v_lock jsonb;
  v_artifact jsonb;
  v_render jsonb;
  v_approved_at timestamptz;
  v_locked_at timestamptz;
begin
  if new.signing_token is null or (tg_op = 'UPDATE' and new.signing_token is not distinct from old.signing_token) then return new; end if;
  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_version from public.document_packet_versions where id = new.packet_version_id and packet_id = new.packet_id;
  if v_packet.id is null or v_version.id is null then raise exception 'E2 packet/version lock target is missing.'; end if;

  v_approval := coalesce(v_version.validation_summary_json->'approval_snapshot', '{}'::jsonb);
  v_lock := coalesce(v_version.validation_summary_json->'lock_snapshot', '{}'::jsonb);
  v_artifact := coalesce(v_version.validation_summary_json->'artifact_provenance', '{}'::jsonb);
  v_render := coalesce(v_version.validation_summary_json->'render_provenance', '{}'::jsonb);
  begin
    v_approved_at := (v_approval->>'approvedAt')::timestamptz;
    v_locked_at := (v_lock->>'lockedAt')::timestamptz;
  exception when others then
    raise exception 'E2 approval or lock timestamp is missing or invalid.' using errcode = 'P0001';
  end;

  if v_version.render_status <> 'generated'
    or coalesce(v_version.validation_summary_json->>'review_state', '') <> 'locked'
    or coalesce((v_version.validation_summary_json->>'content_locked')::boolean, false) is not true
    or coalesce(v_lock->>'lockDecision', '') <> 'locked'
    or coalesce(v_lock->>'lockedByUserId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(v_lock->>'lockedByRole', '') = ''
    or coalesce(v_lock->>'lockReference', '') = ''
    or v_locked_at < v_approved_at
    or v_locked_at > now() + interval '5 minutes'
    or coalesce(v_lock->>'packetId', '') <> v_packet.id::text
    or coalesce(v_lock->>'versionId', '') <> v_version.id::text
    or coalesce((v_lock->>'versionNumber')::integer, 0) <> v_version.version_number
    or coalesce(v_lock->>'approvalReference', '') <> coalesce(v_approval->>'approvalReference', '')
    or coalesce(v_lock->>'artifactSha256', '') <> coalesce(v_artifact->>'sha256', '')
    or coalesce(v_lock->>'artifactPath', '') <> coalesce(v_artifact->>'path', '')
    or coalesce(v_lock->>'contentFingerprint', '') <> coalesce(v_render->>'contentFingerprint', '')
    or coalesce(v_lock->>'generationAttemptId', '') <> coalesce(v_render->>'generationAttemptId', '')
    or v_packet.current_version_number <> v_version.version_number then
    raise exception 'E2 immutable lock is required for this exact approved current draft.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_legal_draft_lock_before_token on public.document_packet_signers;
create trigger trg_legal_draft_lock_before_token
before insert or update of signing_token on public.document_packet_signers
for each row execute function public.bridge_enforce_legal_draft_lock_before_token();

comment on function public.bridge_prevent_locked_legal_draft_mutation() is
  'E2 immutability backstop preventing a locked legal draft version from being rewritten or superseded.';
comment on function public.bridge_prevent_locked_legal_draft_pointer_change() is
  'E2 immutability backstop preventing a packet from moving away from its locked current version.';
comment on function public.bridge_enforce_legal_draft_lock_before_token() is
  'E2 database backstop preventing signing-token issuance unless the exact E1-approved draft is locked.';

commit;
