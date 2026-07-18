begin;

create table if not exists public.legal_final_artifact_deliveries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  signer_id uuid not null references public.document_packet_signers(id) on delete cascade,
  recipient_role text not null,
  recipient_email text not null,
  artifact_sha256 text not null,
  artifact_path text not null,
  attempt_number integer not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  error_code text,
  attempted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (packet_version_id, signer_id, attempt_number),
  check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  check ((status = 'sent' and coalesce(provider_message_id, '') <> '') or status = 'failed')
);

create table if not exists public.legal_final_artifact_publications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade unique,
  artifact_sha256 text not null,
  artifact_path text not null,
  portal_surface text not null check (portal_surface in ('seller_portal', 'client_portal')),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (artifact_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists public.legal_final_delivery_claims (
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  signer_id uuid not null references public.document_packet_signers(id) on delete cascade,
  status text not null check (status in ('processing', 'sent', 'failed')),
  claimed_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (packet_version_id, signer_id)
);

alter table public.legal_final_artifact_deliveries enable row level security;
alter table public.legal_final_artifact_publications enable row level security;
alter table public.legal_final_delivery_claims enable row level security;
revoke all on public.legal_final_artifact_deliveries from anon, authenticated;
revoke all on public.legal_final_artifact_publications from anon, authenticated;
revoke all on public.legal_final_delivery_claims from anon, authenticated;

create or replace function public.bridge_claim_final_delivery_f3(
  p_packet_version_id uuid,
  p_signer_id uuid,
  p_claimed_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed uuid;
begin
  if not exists (
    select 1 from public.document_packet_signers signer
    join public.legal_final_artifact_evidence evidence on evidence.packet_version_id = signer.packet_version_id
    where signer.id = p_signer_id and signer.packet_version_id = p_packet_version_id and signer.status = 'signed'
  ) then raise exception 'F3 delivery claim requires a signed F2 recipient.' using errcode = 'P0001'; end if;
  insert into public.legal_final_delivery_claims (packet_version_id, signer_id, status, claimed_at, updated_at)
  values (p_packet_version_id, p_signer_id, 'processing', p_claimed_at, p_claimed_at)
  on conflict (packet_version_id, signer_id) do update set status = 'processing', claimed_at = excluded.claimed_at, updated_at = excluded.updated_at
  where public.legal_final_delivery_claims.status = 'failed'
    or (public.legal_final_delivery_claims.status = 'processing' and public.legal_final_delivery_claims.claimed_at < excluded.claimed_at - interval '10 minutes')
  returning signer_id into v_claimed;
  return v_claimed is not null;
end;
$$;

create or replace function public.bridge_record_final_delivery_f3(
  p_packet_version_id uuid,
  p_signer_id uuid,
  p_status text,
  p_provider_message_id text,
  p_error_code text,
  p_attempted_at timestamptz
)
returns public.legal_final_artifact_deliveries
language plpgsql security definer set search_path = public as $$
declare
  v_signer public.document_packet_signers%rowtype;
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_delivery public.legal_final_artifact_deliveries%rowtype;
  v_attempt integer;
begin
  if p_status not in ('sent', 'failed') then raise exception 'F3 delivery status is invalid.' using errcode = 'P0001'; end if;
  select * into v_signer from public.document_packet_signers where id = p_signer_id and packet_version_id = p_packet_version_id;
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id = p_packet_version_id;
  if v_signer.id is null or v_evidence.id is null or v_signer.packet_id is distinct from v_evidence.packet_id
    or coalesce(trim(v_signer.signer_email), '') = '' then
    raise exception 'F3 signer or final artifact evidence is invalid.' using errcode = 'P0001';
  end if;
  if p_status = 'sent' and coalesce(trim(p_provider_message_id), '') = '' then
    raise exception 'F3 sent delivery requires provider evidence.' using errcode = 'P0001';
  end if;
  select coalesce(max(attempt_number), 0) + 1 into v_attempt from public.legal_final_artifact_deliveries
  where packet_version_id = p_packet_version_id and signer_id = p_signer_id;
  insert into public.legal_final_artifact_deliveries (
    organisation_id, packet_id, packet_version_id, signer_id, recipient_role, recipient_email,
    artifact_sha256, artifact_path, attempt_number, status, provider_message_id, error_code, attempted_at
  ) values (
    v_evidence.organisation_id, v_evidence.packet_id, p_packet_version_id, p_signer_id,
    v_signer.signer_role, lower(trim(v_signer.signer_email)), v_evidence.sha256, v_evidence.path,
    v_attempt, p_status, nullif(trim(p_provider_message_id), ''), nullif(trim(p_error_code), ''), p_attempted_at
  ) returning * into v_delivery;
  update public.legal_final_delivery_claims set status = p_status, updated_at = p_attempted_at
  where packet_version_id = p_packet_version_id and signer_id = p_signer_id;
  return v_delivery;
end;
$$;

create or replace function public.bridge_record_final_publication_f3(
  p_packet_version_id uuid,
  p_portal_surface text,
  p_verified_at timestamptz
)
returns public.legal_final_artifact_publications
language plpgsql security definer set search_path = public as $$
declare
  v_evidence public.legal_final_artifact_evidence%rowtype;
  v_publication public.legal_final_artifact_publications%rowtype;
begin
  select * into v_evidence from public.legal_final_artifact_evidence where packet_version_id = p_packet_version_id;
  if v_evidence.id is null or p_portal_surface not in ('seller_portal', 'client_portal') then
    raise exception 'F3 publication target is invalid.' using errcode = 'P0001';
  end if;
  insert into public.legal_final_artifact_publications (
    organisation_id, packet_id, packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at
  ) values (
    v_evidence.organisation_id, v_evidence.packet_id, p_packet_version_id, v_evidence.sha256, v_evidence.path, p_portal_surface, p_verified_at
  ) on conflict (packet_version_id) do update set verified_at = excluded.verified_at
  where public.legal_final_artifact_publications.artifact_sha256 = excluded.artifact_sha256
    and public.legal_final_artifact_publications.artifact_path = excluded.artifact_path
    and public.legal_final_artifact_publications.portal_surface = excluded.portal_surface
  returning * into v_publication;
  if v_publication.id is null then raise exception 'F3 publication evidence cannot change artifact or portal scope.' using errcode = 'P0001'; end if;
  return v_publication;
end;
$$;

revoke all on function public.bridge_record_final_delivery_f3(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_record_final_delivery_f3(uuid, uuid, text, text, text, timestamptz) to service_role;
revoke all on function public.bridge_claim_final_delivery_f3(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_claim_final_delivery_f3(uuid, uuid, timestamptz) to service_role;
revoke all on function public.bridge_record_final_publication_f3(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_record_final_publication_f3(uuid, text, timestamptz) to service_role;

create or replace function public.bridge_protect_final_delivery_evidence_f3()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'F3 recipient delivery evidence is append-only.' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_protect_final_delivery_evidence_f3 on public.legal_final_artifact_deliveries;
create trigger trg_protect_final_delivery_evidence_f3 before update or delete on public.legal_final_artifact_deliveries
for each row execute function public.bridge_protect_final_delivery_evidence_f3();

create or replace function public.bridge_protect_final_publication_evidence_f3()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'F3 publication evidence cannot be deleted.' using errcode = 'P0001'; end if;
  if new.organisation_id is distinct from old.organisation_id or new.packet_id is distinct from old.packet_id
    or new.packet_version_id is distinct from old.packet_version_id or new.artifact_sha256 is distinct from old.artifact_sha256
    or new.artifact_path is distinct from old.artifact_path or new.portal_surface is distinct from old.portal_surface
    or new.verified_at < old.verified_at then
    raise exception 'F3 publication binding is immutable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_final_publication_evidence_f3 on public.legal_final_artifact_publications;
create trigger trg_protect_final_publication_evidence_f3 before update or delete on public.legal_final_artifact_publications
for each row execute function public.bridge_protect_final_publication_evidence_f3();

commit;
