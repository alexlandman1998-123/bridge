# Revo shared inbox — phase 3 operations

## Outcome

The Revo-only shared inbox can persist day-to-day team work before any Email or
WhatsApp provider is connected:

- claim or unassign a conversation;
- close or reopen a conversation;
- add a private internal note; and
- save a private, unsent reply draft.

The inbox page uses the live records only after the Revo inbox migrations are
applied. Until then it is deliberately labelled as preview data and cannot
claim that a change was saved.

## Data and access boundary

`20260913073607_revo_shared_inbox_operations.sql` extends the initial Revo
inbox migration. It introduces `revo_inbox_activity` and a `message_type` on
the existing message ledger. Database triggers create the append-only activity
trail, so a browser client cannot insert a fabricated audit event.

Active Revo members can change a conversation's owner and status. They can
only create private `note` or `draft` messages that are queued and owned by
their own profile. Those message types are never treated as provider-delivered
messages. Connector services added later remain responsible for all inbound,
outbound, and delivery-status updates.

## Before enabling live operations

1. Review and apply the foundation migration, then this operations migration,
   through the normal Supabase change process.
2. Enable the `revo.shared_inbox` workspace feature setting for Revo.
3. Add a Revo channel record before expecting live conversations to appear.

No Email or WhatsApp credentials, provider webhooks, or outbound delivery are
part of this phase.
