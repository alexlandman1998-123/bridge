create or replace function public.normalize_developer_lead_status_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text := lower(regexp_replace(coalesce(new.lead_status, 'new'), '[^a-z0-9]+', '_', 'g'));
begin
  v_status := trim(both '_' from v_status);

  new.lead_status := case v_status
    when '' then 'new'
    when 'captured' then 'new'
    when 'lead_captured' then 'new'
    when 'new_lead' then 'new'
    when 'buyer_onboarding_sent' then 'onboarding_sent'
    when 'buyer_onboarding_submitted' then 'onboarding_submitted'
    when 'signed_otp_uploaded' then 'otp'
    when 'signed_otp' then 'otp'
    when 'otp_uploaded' then 'otp'
    when 'transaction_created' then 'converted'
    when 'new' then 'new'
    when 'contacted' then 'contacted'
    when 'qualified' then 'qualified'
    when 'viewing' then 'viewing'
    when 'reserved' then 'reserved'
    when 'onboarding_sent' then 'onboarding_sent'
    when 'onboarding_submitted' then 'onboarding_submitted'
    when 'otp' then 'otp'
    when 'converted' then 'converted'
    when 'lost' then 'lost'
    else 'new'
  end;

  return new;
end;
$$;

drop trigger if exists trg_developer_leads_normalize_status on public.developer_leads;
create trigger trg_developer_leads_normalize_status
before insert or update of lead_status on public.developer_leads
for each row
execute function public.normalize_developer_lead_status_before_write();

notify pgrst, 'reload schema';
