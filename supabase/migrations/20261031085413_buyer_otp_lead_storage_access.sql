begin;

-- The signed-OTP browser flow uploads bytes before creating a transaction.
-- Authorise its existing path against the buyer lead's real assignment instead.
-- Keep the helper private and retain all existing Storage boundary policies.
create or replace function document_security.buyer_otp_object_access(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  segments text[] := string_to_array(p_name, '/');
  target_org uuid;
  target_lead uuid;
  assigned_agent uuid;
begin
  if auth.uid() is null or p_bucket is distinct from 'documents'
    or cardinality(segments) is distinct from 5
    or segments[1] is distinct from 'buyer-otp-documents'
    or segments[4] is distinct from 'uploaded_otp'
    or coalesce(segments[5], '') in ('', '.', '..')
    or segments[2] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or segments[3] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  target_org := segments[2]::uuid;
  target_lead := segments[3]::uuid;
  select lead.assigned_agent_id into assigned_agent
  from public.leads lead
  where lead.lead_id = target_lead
    and lead.organisation_id = target_org
    and lower(lead.lead_category) = 'buyer';
  if not found then return false; end if;
  return coalesce(public.bridge_can_access_assignment(target_org, assigned_agent, null), false);
end;
$$;

revoke all on function document_security.buyer_otp_object_access(text, text) from public, anon;
grant usage on schema document_security to authenticated;
grant execute on function document_security.buyer_otp_object_access(text, text) to authenticated;

create policy buyer_otp_lead_storage_insert on storage.objects
for insert to authenticated
with check (document_security.buyer_otp_object_access(bucket_id, name));

create policy buyer_otp_lead_storage_select on storage.objects
for select to authenticated
using (document_security.buyer_otp_object_access(bucket_id, name));

-- The current browser uses upsert; Supabase requires SELECT and UPDATE as well
-- as INSERT even though each upload has its own timestamped object path.
create policy buyer_otp_lead_storage_update on storage.objects
for update to authenticated
using (document_security.buyer_otp_object_access(bucket_id, name))
with check (document_security.buyer_otp_object_access(bucket_id, name));

commit;
