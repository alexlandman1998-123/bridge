begin;

create or replace function public.website_create_site(p_organisation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organisation public.organisations%rowtype;
  v_branding public.organisation_branding%rowtype;
  v_site public.website_sites%rowtype;
  v_revision_id uuid;
  v_display_name text;
  v_preview_base text;
  v_preview_slug text;
  v_preview_hostname text;
  v_primary_color text;
  v_secondary_color text;
  v_accent_color text;
  v_logo_light_url text;
  v_logo_dark_url text;
  v_support_email text;
  v_support_phone text;
  v_support_website text;
  v_whatsapp_number text;
  v_brand_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to create a website.' using errcode = '42501';
  end if;

  select organisation.*
  into v_organisation
  from public.organisations organisation
  where organisation.id = p_organisation_id
  for update;

  if not found then
    raise exception 'Organisation not found.' using errcode = 'P0002';
  end if;

  if not public.bridge_is_org_admin(p_organisation_id) then
    raise exception 'Only organisation administrators can create a website.' using errcode = '42501';
  end if;

  select site.*
  into v_site
  from public.website_sites site
  where site.organisation_id = p_organisation_id;

  if found then
    select revision.id
    into v_revision_id
    from public.website_site_revisions revision
    where revision.website_site_id = v_site.id
    order by
      case revision.status when 'draft' then 0 when 'published' then 1 else 2 end,
      revision.revision_number desc
    limit 1;

    select domain.hostname
    into v_preview_hostname
    from public.website_domains domain
    where domain.website_site_id = v_site.id
      and domain.domain_kind = 'preview'
    order by domain.created_at
    limit 1;

    return jsonb_build_object(
      'created', false,
      'siteId', v_site.id,
      'revisionId', v_revision_id,
      'previewSlug', v_site.preview_slug,
      'previewHostname', v_preview_hostname,
      'templateKey', v_site.template_key
    );
  end if;

  select branding.*
  into v_branding
  from public.organisation_branding branding
  where branding.organisation_id = p_organisation_id;

  v_display_name := coalesce(
    nullif(trim(v_branding.organisation_display_name), ''),
    nullif(trim(v_organisation.display_name), ''),
    nullif(trim(v_organisation.name), ''),
    nullif(trim(v_organisation.legal_name), ''),
    'Property Agency'
  );
  v_logo_light_url := coalesce(nullif(trim(v_branding.logo_light_url), ''), nullif(trim(v_organisation.logo_url), ''));
  v_logo_dark_url := coalesce(nullif(trim(v_branding.logo_dark_url), ''), nullif(trim(v_organisation.logo_dark_url), ''), v_logo_light_url);
  v_primary_color := coalesce(nullif(trim(v_branding.primary_brand_color), ''), nullif(trim(v_organisation.primary_colour), ''), '#125b50');
  v_secondary_color := coalesce(nullif(trim(v_branding.secondary_brand_color), ''), nullif(trim(v_organisation.secondary_colour), ''), '#e7bc71');
  v_accent_color := coalesce(nullif(trim(v_branding.accent_brand_color), ''), v_secondary_color);
  v_support_email := coalesce(
    nullif(lower(trim(v_branding.support_email)), ''),
    nullif(lower(trim(v_organisation.support_email)), ''),
    nullif(lower(trim(v_organisation.company_email)), ''),
    nullif(lower(trim(v_organisation.email)), '')
  );
  v_support_phone := coalesce(
    nullif(trim(v_branding.support_phone), ''),
    nullif(trim(v_organisation.support_phone), ''),
    nullif(trim(v_organisation.company_phone), ''),
    nullif(trim(v_organisation.phone), '')
  );
  v_support_website := coalesce(nullif(trim(v_branding.support_website), ''), nullif(trim(v_organisation.website), ''));
  v_whatsapp_number := coalesce(
    nullif(trim(v_branding.metadata_json ->> 'whatsappNumber'), ''),
    nullif(trim(v_branding.metadata_json ->> 'whatsapp_number'), ''),
    nullif(trim(v_branding.metadata_json ->> 'whatsapp'), ''),
    v_support_phone
  );

  v_preview_base := trim(both '-' from regexp_replace(lower(v_display_name), '[^a-z0-9]+', '-', 'g'));
  v_preview_base := trim(both '-' from substring(coalesce(nullif(v_preview_base, ''), 'agency') from 1 for 48));
  v_preview_slug := v_preview_base || '-' || substring(replace(p_organisation_id::text, '-', '') from 1 for 8);
  v_preview_hostname := v_preview_slug || '.sites.propdata.co.za';

  v_brand_json := jsonb_strip_nulls(jsonb_build_object(
    'name', v_display_name,
    'logoUrl', coalesce(v_logo_dark_url, v_logo_light_url),
    'logoLightUrl', v_logo_light_url,
    'logoDarkUrl', v_logo_dark_url,
    'primaryColor', v_primary_color,
    'secondaryColor', v_secondary_color,
    'accentColor', v_accent_color,
    'phone', v_support_phone,
    'email', v_support_email,
    'website', v_support_website,
    'whatsappNumber', v_whatsapp_number,
    'seedSource', 'organisation_branding',
    'seededAt', now()
  ));

  insert into public.website_sites (
    organisation_id,
    template_key,
    status,
    preview_slug,
    locale,
    currency_code,
    created_by
  ) values (
    p_organisation_id,
    'property-standard-v1',
    'draft',
    v_preview_slug,
    'en-ZA',
    'ZAR',
    v_user_id
  )
  returning * into v_site;

  insert into public.website_domains (
    website_site_id,
    hostname,
    domain_kind,
    status,
    is_primary,
    dns_instructions
  ) values (
    v_site.id,
    v_preview_hostname,
    'preview',
    'active',
    true,
    jsonb_build_object(
      'managedBy', 'PropData',
      'clientDnsRequired', false,
      'emailDnsRequired', false
    )
  );

  insert into public.website_site_revisions (
    website_site_id,
    revision_number,
    status,
    brand_json,
    seo_json,
    navigation_json,
    created_by
  ) values (
    v_site.id,
    1,
    'draft',
    v_brand_json,
    jsonb_strip_nulls(jsonb_build_object(
      'siteTitle', v_display_name,
      'defaultDescription', 'Property for sale and to rent with ' || v_display_name || '.'
    )),
    jsonb_build_array(
      jsonb_build_object('label', 'Properties', 'href', '/properties'),
      jsonb_build_object('label', 'About', 'href', '/about'),
      jsonb_build_object('label', 'Valuation', 'href', '/valuation'),
      jsonb_build_object('label', 'Contact', 'href', '/contact')
    ),
    v_user_id
  )
  returning id into v_revision_id;

  insert into public.website_pages (
    website_site_id,
    revision_id,
    page_kind,
    slug,
    title,
    seo_title,
    seo_description,
    content_blocks
  ) values
  (
    v_site.id,
    v_revision_id,
    'home',
    '',
    'Home',
    v_display_name || ' | Property for sale and to rent',
    'Explore property for sale and to rent with ' || v_display_name || '.',
    jsonb_build_array(
      jsonb_build_object('type', 'hero', 'eyebrow', 'PROPERTY, SIMPLIFIED', 'heading', 'Find the place that feels like home.', 'body', 'Beautifully presented property, knowledgeable people and a simpler way to move.', 'ctaLabel', 'Explore properties', 'ctaHref', '/properties'),
      jsonb_build_object('type', 'property_collection', 'heading', 'Featured properties', 'maxItems', 6),
      jsonb_build_object('type', 'rich_text', 'heading', 'Property advice that starts with people.', 'body', 'Talk to our local team about your next move.'),
      jsonb_build_object('type', 'cta', 'heading', 'What is your property worth?', 'body', 'Request a valuation from our local team.', 'ctaLabel', 'Request a valuation', 'ctaHref', '/valuation'),
      jsonb_build_object('type', 'lead_form', 'heading', 'Start your next move.', 'body', 'Tell us what you are looking for and our team will be in touch.', 'purpose', 'general_enquiry')
    )
  ),
  (
    v_site.id,
    v_revision_id,
    'about',
    'about',
    'About',
    'About ' || v_display_name,
    'Learn more about ' || v_display_name || '.',
    jsonb_build_array(
      jsonb_build_object('type', 'hero', 'eyebrow', 'ABOUT US', 'heading', 'Property is personal.', 'body', 'We combine local knowledge with attentive, practical service.'),
      jsonb_build_object('type', 'rich_text', 'heading', 'A team you can trust.', 'body', 'Add your agency story, experience and service promise here.')
    )
  ),
  (
    v_site.id,
    v_revision_id,
    'contact',
    'contact',
    'Contact',
    'Contact ' || v_display_name,
    'Contact ' || v_display_name || ' about your property journey.',
    jsonb_build_array(
      jsonb_build_object('type', 'hero', 'eyebrow', 'CONTACT', 'heading', 'Let us help with your next move.', 'body', 'Send our team a message and we will get back to you.'),
      jsonb_build_object('type', 'lead_form', 'heading', 'Contact our team.', 'body', 'Tell us how we can help.', 'purpose', 'general_enquiry')
    )
  ),
  (
    v_site.id,
    v_revision_id,
    'valuation',
    'valuation',
    'Valuation',
    'Property valuations | ' || v_display_name,
    'Request a property valuation from ' || v_display_name || '.',
    jsonb_build_array(
      jsonb_build_object('type', 'hero', 'eyebrow', 'PROPERTY VALUATION', 'heading', 'Understand what your property could achieve.', 'body', 'Start with a considered valuation from a team that knows the local market.'),
      jsonb_build_object('type', 'benefits', 'heading', 'A clear, useful valuation.', 'items', jsonb_build_array(
        jsonb_build_object('title', 'Local context', 'body', 'Market insight grounded in your area.'),
        jsonb_build_object('title', 'Practical guidance', 'body', 'A clear view of positioning and next steps.'),
        jsonb_build_object('title', 'Personal service', 'body', 'A property professional will contact you directly.')
      )),
      jsonb_build_object('type', 'lead_form', 'heading', 'Request your valuation.', 'body', 'Tell us about your property and our team will be in touch.', 'purpose', 'valuation_request')
    )
  );

  return jsonb_build_object(
    'created', true,
    'siteId', v_site.id,
    'revisionId', v_revision_id,
    'previewSlug', v_preview_slug,
    'previewHostname', v_preview_hostname,
    'templateKey', v_site.template_key
  );
end;
$$;

revoke all on function public.website_create_site(uuid) from public, anon;
grant execute on function public.website_create_site(uuid) to authenticated;

comment on function public.website_create_site(uuid) is
  'Idempotently creates the authenticated organisation administrator''s first website, seeded draft, standard pages and managed preview hostname.';

notify pgrst, 'reload schema';

commit;
