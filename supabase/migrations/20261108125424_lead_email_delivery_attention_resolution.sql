begin;
-- Resolve only the automatic delivery-review task after provider acceptance.
-- Do not close a buyer follow-up task or an unconfirmed email attempt.
create function private.resolve_lead_email_attention_task() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='sent' and new.provider_message_id is not null and new.attention_task_id is not null then
  update public.tasks set status='Completed',updated_at=clock_timestamp()
  where task_id=new.attention_task_id and organisation_id=new.organisation_id and lead_id=new.lead_id
   and title='Review lead email delivery' and status='Pending';
 end if;
 return new;
end $$;
revoke all on function private.resolve_lead_email_attention_task() from public,anon,authenticated;
create trigger lead_email_resolve_attention after update of status on public.lead_agent_email_jobs
 for each row when (new.status='sent' and new.provider_message_id is not null)
 execute function private.resolve_lead_email_attention_task();
commit;
