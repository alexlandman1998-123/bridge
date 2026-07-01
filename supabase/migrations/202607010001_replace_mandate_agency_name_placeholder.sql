update public.document_template_sections as section
set
  placeholder_keys = array_replace(section.placeholder_keys, 'agency_name', 'organisation_name'),
  legal_text = case
    when section.legal_text is null then null
    else replace(section.legal_text, '{{agency_name}}', '{{organisation_name}}')
  end,
  metadata_json = case
    when jsonb_typeof(section.metadata_json -> 'required_placeholders') = 'array' then
      jsonb_set(
        section.metadata_json,
        '{required_placeholders}',
        (
          select jsonb_agg(
            case
              when value = '"agency_name"'::jsonb then '"organisation_name"'::jsonb
              else value
            end
          )
          from jsonb_array_elements(section.metadata_json -> 'required_placeholders') as required(value)
        ),
        true
      )
    else section.metadata_json
  end,
  updated_at = now()
from public.document_packet_templates as template
where section.template_id = template.id
  and template.packet_type = 'mandate'
  and (
    'agency_name' = any(section.placeholder_keys)
    or section.legal_text like '%{{agency_name}}%'
    or section.metadata_json @> '{"required_placeholders":["agency_name"]}'::jsonb
  );
