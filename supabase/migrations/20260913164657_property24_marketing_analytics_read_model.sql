begin;

create or replace function public.property24_marketing_analytics(
  p_organisation_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_connected boolean;
  v_last_synced_at timestamptz;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'Active organisation membership is required.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'A valid inclusive statistics date range is required.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.property24_accounts account
    where account.organisation_id = p_organisation_id
      and account.environment = 'production'
      and account.enabled = true
  ) into v_connected;

  select max(statistics.synced_at)
  into v_last_synced_at
  from public.property24_listing_statistics_daily statistics
  where statistics.organisation_id = p_organisation_id
    and statistics.environment = 'production';

  return pg_catalog.jsonb_build_object(
    'connected', v_connected,
    'lastSyncedAt', v_last_synced_at,
    'listingViews', coalesce((select sum(view_count) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'listingAlerts', coalesce((select sum(alert_count) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'telephoneLeads', coalesce((select sum(tel_leads) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'smsLeads', coalesce((select sum(sms_leads) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'listingContactFormLeads', coalesce((select sum(listing_contact_form_leads) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'whatsAppContactFormLeads', coalesce((select sum(whatsapp_contact_form_leads) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'totalLeads', coalesce((select sum(total_leads) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'totalContactLeads', coalesce((select sum(total_contact_leads) from public.property24_listing_statistics_daily where organisation_id = p_organisation_id and environment = 'production' and statistic_date between p_start_date and p_end_date), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', daily.statistic_date,
        'listingContactFormLeads', daily.listing_contact_form_leads,
        'whatsAppContactFormLeads', daily.whatsapp_contact_form_leads,
        'totalContactLeads', daily.total_contact_leads,
        'listingViews', daily.view_count
      ) order by daily.statistic_date)
      from (
        select statistic_date,
          coalesce(sum(listing_contact_form_leads), 0) as listing_contact_form_leads,
          coalesce(sum(whatsapp_contact_form_leads), 0) as whatsapp_contact_form_leads,
          coalesce(sum(total_contact_leads), 0) as total_contact_leads,
          coalesce(sum(view_count), 0) as view_count
        from public.property24_listing_statistics_daily
        where organisation_id = p_organisation_id
          and environment = 'production'
          and statistic_date between p_start_date and p_end_date
        group by statistic_date
      ) daily
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.property24_marketing_analytics(uuid, date, date) from public, anon, authenticated;
grant execute on function public.property24_marketing_analytics(uuid, date, date) to authenticated;

comment on function public.property24_marketing_analytics(uuid, date, date) is
  'Member-scoped aggregate Property24 portal analytics for the Marketing dashboard. It exposes no raw provider payloads or credentials.';

commit;
