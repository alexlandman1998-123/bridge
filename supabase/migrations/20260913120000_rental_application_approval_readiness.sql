begin;

create or replace function public.rental_decide_application(p_application_id uuid, p_expected_version integer, p_decision text, p_reason text, p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare application_row public.rental_applications%rowtype; decision_id uuid; event_id uuid; next_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_decision not in ('approved', 'declined', 'withdrawn') then raise exception 'Invalid rental application decision'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A decision reason is required'; end if;
  select application.* into application_row from public.rental_applications application where application.id = p_application_id for update;
  if not found then raise exception 'Rental application not found'; end if;
  if not exists (select 1 from public.rental_vacancies vacancy join public.rental_properties property on property.id = vacancy.property_id where vacancy.id = application_row.vacancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this rental application'; end if;
  if application_row.version <> p_expected_version then raise exception 'This application changed. Refresh and try again.' using errcode = '40001'; end if;
  if application_row.status in ('approved', 'declined', 'withdrawn') then raise exception 'This rental application already has a final decision'; end if;

  if p_decision = 'approved' then
    if exists (select 1 from unnest(array['identity', 'proof_of_income']) required(document_type) where not exists (select 1 from public.rental_application_documents document where document.application_id = application_row.id and document.document_type = required.document_type and document.status in ('uploaded', 'accepted'))) then
      raise exception 'Approval requires uploaded identity and proof of income documents';
    end if;
    if exists (select 1 from unnest(array['privacy', 'credit_check', 'identity_verification']) required(consent_type) where not exists (select 1 from public.rental_application_consents consent where consent.application_id = application_row.id and consent.consent_type = required.consent_type)) then
      raise exception 'Approval requires all applicant consents';
    end if;
    if exists (select 1 from unnest(array['identity', 'fica', 'affordability', 'employment', 'reference']) required(check_type) where not exists (select 1 from public.rental_application_screening_checks screening where screening.application_id = application_row.id and screening.check_type = required.check_type and screening.status = 'passed')) then
      raise exception 'Approval requires all screening checks to pass';
    end if;
  end if;

  next_version := application_row.version + 1;
  insert into public.rental_application_decisions(application_id, organisation_id, decision, reason, evidence_json, target_version, decided_by)
  values (application_row.id, application_row.organisation_id, p_decision, btrim(p_reason), coalesce(p_evidence_json, '{}'::jsonb), next_version, auth.uid()) returning id into decision_id;
  update public.rental_applications set status = p_decision, version = next_version where id = application_row.id and version = application_row.version;
  insert into public.rental_application_events(application_id, organisation_id, event_type, aggregate_version, payload_json, occurred_by)
  values (application_row.id, application_row.organisation_id, 'rental_application_' || p_decision, next_version, jsonb_build_object('decision_id', decision_id, 'reason', btrim(p_reason)), auth.uid()) returning id into event_id;
  insert into public.rental_application_notification_outbox(application_event_id, application_id, organisation_id, notification_type)
  values (event_id, application_row.id, application_row.organisation_id, 'application_outcome');
  return jsonb_build_object('id', application_row.id, 'status', p_decision, 'version', next_version, 'decision_id', decision_id, 'event_id', event_id);
end; $$;

revoke execute on function public.rental_decide_application(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.rental_decide_application(uuid, integer, text, text, jsonb) to authenticated;

commit;
