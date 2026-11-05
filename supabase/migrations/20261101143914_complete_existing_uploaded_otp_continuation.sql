begin;

-- Reuse saved evidence for fee confirmation. The existing finance-admin check
-- and current-OTP predicate remain authoritative; no consent is inferred.
create or replace function public.bridge_read_transaction_finance_closeout(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare tx public.transactions; control public.transaction_fee_controls; invoice jsonb; can_review boolean;
begin
  select * into tx from public.transactions where id=p_transaction_id;
  if auth.uid() is null or tx.id is null or not public.bridge_transaction_fee_finance_admin(tx.organisation_id) then
    return jsonb_build_object('canManage',false);
  end if;
  can_review := lower(coalesce(public.bridge_current_workspace_role(tx.organisation_id),'')) <> 'admin';
  select * into control from public.transaction_fee_controls where transaction_id=tx.id;
  select item into invoice from public.bridge_list_transaction_fee_invoice_queue() item where item->>'transactionId'=tx.id::text limit 1;
  return jsonb_build_object(
    'canManage',true,'canReviewCommission',can_review,
    'feeControl',case when control.id is null then null else jsonb_build_object(
      'billingPartyType',control.billing_party_type,'attorneyReceiptConfirmed',control.attorney_receipt_confirmed,
      'otpDocumentId',control.otp_document_id) end,
    'signedOtpDocuments',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'fileName',coalesce(d.file_name,d.name)) order by d.created_at desc,d.id),'[]'::jsonb)
      from public.documents d where d.transaction_id=tx.id
        and public.bridge_transaction_fee_has_current_otp(tx.id,d.id)),
    'invoice',invoice,
    'allocations',case when can_review then (select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'participantName',a.participant_name,'participantRole',a.participant_role,'status',a.status,
      'calculatedAmount',a.calculated_amount,'approvedAmount',a.approved_amount,'paymentReference',a.payment_reference
    ) order by a.created_at,a.id),'[]'::jsonb) from public.transaction_commission_allocations a
      where a.transaction_id=tx.id and a.status<>'cancelled') else '[]'::jsonb end,
    'grossCommissionPercentage',case when can_review then (select c.gross_commission_percentage from public.transaction_commissions c where c.transaction_id=tx.id limit 1) end,
    'readiness',case when can_review then public.bridge_validate_transaction_commission_closeout(tx.id,false) end
  );
end $function$;

revoke all on function public.bridge_read_transaction_finance_closeout(uuid) from public,anon;

grant execute on function public.bridge_read_transaction_finance_closeout(uuid) to authenticated;

-- A deliberate review of the current uploaded OTP must also release the
-- awaiting-review status. This never approves a file or changes its identity.
create or replace function handoff_private.release_reviewed_uploaded_otp()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.document_definition_key <> 'signed_otp' or new.context_type <> 'transaction'
    or new.transaction_id is null or new.context_id is distinct from new.transaction_id
    or new.status <> 'approved' or new.satisfied_by_document_id is null then
    return new;
  end if;
  -- The review RPC updates the requirement before the document row. A fresh
  -- approval may therefore supersede a previous rejection in the same command.
  if not exists (
    select 1 from public.documents d where d.id=new.satisfied_by_document_id and d.transaction_id=new.transaction_id
      and (lower(coalesce(d.category,''))='otp' or lower(coalesce(d.document_type,'')) in ('uploaded_otp','signed_otp','signed_otp_uploaded','offer_to_purchase_signed'))
      and coalesce(d.status,'') not in ('deleted','archived')
  ) or exists (
    select 1 from public.document_requirement_instances r
    where r.context_type='transaction' and r.context_id=new.transaction_id and r.document_definition_key='signed_otp'
      and r.status not in ('removed','not_applicable') and r.satisfied_by_document_id is not null
      and r.satisfied_by_document_id is distinct from new.satisfied_by_document_id
  ) then
    return new;
  end if;
  update public.transactions
  set onboarding_status='signed_otp_received',
      next_action='Review outstanding documents and confirm the transfer attorney in Parties.',
      updated_at=now()
  where id=new.transaction_id and onboarding_status='signed_otp_uploaded_for_review';
  return new;
end;
$function$;

revoke all on function handoff_private.release_reviewed_uploaded_otp() from public,anon,authenticated;

create trigger release_reviewed_uploaded_otp
  after update of status,satisfied_by_document_id on public.document_requirement_instances
  for each row when (new.document_definition_key='signed_otp' and new.status='approved')
  execute function handoff_private.release_reviewed_uploaded_otp();

commit;
