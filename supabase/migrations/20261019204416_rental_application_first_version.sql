-- Additive tenant discovery. No backfill or automatic approval rules.
begin;
alter table public.rental_application_fee_settings add column application_policy_json jsonb not null default '{}'::jsonb check(jsonb_typeof(application_policy_json)='object');

create function public.rental_save_application_settings(p_organisation_id uuid,p_amount numeric,p_payment_instructions text,p_expected_version integer,p_policy jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; policy jsonb;
begin
 if p_policy is null or jsonb_typeof(p_policy)<>'object' then raise exception 'Review the rental application policy.'; end if;
 if (p_policy-'maxRentToNetIncomePercent'-'documentMonths'-'sponsorPolicy'-'guarantorPolicy')<>'{}'::jsonb then raise exception 'Unknown application policy setting.'; end if;
 if nullif(p_policy->>'maxRentToNetIncomePercent','') is not null and ((p_policy->>'maxRentToNetIncomePercent')::numeric<=0 or (p_policy->>'maxRentToNetIncomePercent')::numeric>100 or (p_policy->>'maxRentToNetIncomePercent')::text in ('NaN','Infinity','-Infinity')) then raise exception 'Enter a rent guideline above 0 and up to 100 percent, or leave blank.'; end if;
 if nullif(p_policy->>'documentMonths','') is not null and ((p_policy->>'documentMonths')::numeric not between 1 and 24 or (p_policy->>'documentMonths')::numeric<>trunc((p_policy->>'documentMonths')::numeric)) then raise exception 'Enter a whole document period from 1 to 24 months, or leave blank.'; end if;
 if coalesce(p_policy->>'sponsorPolicy','manual_review') not in ('manual_review','considered','not_normally_accepted') or coalesce(p_policy->>'guarantorPolicy','manual_review') not in ('manual_review','considered','not_normally_accepted') then raise exception 'Choose a supported funding review preference.'; end if;
 -- Reuse the administrator, fee and optimistic-version guards atomically.
 saved:=public.rental_save_application_fee_settings(p_organisation_id,p_amount,p_payment_instructions,p_expected_version);
 policy:=jsonb_strip_nulls(jsonb_build_object('maxRentToNetIncomePercent',nullif(p_policy->>'maxRentToNetIncomePercent','')::numeric,'documentMonths',nullif(p_policy->>'documentMonths','')::numeric::integer,'sponsorPolicy',coalesce(p_policy->>'sponsorPolicy','manual_review'),'guarantorPolicy',coalesce(p_policy->>'guarantorPolicy','manual_review')));
 update public.rental_application_fee_settings set application_policy_json=policy where organisation_id=p_organisation_id;
 return saved||jsonb_build_object('application_policy_json',policy);
end; $$;
revoke all on function public.rental_save_application_settings(uuid,numeric,text,integer,jsonb) from public,anon;
grant execute on function public.rental_save_application_settings(uuid,numeric,text,integer,jsonb) to authenticated;

create function public.rental_application_first_version()
returns trigger language plpgsql security invoker set search_path='' as $$
declare q jsonb; m jsonb; section text; key text; defaults jsonb; existing jsonb; prefill jsonb;
begin
 if tg_op='INSERT' then
   new.application_data:=new.application_data-'qualificationPrefill';
   select application_policy_json into defaults from public.rental_application_fee_settings where organisation_id=new.organisation_id;
   new.application_data:=jsonb_set(new.application_data,'{applicationPolicy}',coalesce(defaults,'{}'));
   if new.lead_id is not null then
     select public.rental_lead_payload_metadata(raw_enquiry_payload) into m from public.leads where lead_id=new.lead_id and organisation_id=new.organisation_id;
     q:=coalesce(m->'qualification','{}');
     prefill:=jsonb_build_object('household',jsonb_strip_nulls(jsonb_build_object('intendedOccupationDate',nullif(q->>'occupationDate',''),'occupantCount',nullif(q->>'occupants',''),'pets',case lower(q->>'pets') when 'no pets' then 'no' when 'pet friendly required' then 'yes' when 'no' then 'no' when 'yes' then 'yes' end)),
       'employment',jsonb_strip_nulls(jsonb_build_object('employmentType',case lower(q->>'employmentStatus') when 'employed' then 'employed' when 'self-employed' then 'self_employed' when 'student' then 'student' when 'retired' then 'retired' when 'other' then 'other' end)),
       'income',jsonb_strip_nulls(jsonb_build_object('depositAvailable',case lower(q->>'depositAvailable') when 'yes' then true when 'no' then false end)));
     for section, defaults in select * from jsonb_each(prefill) loop
       existing:=coalesce(new.application_data->section,'{}');
       for key in select jsonb_object_keys(existing) loop
         if existing->key='null'::jsonb or existing->>key='' then existing:=existing-key; end if;
       end loop;
       new.application_data:=jsonb_set(new.application_data,array[section],defaults||existing);
     end loop;
     if q<>'{}'::jsonb then new.application_data:=jsonb_set(new.application_data,'{qualificationPrefill}',jsonb_build_object('source','tenant_qualification','capturedAt',now())); end if;
   end if;
 elsif new.application_data->'applicationPolicy' is distinct from old.application_data->'applicationPolicy' or new.application_data->'qualificationPrefill' is distinct from old.application_data->'qualificationPrefill' then
   raise exception 'Application policy and qualification source are protected.';
 end if;
 -- Preserve legacy readers and SQL evidence gates when the applicant supplies
 -- an explicit net amount. Clearing it also clears the corresponding old value.
 if coalesce(new.application_data#>>'{entity,type}','individual') not in ('company','close_corporation','trust') and new.application_data#>'{income,netMonthlyIncome}' is not null then
   new.application_data:=jsonb_set(new.application_data,'{income,monthlyIncome}',new.application_data#>'{income,netMonthlyIncome}');
   new.application_data:=jsonb_set(new.application_data,'{income,incomeBasis}','"net"');
 end if;
 -- Sponsors always require their own income evidence and review. They are not
 -- lease signers or guarantors merely because they fund this application.
 if jsonb_typeof(new.application_data->'people')='array' then
   new.application_data:=jsonb_set(new.application_data,'{people}',coalesce((select jsonb_agg(case when person->>'role'='sponsor' then person||'{"contributesToAffordability":true}'::jsonb else person end) from jsonb_array_elements(new.application_data->'people') person),'[]'));
 end if;
 return new;
end; $$;
revoke all on function public.rental_application_first_version() from public,anon;
create trigger rental_application_first_version before insert or update on public.rental_applications for each row execute function public.rental_application_first_version();
commit;
