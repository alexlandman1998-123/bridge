begin;
alter table public.email_sending_domains add column tracking_settings jsonb, add column tracking_checked_at timestamptz;
alter table public.email_campaign_platform_sender add column tracking_settings jsonb, add column tracking_checked_at timestamptz;
create function public.email_record_tracking_status(p_domain_id uuid,p_provider_domain_id text,p_snapshot jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object' or length(p_snapshot::text)>4096 then raise exception 'Invalid tracking settings.' using errcode='22023'; end if;
  if p_domain_id is null then
    update public.email_campaign_platform_sender set tracking_settings=p_snapshot,tracking_checked_at=now()
      where singleton and provider_domain_id=p_provider_domain_id;
  else
    update public.email_sending_domains set tracking_settings=p_snapshot,tracking_checked_at=now()
      where id=p_domain_id and provider_domain_id=p_provider_domain_id and verification_status<>'disabled';
  end if;
  if not found then raise exception 'Tracking settings do not match the provider domain.' using errcode='22023'; end if;
end $$;
revoke all on function public.email_record_tracking_status(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.email_record_tracking_status(uuid,text,jsonb) to service_role;
-- Retain the existing organisation authentication boundary, adding only nonsecret readiness.
create or replace function public.email_campaign_platform_sender_status(p_organisation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.bridge_has_organisation_membership(p_organisation_id) then
    raise exception 'Choose an active organisation workspace.' using errcode='42501';
  end if;
  select jsonb_build_object('email','noreply@updates.arch9.co.za','enabled',enabled,
    'status',verification_status,'ready',enabled and verification_status='verified' and provider_domain_id is not null,
    'checkedAt',last_checked_at,'tracking',tracking_settings,'trackingCheckedAt',tracking_checked_at)
    into result from public.email_campaign_platform_sender where singleton;
  return result;
end $$;
commit;
