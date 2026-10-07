begin;

-- The token-verified Edge Function validates answers before calling this service-only
-- transaction. A stale read, closed link or missing lead must change neither row.
create or replace function public.rental_submit_tenant_qualification(
  p_link_id uuid, p_expected_payload jsonb, p_next_payload jsonb,
  p_response jsonb, p_budget numeric, p_area text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link public.buyer_viewing_preference_links%rowtype;
  v_lead public.leads%rowtype;
  v_now timestamptz := now();
begin
  select * into v_link from public.buyer_viewing_preference_links where id = p_link_id for update;
  if not found or v_link.status <> 'pending' or v_link.expires_at <= v_now then
    raise exception 'This qualification link is closed.';
  end if;
  select * into v_lead from public.leads
  where lead_id = v_link.lead_id and organisation_id = v_link.organisation_id for update;
  if not found or v_lead.lead_domain is distinct from 'agency'
    or coalesce(lower(v_lead.status), '') in ('lost','closed','archived','deleted','converted','cancelled','canceled') then
    raise exception 'This tenant lead is unavailable.';
  end if;
  if coalesce(v_lead.raw_enquiry_payload, '{}'::jsonb) is distinct from p_expected_payload then
    raise exception 'The lead changed. Please retry your submission.';
  end if;
  if p_budget <= 0 or p_budget is null or nullif(trim(p_area), '') is null
    or p_response ->> 'enquiryKind' is distinct from 'rental' then
    raise exception 'Invalid tenant qualification.';
  end if;
  update public.leads set raw_enquiry_payload = p_next_payload, budget = p_budget,
    area_interest = p_area, updated_at = v_now
  where lead_id = v_link.lead_id and organisation_id = v_link.organisation_id;
  update public.buyer_viewing_preference_links set status = 'submitted', response = p_response,
    submitted_at = v_now, updated_at = v_now where id = v_link.id;
  return jsonb_build_object('submittedAt', v_now);
end;
$$;
revoke all on function public.rental_submit_tenant_qualification(uuid,jsonb,jsonb,jsonb,numeric,text) from public, anon, authenticated;
grant execute on function public.rental_submit_tenant_qualification(uuid,jsonb,jsonb,jsonb,numeric,text) to service_role;
commit;
