begin;

-- Phase 1 closes the remaining browser lifecycle gap left deliberately narrow
-- in Phase 0. Packet owners may still prepare drafts and signer records, but
-- neither a mandate nor an OTP may enter a signing/public lifecycle without
-- service-owned authority. Cover INSERT as well as UPDATE so a caller cannot
-- create a packet already marked sent, partially signed, signed, or completed.
create or replace function public.bridge_enforce_authoritative_signable_packet_sent_phase1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), 'unknown');
  v_next_packet_type text := lower(coalesce(new.packet_type, ''));
  v_next_status text := lower(coalesce(new.status, ''));
  v_old_packet_type text := case when tg_op = 'INSERT' then '' else lower(coalesce(old.packet_type, '')) end;
  v_old_status text := case when tg_op = 'INSERT' then '' else lower(coalesce(old.status, '')) end;
begin
  if v_role <> 'service_role'
     and v_next_packet_type in ('mandate', 'otp')
     and v_next_status in ('sent', 'partially_signed', 'signed', 'completed')
     and (
       tg_op = 'INSERT'
       or v_next_status is distinct from v_old_status
       or v_next_packet_type is distinct from v_old_packet_type
     ) then
    raise exception 'Only the controlled signing service may move a mandate or OTP packet into a signing or completed lifecycle.'
      using errcode = '42501', detail = 'PHASE1_PACKET_LIFECYCLE_SERVICE_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_authoritative_signable_packet_sent_phase1 on public.document_packets;
create trigger trg_authoritative_signable_packet_sent_phase1
before insert or update of status, packet_type on public.document_packets
for each row execute function public.bridge_enforce_authoritative_signable_packet_sent_phase1();

commit;
