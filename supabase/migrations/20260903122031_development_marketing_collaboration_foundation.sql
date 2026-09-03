begin;

-- Marketing collaboration is intentionally separate from development operations.
-- A marketing invitation never creates a development_organisation_relationships row
-- and therefore cannot expose inventory, finance or transaction workspaces.

alter table if exists public.development_documents
  add column if not exists approval_status text not null default 'approved',
  add column if not exists visibility text not null default 'internal',
  add column if not exists version integer not null default 1,
  add column if not exists supersedes_document_id uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint;

-- Preserve every legacy URL and make existing collateral private by default.
update public.development_documents
set
  approval_status = coalesce(nullif(btrim(approval_status), ''), 'approved'),
  visibility = coalesce(nullif(btrim(visibility), ''), 'internal'),
  version = greatest(coalesce(version, 1), 1)
where approval_status is null
   or btrim(approval_status) = ''
   or visibility is null
   or btrim(visibility) = ''
   or version is null
   or version < 1;

do $$
begin
  if to_regclass('public.development_documents') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.development_documents'::regclass
        and conname = 'development_documents_approval_status_check'
    ) then
    alter table public.development_documents
      add constraint development_documents_approval_status_check
      check (approval_status in ('draft', 'pending_approval', 'approved', 'rejected'));
  end if;

  if to_regclass('public.development_documents') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.development_documents'::regclass
        and conname = 'development_documents_visibility_check'
    ) then
    alter table public.development_documents
      add constraint development_documents_visibility_check
      check (visibility in ('internal', 'partner', 'public'));
  end if;

  if to_regclass('public.development_documents') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.development_documents'::regclass
        and conname = 'development_documents_version_check'
    ) then
    alter table public.development_documents
      add constraint development_documents_version_check
      check (version >= 1);
  end if;

  if to_regclass('public.development_documents') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.development_documents'::regclass
        and conname = 'development_documents_file_size_check'
    ) then
    alter table public.development_documents
      add constraint development_documents_file_size_check
      check (file_size_bytes is null or file_size_bytes >= 0);
  end if;

  if to_regclass('public.development_documents') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.development_documents'::regclass
        and conname = 'development_documents_supersedes_document_id_fkey'
    ) then
    alter table public.development_documents
      add constraint development_documents_supersedes_document_id_fkey
      foreign key (supersedes_document_id)
      references public.development_documents(id)
      on delete set null;
  end if;
end $$;

create index if not exists development_documents_marketing_library_idx
  on public.development_documents (development_id, visibility, approval_status, created_at desc)
  where archived_at is null;
create index if not exists development_documents_supersedes_document_idx
  on public.development_documents (supersedes_document_id)
  where supersedes_document_id is not null;

create table if not exists public.development_marketing_access (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invitee_email text,
  access_role text not null default 'viewer',
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_marketing_access_recipient_check
    check (num_nonnulls(organisation_id, user_id, invitee_email) = 1),
  constraint development_marketing_access_role_check
    check (access_role in ('viewer', 'contributor', 'approver')),
  constraint development_marketing_access_status_check
    check (status in ('pending', 'active', 'revoked', 'expired')),
  constraint development_marketing_access_invitee_email_check
    check (invitee_email is null or invitee_email = lower(btrim(invitee_email)))
);

create unique index if not exists development_marketing_access_active_organisation_unique
  on public.development_marketing_access (development_id, organisation_id)
  where organisation_id is not null and status in ('pending', 'active');
create unique index if not exists development_marketing_access_active_user_unique
  on public.development_marketing_access (development_id, user_id)
  where user_id is not null and status in ('pending', 'active');
create unique index if not exists development_marketing_access_active_email_unique
  on public.development_marketing_access (development_id, lower(invitee_email))
  where invitee_email is not null and status in ('pending', 'active');
create index if not exists development_marketing_access_recipient_lookup_idx
  on public.development_marketing_access (user_id, status, expires_at)
  where user_id is not null;
create index if not exists development_marketing_access_organisation_lookup_idx
  on public.development_marketing_access (organisation_id, status, expires_at)
  where organisation_id is not null;

create table if not exists public.development_marketing_activity (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  development_document_id uuid references public.development_documents(id) on delete set null,
  marketing_access_id uuid references public.development_marketing_access(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint development_marketing_activity_action_check check (
    action_type in (
      'document_uploaded', 'document_updated', 'document_approved', 'document_archived',
      'document_downloaded', 'document_shared', 'access_invited', 'access_granted',
      'access_accepted', 'access_revoked', 'event_created', 'event_updated', 'event_cancelled'
    )
  ),
  constraint development_marketing_activity_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists development_marketing_activity_development_recent_idx
  on public.development_marketing_activity (development_id, occurred_at desc);
create index if not exists development_marketing_activity_document_idx
  on public.development_marketing_activity (development_document_id, occurred_at desc)
  where development_document_id is not null;
create index if not exists development_marketing_activity_access_idx
  on public.development_marketing_activity (marketing_access_id, occurred_at desc)
  where marketing_access_id is not null;

create or replace function public.bridge_touch_development_marketing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_development_marketing_access_updated_at on public.development_marketing_access;
create trigger trg_development_marketing_access_updated_at
before update on public.development_marketing_access
for each row execute function public.bridge_touch_development_marketing_updated_at();

-- These helpers consult only the dedicated marketing table. They deliberately
-- do not call, create or upgrade operational development relationships.
create or replace function public.bridge_has_development_marketing_access(
  target_development_id uuid,
  allowed_roles text[] default array['viewer', 'contributor', 'approver']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.development_marketing_access access_row
      where access_row.development_id = target_development_id
        and access_row.status = 'active'
        and (access_row.expires_at is null or access_row.expires_at > now())
        and access_row.access_role = any(allowed_roles)
        and (
          access_row.user_id = (select auth.uid())
          or lower(coalesce(access_row.invitee_email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
          or exists (
            select 1
            from public.organisation_users membership
            where membership.organisation_id = access_row.organisation_id
              and membership.user_id = (select auth.uid())
              and membership.status = 'active'
          )
        )
    ),
    false
  );
$$;

revoke all on function public.bridge_has_development_marketing_access(uuid, text[]) from public, anon;
grant execute on function public.bridge_has_development_marketing_access(uuid, text[]) to authenticated;

create or replace function public.bridge_log_development_document_marketing_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'document_uploaded';
  elsif new.archived_at is distinct from old.archived_at and new.archived_at is not null then
    v_action := 'document_archived';
  elsif new.approval_status is distinct from old.approval_status and new.approval_status = 'approved' then
    v_action := 'document_approved';
  else
    v_action := 'document_updated';
  end if;

  insert into public.development_marketing_activity (
    development_id,
    development_document_id,
    actor_user_id,
    action_type,
    metadata
  ) values (
    new.development_id,
    new.id,
    (select auth.uid()),
    v_action,
    jsonb_build_object('document_type', new.document_type, 'title', new.title, 'version', new.version)
  );
  return new;
end;
$$;

revoke all on function public.bridge_log_development_document_marketing_activity() from public, anon, authenticated;

drop trigger if exists trg_development_document_marketing_activity on public.development_documents;
create trigger trg_development_document_marketing_activity
after insert or update of approval_status, visibility, version, supersedes_document_id, archived_at, file_url, title, description
on public.development_documents
for each row execute function public.bridge_log_development_document_marketing_activity();

create or replace function public.bridge_log_development_marketing_access_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.status = 'active' then 'access_granted' else 'access_invited' end;
  elsif new.status is distinct from old.status and new.status = 'active' then
    v_action := 'access_accepted';
  elsif new.status is distinct from old.status and new.status in ('revoked', 'expired') then
    v_action := 'access_revoked';
  else
    return new;
  end if;

  insert into public.development_marketing_activity (
    development_id,
    marketing_access_id,
    actor_user_id,
    action_type,
    metadata
  ) values (
    new.development_id,
    new.id,
    (select auth.uid()),
    v_action,
    jsonb_build_object('access_role', new.access_role, 'status', new.status)
  );
  return new;
end;
$$;

revoke all on function public.bridge_log_development_marketing_access_activity() from public, anon, authenticated;

drop trigger if exists trg_development_marketing_access_activity on public.development_marketing_access;
create trigger trg_development_marketing_access_activity
after insert or update of status on public.development_marketing_access
for each row execute function public.bridge_log_development_marketing_access_activity();

alter table public.development_marketing_access enable row level security;
alter table public.development_marketing_activity enable row level security;

revoke all on table public.development_marketing_access, public.development_marketing_activity from anon, authenticated;
grant select, insert, update, delete on table public.development_marketing_access to authenticated;
grant select, insert on table public.development_marketing_activity to authenticated;

drop policy if exists development_marketing_access_select_scoped on public.development_marketing_access;
create policy development_marketing_access_select_scoped
on public.development_marketing_access
for select to authenticated
using (
  public.bridge_can_manage_development_record(development_id)
  or user_id = (select auth.uid())
  or lower(coalesce(invitee_email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or exists (
    select 1 from public.organisation_users membership
    where membership.organisation_id = development_marketing_access.organisation_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
);

drop policy if exists development_marketing_access_insert_scoped on public.development_marketing_access;
create policy development_marketing_access_insert_scoped
on public.development_marketing_access
for insert to authenticated
with check (
  public.bridge_can_manage_development_record(development_id)
  and (invited_by is null or invited_by = (select auth.uid()))
);

drop policy if exists development_marketing_access_update_scoped on public.development_marketing_access;
create policy development_marketing_access_update_scoped
on public.development_marketing_access
for update to authenticated
using (public.bridge_can_manage_development_record(development_id))
with check (public.bridge_can_manage_development_record(development_id));

drop policy if exists development_marketing_access_delete_scoped on public.development_marketing_access;
create policy development_marketing_access_delete_scoped
on public.development_marketing_access
for delete to authenticated
using (public.bridge_can_manage_development_record(development_id));

drop policy if exists development_marketing_activity_select_scoped on public.development_marketing_activity;
create policy development_marketing_activity_select_scoped
on public.development_marketing_activity
for select to authenticated
using (public.bridge_can_manage_development_record(development_id));

drop policy if exists development_marketing_activity_insert_scoped on public.development_marketing_activity;
create policy development_marketing_activity_insert_scoped
on public.development_marketing_activity
for insert to authenticated
with check (
  public.bridge_can_manage_development_record(development_id)
  or (
    public.bridge_has_development_marketing_access(development_id)
    and action_type in ('document_downloaded', 'document_shared')
  )
);

-- Preserve operational document access. Marketing participants only receive
-- approved, non-archived assets explicitly made partner/public visible.
drop policy if exists development_documents_select_scoped on public.development_documents;
create policy development_documents_select_scoped
on public.development_documents
for select to authenticated
using (
  public.bridge_can_view_development_record(development_id)
  or (
    public.bridge_has_development_marketing_access(development_id)
    and visibility in ('partner', 'public')
    and approval_status = 'approved'
    and archived_at is null
  )
  or (
    public.bridge_has_development_marketing_access(development_id, array['approver']::text[])
    and visibility in ('partner', 'public')
    and archived_at is null
  )
);

drop policy if exists development_documents_insert_scoped on public.development_documents;
create policy development_documents_insert_scoped
on public.development_documents
for insert to authenticated
with check (
  public.bridge_can_manage_development_record(development_id)
  or (
    public.bridge_has_development_marketing_access(development_id, array['contributor', 'approver']::text[])
    and visibility = 'partner'
    and approval_status in ('draft', 'pending_approval')
  )
);

drop policy if exists development_documents_update_scoped on public.development_documents;
create policy development_documents_update_scoped
on public.development_documents
for update to authenticated
using (
  public.bridge_can_manage_development_record(development_id)
  or (
    public.bridge_has_development_marketing_access(development_id, array['approver']::text[])
    and visibility in ('partner', 'public')
    and archived_at is null
  )
)
with check (
  public.bridge_can_manage_development_record(development_id)
  or public.bridge_has_development_marketing_access(development_id, array['approver']::text[])
);

drop policy if exists development_documents_delete_scoped on public.development_documents;
create policy development_documents_delete_scoped
on public.development_documents
for delete to authenticated
using (public.bridge_can_manage_development_record(development_id));

notify pgrst, 'reload schema';

commit;
