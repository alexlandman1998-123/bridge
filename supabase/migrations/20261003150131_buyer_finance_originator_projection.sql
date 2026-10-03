-- Read-only buyer finance projection of confirmed originator activity.
-- No private notes, draft quotes, documents or assignment metadata are returned.
create or replace function public.bridge_read_buyer_originator_finance(p_transaction_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction jsonb;
  v_role jsonb;
  v_profile jsonb;
  v_org jsonb;
  v_assignment public.transaction_bond_originator_workspace_assignments%rowtype;
  v_banks jsonb;
  v_offers jsonb;
  v_grants jsonb;
  v_received boolean := false;
begin
  if p_transaction_id is null or not coalesce(public.bridge_has_client_portal_token_transaction_access(p_transaction_id), false) then
    raise exception 'Buyer finance access denied' using errcode = '42501';
  end if;
  select to_jsonb(t) into v_transaction from public.transactions t where t.id = p_transaction_id;
  select to_jsonb(r) into v_role from public.transaction_role_players r
    where r.transaction_id = p_transaction_id and r.role_type = 'bond_originator' order by r.updated_at desc nulls last limit 1;
  select a.* into v_assignment from public.transaction_bond_originator_workspace_assignments a
    where a.transaction_id = p_transaction_id and a.status in ('assigned', 'accepted', 'completed')
    order by a.assigned_at desc limit 1;
  select to_jsonb(p) into v_profile from public.profiles p
    where p.id = coalesce(nullif(v_transaction->>'primary_bond_consultant_user_id', '')::uuid, v_assignment.assigned_to_profile_id);
  select to_jsonb(o) into v_org from public.organisations o
    where o.id = coalesce(nullif(v_transaction->>'bond_workspace_id', '')::uuid, nullif(v_role#>>'{snapshot_json,accepted_organisation_id}', '')::uuid);
  v_received := v_assignment.accepted_at is not null or
    (v_role#>>'{snapshot_json,intake_status}' = 'ACCEPTED' and nullif(v_role#>>'{snapshot_json,accepted_at}', '') is not null);

  -- Intake/draft rows are not lender submissions. External handoff records are
  -- the source used by the originator's Submit to banks action.
  with confirmed as (
    select a.id::text as id, a.bank_name, a.status, a.submitted_at, a.updated_at, 1 as priority
    from public.transaction_bond_applications a
    where a.transaction_id = p_transaction_id and a.application_type = 'bank_application'
      and nullif(trim(a.bank_name), '') is not null
      and (a.submitted_at is not null or a.status in ('submitted','feedback_received','quote_received','additional_documents_required','declined','approved','buyer_approved','expired'))
    union all
    select r.id::text || ':' || lower(trim(lender.name)), trim(lender.name), 'submitted', r.submitted_at, r.submitted_at, 2
    from public.bond_application_external_submission_records r
    join public.transaction_bond_application_export_packages e on e.id = r.export_package_id
    cross join lateral unnest(r.lender_names) lender(name)
    where e.transaction_id = p_transaction_id and e.destination_key = 'bond_originator_intake'
      and e.status <> 'cancelled' and r.status = 'recorded' and r.submitted_at is not null
      and nullif(trim(lender.name), '') is not null
  ), unique_banks as (
    select distinct on (case when lower(regexp_replace(bank_name,'[^a-zA-Z0-9]','','g')) in ('fnb','firstnationalbank') then 'fnb' else lower(trim(bank_name)) end) * from confirmed
    order by case when lower(regexp_replace(bank_name,'[^a-zA-Z0-9]','','g')) in ('fnb','firstnationalbank') then 'fnb' else lower(trim(bank_name)) end, greatest(submitted_at, updated_at) desc nulls last, priority
  ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bankName', bank_name,
    'status', status, 'submittedAt', submitted_at, 'updatedAt', updated_at) order by bank_name), '[]'::jsonb) into v_banks from unique_banks;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'bank_name', o.bank_name, 'offered_amount', o.offered_amount,
    'interest_rate', o.interest_rate, 'interest_rate_display', o.interest_rate_display,
    'monthly_repayment', o.monthly_repayment, 'valid_until', o.valid_until,
    'quote_document_id', o.quote_document_id, 'conditions_summary', o.conditions_summary,
    'status', o.status, 'buyer_decision', o.buyer_decision, 'published_at', o.published_at
  ) order by o.published_at desc), '[]'::jsonb) into v_offers
  from public.transaction_bond_originator_bank_offer_captures o
  join public.transaction_bond_application_export_packages e on e.id = o.export_package_id
  where o.transaction_id = p_transaction_id and e.transaction_id = p_transaction_id
    and e.destination_key = 'bond_originator_intake' and e.status not in ('cancelled','superseded')
    and o.status in ('published_to_buyer','accepted_by_buyer','declined_by_buyer') and o.published_at is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'bank_name', g.bank_name, 'approved_amount', g.approved_amount,
    'grant_document_id', g.grant_document_id, 'status', g.status, 'published_at', g.published_at
  )), '[]'::jsonb) into v_grants
  from public.transaction_bond_originator_grant_captures g
  join public.transaction_bond_application_export_packages e on e.id = g.export_package_id
  where g.transaction_id = p_transaction_id and e.transaction_id = p_transaction_id
    and e.destination_key = 'bond_originator_intake' and e.status not in ('cancelled','superseded')
    and g.status in ('published_to_buyer','buyer_signed','submitted_for_instruction') and g.published_at is not null;

  return jsonb_build_object('source', 'bond_originator', 'applicationReceived', coalesce(v_received,false),
    'requestedAmount', nullif(v_transaction->>'bond_amount',''),
    'manager', jsonb_build_object(
      'name', coalesce(nullif(v_profile->>'full_name',''), nullif(v_role->>'contact_person',''), nullif(v_transaction->>'bond_originator','')),
      'email', coalesce(nullif(v_profile->>'email',''), nullif(v_role->>'email_address',''), nullif(v_transaction->>'assigned_bond_originator_email','')),
      'phone', coalesce(nullif(v_profile->>'phone',''), nullif(v_profile->>'phone_number','')),
      'company', coalesce(nullif(v_org->>'name',''), nullif(v_role->>'partner_name','')),
      'logo', v_org->>'logo_url'),
    'bankApplications', v_banks, 'offerCaptures', v_offers, 'grantCaptures', v_grants);
end;
$$;
revoke all on function public.bridge_read_buyer_originator_finance(uuid) from public;
grant execute on function public.bridge_read_buyer_originator_finance(uuid) to anon, authenticated;
