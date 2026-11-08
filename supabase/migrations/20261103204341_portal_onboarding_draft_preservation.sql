begin;
-- Preserve the existing buyer identity, nonce, revision and document guards.
-- This correction changes future saves only; it rewrites no historical rows.
CREATE OR REPLACE FUNCTION public.bridge_save_buyer_onboarding_snapshot(p_form_data jsonb, p_snapshot jsonb, p_funding_sources jsonb DEFAULT '[]'::jsonb, p_submit boolean DEFAULT false, p_next_action text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_current public.transactions%rowtype; v_snapshot jsonb := coalesce(p_snapshot,'{}'::jsonb); tx uuid; c jsonb; f public.onboarding_form_data%rowtype; result jsonb; fields jsonb; merged jsonb; bid uuid; pid uuid; b jsonb;
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

 -- Personal-detail drafts cannot move a completed workflow backwards. Read
 -- under the transaction lock already held by buyer_capture_private.context.
 select * into v_current from public.transactions where id=tx;
 if (not p_submit and nullif(v_current.onboarding_status,'') is not null)
   or lower(coalesce(v_current.onboarding_status,'')) in ('signed_otp_received','otp_uploaded')
   or upper(coalesce(v_current.current_main_stage,'')) in ('FIN','ATTY','XFER','REG') then
  v_snapshot:=v_snapshot || jsonb_build_object(
    'onboarding_status',v_current.onboarding_status,
    'onboarding_completed_at',v_current.onboarding_completed_at,
    'external_onboarding_submitted_at',v_current.external_onboarding_submitted_at);
 end if;
 -- Signed-OTP finance is maintained through guarded deal setup, not through
 -- stale buyer profile answers. Keep both the typed row and form mirror current.
 if lower(coalesce(v_current.onboarding_status,'')) in ('signed_otp_received','otp_uploaded')
   or upper(coalesce(v_current.current_main_stage,'')) in ('FIN','ATTY','XFER','REG') then
  if nullif(v_current.purchaser_type,'') is not null
    and nullif(p_form_data->>'purchaser_type','') is not null
    and p_form_data->>'purchaser_type' is distinct from v_current.purchaser_type then
   raise exception using errcode='PT409',message='The buyer legal type changed. Reload the latest buyer details before saving.';
  end if;
  v_snapshot:=v_snapshot || jsonb_build_object(
    'finance_type',v_current.finance_type,
    'finance_managed_by',v_current.finance_managed_by,
    'sales_price',v_current.sales_price,
    'purchase_price',v_current.purchase_price,
    'cash_amount',v_current.cash_amount,
    'bond_amount',v_current.bond_amount,
    'deposit_amount',v_current.deposit_amount,
    'reservation_required',v_current.reservation_required,
    'reservation_amount',v_current.reservation_amount,
    'reservation_status',v_current.reservation_status,
    'reservation_paid_date',v_current.reservation_paid_date,
    'purchaser_type',v_current.purchaser_type);
  merged:=merged || jsonb_build_object(
    'purchase_finance_type',v_current.finance_type,
    'purchase_price',v_current.purchase_price,
    'cash_amount',v_current.cash_amount,
    'bond_amount',v_current.bond_amount,
    'deposit_amount',v_current.deposit_amount,
    'reservation_required',v_current.reservation_required,
    'reservation_amount',v_current.reservation_amount,
    'reservation_status',v_current.reservation_status,
    'reservation_paid_date',v_current.reservation_paid_date,
    'purchaser_type',v_current.purchaser_type,
    'finance_managed_by',v_current.finance_managed_by,
    'financeManagedBy',v_current.finance_managed_by);
  merged:=jsonb_set(merged,'{finance}',
    (case when jsonb_typeof(merged->'finance')='object' then merged->'finance' else '{}'::jsonb end)
      || jsonb_build_object('finance_managed_by',v_current.finance_managed_by,'financeManagedBy',v_current.finance_managed_by));
 end if;
 result:=public.bridge_save_buyer_onboarding_snapshot_internal(merged,v_snapshot,p_funding_sources,p_submit,p_next_action) #- '{onboarding,token}';
 if bid is not null then
  fields:=buyer_capture_private.person_fields(p_form_data);
  b:=c->'buyer';
  if merged->>'purchaser_type'='company' then
   b:=b || jsonb_build_object('name',coalesce(nullif(p_form_data->>'company_name',''),b->>'name'),'email',coalesce(p_form_data->>'company_contact_email',p_form_data#>>'{company,authorised_signatory_email}',b->>'email'),'phone',coalesce(p_form_data->>'company_contact_phone',p_form_data#>>'{company,authorised_signatory_phone}',b->>'phone'));
  elsif merged->>'purchaser_type'='trust' then
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
end $function$
;
commit;
