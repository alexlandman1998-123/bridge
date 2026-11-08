begin;

-- Readiness labels describe the saved evidence without releasing unreviewed instructions.
CREATE OR REPLACE FUNCTION public.bridge_read_transaction_handoffs(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('version','transaction_handoff_register_v1','items',coalesce(jsonb_agg(
   to_jsonb(h)||
   case when h.instruction_status in ('awaiting_signed_otp','awaiting_buyer_onboarding')
     and exists(select 1 from public.transactions t where t.id=h.transaction_id and t.onboarding_status='signed_otp_uploaded_for_review')
     then jsonb_build_object('instruction_status','awaiting_otp_review','dispatch_reason','awaiting_otp_review')
     else '{}'::jsonb end ||jsonb_build_object('recovery_actions',handoff_private.recovery_actions(h.id),
     'last_recovery',case when handoff_private.can_manage_recovery(h.owner_organisation_id) then
       (select jsonb_build_object('action',d.action,'reason',d.reason,'created_at',d.created_at) from handoff_private.recovery_decisions d
        where d.handoff_id=h.id order by d.created_at desc limit 1) else null end)||
   case when h.invitation_status='pending' and h.invitation_expires_at<=now() then
     jsonb_build_object('invitation_status','expired','exception_keys',to_jsonb(h.exception_keys||array['invitation_expired'])) else '{}'::jsonb end
   order by h.role_type),'[]'::jsonb))
 from public.transaction_handoffs h where h.transaction_id=p_transaction_id and public.bridge_can_access_transaction_spine(p_transaction_id);
$function$;

notify pgrst,'reload schema';

commit;
