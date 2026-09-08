begin;
-- Pre-transaction applications. Never write identity/income data into general lead notes.
create table public.website_preapproval_applications (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id),
  organisation_id uuid not null references public.organisations(id),
  routing_rule_id uuid not null references public.partner_routing_rules(id),
  allocated_originator_id uuid not null references auth.users(id),
  allocated_organisation_id uuid not null references public.organisations(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32768),
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'awaiting_documents', 'closed')),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  consent_version text not null default 'website-preapproval-v1',
  created_at timestamptz not null default now(),
  unique (website_site_id, idempotency_key)
);
alter table public.website_preapproval_applications enable row level security;
revoke all on public.website_preapproval_applications from public, anon, authenticated;
grant all on public.website_preapproval_applications to service_role;
grant select on public.website_preapproval_applications to authenticated;
create policy assigned_originator_read on public.website_preapproval_applications for select to authenticated
using (allocated_originator_id = (select auth.uid()) and exists (
  select 1 from public.partner_routing_rules r where r.id = routing_rule_id and r.is_active
    and r.target_user_id = (select auth.uid()) and r.target_role_type = 'bond_originator'
    and r.source_organisation_id = organisation_id and r.target_organisation_id = allocated_organisation_id
));
create index website_preapproval_originator_idx on public.website_preapproval_applications (allocated_originator_id, created_at desc);
create index website_preapproval_rate_idx on public.website_preapproval_applications (website_site_id, request_fingerprint, created_at desc);

-- Called by the validated server endpoint only. INVOKER retains service-role privileges;
-- no public security-definer entry point or anonymous table access is introduced.
create function public.website_capture_preapproval(p_site_id uuid, p_payload jsonb, p_idempotency_key uuid, p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_site public.website_sites%rowtype;
  v_rule public.partner_routing_rules%rowtype;
  v_existing public.website_preapproval_applications%rowtype;
  v_id uuid;
  v_ties integer;
begin
  if p_fingerprint is null or length(p_fingerprint) <> 64 or p_payload->>'version' <> '1'
    or jsonb_typeof(p_payload->'applicants') <> 'array' or jsonb_array_length(p_payload->'applicants') not between 1 and 2
    or octet_length(p_payload::text) > 32768 then
    raise exception 'Invalid application' using errcode = '22023';
  end if;
  select * into v_site from public.website_sites where id = p_site_id and status = 'published';
  if not found then raise exception 'Site unavailable' using errcode = 'P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site_id::text || p_fingerprint, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site_id::text || p_idempotency_key::text, 1));
  select * into v_existing from public.website_preapproval_applications where website_site_id = p_site_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payload <> p_payload then return jsonb_build_object('conflict', true); end if;
    return jsonb_build_object('accepted', true, 'duplicate', true, 'reference', v_existing.id);
  end if;
  if (select count(*) from public.website_preapproval_applications where website_site_id = p_site_id and request_fingerprint = p_fingerprint and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('rateLimited', true);
  end if;
  -- Public applications have no trusted agent/branch context. Only the explicit agency
  -- allocation is eligible; do not choose an unrelated development or user-specific rule.
  select * into v_rule from public.partner_routing_rules
    where source_organisation_id = v_site.organisation_id and source_scope = 'organisation'
      and (source_context_id is null or source_context_id = v_site.organisation_id)
      and is_active and target_role_type = 'bond_originator'
    order by is_default desc, assignment_priority asc nulls last limit 1;
  if not found or v_rule.target_scope <> 'consultant' or v_rule.assignment_mode <> 'direct_consultant' or v_rule.target_user_id is null then
    return jsonb_build_object('allocationRequired', true);
  end if;
  select count(*) into v_ties from public.partner_routing_rules
    where source_organisation_id = v_site.organisation_id and source_scope = 'organisation'
      and (source_context_id is null or source_context_id = v_site.organisation_id)
      and is_active and target_role_type = 'bond_originator'
      and is_default = v_rule.is_default and assignment_priority is not distinct from v_rule.assignment_priority;
  if v_ties <> 1 then return jsonb_build_object('allocationRequired', true); end if;
  insert into public.website_preapproval_applications (website_site_id, organisation_id, routing_rule_id, allocated_originator_id, allocated_organisation_id, payload, idempotency_key, request_fingerprint)
    values (v_site.id, v_site.organisation_id, v_rule.id, v_rule.target_user_id, v_rule.target_organisation_id, p_payload, p_idempotency_key, p_fingerprint) returning id into v_id;
  return jsonb_build_object('accepted', true, 'reference', v_id);
end;
$$;
revoke all on function public.website_capture_preapproval(uuid,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.website_capture_preapproval(uuid,jsonb,uuid,text) to service_role;
commit;
