begin;
-- One committed request intent per explicit add. No historical backfill and no
-- network traffic inside the command transaction. Restores do not re-solicit.
create table document_requirement_private.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null unique references public.document_requirement_instances(id),
  actor_id uuid not null, command_id uuid not null,
  status text not null default 'pending' check(status in ('pending','processing','waiting_portal','sent','cancelled','needs_attention')),
  attempts integer not null default 0, claim_token uuid, lease_until timestamptz,
  next_attempt_at timestamptz not null default now(), first_attempt_at timestamptz,
  envelope jsonb, provider_message_id text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(actor_id,command_id)
);
alter table document_requirement_private.delivery_jobs enable row level security;
revoke all on document_requirement_private.delivery_jobs from public,anon,authenticated;
create index requirement_delivery_due_idx on document_requirement_private.delivery_jobs(next_attempt_at,id)
  where status in ('pending','waiting_portal','processing');

create function document_requirement_private.link_request(p_requirement_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.document_requirement_instances; j document_requirement_private.delivery_jobs;
begin
  select * into r from public.document_requirement_instances where id=p_requirement_id;
  select * into j from document_requirement_private.delivery_jobs where requirement_id=r.id;
  if j.id is null or r.transaction_id is null or r.applicability_override='removed' or r.status in ('not_applicable','waived') then return; end if;
  insert into public.document_requests(id,transaction_id,canonical_requirement_instance_id,category,document_type,title,description,
    priority,assigned_to_role,requested_from,status,requires_review,visibility_scope,created_by,created_by_role,requested_document_id)
  values(j.id,r.transaction_id,r.id,'Additional Requests',coalesce(r.document_definition_key,'custom_'||r.id),
    coalesce(r.custom_label,(select display_label from public.document_definitions where key=r.document_definition_key),'Supporting document'),
    'Please log into your secure portal and upload this document.','required',r.requested_from_role,r.requested_from_role,
    case when r.status in ('approved','completed') then 'completed' when r.status in ('uploaded','under_review') then 'uploaded' else 'requested' end,
    true,'client_visible',j.actor_id,coalesce((select role from public.profiles where id=j.actor_id),'system'),r.satisfied_by_document_id) on conflict(id) do nothing;
end $$;

create function document_requirement_private.capture_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.document_requirement_instances;
begin
  if new.envelope->>'action'<>'add' then return new; end if;
  select * into r from public.document_requirement_instances where id=(new.result->'requirement'->>'id')::uuid;
  insert into document_requirement_private.delivery_jobs(requirement_id,actor_id,command_id)
    values(r.id,new.actor_id,new.command_id) on conflict do nothing;
  perform document_requirement_private.link_request(r.id);
  return new;
end $$;
create trigger requirement_capture_request after insert on document_requirement_private.command_receipts
for each row execute function document_requirement_private.capture_request();

create function document_requirement_private.update_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.applicability_override='removed' or new.status in ('not_applicable','uploaded','under_review','approved','completed','waived') then
    update document_requirement_private.delivery_jobs set status='cancelled',last_error='Requirement removed or evidence already received.',updated_at=now()
      where requirement_id=new.id and status in ('pending','processing','waiting_portal');
  elsif old.transaction_id is distinct from new.transaction_id then
    update document_requirement_private.delivery_jobs set next_attempt_at=now(),updated_at=now()
      where requirement_id=new.id and status in ('pending','waiting_portal');
  end if;
  if old.transaction_id is distinct from new.transaction_id then perform document_requirement_private.link_request(new.id); end if;
  return new;
end $$;
create trigger requirement_update_delivery after update on public.document_requirement_instances
for each row execute function document_requirement_private.update_delivery();

create function document_requirement_private.claim_delivery(p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update document_requirement_private.delivery_jobs set status=case when attempts>=case when envelope is null then 7 else 8 end or first_attempt_at<now()-interval '23 hours' then 'needs_attention' else 'pending' end,
    claim_token=null,lease_until=null,last_error='Interrupted delivery requires recovery.' where status='processing' and lease_until<now();
  with due as (select id from document_requirement_private.delivery_jobs
    where status in ('pending','waiting_portal') and next_attempt_at<=now()
    order by next_attempt_at,id limit greatest(1,least(coalesce(p_limit,10),25)) for update skip locked),
  claimed as (update document_requirement_private.delivery_jobs j set status='processing',claim_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
    from due where j.id=due.id returning j.*)
  select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('requirement',to_jsonb(r))),'[]'::jsonb) into result
    from claimed c join public.document_requirement_instances r on r.id=c.requirement_id;
  return result;
end $$;
create function public.bridge_claim_requirement_deliveries(p_limit integer default 10) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.claim_delivery(p_limit)$$;

-- Freeze the exact provider request before the first attempt. A retry cannot
-- change recipient/content while retaining the provider idempotency key.
create function document_requirement_private.prepare_delivery(p_id uuid,p_claim uuid,p_envelope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j document_requirement_private.delivery_jobs; r public.document_requirement_instances; target jsonb; candidate jsonb;
begin
  select r0.* into r from public.document_requirement_instances r0 join document_requirement_private.delivery_jobs j0 on j0.requirement_id=r0.id where j0.id=p_id for update of r0;
  select * into j from document_requirement_private.delivery_jobs where id=p_id for update;
  if j.status<>'processing' or j.claim_token is distinct from p_claim or j.lease_until<=now() then return null; end if;
  if r.applicability_override='removed' or r.status not in ('pending','requested','rejected','expired') then
    update document_requirement_private.delivery_jobs set status='cancelled',updated_at=now() where id=p_id; return null;
  end if;
  target:=document_requirement_private.delivery_target(p_id,p_claim);
  candidate:=coalesce(j.envelope,p_envelope);
  if target is null then
    update document_requirement_private.delivery_jobs set status='waiting_portal',next_attempt_at=now()+interval '15 minutes',claim_token=null,lease_until=null,last_error='An active matching portal and recipient are required.' where id=p_id;
    return null;
  end if;
  if candidate->>'to' is distinct from target->>'to' or candidate->>'portalPath' is distinct from target->>'portalPath' then
    update document_requirement_private.delivery_jobs set status='cancelled',last_error='Portal recipient changed. Review before requesting again.' where id=p_id;
    return null;
  end if;
  if j.attempts>=8 or j.first_attempt_at<now()-interval '23 hours' then
    update document_requirement_private.delivery_jobs set status='needs_attention',last_error='Provider retry window exhausted.',updated_at=now() where id=p_id; return null;
  end if;
  if j.envelope is null and (p_envelope is null or nullif(p_envelope->>'to','') is null or nullif(p_envelope->>'html','') is null) then raise exception 'A verified delivery envelope is required.'; end if;
  update document_requirement_private.delivery_jobs set envelope=coalesce(envelope,p_envelope),attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now()
    where id=p_id returning * into j;
  return j.envelope;
end $$;
create function public.bridge_prepare_requirement_delivery(p_id uuid,p_claim uuid,p_envelope jsonb) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.prepare_delivery(p_id,p_claim,p_envelope)$$;

create function document_requirement_private.finish_delivery(p_id uuid,p_claim uuid,p_outcome text,p_provider_id text,p_error text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_outcome not in ('sent','waiting_portal','retry','cancelled') then raise exception 'Invalid delivery outcome.'; end if;
  update document_requirement_private.delivery_jobs set
    attempts=case when p_outcome='retry' and envelope is null then attempts+1 else attempts end,
    status=case when status='cancelled' then 'cancelled' when p_outcome='retry' then case when attempts>=case when envelope is null then 7 else 8 end or first_attempt_at<now()-interval '23 hours' then 'needs_attention' else 'pending' end else p_outcome end,
    provider_message_id=coalesce(p_provider_id,provider_message_id),last_error=left(p_error,1000),claim_token=null,lease_until=null,
    next_attempt_at=now()+case when p_outcome='waiting_portal' then interval '15 minutes' else interval '2 minutes' end,updated_at=now()
    where id=p_id and claim_token=p_claim and status in ('processing','cancelled');
  return found;
end $$;
create function public.bridge_finish_requirement_delivery(p_id uuid,p_claim uuid,p_outcome text,p_provider_id text default null,p_error text default null) returns boolean
language sql security invoker set search_path='' as $$select document_requirement_private.finish_delivery(p_id,p_claim,p_outcome,p_provider_id,p_error)$$;

revoke all on function document_requirement_private.link_request(uuid),document_requirement_private.capture_request(),document_requirement_private.update_delivery(),
 document_requirement_private.claim_delivery(integer),document_requirement_private.prepare_delivery(uuid,uuid,jsonb),document_requirement_private.finish_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant usage on schema document_requirement_private to service_role;
grant execute on function document_requirement_private.claim_delivery(integer),document_requirement_private.prepare_delivery(uuid,uuid,jsonb),document_requirement_private.finish_delivery(uuid,uuid,text,text,text) to service_role;
revoke all on function public.bridge_claim_requirement_deliveries(integer),public.bridge_prepare_requirement_delivery(uuid,uuid,jsonb),public.bridge_finish_requirement_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bridge_claim_requirement_deliveries(integer),public.bridge_prepare_requirement_delivery(uuid,uuid,jsonb),public.bridge_finish_requirement_delivery(uuid,uuid,text,text,text) to service_role;
create function document_requirement_private.delivery_target(p_id uuid,p_claim uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.document_requirement_instances; j document_requirement_private.delivery_jobs; t jsonb; l public.private_listings;
  o public.private_listing_seller_onboarding; b jsonb; link public.client_portal_links; email text; portal text; org uuid; listing_ids uuid[];
begin
  select * into j from document_requirement_private.delivery_jobs where id=p_id and claim_token=p_claim and status='processing' and lease_until>now();
  if not found then return null; end if;
  select * into r from public.document_requirement_instances where id=j.requirement_id;
  if r.applicability_override='removed' or r.status not in ('pending','requested','rejected','expired') then return null; end if;
  if not coalesce(r.requested_from_role=any(r.visible_to_roles) and r.requested_from_role=any(r.uploadable_by_roles),false) then return null; end if;
  if r.transaction_id is not null then select to_jsonb(tx) into t from public.transactions tx where id=r.transaction_id; org:=(t->>'organisation_id')::uuid; end if;
  if r.requested_from_role='seller' then
    select array_agg(distinct x.id) into listing_ids from public.private_listings x where
      (r.context_type='private_listing' and x.id=r.context_id)
      or (r.context_type='seller_lead' and exists(select 1 from public.leads lead where lead.lead_id=r.context_id and lead.organisation_id=x.organisation_id
        and lead.lead_id::text in (to_jsonb(x)->>'seller_lead_id',to_jsonb(x)->>'originating_crm_lead_id')))
      or (r.transaction_id is not null and x.organisation_id=org and x.id::text in (t->>'private_listing_id',t->>'listing_id'));
    if cardinality(listing_ids)<>1 or listing_ids is null then return null; end if;
    select * into l from public.private_listings where id=listing_ids[1];
    select * into o from public.private_listing_seller_onboarding where private_listing_id=l.id;
    if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(o),to_jsonb(l)) then return null; end if;
    org:=l.organisation_id;
    email:=lower(nullif(trim(coalesce(o.form_data->>'sellerEmail',o.form_data->>'email',o.form_data->>'contactEmail',to_jsonb(l)->>'seller_email')),''));
    portal:='/client/'||coalesce(nullif(to_jsonb(o)->>'seller_portal_token',''),o.token)||'/selling/documents';
  elsif r.requested_from_role='buyer' and r.transaction_id is not null then
    select * into link from public.client_portal_links p where p.transaction_id=r.transaction_id and p.is_active
      and p.buyer_id::text=t->>'buyer_id' and p.development_id::text is not distinct from t->>'development_id'
      and p.unit_id::text is not distinct from t->>'unit_id' order by p.updated_at desc nulls last limit 1;
    if not found then return null; end if;
    select to_jsonb(buyer) into b from public.buyers buyer where id=link.buyer_id;
    email:=lower(nullif(trim(b->>'email'),'')); portal:='/client/'||link.token||'/buying/documents';
  else return null;
  end if;
  -- A person-specific request must never fall back to a different party inbox.
  if r.requested_from_contact_id is not null then
    select lower(nullif(trim(c.email),'')) into email from public.contacts c where c.contact_id=r.requested_from_contact_id and c.organisation_id=org;
    -- The portal is party-scoped. Only send when this person is its verified recipient.
    if email is distinct from (case when r.requested_from_role='seller' then lower(nullif(trim(coalesce(o.form_data->>'sellerEmail',o.form_data->>'email',o.form_data->>'contactEmail',to_jsonb(l)->>'seller_email')),'')) else lower(nullif(trim(b->>'email'),'')) end) then return null; end if;
  end if;
  if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or portal is null then return null; end if;
  return jsonb_build_object('to',email,'portalPath',portal,'organisationId',org,'transactionId',r.transaction_id,
    'label',coalesce(r.custom_label,(select display_label from public.document_definitions where key=r.document_definition_key),'Supporting document'),
    'recipientRole',r.requested_from_role);
end $$;
create function public.bridge_requirement_delivery_target(p_id uuid,p_claim uuid) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.delivery_target(p_id,p_claim)$$;
revoke all on function document_requirement_private.delivery_target(uuid,uuid),public.bridge_requirement_delivery_target(uuid,uuid) from public,anon,authenticated;
grant execute on function document_requirement_private.delivery_target(uuid,uuid),public.bridge_requirement_delivery_target(uuid,uuid) to service_role;

alter function document_requirement_private.read_context(text,uuid) rename to read_context_before_delivery;
create function document_requirement_private.read_context(p_context_type text,p_context_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=document_requirement_private.read_context_before_delivery(p_context_type,p_context_id);
 return jsonb_set(result,'{requirements}',coalesce((select jsonb_agg(r.value||jsonb_build_object('request_delivery',
   (select jsonb_build_object('status',j.status,'lastError',j.last_error,'providerAccepted',j.provider_message_id is not null) from document_requirement_private.delivery_jobs j where j.requirement_id=(r.value->>'id')::uuid)))
   from jsonb_array_elements(result->'requirements') r),'[]'::jsonb));
end $$;
revoke all on function document_requirement_private.read_context(text,uuid) from public,anon,authenticated;
grant execute on function document_requirement_private.read_context(text,uuid) to authenticated;
create or replace function public.bridge_document_requirement_context(p_context_type text,p_context_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select document_requirement_private.read_context(p_context_type,p_context_id)$$;

notify pgrst,'reload schema';
commit;
