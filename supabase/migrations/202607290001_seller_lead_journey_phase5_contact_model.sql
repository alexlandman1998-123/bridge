begin;

alter table if exists public.leads
  add column if not exists first_contacted_at timestamptz;

create index if not exists leads_first_contacted_at_idx
  on public.leads (organisation_id, first_contacted_at desc)
  where first_contacted_at is not null;

update public.leads
set stage = case
      when lower(trim(coalesce(stage, ''))) = 'seller onboarding sent' then 'Onboarding Sent'
      when lower(trim(coalesce(stage, ''))) = 'seller onboarding submitted' then 'Onboarding Submitted'
      else stage
    end,
    status = case
      when lower(trim(coalesce(status, ''))) in ('seller onboarding sent', 'onboarding sent') then 'Sent'
      when lower(trim(coalesce(status, ''))) in ('seller onboarding submitted', 'onboarding submitted') then 'Submitted'
      else status
    end,
    updated_at = now()
where lower(coalesce(lead_category, '')) = 'seller'
  and (
    lower(trim(coalesce(stage, ''))) in ('seller onboarding sent', 'seller onboarding submitted')
    or lower(trim(coalesce(status, ''))) in ('seller onboarding sent', 'seller onboarding submitted', 'onboarding sent', 'onboarding submitted')
  );

update public.leads
set seller_onboarding_status = case
      when lower(trim(coalesce(stage, ''))) = 'onboarding submitted' then 'completed'
      when lower(trim(coalesce(stage, ''))) = 'onboarding sent' then 'sent'
      else seller_onboarding_status
    end,
    updated_at = now()
where lower(coalesce(lead_category, '')) = 'seller'
  and lower(trim(coalesce(stage, ''))) in ('onboarding sent', 'onboarding submitted')
  and lower(trim(coalesce(seller_onboarding_status, ''))) in ('', 'not_started');

with first_contact_activity as (
  select
    activity.lead_id,
    min(coalesce(activity.activity_date, activity.created_at)) as contacted_at
  from public.lead_activities activity
  where lower(trim(coalesce(activity.activity_type, ''))) similar to '%(seller contact|call|phone|whatsapp|message|email|mail)%'
  group by activity.lead_id
)
update public.leads lead
set first_contacted_at = first_contact_activity.contacted_at,
    updated_at = now()
from first_contact_activity
where lead.lead_id = first_contact_activity.lead_id
  and lower(coalesce(lead.lead_category, '')) = 'seller'
  and lead.first_contacted_at is null
  and first_contact_activity.contacted_at is not null;

update public.leads
set first_contacted_at = coalesce(updated_at, created_at, now()),
    updated_at = now()
where lower(coalesce(lead_category, '')) = 'seller'
  and first_contacted_at is null
  and lower(trim(coalesce(stage, ''))) in (
    'contacted',
    'onboarding sent',
    'onboarding submitted',
    'mandate sent',
    'mandate signed',
    'listing created',
    'listing live',
    'all documents submitted'
  );

commit;
