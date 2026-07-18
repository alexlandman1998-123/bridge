begin;

-- H2 extends packet-scoped least privilege across every table introduced by
-- the editable-generator, signature-layout, final-publication and recovery chain.
revoke insert, update, delete on table public.document_signing_field_layouts from authenticated;
revoke insert, update, delete on table public.document_signing_dispatches from authenticated;
revoke all on table public.document_signer_sessions from authenticated, anon;
revoke all on table public.legal_final_artifact_evidence from authenticated, anon;
revoke all on table public.legal_final_artifact_deliveries from authenticated, anon;
revoke all on table public.legal_final_artifact_publications from authenticated, anon;
revoke all on table public.legal_final_delivery_claims from authenticated, anon;
revoke insert, update, delete on table public.legal_final_transaction_publications from authenticated;
revoke insert, update, delete on table public.legal_final_completion_receipts from authenticated;
revoke insert, update, delete on table public.legal_final_completion_retry_attempts from authenticated;

drop policy if exists document_signing_field_layout_access_e1 on public.document_signing_field_layouts;
create policy document_signing_field_layout_access_e1 on public.document_signing_field_layouts
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));
drop policy if exists document_signing_dispatch_access_e4 on public.document_signing_dispatches;
create policy document_signing_dispatch_access_e4 on public.document_signing_dispatches
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));
drop policy if exists final_transaction_publication_access_f3 on public.legal_final_transaction_publications;
create policy final_transaction_publication_access_f3 on public.legal_final_transaction_publications
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));
drop policy if exists final_completion_receipt_access_f4 on public.legal_final_completion_receipts;
create policy final_completion_receipt_access_f4 on public.legal_final_completion_receipts
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));
drop policy if exists final_completion_retry_access_f5 on public.legal_final_completion_retry_attempts;
create policy final_completion_retry_access_f5 on public.legal_final_completion_retry_attempts
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));

create or replace function public.bridge_get_document_generator_least_privilege_contract_h2()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_policy_tables text[]:=array[
    'document_packets','document_packet_versions','document_packet_events','document_packet_signers','document_signing_fields',
    'document_signing_field_layouts','document_signing_dispatches','legal_final_transaction_publications',
    'legal_final_completion_receipts','legal_final_completion_retry_attempts'
  ];
  v_service_tables text[]:=array[
    'document_signer_sessions','legal_final_artifact_evidence','legal_final_artifact_deliveries',
    'legal_final_artifact_publications','legal_final_delivery_claims'
  ];
  v_policy_count integer:=0;
  v_rls_count integer:=0;
  v_direct_write_grants integer:=0;
  v_service_table_grants integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Least-privilege catalogue evidence requires the diagnostics service.' using errcode='42501'; end if;
  select count(distinct tablename) into v_policy_count from pg_policies
    where schemaname='public' and tablename=any(v_policy_tables) and cmd='SELECT'
      and coalesce(qual,'') like '%bridge_can_access_legal_packet_h2%';
  select count(*) into v_rls_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(v_policy_tables||v_service_tables) and c.relrowsecurity;
  select count(*) into v_direct_write_grants from information_schema.role_table_grants
    where table_schema='public' and table_name=any(v_policy_tables[6:10]) and grantee in ('authenticated','anon')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  select count(*) into v_service_table_grants from information_schema.role_table_grants
    where table_schema='public' and table_name=any(v_service_tables) and grantee in ('authenticated','anon');
  return jsonb_build_object('contract','h2-generator-v1','expectedPolicyTableCount',cardinality(v_policy_tables),
    'packetScopedPolicyTableCount',v_policy_count,'expectedRlsTableCount',cardinality(v_policy_tables)+cardinality(v_service_tables),
    'rlsTableCount',v_rls_count,'directPipelineWriteGrantCount',v_direct_write_grants,
    'serviceEvidenceClientGrantCount',v_service_table_grants,'checkedAt',now());
end;
$$;

revoke all on function public.bridge_get_document_generator_least_privilege_contract_h2() from public,anon,authenticated;
grant execute on function public.bridge_get_document_generator_least_privilege_contract_h2() to service_role;

commit;
