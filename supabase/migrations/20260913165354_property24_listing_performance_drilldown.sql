begin;

create or replace function public.property24_listing_performance(
  p_organisation_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'You do not have access to this organisation.' using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'A valid reporting period is required.' using errcode = '22007';
  end if;

  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'listingNumber', listing_number,
          'listingId', private_listing_id,
          'title', title,
          'status', listing_status,
          'listingViews', listing_views,
          'listingContactFormLeads', listing_contact_form_leads,
          'whatsAppContactFormLeads', whatsapp_contact_form_leads,
          'telephoneLeads', telephone_leads,
          'smsLeads', sms_leads,
          'totalContactLeads', total_contact_leads,
          'contactRate', case when listing_views > 0 then round((total_contact_leads::numeric / listing_views::numeric) * 100, 1) else null end
        ) order by total_contact_leads desc, listing_views desc, listing_number
      )
      from (
        select
          statistics.listing_number,
          statistics.private_listing_id,
          coalesce(nullif(listing.title, ''), 'Property24 listing ' || statistics.listing_number::text) as title,
          listing.listing_status,
          coalesce(sum(statistics.view_count), 0)::bigint as listing_views,
          coalesce(sum(statistics.listing_contact_form_leads), 0)::bigint as listing_contact_form_leads,
          coalesce(sum(statistics.whatsapp_contact_form_leads), 0)::bigint as whatsapp_contact_form_leads,
          coalesce(sum(statistics.tel_leads), 0)::bigint as telephone_leads,
          coalesce(sum(statistics.sms_leads), 0)::bigint as sms_leads,
          coalesce(sum(statistics.total_contact_leads), 0)::bigint as total_contact_leads
        from public.property24_listing_statistics_daily statistics
        left join public.private_listings listing on listing.id = statistics.private_listing_id
        where statistics.organisation_id = p_organisation_id
          and statistics.environment = 'production'
          and statistics.statistic_date between p_start_date and p_end_date
        group by statistics.listing_number, statistics.private_listing_id, listing.title, listing.listing_status
        order by total_contact_leads desc, listing_views desc, statistics.listing_number
        limit v_limit
      ) ranked
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.property24_listing_performance(uuid, date, date, integer) from public;
revoke all on function public.property24_listing_performance(uuid, date, date, integer) from anon;
revoke all on function public.property24_listing_performance(uuid, date, date, integer) from authenticated;
grant execute on function public.property24_listing_performance(uuid, date, date, integer) to authenticated;

commit;
