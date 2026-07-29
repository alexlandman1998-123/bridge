begin;

alter table if exists public.organisation_branding
  add column if not exists logo_icon_url text,
  add column if not exists support_email text,
  add column if not exists support_phone text,
  add column if not exists support_website text,
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text,
  add column if not exists tagline text;

insert into public.organisation_branding (
  organisation_id,
  organisation_display_name,
  logo_light_url,
  logo_dark_url,
  primary_brand_color,
  secondary_brand_color,
  support_email,
  support_phone,
  support_website,
  email_from_name,
  metadata_json
)
select
  org.id,
  coalesce(nullif(trim(org.display_name), ''), nullif(trim(org.name), ''), nullif(trim(org.legal_name), ''), 'Arch9'),
  nullif(trim(org.logo_url), ''),
  nullif(trim(org.logo_dark_url), ''),
  nullif(trim(org.primary_colour), ''),
  nullif(trim(org.secondary_colour), ''),
  nullif(lower(trim(coalesce(org.support_email, org.company_email, org.email, org.billing_email, ''))), ''),
  nullif(trim(coalesce(org.support_phone, org.company_phone, org.phone, '')), ''),
  nullif(trim(coalesce(org.website, '')), ''),
  coalesce(
    nullif(trim(org.lead_acknowledgement_sender_name), ''),
    nullif(trim(org.display_name), ''),
    nullif(trim(org.name), '')
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'source', 'email_notification_branding_readiness',
    'emailBrandingReadyAt', now()
  ))
from public.organisations org
on conflict (organisation_id)
do update set
  organisation_display_name = coalesce(
    nullif(trim(public.organisation_branding.organisation_display_name), ''),
    excluded.organisation_display_name
  ),
  logo_light_url = coalesce(
    nullif(trim(public.organisation_branding.logo_light_url), ''),
    excluded.logo_light_url
  ),
  logo_dark_url = coalesce(
    nullif(trim(public.organisation_branding.logo_dark_url), ''),
    excluded.logo_dark_url
  ),
  primary_brand_color = coalesce(
    nullif(trim(public.organisation_branding.primary_brand_color), ''),
    excluded.primary_brand_color
  ),
  secondary_brand_color = coalesce(
    nullif(trim(public.organisation_branding.secondary_brand_color), ''),
    excluded.secondary_brand_color
  ),
  support_email = coalesce(
    nullif(lower(trim(public.organisation_branding.support_email)), ''),
    excluded.support_email
  ),
  support_phone = coalesce(
    nullif(trim(public.organisation_branding.support_phone), ''),
    excluded.support_phone
  ),
  support_website = coalesce(
    nullif(trim(public.organisation_branding.support_website), ''),
    excluded.support_website
  ),
  email_from_name = coalesce(
    nullif(trim(public.organisation_branding.email_from_name), ''),
    excluded.email_from_name
  ),
  metadata_json = coalesce(public.organisation_branding.metadata_json, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'emailBrandingReadyAt', now(),
      'emailBrandingSource', coalesce(
        public.organisation_branding.metadata_json ->> 'emailBrandingSource',
        'email_notification_branding_readiness'
      )
    )),
  updated_at = now();

create or replace function public.bridge_sync_organisation_email_branding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organisation_branding (
    organisation_id,
    organisation_display_name,
    logo_light_url,
    logo_dark_url,
    primary_brand_color,
    secondary_brand_color,
    support_email,
    support_phone,
    support_website,
    email_from_name,
    metadata_json
  )
  values (
    new.id,
    coalesce(nullif(trim(new.display_name), ''), nullif(trim(new.name), ''), nullif(trim(new.legal_name), ''), 'Arch9'),
    nullif(trim(new.logo_url), ''),
    nullif(trim(new.logo_dark_url), ''),
    nullif(trim(new.primary_colour), ''),
    nullif(trim(new.secondary_colour), ''),
    nullif(lower(trim(coalesce(new.support_email, new.company_email, new.email, new.billing_email, ''))), ''),
    nullif(trim(coalesce(new.support_phone, new.company_phone, new.phone, '')), ''),
    nullif(trim(coalesce(new.website, '')), ''),
    coalesce(
      nullif(trim(new.lead_acknowledgement_sender_name), ''),
      nullif(trim(new.display_name), ''),
      nullif(trim(new.name), '')
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'organisation_sync',
      'emailBrandingReadyAt', now()
    ))
  )
  on conflict (organisation_id)
  do update set
    organisation_display_name = coalesce(
      nullif(trim(public.organisation_branding.organisation_display_name), ''),
      excluded.organisation_display_name
    ),
    logo_light_url = coalesce(
      nullif(trim(public.organisation_branding.logo_light_url), ''),
      excluded.logo_light_url
    ),
    logo_dark_url = coalesce(
      nullif(trim(public.organisation_branding.logo_dark_url), ''),
      excluded.logo_dark_url
    ),
    primary_brand_color = coalesce(
      nullif(trim(public.organisation_branding.primary_brand_color), ''),
      excluded.primary_brand_color
    ),
    secondary_brand_color = coalesce(
      nullif(trim(public.organisation_branding.secondary_brand_color), ''),
      excluded.secondary_brand_color
    ),
    support_email = coalesce(
      nullif(lower(trim(public.organisation_branding.support_email)), ''),
      excluded.support_email
    ),
    support_phone = coalesce(
      nullif(trim(public.organisation_branding.support_phone), ''),
      excluded.support_phone
    ),
    support_website = coalesce(
      nullif(trim(public.organisation_branding.support_website), ''),
      excluded.support_website
    ),
    email_from_name = coalesce(
      nullif(trim(public.organisation_branding.email_from_name), ''),
      excluded.email_from_name
    ),
    metadata_json = coalesce(public.organisation_branding.metadata_json, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'emailBrandingSyncedAt', now(),
        'emailBrandingSource', coalesce(
          public.organisation_branding.metadata_json ->> 'emailBrandingSource',
          'organisation_sync'
        )
      )),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_bridge_sync_organisation_email_branding on public.organisations;
create trigger trg_bridge_sync_organisation_email_branding
after insert or update of
  name,
  display_name,
  legal_name,
  logo_url,
  logo_dark_url,
  primary_colour,
  secondary_colour,
  support_email,
  support_phone,
  company_email,
  company_phone,
  email,
  phone,
  billing_email,
  website,
  lead_acknowledgement_sender_name
on public.organisations
for each row
execute function public.bridge_sync_organisation_email_branding();

create or replace view public.organisation_email_branding_readiness as
select
  org.id as organisation_id,
  coalesce(nullif(trim(org.display_name), ''), nullif(trim(org.name), ''), nullif(trim(org.legal_name), '')) as organisation_name,
  branding.organisation_id is not null as branding_row_present,
  coalesce(nullif(trim(branding.organisation_display_name), ''), nullif(trim(org.display_name), ''), nullif(trim(org.name), '')) is not null as display_name_present,
  coalesce(nullif(trim(branding.logo_dark_url), ''), nullif(trim(branding.logo_light_url), ''), nullif(trim(branding.logo_icon_url), ''), nullif(trim(org.logo_dark_url), ''), nullif(trim(org.logo_url), '')) is not null as logo_present,
  coalesce(nullif(trim(branding.primary_brand_color), ''), nullif(trim(org.primary_colour), '')) is not null as primary_color_present,
  coalesce(nullif(trim(branding.secondary_brand_color), ''), nullif(trim(org.secondary_colour), '')) is not null as secondary_color_present,
  coalesce(nullif(trim(branding.support_email), ''), nullif(trim(org.support_email), ''), nullif(trim(org.company_email), ''), nullif(trim(org.email), ''), nullif(trim(org.billing_email), '')) is not null as support_email_present,
  coalesce(nullif(trim(branding.support_phone), ''), nullif(trim(org.support_phone), ''), nullif(trim(org.company_phone), ''), nullif(trim(org.phone), '')) is not null as support_phone_present,
  coalesce(nullif(trim(branding.email_from_name), ''), nullif(trim(org.lead_acknowledgement_sender_name), ''), nullif(trim(org.display_name), ''), nullif(trim(org.name), '')) is not null as sender_name_present,
  (
    coalesce(nullif(trim(branding.organisation_display_name), ''), nullif(trim(org.display_name), ''), nullif(trim(org.name), '')) is not null
    and coalesce(nullif(trim(branding.primary_brand_color), ''), nullif(trim(org.primary_colour), '')) is not null
    and coalesce(nullif(trim(branding.secondary_brand_color), ''), nullif(trim(org.secondary_colour), '')) is not null
    and coalesce(nullif(trim(branding.support_email), ''), nullif(trim(org.support_email), ''), nullif(trim(org.company_email), ''), nullif(trim(org.email), ''), nullif(trim(org.billing_email), '')) is not null
  ) as email_branding_ready,
  jsonb_strip_nulls(jsonb_build_object(
    'logoUrl', coalesce(nullif(trim(branding.logo_dark_url), ''), nullif(trim(branding.logo_light_url), ''), nullif(trim(branding.logo_icon_url), ''), nullif(trim(org.logo_dark_url), ''), nullif(trim(org.logo_url), '')),
    'primaryColor', coalesce(nullif(trim(branding.primary_brand_color), ''), nullif(trim(org.primary_colour), '')),
    'secondaryColor', coalesce(nullif(trim(branding.secondary_brand_color), ''), nullif(trim(org.secondary_colour), '')),
    'supportEmail', coalesce(nullif(trim(branding.support_email), ''), nullif(trim(org.support_email), ''), nullif(trim(org.company_email), ''), nullif(trim(org.email), ''), nullif(trim(org.billing_email), '')),
    'supportPhone', coalesce(nullif(trim(branding.support_phone), ''), nullif(trim(org.support_phone), ''), nullif(trim(org.company_phone), ''), nullif(trim(org.phone), '')),
    'fromName', coalesce(nullif(trim(branding.email_from_name), ''), nullif(trim(org.lead_acknowledgement_sender_name), ''), nullif(trim(org.display_name), ''), nullif(trim(org.name), ''))
  )) as resolved_email_branding_preview
from public.organisations org
left join public.organisation_branding branding
  on branding.organisation_id = org.id;

grant select on public.organisation_email_branding_readiness to authenticated;

notify pgrst, 'reload schema';

commit;
