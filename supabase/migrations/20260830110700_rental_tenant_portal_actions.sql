begin;

create table public.rental_tenant_portal_access (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique (tenancy_id, user_id)
);

create table public.rental_tenant_portal_actions (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  action_type text not null check (action_type in ('maintenance', 'document', 'notice', 'intention', 'contact_update', 'payment_reference')),
  client_request_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  canonical_record_id uuid,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, tenancy_id, client_request_id)
);

create index rental_tenant_portal_actions_tenancy_created_idx
  on public.rental_tenant_portal_actions (tenancy_id, created_at desc);

alter table public.rental_tenant_portal_access enable row level security;
alter table public.rental_tenant_portal_actions enable row level security;
revoke all on public.rental_tenant_portal_access, public.rental_tenant_portal_actions from public, anon;
grant select on public.rental_tenant_portal_access, public.rental_tenant_portal_actions to authenticated;

create policy rental_tenant_portal_access_read
on public.rental_tenant_portal_access for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.rental_tenancies tenancy
    join public.rental_properties property on property.id = tenancy.property_id
    where tenancy.id = tenancy_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

create policy rental_tenant_portal_actions_read
on public.rental_tenant_portal_actions for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.rental_tenancies tenancy
    join public.rental_properties property on property.id = tenancy.property_id
    where tenancy.id = tenancy_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  )
);

create or replace function public.rental_grant_tenant_portal_access(
  p_tenancy_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tenancy public.rental_tenancies%rowtype;
  v_access_id uuid;
begin
  if auth.uid() is null or p_tenancy_id is null or p_user_id is null then
    raise exception 'Tenancy and portal user are required';
  end if;
  select tenancy.* into v_tenancy from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not exists (
    select 1 from public.rental_properties property
    where property.id = v_tenancy.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'Portal user not found'; end if;
  insert into public.rental_tenant_portal_access (tenancy_id, user_id, status, granted_by, granted_at, revoked_at, revoked_by)
  values (v_tenancy.id, p_user_id, 'active', auth.uid(), now(), null, null)
  on conflict (tenancy_id, user_id) do update
    set status = 'active', granted_by = auth.uid(), granted_at = now(), revoked_at = null, revoked_by = null
  returning id into v_access_id;
  return jsonb_build_object('access_id', v_access_id, 'tenancy_id', v_tenancy.id, 'status', 'active');
end $$;

create or replace function public.rental_revoke_tenant_portal_access(
  p_tenancy_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tenancy public.rental_tenancies%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select tenancy.* into v_tenancy from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not exists (
    select 1 from public.rental_properties property
    where property.id = v_tenancy.property_id
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) then raise exception 'Not authorized'; end if;
  update public.rental_tenant_portal_access
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where tenancy_id = v_tenancy.id and user_id = p_user_id and status = 'active';
  return jsonb_build_object('tenancy_id', v_tenancy.id, 'status', 'revoked');
end $$;

create or replace function public.rental_submit_tenant_portal_action(
  p_tenancy_id uuid,
  p_action_type text,
  p_client_request_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_action public.rental_tenant_portal_actions%rowtype;
  v_tenancy public.rental_tenancies%rowtype;
  v_maintenance_id uuid;
  v_duplicate_key text;
  v_category text;
  v_priority text;
  v_description text;
begin
  if auth.uid() is null or p_tenancy_id is null or p_client_request_id is null
    or p_action_type not in ('maintenance', 'document', 'notice', 'intention', 'contact_update', 'payment_reference')
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid portal action';
  end if;
  select tenancy.* into v_tenancy from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not exists (
    select 1 from public.rental_tenant_portal_access access
    where access.tenancy_id = p_tenancy_id and access.user_id = auth.uid() and access.status = 'active'
  ) then raise exception 'Portal access is not active for this tenancy'; end if;
  select * into v_action from public.rental_tenant_portal_actions
  where tenancy_id = p_tenancy_id and user_id = auth.uid() and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('action_id', v_action.id, 'status', v_action.status, 'idempotent', true, 'canonical_record_id', v_action.canonical_record_id);
  end if;
  if (select count(*) from public.rental_tenant_portal_actions
      where tenancy_id = p_tenancy_id and user_id = auth.uid() and action_type = p_action_type and created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'Too many actions submitted. Please wait and try again.' using errcode = 'P0001';
  end if;
  if p_action_type = 'maintenance' then
    v_category := lower(coalesce(p_payload->>'category', ''));
    v_priority := lower(coalesce(p_payload->>'priority', 'routine'));
    v_description := btrim(coalesce(p_payload->>'description', ''));
    if v_category not in ('plumbing','electrical','appliance','security','structural','pest','cleaning','other')
      or v_priority not in ('emergency','urgent','routine') or length(v_description) < 10 then
      raise exception 'Maintenance category, priority and a 10-character description are required';
    end if;
    v_duplicate_key := md5(lower(v_category || ':' || v_description || ':' || current_date::text));
    insert into public.rental_maintenance_requests (
      organisation_id, property_id, unit_id, tenancy_id, category, priority, description, reported_by, duplicate_key
    ) values (
      v_tenancy.organisation_id, v_tenancy.property_id, v_tenancy.unit_id, v_tenancy.id, v_category, v_priority, v_description, auth.uid(), v_duplicate_key
    ) on conflict (tenancy_id, duplicate_key) do update
      set reported_at = public.rental_maintenance_requests.reported_at
    returning id into v_maintenance_id;
  elsif p_action_type = 'document' and length(btrim(coalesce(p_payload->>'document_link', ''))) = 0 then
    raise exception 'A document link is required';
  elsif p_action_type in ('notice', 'intention') and length(btrim(coalesce(p_payload->>'message', ''))) < 10 then
    raise exception 'Please provide at least 10 characters';
  elsif p_action_type = 'contact_update' and length(btrim(coalesce(p_payload->>'contact_value', ''))) = 0 then
    raise exception 'A contact value is required';
  elsif p_action_type = 'payment_reference' and length(btrim(coalesce(p_payload->>'payment_reference', ''))) = 0 then
    raise exception 'A payment reference is required';
  end if;
  insert into public.rental_tenant_portal_actions (
    tenancy_id, user_id, action_type, client_request_id, payload, canonical_record_id
  ) values (
    v_tenancy.id, auth.uid(), p_action_type, p_client_request_id, p_payload, v_maintenance_id
  ) returning * into v_action;
  return jsonb_build_object('action_id', v_action.id, 'status', v_action.status, 'idempotent', false, 'canonical_record_id', v_maintenance_id);
end $$;

revoke all on function public.rental_grant_tenant_portal_access(uuid, uuid), public.rental_revoke_tenant_portal_access(uuid, uuid), public.rental_submit_tenant_portal_action(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.rental_grant_tenant_portal_access(uuid, uuid), public.rental_revoke_tenant_portal_access(uuid, uuid), public.rental_submit_tenant_portal_action(uuid, text, uuid, jsonb) to authenticated;

commit;
