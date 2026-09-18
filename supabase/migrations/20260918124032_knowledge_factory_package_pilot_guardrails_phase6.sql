begin;

-- A named pilot must be time and spend bounded. These controls sit below the
-- organisation commercial caps and are checked again immediately before every
-- paid supplier request, so an unattended pilot cannot quietly become a broad
-- rollout.
alter table public.knowledge_factory_package_pilot_enrolments
  add column pilot_report_cap integer not null default 25
    check (pilot_report_cap between 1 and 250),
  add column pilot_credit_cap integer not null default 250000
    check (pilot_credit_cap > 0),
  add column pilot_ends_at timestamptz not null default (now() + interval '14 days');

alter table public.knowledge_factory_package_pilot_enrolments
  add constraint knowledge_factory_package_pilot_enrolments_end_after_activation_check check (
    activated_at is null or pilot_ends_at > activated_at
  );

comment on column public.knowledge_factory_package_pilot_enrolments.pilot_report_cap is
  'Maximum completed package reports permitted for this named cohort during one pilot activation.';
comment on column public.knowledge_factory_package_pilot_enrolments.pilot_credit_cap is
  'Maximum supplier credits permitted for this named cohort during one pilot activation.';
comment on column public.knowledge_factory_package_pilot_enrolments.pilot_ends_at is
  'Hard expiry for the named package pilot. The server rejects supplier execution after this time.';

commit;
