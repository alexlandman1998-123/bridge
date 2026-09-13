begin;

-- Keep raw submission payloads private while giving the authenticated Website
-- workspace enough context to triage leads and delivery failures.
drop function if exists public.website_workspace_leads(uuid, integer);

create function public.website_workspace_leads(
  p_website_site_id uuid,
  p_days integer default 30
)
returns table (
  submission_id uuid,
  lead_id uuid,
  listing_id uuid,
  submitted_at timestamptz,
  submission_type text,
  submission_status text,
  delivery_status text,
  delivery_detail text,
  lead_status text,
  lead_stage text,
  contact_name text,
  contact_email text,
  contact_phone text,
  property_title text,
  property_address text,
  page_title text,
  page_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.website_sites%rowtype;
  v_since timestamptz := pg_catalog.date_trunc('day', pg_catalog.now())
    - ((pg_catalog.greatest(1, pg_catalog.least(coalesce(p_days, 30), 90)) - 1) * interval '1 day');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id;
  if v_site.id is null or not public.bridge_has_organisation_membership(v_site.organisation_id) then
    raise exception 'Not authorised for this website.' using errcode = '42501';
  end if;

  return query
  select
    submission.id,
    submission.lead_id,
    submission.listing_id,
    submission.created_at,
    submission.submission_type,
    submission.status,
    submission.notification_status,
    case when submission.status in ('failed', 'blocked') then nullif(submission.failure_reason, '') else null end,
    lead.status,
    lead.stage,
    coalesce(nullif(submission.payload_json ->> 'name', ''), nullif(pg_catalog.concat_ws(' ', contact.first_name, contact.last_name), '')),
    coalesce(nullif(submission.payload_json ->> 'email', ''), contact.email),
    coalesce(nullif(submission.payload_json ->> 'phone', ''), contact.phone),
    coalesce(nullif(lead.enquired_property_title, ''), nullif(publication.title, ''), page.title, 'Website enquiry'),
    coalesce(nullif(lead.enquired_property_address, ''), nullif(publication.address, '')),
    page.title,
    page.slug
  from public.website_lead_submissions submission
  left join public.leads lead on lead.lead_id = submission.lead_id
    and lead.organisation_id = v_site.organisation_id
  left join public.contacts contact on contact.contact_id = coalesce(submission.contact_id, lead.contact_id)
    and contact.organisation_id = v_site.organisation_id
  left join public.listing_publication_data publication on publication.listing_id = submission.listing_id
  left join public.website_pages page on page.id = submission.page_id
    and page.website_site_id = v_site.id
  where submission.website_site_id = v_site.id
    and submission.organisation_id = v_site.organisation_id
    and submission.created_at >= v_since
  order by submission.created_at desc
  limit 100;
end;
$$;

revoke all on function public.website_workspace_leads(uuid, integer) from public, anon;
grant execute on function public.website_workspace_leads(uuid, integer) to authenticated;

comment on function public.website_workspace_leads(uuid, integer) is
  'Organisation-scoped Website workspace operations read model. Exposes only triage-safe contact, property, CRM and delivery fields; raw form payloads remain private.';

notify pgrst, 'reload schema';
commit;
