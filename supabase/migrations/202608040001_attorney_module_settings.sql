begin;

with attorney_defaults as (
  select
    jsonb_build_object(
      'transfer', true,
      'bond', true,
      'cancellation', true
    ) as attorney_modules,
    jsonb_build_object(
      'attorney_transfer', true,
      'attorney_bond', true,
      'attorney_cancellation', true
    ) as enabled_modules
),
attorney_organisations as (
  select distinct firm.organisation_id
  from public.attorney_firms firm
  where firm.organisation_id is not null
)
insert into public.organisation_settings (
  organisation_id,
  settings_json
)
select
  org.organisation_id,
  jsonb_build_object(
    'attorneyModules', defaults.attorney_modules,
    'enabledModules', defaults.enabled_modules
  )
from attorney_organisations org
cross join attorney_defaults defaults
on conflict (organisation_id)
do update set
  settings_json = jsonb_set(
    jsonb_set(
      coalesce(public.organisation_settings.settings_json, '{}'::jsonb),
      '{attorneyModules}',
      jsonb_build_object(
        'transfer', true,
        'bond', true,
        'cancellation', true
      ) ||
        coalesce(public.organisation_settings.settings_json->'attorneyModules', '{}'::jsonb),
      true
    ),
    '{enabledModules}',
    jsonb_build_object(
      'attorney_transfer', true,
      'attorney_bond', true,
      'attorney_cancellation', true
    ) ||
      coalesce(public.organisation_settings.settings_json->'enabledModules', '{}'::jsonb),
    true
  );

commit;
