begin;

-- Snapshot only campaign-safe traits. The worker uses this immutable snapshot
-- so a recipient gets the intended conditional version even if their CRM
-- profile changes after scheduling.
create or replace function public.email_campaign_recipient_snapshot_traits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_contact public.email_marketing_contacts%rowtype;
begin
  if new.contact_id is not null then
    select * into v_contact from public.email_marketing_contacts where id=new.contact_id and organisation_id=new.organisation_id;
    if found then
      new.recipient_snapshot := coalesce(new.recipient_snapshot,'{}'::jsonb) || jsonb_build_object(
        'role_type', coalesce(v_contact.role_type,''),
        'area', coalesce(v_contact.area,''),
        'lead_stage', coalesce(v_contact.lead_stage,'')
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists email_campaign_recipient_snapshot_traits_trigger on public.email_campaign_recipients;
create trigger email_campaign_recipient_snapshot_traits_trigger
before insert on public.email_campaign_recipients
for each row execute function public.email_campaign_recipient_snapshot_traits();

commit;
