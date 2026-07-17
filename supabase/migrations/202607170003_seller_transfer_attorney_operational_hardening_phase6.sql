begin;

-- Phase 6 makes the seller's final transferring-attorney choice operational.
-- This remains inside the token-guarded completion RPC so anonymous portal users
-- cannot create arbitrary internal tasks or activity records.
create or replace function public.bridge_update_private_listing_seller_onboarding_progress(
  p_token text,
  p_status text default 'in_progress',
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'in_progress');
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
  v_previous_decision jsonb := '{}'::jsonb;
  v_current_decision jsonb := '{}'::jsonb;
  v_change_dedupe_key text;
begin
  if v_status not in ('not_started', 'sent', 'in_progress', 'completed', 'rejected') then
    v_status := 'in_progress';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  v_previous_decision := coalesce(
    v_onboarding.form_data->'transferAttorneyDecision',
    v_onboarding.form_data->'transfer_attorney_decision',
    '{}'::jsonb
  );
  v_current_decision := coalesce(
    v_form_data->'transferAttorneyDecision',
    v_form_data->'transfer_attorney_decision',
    v_previous_decision,
    '{}'::jsonb
  );
  v_change_dedupe_key := 'seller-transfer-attorney-change:'
    || v_onboarding.private_listing_id::text || ':'
    || md5(v_previous_decision::text || '->' || v_current_decision::text);

  update public.private_listing_seller_onboarding
     set status = v_status,
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         updated_at = now()
   where id = v_onboarding.id;

  if v_status in ('sent', 'in_progress') then
    update public.private_listings
       set listing_status = case
             when listing_status = 'seller_lead' then 'onboarding_sent'
             else listing_status
           end,
           seller_onboarding_status = v_status,
           updated_at = now()
     where id = v_onboarding.private_listing_id;
  end if;

  if to_regclass('public.private_listing_activity') is not null
    and coalesce(v_previous_decision->>'decision', 'pending') <> 'pending'
    and v_previous_decision is distinct from v_current_decision then
    begin
      insert into public.private_listing_activity (
        private_listing_id,
        activity_type,
        activity_title,
        activity_description,
        visibility,
        metadata
      )
      select
        v_onboarding.private_listing_id,
        'transfer_attorney_decision_changed',
        'Seller changed the transferring attorney decision',
        'The seller changed their transferring attorney choice during onboarding.',
        'internal',
        jsonb_build_object(
          'workflow', 'seller_transfer_attorney',
          'decisionDedupeKey', v_change_dedupe_key,
          'previousDecision', v_previous_decision,
          'currentDecision', v_current_decision,
          'source', 'seller_portal_draft'
        )
      where not exists (
        select 1
        from public.private_listing_activity activity
        where activity.private_listing_id = v_onboarding.private_listing_id
          and activity.metadata->>'decisionDedupeKey' = v_change_dedupe_key
      );
    exception
      when undefined_table or undefined_column then
        null;
    end;
  end if;

  return public.bridge_private_listing_seller_portal_payload(p_token);
end;
$$;

grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text, text, jsonb, text, text, text)
  to anon, authenticated;

create or replace function public.bridge_complete_private_listing_seller_onboarding(
  p_token text,
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
  v_previous_decision jsonb := '{}'::jsonb;
  v_decision jsonb := '{}'::jsonb;
  v_decision_name text := 'pending';
  v_selected_attorney jsonb := '{}'::jsonb;
  v_attorney_name text := '';
  v_activity_type text;
  v_activity_title text;
  v_activity_description text;
  v_task_title text;
  v_task_description text;
  v_task_action text;
  v_decision_dedupe_key text;
  v_decision_changed boolean := false;
  v_lead_id uuid;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  v_previous_decision := coalesce(
    v_onboarding.form_data->'transferAttorneyDecision',
    v_onboarding.form_data->'transfer_attorney_decision',
    '{}'::jsonb
  );
  v_decision := coalesce(
    v_form_data->'transferAttorneyDecision',
    v_form_data->'transfer_attorney_decision',
    v_previous_decision,
    '{}'::jsonb
  );
  v_decision_name := coalesce(nullif(trim(v_decision->>'decision'), ''), 'pending');
  v_selected_attorney := coalesce(
    v_decision->'selectedAttorney',
    v_decision->'selected_attorney',
    '{}'::jsonb
  );
  v_attorney_name := coalesce(
    nullif(trim(v_selected_attorney->>'companyName'), ''),
    nullif(trim(v_selected_attorney->>'company_name'), ''),
    'the nominated firm'
  );
  v_decision_dedupe_key := 'seller-transfer-attorney:'
    || v_onboarding.private_listing_id::text || ':' || md5(v_decision::text);
  v_decision_changed := v_previous_decision <> '{}'::jsonb
    and v_previous_decision is distinct from v_decision;

  update public.private_listing_seller_onboarding
     set status = 'completed',
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = v_onboarding.id;

  update public.private_listings
     set listing_status = case
           when listing_status in ('seller_lead', 'onboarding_sent') then 'onboarding_completed'
           else listing_status
         end,
         seller_onboarding_status = 'completed',
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         updated_at = now()
   where id = v_onboarding.private_listing_id;

  if v_decision_name = 'accept_recommendation' then
    v_activity_type := 'transfer_attorney_recommendation_accepted';
    v_activity_title := 'Seller accepted the recommended transferring attorney';
    v_activity_description := v_attorney_name || ' can be carried into the mandate workflow.';
    v_task_action := null;
  elsif v_decision_name = 'nominate_own' then
    v_activity_type := 'transfer_attorney_nomination_submitted';
    v_activity_title := 'Seller nominated a transferring attorney';
    v_activity_description := v_attorney_name || ' must be verified before mandate preparation.';
    v_task_action := 'verify_nomination';
    v_task_title := 'Verify seller-nominated transferring attorney';
    v_task_description := 'Confirm the contact details and instruction readiness for '
      || v_attorney_name || ' before preparing the mandate.';
  elsif v_decision_name = 'defer' then
    v_activity_type := 'transfer_attorney_decision_deferred';
    v_activity_title := 'Seller deferred the transferring attorney decision';
    v_activity_description := 'The assigned agent must contact the seller before mandate preparation.';
    v_task_action := 'contact_seller';
    v_task_title := 'Contact seller about transferring attorney';
    v_task_description := 'The seller asked to discuss the transferring attorney before mandate preparation.';
  else
    v_activity_type := 'transfer_attorney_decision_missing';
    v_activity_title := 'Transferring attorney decision requires attention';
    v_activity_description := 'Resolve the seller decision before mandate preparation.';
    v_task_action := 'resolve_selection';
    v_task_title := 'Resolve seller transferring attorney selection';
    v_task_description := 'Seller onboarding completed without a valid transferring attorney decision.';
  end if;

  if to_regclass('public.private_listing_activity') is not null then
    begin
      insert into public.private_listing_activity (
        private_listing_id,
        activity_type,
        activity_title,
        activity_description,
        visibility,
        metadata
      )
      select
        v_onboarding.private_listing_id,
        v_activity_type,
        v_activity_title,
        v_activity_description,
        'internal',
        jsonb_build_object(
          'workflow', 'seller_transfer_attorney',
          'decisionDedupeKey', v_decision_dedupe_key,
          'decision', v_decision_name,
          'selectionSource', v_decision->>'selectionSource',
          'selectedAttorney', v_selected_attorney,
          'decidedAt', v_decision->>'decidedAt',
          'consentCaptured', lower(coalesce(v_decision->>'consentCaptured', 'false')) in ('true', '1', 'yes'),
          'decisionChanged', v_decision_changed,
          'previousDecision', v_previous_decision,
          'requiresFollowUp', v_task_action is not null,
          'source', 'seller_portal'
        )
      where not exists (
        select 1
        from public.private_listing_activity activity
        where activity.private_listing_id = v_onboarding.private_listing_id
          and activity.metadata->>'decisionDedupeKey' = v_decision_dedupe_key
      );

      if v_decision_changed then
        insert into public.private_listing_activity (
          private_listing_id,
          activity_type,
          activity_title,
          activity_description,
          visibility,
          metadata
        )
        select
          v_onboarding.private_listing_id,
          'transfer_attorney_decision_changed',
          'Seller changed the transferring attorney decision',
          'The previous seller decision was superseded during onboarding.',
          'internal',
          jsonb_build_object(
            'workflow', 'seller_transfer_attorney',
            'decisionDedupeKey', v_decision_dedupe_key || ':changed',
            'previousDecision', v_previous_decision,
            'currentDecision', v_decision,
            'source', 'seller_portal'
          )
        where not exists (
          select 1
          from public.private_listing_activity activity
          where activity.private_listing_id = v_onboarding.private_listing_id
            and activity.metadata->>'decisionDedupeKey' = v_decision_dedupe_key || ':changed'
        );
      end if;

      insert into public.private_listing_activity (
        private_listing_id,
        activity_type,
        activity_title,
        activity_description,
        visibility,
        metadata
      )
      select
        v_onboarding.private_listing_id,
        'seller_onboarding_completed',
        'Seller onboarding completed',
        'Seller completed onboarding from the secure seller portal.',
        'internal',
        jsonb_build_object(
          'submittedAt', now(),
          'source', 'seller_portal',
          'sellerOnboardingId', v_onboarding.id
        )
      where not exists (
        select 1
        from public.private_listing_activity activity
        where activity.private_listing_id = v_onboarding.private_listing_id
          and activity.activity_type = 'seller_onboarding_completed'
          and activity.metadata->>'sellerOnboardingId' = v_onboarding.id::text
      );
    exception
      when undefined_table or undefined_column or invalid_text_representation then
        null;
    end;
  end if;

  if to_regclass('public.tasks') is not null and v_listing.id is not null then
    begin
      if nullif(trim(v_listing.seller_lead_id), '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.leads
          where lead_id::text = lower(trim(v_listing.seller_lead_id))
        ) then
        v_lead_id := trim(v_listing.seller_lead_id)::uuid;
      elsif nullif(trim(v_listing.originating_crm_lead_id), '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.leads
          where lead_id::text = lower(trim(v_listing.originating_crm_lead_id))
        ) then
        v_lead_id := trim(v_listing.originating_crm_lead_id)::uuid;
      end if;

      -- Close an obsolete follow-up when the seller changes or resolves the choice.
      update public.tasks
         set status = 'Completed',
             updated_at = now(),
             metadata = metadata || jsonb_build_object(
               'closedReason', 'seller_decision_superseded',
               'closedAt', now()
             )
       where organisation_id = v_listing.organisation_id
         and metadata->>'workflow' = 'seller_transfer_attorney'
         and metadata->>'privateListingId' = v_listing.id::text
         and status not in ('Completed', 'Cancelled')
         and metadata->>'dedupeKey' is distinct from v_decision_dedupe_key;

      if v_task_action is not null then
        insert into public.tasks (
          organisation_id,
          lead_id,
          assigned_agent_id,
          title,
          description,
          due_date,
          status,
          priority,
          metadata
        )
        select
          v_listing.organisation_id,
          v_lead_id,
          v_listing.assigned_agent_id,
          v_task_title,
          v_task_description,
          current_date + 1,
          'Pending',
          'High',
          jsonb_build_object(
            'workflow', 'seller_transfer_attorney',
            'action', v_task_action,
            'privateListingId', v_listing.id,
            'sellerOnboardingId', v_onboarding.id,
            'dedupeKey', v_decision_dedupe_key,
            'decision', v_decision_name,
            'selectionSource', v_decision->>'selectionSource',
            'selectedAttorney', v_selected_attorney,
            'source', 'seller_portal'
          )
        where not exists (
          select 1
          from public.tasks task
          where task.organisation_id = v_listing.organisation_id
            and task.metadata->>'dedupeKey' = v_decision_dedupe_key
        );
      end if;
    exception
      when undefined_table or undefined_column or foreign_key_violation or invalid_text_representation then
        null;
    end;
  end if;

  return public.bridge_private_listing_seller_portal_payload(p_token);
end;
$$;

grant execute on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text)
  to anon, authenticated;

commit;
