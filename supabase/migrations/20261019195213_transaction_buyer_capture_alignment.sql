begin;
-- One buyer identity and draft for agent capture and buyer self-service. Draft
-- saves do not submit onboarding, change journey stages, or create CRM leads.
create schema if not exists buyer_capture_private;
revoke all on schema buyer_capture_private from public, anon, authenticated;
create table buyer_capture_private.receipts (
 mutation_id uuid primary key, transaction_id uuid not null, actor_id uuid not null,
 request jsonb not null, receipt jsonb not null
);
create function buyer_capture_private.person_fields(data jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(data,'{}'))
 where key=any(array['purchaser_type','first_name','last_name','email','phone','full_name','physical_address','spouse_identity_number','personal_details','date_of_birth','identity_number','residency_status','nationality','residential_address','postal_address','tax_number','occupation','income_source','married_coc_details','spouse_full_name','spouse_id_number','spouse_phone','spouse_email','spouse_residential_address','marriage_date','married_anc_details','spouse_is_co_purchaser','anc_available','company_entity','company','company_name','company_registration_number','vat_number','company_registered_address','company_business_address','nature_of_business','company_tax_number','company_contact_name','company_contact_email','company_contact_phone','authorised_signatory_capacity','board_resolution_available','directors','id_number','role_title','signing_authority','trust_entity','trust','trust_name','trust_registration_number','trust_type','masters_office_reference','trust_registered_address','trust_tax_number','trust_contact_name','trust_contact_email','trust_contact_phone','trust_deed_available','letters_of_authority_available','trust_resolution_available','all_trustees_signing','trustees','purchasers','purchaser_entity_type','natural_person_purchase_mode','passport_number','street_address','suburb','city','postal_code','marital_status','marital_regime','ownership_share','consent_to_purchase','employment_type','employer_name','job_title','employment_start_date','business_name','years_in_business','gross_monthly_income','net_monthly_income','income_frequency','number_of_dependants','monthly_credit_commitments','monthly_living_expenses','first_time_buyer','primary_residence','investment_purchase','under_debt_review','under_administration','ever_declared_insolvent','surety_obligations','authorised_signatory_name','authorised_signatory_identity_number','authorised_signatory_email','authorised_signatory_phone','authorised_trustee_name','authorised_trustee_identity_number','authorised_trustee_email','authorised_trustee_phone']);
$$;
create function buyer_capture_private.context(p_tx uuid,p_participant uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.transactions%rowtype; p public.transaction_participants%rowtype;
 b public.buyers%rowtype; f public.onboarding_form_data%rowtype; d public.buyer_profile_data%rowtype;
 roster jsonb; answers jsonb; owns_form boolean; bid uuid;
begin
 select * into t from public.transactions where id=p_tx for update;
 if not found then raise exception 'Transaction not found.'; end if;
 perform 1 from public.transaction_participants where transaction_id=p_tx and transaction_role='buyer' and removed_at is null order by id for update;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into roster from public.transaction_participants x
 where transaction_id=p_tx and transaction_role='buyer' and removed_at is null;
 if p_participant is not null then
  select * into p from public.transaction_participants where id=p_participant and transaction_id=p_tx and transaction_role='buyer' and removed_at is null;
  if not found then raise exception 'This buyer is no longer attached to the transaction.'; end if;
 else
  select * into p from public.transaction_participants where transaction_id=p_tx and transaction_role='buyer' and removed_at is null and is_primary_buyer;
  if (select count(*) from public.transaction_participants where transaction_id=p_tx and transaction_role='buyer' and removed_at is null and is_primary_buyer)>1 then
   raise exception 'Choose one primary buyer before capturing onboarding.';
  end if;
  if p.id is null and jsonb_array_length(roster)>0 then raise exception 'Choose a buyer before capturing onboarding.'; end if;
 end if;
 if p.is_primary_buyer and t.buyer_id is not null and p.buyer_party_id is not null and t.buyer_id<>p.buyer_party_id then
  raise exception 'The transaction and primary buyer refer to different profiles. Resolve the buyer link before continuing.';
 end if;
 bid:=coalesce(p.buyer_party_id,case when p.id is null or p.is_primary_buyer then t.buyer_id end);
 select * into b from public.buyers where id=bid for update;
 if bid is not null and (b.id is null or b.organisation_id is distinct from t.organisation_id) then raise exception 'The buyer profile does not belong to this transaction organisation.'; end if;
 select * into d from public.buyer_profile_data where buyer_id=bid for update;
 select * into f from public.onboarding_form_data where transaction_id=p_tx for update;
 owns_form:=case when coalesce(f.form_data->>'buyerParticipantId',f.form_data->>'buyer_participant_id') is not null
   then coalesce(f.form_data->>'buyerParticipantId',f.form_data->>'buyer_participant_id')=p.id::text
  when coalesce(f.form_data->>'buyerPartyId',f.form_data->>'buyer_party_id') is not null
   then coalesce(f.form_data->>'buyerPartyId',f.form_data->>'buyer_party_id')=bid::text
  else coalesce(p.is_primary_buyer,p.id is null) end;
 if owns_form and bid is not null and coalesce(f.form_data->>'buyerPartyId',f.form_data->>'buyer_party_id') is not null and coalesce(f.form_data->>'buyerPartyId',f.form_data->>'buyer_party_id')<>bid::text then raise exception 'The saved buyer answers belong to a different buyer profile.'; end if;
 answers:=coalesce(d.profile_data,'{}') || case when owns_form then buyer_capture_private.person_fields(f.form_data) else '{}'::jsonb end;
 return jsonb_build_object('transactionId',p_tx,'participantId',p.id,'buyerId',bid,'roster',roster,
  'buyer',jsonb_build_object('name',coalesce(b.name,p.participant_name,''),'email',coalesce(b.email,p.participant_email,''),'phone',coalesce(b.phone,p.participant_phone,'')),
  'profile',answers,'purchaserType',coalesce(answers->>'purchaser_type',t.purchaser_type,'individual'),
  'revision',jsonb_build_object('transactionUpdatedAt',t.updated_at,'formUpdatedAt',f.updated_at,'profileVersion',d.profile_version,'profileUpdatedAt',d.updated_at,'roster',roster));
end $$;
create function public.bridge_get_transaction_buyer_capture(p_transaction_id uuid,p_participant_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not coalesce(public.bridge_has_transaction_permission(p_transaction_id,'edit_core_transaction'),false) then
  raise exception using errcode='42501',message='Buyer capture is not permitted.'; end if;
 return buyer_capture_private.context(p_transaction_id,p_participant_id);
end $$;
create function public.bridge_save_transaction_buyer_capture(p_transaction_id uuid,p_participant_id uuid,p_revision jsonb,p_buyer jsonb,p_profile jsonb,p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; result jsonb; replay buyer_capture_private.receipts%rowtype;
 request jsonb:=jsonb_build_object('participant',p_participant_id,'revision',p_revision,'buyer',p_buyer,'profile',p_profile);
 bid uuid; pid uuid; t public.transactions%rowtype; f jsonb; fields jsonb; now_at timestamptz:=clock_timestamp(); is_primary boolean;
begin
 if auth.uid() is null or p_mutation_id is null or not coalesce(public.bridge_has_transaction_permission(p_transaction_id,'edit_core_transaction'),false) then
  raise exception using errcode='42501',message='Buyer capture is not permitted.'; end if;
 c:=buyer_capture_private.context(p_transaction_id,p_participant_id);
 select * into replay from buyer_capture_private.receipts where mutation_id=p_mutation_id;
 if found then
  if replay.actor_id<>auth.uid() or replay.transaction_id<>p_transaction_id or replay.request<>request then raise exception using errcode='PT409',message='This save reference belongs to a different change.'; end if;
  return replay.receipt;
 end if;
 if c->'revision' is distinct from p_revision then raise exception using errcode='PT409',message='Buyer details changed. Reload the latest saved details before saving your changes.'; end if;
 if coalesce(jsonb_typeof(p_buyer),'')<>'object' or coalesce(jsonb_typeof(p_profile),'')<>'object' or nullif(trim(p_buyer->>'name'),'') is null then raise exception 'Enter the buyer name before saving.'; end if;
 select * into t from public.transactions where id=p_transaction_id;
 bid:=(c->>'buyerId')::uuid; pid:=(c->>'participantId')::uuid;
 if bid is null then
  -- Never silently attach an unrelated profile by a shared name/email.
  if exists(select 1 from public.buyers where organisation_id=t.organisation_id and
    (nullif(trim(p_buyer->>'email'),'') is not null and lower(email)=lower(trim(p_buyer->>'email')) or nullif(trim(p_buyer->>'phone'),'') is not null and phone=trim(p_buyer->>'phone'))) then
   raise exception using errcode='PT409',message='An existing buyer matches these contact details. Link that profile before capturing onboarding.';
  end if;
  insert into public.buyers(organisation_id,name,email,phone) values(t.organisation_id,trim(p_buyer->>'name'),nullif(lower(trim(p_buyer->>'email')),''),nullif(trim(p_buyer->>'phone'),'')) returning id into bid;
 else
  update public.buyers set name=trim(p_buyer->>'name'),email=nullif(lower(trim(p_buyer->>'email')),''),phone=nullif(trim(p_buyer->>'phone'),'') where id=bid;
 end if;
 update public.transaction_participants set participant_name=trim(p_buyer->>'name'),participant_email=nullif(lower(trim(p_buyer->>'email')),''),participant_phone=nullif(trim(p_buyer->>'phone'),''),updated_at=now_at where buyer_party_id=bid and removed_at is null;
 if pid is null then
  insert into public.transaction_participants(transaction_id,transaction_role,role_type,legal_role,buyer_party_id,participant_name,participant_email,participant_phone,is_primary_buyer,buyer_party_position,signing_required,status,buyer_party_role,buyer_source)
  values(p_transaction_id,'buyer','buyer','none',bid,trim(p_buyer->>'name'),nullif(lower(trim(p_buyer->>'email')),''),nullif(trim(p_buyer->>'phone'),''),true,0,true,'active','primary_buyer','agent_manual') returning id into pid;
 else
  update public.transaction_participants set buyer_party_id=bid,participant_name=trim(p_buyer->>'name'),participant_email=nullif(lower(trim(p_buyer->>'email')),''),participant_phone=nullif(trim(p_buyer->>'phone'),''),updated_at=now_at where id=pid;
 end if;
 select is_primary_buyer into is_primary from public.transaction_participants where id=pid;
 if is_primary then update public.transactions set buyer_id=bid,primary_buyer_participant_id=pid,updated_at=now_at where id=p_transaction_id; end if;
 fields:=buyer_capture_private.person_fields(p_profile) || jsonb_build_object('full_name',trim(p_buyer->>'name'),'email',coalesce(p_buyer->>'email',''),'phone',coalesce(p_buyer->>'phone',''));

 if fields ? 'residential_address' then fields:=fields || jsonb_build_object('street_address',fields->'residential_address'); end if;
 if fields ? 'spouse_id_number' then fields:=fields || jsonb_build_object('spouse_identity_number',fields->'spouse_id_number'); end if;
 -- Drop answers belonging to a different entity branch while retaining shared
 -- identity and contact fields. A type switch must not resurrect an old form.
 fields:=(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(fields)
  where case coalesce(fields->>'purchaser_type',t.purchaser_type,'individual')
   when 'company' then key not in ('trust','trustees','purchasers') and left(key,6)<>'trust_' and left(key,19)<>'authorised_trustee_'
   when 'trust' then key not in ('company','directors','purchasers') and left(key,8)<>'company_' and left(key,21)<>'authorised_signatory_'
   else key not in ('company','trust','directors','trustees') and left(key,8)<>'company_' and left(key,6)<>'trust_' and left(key,19)<>'authorised_trustee_' and left(key,21)<>'authorised_signatory_' end);
 fields:=fields || jsonb_build_object('purchaser_entity_type',case when fields->>'purchaser_type' in ('company','trust') then fields->>'purchaser_type' else 'individual' end);
 if is_primary then update public.transactions set purchaser_type=coalesce(fields->>'purchaser_type',purchaser_type) where id=p_transaction_id; end if;
 -- Keep the legacy flat questions and current structured onboarding questions
 -- on the same answers. Do not manufacture signatures or completion evidence.
 if coalesce(fields->>'purchaser_type',t.purchaser_type,'individual') not in ('company','trust') then
  fields:=fields || jsonb_build_object('first_name',coalesce(nullif(fields->>'first_name',''),trim(p_buyer->>'name')),'last_name',coalesce(fields->>'last_name',''));
  fields:=fields || jsonb_build_object('purchasers',jsonb_build_array(coalesce(fields#>'{purchasers,0}','{}') || (fields - 'purchasers')) || coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(coalesce(fields->'purchasers','[]')) with ordinality where ordinality>1),'[]'));
 elsif fields->>'purchaser_type'='company' then
  fields:=fields || jsonb_build_object('company_name',trim(p_buyer->>'name'),'company_contact_email',coalesce(p_buyer->>'email',''),'company_contact_phone',coalesce(p_buyer->>'phone',''));
  fields:=fields || jsonb_build_object('company',coalesce(fields->'company','{}') || (fields - 'company' - 'trust' - 'purchasers'));
 elsif fields->>'purchaser_type'='trust' then
  fields:=fields || jsonb_build_object('trust_name',trim(p_buyer->>'name'),'trust_contact_email',coalesce(p_buyer->>'email',''),'trust_contact_phone',coalesce(p_buyer->>'phone',''));
  fields:=fields || jsonb_build_object('trust',coalesce(fields->'trust','{}') || (fields - 'company' - 'trust' - 'purchasers'));
 end if;
 insert into public.buyer_profile_data(buyer_id,profile_data,profile_version,updated_by,updated_at)
 values(bid,fields,1,auth.uid(),now_at) on conflict(buyer_id) do update set
 profile_data=(buyer_profile_data.profile_data - array(select key from jsonb_each(buyer_capture_private.person_fields(buyer_profile_data.profile_data)))) || excluded.profile_data,profile_version=buyer_profile_data.profile_version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 -- Primary answers are the same form the buyer link opens. Secondary answers
 -- remain scoped to their explicit profile, hydrated by the link read below.
 if is_primary then
  select form_data into f from public.onboarding_form_data where transaction_id=p_transaction_id;
  f:=(coalesce(f,'{}') - array(select key from jsonb_each(buyer_capture_private.person_fields(f)))) || fields || jsonb_build_object('buyerParticipantId',pid,'buyerPartyId',bid,'__bridge_agent_buyer_capture',true);
  f:=f || jsonb_build_object('__bridge_buyer_capture_revision',jsonb_build_object('formUpdatedAt',now_at,'profileVersion',(select profile_version from public.buyer_profile_data where buyer_id=bid)));
  insert into public.onboarding_form_data(transaction_id,purchaser_type,form_data,updated_at) values(p_transaction_id,coalesce(fields->>'purchaser_type',t.purchaser_type),f,now_at)
  on conflict(transaction_id) do update set form_data=excluded.form_data,purchaser_type=excluded.purchaser_type,updated_at=excluded.updated_at;
 end if;
 result:=buyer_capture_private.context(p_transaction_id,pid) || jsonb_build_object('mutationId',p_mutation_id);
 insert into buyer_capture_private.receipts values(p_mutation_id,p_transaction_id,auth.uid(),request,result);
 return result;
end $$;
-- Onboarding bearers can hydrate only profiles explicitly attached to their
-- transaction. Both supplied identifiers must agree; email is never a key.
create function buyer_capture_private.check_link_target(c jsonb,p_nonce text) returns void
language plpgsql security definer set search_path='' as $$
declare party jsonb; expected text;
begin
 select value into party from jsonb_array_elements(c->'roster') where value->>'id'=c->>'participantId';
 expected:=party#>>'{buyer_metadata,lastBuyerOnboardingLinkNonce}';
 if (party is not null and not coalesce((party->>'is_primary_buyer')::boolean,false)) or nullif(p_nonce,'') is not null then
  if nullif(expected,'') is null or expected is distinct from p_nonce then raise exception using errcode='42501',message='This buyer link has expired or belongs to another buyer. Request a fresh onboarding link.'; end if;
 end if;
end $$;
create function public.bridge_get_buyer_onboarding_capture(p_participant_id uuid default null,p_buyer_id uuid default null,p_target_nonce text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tx uuid; c jsonb; f public.onboarding_form_data%rowtype;
begin
 select transaction_id into tx from public.transaction_onboarding where token=public.bridge_onboarding_request_token() and is_active is true order by updated_at desc nulls last limit 1;
 if tx is null then select transaction_id into tx from public.client_portal_links where token=public.bridge_client_portal_request_token() and is_active is true order by updated_at desc nulls last limit 1; end if;
 if tx is null then raise exception using errcode='42501',message='An active buyer onboarding link is required.'; end if;
 c:=buyer_capture_private.context(tx,p_participant_id);
 perform buyer_capture_private.check_link_target(c,p_target_nonce);
 if p_buyer_id is not null and c->>'buyerId' is distinct from p_buyer_id::text then raise exception using errcode='42501',message='The buyer link identifiers do not match.'; end if;
 select * into f from public.onboarding_form_data where transaction_id=tx;
 return jsonb_build_object('profile',buyer_capture_private.person_fields(c->'profile'),'buyer',c->'buyer','participantId',c->'participantId','buyerId',c->'buyerId',
  'revision',jsonb_build_object('formUpdatedAt',f.updated_at,'profileVersion',c#>'{revision,profileVersion}'));
end $$;
-- Keep the established token validation, finance and submission semantics.
-- Fence stale forms, preserve seller/private data, and project the same buyer
-- answers atomically with the existing online save.
create or replace function public.bridge_save_buyer_onboarding_snapshot(p_form_data jsonb,p_snapshot jsonb,p_funding_sources jsonb default '[]',p_submit boolean default false,p_next_action text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tx uuid; c jsonb; f public.onboarding_form_data%rowtype; result jsonb; fields jsonb; merged jsonb; bid uuid; pid uuid; b jsonb;
begin
 select transaction_id into tx from public.transaction_onboarding where token=public.bridge_onboarding_request_token() and is_active is true order by updated_at desc nulls last limit 1;
 if tx is null then
  select transaction_id into tx from public.client_portal_links where token=public.bridge_client_portal_request_token() and is_active is true order by updated_at desc nulls last limit 1;
 end if;
 if tx is null then return public.bridge_save_buyer_onboarding_snapshot_internal(p_form_data,p_snapshot,p_funding_sources,p_submit,p_next_action) #- '{onboarding,token}'; end if;
 pid:=nullif(coalesce(p_form_data->>'buyerParticipantId',p_form_data->>'buyer_participant_id'),'')::uuid;
 c:=buyer_capture_private.context(tx,pid);
 perform buyer_capture_private.check_link_target(c,coalesce(p_form_data->>'buyerTargetNonce',p_form_data->>'buyer_target_nonce'));
 pid:=(c->>'participantId')::uuid; bid:=(c->>'buyerId')::uuid;
 if nullif(coalesce(p_form_data->>'buyerPartyId',p_form_data->>'buyer_party_id'),'') is not null and coalesce(p_form_data->>'buyerPartyId',p_form_data->>'buyer_party_id') is distinct from bid::text then raise exception using errcode='42501',message='The buyer identifiers do not match.'; end if;
 select * into f from public.onboarding_form_data where transaction_id=tx;
 if p_form_data ? '__bridge_buyer_capture_revision' then
  if p_form_data#>'{__bridge_buyer_capture_revision,formUpdatedAt}' is distinct from coalesce(to_jsonb(f.updated_at),'null'::jsonb)
   or p_form_data#>'{__bridge_buyer_capture_revision,profileVersion}' is distinct from c#>'{revision,profileVersion}' then
   raise exception using errcode='PT409',message='Buyer details changed while this form was open. Reload the latest details before saving.';
  end if;
 elsif f.form_data ? '__bridge_buyer_capture_revision' or coalesce((f.form_data->>'__bridge_agent_buyer_capture')::boolean,false) then
  raise exception using errcode='PT409',message='The agent updated buyer details. Reload this onboarding link before saving.';
 end if;
 merged:=coalesce(f.form_data,'{}') || (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(p_form_data) where left(key,9)<>'__bridge_');
 -- Private seller state and agent-only markers cannot be changed by a buyer.
 merged:=(merged - '__bridge_transaction_parties' - '__bridge_agent_buyer_capture') ||
   (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(f.form_data,'{}')) where key like '__bridge_%' and key<>'__bridge_buyer_capture_revision');
 merged:=merged || jsonb_build_object('__bridge_buyer_capture_revision',jsonb_build_object('formUpdatedAt',now(),'profileVersion',case when bid is null then null else coalesce((c#>>'{revision,profileVersion}')::integer,0)+1 end));
 result:=public.bridge_save_buyer_onboarding_snapshot_internal(merged,p_snapshot,p_funding_sources,p_submit,p_next_action) #- '{onboarding,token}';
 if bid is not null then
  fields:=buyer_capture_private.person_fields(p_form_data);
  b:=c->'buyer';
  if p_form_data->>'purchaser_type'='company' then
   b:=b || jsonb_build_object('name',coalesce(nullif(p_form_data->>'company_name',''),b->>'name'),'email',coalesce(p_form_data->>'company_contact_email',p_form_data#>>'{company,authorised_signatory_email}',b->>'email'),'phone',coalesce(p_form_data->>'company_contact_phone',p_form_data#>>'{company,authorised_signatory_phone}',b->>'phone'));
  elsif p_form_data->>'purchaser_type'='trust' then
   b:=b || jsonb_build_object('name',coalesce(nullif(p_form_data->>'trust_name',''),b->>'name'),'email',coalesce(p_form_data->>'trust_contact_email',p_form_data#>>'{trust,authorised_trustee_email}',b->>'email'),'phone',coalesce(p_form_data->>'trust_contact_phone',p_form_data#>>'{trust,authorised_trustee_phone}',b->>'phone'));
  else
   b:=b || jsonb_build_object('name',coalesce(nullif(trim(concat_ws(' ',p_form_data->>'first_name',p_form_data->>'last_name')),''),b->>'name'),'email',coalesce(p_form_data->>'email',b->>'email'),'phone',coalesce(p_form_data->>'phone',b->>'phone'));
  end if;
  fields:=fields || jsonb_build_object('full_name',b->>'name','email',b->>'email','phone',b->>'phone');
  update public.buyers set name=b->>'name',email=nullif(lower(trim(b->>'email')),''),phone=nullif(trim(b->>'phone'),'') where id=bid;
  update public.transaction_participants set participant_name=b->>'name',participant_email=nullif(lower(trim(b->>'email')),''),participant_phone=nullif(trim(b->>'phone'),''),updated_at=clock_timestamp() where buyer_party_id=bid and removed_at is null;

  insert into public.buyer_profile_data(buyer_id,profile_data,profile_version,updated_at) values(bid,fields,1,clock_timestamp())
  on conflict(buyer_id) do update set profile_data=(buyer_profile_data.profile_data - array(select key from jsonb_each(buyer_capture_private.person_fields(buyer_profile_data.profile_data)))) || excluded.profile_data,profile_version=buyer_profile_data.profile_version+1,updated_at=excluded.updated_at;
 end if;
 -- The next draft read uses the just-confirmed revision.
 select * into f from public.onboarding_form_data where transaction_id=tx;
 result:=result || jsonb_build_object('buyerCaptureRevision',jsonb_build_object('formUpdatedAt',f.updated_at,'profileVersion',(select profile_version from public.buyer_profile_data where buyer_id=bid)));
 return result;
end $$;
revoke all on function public.bridge_get_transaction_buyer_capture(uuid,uuid),public.bridge_save_transaction_buyer_capture(uuid,uuid,jsonb,jsonb,jsonb,uuid),public.bridge_get_buyer_onboarding_capture(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.bridge_get_transaction_buyer_capture(uuid,uuid),public.bridge_save_transaction_buyer_capture(uuid,uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
grant execute on function public.bridge_get_buyer_onboarding_capture(uuid,uuid,text) to anon,authenticated;
revoke all on all functions in schema buyer_capture_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
