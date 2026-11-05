-- Personal (owner-only) email inboxes default to their active mailbox owner.
-- Shared inboxes, explicit assignments, and subsequent manual changes stay intact.
create function private.shared_inbox_default_personal_assignee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_user_id is null and new.assigned_team_id is null then
    select ch.owner_user_id into new.assigned_user_id
    from public.revo_inbox_channels ch
    where ch.id = new.channel_id and ch.organisation_id = new.organisation_id
      and ch.channel = 'email' and ch.access_scope = 'private'
      and exists (select 1 from public.organisation_users u
        where u.organisation_id = ch.organisation_id and u.user_id = ch.owner_user_id
          and lower(trim(coalesce(to_jsonb(u)->>'membership_status',to_jsonb(u)->>'status',''))) in ('active','accepted'));
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_default_personal_assignee() from public, anon, authenticated;
create trigger shared_inbox_default_personal_assignee
before insert on public.revo_inbox_conversations
for each row execute function private.shared_inbox_default_personal_assignee();

-- Repair only open, never-assigned conversations in personal inboxes.
-- An assignment history means a person may have deliberately unassigned it.
update public.revo_inbox_conversations c
set assigned_user_id = ch.owner_user_id
from public.revo_inbox_channels ch
where ch.id = c.channel_id and ch.organisation_id = c.organisation_id
  and ch.channel = 'email' and ch.access_scope = 'private'
  and c.assigned_user_id is null and c.assigned_team_id is null and c.status <> 'closed'
  and exists (select 1 from public.organisation_users u
    where u.organisation_id = ch.organisation_id and u.user_id = ch.owner_user_id
      and lower(trim(coalesce(to_jsonb(u)->>'membership_status',to_jsonb(u)->>'status',''))) in ('active','accepted'))
  and not exists (select 1 from public.revo_inbox_activity a
    where a.organisation_id = c.organisation_id and a.conversation_id = c.id and a.action = 'assignment_changed');
