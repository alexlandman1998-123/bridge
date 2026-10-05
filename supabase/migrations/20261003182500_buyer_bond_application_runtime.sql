begin;

-- Freeze the existing guided document vocabulary for the canonical upload adapter.
-- Existing definitions and their review policies are preserved.
insert into public.document_definitions(key,display_label,category,pack_key,applies_to_context,default_requirement_level,default_visibility,default_upload_roles,review_required) values
('offer_to_purchase','Offer to Purchase / Sale Agreement','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_company_registration','Business registration documents','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_director_identity_documents','Director identity documents','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_company_resolution','Company resolution to purchase / borrow','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_company_financial_statements','Company financial statements','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_company_tax_documents','Company SARS tax documents','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_company_beneficial_ownership','Beneficial ownership declaration','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_trust_deed','Trust deed','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_letters_of_authority','Letters of authority','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_trustee_identity_documents','Trustee identity documents','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_trust_resolution','Trust resolution to purchase / borrow','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_trust_beneficial_ownership','Trust beneficial ownership declaration','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_id_document','Identity document','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('buyer_proof_of_address','Proof of residential address','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('credit_check_consent','Credit check consent','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('affordability_assessment','Affordability and expense declaration','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('pre_approval_certificate','Pre-approval certificate','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('marriage_certificate','Marriage certificate','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('antenuptial_contract','Antenuptial contract','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('bank_statements','Latest 3 months bank statements','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('personal_bank_statements','Latest 6 months personal bank statements','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('business_bank_statements','Latest 6 months business bank statements','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('proof_of_funds','Proof of deposit','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('payslips','Latest payslip / salary income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('employment_contract','Signed employment contract','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('accountant_letter','Accountant letter / letter of drawings','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('financial_statements','Latest 2 years annual financial statements','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('management_accounts','Recent management accounts','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('tax_documents','SARS tax assessment / tax returns','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('assets_liabilities_statement','Personal assets and liabilities statement','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('surety_undertaking','Signed surety undertaking','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('commission_income_evidence','Latest 6 months commission income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('contract_income_history','Contract income history','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('pension_income_evidence','Additional pension / annuity income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('rental_income_evidence','Rental income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('maintenance_income_evidence','Maintenance income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('investment_income_evidence','Investment income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('trust_income_evidence','Trust income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('proof_of_income','Other income evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('property_finance_existing_bond','Existing property bond statement','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('debt_settlement_letter','Debt or settlement evidence','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true),
('credit_history_supporting_documents','Credit history supporting documents','buyer_finance','buyer_finance',array['transaction'],'required',array['buyer','agent','bond_originator'],array['buyer'],true)
on conflict(key) do nothing;


-- Resolve one application without returning either kind of bearer credential.
create or replace function public.bridge_buyer_bond_application_runtime_id()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_link public.client_portal_links%rowtype; v_access public.bond_application_portal_access_links%rowtype;
begin
  if nullif(public.bridge_request_header('x-bridge-bond-application-token'), '') is not null then
    select * into v_access from public.bridge_bond_application_portal_active_link();
    if v_access.id is null then raise exception 'Application access is invalid, expired or revoked.' using errcode='42501'; end if;
    return v_access.bond_application_id;
  end if;
  select l.* into v_link from public.client_portal_links l join public.transactions t on t.id=l.transaction_id
  where l.token=public.bridge_client_portal_request_token() and l.is_active=true
    and (l.expires_at is null or l.expires_at>now())
    and t.buyer_id is not distinct from l.buyer_id
    and t.development_id is not distinct from l.development_id and t.unit_id is not distinct from l.unit_id;
  if v_link.id is null then raise exception 'Buyer application access is unavailable.' using errcode='42501'; end if;
  select id into v_id from public.bond_applications where transaction_id=v_link.transaction_id and status<>'cancelled' order by created_at desc limit 1;
  if v_id is null then raise exception 'Your finance team must prepare the application first.' using errcode='P0002'; end if;
  return v_id;
end $$;
revoke all on function public.bridge_buyer_bond_application_runtime_id() from public, anon, authenticated;

create or replace function public.bridge_buyer_bond_application_runtime_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.bond_applications%rowtype; f public.onboarding_form_data%rowtype; p public.bond_application_participants%rowtype;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id();
  select * into f from public.onboarding_form_data where id=a.onboarding_form_data_id and transaction_id=a.transaction_id;
  select * into p from public.bond_application_participants where bond_application_id=a.id and role='primary_applicant' and removed_at is null;
  return jsonb_build_object('application',jsonb_build_object('id',a.id,'revision',a.revision,'status',a.status,'transactionId',a.transaction_id),
    'draft',coalesce(f.form_data->'bond_application',a.metadata->'phase3_portal_draft','{}'::jsonb),
    'transaction', jsonb_build_object('id',a.transaction_id),
    'sharedSections',coalesce((select jsonb_object_agg(section_key,answers_json) from public.bond_application_sections where bond_application_id=a.id and participant_id is null),'{}'::jsonb),
    'primarySections',coalesce((select jsonb_object_agg(section_key,answers_json) from public.bond_application_sections where bond_application_id=a.id and participant_id=p.id),'{}'::jsonb),
    'primaryParticipantKey',p.participant_key,
    'additionalRequirements',coalesce((select jsonb_agg(jsonb_build_object('key',r.requirement_key,'canonicalDocumentType',r.canonical_document_type,'title',coalesce(t.document_label,r.requirement_key),'participantRole','primary_applicant','required',coalesce(t.is_required,true),'active',true,'requiredBefore',r.required_before,'satisfactionMode',r.satisfaction_mode,'minimumFileCount',1,'ruleSetVersion',r.rule_set_version)) from public.bond_application_document_requirements r left join public.transaction_required_documents t on t.id=r.transaction_required_document_id where r.bond_application_id=a.id and (r.participant_id is null or r.participant_id=p.id) and r.source<>'guided_rule' and r.status not in ('inactive','superseded','waived')),'[]'::jsonb),
    'requiredDocuments',coalesce((select jsonb_agg(to_jsonb(r)) from public.transaction_required_documents r where r.transaction_id=a.transaction_id and r.id in (select transaction_required_document_id from public.bond_application_document_requirements where bond_application_id=a.id and (participant_id is null or participant_id=p.id) and status not in ('inactive','superseded'))),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d)) from public.documents d where d.transaction_id=a.transaction_id and (d.id in (select linked_document_id from public.bond_application_document_requirements where bond_application_id=a.id and (participant_id is null or participant_id=p.id) and status not in ('inactive','superseded'))
      or (d.canonical_requirement_instance_id in (select t.canonical_requirement_instance_id from public.transaction_required_documents t join public.bond_application_document_requirements r on r.transaction_required_document_id=t.id where r.bond_application_id=a.id and (r.participant_id is null or r.participant_id=p.id) and r.status not in ('inactive','superseded')) and d.is_client_visible=true and d.visibility_scope='shared' and d.uploaded_by_party='buyer'))),'[]'::jsonb),
    'submission',(select to_jsonb(s)-'snapshot_json'-'declarations_json'-'signer_manifest_json'-'document_manifest_json'-'metadata' from public.transaction_bond_application_submissions s where s.transaction_id=a.transaction_id and s.bond_application_id=a.id order by s.submission_version desc limit 1));
end $$;

-- All section writes and the compatibility draft commit together. No other
-- applicant's private sections or unrelated onboarding answers are overwritten.
create or replace function public.bridge_save_buyer_bond_application_draft(p_draft jsonb,p_expected_revision integer,p_shared_sections jsonb,p_primary_sections jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.bond_applications%rowtype; p public.bond_application_participants%rowtype; item record; target uuid; allowed text[];
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id() for update;
  if a.status in ('submitted','cancelled','preparing_submission','awaiting_signatures') or a.locked_at is not null then raise exception 'This application is locked for submission.' using errcode='23514'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'The application changed elsewhere. Refresh before saving.' using errcode='40001'; end if;
  if jsonb_typeof(p_draft) is distinct from 'object' or jsonb_typeof(p_shared_sections) is distinct from 'object' or jsonb_typeof(p_primary_sections) is distinct from 'object' then raise exception 'Invalid application draft.' using errcode='22023'; end if;
  select * into p from public.bond_application_participants where bond_application_id=a.id and role='primary_applicant' and removed_at is null for update;
  if p.id is null or a.onboarding_form_data_id is null then raise exception 'The application is not ready for editing.' using errcode='23514'; end if;
  for item in select key,value,'application'::text as scope from jsonb_each(p_shared_sections) union all select key,value,'participant'::text from jsonb_each(p_primary_sections) loop
    allowed:=case when item.scope='application' then array['application_intent','application_finance','applicant_structure','buyer_entity','selected_banks','shared_property_summary'] else array['personal_contact','address_residency','marital_details','employment_income','monthly_commitments','accounts_assets','credit_history','relationship_context','financial_position','liabilities','surety_terms_confirmation','review_declarations_draft'] end;
    if not(item.key=any(allowed)) then raise exception 'Unsupported application section.' using errcode='22023'; end if;
    target:=case when item.scope='participant' then p.id else null end;
    update public.bond_application_sections set answers_json=item.value,version=version+1,updated_at=now(),status='in_progress'
    where bond_application_id=a.id and participant_id is not distinct from target and section_key=item.key;
    if not found then insert into public.bond_application_sections(bond_application_id,participant_id,scope,section_key,answers_json,status) values(a.id,target,item.scope,item.key,item.value,'in_progress'); end if;
  end loop;
  update public.onboarding_form_data set form_data=jsonb_set(coalesce(form_data,'{}'::jsonb),'{bond_application}',p_draft,true),updated_at=now() where id=a.onboarding_form_data_id and transaction_id=a.transaction_id;
  if not found then raise exception 'Application draft storage is unavailable.' using errcode='23514'; end if;
  update public.bond_applications set revision=revision+1,metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{phase3_portal_draft}',p_draft,true),updated_at=now() where id=a.id returning * into a;
  return jsonb_build_object('applicationId',a.id,'revision',a.revision,'updatedAt',a.updated_at);
end $$;

create or replace function public.bridge_reconcile_buyer_bond_application_documents(p_requirements jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.bond_applications%rowtype; p public.bond_application_participants%rowtype; item jsonb; r_id uuid; keys text[]:=array[]::text[]; canonical_id uuid; definition public.document_definitions%rowtype;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id() for update;
  if a.status in ('submitted','cancelled','preparing_submission','awaiting_signatures') or a.locked_at is not null then raise exception 'This application is locked.' using errcode='23514'; end if;
  if jsonb_typeof(p_requirements) is distinct from 'array' or jsonb_array_length(p_requirements)>100 then raise exception 'Invalid document requirements.' using errcode='22023'; end if;
  select * into p from public.bond_application_participants where bond_application_id=a.id and role='primary_applicant' and removed_at is null;
  for item in select value from jsonb_array_elements(p_requirements) loop
    if coalesce(item->>'participantRole','primary_applicant')<>'primary_applicant' then continue; end if;
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'key','')='' or length(item->>'key')>200 then raise exception 'A requirement key is required.' using errcode='22023'; end if;
    if exists(select 1 from public.bond_application_document_requirements where bond_application_id=a.id and (participant_id is null or participant_id=p.id) and requirement_key=item->>'key' and source<>'guided_rule' and status not in ('inactive','superseded')) then continue; end if;
    keys:=array_append(keys,item->>'key');
    select id into r_id from public.transaction_required_documents where transaction_id=a.transaction_id and document_key=item->>'key' limit 1;
    if r_id is null then
      insert into public.transaction_required_documents(transaction_id,document_key,document_label,is_required,is_uploaded,required_from_role,visibility_scope,reconciliation_source,group_key,group_label) values(a.transaction_id,item->>'key',coalesce(item->>'title',item->>'key'),coalesce((item->>'required')::boolean,true),false,'buyer','shared','buyer_bond_application_runtime','finance','Bond application documents') returning id into r_id;
    end if;
    select * into definition from public.document_definitions where key=item->>'canonicalDocumentType' and is_active=true;
    if definition.key is null or not(definition.key=any(array['offer_to_purchase','buyer_company_registration','buyer_director_identity_documents','buyer_company_resolution','buyer_company_financial_statements','buyer_company_tax_documents','buyer_company_beneficial_ownership','buyer_trust_deed','buyer_letters_of_authority','buyer_trustee_identity_documents','buyer_trust_resolution','buyer_trust_beneficial_ownership','buyer_id_document','buyer_proof_of_address','credit_check_consent','affordability_assessment','pre_approval_certificate','marriage_certificate','antenuptial_contract','bank_statements','personal_bank_statements','business_bank_statements','proof_of_funds','payslips','employment_contract','accountant_letter','financial_statements','management_accounts','tax_documents','assets_liabilities_statement','surety_undertaking','commission_income_evidence','contract_income_history','pension_income_evidence','rental_income_evidence','maintenance_income_evidence','investment_income_evidence','trust_income_evidence','proof_of_income','property_finance_existing_bond','debt_settlement_letter','credit_history_supporting_documents'])) then raise exception 'Unknown application document type.' using errcode='22023'; end if;
    select id into canonical_id from public.document_requirement_instances where transaction_id=a.transaction_id and context_type='transaction' and context_id=a.transaction_id and document_definition_key=definition.key and requested_from_role='buyer' and requested_from_contact_id is null and status<>'not_applicable' limit 1;
    if canonical_id is null then insert into public.document_requirement_instances(document_definition_key,context_type,context_id,transaction_id,pack_key,requirement_level,requested_from_role,visible_to_roles,uploadable_by_roles,reviewer_role,resolver_version,source_system) values(definition.key,'transaction',a.transaction_id,a.transaction_id,definition.pack_key,case when coalesce((item->>'required')::boolean,true) then 'required' else 'optional' end,'buyer',array['buyer','agent','bond_originator'],array['buyer'],'bond_originator','buyer_bond_application_runtime_v1','buyer_bond_application_runtime') returning id into canonical_id; end if;
    update public.transaction_required_documents set canonical_requirement_instance_id=canonical_id where id=r_id and canonical_requirement_instance_id is null;
    update public.bond_application_document_requirements set status=case when linked_document_id is not null then 'satisfied' else 'active' end,transaction_required_document_id=r_id,metadata=metadata||jsonb_build_object('required',coalesce((item->>'required')::boolean,true)),updated_at=now()
      where bond_application_id=a.id and participant_id=p.id and requirement_key=item->>'key' and source='guided_rule' and status not in ('superseded','waived');
    if not found and not exists(select 1 from public.bond_application_document_requirements where bond_application_id=a.id and participant_id=p.id and requirement_key=item->>'key' and status<>'superseded') then insert into public.bond_application_document_requirements(bond_application_id,participant_id,requirement_key,canonical_document_type,rule_set_version,required_before,satisfaction_mode,transaction_required_document_id,metadata)
      values(a.id,p.id,item->>'key',coalesce(item->>'canonicalDocumentType',item->>'key'),coalesce(item->>'ruleSetVersion','phase-4-v1'),coalesce(item->>'requiredBefore','required_before_bank_submission'),coalesce(item->>'satisfactionMode','uploaded'),r_id,jsonb_build_object('required',coalesce((item->>'required')::boolean,true))); end if;
  end loop;
  update public.bond_application_document_requirements b set linked_document_id=t.uploaded_document_id,linked_at=t.uploaded_at,status='satisfied',updated_at=now()
    from public.transaction_required_documents t where b.bond_application_id=a.id and b.transaction_required_document_id=t.id and t.is_uploaded=true and t.uploaded_document_id is not null and b.status not in ('inactive','superseded','waived');
  update public.bond_application_document_requirements set status='inactive',inactive_at=now(),updated_at=now() where bond_application_id=a.id and participant_id=p.id and source='guided_rule' and status in ('active','satisfied') and not(requirement_key=any(keys));
  update public.transaction_required_documents t set enabled=false,is_required=false,status=case when is_uploaded then status else 'not_required' end where t.reconciliation_source='buyer_bond_application_runtime' and exists(select 1 from public.bond_application_document_requirements r where r.bond_application_id=a.id and r.transaction_required_document_id=t.id and r.source='guided_rule' and r.status='inactive') and not exists(select 1 from public.bond_application_document_requirements r where r.transaction_required_document_id=t.id and r.status not in ('inactive','superseded'));
  update public.transaction_required_documents t set enabled=true,is_required=(select coalesce((r.metadata->>'required')::boolean,true) from public.bond_application_document_requirements r where r.bond_application_id=a.id and r.transaction_required_document_id=t.id and r.source='guided_rule' and r.status in ('active','satisfied') limit 1) where t.reconciliation_source='buyer_bond_application_runtime' and exists(select 1 from public.bond_application_document_requirements r where r.bond_application_id=a.id and r.transaction_required_document_id=t.id and r.source='guided_rule' and r.status in ('active','satisfied'));
  update public.document_requirement_instances i set status='not_applicable' where i.transaction_id=a.transaction_id and i.source_system='buyer_bond_application_runtime' and i.status not in ('approved','completed','waived','not_applicable') and not exists(select 1 from public.transaction_required_documents t join public.bond_application_document_requirements r on r.transaction_required_document_id=t.id where t.canonical_requirement_instance_id=i.id and r.status not in ('inactive','superseded'));
  return public.bridge_buyer_bond_application_runtime_context();
end $$;

-- Only fresh objects under this exact application's prefix may be uploaded.
create or replace function public.bridge_buyer_bond_application_storage_can_insert(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.bond_applications%rowtype;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id();
  return a.status not in ('cancelled','preparing_submission','awaiting_signatures') and (a.locked_at is null or a.status='submitted')
    and p_name like 'client-portal/'||a.transaction_id::text||'/'||a.id::text||'/%' and p_name!~'(^|/)[.]{1,2}(/|$)';
exception when insufficient_privilege or no_data_found then return false;
end $$;
create policy buyer_bond_application_scoped_storage_insert on storage.objects for insert to anon,authenticated with check(bucket_id='documents' and public.bridge_buyer_bond_application_storage_can_insert(name));

-- Failed metadata writes may remove only an unlinked fresh object owned by
-- this application. Linked evidence cannot be deleted by this adapter.
create or replace function public.bridge_buyer_bond_application_storage_can_remove(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select public.bridge_buyer_bond_application_storage_can_insert(p_name)
    and not exists(select 1 from public.documents where file_path=p_name);
$$;
create policy buyer_bond_application_scoped_storage_cleanup_select on storage.objects for select to anon,authenticated using(bucket_id='documents' and public.bridge_buyer_bond_application_storage_can_remove(name));
create policy buyer_bond_application_scoped_storage_cleanup_delete on storage.objects for delete to anon,authenticated using(bucket_id='documents' and public.bridge_buyer_bond_application_storage_can_remove(name));
revoke all on function public.bridge_buyer_bond_application_storage_can_remove(text) from public;
grant execute on function public.bridge_buyer_bond_application_storage_can_remove(text) to anon,authenticated;

create or replace function public.bridge_upload_buyer_bond_application_document(p_requirement_key text,p_path text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications%rowtype; r public.bond_application_document_requirements%rowtype; l public.client_portal_links%rowtype; headers jsonb; result jsonb;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id() for update;
  if not public.bridge_buyer_bond_application_storage_can_insert(p_path) then raise exception 'Application file access denied.' using errcode='42501'; end if;
  select * into r from public.bond_application_document_requirements where bond_application_id=a.id and (participant_id is null or participant_id in (select id from public.bond_application_participants where bond_application_id=a.id and role='primary_applicant' and removed_at is null)) and requirement_key=p_requirement_key and status not in ('inactive','superseded','waived') limit 1;
  if r.id is null then raise exception 'This document is not required for the application.' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='documents' and name=p_path) then raise exception 'The uploaded file was not found.' using errcode='23514'; end if;
  select lnk.* into l from public.client_portal_links lnk join public.transactions t on t.id=lnk.transaction_id where lnk.transaction_id=a.transaction_id and lnk.is_active=true and (lnk.expires_at is null or lnk.expires_at>now()) and t.buyer_id is not distinct from lnk.buyer_id and t.development_id is not distinct from lnk.development_id and t.unit_id is not distinct from lnk.unit_id limit 1;
  if l.id is null then raise exception 'Your representative must restore buyer portal access before uploads can be linked.' using errcode='23514'; end if;
  -- The credential is used only inside this transaction for the existing atomic
  -- canonical upload operation, then restored; it is never sent to the browser.
  headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  perform set_config('request.headers',(headers||jsonb_build_object('x-bridge-client-portal-token',l.token))::text,true);
  result:=public.bridge_upload_buyer_portal_document(a.transaction_id,p_path,'documents',p_name,'Bond application documents',r.canonical_document_type,p_requirement_key);
  perform set_config('request.headers',headers::text,true);
  return result;
end $$;


create or replace function public.bridge_submit_buyer_bond_application(p_revision integer,p_snapshot_canonical text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications%rowtype; s public.transaction_bond_application_submissions%rowtype; ctx jsonb; snap jsonb; version integer; k text; personal jsonb;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id() for update;
  -- A retry after an uncertain response returns the committed immutable submission.
  if a.status='submitted' and a.active_submission_id is not null then
    select * into s from public.transaction_bond_application_submissions where id=a.active_submission_id and bond_application_id=a.id;
    return jsonb_build_object('submission',to_jsonb(s)-'snapshot_json'-'declarations_json'-'signer_manifest_json'-'document_manifest_json'-'metadata');
  end if;
  if a.status in ('cancelled','preparing_submission','awaiting_signatures') or a.locked_at is not null then raise exception 'The application is locked.' using errcode='23514'; end if;
  if p_revision is distinct from a.revision then raise exception 'The saved application changed. Review it again.' using errcode='40001'; end if;
  if p_snapshot_canonical is null or length(p_snapshot_canonical)>2097152 then raise exception 'Application snapshot is too large.' using errcode='22023'; end if;
  snap:=p_snapshot_canonical::jsonb;
  if jsonb_typeof(snap) is distinct from 'object' or jsonb_typeof(snap->'declarations') is distinct from 'array' or jsonb_typeof(snap->'documentManifest') is distinct from 'array' or jsonb_typeof(snap->'signerManifest') is distinct from 'array' or jsonb_typeof(snap->'participants') is distinct from 'array' or jsonb_array_length(snap->'signerManifest')<>1 or jsonb_array_length(snap->'participants')<>1 then raise exception 'Invalid application snapshot.' using errcode='22023'; end if;
  ctx:=public.bridge_buyer_bond_application_runtime_context();
  if snap#>>'{transaction,id}' is distinct from a.transaction_id::text then raise exception 'Application transaction mismatch.' using errcode='42501'; end if;
  if exists(select 1 from public.bond_application_participants where bond_application_id=a.id and role<>'primary_applicant' and status not in ('removed','declined')) then raise exception 'Joint and surety submissions must use the participant signing workflow.' using errcode='23514'; end if;
  personal:=ctx#>'{primarySections,personal_contact,personal}';
  if coalesce(personal->>'first_name','')='' or coalesce(personal->>'surname','')='' or (coalesce(personal->>'identity_number','')='' and coalesce(personal->>'passport_number','')='') or coalesce(ctx#>>'{primarySections,personal_contact,contact,email}','')='' or coalesce(ctx#>>'{primarySections,personal_contact,contact,phone}','')='' or coalesce((ctx#>>'{sharedSections,application_finance,requestedBondAmount}')::numeric,0)<=0 then raise exception 'Required applicant and finance details are missing.' using errcode='23514'; end if;
  if snap->>'applicationIntent' is distinct from ctx#>>'{sharedSections,application_intent,intent}' or snap#>>'{signerManifest,0,participantRole}' is distinct from 'primary_applicant' or snap#>>'{signerManifest,0,email}' is distinct from ctx#>>'{primarySections,personal_contact,contact,email}' or snap#>>'{signerManifest,0,identityReference}' is distinct from coalesce(nullif(personal->>'identity_number',''),personal->>'passport_number') then raise exception 'Application signer mismatch.' using errcode='42501'; end if;
  if personal is null or snap#>'{applicant,personal}' is distinct from personal
    or snap#>'{applicant,contact}' is distinct from ctx#>'{primarySections,personal_contact,contact}'
    or snap->'purchaserEntity' is distinct from ctx#>'{sharedSections,buyer_entity}'
    or snap->'finance' is distinct from ctx#>'{sharedSections,application_finance}'
    or snap->'property' is distinct from ctx#>'{sharedSections,shared_property_summary}'
    or snap#>'{applicant,address}' is distinct from ctx#>'{primarySections,address_residency,address}'
    or snap#>'{applicant,marital}' is distinct from ctx#>'{primarySections,marital_details,marital}'
    or snap->'employmentAndIncome' is distinct from ctx#>'{primarySections,employment_income}'
    or snap->'monthlyCommitments' is distinct from ctx#>'{primarySections,monthly_commitments,monthlyCommitments}'
    or snap->'accountsAndAssets' is distinct from ctx#>'{primarySections,accounts_assets}'
    or snap->'creditDeclarations' is distinct from ctx#>'{primarySections,credit_history,credit}'
    or snap->'selectedBanks' is distinct from ctx#>'{sharedSections,selected_banks}' then raise exception 'Reviewed answers differ from the saved application.' using errcode='40001'; end if;
  if snap->>'applicationIntent'<>'pre_approval' and (jsonb_typeof(snap->'selectedBanks') is distinct from 'array' or jsonb_array_length(snap->'selectedBanks')=0) then raise exception 'Select at least one bank before signing.' using errcode='23514'; end if;
  if snap#>'{participants,0,answers,personal}' is distinct from personal or snap#>'{participants,0,answers,contact}' is distinct from ctx#>'{primarySections,personal_contact,contact}' then raise exception 'Participant answers mismatch.' using errcode='40001'; end if;
  if coalesce(snap#>>'{signatureEvidence,confirmed}','false')<>'true'
    or coalesce(snap#>>'{signatureEvidence,dataUrl}','')!~'^data:image/png;base64,[A-Za-z0-9+/=]+$'
    or snap->'signatureEvidence' is distinct from ctx#>'{draft,_meta,bond_application_html_signature}' then raise exception 'A confirmed saved signature is required.' using errcode='23514'; end if;
  foreach k in array array['loan_processing_consent','credit_bureau_fraud_bank_data_consent','insurance_third_party_communication_consent','application_information_accuracy'] loop
    if not exists(select 1 from jsonb_array_elements(snap->'declarations') d where d->>'key'=k and d->>'accepted'='true' and d->>'contractVersion'='phase-6-v1' and d->>'version'='2026-07' and d->>'text'=('{"loan_processing_consent":"I consent to loan processing and affordability assessment.","credit_bureau_fraud_bank_data_consent":"I consent to credit bureau, fraud, and bank data retrieval checks.","insurance_third_party_communication_consent":"I consent to related insurance and third-party communication where required.","nhfc_first_home_finance_consent":"I consent to First Home Finance / NHFC processing where applicable.","application_information_accuracy":"I confirm that all information submitted is true and complete.","marketing_privacy_preference":"I agree to receive relevant marketing communication where permitted."}'::jsonb->>k)) then raise exception 'Required declarations have not been accepted.' using errcode='23514'; end if;
  end loop;
  -- Applicant signing does not submit to a bank. Missing supporting files remain
  -- canonical requirements that the originator must satisfy before bank submission.
  if exists(select 1 from jsonb_array_elements(snap->'documentManifest') m where m->>'matchedDocumentId' is not null and not exists(select 1 from public.bond_application_document_requirements r where r.bond_application_id=a.id and r.linked_document_id::text=m->>'matchedDocumentId')) then raise exception 'Supporting document mismatch.' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements(snap->'documentManifest') m cross join lateral jsonb_array_elements(coalesce(m->'documents','[]'::jsonb)) f where not exists(select 1 from jsonb_array_elements(ctx->'documents') d where d->>'id'=f->>'id' and coalesce(d->>'file_path','')=coalesce(f->>'filePath',''))) then raise exception 'Reviewed document evidence mismatch.' using errcode='42501'; end if;
  select coalesce(max(submission_version),0)+1 into version from public.transaction_bond_application_submissions where transaction_id=a.transaction_id;
  if (snap->>'submissionVersion')::integer is distinct from version then raise exception 'Submission version changed. Review again.' using errcode='40001'; end if;
  insert into public.transaction_bond_application_submissions(transaction_id,onboarding_form_data_id,bond_application_id,source_application_revision,submission_version,application_schema_version,flow_version,document_rule_set_version,declaration_contract_version,status,snapshot_json,snapshot_hash,source_application_hash,declarations_json,document_manifest_json,selected_bank_ids,signer_manifest_json,prepared_at,signed_at,submitted_at,metadata)
    values(a.transaction_id,a.onboarding_form_data_id,a.id,a.revision,version,snap#>>'{versions,applicationSchemaVersion}',snap#>>'{versions,flowVersion}',snap#>>'{versions,documentRuleSetVersion}',snap#>>'{versions,declarationContractVersion}','submitted',snap,
      encode(extensions.digest(p_snapshot_canonical,'sha256'),'hex'),coalesce(nullif(snap#>>'{source,sourceHash}',''),encode(extensions.digest((ctx->'draft')::text,'sha256'),'hex')),
      snap->'declarations',snap->'documentManifest',snap->'selectedBanks',snap->'signerManifest',now(),now(),now(),jsonb_build_object('signingMethod','html_canvas','source','buyer_bond_application_runtime')) returning * into s;
  update public.onboarding_form_data set form_data=jsonb_set(form_data,'{bond_application,status}','"Submitted"'::jsonb,true),updated_at=now() where id=a.onboarding_form_data_id and transaction_id=a.transaction_id;
  update public.bond_applications set status='submitted',active_submission_id=s.id,submitted_at=now(),locked_at=now(),updated_at=now() where id=a.id;
  return jsonb_build_object('submission',to_jsonb(s)-'snapshot_json'-'declarations_json'-'signer_manifest_json'-'document_manifest_json'-'metadata');
end $$;

create or replace function public.bridge_cancel_buyer_bond_application_submission(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications%rowtype; s public.transaction_bond_application_submissions%rowtype;
begin
  select * into a from public.bond_applications where id=public.bridge_buyer_bond_application_runtime_id() for update;
  select * into s from public.transaction_bond_application_submissions where id=p_submission_id and bond_application_id=a.id and transaction_id=a.transaction_id for update;
  if s.id is null or s.status not in ('draft','preparing','awaiting_signature','failed') or a.status='submitted' or a.active_submission_id is distinct from s.id then raise exception 'This submission cannot be reopened.' using errcode='23514'; end if;
  if s.signing_request_id is not null then update public.document_packet_signers set status='expired',signing_token=null,token_expires_at=null where packet_id=s.signing_request_id and status<>'signed'; end if;
  update public.transaction_bond_application_submissions set status='cancelled',cancelled_at=now() where id=s.id returning * into s;
  update public.bond_applications set status='draft',active_submission_id=null,locked_at=null,revision=revision+1,updated_at=now() where id=a.id;
  return jsonb_build_object('submission',to_jsonb(s)-'snapshot_json'-'declarations_json'-'signer_manifest_json'-'document_manifest_json'-'metadata');
end $$;
revoke all on function public.bridge_submit_buyer_bond_application(integer,text),public.bridge_cancel_buyer_bond_application_submission(uuid) from public;
grant execute on function public.bridge_submit_buyer_bond_application(integer,text),public.bridge_cancel_buyer_bond_application_submission(uuid) to anon,authenticated;

revoke all on function public.bridge_buyer_bond_application_runtime_context(),public.bridge_save_buyer_bond_application_draft(jsonb,integer,jsonb,jsonb),public.bridge_reconcile_buyer_bond_application_documents(jsonb),public.bridge_upload_buyer_bond_application_document(text,text,text),public.bridge_buyer_bond_application_storage_can_insert(text) from public;
grant execute on function public.bridge_buyer_bond_application_runtime_context(),public.bridge_save_buyer_bond_application_draft(jsonb,integer,jsonb,jsonb),public.bridge_reconcile_buyer_bond_application_documents(jsonb),public.bridge_upload_buyer_bond_application_document(text,text,text),public.bridge_buyer_bond_application_storage_can_insert(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
