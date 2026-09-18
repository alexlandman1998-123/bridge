begin;

-- Package queries have materially different supplier exposure. A single global
-- cap cannot safely govern both the compact Basic report and the comprehensive
-- Full report, so each receives its own server-enforced ceiling.
alter table public.knowledge_factory_package_commercial_policies
  add column basic_report_credit_cap integer not null default 100000
    check (basic_report_credit_cap > 0),
  add column full_report_credit_cap integer not null default 100000
    check (full_report_credit_cap > 0);

comment on column public.knowledge_factory_package_commercial_policies.basic_report_credit_cap is
  'Maximum validated supplier credits permitted for one Basic property and owner lookup.';
comment on column public.knowledge_factory_package_commercial_policies.full_report_credit_cap is
  'Maximum validated supplier credits permitted for one Full property intelligence report.';

commit;
