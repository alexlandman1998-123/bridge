-- Prepared contingency only; not executed. Preserve all customer data and history.
-- App rollback: promote each captured READY baseline from the preflight JSON.
-- Database emergency disable: review scope before separately approved execution.
begin;
revoke execute on function public.bridge_get_transaction_detail_review(uuid), public.bridge_save_transaction_detail_review(uuid,text,jsonb,jsonb,bigint,boolean,uuid), public.bridge_get_imported_transaction_review_status(uuid[]) from authenticated;
revoke execute on function public.fic_org_access(uuid,boolean), public.fic_branch_access(uuid,uuid,boolean), public.fic_save_lesson(uuid,uuid,integer), public.fic_submit_assessment(uuid,uuid,integer[]), public.fic_assign_branch_training(uuid,uuid,date), public.fic_publish_policy(uuid,text,text,text,text), public.fic_acknowledge_policy(uuid,uuid,uuid) from authenticated;
revoke all on public.branch_fic_training_progress, public.branch_fic_training_attempts, public.organisation_fic_policies, public.branch_fic_policy_acknowledgements from authenticated;
-- Keep private storage guards and new schema intact. No tables/columns/records are dropped.
commit;
