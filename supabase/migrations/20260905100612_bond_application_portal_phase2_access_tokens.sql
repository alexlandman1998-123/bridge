begin;

create table if not exists public.bond_application_portal_access_links (
  id uuid primary key default gen_random_uuid(),
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'buyer_application_access' check (purpose in ('buyer_application_access')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists bond_application_portal_access_links_active_idx
  on public.bond_application_portal_access_links (bond_application_id, expires_at)
  where revoked_at is null;

alter table public.bond_application_portal_access_links enable row level security;
revoke all on table public.bond_application_portal_access_links from public, anon, authenticated;
grant all on table public.bond_application_portal_access_links to service_role;

create or replace function public.bridge_bond_application_portal_active_link()
returns public.bond_application_portal_access_links
language sql
stable
security definer
set search_path = public, extensions
as $$
  select link.*
  from public.bond_application_portal_access_links link
  where link.token_hash = encode(
      extensions.digest(
        coalesce(public.bridge_request_headers() ->> 'x-bridge-bond-application-token', ''),
        'sha256'
      ),
      'hex'
    )
    and link.revoked_at is null
    and link.expires_at > now()
  limit 1;
$$;

create or replace function public.bridge_bond_application_portal_projection()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
  v_application public.bond_applications%rowtype;
  v_document_summary jsonb;
  v_participant_summary jsonb;
begin
  select * into v_link from public.bridge_bond_application_portal_active_link();
  if v_link.id is null then
    raise exception 'Bond application access link is invalid, expired, or revoked.' using errcode = '42501';
  end if;

  select * into v_application
  from public.bond_applications
  where id = v_link.bond_application_id;
  if not found then
    raise exception 'Bond application is unavailable.' using errcode = 'P0002';
  end if;

  update public.bond_application_portal_access_links
  set last_accessed_at = now()
  where id = v_link.id;

  select jsonb_build_object(
    'total', count(*),
    'satisfied', count(*) filter (where status in ('satisfied', 'waived')),
    'outstanding', count(*) filter (where status = 'active')
  ) into v_document_summary
  from public.bond_application_document_requirements
  where bond_application_id = v_application.id;

  select jsonb_build_object(
    'total', count(*),
    'complete', count(*) filter (where status in ('ready_for_submission', 'awaiting_signature', 'signed', 'completed')),
    'pending', count(*) filter (where status not in ('ready_for_submission', 'awaiting_signature', 'signed', 'completed', 'removed'))
  ) into v_participant_summary
  from public.bond_application_participants
  where bond_application_id = v_application.id
    and status <> 'removed';

  return jsonb_build_object(
    'projectionVersion', 'bond_application_portal_phase2',
    'application', jsonb_build_object(
      'id', v_application.id,
      'status', v_application.status,
      'revision', v_application.revision,
      'createdAt', v_application.created_at,
      'updatedAt', v_application.updated_at,
      'submittedAt', v_application.submitted_at
    ),
    'progress', jsonb_build_object(
      'documents', coalesce(v_document_summary, jsonb_build_object('total', 0, 'satisfied', 0, 'outstanding', 0)),
      'participants', coalesce(v_participant_summary, jsonb_build_object('total', 0, 'complete', 0, 'pending', 0))
    ),
    'access', jsonb_build_object(
      'expiresAt', v_link.expires_at,
      'purpose', v_link.purpose
    )
  );
end;
$$;

create or replace function public.bridge_create_bond_application_portal_access_link(
  p_bond_application_id uuid,
  p_access_token text,
  p_expires_at timestamptz,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := nullif(trim(p_access_token), '');
  v_application public.bond_applications%rowtype;
  v_link public.bond_application_portal_access_links%rowtype;
begin
  if v_token is null or length(v_token) < 32 then
    raise exception 'A high-entropy application access token is required.' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'Access-link expiry must be between now and 90 days from now.' using errcode = '22023';
  end if;
  select * into v_application from public.bond_applications where id = p_bond_application_id;
  if not found then
    raise exception 'Bond application was not found.' using errcode = 'P0002';
  end if;

  insert into public.bond_application_portal_access_links (
    bond_application_id, token_hash, expires_at, created_by
  ) values (
    p_bond_application_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_expires_at,
    p_created_by
  ) returning * into v_link;

  return jsonb_build_object('id', v_link.id, 'applicationId', v_link.bond_application_id, 'expiresAt', v_link.expires_at);
end;
$$;

create or replace function public.bridge_revoke_bond_application_portal_access_link(
  p_access_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
begin
  update public.bond_application_portal_access_links
  set revoked_at = coalesce(revoked_at, now())
  where id = p_access_link_id
  returning * into v_link;
  if not found then raise exception 'Bond application access link was not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', v_link.id, 'revokedAt', v_link.revoked_at);
end;
$$;

revoke all on function public.bridge_bond_application_portal_active_link() from public, anon, authenticated;
revoke all on function public.bridge_bond_application_portal_projection() from public;
revoke all on function public.bridge_create_bond_application_portal_access_link(uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.bridge_revoke_bond_application_portal_access_link(uuid) from public, anon, authenticated;
grant execute on function public.bridge_bond_application_portal_projection() to anon, authenticated;
grant execute on function public.bridge_create_bond_application_portal_access_link(uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.bridge_revoke_bond_application_portal_access_link(uuid) to service_role;

comment on table public.bond_application_portal_access_links is
  'Phase 2 application-scoped buyer access links. Only SHA-256 token hashes are persisted; links are revocable and expire.';
comment on function public.bridge_bond_application_portal_projection() is
  'Phase 2 token-scoped bond application portal projection. Exposes only the linked application summary and progress.';

notify pgrst, 'reload schema';
commit;
