begin;
-- Depends on the existing campaign builders and AI assistant migrations. One
-- usage ledger and agency cap cover email and business-campaign generation.
alter table public.ai_campaign_models drop constraint ai_campaign_models_provider_check;
alter table public.ai_campaign_models add constraint ai_campaign_models_provider_check check(provider in ('anthropic','openai'));
-- No model or price is auto-enabled; operator verification and an explicit budget remain required.
alter table public.ai_campaign_usage alter column campaign_id drop not null;
alter table public.ai_campaign_usage add column marketing_campaign_id uuid references public.marketing_campaigns(id);
alter table public.ai_campaign_usage add constraint ai_campaign_usage_one_source check ((campaign_id is null) <> (marketing_campaign_id is null));
create index ai_campaign_usage_marketing_campaign on public.ai_campaign_usage(marketing_campaign_id) where marketing_campaign_id is not null;
create function public.ai_campaign_reserve_context(p_id uuid,p_org uuid,p_actor uuid,p_email uuid,p_marketing uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.ai_campaign_budgets; m public.ai_campaign_models; u public.ai_campaign_usage; allowance numeric;
begin
 if (p_email is null)=(p_marketing is null) or p_id is null or p_actor is null or length(coalesce(p_fingerprint,''))<>64 then raise exception 'Invalid AI context'; end if;
 if p_email is not null and not exists(select 1 from public.email_campaigns where id=p_email and organisation_id=p_org and status='draft') then raise exception 'Editable email campaign required'; end if;
 if p_marketing is not null and not exists(select 1 from public.marketing_campaigns where id=p_marketing and organisation_id=p_org and status='draft') then raise exception 'Editable business campaign required'; end if;
 select * into b from public.ai_campaign_budgets where organisation_id=p_org for update;
 if b.organisation_id is null then raise exception 'AI is not enabled for this agency'; end if;
 select * into u from public.ai_campaign_usage where id=p_id;
 if found then
  if u.organisation_id is distinct from p_org or u.user_id is distinct from p_actor or u.campaign_id is distinct from p_email or u.marketing_campaign_id is distinct from p_marketing or u.fingerprint is distinct from p_fingerprint then raise exception 'Request conflict'; end if;
  return to_jsonb(u)||jsonb_build_object('claimed',false);
 end if;
 select * into m from public.ai_campaign_models where model=b.model and enabled;
 if m.model is null then raise exception 'AI model is unavailable'; end if;
 allowance:=2*(32000*m.input_usd_per_million+1200*m.output_usd_per_million)/1000000;
 if (select coalesce(sum(cost_usd),0) from public.ai_campaign_usage where organisation_id=p_org and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')+allowance>b.monthly_limit_usd then raise exception 'Agency AI spending limit reached'; end if;
 insert into public.ai_campaign_usage(id,organisation_id,user_id,campaign_id,marketing_campaign_id,feature,provider,model,fingerprint,reserved_usd,cost_usd,status)
 values(p_id,p_org,p_actor,p_email,p_marketing,case when p_marketing is null then 'email_campaign' else 'business_campaign' end,m.provider,m.model,p_fingerprint,allowance,allowance,'reserved') returning * into u;
 return to_jsonb(u)||jsonb_build_object('claimed',true,'input_rate',m.input_usd_per_million,'output_rate',m.output_usd_per_million,'writing_preferences',b.writing_preferences);
end $$;
-- Preserve the existing email RPC signature and reject cross-feature replays.
create or replace function public.ai_campaign_reserve(p_id uuid,p_org uuid,p_actor uuid,p_campaign uuid,p_fingerprint text)
returns jsonb language sql security definer set search_path='' as $$ select public.ai_campaign_reserve_context(p_id,p_org,p_actor,p_campaign,null,p_fingerprint) $$;
create function public.ai_business_campaign_reserve(p_id uuid,p_org uuid,p_actor uuid,p_campaign uuid,p_fingerprint text)
returns jsonb language sql security definer set search_path='' as $$ select public.ai_campaign_reserve_context(p_id,p_org,p_actor,null,p_campaign,p_fingerprint) $$;
revoke all on function public.ai_campaign_reserve_context(uuid,uuid,uuid,uuid,uuid,text),public.ai_campaign_reserve(uuid,uuid,uuid,uuid,text),public.ai_business_campaign_reserve(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_campaign_reserve_context(uuid,uuid,uuid,uuid,uuid,text),public.ai_campaign_reserve(uuid,uuid,uuid,uuid,text),public.ai_business_campaign_reserve(uuid,uuid,uuid,uuid,text) to service_role;
-- A genuine client nurture recipe, using the existing bounded source contract.
alter function public.marketing_general_builder_valid(jsonb) rename to marketing_general_builder_before_business_valid;
create function public.marketing_general_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 if value->>'template'='client-check-in' then
  return public.marketing_general_builder_before_business_valid(jsonb_set(value,'{template}','"referral-request"'));
 end if;
 return public.marketing_general_builder_before_business_valid(value);
end $$;
revoke all on function public.marketing_general_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_general_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns drop constraint marketing_general_builder_valid;
alter table public.marketing_campaigns add constraint marketing_general_builder_valid check (
 public.marketing_general_builder_valid(campaign_builder) and (campaign_builder is null or (
 listing_builder is null and status='draft'
 and (campaign_builder->>'template'<>'review-request' or (planned_channels <@ array['email','whatsapp']::text[] and planned_channels @> array['email','whatsapp']::text[] and not(channel_content ? 'social')))
 and goal=case
 when campaign_builder->>'template' in ('sellers','thinking-of-selling','buyer-demand') then 'seller_leads'
 when campaign_builder->>'template' in ('buyers','first-time-buyer') then 'buyer_leads'
 when campaign_builder->>'template' in ('key-handover','review-request','referral-request','client-check-in') then 'reengage' else 'custom' end))
);
notify pgrst,'reload schema';
commit;
