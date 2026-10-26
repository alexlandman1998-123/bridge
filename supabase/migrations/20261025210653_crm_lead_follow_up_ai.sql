begin;
-- Depends on 20261025204945_business_campaign_ai. CRM assistance uses the same
-- agency model, managed funding and locked monthly cap; it cannot choose a payer.
alter table public.ai_campaign_usage add column crm_lead_id uuid references public.leads(lead_id);
alter table public.ai_campaign_usage drop constraint ai_campaign_usage_one_source;
alter table public.ai_campaign_usage add constraint ai_campaign_usage_one_source check(num_nonnulls(campaign_id,marketing_campaign_id,crm_lead_id)=1);
alter table public.ai_campaign_usage add constraint ai_campaign_usage_source_feature check(
 feature=case when campaign_id is not null then 'email_campaign' when marketing_campaign_id is not null then 'business_campaign' else 'crm_follow_up' end
);
create index ai_campaign_usage_crm_lead on public.ai_campaign_usage(crm_lead_id) where crm_lead_id is not null;
create function public.ai_campaign_reserve_context_v2(p_id uuid,p_org uuid,p_actor uuid,p_email uuid,p_marketing uuid,p_lead uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.ai_campaign_budgets; m public.ai_campaign_models; u public.ai_campaign_usage; allowance numeric; feature_name text;
begin
 if num_nonnulls(p_email,p_marketing,p_lead)<>1 or p_id is null or p_actor is null or length(coalesce(p_fingerprint,''))<>64 then raise exception 'Invalid AI context'; end if;
 if p_email is not null and not exists(select 1 from public.email_campaigns where id=p_email and organisation_id=p_org and status='draft') then raise exception 'Editable email campaign required'; end if;
 if p_marketing is not null and not exists(select 1 from public.marketing_campaigns where id=p_marketing and organisation_id=p_org and status='draft') then raise exception 'Editable business campaign required'; end if;
 if p_lead is not null and not exists(select 1 from public.leads where lead_id=p_lead and organisation_id=p_org and coalesce(lead_domain,'agency')='agency' and lower(btrim(coalesce(status,''))) not in ('archived','deleted','lost','won','converted','closed')) then raise exception 'Active agency CRM lead required'; end if;
 feature_name:=case when p_email is not null then 'email_campaign' when p_marketing is not null then 'business_campaign' else 'crm_follow_up' end;
 select * into b from public.ai_campaign_budgets where organisation_id=p_org for update;
 if b.organisation_id is null then raise exception 'AI is not enabled for this agency'; end if;
 select * into u from public.ai_campaign_usage where id=p_id;
 if found then
  if u.organisation_id is distinct from p_org or u.user_id is distinct from p_actor or u.campaign_id is distinct from p_email or u.marketing_campaign_id is distinct from p_marketing or u.crm_lead_id is distinct from p_lead or u.feature is distinct from feature_name or u.fingerprint is distinct from p_fingerprint then raise exception 'Request conflict'; end if;
  return to_jsonb(u)||jsonb_build_object('claimed',false);
 end if;
 select * into m from public.ai_campaign_models where model=b.model and enabled;
 if m.model is null then raise exception 'AI model is unavailable'; end if;
 allowance:=2*(32000*m.input_usd_per_million+1200*m.output_usd_per_million)/1000000;
 if (select coalesce(sum(cost_usd),0) from public.ai_campaign_usage where organisation_id=p_org and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')+allowance>b.monthly_limit_usd then raise exception 'Agency AI spending limit reached'; end if;
 insert into public.ai_campaign_usage(id,organisation_id,user_id,campaign_id,marketing_campaign_id,crm_lead_id,feature,provider,model,fingerprint,reserved_usd,cost_usd,status)
 values(p_id,p_org,p_actor,p_email,p_marketing,p_lead,feature_name,m.provider,m.model,p_fingerprint,allowance,allowance,'reserved') returning * into u;
 return to_jsonb(u)||jsonb_build_object('claimed',true,'input_rate',m.input_usd_per_million,'output_rate',m.output_usd_per_million);
end $$;
-- Keep both deployed campaign wrapper signatures compatible, including their
-- writing preferences. CRM deliberately excludes free-form preferences.
create or replace function public.ai_campaign_reserve_context(p_id uuid,p_org uuid,p_actor uuid,p_email uuid,p_marketing uuid,p_fingerprint text)
returns jsonb language sql security definer set search_path='' as $$
 select public.ai_campaign_reserve_context_v2(p_id,p_org,p_actor,p_email,p_marketing,null,p_fingerprint)
 ||jsonb_build_object('writing_preferences',(select writing_preferences from public.ai_campaign_budgets where organisation_id=p_org))
$$;
create function public.ai_crm_follow_up_reserve(p_id uuid,p_org uuid,p_actor uuid,p_lead uuid,p_fingerprint text)
returns jsonb language sql security definer set search_path='' as $$ select public.ai_campaign_reserve_context_v2(p_id,p_org,p_actor,null,null,p_lead,p_fingerprint) $$;
revoke all on function public.ai_campaign_reserve_context_v2(uuid,uuid,uuid,uuid,uuid,uuid,text),public.ai_campaign_reserve_context(uuid,uuid,uuid,uuid,uuid,text),public.ai_crm_follow_up_reserve(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_campaign_reserve_context_v2(uuid,uuid,uuid,uuid,uuid,uuid,text),public.ai_campaign_reserve_context(uuid,uuid,uuid,uuid,uuid,text),public.ai_crm_follow_up_reserve(uuid,uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
