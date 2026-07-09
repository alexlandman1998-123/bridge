begin;

create extension if not exists "pgcrypto";

create or replace function public.bridge_document_permissions_current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.bridge_document_permissions_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(p.role, ''))
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.bridge_document_permissions_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.organisation_users') is null then
    return false;
  end if;

  return exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and lower(coalesce(ou.role, '')) in ('super_admin', 'principal', 'admin')
      and lower(coalesce(ou.status, '')) = 'active'
  );
end;
$$;

create or replace function public.bridge_document_permissions_is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_document_permissions_is_admin()
    or public.bridge_document_permissions_current_profile_role()
      in ('developer', 'agent', 'attorney', 'bond_originator')
$$;

create or replace function public.bridge_document_permissions_normalize_role_type(p_role text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_role, '')))
    when '' then null
    when 'transfer_attorney' then 'attorney'
    when 'bond_attorney' then 'attorney'
    when 'cancellation_attorney' then 'attorney'
    when 'buyer_client' then 'buyer'
    when 'seller_client' then 'seller'
    else lower(btrim(p_role))
  end
$$;

create or replace function public.bridge_document_permissions_normalize_legal_role(p_role text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_role, '')))
    when 'transfer_attorney' then 'transfer'
    when 'bond_attorney' then 'bond'
    when 'cancellation_attorney' then 'cancellation'
    else null
  end
$$;

create or replace function public.bridge_document_permissions_role_is_client(p_role text)
returns boolean
language sql
immutable
as $$
  select public.bridge_document_permissions_normalize_role_type(p_role)
    in ('client', 'buyer', 'seller', 'buyer_and_seller')
$$;

create or replace function public.bridge_document_permissions_has_transaction_access(
  target_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_document_permissions_is_admin() then true
      when exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and tp.can_view is true
          and tp.removed_at is null
          and coalesce(tp.status, 'active') <> 'removed'
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) =
              public.bridge_document_permissions_current_user_email()
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            lower(coalesce(t.assigned_agent_email, '')) =
              public.bridge_document_permissions_current_user_email()
            or lower(coalesce(t.assigned_attorney_email, '')) =
              public.bridge_document_permissions_current_user_email()
            or lower(coalesce(t.assigned_bond_originator_email, '')) =
              public.bridge_document_permissions_current_user_email()
          )
      ) then true
      else false
    end
$$;

alter table if exists public.document_requests
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade,
  add column if not exists assigned_to_role text default 'client',
  add column if not exists assigned_to_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists requested_document_id uuid references public.documents(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists status text not null default 'requested',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.transaction_participants
  add column if not exists can_request_documents boolean not null default false;

update public.transaction_participants
set can_request_documents = true
where removed_at is null
  and coalesce(status, 'active') <> 'removed'
  and coalesce(role_type, '') not in ('client', 'buyer', 'seller')
  and (
    role_type in ('developer', 'agent', 'attorney', 'bond_originator', 'internal_admin')
    or legal_role in ('transfer', 'bond', 'cancellation')
  );

create index if not exists transaction_participants_can_request_documents_idx
  on public.transaction_participants (transaction_id, can_request_documents)
  where can_request_documents is true and removed_at is null;

create table if not exists public.document_request_targets (
  id uuid primary key default gen_random_uuid(),
  document_request_id uuid not null references public.document_requests(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  target_type text not null default 'role',
  participant_id uuid references public.transaction_participants(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  role_type text,
  legal_role text,
  client_group text,
  display_name text,
  can_view_request boolean not null default true,
  can_upload boolean not null default true,
  status text not null default 'requested',
  completed_document_id uuid references public.documents(id) on delete set null,
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_request_targets_type_check check (
    target_type in ('participant', 'user', 'email', 'role', 'client_group', 'professional_group')
  ),
  constraint document_request_targets_status_check check (
    status in ('requested', 'notified', 'opened', 'uploaded', 'completed', 'cancelled', 'declined', 'expired')
  ),
  constraint document_request_targets_legal_role_check check (
    legal_role is null or legal_role in ('none', 'transfer', 'bond', 'cancellation')
  ),
  constraint document_request_targets_client_group_check check (
    client_group is null or client_group in ('client', 'buyer', 'seller', 'buyer_and_seller', 'all_clients')
  ),
  constraint document_request_targets_subject_check check (
    (target_type = 'participant' and participant_id is not null)
    or (target_type = 'user' and user_id is not null)
    or (target_type = 'email' and nullif(btrim(coalesce(email, '')), '') is not null)
    or (target_type = 'role' and nullif(btrim(coalesce(role_type, '')), '') is not null)
    or (target_type = 'client_group' and client_group is not null)
    or (target_type = 'professional_group')
  )
);

create index if not exists document_request_targets_request_idx
  on public.document_request_targets (document_request_id);
create index if not exists document_request_targets_transaction_idx
  on public.document_request_targets (transaction_id);
create index if not exists document_request_targets_status_idx
  on public.document_request_targets (transaction_id, status);
create index if not exists document_request_targets_participant_idx
  on public.document_request_targets (participant_id)
  where participant_id is not null;
create index if not exists document_request_targets_user_idx
  on public.document_request_targets (user_id)
  where user_id is not null;
create index if not exists document_request_targets_email_idx
  on public.document_request_targets (transaction_id, lower(email))
  where email is not null;
create index if not exists document_request_targets_role_idx
  on public.document_request_targets (transaction_id, role_type, legal_role)
  where role_type is not null;

create unique index if not exists document_request_targets_request_participant_uidx
  on public.document_request_targets (document_request_id, participant_id)
  where participant_id is not null;
create unique index if not exists document_request_targets_request_user_uidx
  on public.document_request_targets (document_request_id, user_id)
  where user_id is not null;
create unique index if not exists document_request_targets_request_email_uidx
  on public.document_request_targets (document_request_id, lower(email))
  where email is not null;
create unique index if not exists document_request_targets_request_role_uidx
  on public.document_request_targets (
    document_request_id,
    role_type,
    coalesce(legal_role, 'none')
  )
  where role_type is not null;
create unique index if not exists document_request_targets_request_client_group_uidx
  on public.document_request_targets (document_request_id, client_group)
  where client_group is not null;

create table if not exists public.transaction_document_access_grants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  resource_type text not null,
  document_id uuid references public.documents(id) on delete cascade,
  document_request_id uuid references public.document_requests(id) on delete cascade,
  requirement_instance_id uuid references public.document_requirement_instances(id) on delete cascade,
  principal_type text not null,
  participant_id uuid references public.transaction_participants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  role_type text,
  legal_role text,
  client_group text,
  principal_label text,
  can_view boolean not null default false,
  can_download boolean not null default false,
  can_upload boolean not null default false,
  can_review boolean not null default false,
  can_manage boolean not null default false,
  grant_source text not null default 'manual',
  source_detail text,
  metadata_json jsonb not null default '{}'::jsonb,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_document_access_grants_resource_type_check check (
    resource_type in ('document', 'document_request', 'requirement_instance')
  ),
  constraint transaction_document_access_grants_resource_check check (
    (
      resource_type = 'document'
      and document_id is not null
      and document_request_id is null
      and requirement_instance_id is null
    )
    or (
      resource_type = 'document_request'
      and document_id is null
      and document_request_id is not null
      and requirement_instance_id is null
    )
    or (
      resource_type = 'requirement_instance'
      and document_id is null
      and document_request_id is null
      and requirement_instance_id is not null
    )
  ),
  constraint transaction_document_access_grants_principal_type_check check (
    principal_type in (
      'participant',
      'user',
      'email',
      'role',
      'client_group',
      'professional_group',
      'system'
    )
  ),
  constraint transaction_document_access_grants_principal_check check (
    (principal_type = 'participant' and participant_id is not null)
    or (principal_type = 'user' and user_id is not null)
    or (principal_type = 'email' and nullif(btrim(coalesce(email, '')), '') is not null)
    or (principal_type = 'role' and nullif(btrim(coalesce(role_type, '')), '') is not null)
    or (principal_type = 'client_group' and client_group is not null)
    or (principal_type in ('professional_group', 'system'))
  ),
  constraint transaction_document_access_grants_legal_role_check check (
    legal_role is null or legal_role in ('none', 'transfer', 'bond', 'cancellation')
  ),
  constraint transaction_document_access_grants_client_group_check check (
    client_group is null or client_group in ('client', 'buyer', 'seller', 'buyer_and_seller', 'all_clients')
  ),
  constraint transaction_document_access_grants_source_check check (
    grant_source in ('requirement_policy', 'document_request', 'upload_inheritance', 'manual', 'backfill', 'system')
  ),
  constraint transaction_document_access_grants_permissions_check check (
    can_view is true
    or can_download is true
    or can_upload is true
    or can_review is true
    or can_manage is true
  ),
  constraint transaction_document_access_grants_expiry_check check (
    expires_at is null or revoked_at is null or revoked_at <= expires_at
  )
);

create index if not exists transaction_document_access_grants_transaction_idx
  on public.transaction_document_access_grants (transaction_id);
create index if not exists transaction_document_access_grants_document_idx
  on public.transaction_document_access_grants (document_id)
  where document_id is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_request_idx
  on public.transaction_document_access_grants (document_request_id)
  where document_request_id is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_requirement_idx
  on public.transaction_document_access_grants (requirement_instance_id)
  where requirement_instance_id is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_participant_idx
  on public.transaction_document_access_grants (participant_id)
  where participant_id is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_user_idx
  on public.transaction_document_access_grants (user_id)
  where user_id is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_email_idx
  on public.transaction_document_access_grants (transaction_id, lower(email))
  where email is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_role_idx
  on public.transaction_document_access_grants (transaction_id, role_type, legal_role)
  where role_type is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_client_group_idx
  on public.transaction_document_access_grants (transaction_id, client_group)
  where client_group is not null and revoked_at is null;
create index if not exists transaction_document_access_grants_active_idx
  on public.transaction_document_access_grants (transaction_id, resource_type, grant_source)
  where revoked_at is null;

create or replace function public.bridge_validate_document_request_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_related_transaction_id uuid;
begin
  select dr.transaction_id
  into v_transaction_id
  from public.document_requests dr
  where dr.id = new.document_request_id;

  if v_transaction_id is null then
    raise exception 'document request target references a missing document request';
  end if;

  new.transaction_id := coalesce(new.transaction_id, v_transaction_id);

  if new.transaction_id <> v_transaction_id then
    raise exception 'document request target transaction does not match document request transaction';
  end if;

  if new.participant_id is not null then
    select tp.transaction_id
    into v_related_transaction_id
    from public.transaction_participants tp
    where tp.id = new.participant_id;

    if v_related_transaction_id is null or v_related_transaction_id <> new.transaction_id then
      raise exception 'document request target participant is not on this transaction';
    end if;
  end if;

  if new.completed_document_id is not null then
    select d.transaction_id
    into v_related_transaction_id
    from public.documents d
    where d.id = new.completed_document_id;

    if v_related_transaction_id is null or v_related_transaction_id <> new.transaction_id then
      raise exception 'document request target completion document is not on this transaction';
    end if;
  end if;

  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.role_type := public.bridge_document_permissions_normalize_role_type(new.role_type);
  new.legal_role := coalesce(
    public.bridge_document_permissions_normalize_legal_role(new.legal_role),
    new.legal_role
  );
  new.client_group := nullif(lower(btrim(coalesce(new.client_group, ''))), '');
  if TG_OP = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
  else
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_request_targets_validate on public.document_request_targets;
create trigger trg_document_request_targets_validate
before insert or update on public.document_request_targets
for each row
execute function public.bridge_validate_document_request_target();

create or replace function public.bridge_validate_transaction_document_access_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_transaction_id uuid;
begin
  if new.document_id is not null then
    select d.transaction_id
    into v_resource_transaction_id
    from public.documents d
    where d.id = new.document_id;
  elsif new.document_request_id is not null then
    select dr.transaction_id
    into v_resource_transaction_id
    from public.document_requests dr
    where dr.id = new.document_request_id;
  elsif new.requirement_instance_id is not null then
    select coalesce(
      dri.transaction_id,
      case when dri.context_type = 'transaction' then dri.context_id else null end
    )
    into v_resource_transaction_id
    from public.document_requirement_instances dri
    where dri.id = new.requirement_instance_id;
  end if;

  if v_resource_transaction_id is null then
    raise exception 'document access grant references a missing or non-transactional resource';
  end if;

  new.transaction_id := coalesce(new.transaction_id, v_resource_transaction_id);

  if new.transaction_id <> v_resource_transaction_id then
    raise exception 'document access grant transaction does not match resource transaction';
  end if;

  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.role_type := public.bridge_document_permissions_normalize_role_type(new.role_type);
  new.legal_role := coalesce(
    public.bridge_document_permissions_normalize_legal_role(new.legal_role),
    new.legal_role
  );
  new.client_group := nullif(lower(btrim(coalesce(new.client_group, ''))), '');
  if TG_OP = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
  else
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_document_access_grants_validate
  on public.transaction_document_access_grants;
create trigger trg_transaction_document_access_grants_validate
before insert or update on public.transaction_document_access_grants
for each row
execute function public.bridge_validate_transaction_document_access_grant();

create or replace function public.bridge_transaction_participant_can_request_documents(
  p_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_document_permissions_is_admin() then true
      when exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = p_transaction_id
          and tp.can_request_documents is true
          and tp.can_view is true
          and tp.removed_at is null
          and coalesce(tp.status, 'active') <> 'removed'
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) =
              public.bridge_document_permissions_current_user_email()
          )
      ) then true
      else false
    end
$$;

create or replace function public.bridge_document_request_target_matches_current_user(
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_request_targets target
    where target.id = p_target_id
      and auth.uid() is not null
      and (
        (
          target.target_type = 'participant'
          and exists (
            select 1
            from public.transaction_participants tp
            where tp.id = target.participant_id
              and tp.transaction_id = target.transaction_id
              and tp.can_view is true
              and tp.removed_at is null
              and coalesce(tp.status, 'active') <> 'removed'
              and (
                tp.user_id = auth.uid()
                or lower(coalesce(tp.participant_email, '')) =
                  public.bridge_document_permissions_current_user_email()
              )
          )
        )
        or (
          target.target_type = 'user'
          and target.user_id = auth.uid()
        )
        or (
          target.target_type = 'email'
          and target.email = public.bridge_document_permissions_current_user_email()
        )
        or (
          target.target_type = 'role'
          and exists (
            select 1
            from public.transaction_participants tp
            where tp.transaction_id = target.transaction_id
              and tp.can_view is true
              and tp.removed_at is null
              and coalesce(tp.status, 'active') <> 'removed'
              and lower(coalesce(tp.role_type, '')) = lower(coalesce(target.role_type, ''))
              and (
                target.legal_role is null
                or target.legal_role = 'none'
                or lower(coalesce(tp.legal_role, 'none')) = lower(target.legal_role)
              )
              and (
                tp.user_id = auth.uid()
                or lower(coalesce(tp.participant_email, '')) =
                  public.bridge_document_permissions_current_user_email()
              )
          )
        )
        or (
          target.target_type = 'client_group'
          and exists (
            select 1
            from public.transaction_participants tp
            where tp.transaction_id = target.transaction_id
              and tp.can_view is true
              and tp.removed_at is null
              and coalesce(tp.status, 'active') <> 'removed'
              and (
                tp.user_id = auth.uid()
                or lower(coalesce(tp.participant_email, '')) =
                  public.bridge_document_permissions_current_user_email()
              )
              and (
                target.client_group in ('client', 'all_clients')
                and tp.role_type in ('client', 'buyer', 'seller')
                or target.client_group = 'buyer'
                and tp.role_type in ('client', 'buyer')
                or target.client_group = 'seller'
                and tp.role_type = 'seller'
                or target.client_group = 'buyer_and_seller'
                and tp.role_type in ('client', 'buyer', 'seller')
              )
          )
        )
        or (
          target.target_type = 'professional_group'
          and exists (
            select 1
            from public.transaction_participants tp
            where tp.transaction_id = target.transaction_id
              and tp.can_view is true
              and tp.removed_at is null
              and coalesce(tp.status, 'active') <> 'removed'
              and coalesce(tp.role_type, '') not in ('client', 'buyer', 'seller')
              and (
                tp.user_id = auth.uid()
                or lower(coalesce(tp.participant_email, '')) =
                  public.bridge_document_permissions_current_user_email()
              )
          )
        )
      )
  )
$$;

create or replace function public.bridge_has_transaction_document_grant(
  p_transaction_id uuid,
  p_document_id uuid default null,
  p_document_request_id uuid default null,
  p_requirement_instance_id uuid default null,
  p_action text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_document_permissions_is_admin() then true
      else exists (
        select 1
        from public.transaction_document_access_grants grant_row
        where grant_row.transaction_id = p_transaction_id
          and grant_row.revoked_at is null
          and (
            grant_row.expires_at is null
            or grant_row.expires_at > now()
          )
          and (
            (p_document_id is not null and grant_row.document_id = p_document_id)
            or (
              p_document_request_id is not null
              and grant_row.document_request_id = p_document_request_id
            )
            or (
              p_requirement_instance_id is not null
              and grant_row.requirement_instance_id = p_requirement_instance_id
            )
          )
          and case lower(coalesce(p_action, 'view'))
            when 'download' then grant_row.can_download is true or grant_row.can_manage is true
            when 'upload' then grant_row.can_upload is true or grant_row.can_manage is true
            when 'review' then grant_row.can_review is true or grant_row.can_manage is true
            when 'manage' then grant_row.can_manage is true
            else (
              grant_row.can_view is true
              or grant_row.can_download is true
              or grant_row.can_upload is true
              or grant_row.can_review is true
              or grant_row.can_manage is true
            )
          end
          and (
            (
              grant_row.principal_type = 'participant'
              and exists (
                select 1
                from public.transaction_participants tp
                where tp.id = grant_row.participant_id
                  and tp.transaction_id = grant_row.transaction_id
                  and tp.can_view is true
                  and tp.removed_at is null
                  and coalesce(tp.status, 'active') <> 'removed'
                  and (
                    tp.user_id = auth.uid()
                    or lower(coalesce(tp.participant_email, '')) =
                      public.bridge_document_permissions_current_user_email()
                  )
              )
            )
            or (
              grant_row.principal_type = 'user'
              and grant_row.user_id = auth.uid()
            )
            or (
              grant_row.principal_type = 'email'
              and grant_row.email = public.bridge_document_permissions_current_user_email()
            )
            or (
              grant_row.principal_type = 'role'
              and exists (
                select 1
                from public.transaction_participants tp
                where tp.transaction_id = grant_row.transaction_id
                  and tp.can_view is true
                  and tp.removed_at is null
                  and coalesce(tp.status, 'active') <> 'removed'
                  and lower(coalesce(tp.role_type, '')) = lower(coalesce(grant_row.role_type, ''))
                  and (
                    grant_row.legal_role is null
                    or grant_row.legal_role = 'none'
                    or lower(coalesce(tp.legal_role, 'none')) = lower(grant_row.legal_role)
                  )
                  and (
                    tp.user_id = auth.uid()
                    or lower(coalesce(tp.participant_email, '')) =
                      public.bridge_document_permissions_current_user_email()
                  )
              )
            )
            or (
              grant_row.principal_type = 'client_group'
              and exists (
                select 1
                from public.transaction_participants tp
                where tp.transaction_id = grant_row.transaction_id
                  and tp.can_view is true
                  and tp.removed_at is null
                  and coalesce(tp.status, 'active') <> 'removed'
                  and (
                    tp.user_id = auth.uid()
                    or lower(coalesce(tp.participant_email, '')) =
                      public.bridge_document_permissions_current_user_email()
                  )
                  and (
                    grant_row.client_group in ('client', 'all_clients')
                    and tp.role_type in ('client', 'buyer', 'seller')
                    or grant_row.client_group = 'buyer'
                    and tp.role_type in ('client', 'buyer')
                    or grant_row.client_group = 'seller'
                    and tp.role_type = 'seller'
                    or grant_row.client_group = 'buyer_and_seller'
                    and tp.role_type in ('client', 'buyer', 'seller')
                  )
              )
            )
            or (
              grant_row.principal_type = 'professional_group'
              and exists (
                select 1
                from public.transaction_participants tp
                where tp.transaction_id = grant_row.transaction_id
                  and tp.can_view is true
                  and tp.removed_at is null
                  and coalesce(tp.status, 'active') <> 'removed'
                  and coalesce(tp.role_type, '') not in ('client', 'buyer', 'seller')
                  and (
                    tp.user_id = auth.uid()
                    or lower(coalesce(tp.participant_email, '')) =
                      public.bridge_document_permissions_current_user_email()
                  )
              )
            )
          )
      )
    end
$$;

create or replace function public.bridge_can_access_document_request(
  p_document_request_id uuid,
  p_action text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_document_permissions_is_admin() then true
      when exists (
        select 1
        from public.document_requests dr
        where dr.id = p_document_request_id
          and public.bridge_has_transaction_document_grant(
            dr.transaction_id,
            null,
            dr.id,
            null,
            p_action
          )
      ) then true
      when lower(coalesce(p_action, 'view')) = 'manage' then exists (
        select 1
        from public.document_requests dr
        where dr.id = p_document_request_id
          and public.bridge_transaction_participant_can_request_documents(dr.transaction_id)
      )
      when lower(coalesce(p_action, 'view')) = 'upload' then exists (
        select 1
        from public.document_request_targets target
        where target.document_request_id = p_document_request_id
          and target.can_upload is true
          and public.bridge_document_request_target_matches_current_user(target.id)
      )
      else exists (
        select 1
        from public.document_requests dr
        where dr.id = p_document_request_id
          and public.bridge_document_permissions_has_transaction_access(dr.transaction_id)
      )
    end
$$;

create or replace function public.bridge_can_access_transaction_document(
  p_document_id uuid,
  p_action text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_document_permissions_is_admin() then true
      else exists (
        select 1
        from public.documents d
        where d.id = p_document_id
          and public.bridge_has_transaction_document_grant(
            d.transaction_id,
            d.id,
            null,
            null,
            p_action
          )
      )
    end
$$;

insert into public.document_request_targets (
  document_request_id,
  transaction_id,
  target_type,
  user_id,
  role_type,
  legal_role,
  client_group,
  display_name,
  status,
  completed_document_id,
  completed_at,
  created_by,
  created_at,
  updated_at
)
select
  dr.id,
  dr.transaction_id,
  case
    when dr.assigned_to_user_id is not null then 'user'
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then 'client_group'
    else 'role'
  end,
  dr.assigned_to_user_id,
  case
    when dr.assigned_to_user_id is not null then null
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then null
    else public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
  end,
  case
    when dr.assigned_to_user_id is not null then null
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then null
    else public.bridge_document_permissions_normalize_legal_role(dr.assigned_to_role)
  end,
  case
    when dr.assigned_to_user_id is not null then null
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then
      case public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
        when 'buyer_and_seller' then 'buyer_and_seller'
        when 'buyer' then 'buyer'
        when 'seller' then 'seller'
        else 'client'
      end
    else null
  end,
  dr.assigned_to_role,
  case dr.status
    when 'uploaded' then 'uploaded'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    when 'rejected' then 'declined'
    else 'requested'
  end,
  case
    when exists (
      select 1
      from public.documents requested_document
      where requested_document.id = dr.requested_document_id
        and requested_document.transaction_id = dr.transaction_id
    ) then dr.requested_document_id
    else null
  end,
  dr.completed_at,
  case
    when exists (
      select 1
      from public.profiles creator_profile
      where creator_profile.id = dr.created_by
    ) then dr.created_by
    else null
  end,
  coalesce(dr.created_at, now()),
  coalesce(dr.updated_at, now())
from public.document_requests dr
where dr.transaction_id is not null
  and (
    dr.assigned_to_user_id is not null
    or nullif(btrim(coalesce(dr.assigned_to_role, '')), '') is not null
  )
  and (
    dr.assigned_to_user_id is null
    or exists (
      select 1
      from public.profiles assigned_profile
      where assigned_profile.id = dr.assigned_to_user_id
    )
  )
  and not exists (
    select 1
    from public.document_request_targets existing
    where existing.document_request_id = dr.id
      and (
        (dr.assigned_to_user_id is not null and existing.user_id = dr.assigned_to_user_id)
        or (
          dr.assigned_to_user_id is null
          and public.bridge_document_permissions_role_is_client(dr.assigned_to_role)
          and existing.client_group = case public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
            when 'buyer_and_seller' then 'buyer_and_seller'
            when 'buyer' then 'buyer'
            when 'seller' then 'seller'
            else 'client'
          end
        )
        or (
          dr.assigned_to_user_id is null
          and not public.bridge_document_permissions_role_is_client(dr.assigned_to_role)
          and existing.role_type = public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
          and coalesce(existing.legal_role, '') =
            coalesce(public.bridge_document_permissions_normalize_legal_role(dr.assigned_to_role), '')
        )
      )
  );

insert into public.transaction_document_access_grants (
  transaction_id,
  resource_type,
  document_request_id,
  principal_type,
  user_id,
  can_view,
  can_download,
  can_manage,
  grant_source,
  source_detail,
  granted_by,
  created_at,
  updated_at
)
select
  dr.transaction_id,
  'document_request',
  dr.id,
  'user',
  case
    when exists (
      select 1
      from public.profiles creator_profile
      where creator_profile.id = dr.created_by
    ) then dr.created_by
    else null
  end,
  true,
  true,
  true,
  'backfill',
  'existing_request_creator',
  dr.created_by,
  coalesce(dr.created_at, now()),
  coalesce(dr.updated_at, now())
from public.document_requests dr
where dr.transaction_id is not null
  and dr.created_by is not null
  and exists (
    select 1
    from public.profiles creator_profile
    where creator_profile.id = dr.created_by
  )
  and not exists (
    select 1
    from public.transaction_document_access_grants existing
    where existing.document_request_id = dr.id
      and existing.principal_type = 'user'
      and existing.user_id = dr.created_by
      and existing.revoked_at is null
  );

insert into public.transaction_document_access_grants (
  transaction_id,
  resource_type,
  document_request_id,
  principal_type,
  user_id,
  role_type,
  legal_role,
  client_group,
  can_view,
  can_upload,
  grant_source,
  source_detail,
  granted_by,
  created_at,
  updated_at
)
select
  dr.transaction_id,
  'document_request',
  dr.id,
  case
    when dr.assigned_to_user_id is not null then 'user'
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then 'client_group'
    else 'role'
  end,
  dr.assigned_to_user_id,
  case
    when dr.assigned_to_user_id is not null then null
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then null
    else public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
  end,
  case
    when dr.assigned_to_user_id is not null then null
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then null
    else public.bridge_document_permissions_normalize_legal_role(dr.assigned_to_role)
  end,
  case
    when dr.assigned_to_user_id is not null then null
    when public.bridge_document_permissions_role_is_client(dr.assigned_to_role) then
      case public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
        when 'buyer_and_seller' then 'buyer_and_seller'
        when 'buyer' then 'buyer'
        when 'seller' then 'seller'
        else 'client'
      end
    else null
  end,
  true,
  true,
  'backfill',
  'existing_request_assignee',
  case
    when exists (
      select 1
      from public.profiles creator_profile
      where creator_profile.id = dr.created_by
    ) then dr.created_by
    else null
  end,
  coalesce(dr.created_at, now()),
  coalesce(dr.updated_at, now())
from public.document_requests dr
where dr.transaction_id is not null
  and (
    dr.assigned_to_user_id is not null
    or nullif(btrim(coalesce(dr.assigned_to_role, '')), '') is not null
  )
  and (
    dr.assigned_to_user_id is null
    or exists (
      select 1
      from public.profiles assigned_profile
      where assigned_profile.id = dr.assigned_to_user_id
    )
  )
  and not exists (
    select 1
    from public.transaction_document_access_grants existing
    where existing.document_request_id = dr.id
      and existing.revoked_at is null
      and (
        (
          dr.assigned_to_user_id is not null
          and existing.principal_type = 'user'
          and existing.user_id = dr.assigned_to_user_id
        )
        or (
          dr.assigned_to_user_id is null
          and public.bridge_document_permissions_role_is_client(dr.assigned_to_role)
          and existing.principal_type = 'client_group'
          and existing.client_group = case public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
            when 'buyer_and_seller' then 'buyer_and_seller'
            when 'buyer' then 'buyer'
            when 'seller' then 'seller'
            else 'client'
          end
        )
        or (
          dr.assigned_to_user_id is null
          and not public.bridge_document_permissions_role_is_client(dr.assigned_to_role)
          and existing.principal_type = 'role'
          and existing.role_type = public.bridge_document_permissions_normalize_role_type(dr.assigned_to_role)
          and coalesce(existing.legal_role, '') =
            coalesce(public.bridge_document_permissions_normalize_legal_role(dr.assigned_to_role), '')
        )
      )
  );

insert into public.transaction_document_access_grants (
  transaction_id,
  resource_type,
  document_id,
  principal_type,
  user_id,
  can_view,
  can_download,
  grant_source,
  source_detail,
  granted_by,
  created_at,
  updated_at
)
select
  dr.transaction_id,
  'document',
  dr.requested_document_id,
  'user',
  dr.created_by,
  true,
  true,
  'backfill',
  'existing_request_creator_uploaded_document',
  dr.created_by,
  coalesce(dr.completed_at, dr.updated_at, dr.created_at, now()),
  coalesce(dr.updated_at, now())
from public.document_requests dr
where dr.transaction_id is not null
  and dr.created_by is not null
  and dr.requested_document_id is not null
  and exists (
    select 1
    from public.documents requested_document
    where requested_document.id = dr.requested_document_id
      and requested_document.transaction_id = dr.transaction_id
  )
  and exists (
    select 1
    from public.profiles creator_profile
    where creator_profile.id = dr.created_by
  )
  and not exists (
    select 1
    from public.transaction_document_access_grants existing
    where existing.document_id = dr.requested_document_id
      and existing.principal_type = 'user'
      and existing.user_id = dr.created_by
      and existing.revoked_at is null
  );

insert into public.transaction_document_access_grants (
  transaction_id,
  resource_type,
  requirement_instance_id,
  principal_type,
  role_type,
  legal_role,
  client_group,
  can_view,
  can_download,
  grant_source,
  source_detail,
  created_at,
  updated_at
)
select
  coalesce(dri.transaction_id, case when dri.context_type = 'transaction' then dri.context_id else null end),
  'requirement_instance',
  dri.id,
  case
    when public.bridge_document_permissions_role_is_client(visible_role.role_value) then 'client_group'
    else 'role'
  end,
  case
    when public.bridge_document_permissions_role_is_client(visible_role.role_value) then null
    else public.bridge_document_permissions_normalize_role_type(visible_role.role_value)
  end,
  case
    when public.bridge_document_permissions_role_is_client(visible_role.role_value) then null
    else public.bridge_document_permissions_normalize_legal_role(visible_role.role_value)
  end,
  case
    when public.bridge_document_permissions_role_is_client(visible_role.role_value) then
      case public.bridge_document_permissions_normalize_role_type(visible_role.role_value)
        when 'buyer_and_seller' then 'buyer_and_seller'
        when 'buyer' then 'buyer'
        when 'seller' then 'seller'
        else 'client'
      end
    else null
  end,
  true,
  true,
  'requirement_policy',
  'canonical_visible_to_roles',
  coalesce(dri.created_at, now()),
  coalesce(dri.updated_at, now())
from public.document_requirement_instances dri
cross join lateral unnest(coalesce(dri.visible_to_roles, '{}'::text[])) as visible_role(role_value)
where coalesce(dri.transaction_id, case when dri.context_type = 'transaction' then dri.context_id else null end) is not null
  and nullif(btrim(coalesce(visible_role.role_value, '')), '') is not null
  and not exists (
    select 1
    from public.transaction_document_access_grants existing
    where existing.requirement_instance_id = dri.id
      and existing.revoked_at is null
      and existing.grant_source = 'requirement_policy'
      and (
        (
          public.bridge_document_permissions_role_is_client(visible_role.role_value)
          and existing.principal_type = 'client_group'
          and existing.client_group = case public.bridge_document_permissions_normalize_role_type(visible_role.role_value)
            when 'buyer_and_seller' then 'buyer_and_seller'
            when 'buyer' then 'buyer'
            when 'seller' then 'seller'
            else 'client'
          end
        )
        or (
          not public.bridge_document_permissions_role_is_client(visible_role.role_value)
          and existing.principal_type = 'role'
          and existing.role_type = public.bridge_document_permissions_normalize_role_type(visible_role.role_value)
          and coalesce(existing.legal_role, '') =
            coalesce(public.bridge_document_permissions_normalize_legal_role(visible_role.role_value), '')
        )
      )
  );

insert into public.transaction_document_access_grants (
  transaction_id,
  resource_type,
  requirement_instance_id,
  principal_type,
  role_type,
  legal_role,
  client_group,
  can_view,
  can_upload,
  grant_source,
  source_detail,
  created_at,
  updated_at
)
select
  coalesce(dri.transaction_id, case when dri.context_type = 'transaction' then dri.context_id else null end),
  'requirement_instance',
  dri.id,
  case
    when public.bridge_document_permissions_role_is_client(upload_role.role_value) then 'client_group'
    else 'role'
  end,
  case
    when public.bridge_document_permissions_role_is_client(upload_role.role_value) then null
    else public.bridge_document_permissions_normalize_role_type(upload_role.role_value)
  end,
  case
    when public.bridge_document_permissions_role_is_client(upload_role.role_value) then null
    else public.bridge_document_permissions_normalize_legal_role(upload_role.role_value)
  end,
  case
    when public.bridge_document_permissions_role_is_client(upload_role.role_value) then
      case public.bridge_document_permissions_normalize_role_type(upload_role.role_value)
        when 'buyer_and_seller' then 'buyer_and_seller'
        when 'buyer' then 'buyer'
        when 'seller' then 'seller'
        else 'client'
      end
    else null
  end,
  true,
  true,
  'requirement_policy',
  'canonical_uploadable_by_roles',
  coalesce(dri.created_at, now()),
  coalesce(dri.updated_at, now())
from public.document_requirement_instances dri
cross join lateral unnest(
  case
    when cardinality(coalesce(dri.uploadable_by_roles, '{}'::text[])) > 0 then dri.uploadable_by_roles
    when nullif(btrim(coalesce(dri.requested_from_role, '')), '') is not null then
      array[dri.requested_from_role]::text[]
    else '{}'::text[]
  end
) as upload_role(role_value)
where coalesce(dri.transaction_id, case when dri.context_type = 'transaction' then dri.context_id else null end) is not null
  and nullif(btrim(coalesce(upload_role.role_value, '')), '') is not null
  and not exists (
    select 1
    from public.transaction_document_access_grants existing
    where existing.requirement_instance_id = dri.id
      and existing.revoked_at is null
      and existing.grant_source = 'requirement_policy'
      and existing.can_upload is true
      and (
        (
          public.bridge_document_permissions_role_is_client(upload_role.role_value)
          and existing.principal_type = 'client_group'
          and existing.client_group = case public.bridge_document_permissions_normalize_role_type(upload_role.role_value)
            when 'buyer_and_seller' then 'buyer_and_seller'
            when 'buyer' then 'buyer'
            when 'seller' then 'seller'
            else 'client'
          end
        )
        or (
          not public.bridge_document_permissions_role_is_client(upload_role.role_value)
          and existing.principal_type = 'role'
          and existing.role_type = public.bridge_document_permissions_normalize_role_type(upload_role.role_value)
          and coalesce(existing.legal_role, '') =
            coalesce(public.bridge_document_permissions_normalize_legal_role(upload_role.role_value), '')
        )
      )
  );

alter table public.document_request_targets enable row level security;
alter table public.transaction_document_access_grants enable row level security;

drop policy if exists document_request_targets_select_scoped on public.document_request_targets;
create policy document_request_targets_select_scoped on public.document_request_targets
for select to authenticated
using (
  public.bridge_can_access_document_request(document_request_id, 'view')
  or public.bridge_document_request_target_matches_current_user(id)
);

drop policy if exists document_request_targets_insert_scoped on public.document_request_targets;
create policy document_request_targets_insert_scoped on public.document_request_targets
for insert to authenticated
with check (
  public.bridge_can_access_document_request(document_request_id, 'manage')
);

drop policy if exists document_request_targets_update_scoped on public.document_request_targets;
create policy document_request_targets_update_scoped on public.document_request_targets
for update to authenticated
using (
  public.bridge_can_access_document_request(document_request_id, 'manage')
  or public.bridge_document_request_target_matches_current_user(id)
)
with check (
  public.bridge_can_access_document_request(document_request_id, 'manage')
  or public.bridge_document_request_target_matches_current_user(id)
);

drop policy if exists document_request_targets_delete_scoped on public.document_request_targets;
create policy document_request_targets_delete_scoped on public.document_request_targets
for delete to authenticated
using (
  public.bridge_can_access_document_request(document_request_id, 'manage')
);

drop policy if exists transaction_document_access_grants_select_scoped
  on public.transaction_document_access_grants;
create policy transaction_document_access_grants_select_scoped
on public.transaction_document_access_grants
for select to authenticated
using (
  public.bridge_transaction_participant_can_request_documents(transaction_id)
  or public.bridge_has_transaction_document_grant(
    transaction_id,
    document_id,
    document_request_id,
    requirement_instance_id,
    'view'
  )
);

drop policy if exists transaction_document_access_grants_insert_scoped
  on public.transaction_document_access_grants;
create policy transaction_document_access_grants_insert_scoped
on public.transaction_document_access_grants
for insert to authenticated
with check (
  public.bridge_transaction_participant_can_request_documents(transaction_id)
  or public.bridge_has_transaction_document_grant(
    transaction_id,
    document_id,
    document_request_id,
    requirement_instance_id,
    'manage'
  )
);

drop policy if exists transaction_document_access_grants_update_scoped
  on public.transaction_document_access_grants;
create policy transaction_document_access_grants_update_scoped
on public.transaction_document_access_grants
for update to authenticated
using (
  public.bridge_transaction_participant_can_request_documents(transaction_id)
  or public.bridge_has_transaction_document_grant(
    transaction_id,
    document_id,
    document_request_id,
    requirement_instance_id,
    'manage'
  )
)
with check (
  public.bridge_transaction_participant_can_request_documents(transaction_id)
  or public.bridge_has_transaction_document_grant(
    transaction_id,
    document_id,
    document_request_id,
    requirement_instance_id,
    'manage'
  )
);

drop policy if exists transaction_document_access_grants_delete_scoped
  on public.transaction_document_access_grants;
create policy transaction_document_access_grants_delete_scoped
on public.transaction_document_access_grants
for delete to authenticated
using (
  public.bridge_transaction_participant_can_request_documents(transaction_id)
  or public.bridge_has_transaction_document_grant(
    transaction_id,
    document_id,
    document_request_id,
    requirement_instance_id,
    'manage'
  )
);

grant select, insert, update, delete on public.document_request_targets to authenticated;
grant select, insert, update, delete on public.transaction_document_access_grants to authenticated;
grant all on public.document_request_targets to service_role;
grant all on public.transaction_document_access_grants to service_role;

grant execute on function public.bridge_document_permissions_current_user_email() to authenticated, service_role;
grant execute on function public.bridge_document_permissions_current_profile_role() to authenticated, service_role;
grant execute on function public.bridge_document_permissions_is_admin() to authenticated, service_role;
grant execute on function public.bridge_document_permissions_is_internal_user() to authenticated, service_role;
grant execute on function public.bridge_document_permissions_normalize_role_type(text) to authenticated, service_role;
grant execute on function public.bridge_document_permissions_normalize_legal_role(text) to authenticated, service_role;
grant execute on function public.bridge_document_permissions_role_is_client(text) to authenticated, service_role;
grant execute on function public.bridge_document_permissions_has_transaction_access(uuid) to authenticated, service_role;
grant execute on function public.bridge_transaction_participant_can_request_documents(uuid) to authenticated, service_role;
grant execute on function public.bridge_document_request_target_matches_current_user(uuid) to authenticated, service_role;
grant execute on function public.bridge_has_transaction_document_grant(uuid, uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.bridge_can_access_document_request(uuid, text) to authenticated, service_role;
grant execute on function public.bridge_can_access_transaction_document(uuid, text) to authenticated, service_role;

comment on column public.transaction_participants.can_request_documents is
  'Allows an active transaction participant to create ad-hoc document requests and manage request-specific access grants.';
comment on table public.document_request_targets is
  'Explicit upload targets for document requests. Replaces overloading document_requests.assigned_to_role for multi-target requests.';
comment on table public.transaction_document_access_grants is
  'Per-document, per-document-request, and per-canonical-requirement access grants used for scoped view/download/upload/review/manage decisions.';
comment on function public.bridge_transaction_participant_can_request_documents(uuid) is
  'Returns true when the current authenticated user is an admin or an active transaction participant with can_request_documents.';
comment on function public.bridge_has_transaction_document_grant(uuid, uuid, uuid, uuid, text) is
  'Checks whether the current authenticated user matches an active document access grant for the requested action.';

notify pgrst, 'reload schema';

commit;
