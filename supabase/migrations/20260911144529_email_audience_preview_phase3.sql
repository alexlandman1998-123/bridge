begin;

-- Aggregate-only evidence for the campaign review screen. No recipient rows
-- are exposed by this privileged function, so an audience preview cannot be
-- used to scrape another agency's contact data.
create or replace function public.email_campaign_preview_audience_detail(
  p_organisation_id uuid,
  p_subscription_type_id uuid,
  p_filter jsonb default '{}'::jsonb
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_organisation_id is null or p_subscription_type_id is null then
    return jsonb_build_object('matching_contacts',0,'eligible',0,'invalid_email',0,'no_marketing_consent',0,'unsubscribed_category',0,'suppressed',0);
  end if;
  if not public.bridge_has_organisation_membership(p_organisation_id) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  with scoped as (
    select c.id, c.email, c.is_valid_email,
      p.marketing_consent_status,
      cs.status as subscription_status,
      s.id is not null as is_suppressed
    from public.email_marketing_contacts c
    left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
    left join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=p_subscription_type_id
    left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
    where c.organisation_id=p_organisation_id
      and (p_filter->>'role_type' is null or c.role_type=p_filter->>'role_type')
      and (p_filter->>'branch_id' is null or c.branch_id::text=p_filter->>'branch_id')
      and (p_filter->>'assigned_user_id' is null or c.assigned_user_id::text=p_filter->>'assigned_user_id')
      and (p_filter->>'lead_stage' is null or c.lead_stage=p_filter->>'lead_stage')
      and (p_filter->>'area' is null or c.area=p_filter->>'area')
      and (p_filter->>'tag' is null or p_filter->>'tag'=any(c.tags))
      and (coalesce(jsonb_array_length(p_filter->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(p_filter->'contact_ids')))
  )
  select jsonb_build_object(
    'matching_contacts', count(*)::integer,
    'eligible', count(*) filter (where is_valid_email and marketing_consent_status='opted_in' and subscription_status='subscribed' and not is_suppressed)::integer,
    'invalid_email', count(*) filter (where not is_valid_email)::integer,
    'no_marketing_consent', count(*) filter (where coalesce(marketing_consent_status,'unknown') <> 'opted_in')::integer,
    'unsubscribed_category', count(*) filter (where marketing_consent_status='opted_in' and coalesce(subscription_status,'unsubscribed') <> 'subscribed')::integer,
    'suppressed', count(*) filter (where is_suppressed)::integer
  ) into v_result from scoped;
  return coalesce(v_result, '{}'::jsonb);
end $$;

revoke all on function public.email_campaign_preview_audience_detail(uuid,uuid,jsonb) from public, anon;
grant execute on function public.email_campaign_preview_audience_detail(uuid,uuid,jsonb) to authenticated;

commit;
