# Revo shared inbox foundation

## Outcome

This foundation introduces a Revo-only data model for a shared inbox modelled on the familiar HubSpot pattern: one team queue containing customer conversations across Email and WhatsApp.

It does **not** connect an email mailbox or WhatsApp account, receive webhooks, send messages, display an inbox screen, migrate existing messages, or store provider credentials. Those are separate, explicitly approved implementation steps.

## Data model

The migration creates three Revo-only tables:

| Table | Purpose |
| --- | --- |
| `revo_inbox_channels` | A registered Email or WhatsApp team address, its provider key, and connection state. |
| `revo_inbox_conversations` | The customer conversation, assignment, status, and current message summary. |
| `revo_inbox_messages` | An immutable message ledger associated with exactly one conversation. |

Every record has an organisation ID. Composite foreign keys ensure a conversation cannot point at another organisation's channel and a message cannot point at another organisation's conversation.

## Access boundary

The tables are limited to Revo's organisation ID in database policies. Active Revo members can read the inbox; writes are limited to Revo organisation administrators for this foundation. Provider services will use server-side credentials, and any future agent reply or assignment workflow must introduce an explicit permission and server-side command rather than widening browser access by default.

## Provider boundary

Existing Arch9 Email and WhatsApp notification delivery remains unchanged. The future inbox connectors will translate provider payloads into the Revo channel, conversation, and message model. They must be idempotent through the provider-message uniqueness key and must never store provider credentials in these tables.

## Verification

Run:

```sh
npm --prefix the-it-guy run test:revo-shared-inbox-foundation
```

Before the migration is applied anywhere, run the applicable database safety guard and obtain explicit approval for the named target environment.
