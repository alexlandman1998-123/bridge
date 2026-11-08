begin;

-- Retain the existing token scope and expose only fields used for buyer prefill.
create or replace function public.bridge_buyer_bond_application_runtime_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.bond_applications%rowtype; f public.onboarding_form_data%rowtype; p public.bond_application_participants%rowtype;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id();
  select * into f from public.onboarding_form_data where id=a.onboarding_form_data_id and transaction_id=a.transaction_id;
  select * into p from public.bond_application_participants where bond_application_id=a.id and role='primary_applicant' and removed_at is null;
  return jsonb_build_object('application',jsonb_build_object('id',a.id,'revision',a.revision,'status',a.status,'transactionId',a.transaction_id),
    'draft',coalesce(f.form_data->'bond_application',a.metadata->'phase3_portal_draft','{}'::jsonb),
    'transaction', (select jsonb_build_object('id',to_jsonb(t)->'id','purchase_price',to_jsonb(t)->'purchase_price','deposit_amount',to_jsonb(t)->'deposit_amount','bond_amount',to_jsonb(t)->'bond_amount','finance_type',to_jsonb(t)->'finance_type','purchaser_type',to_jsonb(t)->'purchaser_type','buyer_entity_type',to_jsonb(t)->'buyer_entity_type','property_address_line_1',to_jsonb(t)->'property_address_line_1','property_suburb',to_jsonb(t)->'property_suburb','property_city',to_jsonb(t)->'property_city','property_province',to_jsonb(t)->'property_province','property_postal_code',to_jsonb(t)->'property_postal_code','transaction_reference',to_jsonb(t)->'transaction_reference') from public.transactions t where t.id=a.transaction_id),
    'onboardingFormData',jsonb_build_object('formData',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(f.form_data,'{}'::jsonb)) where key=any(array[
        'bank_account_number','bank_account_type','bank_name','bond_amount','bound_by_surety_agreements','buyer_entity_name','buyer_entity_registration_number',
        'buyer_entity_type','cash_amount','city','company_name','company_registration_number','currently_under_administration','currently_under_debt_review',
        'date_of_birth','debit_order_account_number','debit_order_bank_name','debit_order_date','deposit_amount','email','employer_name',
        'employment_months','employment_status','employment_years','ever_declared_insolvent','first_name','fixed_property','groceries',
        'gross_monthly_income','housing_expense','identity_number','insolvent','investments','job_title','judgments',
        'judgments_taken','last_name','liabilities_total','marital_regime','marital_status','monthly_groceries','monthly_rent',
        'monthly_rental_income','monthly_transport','monthly_utilities','months_employed','nationality','nature_of_occupation','net_asset_value',
        'net_worth','number_of_dependants','occupation','occupation_status','other_expenses','other_income','other_monthly_expenses',
        'other_monthly_income','passport_number','phone','postal_code','preferred_debit_order_date','primary_account_number','primary_account_type',
        'primary_bank_name','property_owned','purchase_finance_type','purchase_price','purchaser_entity_name','purchaser_entity_registration_number','purchaser_entity_type',
        'purchaser_type','purchasers','registration_number','rental_expense','rental_income','spouse_email','spouse_first_name',
        'spouse_full_name','spouse_identity_number','spouse_last_name','spouse_phone','spouse_surname','street_address','suburb',
        'tax_number','total_assets','total_liabilities','transport','trust_name','trust_registration_number','under_debt_review',
        'utilities','vehicle_value','vehicles','water_electricity','years_employed'
      ])),'{}'::jsonb)),
    'sharedSections',coalesce((select jsonb_object_agg(section_key,answers_json) from public.bond_application_sections where bond_application_id=a.id and participant_id is null),'{}'::jsonb),
    'primarySections',coalesce((select jsonb_object_agg(section_key,answers_json) from public.bond_application_sections where bond_application_id=a.id and participant_id=p.id),'{}'::jsonb),
    'primaryParticipantKey',p.participant_key,
    'additionalRequirements',coalesce((select jsonb_agg(jsonb_build_object('key',r.requirement_key,'canonicalDocumentType',r.canonical_document_type,'title',coalesce(t.document_label,r.requirement_key),'participantRole','primary_applicant','required',coalesce(t.is_required,true),'active',true,'requiredBefore',r.required_before,'satisfactionMode',r.satisfaction_mode,'minimumFileCount',1,'ruleSetVersion',r.rule_set_version)) from public.bond_application_document_requirements r left join public.transaction_required_documents t on t.id=r.transaction_required_document_id where r.bond_application_id=a.id and (r.participant_id is null or r.participant_id=p.id) and r.source<>'guided_rule' and r.status not in ('inactive','superseded','waived')),'[]'::jsonb),
    'requiredDocuments',coalesce((select jsonb_agg(to_jsonb(r)) from public.transaction_required_documents r where r.transaction_id=a.transaction_id and r.id in (select transaction_required_document_id from public.bond_application_document_requirements where bond_application_id=a.id and (participant_id is null or participant_id=p.id) and status not in ('inactive','superseded'))),'[]'::jsonb),
    -- A requirement link cannot override the file audience or applicant owner.
    'documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.documents d where d.transaction_id=a.transaction_id
      and coalesce(d.is_client_visible,true)
      and lower(coalesce(d.visibility_scope,'internal')) in ('shared','client','client_visible')
      and lower(coalesce(d.client_recipient_role,'')) in ('','buyer','both','all','client','shared')
      and lower(coalesce(d.uploaded_by_party,'')) in ('','buyer','client','primary_applicant')
      and coalesce(to_jsonb(d)#>>'{metadata,participant_role}',to_jsonb(d)#>>'{metadata,participantRole}',to_jsonb(d)->>'participant_role',to_jsonb(d)->>'participantRole','primary_applicant') in ('primary_applicant','buyer','client')
      and (coalesce(to_jsonb(d)#>>'{metadata,participant_key}',to_jsonb(d)#>>'{metadata,participantKey}',to_jsonb(d)->>'participant_key',to_jsonb(d)->>'participantKey','') in ('','primary','primary_applicant')
        or coalesce(to_jsonb(d)#>>'{metadata,participant_key}',to_jsonb(d)#>>'{metadata,participantKey}',to_jsonb(d)->>'participant_key',to_jsonb(d)->>'participantKey','') like 'primary_applicant:%')
      and coalesce(to_jsonb(d)#>>'{metadata,participant_id}',to_jsonb(d)#>>'{metadata,participantId}',to_jsonb(d)->>'participant_id',p.id::text) = p.id::text
      and (d.id in (select linked_document_id from public.bond_application_document_requirements where bond_application_id=a.id and (participant_id is null or participant_id=p.id) and status not in ('inactive','superseded'))
      or (d.canonical_requirement_instance_id in (select t.canonical_requirement_instance_id from public.transaction_required_documents t join public.bond_application_document_requirements r on r.transaction_required_document_id=t.id where r.bond_application_id=a.id and (r.participant_id is null or r.participant_id=p.id) and r.status not in ('inactive','superseded')) and d.is_client_visible=true and d.visibility_scope='shared' and d.uploaded_by_party='buyer'))),'[]'::jsonb),
    'submission',(select to_jsonb(s)-'snapshot_json'-'declarations_json'-'signer_manifest_json'-'document_manifest_json'-'metadata' from public.transaction_bond_application_submissions s where s.transaction_id=a.transaction_id and s.bond_application_id=a.id order by s.submission_version desc limit 1));
end $$;


-- Starting an application is an explicit buyer action, not a side effect of a read.
-- The active buyer link supplies the matter; callers cannot choose a transaction.
create or replace function public.bridge_start_buyer_bond_application()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tx uuid; t public.transactions%rowtype; a public.bond_applications%rowtype;
  f public.onboarding_form_data%rowtype;
begin
  tx:=public.bridge_portal_matter_financial_transaction_id('buyer');
  if tx is null then raise exception 'An active buyer portal link is required to start the application.' using errcode='42501'; end if;
  select * into t from public.transactions where id=tx for update;
  if not found or lower(coalesce(t.finance_type,'')) not in ('bond','hybrid','combination') then
    raise exception 'Confirm bond finance on the deal before starting a bond application.' using errcode='22023'; end if;
  if t.registered_at is not null or t.cancelled_at is not null or t.archived_at is not null
    or lower(coalesce(t.lifecycle_state,'')) in ('registered','completed','cancelled','archived') then
    raise exception 'This deal is closed. Contact your finance team.' using errcode='22023'; end if;
  select * into a from public.bond_applications where transaction_id=tx order by created_at desc limit 1;
  if a.id is not null then
    if a.status='cancelled' then raise exception 'This application was cancelled. Contact your finance team.' using errcode='22023'; end if;
    return public.bridge_buyer_bond_application_runtime_context();
  end if;
  select * into f from public.onboarding_form_data where transaction_id=tx order by updated_at desc limit 1 for update;
  if f.id is null then
    insert into public.onboarding_form_data(transaction_id,purchaser_type) values(tx,coalesce(nullif(to_jsonb(t)->>'purchaser_type',''),'individual')) returning * into f;
  end if;
  insert into public.bond_applications(transaction_id,onboarding_form_data_id,metadata)
    values(tx,f.id,jsonb_build_object('source','buyer_portal_start')) returning * into a;
  insert into public.bond_application_participants(bond_application_id,participant_key,role,status)
    values(a.id,'primary_applicant:1','primary_applicant','in_progress');
  -- Preserve existing answers and finance records. No submission, signature,
  -- consent, bank application, assignment or notification is manufactured.
  return public.bridge_buyer_bond_application_runtime_context();
end $$;
revoke all on function public.bridge_start_buyer_bond_application() from public;
grant execute on function public.bridge_start_buyer_bond_application() to anon,authenticated;

notify pgrst,'reload schema';
commit;
