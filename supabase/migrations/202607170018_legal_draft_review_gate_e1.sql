begin;

create or replace function public.bridge_enforce_legal_draft_review_before_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_approval jsonb;
  v_artifact jsonb;
  v_render jsonb;
  v_approved_at timestamptz;
begin
  if new.signing_token is null or (tg_op = 'UPDATE' and new.signing_token is not distinct from old.signing_token) then
    return new;
  end if;
  select * into v_packet from public.document_packets where id = new.packet_id;
  select * into v_version from public.document_packet_versions where id = new.packet_version_id and packet_id = new.packet_id;
  if v_packet.id is null or v_version.id is null then raise exception 'E1 packet/version review target is missing.'; end if;
  v_approval := coalesce(v_version.validation_summary_json->'approval_snapshot', '{}'::jsonb);
  v_artifact := coalesce(v_version.validation_summary_json->'artifact_provenance', '{}'::jsonb);
  v_render := coalesce(v_version.validation_summary_json->'render_provenance', '{}'::jsonb);
  begin
    v_approved_at := (v_approval->>'approvedAt')::timestamptz;
  exception when others then
    raise exception 'E1 approval timestamp is missing or invalid.' using errcode = 'P0001';
  end;
  if v_version.render_status <> 'generated'
    or coalesce(v_approval->>'approvalDecision', '') <> 'approved'
    or coalesce(v_approval->>'approvedByUserId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(v_approval->>'approvedByRole', '') = ''
    or coalesce(v_approval->>'approvalReference', '') = ''
    or v_approved_at < v_version.generated_at
    or v_approved_at > now() + interval '5 minutes'
    or coalesce(v_approval->>'packetId', '') <> v_packet.id::text
    or coalesce(v_approval->>'versionId', '') <> v_version.id::text
    or coalesce((v_approval->>'versionNumber')::integer, 0) <> v_version.version_number
    or coalesce(v_approval->>'artifactSha256', '') <> coalesce(v_artifact->>'sha256', '')
    or coalesce(v_approval->>'artifactPath', '') <> coalesce(v_artifact->>'path', '')
    or coalesce(v_approval->>'contentFingerprint', '') <> coalesce(v_render->>'contentFingerprint', '')
    or coalesce(v_approval->>'generationAttemptId', '') <> coalesce(v_render->>'generationAttemptId', '')
    or v_packet.current_version_number <> v_version.version_number then
    raise exception 'E1 accountable approval is required for this exact current generated draft.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_legal_draft_review_before_token on public.document_packet_signers;
create trigger trg_legal_draft_review_before_token
before insert or update of signing_token on public.document_packet_signers
for each row execute function public.bridge_enforce_legal_draft_review_before_token();

comment on function public.bridge_enforce_legal_draft_review_before_token() is
  'E1 database backstop preventing signing-token issuance for an unapproved or stale legal draft version.';

commit;
