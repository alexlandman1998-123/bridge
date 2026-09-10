begin;

-- Knowledge Factory is a sensitive, billable data source.  These records are
-- deliberately separate from the supplier credentials: credentials remain Edge
-- Function secrets and must never be stored in Postgres or returned to clients.
create table public.knowledge_factory_organisation_access (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  enabled boolean not null default false,
  allowed_operations text[] not null default '{}'::text[],
  supplier_account_reference text,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_organisation_access_operations_check check (
    allowed_operations <@ array[
      'map_properties',
      'property_summary',
      'property_report',
      'fica_kyc',
      'credit_check'
    ]::text[]
  ),
  constraint knowledge_factory_organisation_access_activation_check check (
    (enabled = false) or (activated_at is not null and activated_by is not null)
  )
);

create table public.knowledge_factory_user_permissions (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  allowed_operations text[] not null default '{}'::text[],
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  primary key (organisation_id, user_id),
  constraint knowledge_factory_user_permissions_operations_check check (
    allowed_operations <@ array[
      'map_properties',
      'property_summary',
      'property_report',
      'fica_kyc',
      'credit_check'
    ]::text[]
  ),
  constraint knowledge_factory_user_permissions_revocation_check check (
    (revoked_at is null and revocation_reason is null)
    or (revoked_at is not null and length(btrim(coalesce(revocation_reason, ''))) > 0)
  )
);

-- No supplier payload, identity number, owner information, or credit/FICA
-- result is retained here.  This is an immutable operational and billing audit.
create table public.knowledge_factory_audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in (
    'map_properties', 'property_summary', 'property_report', 'fica_kyc', 'credit_check'
  )),
  request_purpose text not null check (length(btrim(request_purpose)) between 10 and 500),
  property_reference text,
  request_metadata jsonb not null default '{}'::jsonb,
  outcome text not null check (outcome in ('validated', 'completed', 'denied', 'failed')),
  vendor_request_id text,
  field_cost integer check (field_cost is null or field_cost >= 0),
  type_cost integer check (type_cost is null or type_cost >= 0),
  price_surcharge integer check (price_surcharge is null or price_surcharge >= 0),
  credits_consumed integer check (credits_consumed is null or credits_consumed >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  constraint knowledge_factory_audit_log_metadata_object_check check (jsonb_typeof(request_metadata) = 'object')
);

create index knowledge_factory_audit_log_organisation_created_idx
  on public.knowledge_factory_audit_log (organisation_id, created_at desc);
create index knowledge_factory_audit_log_actor_created_idx
  on public.knowledge_factory_audit_log (actor_id, created_at desc);

create or replace function public.knowledge_factory_is_active_member(
  p_organisation_id uuid,
  p_required_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organisation_id
      and ou.user_id = auth.uid()
      and lower(trim(coalesce(ou.membership_status, ou.status, ''))) = 'active'
      and (
        p_required_roles is null
        or lower(trim(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role, '')))
          = any (p_required_roles)
      )
  );
$$;

create or replace function public.knowledge_factory_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Knowledge Factory audit records are immutable.';
end;
$$;

drop trigger if exists knowledge_factory_audit_log_immutable on public.knowledge_factory_audit_log;
create trigger knowledge_factory_audit_log_immutable
before update or delete on public.knowledge_factory_audit_log
for each row execute function public.knowledge_factory_reject_audit_mutation();

alter table public.knowledge_factory_organisation_access enable row level security;
alter table public.knowledge_factory_user_permissions enable row level security;
alter table public.knowledge_factory_audit_log enable row level security;

revoke all on public.knowledge_factory_organisation_access,
  public.knowledge_factory_user_permissions,
  public.knowledge_factory_audit_log from anon, authenticated;
grant select on public.knowledge_factory_organisation_access,
  public.knowledge_factory_user_permissions,
  public.knowledge_factory_audit_log to authenticated;
grant execute on function public.knowledge_factory_is_active_member(uuid, text[]) to authenticated;
revoke all on function public.knowledge_factory_reject_audit_mutation() from public;

create policy knowledge_factory_organisation_access_admin_read
on public.knowledge_factory_organisation_access
for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

create policy knowledge_factory_user_permissions_read
on public.knowledge_factory_user_permissions
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.knowledge_factory_is_active_member(
    organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
  )
);

create policy knowledge_factory_audit_log_read
on public.knowledge_factory_audit_log
for select to authenticated
using (
  actor_id = (select auth.uid())
  or public.knowledge_factory_is_active_member(
    organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
  )
);

commit;
