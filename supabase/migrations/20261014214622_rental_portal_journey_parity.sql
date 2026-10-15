begin;

-- Authenticated clients report under their exact portal membership. The existing
-- public-token provenance remains supported; neither route receives direct writes.
alter table public.rental_maintenance_requests
  add column if not exists client_portal_membership_id uuid references public.rental_client_portal_memberships(id) on delete set null;

create or replace function public.rental_portal_submit_maintenance(
  p_tenancy_id uuid, p_token_id uuid, p_membership_id uuid,
  p_request_id uuid, p_details jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  tenancy public.rental_tenancies%rowtype;
  member public.rental_client_portal_memberships%rowtype;
  saved public.rental_maintenance_requests%rowtype;
  description text := btrim(coalesce(p_details->>'description',''));
  category text := p_details->>'category';
  priority text := p_details->>'priority';
  source_user uuid;
  was_created boolean := false;
begin
  if p_request_id is null or p_details is null or jsonb_typeof(p_details) <> 'object'
     or length(description) not between 10 and 4162
     or coalesce(category,'') not in ('plumbing','electrical','appliance','security','structural','pest','cleaning','other')
     or coalesce(priority,'') not in ('emergency','urgent','routine')
     or length(coalesce(p_details->>'area','')) > 160
     or length(coalesce(p_details->>'access','')) > 500
     or length(coalesce(p_details->>'availability','')) > 1000
     or (p_token_id is null) = (p_membership_id is null)
  then raise exception 'Choose a valid maintenance request and portal relationship'; end if;
  select * into tenancy from public.rental_tenancies where id=p_tenancy_id for share;
  if not found then raise exception 'This tenancy is unavailable'; end if;
  if p_token_id is not null then
    perform 1 from public.rental_tenant_portal_access_tokens
      where id=p_token_id and tenancy_id=tenancy.id and revoked_at is null and expires_at>now() for share;
    if not found then raise exception 'This tenant portal link is invalid or has expired'; end if;
  else
    select * into member from public.rental_client_portal_memberships
      where id=p_membership_id and audience='tenant' and status='active' and revoked_at is null
        and tenancy_id=tenancy.id and organisation_id=tenancy.organisation_id for share;
    if not found then raise exception 'This account does not have access to that rental relationship'; end if;
    source_user := member.user_id;
  end if;
  insert into public.rental_maintenance_requests(id,organisation_id,property_id,unit_id,tenancy_id,
    category,priority,description,reported_by,tenant_portal_token_id,client_portal_membership_id,
    tenant_area,tenant_access_preference,tenant_availability,duplicate_key)
  values(p_request_id,tenancy.organisation_id,tenancy.property_id,tenancy.unit_id,tenancy.id,
    category,priority,description,source_user,p_token_id,p_membership_id,
    nullif(p_details->>'area',''),nullif(p_details->>'access',''),nullif(p_details->>'availability',''),
    'portal:'||p_request_id::text)
  on conflict(id) do nothing returning * into saved;
  was_created := found;
  if not was_created then
    select * into saved from public.rental_maintenance_requests where id=p_request_id;
    if saved.tenancy_id is distinct from tenancy.id
       or saved.tenant_portal_token_id is distinct from p_token_id
       or saved.client_portal_membership_id is distinct from p_membership_id
       or saved.category is distinct from category or saved.priority is distinct from priority
       or saved.description is distinct from description
       or saved.tenant_area is distinct from nullif(p_details->>'area','')
       or saved.tenant_access_preference is distinct from nullif(p_details->>'access','')
       or saved.tenant_availability is distinct from nullif(p_details->>'availability','')
    then raise exception 'This maintenance receipt belongs to another request'; end if;
  else
    insert into public.rental_maintenance_tenant_events(request_id,organisation_id,event_type,tenant_visible_status,tenant_message,created_by)
    values(saved.id,tenancy.organisation_id,'submitted','Submitted','Your rental team has received your request.',source_user);
  end if;
  return jsonb_build_object('idempotent',not was_created,'request',jsonb_build_object(
    'id',saved.id,'unit_id',saved.unit_id,'category',saved.category,'priority',saved.priority,
    'description',saved.description,'status',saved.status,'tenant_area',saved.tenant_area,
    'tenant_access_preference',saved.tenant_access_preference,'tenant_availability',saved.tenant_availability,
    'reported_at',saved.reported_at,'acknowledged_at',saved.acknowledged_at,
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',event.id,'event_type',event.event_type,
      'tenant_visible_status',event.tenant_visible_status,'tenant_message',event.tenant_message,'created_at',event.created_at)
      order by event.created_at) from public.rental_maintenance_tenant_events event where event.request_id=saved.id),'[]'::jsonb)));
end; $$;

-- The server has already validated the JWT or token before invoking this function.
-- Relationship scope, expiry and retry identity are rechecked in the transaction.
revoke all on function public.rental_portal_submit_maintenance(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rental_portal_submit_maintenance(uuid,uuid,uuid,uuid,jsonb) to service_role;
commit;
